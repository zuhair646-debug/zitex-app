# Delivery v3 retest of iteration_54 fixes: default slots, scheduled order validation, atomic tip,
# shipping not dispatched, queue/pickup filters, hidden driver loc for planned-not-en-route customers
import os
import pytest
import requests
from concurrent.futures import ThreadPoolExecutor
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
load_dotenv('/app/frontend/.env')
BASE = os.environ.get('EXPO_PUBLIC_BACKEND_URL', os.environ.get('EXPO_BACKEND_URL', '')).rstrip('/') + "/api"
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
TODAY = (datetime.now(timezone.utc) + timedelta(hours=3)).date().isoformat()
TOMORROW = (datetime.fromisoformat(TODAY) + timedelta(days=1)).date().isoformat()
OTHER_DRIVER = "0000000000000000000000aa"


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
    c["cart"] = list(db.cart_items.find({"user_id": c["cid"]}))
    c["t0"] = datetime.now(timezone.utc).isoformat()
    yield c
    ids = [str(o["_id"]) for o in db.orders.find({"$or": [{"_test": True}, {"address": "TEST_FIX addr"}]}, {"_id": 1})]
    db.orders.delete_many({"_id": {"$in": [ObjectId(i) for i in ids]}})
    db.loyalty_transactions.delete_many({"ref_id": {"$in": ids}})
    db.driver_transactions.delete_many({"$or": [{"order_id": {"$in": ids}}, {"driver_id": c["did"], "created_at": {"$gte": c["t0"]}}]})
    db.delivery_offers.delete_many({"order_id": {"$in": ids}})
    db.notifications.delete_many({"data.order_id": {"$in": ids}})
    db.users.update_one({"_id": ObjectId(c["cid"])}, {"$set": {"wallet_balance": c["wallet_c"]}})
    db.users.update_one({"_id": ObjectId(c["did"])}, {"$set": {"wallet_balance": c["wallet_d"]}})
    db.drivers.update_one({"user_id": c["did"]}, {"$set": {"cash_in_hand": 0, "online": False}})
    db.cart_items.delete_many({"user_id": c["cid"]})
    if c["cart"]:
        db.cart_items.insert_many(c["cart"])
    if c["settings"] is None:
        db.settings.delete_one({"key": "delivery"})
    else:
        db.settings.replace_one({"key": "delivery"}, c["settings"])


def mk_order(cid, **kw):
    doc = {"user_id": cid, "items": [{"name": "TEST", "quantity": 1}], "total": 50, "delivery_fee": 10, "payment_method": "card",
           "address": "TEST stop", "dest_lat": 24.72, "dest_lng": 46.68, "branch_lat": 24.7136, "branch_lng": 46.6753,
           "status": "processing", "delivery_type": "scheduled", "scheduled_date": TODAY, "scheduled_slot": {"label": "TESTSLOT"},
           "_test": True, "created_at": datetime.now(timezone.utc).isoformat()}
    doc.update(kw)
    return str(db.orders.insert_one(doc).inserted_id)


def place(ctx, date, slot):
    db.cart_items.delete_many({"user_id": ctx["cid"]})
    p = db.products.find_one({"stock": {"$gt": 5}})
    stock0 = p.get("stock")
    assert requests.post(BASE + "/cart", headers=H(ctx["ct"]), json={"product_id": str(p["_id"]), "quantity": 1}).status_code == 200
    body = {"address": "TEST_FIX addr", "phone": "0500000000", "delivery_type": "scheduled", "payment_method": "cash",
            "dest_lat": 24.72, "dest_lng": 46.68}
    if date is not None:
        body["scheduled_date"] = date
    if slot is not None:
        body["scheduled_slot"] = slot
    r = requests.post(BASE + "/orders", headers=H(ctx["ct"]), json=body)
    db.products.update_one({"_id": p["_id"]}, {"$set": {"stock": stock0}})
    db.cart_items.delete_many({"user_id": ctx["cid"]})
    return r


MORNING = {"label": "الفترة الصباحية", "start": "09:00", "end": "14:00"}


# ── Default settings (no DB doc) ──
class TestDefaults:
    def test_calc_fee_defaults(self, ctx):
        db.settings.delete_one({"key": "delivery"})
        r = requests.post(BASE + "/delivery/calculate-fee", json={"distance_km": 5, "delivery_type": "scheduled"}).json()
        labels = [s["label"] for s in r["scheduled_days"][0]["slots"]]
        assert labels == ["الفترة الصباحية", "الفترة المسائية"], labels
        assert r["scheduled_days"][0]["date"] == TOMORROW
        assert len(r["scheduled_days"]) == 3

    def test_quote_defaults(self, ctx):
        db.settings.delete_one({"key": "delivery"})
        r = requests.post(BASE + "/delivery/quote", json={"lat": 24.72, "lng": 46.68, "delivery_type": "scheduled", "item_ids": []})
        assert r.status_code == 200, r.text
        fee = r.json().get("fee", {})
        print("quote fee:", {k: fee.get(k) for k in ("delivery_type", "delivery_fee")})
        assert fee.get("delivery_type") == "scheduled"
        assert len(fee["scheduled_days"][0]["slots"]) == 2

    def test_get_settings_defaults(self):
        db.settings.delete_one({"key": "delivery"})
        s = requests.get(BASE + "/delivery/settings").json()
        assert len(s["scheduled_slots"]) == 2 and "_id" not in s


# ── POST /orders scheduled validation ──
class TestScheduledValidation:
    def test_missing_date_400(self, ctx):
        db.settings.delete_one({"key": "delivery"})
        r = place(ctx, None, MORNING)
        assert r.status_code == 400, r.text

    def test_today_not_allowed_400(self, ctx):
        r = place(ctx, TODAY, MORNING)
        assert r.status_code == 400, r.text

    def test_far_date_400(self, ctx):
        far = (datetime.fromisoformat(TODAY) + timedelta(days=10)).date().isoformat()
        assert place(ctx, far, MORNING).status_code == 400

    def test_bad_slot_400(self, ctx):
        r = place(ctx, TOMORROW, {"label": "BOGUS"})
        assert r.status_code == 400, r.text
        assert place(ctx, TOMORROW, None).status_code == 400

    def test_full_slot_409_and_clamp(self, ctx):
        s = requests.get(BASE + "/delivery/settings").json()
        s["scheduled_slots"] = [{"label": "TESTSLOT_CAP", "start": "09:00", "end": "12:00", "capacity": 1},
                                {"label": "TESTSLOT_FREE", "start": "16:00", "end": "20:00", "capacity": 0}]
        assert requests.put(BASE + "/merchant/delivery/settings", headers=H(ctx["mt"]), json=s).status_code == 200
        mk_order(ctx["cid"], scheduled_date=TOMORROW, scheduled_slot={"label": "TESTSLOT_CAP"})
        mk_order(ctx["cid"], scheduled_date=TOMORROW, scheduled_slot={"label": "TESTSLOT_CAP"})  # over capacity
        r = requests.post(BASE + "/delivery/calculate-fee", json={"distance_km": 5, "delivery_type": "scheduled"}).json()
        sl = {x["label"]: x for x in r["scheduled_days"][0]["slots"]}
        assert sl["TESTSLOT_CAP"]["remaining"] == 0 and sl["TESTSLOT_CAP"]["full"] is True
        r = place(ctx, TOMORROW, {"label": "TESTSLOT_CAP"})
        assert r.status_code == 409, r.text
        r = place(ctx, TOMORROW, {"label": "TESTSLOT_FREE", "start": "16:00", "end": "20:00"})
        assert r.status_code == 200, r.text
        db.settings.delete_one({"key": "delivery"})

    def test_valid_order_200(self, ctx):
        db.settings.delete_one({"key": "delivery"})
        r = place(ctx, TOMORROW, MORNING)
        assert r.status_code == 200, r.text
        o = db.orders.find_one({"address": "TEST_FIX addr", "scheduled_slot.label": "الفترة الصباحية"}, sort=[("_id", -1)])
        assert o["delivery_type"] == "scheduled" and o["scheduled_date"] == TOMORROW


# ── Tip atomic ──
class TestTip:
    def test_concurrent_tip_once(self, ctx):
        oid = mk_order(ctx["cid"], status="delivered", driver_id=ctx["did"], delivery_type="same_day", scheduled_date="")
        db.users.update_one({"_id": ObjectId(ctx["cid"])}, {"$set": {"wallet_balance": 100}})
        dw0 = db.users.find_one({"_id": ObjectId(ctx["did"])}).get("wallet_balance", 0)

        def go(_):
            return requests.post(BASE + f"/orders/{oid}/tip", headers=H(ctx["ct"]), json={"amount": 10}).status_code
        with ThreadPoolExecutor(8) as ex:
            codes = list(ex.map(go, range(8)))
        print("tip codes", codes)
        assert codes.count(200) == 1
        assert db.users.find_one({"_id": ObjectId(ctx["cid"])})["wallet_balance"] == 90
        assert db.users.find_one({"_id": ObjectId(ctx["did"])})["wallet_balance"] == dw0 + 10
        assert db.driver_transactions.count_documents({"order_id": oid, "type": "tip"}) == 1

    def test_low_balance_releases_lock(self, ctx):
        oid = mk_order(ctx["cid"], status="delivered", driver_id=ctx["did"], delivery_type="same_day", scheduled_date="")
        db.users.update_one({"_id": ObjectId(ctx["cid"])}, {"$set": {"wallet_balance": 3}})
        assert requests.post(BASE + f"/orders/{oid}/tip", headers=H(ctx["ct"]), json={"amount": 5}).status_code == 400
        assert "tip" not in db.orders.find_one({"_id": ObjectId(oid)})
        db.users.update_one({"_id": ObjectId(ctx["cid"])}, {"$set": {"wallet_balance": 50}})
        assert requests.post(BASE + f"/orders/{oid}/tip", headers=H(ctx["ct"]), json={"amount": 5}).status_code == 200


# ── Dispatch / queue / live ──
class TestDispatchQueueLive:
    def test_shipping_not_dispatched(self, ctx):
        others = list(db.drivers.find({"user_id": {"$ne": ctx["did"]}, "online": True}, {"_id": 1}))
        db.drivers.update_many({"_id": {"$in": [o["_id"] for o in others]}}, {"$set": {"online": False}})
        try:
            requests.post(BASE + "/driver/location", headers=H(ctx["dt"]), json={"lat": 24.7136, "lng": 46.6753})
            requests.post(BASE + "/driver/online", headers=H(ctx["dt"]), json={"online": True})
            oid = mk_order(ctx["cid"], delivery_type="shipping", scheduled_date="")
            r = requests.put(BASE + f"/merchant/orders/{oid}/status", headers=H(ctx["mt"]), json={"status": "ready_for_pickup"})
            assert r.status_code == 200, r.text
            requests.post(BASE + "/driver/online", headers=H(ctx["dt"]), json={"online": True})  # re-dispatch path
            assert db.delivery_offers.count_documents({"order_id": oid}) == 0
        finally:
            db.delivery_offers.delete_many({"driver_id": ctx["did"], "status": "pending"})
            requests.post(BASE + "/driver/online", headers=H(ctx["dt"]), json={"online": False})
            db.drivers.update_many({"_id": {"$in": [o["_id"] for o in others]}}, {"$set": {"online": True}})
            db.orders.delete_many({"_test": True})

    def test_queue_pickup_filters(self, ctx):
        base = {"planned_driver_id": ctx["did"], "plan_date": TODAY}
        ok1 = mk_order(ctx["cid"], status="ready_for_pickup", plan_seq=1, **base)
        other = mk_order(ctx["cid"], status="ready_for_pickup", plan_seq=2, driver_id=OTHER_DRIVER, **base)
        pend = mk_order(ctx["cid"], status="pending", plan_seq=3, **base)
        canc = mk_order(ctx["cid"], status="cancelled", plan_seq=4, **base)
        ok2 = mk_order(ctx["cid"], status="preparing", plan_seq=5, **base)
        try:
            r = requests.post(BASE + "/driver/queue/pickup", headers=H(ctx["dt"]))
            assert r.status_code == 200, r.text
            assert r.json()["count"] == 2, r.json()
            st = {i: db.orders.find_one({"_id": ObjectId(i)}) for i in (ok1, other, pend, canc, ok2)}
            assert st[ok1]["status"] == "picked_up" and st[ok2]["status"] == "picked_up"
            assert st[other]["driver_id"] == OTHER_DRIVER and st[other]["status"] == "ready_for_pickup"
            assert st[pend]["status"] == "pending" and st[canc]["status"] == "cancelled"
            assert st[ok1]["en_route"] is True and st[ok2]["en_route"] is False
            # live: planned not en_route → no driver loc / route ; en_route → loc
            requests.post(BASE + "/driver/location", headers=H(ctx["dt"]), json={"lat": 24.7136, "lng": 46.6753})
            lv2 = requests.get(BASE + f"/orders/{ok2}/live", headers=H(ctx["ct"])).json()
            assert lv2["queue_waiting"] is True
            assert (lv2.get("driver") or {}).get("loc") is None and "route" not in lv2
            lv1 = requests.get(BASE + f"/orders/{ok1}/live", headers=H(ctx["ct"])).json()
            print("en_route stop loc:", (lv1.get("driver") or {}).get("loc"), "route:", "route" in lv1)
            assert (lv1.get("driver") or {}).get("loc") is not None
        finally:
            db.orders.delete_many({"_test": True})


def test_zz_cleanup_settings(ctx):
    db.settings.delete_one({"key": "delivery"})
    assert db.settings.find_one({"key": "delivery"}) is None or ctx["settings"] is not None
