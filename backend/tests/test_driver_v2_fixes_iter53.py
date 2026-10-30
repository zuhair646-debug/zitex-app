# Iteration 53: retest of driver v2 fixes (legacy routes removed, take_order statuses, offer expiry/cancel, mark-ready guards,
# can_view perms, sequential steps, approved-only assign, Riyadh-midnight today stats) + extra edge cases
import os, threading
import pytest, requests
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv('/app/backend/.env'); load_dotenv('/app/frontend/.env')
B = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/') + "/api"
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
H = lambda t: {"Authorization": f"Bearer {t}"}


def lg(p, w):
    r = requests.post(B + "/auth/login", json={"phone": p, "password": w}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def c():
    m, d, cu = lg("0509999999", "merchant2025"), lg("0540001111", "driver1234"), lg("0500000000", "test1234")
    did, cid = d["user"]["id"], cu["user"]["id"]
    wallet0 = (db.users.find_one({"_id": ObjectId(did)}) or {}).get("wallet_balance", 0)
    db.drivers.update_one({"user_id": did}, {"$set": {"status": "approved", "online": False, "current_lat": 24.72, "current_lng": 46.68}})
    others = [x["_id"] for x in db.drivers.find({"online": True, "user_id": {"$ne": did}})]
    db.drivers.update_many({"_id": {"$in": others}}, {"$set": {"online": False}})
    db.delivery_offers.delete_many({"driver_id": did, "status": "pending"})
    ctx = {"mt": m["token"], "dt": d["token"], "ct": cu["token"], "did": did, "cid": cid}
    yield ctx
    requests.post(B + "/driver/online", headers=H(d["token"]), json={"online": False})
    ids = [str(x["_id"]) for x in db.orders.find({"_test": True})]
    db.delivery_offers.delete_many({"order_id": {"$in": ids}}); db.order_messages.delete_many({"order_id": {"$in": ids}})
    db.driver_transactions.delete_many({"order_id": {"$in": ids}})
    db.orders.delete_many({"_test": True})
    db.drivers.update_many({"_id": {"$in": others}}, {"$set": {"online": True}})
    db.drivers.update_one({"user_id": did}, {"$set": {"cash_in_hand": 0, "online": False}})
    db.users.update_one({"_id": ObjectId(did)}, {"$set": {"wallet_balance": wallet0}})
    for u in db.users.find({"phone": {"$regex": "^05999"}, "role": "driver"}):
        db.drivers.delete_many({"user_id": str(u["_id"])}); db.users.delete_one({"_id": u["_id"]})


def mk(c, status="processing", **extra):
    doc = {"user_id": c["cid"], "items": [{"name": "TEST", "quantity": 1}], "total": 50, "delivery_fee": 20, "payment_method": "cod",
           "dest_lat": 24.69, "dest_lng": 46.685, "branch_lat": 24.71, "branch_lng": 46.67, "status": status,
           "created_at": datetime.now(timezone.utc).isoformat(), "_test": True, **extra}
    return str(db.orders.insert_one(doc).inserted_id)


def assign_direct(c, step="to_store"):
    return mk(c, "assigned", driver_id=c["did"], delivery_step=step, delivery_otp="4321",
              accepted_at=datetime.now(timezone.utc).isoformat())


# Legacy server.py driver endpoints must be gone
def test_legacy_endpoints_removed(c):
    oid = mk(c, "ready_for_pickup")
    for ep in ("accept", "pickup", "deliver"):
        r = requests.post(B + f"/driver/orders/{oid}/{ep}", headers=H(c["dt"]), json={})
        assert r.status_code in (404, 405), (ep, r.status_code, r.text)
    assert db.orders.find_one({"_id": ObjectId(oid)}).get("driver_id") in (None, "")


# Expired offer (expires_at in past, loop not run yet) -> 410
def test_expired_offer_410(c):
    oid = mk(c, "ready_for_pickup")
    off = db.delivery_offers.insert_one({"order_id": oid, "driver_id": c["did"], "status": "pending", "created_at": "x",
                                         "expires_at": "2000-01-01T00:00:00+00:00"}).inserted_id
    r = requests.post(B + f"/driver/offers/{off}/accept", headers=H(c["dt"]))
    assert r.status_code == 410, r.text
    assert db.orders.find_one({"_id": ObjectId(oid)}).get("driver_id") in (None, "")
    db.delivery_offers.delete_one({"_id": off})


# Accept after cancellation -> 409; also check offer doesn't stay pending (blocks driver from new offers)
def test_accept_after_cancel_409(c):
    oid = mk(c, "cancelled")
    exp = (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat()
    off = db.delivery_offers.insert_one({"order_id": oid, "driver_id": c["did"], "status": "pending", "created_at": "x", "expires_at": exp}).inserted_id
    r = requests.post(B + f"/driver/offers/{off}/accept", headers=H(c["dt"]))
    assert r.status_code == 409, r.text
    o = db.orders.find_one({"_id": ObjectId(oid)})
    assert o["status"] == "cancelled" and not o.get("driver_id")
    st = db.delivery_offers.find_one({"_id": off})["status"]
    db.delivery_offers.delete_one({"_id": off})
    print("offer status after 409 accept:", st)
    assert st != "pending", "offer stays pending after 409 -> driver blocked from new offers until expiry"


# Offer on order reverted to processing -> 409 (take_order now requires ready_for_pickup)
def test_accept_offer_processing_409(c):
    oid = mk(c, "processing")
    exp = (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat()
    off = db.delivery_offers.insert_one({"order_id": oid, "driver_id": c["did"], "status": "pending", "created_at": "x", "expires_at": exp}).inserted_id
    r = requests.post(B + f"/driver/offers/{off}/accept", headers=H(c["dt"]))
    db.delivery_offers.delete_one({"_id": off})
    assert r.status_code == 409, r.text
    assert db.orders.find_one({"_id": ObjectId(oid)})["status"] == "processing"


# Claim on processing order -> 409
def test_claim_requires_ready(c):
    oid = mk(c, "processing")
    assert requests.post(B + f"/driver/orders/{oid}/claim", headers=H(c["dt"])).status_code == 409


# mark-ready guards
@pytest.mark.parametrize("status,extra", [("delivered", {}), ("cancelled", {}), ("assigned", {"driver_id": "x"}), ("processing", {"driver_id": "x"})])
def test_mark_ready_guard(c, status, extra):
    oid = mk(c, status, **extra)
    r = requests.post(B + f"/merchant/orders/{oid}/mark-ready", headers=H(c["mt"]))
    assert r.status_code == 409, (status, r.status_code, r.text)
    assert db.orders.find_one({"_id": ObjectId(oid)})["status"] == status


def test_mark_ready_invalid_id(c):
    r = requests.post(B + "/merchant/orders/not-an-id/mark-ready", headers=H(c["mt"]))
    assert r.status_code in (400, 404), r.status_code


# Manual assign: allowed statuses & approved-only
def test_assign_rules(c):
    ph = "0599900" + datetime.now().strftime("%S%f")[:3]
    ar = requests.post(B + "/driver/apply", json={"name": "TEST applicant", "phone": ph, "password": "pass1234", "city": "Riyadh", "vehicle": {}, "docs": {}})
    assert ar.status_code == 200, ar.text
    pend_uid = str(db.users.find_one({"phone": ph})["_id"])
    oid = mk(c, "processing")
    r = requests.post(B + f"/merchant/orders/{oid}/assign", headers=H(c["mt"]), json={"driver_user_id": pend_uid})
    assert r.status_code == 400, r.text
    oid2 = mk(c, "delivered")
    assert requests.post(B + f"/merchant/orders/{oid2}/assign", headers=H(c["mt"]), json={"driver_user_id": c["did"]}).status_code == 409
    r = requests.post(B + f"/merchant/orders/{oid}/assign", headers=H(c["mt"]), json={"driver_user_id": c["did"]})
    assert r.status_code == 200, r.text
    o = db.orders.find_one({"_id": ObjectId(oid)})
    assert o["status"] == "assigned" and o["driver_id"] == c["did"] and o.get("delivery_otp")
    # second assign -> 409
    assert requests.post(B + f"/merchant/orders/{oid}/assign", headers=H(c["mt"]), json={"driver_user_id": c["did"]}).status_code == 409


# Sequential steps
def test_step_skipping_400(c):
    oid = assign_direct(c)
    assert requests.post(B + f"/driver/orders/{oid}/step", headers=H(c["dt"]), json={"step": "picked_up"}).status_code == 400
    assert requests.post(B + f"/driver/orders/{oid}/step", headers=H(c["dt"]), json={"step": "at_customer"}).status_code == 400
    r = requests.post(B + f"/driver/orders/{oid}/step", headers=H(c["dt"]), json={"step": "at_store"})
    assert r.status_code == 200 and r.json()["step"] == "at_store"
    # going back is a no-op 200
    r = requests.post(B + f"/driver/orders/{oid}/step", headers=H(c["dt"]), json={"step": "at_store"})
    assert r.status_code == 200 and r.json()["step"] == "at_store"


# Complete without pickup (step to_store) — should be rejected if sequence is enforced end-to-end
def test_complete_requires_pickup(c):
    oid = assign_direct(c, "to_store")
    r = requests.post(B + f"/driver/orders/{oid}/complete", headers=H(c["dt"]), json={"otp": "4321"})
    print("complete from to_store:", r.status_code, r.text[:120])
    assert r.status_code in (400, 409), "driver can complete an order that was never picked up"


# Concurrent double complete must credit wallet once
def test_double_complete_single_credit(c):
    oid = assign_direct(c, "at_customer")
    db.orders.update_one({"_id": ObjectId(oid)}, {"$set": {"status": "picked_up"}})
    w0 = db.users.find_one({"_id": ObjectId(c["did"])}).get("wallet_balance", 0)
    codes = []
    def go():
        codes.append(requests.post(B + f"/driver/orders/{oid}/complete", headers=H(c["dt"]), json={"otp": "4321"}).status_code)
    ts = [threading.Thread(target=go) for _ in range(4)]
    [t.start() for t in ts]; [t.join() for t in ts]
    txs = db.driver_transactions.count_documents({"order_id": oid, "type": "delivery_earnings"})
    w1 = db.users.find_one({"_id": ObjectId(c["did"])}).get("wallet_balance", 0)
    print("codes", codes, "txs", txs, "wallet delta", w1 - w0)
    assert codes.count(200) == 1 and txs <= 1, f"double credit: codes={codes} txs={txs}"


# can_view: chamber denied, employee with 'orders' allowed, marketer denied
def test_can_view_roles(c):
    oid = assign_direct(c, "at_store")
    ch = lg("0550000000", "chamber2025")["token"]
    for ep in ("messages", "live"):
        assert requests.get(B + f"/orders/{oid}/{ep}", headers=H(ch)).status_code == 403, ep
    assert requests.post(B + f"/orders/{oid}/messages", headers=H(ch), json={"text": "TEST x"}).status_code == 403
    emp = lg("0530000001", "emp1234")["token"]
    assert requests.get(B + f"/orders/{oid}/live", headers=H(emp)).status_code == 200
    assert requests.get(B + f"/orders/{oid}/live", headers=H(emp)).json()["otp"] is None
    mk_t = lg("0530000002", "emp1234")["token"]
    assert requests.get(B + f"/orders/{oid}/messages", headers=H(mk_t)).status_code == 403


# Today stats use Riyadh midnight
def test_today_riyadh_midnight(c):
    now_r = datetime.now(timezone.utc) + timedelta(hours=3)
    mid_utc = datetime(now_r.year, now_r.month, now_r.day, tzinfo=timezone.utc) - timedelta(hours=3)
    h0 = requests.get(B + "/driver/home", headers=H(c["dt"])).json()
    mk(c, "delivered", driver_id=c["did"], driver_earnings=7, delivered_at=(mid_utc + timedelta(minutes=1)).isoformat())
    mk(c, "delivered", driver_id=c["did"], driver_earnings=3, delivered_at=(mid_utc - timedelta(minutes=1)).isoformat())
    h1 = requests.get(B + "/driver/home", headers=H(c["dt"])).json()
    assert h1["today_trips"] - h0["today_trips"] == 1 and round(h1["today_earnings"] - h0["today_earnings"], 2) == 7
    e = requests.get(B + "/driver/earnings?period=day", headers=H(c["dt"])).json()
    assert len(e["series"]) == 1 and e["series"][0]["date"] == now_r.date().isoformat()


def test_resolve_issue_invalid_id(c):
    r = requests.post(B + "/merchant/driver-issues/bad-id/resolve", headers=H(c["mt"]))
    assert r.status_code in (400, 404), r.status_code
