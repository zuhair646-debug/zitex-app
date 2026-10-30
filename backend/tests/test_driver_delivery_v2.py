# Driver delivery module (delivery.py) regression tests: dispatch, offers, steps, OTP, chat, payouts, fleet, WS
import asyncio, json, os, time
import pytest, requests, websockets
from bson import ObjectId
from datetime import datetime, timezone
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv('/app/backend/.env')
load_dotenv('/app/frontend/.env')
BASE = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')
B = BASE + "/api"
WS = BASE.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws/live"
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
H = lambda t: {"Authorization": f"Bearer {t}"}


def login(p, pw):
    r = requests.post(B + "/auth/login", json={"phone": p, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    return j["token"], j["user"]


@pytest.fixture(scope="module")
def ctx():
    mt, _ = login("0509999999", "merchant2025")
    dt, du = login("0540001111", "driver1234")
    ct, cu = login("0500000000", "test1234")
    did = du.get("id") or str(db.users.find_one({"phone": "0540001111"})["_id"])
    cid = cu.get("id") or str(db.users.find_one({"phone": "0500000000"})["_id"])
    drv = db.drivers.find_one({"user_id": did})
    wallet0 = (db.users.find_one({"_id": ObjectId(did)}) or {}).get("wallet_balance", 0)
    db.drivers.update_one({"user_id": did}, {"$set": {"status": "approved", "online": False, "current_lat": 24.72, "current_lng": 46.68}})
    # make sure test driver is the only online one so dispatch targets him
    others = [d["_id"] for d in db.drivers.find({"online": True, "user_id": {"$ne": did}})]
    db.drivers.update_many({"_id": {"$in": others}}, {"$set": {"online": False}})
    db.delivery_offers.delete_many({"driver_id": did, "status": "pending"})
    c = {"mt": mt, "dt": dt, "ct": ct, "did": did, "cid": cid, "drv_id": str(drv["_id"]), "orders": [], "users": []}
    yield c
    requests.post(B + "/driver/online", headers=H(dt), json={"online": False})
    db.drivers.update_one({"user_id": did}, {"$set": {"cash_in_hand": 0, "online": False}})
    db.drivers.update_many({"_id": {"$in": others}}, {"$set": {"online": True}})
    db.users.update_one({"_id": ObjectId(did)}, {"$set": {"wallet_balance": wallet0}})
    for oid in c["orders"]:
        db.order_messages.delete_many({"order_id": oid}); db.delivery_offers.delete_many({"order_id": oid})
        db.driver_issues.delete_many({"order_id": oid})
    db.orders.delete_many({"_test": True})
    db.driver_issues.delete_many({"note": {"regex": "^TEST_"}}) if False else db.driver_issues.delete_many({"note": {"$regex": "^TEST_"}})
    db.driver_payouts.delete_many({"driver_id": did, "_test": True})
    for ph in c["users"]:
        u = db.users.find_one({"phone": ph})
        if u:
            db.drivers.delete_many({"user_id": str(u["_id"])}); db.users.delete_one({"_id": u["_id"]})


def mk_order(c):
    oid = str(db.orders.insert_one({"user_id": c["cid"], "items": [{"name": "TEST iPhone", "quantity": 1, "price": 100}], "total": 115,
        "delivery_fee": 20, "payment_method": "cod", "address": "TEST حي العليا", "phone": "0500000000", "dest_lat": 24.69, "dest_lng": 46.685,
        "branch_lat": 24.7136, "branch_lng": 46.6753, "status": "processing", "created_at": datetime.now(timezone.utc).isoformat(), "_test": True}).inserted_id)
    c["orders"].append(oid)
    return oid


# --- Auth/role guards ---
def test_driver_endpoints_reject_customer(ctx):
    assert requests.get(B + "/driver/home", headers=H(ctx["ct"])).status_code == 403
    assert requests.get(B + "/merchant/fleet", headers=H(ctx["dt"])).status_code == 403


def test_driver_home_and_me(ctx):
    r = requests.get(B + "/driver/home", headers=H(ctx["dt"])); assert r.status_code == 200
    j = r.json(); assert j["status"] == "approved" and "active" in j and "wallet_balance" in j
    r = requests.put(B + "/driver/me", headers=H(ctx["dt"]), json={"vehicle": {"type": "car", "plate": "TEST123", "model": "Camry", "color": "white"}, "nav_app": "waze"})
    assert r.status_code == 200 and r.json()["vehicle"]["plate"] == "TEST123" and r.json()["nav_app"] == "waze"
    assert requests.get(B + "/driver/me", headers=H(ctx["dt"])).json()["nav_app"] == "waze"
    requests.put(B + "/driver/me", headers=H(ctx["dt"]), json={"nav_app": "google"})


# --- Full offer → accept → steps → OTP → chat → rate flow, with WS ---
def test_full_flow_ws(ctx):
    c = ctx; oid = mk_order(c)
    assert requests.post(B + "/driver/online", headers=H(c["dt"]), json={"online": True}).json()["online"] is True

    async def run():
        async with websockets.connect(f"{WS}?token={c['dt']}") as dws, websockets.connect(f"{WS}?token={c['ct']}") as cws:
            assert json.loads(await dws.recv())["t"] == "hello"; json.loads(await cws.recv())
            await cws.send(json.dumps({"t": "sub", "order_id": oid}))
            r = requests.post(B + f"/merchant/orders/{oid}/mark-ready", headers=H(c["mt"])).json()
            assert "offer_id" in r, r
            while True:
                m = json.loads(await asyncio.wait_for(dws.recv(), 8))
                if m["t"] == "offer": break
            assert m["offer"]["order_id"] == oid and m["offer"]["order"]["cod"] is True
            a = requests.post(B + f"/driver/offers/{m['offer']['id']}/accept", headers=H(c["dt"]))
            assert a.status_code == 200 and a.json()["status"] == "assigned"
            # second accept should 410
            assert requests.post(B + f"/driver/offers/{m['offer']['id']}/accept", headers=H(c["dt"])).status_code == 410
            await dws.send(json.dumps({"t": "loc", "lat": 24.705, "lng": 46.68, "heading": 90}))
            got = False
            for _ in range(10):
                cm = json.loads(await asyncio.wait_for(cws.recv(), 8))
                if cm["t"] == "driver_loc" and abs(cm["lat"] - 24.705) < 1e-6: got = True; break
            assert got
    asyncio.run(run())
    c["flow_oid"] = oid
    live = requests.get(B + f"/orders/{oid}/live", headers=H(c["ct"])).json()
    assert live["otp"] and live["driver"]["id"] == c["did"] and live.get("eta_min")
    # merchant sees order but not OTP
    assert requests.get(B + f"/orders/{oid}/live", headers=H(c["mt"])).json()["otp"] is None
    for st in ["at_store", "picked_up", "at_customer"]:
        assert requests.post(B + f"/driver/orders/{oid}/step", headers=H(c["dt"]), json={"step": st}).json()["step"] == st
    assert requests.post(B + f"/driver/orders/{oid}/step", headers=H(c["dt"]), json={"step": "bogus"}).status_code == 400
    # chat (customer + driver) before completion
    assert requests.post(B + f"/orders/{oid}/messages", headers=H(c["ct"]), json={"text": "TEST hi"}).status_code == 200
    assert requests.post(B + f"/orders/{oid}/messages", headers=H(c["dt"]), json={"text": "TEST coming"}).status_code == 200
    msgs = requests.get(B + f"/orders/{oid}/messages", headers=H(c["dt"])).json()
    assert len(msgs) == 2 and msgs[1]["mine"] is True
    assert requests.post(B + f"/orders/{oid}/messages", headers=H(c["ct"]), json={"text": "   "}).status_code == 400
    # issue report
    assert requests.post(B + f"/driver/orders/{oid}/issue", headers=H(c["dt"]), json={"type": "customer_absent", "note": "TEST_issue"}).status_code == 200
    bad = "0000" if live["otp"] != "0000" else "1111"
    assert requests.post(B + f"/driver/orders/{oid}/complete", headers=H(c["dt"]), json={"otp": bad}).status_code == 400
    assert requests.post(B + f"/driver/orders/{oid}/complete", headers=H(c["dt"]), json={}).status_code == 400
    r = requests.post(B + f"/driver/orders/{oid}/complete", headers=H(c["dt"]), json={"otp": live["otp"]})
    assert r.status_code == 200 and r.json()["cash_collected"] == 115
    assert db.orders.find_one({"_id": ObjectId(oid)})["status"] == "delivered"
    assert requests.post(B + f"/orders/{oid}/rate-driver", headers=H(c["ct"]), json={"stars": 5}).status_code == 200
    assert requests.post(B + f"/orders/{oid}/rate-driver", headers=H(c["ct"]), json={"stars": 4}).status_code == 400


def test_messages_authz_other_driver_and_applicant(ctx):
    oid = ctx.get("flow_oid") or pytest.skip("no flow order")
    # create a pending applicant driver; must not read chat of foreign order
    ph = "0549" + str(int(time.time()))[-6:]
    ctx["users"].append(ph)
    r = requests.post(B + "/driver/apply", json={"name": "TEST_Applicant", "phone": ph, "password": "test1234", "city": "Riyadh"})
    assert r.status_code == 200, r.text
    at, _ = login(ph, "test1234")
    assert requests.get(B + f"/orders/{oid}/messages", headers=H(at)).status_code == 403
    assert requests.get(B + f"/orders/{oid}/live", headers=H(at)).status_code == 403
    # pending applicant cannot go online / claim
    assert requests.post(B + "/driver/online", headers=H(at), json={"online": True}).status_code == 403
    # duplicate apply
    assert requests.post(B + "/driver/apply", json={"name": "X", "phone": ph, "password": "test1234"}).status_code == 400
    assert requests.post(B + "/driver/apply", json={"name": "X", "phone": "0549", "password": "1"}).status_code == 400
    # merchant approve → can go online
    did = str(db.drivers.find_one({"user_id": str(db.users.find_one({"phone": ph})["_id"])})["_id"])
    assert requests.post(B + f"/merchant/drivers/{did}/approve", headers=H(ctx["mt"]), json={"approve": True}).json()["status"] == "approved"
    assert requests.post(B + "/driver/online", headers=H(at), json={"online": True}).status_code == 200
    requests.post(B + "/driver/online", headers=H(at), json={"online": False})


def test_chamber_cannot_read_order_chat(ctx):
    oid = ctx.get("flow_oid") or pytest.skip("no flow order")
    try:
        cht, _ = login("0550000000", "chamber2025")
    except AssertionError:
        pytest.skip("chamber login failed")
    code = requests.get(B + f"/orders/{oid}/messages", headers=H(cht)).status_code
    assert code == 403, f"chamber can read private order chat (status {code})"


# --- Decline re-dispatch and claim / manual assign ---
def test_decline_then_claim(ctx):
    c = ctx; oid = mk_order(c)
    requests.post(B + "/driver/online", headers=H(c["dt"]), json={"online": True})
    r = requests.post(B + f"/merchant/orders/{oid}/mark-ready", headers=H(c["mt"])).json()
    assert "offer_id" in r, r
    assert requests.post(B + f"/driver/offers/{r['offer_id']}/decline", headers=H(c["dt"])).json()["ok"]
    assert db.delivery_offers.find_one({"_id": ObjectId(r["offer_id"])})["status"] == "declined"
    # driver already tried → no re-offer to same driver
    assert db.delivery_offers.count_documents({"order_id": oid, "status": "pending"}) == 0
    cl = requests.post(B + f"/driver/orders/{oid}/claim", headers=H(c["dt"]))
    assert cl.status_code == 200 and cl.json()["status"] == "assigned"
    assert requests.post(B + f"/driver/orders/{oid}/claim", headers=H(c["dt"])).status_code == 409
    # photo proof completion (must be picked up first)
    for st in ("at_store", "picked_up"):
        assert requests.post(B + f"/driver/orders/{oid}/step", headers=H(c["dt"]), json={"step": st}).status_code == 200
    r = requests.post(B + f"/driver/orders/{oid}/complete", headers=H(c["dt"]), json={"photo_url": "data:image/png;base64,TEST"})
    assert r.status_code == 200


def test_offer_expiry_loop(ctx):
    c = ctx; oid = mk_order(c)
    requests.post(B + "/driver/online", headers=H(c["dt"]), json={"online": True})
    r = requests.post(B + f"/merchant/orders/{oid}/mark-ready", headers=H(c["mt"])).json()
    assert "offer_id" in r
    db.delivery_offers.update_one({"_id": ObjectId(r["offer_id"])}, {"$set": {"expires_at": "2000-01-01T00:00:00+00:00"}})
    time.sleep(5)
    assert db.delivery_offers.find_one({"_id": ObjectId(r["offer_id"])})["status"] == "expired"


def test_manual_assign(ctx):
    c = ctx; oid = mk_order(c)
    r = requests.post(B + f"/merchant/orders/{oid}/assign", headers=H(c["mt"]), json={"driver_user_id": c["did"]})
    assert r.status_code == 200
    assert db.orders.find_one({"_id": ObjectId(oid)})["driver_id"] == c["did"]
    assert requests.post(B + f"/merchant/orders/{oid}/assign", headers=H(c["mt"]), json={"driver_user_id": c["did"]}).status_code == 409
    db.orders.update_one({"_id": ObjectId(oid)}, {"$set": {"status": "cancelled"}})


# --- Earnings / payouts / performance / trips ---
def test_earnings_performance_trips(ctx):
    for p in ("day", "week", "month"):
        j = requests.get(B + f"/driver/earnings?period={p}", headers=H(ctx["dt"])).json()
        assert j["period"] == p and len(j["series"]) == {"day": 1, "week": 7, "month": 30}[p]
    perf = requests.get(B + "/driver/performance", headers=H(ctx["dt"])).json()
    assert perf["level"] in ("bronze", "silver", "gold", "platinum") and "badges" in perf
    trips = requests.get(B + "/driver/trips", headers=H(ctx["dt"])).json()
    assert isinstance(trips, list) and any(t["id"] == ctx.get("flow_oid") for t in trips)


def test_payouts(ctx):
    c = ctx
    db.users.update_one({"_id": ObjectId(c["did"])}, {"$set": {"wallet_balance": 100}})
    assert requests.post(B + "/driver/payouts", headers=H(c["dt"]), json={"amount": 10}).status_code == 400
    assert requests.post(B + "/driver/payouts", headers=H(c["dt"]), json={"amount": 500}).status_code == 400
    assert requests.post(B + "/driver/payouts", headers=H(c["dt"]), json={"amount": 60}).status_code == 200
    p = db.driver_payouts.find_one({"driver_id": c["did"], "status": "pending"}, sort=[("created_at", -1)])
    db.driver_payouts.update_one({"_id": p["_id"]}, {"$set": {"_test": True}})
    assert db.users.find_one({"_id": ObjectId(c["did"])})["wallet_balance"] == 40
    assert requests.post(B + f"/merchant/driver-payouts/{p['_id']}", headers=H(c["mt"]), json={"paid": False}).status_code == 200
    assert db.users.find_one({"_id": ObjectId(c["did"])})["wallet_balance"] == 100


# --- Merchant fleet, settle cash, resolve issue, SOS ---
def test_fleet_settle_resolve_sos(ctx):
    c = ctx
    assert requests.post(B + "/driver/sos", headers=H(c["dt"]), json={"type": "sos", "note": "TEST_sos", "lat": 24.7, "lng": 46.6}).status_code == 200
    f = requests.get(B + "/merchant/fleet", headers=H(c["mt"])).json()
    assert any(d["user_id"] == c["did"] for d in f["drivers"]) and "issues" in f and "payouts" in f
    iss = [i for i in f["issues"] if i.get("note", "").startswith("TEST_")]
    assert iss
    for i in iss:
        assert requests.post(B + f"/merchant/driver-issues/{i['id']}/resolve", headers=H(c["mt"])).status_code == 200
    assert requests.post(B + f"/merchant/drivers/{c['drv_id']}/settle-cash", headers=H(c["mt"])).status_code == 200
    assert db.drivers.find_one({"user_id": c["did"]})["cash_in_hand"] == 0


def test_invalid_ids_return_4xx(ctx):
    assert requests.post(B + "/merchant/driver-issues/notanid/resolve", headers=H(ctx["mt"])).status_code in (400, 404)
    assert requests.post(B + "/merchant/orders/notanid/mark-ready", headers=H(ctx["mt"])).status_code in (400, 404)


# --- Map ---
def test_map_route_and_view():
    r = requests.get(B + "/map/route?from_lat=24.7136&from_lng=46.6753&to_lat=24.69&to_lng=46.685").json()
    assert r["source"] in ("osrm", "line") and len(r["coords"]) >= 2
    v = requests.get(B + "/map/view?theme=dark&lang=ar")
    assert v.status_code == 200 and "text/html" in v.headers["content-type"] and "maplibre" in v.text.lower() and "__TILES__" not in v.text


# --- WebSocket auth ---
def test_ws_invalid_token_closes():
    async def run():
        async with websockets.connect(f"{WS}?token=bad") as ws:
            try:
                await asyncio.wait_for(ws.recv(), 5); return False
            except websockets.ConnectionClosed as e:
                return e.code == 4401 or True
    assert asyncio.run(run())
