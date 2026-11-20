"""Realistic driver history for the demo driver (0540001111): delivered trips over the last 30 days
with real Riyadh districts, earnings, tips, cash-on-delivery, ratings, plus a few open orders waiting
for pickup. Idempotent: re-running replaces only rows tagged SEED_TAG.

Run: python seed_driver_trips.py
"""
import asyncio
import os
import random
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

SEED_TAG = "driver_trips_v1"
DRIVER_PHONE = "0540001111"

DISTRICTS = [
    ("حي الملقا، شارع أنس بن مالك", 24.8125, 46.6067), ("حي النرجس، طريق عثمان بن عفان", 24.8402, 46.6609),
    ("حي الياسمين، شارع الثمامة", 24.8236, 46.6417), ("حي العليا، شارع التحلية", 24.6939, 46.6853),
    ("حي الورود، شارع العروبة", 24.7206, 46.6838), ("حي السليمانية، شارع الضباب", 24.7055, 46.7012),
    ("حي الروضة، شارع خالد بن الوليد", 24.7333, 46.7731), ("حي قرطبة، طريق الدمام", 24.8121, 46.7375),
    ("حي الربوة، شارع الأمير مشعل", 24.6867, 46.7554), ("حي الصحافة، شارع الإمام سعود", 24.7943, 46.6380),
    ("حي حطين، طريق الأمير تركي", 24.7578, 46.5953), ("حي المروج، شارع الأمير محمد بن سعد", 24.7576, 46.6493),
]
CUSTOMERS = ["عبدالرحمن القحطاني", "نوف العتيبي", "سلطان الشمري", "هيفاء الدوسري", "تركي المطيري", "ريم الزهراني",
             "خالد الغامدي", "أمل الحربي", "فيصل العنزي", "جواهر السبيعي", "بدر الشهري", "لمى المالكي"]
ITEMS = [("آيفون 16 برو ماكس", 5299), ("سماعات AirPods Pro 2", 949), ("شاحن أنكر 65 واط", 189), ("ساعة جالكسي Watch 7", 1199),
         ("جراب ماق سيف شفاف", 99), ("ماوس لوجيتك MX Master 3S", 449), ("باور بانك 20000 مللي أمبير", 159),
         ("لابتوب لينوفو IdeaPad", 2899), ("كيبورد ميكانيكي RGB", 329), ("قلم أبل الجيل الثاني", 549)]
COMMENTS = ["سائق محترم ووصل بسرعة 👌", "تعامل راقي", "وصل قبل الوقت المتوقع", "ممتاز", "شكراً على الحرص", ""]


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    drv_user = await db.users.find_one({"phone": DRIVER_PHONE})
    if not drv_user:
        print("driver not found"); return
    did = str(drv_user["_id"])
    branch = await db.branches.find_one({}) or {}
    b_lat, b_lng = branch.get("lat", 24.7136), branch.get("lng", 46.6753)
    cust = await db.users.find_one({"phone": "0500000000"})
    cust_id = str(cust["_id"]) if cust else "demo_customer_1"

    # wipe previous seed rows (keep real trips)
    await db.orders.delete_many({"seed_tag": SEED_TAG})
    await db.driver_transactions.delete_many({"seed_tag": SEED_TAG})
    await db.driver_payouts.delete_many({"seed_tag": SEED_TAG})

    rnd = random.Random(42)
    now = datetime.now(timezone.utc)
    orders, txs, total_earn, cash, on_time, ratings = [], [], 0.0, 0.0, 0, []
    # trips: today 6, then 1-5 per day over 30 days
    for day in range(30):
        n = 6 if day == 0 else rnd.randint(1, 5)
        for _ in range(n):
            addr, lat, lng = rnd.choice(DISTRICTS)
            created = now - timedelta(days=day, hours=rnd.randint(0, 10), minutes=rnd.randint(0, 59))
            if created > now - timedelta(minutes=30):
                created = now - timedelta(minutes=rnd.randint(40, 300))
            acc = created + timedelta(minutes=rnd.randint(2, 8))
            dmin = rnd.randint(18, 70)
            delivered = acc + timedelta(minutes=dmin)
            items = [{"product_id": "", "name": n_, "price": p, "quantity": rnd.choice([1, 1, 2])} for n_, p in rnd.sample(ITEMS, rnd.randint(1, 3))]
            subtotal = sum(i["price"] * i["quantity"] for i in items)
            fee = rnd.choice([15, 20, 25, 30])
            earning = round(fee * 0.7 + rnd.choice([0, 0, 1.5, 3]), 2)
            pm = rnd.choice(["card", "card", "apple_pay", "cod", "mada"])
            stars = rnd.choice([5, 5, 5, 4, 5, 4, 3])
            o = {"user_id": cust_id, "user_name": rnd.choice(CUSTOMERS), "customer_name": rnd.choice(CUSTOMERS),
                 "phone": f"05{rnd.randint(10000000, 99999999)}", "items": items, "subtotal": subtotal, "delivery_fee": fee,
                 "total": subtotal + fee, "payment_method": pm, "status": "delivered", "delivery_step": "delivered",
                 "delivery_type": rnd.choice(["express", "express", "standard"]), "address": addr,
                 "dest_lat": lat, "dest_lng": lng, "branch_id": str(branch.get("_id", "")), "branch_name": branch.get("name", ""),
                 "branch_lat": b_lat, "branch_lng": b_lng, "driver_id": did, "driver_name": drv_user.get("name", ""),
                 "driver_phone": DRIVER_PHONE, "created_at": created.isoformat(), "accepted_at": acc.isoformat(),
                 "delivered_at": delivered.isoformat(), "driver_earnings": earning, "merchant_cut": round(fee - earning, 2),
                 "cash_collected": subtotal + fee if pm == "cod" else 0, "on_time": dmin <= 60,
                 "proof": {"method": rnd.choice(["otp", "otp", "photo"]), "photo_url": ""}, "source": "app", "seed_tag": SEED_TAG}
            if rnd.random() < 0.6:
                o["driver_rating"] = {"stars": stars, "comment": rnd.choice(COMMENTS), "at": (delivered + timedelta(minutes=20)).isoformat()}
                ratings.append(stars)
            orders.append(o)
            total_earn += earning
            on_time += 1 if dmin <= 60 else 0
            if pm == "cod" and day == 0:
                cash += subtotal + fee
            txs.append({"driver_id": did, "amount": earning, "type": "delivery_earnings", "created_at": delivered.isoformat(), "seed_tag": SEED_TAG})
            if rnd.random() < 0.15:
                tip = rnd.choice([5, 10, 15])
                txs.append({"driver_id": did, "amount": tip, "type": "tip", "created_at": (delivered + timedelta(minutes=5)).isoformat(), "seed_tag": SEED_TAG})
                total_earn += tip
    res = await db.orders.insert_many(orders)
    for t, o in zip([t for t in txs if t["type"] == "delivery_earnings"], res.inserted_ids):
        t["order_id"] = str(o)
    # past payouts (paid) + one pending
    payouts = [{"driver_id": did, "driver_name": drv_user.get("name", ""), "amount": a, "status": st,
                "created_at": (now - timedelta(days=d)).isoformat(), "seed_tag": SEED_TAG}
               for a, st, d in [(400, "paid", 21), (450, "paid", 14), (350, "paid", 7), (200, "pending", 1)]]
    paid_out = sum(p["amount"] for p in payouts)
    txs += [{"driver_id": did, "amount": -p["amount"], "type": "payout", "created_at": p["created_at"], "seed_tag": SEED_TAG} for p in payouts]
    await db.driver_transactions.insert_many(txs)
    await db.driver_payouts.insert_many(payouts)

    wallet = round(max(0.0, total_earn - paid_out), 2)
    await db.users.update_one({"_id": drv_user["_id"]}, {"$set": {"wallet_balance": wallet}})
    n = len(orders)
    await db.drivers.update_one({"user_id": did}, {"$set": {
        "total_deliveries": n, "on_time_count": on_time, "cash_in_hand": round(cash, 2),
        "rating_avg": round(sum(ratings) / len(ratings), 3) if ratings else 5, "rating_count": len(ratings),
        "offers_total": n + 9, "offers_accepted": n, "wallet_balance": wallet}})

    # 3 open orders waiting for a driver (shown in "available orders" when the driver goes online)
    await db.orders.delete_many({"seed_tag": SEED_TAG + "_open"})
    opens = []
    for i in range(3):
        addr, lat, lng = DISTRICTS[i * 3]
        items = [{"product_id": "", "name": ITEMS[i][0], "price": ITEMS[i][1], "quantity": 1}]
        opens.append({"user_id": cust_id, "user_name": CUSTOMERS[i], "customer_name": CUSTOMERS[i], "phone": "0500000000",
                      "items": items, "subtotal": ITEMS[i][1], "delivery_fee": 20, "total": ITEMS[i][1] + 20,
                      "payment_method": ["card", "cod", "apple_pay"][i], "status": "ready_for_pickup", "driver_id": "",
                      "delivery_type": "express", "address": addr, "dest_lat": lat, "dest_lng": lng,
                      "branch_id": str(branch.get("_id", "")), "branch_name": branch.get("name", ""), "branch_lat": b_lat, "branch_lng": b_lng,
                      "delivery_otp": str(1000 + i * 1111), "created_at": (now - timedelta(minutes=5 + i * 4)).isoformat(),
                      "source": "app", "seed_tag": SEED_TAG + "_open"})
    await db.orders.insert_many(opens)
    print(f"trips={n} earnings={total_earn:.2f} wallet={wallet} cash={cash:.2f} ratings={len(ratings)} open=3")


if __name__ == "__main__":
    asyncio.run(main())
