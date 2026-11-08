# UI prep iter66: create a TEST_ experience update crossposted to social (merchant). Usage: python ui_seed_iter66.py [create|clean <uid>]
import os, sys, requests, asyncio
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
load_dotenv('/app/frontend/.env'); load_dotenv('/app/backend/.env')
B = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/')
async def dbrun(f):
    c = AsyncIOMotorClient(os.environ['MONGO_URL']); r = await f(c[os.environ['DB_NAME']]); c.close(); return r
if sys.argv[1] == 'create':
    t = requests.post(f"{B}/api/auth/login", json={"phone": "0509999999", "password": "merchant2025"}).json()['token']
    b = asyncio.run(dbrun(lambda db: db.service_bookings.find_one({"service_id": {"$nin": ["", None]}})))
    r = requests.post(f"{B}/api/services/updates", headers={"Authorization": f"Bearer {t}"}, json={"booking_id": str(b["_id"]),
        "video_url": "https://www.w3schools.com/html/mov_bbb.mp4", "caption": "TEST_iter66 UI", "is_public_experience": True, "crosspost_to_social": True}).json()
    up = asyncio.run(dbrun(lambda db: db.service_updates.find_one({"_id": ObjectId(r['id'])})))
    print("UID", r['id'], "POST", up.get('social_post_id'), "SVC", up.get('service_id'))
else:
    uid = sys.argv[2]
    async def clean(db):
        await db.social_posts.delete_many({"service_update_id": uid}); await db.service_updates.delete_one({"_id": ObjectId(uid)})
    asyncio.run(dbrun(clean)); print("cleaned", uid)
