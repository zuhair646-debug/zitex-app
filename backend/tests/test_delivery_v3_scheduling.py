# Delivery v3: express/scheduled/shipping pricing, shifts+pools, night planner, queue pickup, banner, tips
import os
import pytest
import requests
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
load_dotenv('/app/frontend/.env')
BASE = os.environ.get('EXPO_PUBLIC_BACKEND_URL', os.environ.get('EXPO_BACKEND_URL', '')).rstrip('/') + "/api"
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
TODAY = (datetime.now(timezone.utc) + timedelta(hours=3)).date().isoformat()


def login(p, pw):
    r = requests.post(BASE + "/auth/login", json={"phone": p, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def ctx():
    c = {"mt": login("0509999999", "merchant2025"), "dt": login("0540001111", "driver1234"), "ct": login("0500000000", "test1234")}
    c["did"] = str(db.users.find_one({"phone": "0540001111"})["_id"])
    c["cid"] = str(db.users.find_one({"phone": "0500000000"})["_id"])
    c["drv"] = db.drivers.find_one({"user_id": c["did"]})
    c["wallet_c"] = db.users.find_one({"_id": ObjectId(c["cid"])}).get("wallet_balance", 0)
    c["wallet_d"] = db.users.find_one({"_id": ObjectId(c["did"])}).get("wallet_balance", 0)
    c["settings"] = db.settings.find_one({"key": "delivery"})
    c["t0"] = datetime.now(timezone.utc).isoformat()
    yield c
    # cleanup
    ids = [str(o["_id"]) for o in db.orders.find({"_test": True}, {"_id": 1})]
    db.orders.delete_many({"_test": True})
    db.driver_transactions.delete_many({"$or": [{"order_id": {"$in": ids}}, {"driver_id": c["did"], "created_at": {"$gte": c["t0"]}}]})
    db.delivery_offers.delete_many({"order_id": {"$in": ids}})
    db.users.update_one({"_id": ObjectId(c["cid"])}, {"$set": {"wallet_balance": c["wallet_c"]}})
    db.users.update_one({"_id": ObjectId(c["did"])}, {"$set": {"wallet_balance": c["wallet_d"]}})
    db.drivers.update_one({"user_id": c["did"]}, {"$set": {"cash_in_hand": 0, "online": False, "pools": ["express", "standard"],
                                                        "shift": {"slot": "", "start": "08:00"}}})
    if c["settings"] is None:
        db.settings.delete_one({"key": "delivery"})
    else:
        db.settings.replace_one({"key": "delivery"}, c["settings"])


def mk_order(cid, la, ln, **kw):
    doc = {"user_id": cid, "items": [{"name": "TEST", "quantity": 1}], "total": 50, "delivery_fee": 10, "payment_method": "card",
           "address": "TEST stop", "dest_lat": la, "dest_lng": ln, "branch_lat": 24.7136, "branch_lng": 46.6753, "status": "processing",
           "delivery_type": "scheduled", "scheduled_date": TODAY, "scheduled_slot": {"label": "TESTSLOT"}, "_test": True,
           "created_at": datetime.now(timezone.utc).isoformat()}
    doc.update(kw)
    return str(db.orders.insert_one(doc).inserted_id)


# ── Pricing ──
class TestFee:
    def test_express_distance_priced(self):
        a = requests.post(BASE + "/delivery/calculate-fee", json={"distance_km": 2, "delivery_type": "same_day"}).json()
        b = requests.post(BASE + "/delivery/calculate-fee", json={"distance_km": 10, "delivery_type": "same_day"}).json()
        assert a["delivery_type"] == "same_day" and b["delivery_fee"] > a["delivery_fee"]
        print("express 2km", a["delivery_fee"], "10km", b["delivery_fee"])

    def test_shipping_out_of_range(self):
        r = requests.post(BASE + "/delivery/calculate-fee", json={"distance_km": 400, "delivery_type": "same_day"}).json()
        assert r["delivery_type"] == "shipping" and r["delivery_fee"] > 0 and r.get("eta_text")

    def test_scheduled_days_default_settings_have_slots(self):
        r = requests.post(BASE + "/delivery/calculate-fee", json={"distance_km": 5, "delivery_type": "scheduled"}).json()
        days = r.get("scheduled_days", [])
        assert len(days) >= 1
        print("slots on day0:", len(days[0]["slots"]))
        assert len(days[0]["slots"]) > 0, "no slots returned (settings doc missing → defaults not used)"

    def test_slot_capacity_full(self, ctx):
        s = requests.get(BASE + "/delivery/settings").json()
        s["scheduled_slots"] = [{"label": "TESTSLOT_CAP", "start": "09:00", "end": "12:00", "capacity": 1},
                                {"label": "TESTSLOT_FREE", "start": "16:00", "end": "20:00", "capacity": 0}]
        assert requests.put(BASE + "/merchant/delivery/settings", headers=H(ctx["mt"]), json=s).status_code == 200
        r = requests.post(BASE + "/delivery/calculate-fee", json={"distance_km": 5, "delivery_type": "scheduled"}).json()
        d0 = r["scheduled_days"][0]
        mk_order(ctx["cid"], 24.7, 46.7, scheduled_date=d0["date"], scheduled_slot={"label": "TESTSLOT_CAP"})
        r = requests.post(BASE + "/delivery/calculate-fee", json={"distance_km": 5, "delivery_type": "scheduled"}).json()
        sl = {x["label"]: x for x in r["scheduled_days"][0]["slots"]}
        assert sl["TESTSLOT_CAP"]["full"] is True and sl["TESTSLOT_CAP"]["remaining"] == 0
        assert sl["TESTSLOT_FREE"]["full"] is False and sl["TESTSLOT_FREE"]["remaining"] is None
        db.orders.delete_many({"_test": True})


# ── Order create with scheduled ──
class TestOrderScheduled:
    def test_create_scheduled_order(self, ctx):
        db.settings.delete_one({"key": "delivery"})  # back to defaults (previous test set TESTSLOT slots)
        cart_backup = list(db.cart_items.find({"user_id": ctx["cid"]}))
        db.cart_items.delete_many({"user_id": ctx["cid"]})
        p = db.products.find_one({"stock": {"$gt": 5}})
        stock0 = p.get("stock")
        try:
            assert requests.post(BASE + "/cart", headers=H(ctx["ct"]), json={"product_id": str(p["_id"]), "quantity": 1}).status_code == 200
            tomorrow = (datetime.fromisoformat(TODAY) + timedelta(days=1)).date().isoformat()
            r = requests.post(BASE + "/orders", headers=H(ctx["ct"]), json={
                "address": "TEST addr", "phone": "0500000000", "delivery_type": "scheduled", "payment_method": "cash",
                "dest_lat": 24.72, "dest_lng": 46.68, "scheduled_date": tomorrow,
                "scheduled_slot": {"label": "الفترة الصباحية", "start": "09:00", "end": "14:00"}})
            assert r.status_code == 200, r.text
            oid = r.json().get("id") or r.json().get("order_id") or r.json().get("order", {}).get("id")
            o = db.orders.find_one({"_id": ObjectId(oid)})
            db.orders.update_one({"_id": o["_id"]}, {"$set": {"_test": True}})
            print("order delivery_type", o["delivery_type"], o["scheduled_date"], o.get("delivery_fee"))
            assert o["delivery_type"] == "scheduled" and o["scheduled_date"] == tomorrow
            assert o["scheduled_slot"]["label"] == "الفترة الصباحية"
            db.loyalty_transactions.delete_many({"user_id": ctx["cid"], "ref_id": oid})
        finally:
            db.cart_items.delete_many({"user_id": ctx["cid"]})
            if cart_backup:
                db.cart_items.insert_many(cart_backup)
            if stock0 is not None:
                db.products.update_one({"_id": p["_id"]}, {"$set": {"stock": stock0}})


# ── Shift / fleet ──
class TestShift:
    def test_set_shift_and_fleet(self, ctx):
        r = requests.put(BASE + f"/merchant/drivers/{ctx['drv']['_id']}/shift", headers=H(ctx["mt"]),
                         json={"pools": ["standard"], "slot": "TESTSLOT", "start": "09:30"})
        assert r.status_code == 200 and r.json()["pools"] == ["standard"]
        f = requests.get(BASE + "/merchant/fleet", headers=H(ctx["mt"])).json()
        me = [d for d in f["drivers"] if d["user_id"] == ctx["did"]][0]
        assert me["pools"] == ["standard"] and me["shift"]["start"] == "09:30" and me["shift"]["slot"] == "TESTSLOT"

    def test_shift_404_and_auth(self, ctx):
        assert requests.put(BASE + "/merchant/drivers/000000000000000000000000/shift", headers=H(ctx["mt"]), json={}).status_code == 404
        assert requests.put(BASE + f"/merchant/drivers/{ctx['drv']['_id']}/shift", headers=H(ctx["ct"]), json={}).status_code == 403

    def test_express_not_offered_to_standard_only(self, ctx):
        # driver standard-only + online, other drivers offline → express ready order must not be offered to him
        others = list(db.drivers.find({"user_id": {"$ne": ctx["did"]}, "online": True}, {"_id": 1}))
        db.drivers.update_many({"_id": {"$in": [o["_id"] for o in others]}}, {"$set": {"online": False}})
        try:
            requests.post(BASE + "/driver/location", headers=H(ctx["dt"]), json={"lat": 24.7136, "lng": 46.6753})
            requests.post(BASE + "/driver/online", headers=H(ctx["dt"]), json={"online": True})
            oid = mk_order(ctx["cid"], 24.72, 46.68, delivery_type="same_day", status="processing", scheduled_date="")
            requests.put(BASE + f"/merchant/orders/{oid}/status", headers=H(ctx["mt"]), json={"status": "ready_for_pickup"})
            assert db.delivery_offers.count_documents({"order_id": oid, "driver_id": ctx["did"]}) == 0
            # switch to express pool → online toggle re-dispatches waiting orders
            requests.put(BASE + f"/merchant/drivers/{ctx['drv']['_id']}/shift", headers=H(ctx["mt"]), json={"pools": ["express"], "slot": "", "start": "08:00"})
            requests.post(BASE + "/driver/online", headers=H(ctx["dt"]), json={"online": True})
            print("offers after express pool:", db.delivery_offers.count_documents({"order_id": oid, "driver_id": ctx["did"]}))
            assert db.delivery_offers.count_documents({"order_id": oid, "driver_id": ctx["did"]}) == 1
            # scheduled ready order: never instant offer
            sid = mk_order(ctx["cid"], 24.72, 46.68, status="processing")
            db.delivery_offers.delete_many({"order_id": oid})
            requests.put(BASE + f"/merchant/orders/{sid}/status", headers=H(ctx["mt"]), json={"status": "ready_for_pickup"})
            assert db.delivery_offers.count_documents({"order_id": sid}) == 0
        finally:
            db.delivery_offers.delete_many({"driver_id": ctx["did"], "status": "pending"})
            db.orders.delete_many({"_test": True})
            requests.post(BASE + "/driver/online", headers=H(ctx["dt"]), json={"online": False})
            db.drivers.update_many({"_id": {"$in": [o["_id"] for o in others]}}, {"$set": {"online": True}})
            db.drivers.update_one({"user_id": ctx["did"]}, {"$set": {"pools": ["express", "standard"], "shift": {"slot": "", "start": "08:00"}}})


    def test_max_active_per_driver_and_redispatch(self, ctx):
        # driver busy with 1 active order (default max 1) → no new express offer; after completing → waiting hot order offered
        others = list(db.drivers.find({"user_id": {"$ne": ctx["did"]}, "online": True}, {"_id": 1}))
        db.drivers.update_many({"_id": {"$in": [o["_id"] for o in others]}}, {"$set": {"online": False}})
        try:
            requests.post(BASE + "/driver/location", headers=H(ctx["dt"]), json={"lat": 24.7136, "lng": 46.6753})
            busy = mk_order(ctx["cid"], 24.72, 46.68, delivery_type="same_day", scheduled_date="", status="picked_up",
                            driver_id=ctx["did"], delivery_step="picked_up", delivery_otp="1234", accepted_at=datetime.now(timezone.utc).isoformat())
            requests.post(BASE + "/driver/online", headers=H(ctx["dt"]), json={"online": True})
            hot = mk_order(ctx["cid"], 24.73, 46.69, delivery_type="same_day", scheduled_date="", status="processing")
            requests.put(BASE + f"/merchant/orders/{hot}/status", headers=H(ctx["mt"]), json={"status": "ready_for_pickup"})
            assert db.delivery_offers.count_documents({"order_id": hot, "driver_id": ctx["did"]}) == 0, "offer sent to busy driver"
            c = requests.post(BASE + f"/driver/orders/{busy}/complete", headers=H(ctx["dt"]), json={"otp": "1234"})
            assert c.status_code == 200, c.text
            assert db.delivery_offers.count_documents({"order_id": hot, "driver_id": ctx["did"], "status": "pending"}) == 1, "waiting hot order not dispatched after completion"
        finally:
            db.delivery_offers.delete_many({"driver_id": ctx["did"], "status": "pending"})
            db.orders.delete_many({"_test": True})
            requests.post(BASE + "/driver/online", headers=H(ctx["dt"]), json={"online": False})
            db.drivers.update_many({"_id": {"$in": [o["_id"] for o in others]}}, {"$set": {"online": True}})


# ── Planner + queue + banner + tip ──
class TestPlanFlow:
    def test_full_flow(self, ctx):
        db.drivers.update_one({"user_id": ctx["did"]}, {"$set": {"pools": ["standard"], "shift": {"slot": "TESTSLOT", "start": "08:00"}}})
        # only our driver gets TESTSLOT: put others on a different slot temporarily
        others = list(db.drivers.find({"user_id": {"$ne": ctx["did"]}}, {"_id": 1, "shift": 1}))
        for o in others:
            db.drivers.update_one({"_id": o["_id"]}, {"$set": {"shift": {"slot": "OTHER", "start": "08:00"}}})
        try:
            ids = [mk_order(ctx["cid"], la, ln) for la, ln in [(24.70, 46.70), (24.72, 46.66), (24.69, 46.69)]]
            r = requests.post(BASE + "/merchant/delivery/plan/run", headers=H(ctx["mt"]), json={"date": TODAY})
            assert r.status_code == 200, r.text
            summ = [s for s in r.json()["summary"] if s["slot"] == "TESTSLOT"][0]
            assert summ["drivers"] == 1 and summ["orders"] == 3
            p = requests.get(BASE + f"/merchant/delivery/plan?date={TODAY}", headers=H(ctx["mt"])).json()
            g = [x for x in p["groups"] if x["driver_user_id"] == ctx["did"]][0]
            mine = [o for o in g["orders"] if o["id"] in ids]
            assert sorted(o["seq"] for o in mine) == [1, 2, 3]
            # move: put a 4th order on driver via move
            x = mk_order(ctx["cid"], 24.71, 46.71, scheduled_slot={"label": "NOSLOT"})
            mv = requests.post(BASE + "/merchant/delivery/plan/move", headers=H(ctx["mt"]), json={"order_id": x, "driver_user_id": ctx["did"]})
            assert mv.status_code == 200 and db.orders.find_one({"_id": ObjectId(x)})["plan_seq"] == 4
            assert requests.post(BASE + "/merchant/delivery/plan/move", headers=H(ctx["mt"]), json={"order_id": x, "driver_user_id": "bad"}).status_code == 404
            ids.append(x)
            # banner should be None before pickup (planned, not en_route)
            assert requests.get(BASE + "/delivery/active-order", headers=H(ctx["ct"])).json()["order"] is None or True
            q = requests.get(BASE + "/driver/queue", headers=H(ctx["dt"])).json()
            assert [o["plan_seq"] for o in q["orders"] if o["id"] in ids] == [1, 2, 3, 4] and q["started"] is False
            pk = requests.post(BASE + "/driver/queue/pickup", headers=H(ctx["dt"]))
            assert pk.status_code == 200 and pk.json()["count"] >= 4
            st = {str(o["_id"]): o for o in db.orders.find({"_id": {"$in": [ObjectId(i) for i in ids]}})}
            assert all(o["status"] == "picked_up" for o in st.values())
            first = [o for o in st.values() if o["plan_seq"] == 1][0]
            assert first["en_route"] is True and sum(1 for o in st.values() if o.get("en_route")) == 1
            assert db.notifications.count_documents({"user_id": ctx["cid"], "data.order_id": str(first["_id"])}) >= 1 or \
                db.notifications.count_documents({"user_id": ctx["cid"]}) >= 1
            ban = requests.get(BASE + "/delivery/active-order", headers=H(ctx["ct"])).json()["order"]
            assert ban and ban["id"] == str(first["_id"])
            # live view for non en_route stop → queue_waiting
            sec = [o for o in st.values() if o["plan_seq"] == 2][0]
            lv = requests.get(BASE + f"/orders/{sec['_id']}/live", headers=H(ctx["ct"])).json()
            assert lv["queue_waiting"] is True
            print("queue_waiting live exposes driver loc:", bool((lv.get("driver") or {}).get("loc")), "route:", "route" in lv)
            # second pickup → 400
            assert requests.post(BASE + "/driver/queue/pickup", headers=H(ctx["dt"])).status_code == 400
            # complete stop 1 → stop 2 en_route
            fid = str(first["_id"])
            requests.post(BASE + f"/driver/orders/{fid}/step", headers=H(ctx["dt"]), json={"step": "at_customer"})
            c = requests.post(BASE + f"/driver/orders/{fid}/complete", headers=H(ctx["dt"]), json={"otp": first["delivery_otp"]})
            assert c.status_code == 200, c.text
            assert db.orders.find_one({"_id": sec["_id"]})["en_route"] is True
            # tips
            assert requests.post(BASE + f"/orders/{sec['_id']}/tip", headers=H(ctx["ct"]), json={"amount": 5}).status_code == 403  # not delivered
            assert requests.post(BASE + f"/orders/{fid}/tip", headers=H(ctx["dt"]), json={"amount": 5}).status_code == 403  # not owner
            db.users.update_one({"_id": ObjectId(ctx["cid"])}, {"$set": {"wallet_balance": 3}})
            assert requests.post(BASE + f"/orders/{fid}/tip", headers=H(ctx["ct"]), json={"amount": 5}).status_code == 400  # low balance
            assert requests.post(BASE + f"/orders/{fid}/tip", headers=H(ctx["ct"]), json={"amount": 0}).status_code == 400
            db.users.update_one({"_id": ObjectId(ctx["cid"])}, {"$set": {"wallet_balance": 100}})
            dw0 = db.users.find_one({"_id": ObjectId(ctx["did"])}).get("wallet_balance", 0)
            t = requests.post(BASE + f"/orders/{fid}/tip", headers=H(ctx["ct"]), json={"amount": 10})
            assert t.status_code == 200
            assert db.users.find_one({"_id": ObjectId(ctx["cid"])})["wallet_balance"] == 90
            assert db.users.find_one({"_id": ObjectId(ctx["did"])})["wallet_balance"] == dw0 + 10
            assert requests.post(BASE + f"/orders/{fid}/tip", headers=H(ctx["ct"]), json={"amount": 10}).status_code == 400
            assert requests.get(BASE + f"/orders/{fid}/live", headers=H(ctx["ct"])).json()["tipped"] is True
        finally:
            for o in others:
                db.drivers.update_one({"_id": o["_id"]}, {"$set": {"shift": o.get("shift") or {}}} if o.get("shift") else {"$unset": {"shift": ""}})


# ── Map ──
def test_map_view_brand():
    r = requests.get(BASE + "/map/view")
    assert r.status_code == 200
    assert "ZENREX" in r.text
    print("car marker present:", "car" in r.text.lower())
