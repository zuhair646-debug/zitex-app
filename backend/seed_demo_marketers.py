"""Seed demo marketers: 2 pending applications + 2 approved marketers with real conversions."""
import asyncio, os, sys, random
from datetime import datetime, timezone, timedelta
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
db = client[os.environ.get("DB_NAME", "test_database")]

async def seed():
    m = await db.users.find_one({"phone": "0509999999"})
    c = await db.users.find_one({"phone": "0500000000"})
    if not m or not c:
        print("❌ merchant/customer not seeded")
        return
    mid = str(m["_id"]); cid = str(c["_id"])
    now = datetime.now(timezone.utc)

    # ─── Seed a couple of extra customer users (for pending applications) ───
    extra = [
        {"phone":"0500000001","name":"سالم الحربي","role":"customer","password":"$2b$12$demo","city":"الرياض","created_at":now.isoformat()},
        {"phone":"0500000002","name":"فاطمة العتيبي","role":"customer","password":"$2b$12$demo","city":"جدة","created_at":now.isoformat()},
        {"phone":"0500000003","name":"عبدالله القحطاني","role":"customer","password":"$2b$12$demo","city":"الدمام","created_at":now.isoformat()},
    ]
    for u in extra:
        await db.users.update_one({"phone": u["phone"]}, {"$setOnInsert": u}, upsert=True)
    users = {u["phone"]: (await db.users.find_one({"phone": u["phone"]})) for u in extra}

    # ─── Reset old demo affiliate data ───
    await db.affiliate_applications.delete_many({"merchant_id": mid})
    await db.affiliates.delete_many({"merchant_id": mid})
    await db.affiliate_conversions.delete_many({"merchant_id": mid})

    # ─── 2 PENDING applications ───
    pending = [
        {"user_id": str(users["0500000003"]["_id"]), "merchant_id": mid,
         "applicant_name":"عبدالله القحطاني","applicant_phone":"0500000003",
         "applicant_city":"الدمام","social_handle":"@abdullah_gadgets",
         "audience_size":18500,"note":"عندي متابعين مهتمين بالتكنولوجيا وأنشر مراجعات على تويتر و انستقرام.",
         "status":"pending","created_at":(now - timedelta(hours=6)).isoformat()},
        {"user_id": str(users["0500000002"]["_id"]), "merchant_id": mid,
         "applicant_name":"فاطمة العتيبي","applicant_phone":"0500000002",
         "applicant_city":"جدة","social_handle":"@fatima.reviews",
         "audience_size":42000,"note":"متخصصة في مراجعة جوالات النساء والإكسسوارات.",
         "status":"pending","created_at":(now - timedelta(hours=2)).isoformat()},
    ]
    await db.affiliate_applications.insert_many(pending)
    print(f"✅ {len(pending)} pending applications")

    # ─── 2 APPROVED marketers with real conversions ───
    approved = [
        {"user_id": cid, "user_name": c.get("name","محمد"), "user_phone": c.get("phone"),
         "merchant_id": mid, "campaign_id": "",
         "referral_code": "ZTX-MOHD", "commission_percent": 8, "active": True,
         "total_clicks": 245, "total_conversions": 12, "total_sales": 8940.0, "total_earnings": 715.20,
         "created_at": (now - timedelta(days=45)).isoformat(),
         "last_activity": (now - timedelta(days=1)).isoformat()},
        {"user_id": str(users["0500000001"]["_id"]), "user_name": "سالم الحربي", "user_phone": "0500000001",
         "merchant_id": mid, "campaign_id": "",
         "referral_code": "ZTX-SALEM", "commission_percent": 10, "active": True,
         "total_clicks": 128, "total_conversions": 6, "total_sales": 4320.0, "total_earnings": 432.0,
         "created_at": (now - timedelta(days=20)).isoformat(),
         "last_activity": (now - timedelta(hours=8)).isoformat()},
    ]
    r = await db.affiliates.insert_many(approved)
    aff_ids = [str(x) for x in r.inserted_ids]
    print(f"✅ {len(approved)} approved marketers")

    # ─── Recent conversions for each (spread across 30 days) ───
    conversions = []
    products = ["iPhone 16 Pro Max","AirPods Pro 2","MagSafe Charger","Apple Watch Series 10","iPhone 13 مستخدم"]
    for i, aff in enumerate(approved):
        aff_id = aff_ids[i]
        for j in range(aff["total_conversions"]):
            day_off = random.randint(0, 29)
            sale = random.choice([399,599,899,1499,2999,5599])
            earn = round(sale * aff["commission_percent"] / 100.0, 2)
            conversions.append({
                "affiliate_id": aff_id, "marketer_id": aff["user_id"],
                "marketer_name": aff["user_name"], "merchant_id": mid,
                "customer_id": f"guest_{i}_{j}", "customer_name": f"عميل {j+1}",
                "order_id": f"demo_{i}_{j}", "referral_code": aff["referral_code"],
                "order_subtotal": sale, "commission_percent": aff["commission_percent"],
                "earning": earn, "status": "confirmed",
                "product_name": random.choice(products),
                "created_at": (now - timedelta(days=day_off, hours=random.randint(0,23))).isoformat(),
            })
    await db.affiliate_conversions.insert_many(conversions)
    print(f"✅ {len(conversions)} conversions")
    print("\n🎉 Marketer demo seed complete. Login as merchant (0509999999/merchant2025) → التسويق → المسوقون tab")

if __name__ == "__main__":
    asyncio.run(seed())
