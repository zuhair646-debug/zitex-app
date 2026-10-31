# Iteration 56: driver pay models (commission/salary/per_km) via merchant PUT, earnings `pay` object,
# near-arrival notification (once), map view brand flag
import os, time
import pytest, requests
from bson import ObjectId
from datetime import datetime, timezone
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv('/app/backend/.env'); load_dotenv('/app/frontend/.env')
B = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/') + "/api"
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
H = lambda t: {"Authorization": f"Bearer {t}"}
PAY_KEYS = ["vehicle_info", "payment_model", "salary_monthly", "bonus_threshold_orders", "bonus_per_extra_order", "driver_km_rate",
            "driver_base_fare", "commission_type", "merchant_commission_value"]


def lg(p, w):
    r = requests.post(B + "/auth/login", json={"phone": p, "password": w}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def c():
    m, d, cu = lg("0509999999", "merchant2025"), lg("0540001111", "driver1234"), lg("0500000000", "test1234")
    did, cid = d["user"]["id"], cu["user"]["id"]
    drv = db.drivers.find_one({"user_id": did})
    orig = {k: drv.get(k) for k in PAY_KEYS}
    uname = db.users.find_one({"_id": ObjectId(did)})["name"]
    wallet0 = (db.users.find_one({"_id": ObjectId(did)}) or {}).get("wallet_balance", 0)
    db.drivers.update_one({"user_id": did}, {"$set": {"status": "approved", "online": False, "current_lat": 24.72, "current_lng": 46.68}})
    others = [x["_id"] for x in db.drivers.find({"online": True, "user_id": {"$ne": did}})]
    db.drivers.update_many({"_id": {"$in": others}}, {"$set": {"online": False}})
    db.delivery_offers.delete_many({"driver_id": did, "status": "pending"})
    ctx = {"mt": m["token"], "dt": d["token"], "ct": cu["token"], "did": did, "cid": cid, "drv_id": str(drv["_id"]),
           "phone": "0540001111", "name": uname}
    yield ctx
    requests.post(B + "/driver/online", headers=H(d["token"]), json={"online": False})
    ids = [str(x["_id"]) for x in db.orders.find({"_test56": True})]
    db.delivery_offers.delete_many({"order_id": {"$in": ids}})
    db.driver_transactions.delete_many({"order_id": {"$in": ids}})
    db.notifications.delete_many({"data.order_id": {"$in": ids}})
    db.orders.delete_many({"_test56": True})
    db.drivers.update_many({"_id": {"$in": others}}, {"$set": {"online": True}})
    db.drivers.update_one({"user_id": did}, {"$set": {**{k: v for k, v in orig.items() if v is not None}, "online": False}})
    unset = {k: "" for k, v in orig.items() if v is None}
    if unset:
        db.drivers.update_one({"user_id": did}, {"$unset": unset})
    db.users.update_one({"_id": ObjectId(did)}, {"$set": {"wallet_balance": wallet0, "name": uname}})
    for u in db.users.find({"phone": "0599956000"}):
        db.drivers.delete_many({"user_id": str(u["_id"])}); db.users.delete_one({"_id": u["_id"]})


def mk(c, status="processing", **extra):
    doc = {"user_id": c["cid"], "items": [{"name": "TEST56", "quantity": 1}], "total": 50, "delivery_fee": 20, "payment_method": "card",
           "dest_lat": 24.69, "dest_lng": 46.685, "branch_lat": 24.71, "branch_lng": 46.67, "status": status,
           "created_at": datetime.now(timezone.utc).isoformat(), "_test56": True, **extra}
    return str(db.orders.insert_one(doc).inserted_id)


def put_model(c, **kw):
    body = {"name": c["name"], "phone": c["phone"], "vehicle_info": "Toyota Hilux 2022", **kw}
    r = requests.put(B + f"/merchant/drivers/{c['drv_id']}", headers=H(c["mt"]), json=body)
    assert r.status_code == 200, r.text


def complete_one(c, **extra):
    oid = mk(c, "picked_up", driver_id=c["did"], delivery_step="picked_up", delivery_otp="4321",
             accepted_at=datetime.now(timezone.utc).isoformat(), **extra)
    w0 = db.users.find_one({"_id": ObjectId(c["did"])}).get("wallet_balance", 0)
    r = requests.post(B + f"/driver/orders/{oid}/complete", headers=H(c["dt"]), json={"otp": "4321"})
    assert r.status_code == 200, r.text
    w1 = db.users.find_one({"_id": ObjectId(c["did"])}).get("wallet_balance", 0)
    return oid, r.json()["earnings"], round(w1 - w0, 2)


def offer_est(c, **extra):
    oid = mk(c, "processing", **extra)
    requests.post(B + "/driver/online", headers=H(c["dt"]), json={"online": True})
    r = requests.post(B + f"/merchant/orders/{oid}/mark-ready", headers=H(c["mt"]))
    assert r.status_code == 200, r.text
    off = db.delivery_offers.find_one({"order_id": oid, "driver_id": c["did"]})
    assert off, f"no offer created: {r.text}"
    db.delivery_offers.update_one({"_id": off["_id"]}, {"$set": {"status": "cancelled"}})
    requests.post(B + "/driver/online", headers=H(c["dt"]), json={"online": False})
    db.orders.update_one({"_id": ObjectId(oid)}, {"$set": {"status": "cancelled"}})
    return off["est_earning"]


# PUT driver: 404 unknown id, persists new fields + name
def test_put_driver_404_and_persist(c):
    r = requests.put(B + f"/merchant/drivers/{ObjectId()}", headers=H(c["mt"]), json={"name": "x", "phone": "1"})
    assert r.status_code == 404
    r = requests.put(B + "/merchant/drivers/bad-id", headers=H(c["mt"]), json={"name": "x", "phone": "1"})
    assert r.status_code == 404
    put_model(c, payment_model="per_km", driver_km_rate=1.5, driver_base_fare=3, name=c["name"] + " T")
    d = db.drivers.find_one({"user_id": c["did"]})
    assert d["payment_model"] == "per_km" and d["driver_km_rate"] == 1.5 and d["driver_base_fare"] == 3
    assert db.users.find_one({"_id": ObjectId(c["did"])})["name"] == c["name"] + " T"
    assert db.users.find_one({"_id": ObjectId(c["did"])})["phone"] == c["phone"]
    lst = requests.get(B + "/merchant/drivers", headers=H(c["mt"])).json()
    me = [x for x in lst if x["user_id"] == c["did"]][0]
    assert me["payment_model"] == "per_km" and me["driver_km_rate"] == 1.5
    put_model(c, payment_model="commission")  # restore name


# POST driver accepts new fields
def test_create_driver_new_fields(c):
    r = requests.post(B + "/merchant/drivers", headers=H(c["mt"]), json={"name": "TEST56 drv", "phone": "0599956000", "password": "x12345",
                                                                          "payment_model": "per_km", "driver_km_rate": 2.25, "driver_base_fare": 4})
    assert r.status_code == 200, r.text
    d = db.drivers.find_one({"user_id": r.json()["id"]})
    assert d["payment_model"] == "per_km" and d["driver_km_rate"] == 2.25 and d["driver_base_fare"] == 4


# Commission fixed / percentage: est_earning on offer + /complete earnings + wallet
def test_commission_fixed(c):
    put_model(c, payment_model="commission", commission_type="fixed", merchant_commission_value=5)
    assert offer_est(c) == 15
    _, e, dw = complete_one(c)
    assert e == 15 and dw == 15


def test_commission_percentage(c):
    put_model(c, payment_model="commission", commission_type="percentage", merchant_commission_value=25)
    assert offer_est(c) == 15
    oid, e, dw = complete_one(c, delivery_fee=40)
    assert e == 30 and dw == 30
    o = db.orders.find_one({"_id": ObjectId(oid)})
    assert o["driver_earnings"] == 30 and o["merchant_cut"] == 10


# Salary: 0 below threshold, bonus above
def test_salary_threshold(c):
    n = requests.get(B + "/driver/earnings", headers=H(c["dt"])).json()["pay"]["today_trips"]
    put_model(c, payment_model="salary", salary_monthly=3000, bonus_threshold_orders=n + 5, bonus_per_extra_order=4)
    assert offer_est(c) == 0
    _, e, dw = complete_one(c)
    assert e == 0 and dw == 0
    put_model(c, payment_model="salary", salary_monthly=3000, bonus_threshold_orders=n + 1, bonus_per_extra_order=4)  # n+1 done now
    assert offer_est(c) == 4
    _, e, dw = complete_one(c)
    assert e == 4 and dw == 4
    p = requests.get(B + "/driver/earnings", headers=H(c["dt"])).json()["pay"]
    assert p["model"] == "salary" and p["salary_monthly"] == 3000 and p["bonus_per_extra_order"] == 4
    assert p["bonus_threshold_orders"] == n + 1 and p["today_trips"] == n + 2


# per_km: distance_km present + haversine fallback
def test_per_km(c):
    put_model(c, payment_model="per_km", driver_km_rate=1.5, driver_base_fare=3)
    _, e, dw = complete_one(c, distance_km=10)
    assert e == 18 and dw == 18
    # haversine (24.71,46.67)->(24.69,46.685) ≈ 2.65km *1.3 ≈ 3.44 → 3 + 1.5*3.44 ≈ 8.16
    est = offer_est(c)
    assert 7.5 < est < 9, est
    _, e, _ = complete_one(c)
    assert 7.5 < e < 9, e
    p = requests.get(B + "/driver/earnings", headers=H(c["dt"])).json()["pay"]
    for k in ["model", "today_trips", "month_trips", "month_earnings", "salary_monthly", "bonus_threshold_orders",
              "bonus_per_extra_order", "driver_km_rate", "driver_base_fare", "commission_type", "merchant_commission_value"]:
        assert k in p, k
    assert p["model"] == "per_km" and p["driver_km_rate"] == 1.5 and p["driver_base_fare"] == 3
    assert p["month_trips"] >= p["today_trips"] >= 1


# Near notification: not when far / not at_store; fires once when ETA<=180s on picked_up
def test_near_notification_once(c):
    oid = mk(c, "picked_up", driver_id=c["did"], delivery_step="picked_up", delivery_otp="1111",
             accepted_at=datetime.now(timezone.utc).isoformat())
    oid2 = mk(c, "assigned", driver_id=c["did"], delivery_step="at_store", delivery_otp="1111",
              accepted_at="2000-01-01T00:00:00+00:00")
    loc = lambda lat, lng, sp=0: requests.post(B + "/driver/location", headers=H(c["dt"]), json={"lat": lat, "lng": lng, "heading": 0, "speed": sp})
    assert loc(24.80, 46.70, 10).status_code == 200  # ~12km away → no
    assert not db.orders.find_one({"_id": ObjectId(oid)}).get("near_notified")
    r = requests.get(B + "/delivery/active-order", headers=H(c["ct"])).json()["order"]
    assert r["id"] == oid and r["near"] is False
    assert loc(24.695, 46.685, 0).status_code == 200  # 0.55km*1300/8.3 ≈ 87s → yes
    o = db.orders.find_one({"_id": ObjectId(oid)})
    assert o.get("near_notified") is True
    assert not db.orders.find_one({"_id": ObjectId(oid2)}).get("near_notified")
    loc(24.692, 46.685, 0); loc(24.691, 46.685, 5)
    ns = list(db.notifications.find({"data.order_id": oid, "data.type": "order_near"}))
    assert len(ns) == 1, len(ns)
    assert ns[0]["user_id"] == c["cid"]
    assert requests.get(B + "/delivery/active-order", headers=H(c["ct"])).json()["order"]["near"] is True
    assert requests.get(B + f"/orders/{oid}/live", headers=H(c["ct"])).json()["near"] is True
    db.orders.update_many({"_test56": True, "status": {"$in": ["assigned", "picked_up"]}}, {"$set": {"status": "cancelled"}})


# Map view brand flag + embedded logo + car svg
def test_map_view_brand():
    h1 = requests.get(B + "/map/view?brand=1").text
    h0 = requests.get(B + "/map/view?brand=0").text
    assert "data:image/png;base64," in h1 and "__LOGO__" not in h1 and "__BRAND__" not in h1
    assert h1 != h0
    assert "<svg" in h1.lower()
