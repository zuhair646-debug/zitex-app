# Delivery edge cases: mark-ready on delivered order, accept offer after cancellation, pending driver manual assign
import os, time
import requests
from bson import ObjectId
from datetime import datetime, timezone
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv('/app/backend/.env'); load_dotenv('/app/frontend/.env')
B = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/') + "/api"
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
H = lambda t: {"Authorization": f"Bearer {t}"}
lg = lambda p, w: requests.post(B + "/auth/login", json={"phone": p, "password": w}).json()


def _order(cid, status):
    return str(db.orders.insert_one({"user_id": cid, "items": [{"name": "TEST", "quantity": 1}], "total": 50, "delivery_fee": 10,
        "payment_method": "cod", "dest_lat": 24.69, "dest_lng": 46.685, "branch_lat": 24.71, "branch_lng": 46.67,
        "status": status, "created_at": datetime.now(timezone.utc).isoformat(), "_test": True}).inserted_id)


def test_edge_cases():
    m, d, c = lg("0509999999", "merchant2025"), lg("0540001111", "driver1234"), lg("0500000000", "test1234")
    did, cid = d["user"]["id"], c["user"]["id"]
    db.drivers.update_one({"user_id": did}, {"$set": {"status": "approved"}})
    others = [x["_id"] for x in db.drivers.find({"online": True, "user_id": {"$ne": did}})]
    db.drivers.update_many({"_id": {"$in": others}}, {"$set": {"online": False}})
    res = {}
    try:
        # 2. accept offer after order cancelled
        requests.post(B + "/driver/online", headers=H(d["token"]), json={"online": True})
        o2 = _order(cid, "processing")
        r = requests.post(B + f"/merchant/orders/{o2}/mark-ready", headers=H(m["token"])).json()
        if "offer_id" in r:
            db.orders.update_one({"_id": ObjectId(o2)}, {"$set": {"status": "cancelled"}})
            a = requests.post(B + f"/driver/offers/{r['offer_id']}/accept", headers=H(d["token"]))
            res["accept_after_cancel"] = (a.status_code, db.orders.find_one({"_id": ObjectId(o2)})["status"])
        # 3. accept an offer whose expires_at passed but loop hasn't run yet
        o3 = _order(cid, "processing")
        r = requests.post(B + f"/merchant/orders/{o3}/mark-ready", headers=H(m["token"])).json()
        if "offer_id" in r:
            db.delivery_offers.update_one({"_id": ObjectId(r["offer_id"])}, {"$set": {"expires_at": "2000-01-01T00:00:00+00:00"}})
            a = requests.post(B + f"/driver/offers/{r['offer_id']}/accept", headers=H(d["token"]))
            res["accept_expired_before_loop"] = a.status_code
        # 1. mark-ready on a delivered order
        o1 = _order(cid, "delivered")
        requests.post(B + f"/merchant/orders/{o1}/mark-ready", headers=H(m["token"]))
        res["mark_ready_on_delivered_status"] = db.orders.find_one({"_id": ObjectId(o1)})["status"]
    finally:
        requests.post(B + "/driver/online", headers=H(d["token"]), json={"online": False})
        ids = [str(x["_id"]) for x in db.orders.find({"_test": True})]
        db.delivery_offers.delete_many({"order_id": {"$in": ids}})
        db.orders.delete_many({"_test": True})
        db.drivers.update_many({"_id": {"$in": others}}, {"$set": {"online": True}})
        db.drivers.update_one({"user_id": did}, {"$set": {"cash_in_hand": 0, "online": False}})
    print("EDGE RESULTS:", res)
