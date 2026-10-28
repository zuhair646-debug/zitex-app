"""Phase 4 helper: (race) concurrent-draw check, (seed) create TEST comp joined by customer, (clean) remove TEST_P4 data."""
import sys, os, concurrent.futures as cf, requests
from pymongo import MongoClient
from bson import ObjectId

BASE = [l.split("=", 1)[1].strip() for l in open("/app/frontend/.env") if l.startswith("EXPO_PUBLIC_BACKEND_URL=")][0].rstrip("/")
env = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
db = MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]


def login(p, pw):
    d = requests.post(f"{BASE}/api/auth/login", json={"phone": p, "password": pw}).json()
    return {"Authorization": f"Bearer {d['token']}"}, d["user"]


m, _ = login("0509999999", "merchant2025")
c, cu = login("0500000000", "test1234")


def create(title):
    cid = requests.post(f"{BASE}/api/merchant/competitions", headers=m,
                        json={"title": title, "prize": "TEST prize", "prize_count": 1}).json()["id"]
    requests.post(f"{BASE}/api/competitions/{cid}/join", headers=c)
    return cid


mode = sys.argv[1]
if mode == "race":
    cid = create("TEST_P4 race")
    with cf.ThreadPoolExecutor(8) as ex:
        codes = list(ex.map(lambda _: requests.post(f"{BASE}/api/competitions/{cid}/draw", headers=m).status_code, range(8)))
    comp = db.competitions.find_one({"_id": ObjectId(cid)})
    notes = db.notifications.count_documents({"data.competition_id": cid, "user_id": cu["id"]})
    print("codes", codes, "draw_history", len(comp.get("draw_history", [])), "winner_notifs", notes)
elif mode == "seed":
    print(create("TEST_P4 UI comp"))
elif mode == "clean":
    ids = [str(x["_id"]) for x in db.competitions.find({"title": {"$regex": "^TEST_P4"}})]
    for cid in ids:
        db.competitions.delete_one({"_id": ObjectId(cid)})
        db.competition_entries.delete_many({"competition_id": cid})
        db.notifications.delete_many({"data.competition_id": cid})
    print("cleaned", ids)
