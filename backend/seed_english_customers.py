"""Add English-named customers and give them some existing orders, so merchants can test
translating Latin names. Idempotent. Usage: ENV_PATH=... python seed_english_customers.py"""
import os, random
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
from dotenv import load_dotenv
import bcrypt

load_dotenv(os.environ.get('ENV_PATH', '/app/backend/.env'), override=True)
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
PEOPLE = [("John Smith", "0501234519"), ("Emily Johnson", "0501234520"), ("Michael Brown", "0501234521"),
          ("Sarah Williams", "0501234522"), ("David Miller", "0501234523")]
pw = bcrypt.hashpw(b"test1234", bcrypt.gensalt()).decode()
ids = []
for name, phone in PEOPLE:
    u = db.users.find_one({"phone": phone})
    if not u:
        uid = db.users.insert_one({
            "name": name, "phone": phone, "email": f"{phone}@zenrex.demo", "password_hash": pw, "role": "user",
            "points": random.randint(100, 3000), "wallet_balance": 0,
            "created_at": (datetime.now(timezone.utc) - timedelta(days=random.randint(5, 200))).isoformat()}).inserted_id
    else:
        uid = u["_id"]
    ids.append((str(uid), name))
already = db.orders.count_documents({"customer_name": {"$in": [n for _, n in PEOPLE]}})
if already < 10:
    orders = list(db.orders.find({}, {"_id": 1}).sort("created_at", -1).limit(15))
    for i, o in enumerate(orders):
        uid, name = ids[i % len(ids)]
        db.orders.update_one({"_id": o["_id"]}, {"$set": {"user_id": uid, "user_name": name, "customer_name": name}})
print("english customers:", len(ids), "orders assigned:", db.orders.count_documents({"customer_name": {"$in": [n for _, n in PEOPLE]}}))
