"""Seed demo product-analytics data for the Live Preview mode."""
import asyncio, os, sys, random
from datetime import datetime, timezone, timedelta
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
db = client[os.environ.get("DB_NAME", "test_database")]

async def seed():
    prods = await db.products.find({"sku": {"$in": ["IP16PM-1TB", "IP13U-256"]}}).to_list(10)
    if not prods:
        prods = await db.products.find({}).limit(3).to_list(3)
    if not prods:
        print("❌ no products found"); return
    customers = await db.users.find({"role": "customer"}).limit(5).to_list(5)
    if len(customers) < 2:
        print("❌ need more seeded customers"); return

    now = datetime.now(timezone.utc)
    views = []
    for p in prods:
        pid = str(p["_id"])
        # ~40 mixed views over last 30 days
        for _ in range(40):
            day = random.randint(0, 29)
            hour = random.randint(0, 23)
            ts = (now - timedelta(days=day, hours=hour)).isoformat()
            uid = random.choice(customers) if random.random() < 0.7 else None
            duration = random.randint(5, 240)
            added = random.random() < 0.3
            reached = added and random.random() < 0.5
            views.append({
                "product_id": pid,
                "user_id": str(uid["_id"]) if uid else "",
                "user_name": (uid.get("name") if uid else "") or "زائر",
                "session_id": f"sess_{random.randint(1000, 9999)}",
                "duration_seconds": duration,
                "added_to_cart": added,
                "reached_checkout": reached,
                "abandoned": reached,
                "ip": f"192.168.0.{random.randint(1, 254)}",
                "created_at": ts,
            })
        # bump product view count
        await db.products.update_one({"_id": p["_id"]}, {"$inc": {"views": 40}})
    await db.product_views.delete_many({"product_id": {"$in": [str(p["_id"]) for p in prods]}})
    await db.product_views.insert_many(views)
    print(f"✅ inserted {len(views)} product views across {len(prods)} products")

if __name__ == "__main__":
    asyncio.run(seed())
