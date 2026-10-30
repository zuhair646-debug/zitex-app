# UI prep helper (iteration 53): isolates test driver and creates a _test processing order; `cleanup` arg restores state
import os, sys
from datetime import datetime, timezone
from dotenv import load_dotenv
from pymongo import MongoClient
load_dotenv('/app/backend/.env')
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
drv = db.users.find_one({"phone": "0540001111"}); did = str(drv["_id"])
cid = str(db.users.find_one({"phone": "0500000000"})["_id"])
if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
    ids = [str(x["_id"]) for x in db.orders.find({"_test": True})]
    db.delivery_offers.delete_many({"order_id": {"$in": ids}}); db.order_messages.delete_many({"order_id": {"$in": ids}})
    db.driver_transactions.delete_many({"order_id": {"$in": ids}})
    db.orders.delete_many({"_test": True})
    db.drivers.update_many({"_ui_off": True}, {"$set": {"online": True}, "$unset": {"_ui_off": ""}})
    db.drivers.update_one({"user_id": did}, {"$set": {"cash_in_hand": 0, "online": False}})
    print("cleaned", len(ids))
elif len(sys.argv) > 1 and sys.argv[1] == "active":
    oid = db.orders.insert_one({"user_id": cid, "items": [{"name": "TEST iPad", "quantity": 1}], "total": 80, "delivery_fee": 20,
        "payment_method": "card", "address": "TEST Olaya", "dest_lat": 24.69, "dest_lng": 46.685, "branch_lat": 24.7136, "branch_lng": 46.6753,
        "status": "picked_up", "driver_id": did, "delivery_step": "picked_up", "delivery_otp": "2468",
        "accepted_at": datetime.now(timezone.utc).isoformat(), "created_at": datetime.now(timezone.utc).isoformat(), "_test": True}).inserted_id
    print(oid)
else:
    db.drivers.update_many({"online": True, "user_id": {"$ne": did}}, {"$set": {"online": False, "_ui_off": True}})
    db.drivers.update_one({"user_id": did}, {"$set": {"status": "approved", "online": False, "current_lat": 24.72, "current_lng": 46.68}})
    db.delivery_offers.delete_many({"driver_id": did, "status": "pending"})
    oid = db.orders.insert_one({"user_id": cid, "items": [{"name": "TEST iPhone", "quantity": 1, "price": 100}], "total": 115,
        "delivery_fee": 20, "payment_method": "cod", "address": "TEST حي العليا", "phone": "0500000000", "dest_lat": 24.69, "dest_lng": 46.685,
        "branch_lat": 24.7136, "branch_lng": 46.6753, "status": "processing", "created_at": datetime.now(timezone.utc).isoformat(), "_test": True}).inserted_id
    print(oid)
