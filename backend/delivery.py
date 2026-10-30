"""Delivery v2 — world-class driver system.

Real-time hub (WebSocket), offer dispatch to nearest driver with 30s countdown,
step-by-step delivery with OTP / photo proof, chat, earnings & payouts,
performance, documents, independent driver applications and merchant fleet.
Single-worker in-memory pub/sub (production runs one uvicorn worker)."""
import asyncio
import json
import logging
import math
import os
import random
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

logger = logging.getLogger("delivery")
OFFER_SECONDS = 30
ACTIVE = ["assigned", "picked_up"]
STEPS = ["to_store", "at_store", "picked_up", "at_customer", "delivered"]
LEVELS = [(0, "bronze"), (50, "silver"), (200, "gold"), (500, "platinum")]


def now():
    return datetime.now(timezone.utc)


def iso():
    return now().isoformat()


RIYADH = timedelta(hours=3)


def riyadh_midnight(days_ago: int) -> str:
    """UTC ISO timestamp of Riyadh-local midnight `days_ago` days back."""
    local = (now() + RIYADH).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days_ago)
    return (local - RIYADH).isoformat()


def hav_km(a1, o1, a2, o2):
    if not (a1 and o1 and a2 and o2):
        return None
    r = 6371.0
    p1, p2 = math.radians(a1), math.radians(a2)
    dp, dl = math.radians(a2 - a1), math.radians(o2 - o1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


class Hub:
    """In-memory realtime rooms: user sockets, order rooms and the merchant fleet room."""

    def __init__(self):
        self.users: dict[str, set] = {}
        self.rooms: dict[str, set] = {}
        self.fleet: set = set()
        self.last_loc: dict[str, dict] = {}

    def add(self, uid, ws):
        self.users.setdefault(uid, set()).add(ws)

    def drop(self, uid, ws):
        self.users.get(uid, set()).discard(ws)
        self.fleet.discard(ws)
        for r in self.rooms.values():
            r.discard(ws)

    async def _send(self, targets, msg):
        data = json.dumps(msg, ensure_ascii=False, default=str)
        for ws in list(targets):
            try:
                await ws.send_text(data)
            except Exception:
                pass

    async def to_user(self, uid, msg):
        await self._send(self.users.get(uid, set()), msg)

    async def to_room(self, oid, msg):
        await self._send(self.rooms.get(oid, set()), msg)

    async def to_fleet(self, msg):
        await self._send(self.fleet, msg)


class LocIn(BaseModel):
    lat: float
    lng: float
    heading: float = 0
    speed: float = 0


class StepIn(BaseModel):
    step: str


class CompleteIn(BaseModel):
    otp: str = ""
    photo_url: str = ""
    cash_collected: float = 0


class MsgIn(BaseModel):
    text: str


class IssueIn(BaseModel):
    type: str
    note: str = ""
    lat: float = 0
    lng: float = 0


class RateIn(BaseModel):
    stars: int
    comment: str = ""


class PayoutIn(BaseModel):
    amount: float


class ProfileIn(BaseModel):
    vehicle: dict = {}
    nav_app: Optional[str] = None
    photo_url: Optional[str] = None
    docs: dict = {}


class ApplyIn(BaseModel):
    name: str
    phone: str
    password: str
    city: str = ""
    vehicle: dict = {}
    docs: dict = {}


class AssignIn(BaseModel):
    driver_user_id: str


def build_router(db, get_current_user, require_merchant, hash_password, jwt_secret, create_notification):
    router = APIRouter(prefix="/api")
    hub = Hub()
    osrm = os.environ.get("OSRM_URL", "https://api.zenrex.ai/osrm")
    tiles = os.environ.get("MAP_TILES_URL", "https://api.zenrex.ai/tiles")

    # ─── helpers ───
    def require_driver(u):
        if u.get("role") != "driver":
            raise HTTPException(403, "Driver access only")

    async def driver_doc(uid):
        d = await db.drivers.find_one({"user_id": uid})
        if not d:
            raise HTTPException(404, "Driver profile not found")
        return d

    async def get_order(oid):
        if not ObjectId.is_valid(oid):
            raise HTTPException(404, "Order not found")
        o = await db.orders.find_one({"_id": ObjectId(oid)})
        if not o:
            raise HTTPException(404, "Order not found")
        return o

    def can_view(u, o):
        if u.get("role") == "merchant" or o.get("user_id") == u["id"] or o.get("driver_id") == u["id"]:
            return True
        perms = u.get("permissions", []) if u.get("role") == "employee" else []
        return any(p in perms for p in ("all", "orders", "drivers"))

    async def branch_of(o):
        if o.get("branch_id") and ObjectId.is_valid(o["branch_id"]):
            b = await db.branches.find_one({"_id": ObjectId(o["branch_id"])})
            if b:
                return b
        return {}

    def otp_for(o):
        return o.get("delivery_otp") or f"{random.randint(0, 9999):04d}"

    async def live_loc(uid):
        if uid in hub.last_loc:
            return hub.last_loc[uid]
        d = await db.drivers.find_one({"user_id": uid}, {"current_lat": 1, "current_lng": 1, "heading": 1, "last_location_at": 1})
        if d and d.get("current_lat"):
            return {"lat": d["current_lat"], "lng": d["current_lng"], "heading": d.get("heading", 0), "ts": d.get("last_location_at")}
        return None

    async def route(a_lat, a_lng, b_lat, b_lng):
        try:
            async with httpx.AsyncClient(timeout=4) as c:
                r = await c.get(f"{osrm}/route/v1/driving/{a_lng},{a_lat};{b_lng},{b_lat}",
                                params={"overview": "full", "geometries": "geojson"})
                j = r.json()
                if j.get("code") == "Ok":
                    rt = j["routes"][0]
                    return {"coords": rt["geometry"]["coordinates"], "distance_m": rt["distance"], "duration_s": rt["duration"], "source": "osrm"}
        except Exception as e:
            logger.info(f"OSRM unavailable: {e}")
        km = hav_km(a_lat, a_lng, b_lat, b_lng) or 0
        return {"coords": [[a_lng, a_lat], [b_lng, b_lat]], "distance_m": km * 1300, "duration_s": km * 1300 / 8.3, "source": "line"}

    async def order_card(o, for_driver=True):
        b = await branch_of(o)
        cust = await db.users.find_one({"_id": ObjectId(o["user_id"])}, {"name": 1, "phone": 1}) if ObjectId.is_valid(o.get("user_id", "")) else None
        cod = (o.get("payment_method") or "").lower() in ("cod", "cash", "cash_on_delivery")
        items = o.get("items") or []
        return {
            "id": str(o["_id"]), "status": o.get("status"), "step": o.get("delivery_step") or ("picked_up" if o.get("status") == "picked_up" else "to_store"),
            "total": o.get("total", 0), "delivery_fee": o.get("delivery_fee", 0), "payment_method": o.get("payment_method", ""),
            "cod": cod, "cash_to_collect": o.get("total", 0) if cod else 0,
            "items": [{"name": i.get("name_ar") or i.get("name") or i.get("product_name", ""), "qty": i.get("quantity", 1)} for i in items],
            "items_count": sum(int(i.get("quantity", 1)) for i in items),
            "store": {"name": b.get("name_ar") or b.get("name") or "Zenrex Store", "address": b.get("address_ar") or b.get("address", ""),
                      "phone": b.get("phone", ""), "lat": o.get("branch_lat") or b.get("lat"), "lng": o.get("branch_lng") or b.get("lng")},
            "customer": {"name": (cust or {}).get("name", ""), "phone": o.get("phone") or (cust or {}).get("phone", ""),
                         "address": o.get("address", ""), "lat": o.get("dest_lat") or o.get("delivery_lat"), "lng": o.get("dest_lng") or o.get("delivery_lng"),
                         "notes": o.get("notes", "")},
            "created_at": o.get("created_at"), "accepted_at": o.get("accepted_at"), "delivered_at": o.get("delivered_at"),
            "driver_earnings": o.get("driver_earnings"),
        }

    async def eligible_drivers(o, exclude):
        b_lat, b_lng = o.get("branch_lat"), o.get("branch_lng")
        out = []
        async for d in db.drivers.find({"online": True}):
            if d["user_id"] in exclude or d.get("status", "approved") != "approved":
                continue
            if await db.orders.count_documents({"driver_id": d["user_id"], "status": {"$in": ACTIVE}}) >= 3:
                continue
            if await db.delivery_offers.count_documents({"driver_id": d["user_id"], "status": "pending"}):
                continue
            loc = hub.last_loc.get(d["user_id"]) or {"lat": d.get("current_lat"), "lng": d.get("current_lng")}
            dist = hav_km(b_lat, b_lng, loc.get("lat"), loc.get("lng"))
            out.append((dist if dist is not None else 9999, d))
        out.sort(key=lambda x: x[0])
        return out

    async def dispatch(oid: str):
        """Offer the order to the nearest free approved online driver (30s to accept)."""
        o = await db.orders.find_one({"_id": ObjectId(oid)})
        if not o or o.get("driver_id") or o.get("status") != "ready_for_pickup":
            return None
        tried = o.get("offered_to", [])
        cands = await eligible_drivers(o, tried)
        if not cands:
            await hub.to_fleet({"t": "unassigned", "order_id": oid})
            return None
        dist, d = cands[0]
        card = await order_card(o)
        pick = card["store"]
        to_store_km = dist if dist < 9999 else None
        trip_km = hav_km(pick["lat"], pick["lng"], card["customer"]["lat"], card["customer"]["lng"])
        offer = {"order_id": oid, "driver_id": d["user_id"], "status": "pending", "created_at": iso(),
                 "expires_at": (now() + timedelta(seconds=OFFER_SECONDS)).isoformat(),
                 "to_store_km": round(to_store_km, 2) if to_store_km is not None else None,
                 "trip_km": round(trip_km, 2) if trip_km is not None else None,
                 "est_earning": await estimate_earning(d, o)}
        r = await db.delivery_offers.insert_one(offer)
        await db.orders.update_one({"_id": o["_id"]}, {"$addToSet": {"offered_to": d["user_id"]}})
        await db.drivers.update_one({"_id": d["_id"]}, {"$inc": {"offers_total": 1}})
        offer["id"] = str(r.inserted_id)
        offer.pop("_id", None)
        await hub.to_user(d["user_id"], {"t": "offer", "offer": {**offer, "order": card}})
        await create_notification(d["user_id"], "طلب توصيل جديد", f"لديك {OFFER_SECONDS} ثانية لقبول الطلب", {"type": "delivery_offer", "offer_id": offer["id"]})
        return offer

    async def estimate_earning(d, o):
        fee = float(o.get("delivery_fee", 0) or 0)
        if d.get("payment_model") == "salary":
            return 0
        cut = fee * d.get("merchant_commission_value", 0) / 100 if d.get("commission_type") == "percentage" else d.get("merchant_commission_value", 0)
        return round(max(fee - cut, 0), 2)

    async def expiry_loop():
        while True:
            try:
                async for off in db.delivery_offers.find({"status": "pending", "expires_at": {"$lt": iso()}}):
                    await db.delivery_offers.update_one({"_id": off["_id"]}, {"$set": {"status": "expired"}})
                    await hub.to_user(off["driver_id"], {"t": "offer_gone", "offer_id": str(off["_id"])})
                    await dispatch(off["order_id"])
            except Exception as e:
                logger.error(f"offer expiry loop: {e}")
            await asyncio.sleep(3)

    async def set_loc(uid, lat, lng, heading=0, speed=0, persist=True):
        loc = {"lat": lat, "lng": lng, "heading": heading, "speed": speed, "ts": iso()}
        prev = hub.last_loc.get(uid)
        hub.last_loc[uid] = loc
        msg = {"t": "driver_loc", "driver_id": uid, **loc}
        async for o in db.orders.find({"driver_id": uid, "status": {"$in": ACTIVE}}, {"_id": 1}):
            await hub.to_room(str(o["_id"]), msg)
        await hub.to_fleet(msg)
        # Persist at most every 5s (realtime goes through memory)
        if persist and (not prev or prev.get("_saved", "") < (now() - timedelta(seconds=5)).isoformat()):
            loc["_saved"] = loc["ts"]
            await db.drivers.update_one({"user_id": uid}, {"$set": {"current_lat": lat, "current_lng": lng, "heading": heading,
                                                                     "speed": speed, "last_location_at": loc["ts"]}})
        elif prev:
            loc["_saved"] = prev.get("_saved", "")

    async def push_order(o_id, extra=None):
        o = await db.orders.find_one({"_id": ObjectId(o_id)})
        if not o:
            return
        msg = {"t": "order_update", "order_id": o_id, "status": o.get("status"), "step": o.get("delivery_step"), **(extra or {})}
        await hub.to_room(o_id, msg)
        await hub.to_fleet(msg)
        if o.get("user_id"):
            await hub.to_user(o["user_id"], msg)

    async def take_order(o, u, how, statuses=("ready_for_pickup",)):
        """Atomically assign order to driver u (only while it is still waiting for a driver)."""
        otp = otp_for(o)
        res = await db.orders.update_one(
            {"_id": o["_id"], "status": {"$in": list(statuses)},
             "$or": [{"driver_id": None}, {"driver_id": ""}, {"driver_id": {"$exists": False}}]},
            {"$set": {"driver_id": u["id"], "driver_name": u.get("name", ""), "driver_phone": u.get("phone", ""),
                      "status": "assigned", "delivery_step": "to_store", "delivery_otp": otp,
                      "accepted_at": iso(), "assign_method": how}})
        if not res.modified_count:
            raise HTTPException(409, "الطلب أُخذ من سائق آخر")
        oid = str(o["_id"])
        await db.delivery_offers.update_many({"order_id": oid, "status": "pending", "driver_id": {"$ne": u["id"]}}, {"$set": {"status": "cancelled"}})
        if o.get("user_id"):
            await create_notification(o["user_id"], "تم تعيين سائق لطلبك", f"{u.get('name', '')} في الطريق لاستلام طلبك", {"type": "order", "order_id": oid})
        await push_order(oid, {"driver_id": u["id"]})

    # ─── WebSocket ───
    @router.websocket("/ws/live")
    async def ws_live(ws: WebSocket):
        await ws.accept()
        try:
            payload = jwt.decode(ws.query_params.get("token", ""), jwt_secret, algorithms=["HS256"])
            u = await db.users.find_one({"_id": ObjectId(payload["sub"])})
            if not u:
                raise ValueError("no user")
        except Exception:
            await ws.close(code=4401)
            return
        uid, role = str(u["_id"]), u.get("role")
        u["id"] = uid
        hub.add(uid, ws)
        try:
            await ws.send_text(json.dumps({"t": "hello", "role": role}))
            while True:
                m = json.loads(await ws.receive_text())
                t = m.get("t")
                if t == "ping":
                    await ws.send_text('{"t":"pong"}')
                elif t == "loc" and role == "driver":
                    await set_loc(uid, float(m["lat"]), float(m["lng"]), float(m.get("heading") or 0), float(m.get("speed") or 0))
                elif t == "sub":
                    oid = str(m.get("order_id", ""))
                    if ObjectId.is_valid(oid):
                        o = await db.orders.find_one({"_id": ObjectId(oid)}, {"user_id": 1, "driver_id": 1})
                        if o and can_view(u, o):
                            hub.rooms.setdefault(oid, set()).add(ws)
                            if o.get("driver_id"):
                                loc = await live_loc(o["driver_id"])
                                if loc:
                                    await ws.send_text(json.dumps({"t": "driver_loc", "driver_id": o["driver_id"], **{k: v for k, v in loc.items() if k != "_saved"}}, default=str))
                elif t == "sub_fleet" and role in ("merchant", "employee"):
                    hub.fleet.add(ws)
        except (WebSocketDisconnect, Exception):
            pass
        finally:
            hub.drop(uid, ws)

    # ─── Map ───
    @router.get("/map/route")
    async def map_route(from_lat: float, from_lng: float, to_lat: float, to_lng: float):
        return await route(from_lat, from_lng, to_lat, to_lng)

    @router.get("/map/view", response_class=HTMLResponse)
    async def map_view(theme: str = "dark", lang: str = "ar"):
        here = os.path.dirname(__file__)
        html = open(os.path.join(here, "static_map.html"), encoding="utf-8").read()
        return HTMLResponse(html.replace("__TILES__", tiles).replace("__THEME__", "light" if theme == "light" else "dark")
                            .replace("__LANG__", lang if lang.isalpha() else "ar"),
                            headers={"Cache-Control": "public, max-age=300"})

    # ─── Driver ───
    @router.post("/driver/location")
    async def post_location(body: LocIn, user=Depends(get_current_user)):
        require_driver(user)
        await set_loc(user["id"], body.lat, body.lng, body.heading, body.speed)
        return {"ok": True}

    @router.post("/driver/online")
    async def set_online(body: dict, user=Depends(get_current_user)):
        require_driver(user)
        d = await driver_doc(user["id"])
        online = bool(body.get("online", True))
        if online and d.get("status", "approved") != "approved":
            raise HTTPException(403, "حسابك قيد المراجعة من المتجر")
        await db.drivers.update_one({"_id": d["_id"]}, {"$set": {"online": online, "online_changed_at": iso()}})
        if online:  # pick up orders already waiting
            async for o in db.orders.find({"status": "ready_for_pickup", "driver_id": {"$in": [None, ""]}}, {"_id": 1}).limit(5):
                await dispatch(str(o["_id"]))
        await hub.to_fleet({"t": "driver_online", "driver_id": user["id"], "online": online})
        return {"online": online}

    @router.get("/driver/home")
    async def driver_home(user=Depends(get_current_user)):
        require_driver(user)
        d = await driver_doc(user["id"])
        start = riyadh_midnight(0)
        today = await db.orders.find({"driver_id": user["id"], "status": "delivered", "delivered_at": {"$gte": start}},
                                     {"driver_earnings": 1}).to_list(500)
        pend = await db.delivery_offers.find_one({"driver_id": user["id"], "status": "pending", "expires_at": {"$gt": iso()}})
        offer = None
        if pend:
            o = await db.orders.find_one({"_id": ObjectId(pend["order_id"])})
            if o:
                offer = {**{k: v for k, v in pend.items() if k != "_id"}, "id": str(pend["_id"]), "order": await order_card(o)}
        active = [await order_card(o) async for o in db.orders.find({"driver_id": user["id"], "status": {"$in": ACTIVE}}).sort("accepted_at", 1)]
        return {"name": user.get("name", ""), "online": d.get("online", False), "status": d.get("status", "approved"),
                "type": d.get("type", "store"), "photo_url": d.get("photo_url", ""),
                "today_trips": len(today), "today_earnings": round(sum(float(x.get("driver_earnings") or 0) for x in today), 2),
                "wallet_balance": (await db.users.find_one({"_id": ObjectId(user["id"])}, {"wallet_balance": 1}) or {}).get("wallet_balance", 0),
                "cash_in_hand": round(float(d.get("cash_in_hand", 0)), 2), "rating": round(float(d.get("rating_avg", 5) or 5), 2),
                "offer": offer, "active": active, "nav_app": d.get("nav_app", "google")}

    @router.get("/driver/hotzones")
    async def hotzones(user=Depends(get_current_user)):
        require_driver(user)
        since = (now() - timedelta(days=14)).isoformat()
        pts = []
        async for o in db.orders.find({"created_at": {"$gte": since}, "dest_lat": {"$nin": [None, 0]}}, {"dest_lat": 1, "dest_lng": 1}).limit(2000):
            pts.append([o["dest_lng"], o["dest_lat"]])
        return {"points": pts}

    @router.post("/driver/offers/{off_id}/accept")
    async def accept_offer(off_id: str, user=Depends(get_current_user)):
        require_driver(user)
        off = await db.delivery_offers.find_one({"_id": ObjectId(off_id), "driver_id": user["id"]}) if ObjectId.is_valid(off_id) else None
        if not off or off["status"] != "pending" or off["expires_at"] < iso():
            raise HTTPException(410, "انتهى وقت العرض")
        o = await get_order(off["order_id"])
        try:
            await take_order(o, user, "offer")
        except HTTPException:
            await db.delivery_offers.update_one({"_id": off["_id"]}, {"$set": {"status": "cancelled"}})
            raise
        await db.delivery_offers.update_one({"_id": off["_id"]}, {"$set": {"status": "accepted", "responded_at": iso()}})
        await db.drivers.update_one({"user_id": user["id"]}, {"$inc": {"offers_accepted": 1}})
        return await order_card(await get_order(off["order_id"]))

    @router.post("/driver/offers/{off_id}/decline")
    async def decline_offer(off_id: str, user=Depends(get_current_user)):
        require_driver(user)
        off = await db.delivery_offers.find_one({"_id": ObjectId(off_id), "driver_id": user["id"]}) if ObjectId.is_valid(off_id) else None
        if not off or off["status"] != "pending":
            return {"ok": True}
        await db.delivery_offers.update_one({"_id": off["_id"]}, {"$set": {"status": "declined", "responded_at": iso()}})
        await dispatch(off["order_id"])
        return {"ok": True}

    @router.post("/driver/orders/{oid}/claim")
    async def claim_open(oid: str, user=Depends(get_current_user)):
        """Take an order from the open list (when no offer reached anyone)."""
        require_driver(user)
        d = await driver_doc(user["id"])
        if d.get("status", "approved") != "approved":
            raise HTTPException(403, "حسابك قيد المراجعة من المتجر")
        o = await get_order(oid)
        if o.get("status") != "ready_for_pickup":
            raise HTTPException(409, "الطلب غير متاح")
        await take_order(o, user, "open_list")
        return await order_card(await get_order(oid))

    @router.get("/driver/orders/{oid}")
    async def order_detail(oid: str, user=Depends(get_current_user)):
        require_driver(user)
        o = await get_order(oid)
        if o.get("driver_id") != user["id"]:
            raise HTTPException(403, "Forbidden")
        return await order_card(o)

    @router.post("/driver/orders/{oid}/step")
    async def set_step(oid: str, body: StepIn, user=Depends(get_current_user)):
        require_driver(user)
        o = await get_order(oid)
        if o.get("driver_id") != user["id"] or o.get("status") not in ACTIVE:
            raise HTTPException(403, "Forbidden")
        if body.step not in ("at_store", "picked_up", "at_customer"):
            raise HTTPException(400, "Invalid step")
        cur = o.get("delivery_step") or "to_store"
        if STEPS.index(body.step) <= STEPS.index(cur):
            return await order_card(o)
        if STEPS.index(body.step) != STEPS.index(cur) + 1:
            raise HTTPException(400, "أكمل الخطوة الحالية أولاً")
        upd = {"delivery_step": body.step, f"{body.step}_at": iso()}
        if body.step in ("picked_up", "at_customer"):
            upd["status"] = "picked_up"
            upd.setdefault("picked_up_at", o.get("picked_up_at") or iso())
        await db.orders.update_one({"_id": o["_id"]}, {"$set": upd})
        if o.get("user_id"):
            txt = {"at_store": "السائق وصل للمتجر", "picked_up": "استلم السائق طلبك وهو في الطريق إليك", "at_customer": "السائق وصل إلى موقعك"}[body.step]
            await create_notification(o["user_id"], txt, f"رمز الاستلام: {o.get('delivery_otp', '')}", {"type": "order", "order_id": oid})
        await push_order(oid)
        return await order_card(await get_order(oid))

    @router.post("/driver/orders/{oid}/complete")
    async def complete(oid: str, body: CompleteIn, user=Depends(get_current_user)):
        require_driver(user)
        o = await get_order(oid)
        if o.get("driver_id") != user["id"] or o.get("status") not in ACTIVE:
            raise HTTPException(403, "Forbidden")
        if (o.get("delivery_step") or "to_store") not in ("picked_up", "at_customer"):
            raise HTTPException(400, "استلم الطلب من المتجر أولاً")
        otp_ok = bool(body.otp) and body.otp.strip() == str(o.get("delivery_otp", ""))
        if body.otp and not otp_ok:
            raise HTTPException(400, "رمز التسليم غير صحيح")
        if not otp_ok and not body.photo_url:
            raise HTTPException(400, "أدخل رمز العميل أو صوّر إثبات التسليم")
        d = await driver_doc(user["id"])
        earning = await estimate_earning(d, o)
        fee = float(o.get("delivery_fee", 0) or 0)
        acc = o.get("accepted_at")
        on_time = bool(acc) and (now() - datetime.fromisoformat(acc)).total_seconds() <= 60 * 60
        cod = (o.get("payment_method") or "").lower() in ("cod", "cash", "cash_on_delivery")
        cash = float(body.cash_collected or (o.get("total", 0) if cod else 0))
        done = await db.orders.update_one({"_id": o["_id"], "driver_id": user["id"], "status": {"$in": ACTIVE}}, {"$set": {
            "status": "delivered", "delivery_step": "delivered", "delivered_at": iso(),
            "proof": {"method": "otp" if otp_ok else "photo", "photo_url": body.photo_url},
            "driver_earnings": earning, "merchant_cut": round(fee - earning, 2), "cash_collected": cash, "on_time": on_time}})
        if done.modified_count != 1:  # a parallel request already completed it — never pay twice
            raise HTTPException(409, "تم تسليم الطلب مسبقاً")
        if earning > 0:
            await db.users.update_one({"_id": ObjectId(user["id"])}, {"$inc": {"wallet_balance": earning}})
            await db.driver_transactions.insert_one({"driver_id": user["id"], "order_id": oid, "amount": earning,
                                                     "type": "delivery_earnings", "created_at": iso()})
        await db.drivers.update_one({"_id": d["_id"]}, {"$inc": {"total_deliveries": 1, "on_time_count": 1 if on_time else 0,
                                                                  "cash_in_hand": cash}})
        if o.get("user_id"):
            await create_notification(o["user_id"], "تم تسليم طلبك ✅", "قيّم تجربتك مع السائق", {"type": "rate_driver", "order_id": oid})
        await push_order(oid)
        return {"ok": True, "earnings": earning, "cash_collected": cash}

    @router.post("/driver/orders/{oid}/issue")
    async def report_issue(oid: str, body: IssueIn, user=Depends(get_current_user)):
        require_driver(user)
        o = await get_order(oid)
        if o.get("driver_id") != user["id"]:
            raise HTTPException(403, "Forbidden")
        await db.driver_issues.insert_one({"order_id": oid, "driver_id": user["id"], "driver_name": user.get("name", ""),
                                           "type": body.type, "note": body.note, "status": "open", "created_at": iso()})
        await hub.to_fleet({"t": "issue", "order_id": oid, "driver_id": user["id"], "type": body.type})
        return {"ok": True}

    @router.post("/driver/sos")
    async def sos(body: IssueIn, user=Depends(get_current_user)):
        require_driver(user)
        await db.driver_issues.insert_one({"driver_id": user["id"], "driver_name": user.get("name", ""), "type": "sos",
                                           "note": body.note, "lat": body.lat, "lng": body.lng, "status": "open", "created_at": iso()})
        await hub.to_fleet({"t": "sos", "driver_id": user["id"], "name": user.get("name", ""), "lat": body.lat, "lng": body.lng})
        async for m in db.users.find({"role": "merchant"}, {"_id": 1}):
            await create_notification(str(m["_id"]), "🚨 استغاثة من سائق", f"{user.get('name', '')} يحتاج مساعدة", {"type": "sos", "driver_id": user["id"]})
        return {"ok": True}

    @router.get("/driver/trips")
    async def trips(user=Depends(get_current_user)):
        require_driver(user)
        return [await order_card(o) async for o in db.orders.find({"driver_id": user["id"], "status": "delivered"}).sort("delivered_at", -1).limit(100)]

    @router.get("/driver/earnings")
    async def earnings(period: str = "week", user=Depends(get_current_user)):
        require_driver(user)
        days = {"day": 1, "week": 7, "month": 30}.get(period, 7)
        start = datetime.fromisoformat(riyadh_midnight(days - 1))
        orders = await db.orders.find({"driver_id": user["id"], "status": "delivered", "delivered_at": {"$gte": start.isoformat()}},
                                      {"driver_earnings": 1, "delivered_at": 1, "delivery_fee": 1}).to_list(5000)
        series = {}
        for i in range(days):
            series[(start + RIYADH + timedelta(days=i)).date().isoformat()] = 0.0
        for o in orders:
            k = (datetime.fromisoformat(o["delivered_at"]) + RIYADH).date().isoformat()
            if k in series:
                series[k] += float(o.get("driver_earnings") or 0)
        d = await driver_doc(user["id"])
        u = await db.users.find_one({"_id": ObjectId(user["id"])}, {"wallet_balance": 1})
        payouts = [{**{k: v for k, v in p.items() if k != "_id"}, "id": str(p["_id"])}
                   async for p in db.driver_payouts.find({"driver_id": user["id"]}).sort("created_at", -1).limit(20)]
        total = round(sum(series.values()), 2)
        return {"period": period, "total": total, "trips": len(orders), "avg_per_trip": round(total / len(orders), 2) if orders else 0,
                "series": [{"date": k, "amount": round(v, 2)} for k, v in series.items()],
                "wallet_balance": round(float((u or {}).get("wallet_balance", 0)), 2), "cash_in_hand": round(float(d.get("cash_in_hand", 0)), 2),
                "payout_min": float((await db.settings.find_one({"key": "driver_payout_min"}) or {}).get("value", 50)), "payouts": payouts}

    @router.post("/driver/payouts")
    async def request_payout(body: PayoutIn, user=Depends(get_current_user)):
        require_driver(user)
        mn = float((await db.settings.find_one({"key": "driver_payout_min"}) or {}).get("value", 50))
        if body.amount < mn:
            raise HTTPException(400, f"الحد الأدنى للسحب {mn:.0f} ر.س")
        res = await db.users.update_one({"_id": ObjectId(user["id"]), "wallet_balance": {"$gte": body.amount}}, {"$inc": {"wallet_balance": -body.amount}})
        if not res.modified_count:
            raise HTTPException(400, "الرصيد غير كافٍ")
        await db.driver_payouts.insert_one({"driver_id": user["id"], "driver_name": user.get("name", ""), "amount": body.amount,
                                            "status": "pending", "created_at": iso()})
        return {"ok": True}

    @router.get("/driver/performance")
    async def performance(user=Depends(get_current_user)):
        require_driver(user)
        d = await driver_doc(user["id"])
        done = int(d.get("total_deliveries", 0))
        offers, acc = int(d.get("offers_total", 0)), int(d.get("offers_accepted", 0))
        level = [n for t, n in LEVELS if done >= t][-1]
        nxt = next(((t, n) for t, n in LEVELS if done < t), None)
        on_time = round(100 * d.get("on_time_count", 0) / done) if done else 100
        acc_rate = round(100 * acc / offers) if offers else 100
        rating = round(float(d.get("rating_avg", 5) or 5), 2)
        badges = [b for b, ok in [("first_trip", done >= 1), ("fifty_trips", done >= 50), ("on_time_pro", done >= 10 and on_time >= 95),
                                  ("five_star", d.get("rating_count", 0) >= 10 and rating >= 4.8), ("reliable", offers >= 20 and acc_rate >= 90)] if ok]
        reviews = [{"stars": o.get("driver_rating", {}).get("stars"), "comment": o.get("driver_rating", {}).get("comment", ""), "at": o.get("driver_rating", {}).get("at")}
                   async for o in db.orders.find({"driver_id": user["id"], "driver_rating": {"$exists": True}}).sort("delivered_at", -1).limit(10)]
        return {"completed": done, "acceptance_rate": acc_rate, "on_time_rate": on_time, "rating": rating,
                "rating_count": d.get("rating_count", 0), "level": level, "next_level": nxt[1] if nxt else None,
                "to_next": (nxt[0] - done) if nxt else 0, "badges": badges, "reviews": reviews}

    @router.get("/driver/me")
    async def me(user=Depends(get_current_user)):
        require_driver(user)
        d = await driver_doc(user["id"])
        return {"name": user.get("name", ""), "phone": user.get("phone", ""), "city": user.get("city", ""),
                "type": d.get("type", "store"), "status": d.get("status", "approved"), "vehicle": d.get("vehicle") or {"model": d.get("vehicle_info", "")},
                "docs": d.get("docs", {}), "photo_url": d.get("photo_url", ""), "nav_app": d.get("nav_app", "google"),
                "payment_model": d.get("payment_model", "commission"), "created_at": d.get("created_at")}

    @router.put("/driver/me")
    async def update_me(body: ProfileIn, user=Depends(get_current_user)):
        require_driver(user)
        upd = {}
        if body.vehicle:
            upd["vehicle"] = {k: str(v)[:60] for k, v in body.vehicle.items() if k in ("type", "plate", "model", "color")}
        if body.nav_app in ("google", "waze", "apple"):
            upd["nav_app"] = body.nav_app
        if body.photo_url is not None:
            upd["photo_url"] = body.photo_url
        for k, v in (body.docs or {}).items():
            if k in ("id", "license", "registration", "insurance"):
                upd[f"docs.{k}"] = {"url": v, "status": "pending", "uploaded_at": iso()}
        if upd:
            await db.drivers.update_one({"user_id": user["id"]}, {"$set": upd})
        return await me(user)

    @router.post("/driver/apply")
    async def apply(body: ApplyIn):
        phone = body.phone.strip()
        if len(body.password) < 6 or not body.name.strip() or len(phone) < 9:
            raise HTTPException(400, "الاسم والجوال وكلمة مرور (6 أحرف على الأقل) مطلوبة")
        if await db.users.count_documents({"phone": phone}):
            raise HTTPException(400, "رقم الجوال مسجل مسبقاً")
        u = await db.users.insert_one({"phone": phone, "password_hash": hash_password(body.password), "name": body.name.strip(),
                                       "email": "", "city": body.city, "gender": "", "role": "driver", "points": 0,
                                       "wallet_balance": 0, "created_at": iso()})
        docs = {k: {"url": v, "status": "pending", "uploaded_at": iso()} for k, v in body.docs.items() if k in ("id", "license", "registration", "insurance") and v}
        await db.drivers.insert_one({"user_id": str(u.inserted_id), "type": "independent", "status": "pending",
                                     "vehicle": {k: str(v)[:60] for k, v in body.vehicle.items()}, "docs": docs,
                                     "payment_model": "commission", "commission_type": "percentage", "merchant_commission_value": 0,
                                     "online": False, "current_lat": 0, "current_lng": 0, "total_deliveries": 0, "created_at": iso()})
        async for m in db.users.find({"role": "merchant"}, {"_id": 1}):
            await create_notification(str(m["_id"]), "طلب انضمام سائق جديد", body.name, {"type": "driver_application"})
        return {"ok": True, "message": "تم استلام طلبك، سيتم مراجعته من المتجر"}

    # ─── Customer side ───
    @router.get("/orders/{oid}/live")
    async def order_live(oid: str, user=Depends(get_current_user)):
        o = await get_order(oid)
        if not can_view(user, o):
            raise HTTPException(403, "Forbidden")
        card = await order_card(o)
        out = {**card, "driver": None, "otp": o.get("delivery_otp") if o.get("user_id") == user["id"] else None,
               "rated": bool(o.get("driver_rating"))}
        if o.get("driver_id"):
            d = await db.drivers.find_one({"user_id": o["driver_id"]}) or {}
            du = await db.users.find_one({"_id": ObjectId(o["driver_id"])}, {"name": 1, "phone": 1}) or {}
            loc = await live_loc(o["driver_id"])
            out["driver"] = {"id": o["driver_id"], "name": du.get("name", ""), "phone": du.get("phone", ""),
                             "rating": round(float(d.get("rating_avg", 5) or 5), 1), "trips": d.get("total_deliveries", 0),
                             "vehicle": d.get("vehicle") or {"model": d.get("vehicle_info", "")}, "photo_url": d.get("photo_url", ""),
                             "loc": {k: v for k, v in (loc or {}).items() if k != "_saved"} or None}
            tgt = card["store"] if card["step"] in ("to_store", "at_store") else card["customer"]
            if loc and tgt.get("lat") and o.get("status") in ACTIVE:
                r = await route(loc["lat"], loc["lng"], tgt["lat"], tgt["lng"])
                out["route"], out["eta_min"] = r["coords"], max(1, round(r["duration_s"] / 60))
        return out

    @router.post("/orders/{oid}/rate-driver")
    async def rate_driver(oid: str, body: RateIn, user=Depends(get_current_user)):
        o = await get_order(oid)
        if o.get("user_id") != user["id"] or o.get("status") != "delivered" or not o.get("driver_id"):
            raise HTTPException(403, "Forbidden")
        if o.get("driver_rating"):
            raise HTTPException(400, "تم التقييم مسبقاً")
        stars = max(1, min(5, int(body.stars)))
        await db.orders.update_one({"_id": o["_id"]}, {"$set": {"driver_rating": {"stars": stars, "comment": body.comment[:300], "at": iso()}}})
        d = await db.drivers.find_one({"user_id": o["driver_id"]}) or {}
        cnt = int(d.get("rating_count", 0))
        avg = (float(d.get("rating_avg", 5) or 5) * cnt + stars) / (cnt + 1)
        await db.drivers.update_one({"user_id": o["driver_id"]}, {"$set": {"rating_avg": round(avg, 3)}, "$inc": {"rating_count": 1}})
        return {"ok": True}

    @router.get("/orders/{oid}/messages")
    async def get_msgs(oid: str, user=Depends(get_current_user)):
        o = await get_order(oid)
        if not can_view(user, o):
            raise HTTPException(403, "Forbidden")
        return [{**{k: v for k, v in m.items() if k != "_id"}, "id": str(m["_id"]), "mine": m["sender_id"] == user["id"]}
                async for m in db.order_messages.find({"order_id": oid}).sort("created_at", 1).limit(300)]

    @router.post("/orders/{oid}/messages")
    async def send_msg(oid: str, body: MsgIn, user=Depends(get_current_user)):
        o = await get_order(oid)
        if not can_view(user, o):
            raise HTTPException(403, "Forbidden")
        text = body.text.strip()[:1000]
        if not text:
            raise HTTPException(400, "Empty")
        m = {"order_id": oid, "sender_id": user["id"], "sender_role": user.get("role"), "sender_name": user.get("name", ""),
             "text": text, "created_at": iso()}
        r = await db.order_messages.insert_one(m)
        m["id"] = str(r.inserted_id)
        m.pop("_id", None)
        await hub.to_room(oid, {"t": "chat", "message": m})
        other = o.get("driver_id") if user["id"] == o.get("user_id") else o.get("user_id")
        if other:
            await hub.to_user(other, {"t": "chat", "message": m})
            await create_notification(other, f"رسالة من {user.get('name', '')}", text[:80], {"type": "order_chat", "order_id": oid})
        return m

    # ─── Merchant fleet ───
    @router.get("/merchant/fleet")
    async def fleet(user=Depends(get_current_user)):
        require_merchant(user)
        out = []
        async for d in db.drivers.find({}):
            u = await db.users.find_one({"_id": ObjectId(d["user_id"])}, {"name": 1, "phone": 1}) if ObjectId.is_valid(d.get("user_id", "")) else None
            if not u:
                continue
            loc = hub.last_loc.get(d["user_id"]) or ({"lat": d.get("current_lat"), "lng": d.get("current_lng"), "ts": d.get("last_location_at")} if d.get("current_lat") else None)
            out.append({"id": str(d["_id"]), "user_id": d["user_id"], "name": u.get("name", ""), "phone": u.get("phone", ""),
                        "online": d.get("online", False), "status": d.get("status", "approved"), "type": d.get("type", "store"),
                        "active_orders": await db.orders.count_documents({"driver_id": d["user_id"], "status": {"$in": ACTIVE}}),
                        "rating": round(float(d.get("rating_avg", 5) or 5), 1), "cash_in_hand": round(float(d.get("cash_in_hand", 0)), 2),
                        "total_deliveries": d.get("total_deliveries", 0), "vehicle": d.get("vehicle") or {"model": d.get("vehicle_info", "")},
                        "docs": d.get("docs", {}), "loc": {k: v for k, v in loc.items() if k != "_saved"} if loc else None})
        waiting = [await order_card(o) async for o in db.orders.find({"status": "ready_for_pickup", "driver_id": {"$in": [None, ""]}}).limit(50)]
        issues = [{**{k: v for k, v in i.items() if k != "_id"}, "id": str(i["_id"])} async for i in db.driver_issues.find({"status": "open"}).sort("created_at", -1).limit(30)]
        payouts = [{**{k: v for k, v in p.items() if k != "_id"}, "id": str(p["_id"])} async for p in db.driver_payouts.find({"status": "pending"}).sort("created_at", -1)]
        return {"drivers": out, "waiting_orders": waiting, "issues": issues, "payouts": payouts}

    @router.post("/merchant/orders/{oid}/assign")
    async def assign(oid: str, body: AssignIn, user=Depends(get_current_user)):
        require_merchant(user)
        o = await get_order(oid)
        if o.get("status") not in ("ready_for_pickup", "processing", "confirmed", "preparing"):
            raise HTTPException(409, "لا يمكن تعيين هذا الطلب")
        du = await db.users.find_one({"_id": ObjectId(body.driver_user_id), "role": "driver"}) if ObjectId.is_valid(body.driver_user_id) else None
        if not du:
            raise HTTPException(404, "السائق غير موجود")
        dd = await db.drivers.find_one({"user_id": str(du["_id"])}, {"status": 1})
        if (dd or {}).get("status", "approved") != "approved":
            raise HTTPException(400, "السائق غير معتمد بعد")
        du["id"] = str(du["_id"])
        await take_order(o, du, "manual", ("ready_for_pickup", "processing", "confirmed", "preparing"))
        await hub.to_user(du["id"], {"t": "assigned", "order": await order_card(await get_order(oid))})
        await create_notification(du["id"], "تم تعيين طلب لك", "افتح التطبيق لبدء التوصيل", {"type": "order", "order_id": oid})
        return {"ok": True}

    @router.post("/merchant/drivers/{did}/approve")
    async def approve(did: str, body: dict, user=Depends(get_current_user)):
        require_merchant(user)
        st = "approved" if body.get("approve", True) else "rejected"
        d = await db.drivers.find_one({"_id": ObjectId(did)}) if ObjectId.is_valid(did) else None
        if not d:
            raise HTTPException(404)
        upd = {"status": st, "reviewed_at": iso()}
        for k in (d.get("docs") or {}):
            upd[f"docs.{k}.status"] = st
        await db.drivers.update_one({"_id": d["_id"]}, {"$set": upd})
        await create_notification(d["user_id"], "تمت الموافقة على حسابك 🎉" if st == "approved" else "تم رفض طلب الانضمام", "", {"type": "driver_status"})
        return {"status": st}

    @router.post("/merchant/drivers/{did}/settle-cash")
    async def settle_cash(did: str, user=Depends(get_current_user)):
        require_merchant(user)
        d = await db.drivers.find_one({"_id": ObjectId(did)}) if ObjectId.is_valid(did) else None
        if not d:
            raise HTTPException(404)
        await db.driver_transactions.insert_one({"driver_id": d["user_id"], "amount": -float(d.get("cash_in_hand", 0)), "type": "cash_settled", "created_at": iso()})
        await db.drivers.update_one({"_id": d["_id"]}, {"$set": {"cash_in_hand": 0}})
        return {"ok": True}

    @router.post("/merchant/driver-payouts/{pid}")
    async def payout_decide(pid: str, body: dict, user=Depends(get_current_user)):
        require_merchant(user)
        p = await db.driver_payouts.find_one({"_id": ObjectId(pid), "status": "pending"}) if ObjectId.is_valid(pid) else None
        if not p:
            raise HTTPException(404)
        paid = bool(body.get("paid", True))
        await db.driver_payouts.update_one({"_id": p["_id"]}, {"$set": {"status": "paid" if paid else "rejected", "decided_at": iso()}})
        if not paid:
            await db.users.update_one({"_id": ObjectId(p["driver_id"])}, {"$inc": {"wallet_balance": p["amount"]}})
        return {"ok": True}

    @router.post("/merchant/driver-issues/{iid}/resolve")
    async def resolve_issue(iid: str, user=Depends(get_current_user)):
        require_merchant(user)
        await db.driver_issues.update_one({"_id": ObjectId(iid)}, {"$set": {"status": "resolved", "resolved_at": iso()}})
        return {"ok": True}

    return router, dispatch, expiry_loop
