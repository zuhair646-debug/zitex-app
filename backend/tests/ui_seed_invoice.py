# Seed/cleanup helper for UI tests: `python ui_seed_invoice.py seed` | `python ui_seed_invoice.py clean`
import json
import sys

import requests
from bson import ObjectId
from pymongo import MongoClient


def _env(path, key):
    for line in open(path):
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip('"')


API = _env("/app/frontend/.env", "EXPO_PUBLIC_BACKEND_URL").rstrip("/") + "/api"
DB = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]
STATE = "/tmp/ui_seed_state.json"

if sys.argv[1] == "seed":
    tok = requests.post(f"{API}/auth/login", json={"phone": "0509999999", "password": "merchant2025"}).json()["token"]
    p = DB.products.find_one({"stock": {"$gte": 5}, "price": {"$gt": 0}})
    r = requests.post(f"{API}/pos/invoice", headers={"Authorization": f"Bearer {tok}"}, json={
        "items": [{"product_id": str(p["_id"]), "name": "x", "price": 0, "quantity": 1}],
        "customer_name": "TEST_UI", "customer_phone": "0500000000"}).json()
    json.dump({"inv": r["id"], "pid": str(p["_id"]), "stock": p["stock"], "in_stock": p.get("in_stock")}, open(STATE, "w"))
    print(r)
else:
    s = json.load(open(STATE))
    DB.invoices.delete_one({"_id": ObjectId(s["inv"])})
    DB.products.update_one({"_id": ObjectId(s["pid"])}, {"$set": {"stock": s["stock"], "in_stock": s["in_stock"]}})
    print("cleaned", s)
