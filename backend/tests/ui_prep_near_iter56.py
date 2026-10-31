# UI prep (iter56): create a picked_up + near_notified order for customer 0500000000 (driver 0540001111). `clean` arg removes it.
import os, sys, json, requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from pymongo import MongoClient
load_dotenv('/app/backend/.env'); load_dotenv('/app/frontend/.env')
B = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/') + "/api"
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
if len(sys.argv) > 1 and sys.argv[1] == "clean":
    print(db.orders.delete_many({"_ui56": True}).deleted_count); sys.exit()
lg = lambda p, w: requests.post(B + "/auth/login", json={"phone": p, "password": w}).json()
cu, d = lg("0500000000", "test1234"), lg("0540001111", "driver1234")
oid = str(db.orders.insert_one({"user_id": cu["user"]["id"], "items": [{"name": "TEST56 UI", "quantity": 1, "price": 50}], "total": 70,
      "delivery_fee": 20, "payment_method": "card", "dest_lat": 24.69, "dest_lng": 46.685, "branch_lat": 24.71, "branch_lng": 46.67,
      "status": "picked_up", "delivery_step": "picked_up", "driver_id": d["user"]["id"], "driver_name": "محمد السائق", "delivery_otp": "5555",
      "near_notified": True, "accepted_at": datetime.now(timezone.utc).isoformat(), "created_at": datetime.now(timezone.utc).isoformat(), "_ui56": True}).inserted_id)
live = requests.get(B + f"/orders/{oid}/live", headers={"Authorization": "Bearer " + cu["token"]}).json()
print(oid, {k: live.get(k) for k in ("status", "step", "near", "otp")})
print("earnings pay:", json.dumps(requests.get(B + "/driver/earnings", headers={"Authorization": "Bearer " + d["token"]}).json()["pay"]))
