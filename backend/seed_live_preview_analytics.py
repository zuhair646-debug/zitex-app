"""Seed rich analytics data for Live Preview.

Creates:
- 100+ orders (mix of POS invoices and online orders) spread over the last 90 days.
- 50+ social post views/likes/comments/poll votes.
- 15 richer competitions with sources tracked (link/organic/push) + participants.
- 30+ service bookings with reviews.
Idempotent when possible.
"""

import asyncio
import os
import random
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

load_dotenv()

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "techstore")

CITIES = ["الرياض", "جدة", "الدمام", "الخبر", "مكة", "المدينة", "الطائف", "أبها", "تبوك", "بريدة"]
FIRST = ["أحمد", "خالد", "سعيد", "فهد", "محمد", "علي", "سالم", "عبدالله", "ياسر", "بندر", "نايف", "طلال", "ماجد", "سلطان", "ريان"]
LAST = ["السبيعي", "القحطاني", "الشمري", "الغامدي", "العتيبي", "الحربي", "الدوسري", "المطيري", "الشهراني", "البلوي"]

def rand_name():
    return f"{random.choice(FIRST)} {random.choice(LAST)}"

def rand_phone():
    return "05" + "".join(str(random.randint(0, 9)) for _ in range(8))

def rand_time_within_days(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(
        days=random.randint(0, days), hours=random.randint(0, 23), minutes=random.randint(0, 59)
    )


async def main():
    db = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    print(f"Connected to {DB_NAME}")

    branches = await db.branches.find({}).to_list(50)
    products = await db.products.find({}).to_list(500)
    services = await db.services.find({}).to_list(200)
    users = await db.users.find({"role": "customer"}).to_list(200)
    posts = await db.social_posts.find({}).to_list(100)

    if not products:
        print("No products - abort")
        return
    if not users:
        # Create some fake customer users for reference
        for _ in range(20):
            phone = rand_phone()
            await db.users.update_one(
                {"phone": phone},
                {"$setOnInsert": {
                    "name": rand_name(),
                    "phone": phone,
                    "city": random.choice(CITIES),
                    "role": "customer",
                    "email": f"user{phone[-4:]}@example.com",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
        users = await db.users.find({"role": "customer"}).to_list(200)

    print(f"products={len(products)} branches={len(branches)} services={len(services)} users={len(users)} posts={len(posts)}")

    # ─── 1) Clear old fake demo data flagged with `demo_seed: true` ───
    await db.invoices.delete_many({"demo_seed": True})
    await db.orders.delete_many({"demo_seed": True})
    print("Cleaned old demo data")

    # ─── 2) Seed ~120 POS invoices + ~80 online orders across last 90 days ───
    invoices_inserted = 0
    orders_inserted = 0
    for i in range(120):
        prod = random.choice(products)
        b = random.choice(branches) if branches else None
        qty = random.choices([1, 1, 1, 2, 2, 3], k=1)[0]
        unit = float(prod.get("price") or random.randint(50, 3000))
        created = rand_time_within_days(90)
        doc = {
            "items": [{"product_id": str(prod["_id"]), "name": prod.get("name_ar", "منتج"), "price": unit, "quantity": qty}],
            "customer_name": rand_name(),
            "customer_phone": rand_phone(),
            "payment_method": random.choice(["cash", "card", "mada", "transfer"]),
            "branch_id": str(b["_id"]) if b else "",
            "subtotal": unit * qty,
            "vat_percent": 15,
            "vat_amount": round(unit * qty * 0.15, 2),
            "discount": 0,
            "total": round(unit * qty * 1.15, 2),
            "created_at": created.isoformat(),
            "demo_seed": True,
        }
        await db.invoices.insert_one(doc)
        invoices_inserted += 1

    for i in range(80):
        prod = random.choice(products)
        b = random.choice(branches) if branches else None
        qty = random.choices([1, 1, 1, 2, 2, 3, 4], k=1)[0]
        unit = float(prod.get("price") or random.randint(50, 3000))
        u = random.choice(users)
        created = rand_time_within_days(90)
        doc = {
            "user_id": str(u["_id"]),
            "customer_name": u.get("name", rand_name()),
            "customer_phone": u.get("phone", rand_phone()),
            "items": [{"product_id": str(prod["_id"]), "name": prod.get("name_ar", "منتج"), "price": unit, "quantity": qty}],
            "branch_id": str(b["_id"]) if b else "",
            "subtotal": unit * qty,
            "total": round(unit * qty * 1.15, 2),
            "status": random.choice(["pending", "confirmed", "delivered", "delivered", "delivered"]),
            "payment_method": random.choice(["cod", "card", "bank_transfer"]),
            "delivery_type": random.choice(["home_delivery", "branch_pickup", "home_delivery"]),
            "created_at": created.isoformat(),
            "demo_seed": True,
        }
        await db.orders.insert_one(doc)
        orders_inserted += 1

    print(f"Invoices seeded: {invoices_inserted}, Orders seeded: {orders_inserted}")

    # ─── 3) Enrich social posts: views, likes, comments, poll votes ───
    posts_updated = 0
    for post in posts:
        pid = str(post["_id"])
        # add viewers
        viewers = post.get("viewers", [])
        want_viewers = random.randint(30, 200)
        new_viewers = [
            {"user_id": str(random.choice(users)["_id"]), "user_name": rand_name(),
             "user_city": random.choice(CITIES), "viewed_at": rand_time_within_days(30).isoformat()}
            for _ in range(want_viewers)
        ]
        viewers.extend(new_viewers)
        # likes
        likers = post.get("likers", [])
        want_likes = random.randint(10, min(80, want_viewers))
        new_likers = [
            {"user_id": str(random.choice(users)["_id"]), "user_name": rand_name(),
             "user_city": random.choice(CITIES), "liked_at": rand_time_within_days(20).isoformat()}
            for _ in range(want_likes)
        ]
        likers.extend(new_likers)
        # comments
        existing_comments = post.get("comments", [])
        if not isinstance(existing_comments, list):
            existing_comments = []
        want_comments = random.randint(3, 12)
        sample_texts = [
            "منتج رائع، شكراً!", "متى ينزل جديدكم؟", "عندي مشكلة، ممكن أتواصل معكم؟",
            "الأسعار حلوة", "توصلون الدمام؟", "الجودة ممتازة", "مسابقة قريبة؟",
            "ياليت خدمة الصيانة تشمل مدينتنا", "الله يعطيكم العافية 🌹", "متى الخصومات؟",
            "شكراً على الرد السريع", "هل يوجد ضمان؟", "أفضل متجر تعاملت معه"
        ]
        for _ in range(want_comments):
            u = random.choice(users)
            c = {
                "id": str(ObjectId()),
                "user_id": str(u["_id"]),
                "user_name": u.get("name", rand_name()),
                "user_city": u.get("city", random.choice(CITIES)),
                "text": random.choice(sample_texts),
                "created_at": rand_time_within_days(25).isoformat(),
                "replies": [],
            }
            # 40% chance the store replied
            if random.random() < 0.4:
                c["store_reply"] = random.choice([
                    "شكراً لتواصلك 🌹", "سنتواصل معك مباشرة", "شكراً لملاحظتك القيمة",
                    "نعم متوفر بضمان سنة", "قريباً إن شاء الله"
                ])
                c["store_reply_at"] = rand_time_within_days(20).isoformat()
            # 30% chance of user reply
            if random.random() < 0.3:
                c["replies"].append({
                    "id": str(ObjectId()),
                    "user_id": str(random.choice(users)["_id"]),
                    "user_name": rand_name(),
                    "text": random.choice(["أوافقك الرأي", "أنا كذلك", "شكراً على المعلومة", "حلو!"]),
                    "created_at": rand_time_within_days(15).isoformat(),
                })
            existing_comments.append(c)

        update = {
            "viewers": viewers[-500:],  # cap
            "likers": likers[-500:],
            "views": len(viewers),
            "likes": len(likers),
            "comments": existing_comments,
        }
        # If post has poll, seed votes
        if post.get("poll") and isinstance(post["poll"].get("options"), list):
            opts = post["poll"]["options"]
            voters_by_opt = post["poll"].get("voters", {})
            for i, opt in enumerate(opts):
                extra_votes = random.randint(5, 60)
                voters = voters_by_opt.get(str(i), [])
                for _ in range(extra_votes):
                    u = random.choice(users)
                    voters.append({
                        "user_id": str(u["_id"]),
                        "user_name": u.get("name", rand_name()),
                        "user_city": u.get("city", random.choice(CITIES)),
                        "voted_at": rand_time_within_days(20).isoformat(),
                    })
                voters_by_opt[str(i)] = voters
                opts[i]["votes"] = (opts[i].get("votes", 0)) + extra_votes
            update["poll"] = {**post["poll"], "options": opts, "voters": voters_by_opt}
        await db.social_posts.update_one({"_id": post["_id"]}, {"$set": update})
        posts_updated += 1

    print(f"Social posts enriched: {posts_updated}")

    # ─── 4) Seed 12 more competitions with variety ───
    types = ["general", "quiz", "ugc_video", "referral", "purchase_based"]
    prizes = [
        ("iPhone 16 Pro Max", 1), ("Samsung S24 Ultra", 2), ("AirPods Pro 2", 5),
        ("قسيمة 500 ر.س", 10), ("iPad Air", 3), ("MacBook Air M3", 1),
        ("Apple Watch Series 10", 2), ("PS5 Slim", 1), ("خصم 30% كوبونات", 20),
        ("iPhone 15", 3), ("Galaxy Buds", 5), ("شاحن لاسلكي", 15),
    ]
    comps_created = 0
    merchant = await db.users.find_one({"phone": "0509999999"})
    for title_prize, count in prizes:
        starts = rand_time_within_days(45)
        ends = starts + timedelta(days=random.randint(3, 25))
        comp_type = random.choice(types)
        joined_target = random.randint(20, 400)
        doc = {
            "title": f"مسابقة {title_prize}",
            "prize": title_prize, "prize_count": count,
            "competition_type": comp_type,
            "status": "open" if ends > datetime.now(timezone.utc) else "ended",
            "created_by": str(merchant["_id"]) if merchant else "system",
            "starts_at": starts.isoformat(),
            "ends_at": ends.isoformat(),
            "created_at": starts.isoformat(),
            "joined_count": joined_target,
            "image": "",
            "demo_seed": True,
            "description": f"شاركوا في {title_prize} — سحب مباشر وأوراق للمشاركين",
        }
        # Winners if ended
        if doc["status"] == "ended":
            winners = []
            for _ in range(min(count, 3)):
                u = random.choice(users)
                winners.append({
                    "user_id": str(u["_id"]),
                    "user_name": u.get("name", rand_name()),
                    "user_phone": u.get("phone", rand_phone()),
                    "user_city": u.get("city", random.choice(CITIES)),
                    "won_at": ends.isoformat(),
                })
            doc["winners"] = winners
        # Insert
        r = await db.competitions.insert_one(doc)
        # Also seed participants with source tracking
        for _ in range(joined_target):
            u = random.choice(users)
            src = random.choices(["link", "organic", "push", "social_share"], weights=[35, 40, 15, 10])[0]
            await db.competition_entries.insert_one({
                "competition_id": str(r.inserted_id),
                "user_id": str(u["_id"]),
                "user_name": u.get("name", rand_name()),
                "user_phone": u.get("phone", rand_phone()),
                "user_city": u.get("city", random.choice(CITIES)),
                "source": src,
                "answers": [],
                "created_at": rand_time_within_days(30).isoformat(),
                "demo_seed": True,
            })
        comps_created += 1
    print(f"Competitions created: {comps_created}")

    # ─── 5) Seed 30 service bookings + reviews ───
    if services:
        bookings_seeded = 0
        for _ in range(30):
            svc = random.choice(services)
            u = random.choice(users)
            b = random.choice(branches) if branches else None
            status = random.choice(["completed", "completed", "completed", "in_progress", "pending"])
            base = float(svc.get("base_price", 0) or random.randint(50, 400))
            total = base + random.randint(0, 100)
            created = rand_time_within_days(60)
            r = await db.service_bookings.insert_one({
                "service_id": str(svc["_id"]),
                "user_id": str(u["_id"]),
                "customer_name": u.get("name", rand_name()),
                "customer_phone": u.get("phone", rand_phone()),
                "branch_id": str(b["_id"]) if b else "",
                "total_fee": total,
                "status": status,
                "created_at": created.isoformat(),
                "demo_seed": True,
            })
            bookings_seeded += 1
            # Add review for completed
            if status == "completed" and random.random() < 0.7:
                await db.service_reviews.insert_one({
                    "service_id": str(svc["_id"]),
                    "booking_id": str(r.inserted_id),
                    "update_id": "",
                    "user_id": str(u["_id"]),
                    "user_name": u.get("name", rand_name()),
                    "stars": random.choices([3, 4, 5, 5, 5], k=1)[0],
                    "comment": random.choice([
                        "خدمة ممتازة وسريعة", "أنصح فيهم من كل قلبي", "سعرهم مناسب والجودة عالية",
                        "الفني محترم جداً", "مشكلة تحلت بيوم واحد", "الله يعطيكم العافية"
                    ]),
                    "created_at": rand_time_within_days(50).isoformat(),
                    "demo_seed": True,
                })
        print(f"Service bookings seeded: {bookings_seeded}")

    print("\n✅ All demo analytics data seeded!")


if __name__ == "__main__":
    asyncio.run(main())
