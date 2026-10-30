# UI prep for delivery v3: planned scheduled orders for driver 0540001111 today (customer 0500000000). Usage: python ui_prep_delivery_v3.py [seed|clean|deliver]
import os, sys
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
TODAY = (datetime.now(timezone.utc) + timedelta(hours=3)).date().isoformat()
did = str(db.users.find_one({"phone": "0540001111"})["_id"])
cid = str(db.users.find_one({"phone": "0500000000"})["_id"])
cmd = sys.argv[1] if len(sys.argv) > 1 else "seed"
if cmd == "seed":
    for i, (la, ln) in enumerate([(24.70, 46.70), (24.72, 46.66)], start=1):
        print(db.orders.insert_one({"user_id": cid, "items": [{"name": "TEST UI", "quantity": 1}], "total": 50, "delivery_fee": 10,
            "payment_method": "card", "address": f"TEST UI stop {i}", "dest_lat": la, "dest_lng": ln, "branch_lat": 24.7136,
            "branch_lng": 46.6753, "status": "processing", "delivery_type": "scheduled", "scheduled_date": TODAY,
            "scheduled_slot": {"label": "صباحاً 9 - 12"}, "planned_driver_id": did, "planned_driver_name": "Driver", "plan_seq": i,
            "plan_date": TODAY, "_test": True, "created_at": datetime.now(timezone.utc).isoformat()}).inserted_id)
elif cmd == "tomorrow":
    tm = (datetime.fromisoformat(TODAY) + timedelta(days=1)).date().isoformat()
    for i, (la, ln) in enumerate([(24.70, 46.70), (24.75, 46.60), (24.65, 46.75)], start=1):
        print(db.orders.insert_one({"user_id": cid, "items": [{"name": "TEST UI", "quantity": 1}], "total": 50, "delivery_fee": 10,
            "payment_method": "card", "address": f"TEST UI tomorrow {i}", "dest_lat": la, "dest_lng": ln, "branch_lat": 24.7136,
            "branch_lng": 46.6753, "status": "processing", "delivery_type": "scheduled", "scheduled_date": tm,
            "scheduled_slot": {"label": "صباحاً 9 - 12"}, "_test": True, "created_at": datetime.now(timezone.utc).isoformat()}).inserted_id)
elif cmd == "deliver":
    o = db.orders.find_one({"_test": True, "en_route": True})
    db.orders.update_one({"_id": o["_id"]}, {"$set": {"status": "delivered", "delivered_at": datetime.now(timezone.utc).isoformat()}})
    print("delivered", o["_id"])
else:
    ids = [str(o["_id"]) for o in db.orders.find({"_test": True}, {"_id": 1})]
    db.orders.delete_many({"_test": True})
    db.driver_transactions.delete_many({"order_id": {"$in": ids}})
    db.drivers.update_one({"user_id": did}, {"$set": {"cash_in_hand": 0, "online": False, "pools": ["express", "standard"], "shift": {"slot": "", "start": "08:00"}}})
    print("cleaned", len(ids))
