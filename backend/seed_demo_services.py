"""Seed a rich demo dataset for the Zitex Services & Products modules.
Adds:
- 3 new rich services (with images, warranty, home pickup + GPS)
- 4 sample bookings for the customer account (statuses: pending, received, in_progress, completed)
- 5 sample service_updates (videos + captions) on the in_progress + completed bookings
- 3 customer reviews (per-video + final)
- 2 sample products with rich colors + dual warranty
Usage:  python -m backend.seed_demo_services  (from /app)
"""
import asyncio, os, sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client[os.environ.get("DB_NAME", "test_database")]

RIYADH = (24.7136, 46.6753)  # shop coords
CUSTOMER_HOME = (24.8000, 46.7500)


async def seed():
    # find customer + merchant
    customer = await db.users.find_one({"phone": "0500000000"})
    merchant = await db.users.find_one({"phone": "0509999999"})
    if not customer or not merchant:
        print("❌ Customer or merchant not seeded. Run backend seed first.")
        return
    cid = str(customer["_id"]); mid = str(merchant["_id"])
    print(f"👤 customer={cid}, 🏪 merchant={mid}")

    # ─── SERVICES ───────────────────────────────────────────────
    demos = [
        {
            "name": "تبديل شاشة آيفون", "desc": "شاشة أصلية مع تركيب احترافي وضمان 90 يوم",
            "long_description": ("نستخدم شاشات أصلية Apple 100%.\n"
                                 "التركيب في المحل خلال 45 دقيقة.\n"
                                 "الضمان يشمل عيوب الصناعة والزجاج ومستشعرات اللمس.\n"
                                 "لا يشمل الضمان: السقوط، الماء، أو الاستخدام الخاطئ."),
            "category": "replacement", "icon": "phone-portrait", "color": "#8833FF",
            "images": ["demo/services/screen-repair-1.jpg", "demo/services/screen-repair-2.jpg"],
            "price": 299, "inspection_price": 25, "turnaround": "45 دقيقة",
            "delivery_available": True, "home_pickup": True,
            "pickup_base_fee": 15, "pickup_price_per_km": 3,
            "shop_lat": RIYADH[0], "shop_lng": RIYADH[1],
            "warranty_available": True, "warranty_days": 90,
            "warranty_terms": "الضمان يغطي عيوب الصناعة فقط. لا يشمل السقوط أو الماء.",
            "published": True, "merchant_id": mid,
            "rating": 4.8, "review_count": 12, "total_requests": 47,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "name": "تبديل بطارية أصلية", "desc": "بطارية أصلية جديدة 100% مع اختبار الأداء",
            "long_description": ("خدمة كاملة تشمل:\n"
                                 "• فحص كامل للبطارية\n"
                                 "• تبديل بطارية أصلية جديدة\n"
                                 "• اختبار الشحن والتفريغ\n"
                                 "• شهادة أداء بعد التركيب"),
            "category": "replacement", "icon": "battery-charging", "color": "#10B981",
            "images": ["demo/services/battery-1.jpg"],
            "price": 199, "inspection_price": 0, "turnaround": "30 دقيقة",
            "delivery_available": True, "home_pickup": True,
            "pickup_base_fee": 15, "pickup_price_per_km": 3,
            "shop_lat": RIYADH[0], "shop_lng": RIYADH[1],
            "warranty_available": True, "warranty_days": 180,
            "warranty_terms": "ضمان 6 أشهر على البطارية ضد عيوب الصناعة.",
            "published": True, "merchant_id": mid,
            "rating": 4.9, "review_count": 8, "total_requests": 62,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "name": "إصلاح الأضرار من المياه", "desc": "خدمة متخصصة لإنقاذ الأجهزة المبللة",
            "long_description": ("خطوات الإصلاح:\n"
                                 "1. الفحص الفوري خلال 15 دقيقة\n"
                                 "2. تفكيك الجهاز وتنظيف المكونات\n"
                                 "3. الحمام بالكحول الطبي (Ultrasonic)\n"
                                 "4. اختبار المكونات وتبديل التالف\n"
                                 "5. اختبار كامل بعد الإصلاح"),
            "category": "repair", "icon": "water", "color": "#3B82F6",
            "images": ["demo/services/water-damage-1.jpg"],
            "price": 449, "inspection_price": 50, "turnaround": "2-3 أيام",
            "delivery_available": True, "home_pickup": True,
            "pickup_base_fee": 20, "pickup_price_per_km": 3,
            "shop_lat": RIYADH[0], "shop_lng": RIYADH[1],
            "warranty_available": True, "warranty_days": 30,
            "warranty_terms": "ضمان 30 يوم على الإصلاح. لا يشمل التلف الجديد.",
            "published": True, "merchant_id": mid,
            "rating": 4.6, "review_count": 5, "total_requests": 18,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]

    # remove old demo services (keyed by name)
    await db.services.delete_many({"name": {"$in": [d["name"] for d in demos]}})
    r = await db.services.insert_many(demos)
    svc_ids = [str(x) for x in r.inserted_ids]
    print(f"✅ inserted {len(svc_ids)} demo services")

    # ─── BOOKINGS ───────────────────────────────────────────────
    now = datetime.now(timezone.utc).isoformat()
    bookings = [
        {  # 1) pending — waiting for pickup
            "user_id": cid, "service_id": svc_ids[0], "service_name": demos[0]["name"],
            "device_model": "iPhone 15 Pro Max", "issue_desc": "شاشة مكسورة من الجانب الأيمن",
            "delivery_type": "home_pickup", "address": "الرياض - حي الملقا - شارع التخصصي",
            "phone": customer.get("phone"),
            "dest_lat": CUSTOMER_HOME[0], "dest_lng": CUSTOMER_HOME[1],
            "pickup_fee": 71.4, "distance_km": 9.4, "service_price": 299,
            "total_amount": 370.4, "status": "pending", "warranty": True,
            "warranty_days": 90, "created_at": now,
        },
        {  # 2) received — merchant got the device
            "user_id": cid, "service_id": svc_ids[1], "service_name": demos[1]["name"],
            "device_model": "iPhone 14", "issue_desc": "البطارية تنفد بسرعة، الأداء 78%",
            "delivery_type": "store", "address": "", "phone": customer.get("phone"),
            "pickup_fee": 0, "distance_km": 0, "service_price": 199, "total_amount": 199,
            "status": "received", "warranty": True, "warranty_days": 180,
            "created_at": now,
        },
        {  # 3) in_progress — actively being fixed (will have 2 video updates)
            "user_id": cid, "service_id": svc_ids[2], "service_name": demos[2]["name"],
            "device_model": "Samsung Galaxy S24 Ultra", "issue_desc": "سقط في الماء وتوقف تماماً",
            "delivery_type": "home_pickup", "address": "الرياض - حي الياسمين",
            "phone": customer.get("phone"),
            "dest_lat": 24.82, "dest_lng": 46.62,
            "pickup_fee": 68.6, "distance_km": 8.1, "service_price": 449,
            "total_amount": 517.6, "status": "in_progress", "warranty": True,
            "warranty_days": 30, "created_at": now,
        },
        {  # 4) completed — done, will get final rating
            "user_id": cid, "service_id": svc_ids[0], "service_name": demos[0]["name"],
            "device_model": "iPhone 13", "issue_desc": "شاشة متكسرة",
            "delivery_type": "store", "address": "", "phone": customer.get("phone"),
            "pickup_fee": 0, "distance_km": 0, "service_price": 299, "total_amount": 299,
            "status": "completed", "warranty": True, "warranty_days": 90,
            "created_at": now,
        },
    ]
    await db.service_bookings.delete_many({"user_id": cid, "service_name": {"$in": [d["name"] for d in demos]}})
    br = await db.service_bookings.insert_many(bookings)
    bids = [str(x) for x in br.inserted_ids]
    print(f"✅ inserted {len(bids)} demo bookings")

    # ─── SERVICE UPDATES (videos) on booking #3 (in_progress) and #4 (completed) ───
    updates = [
        {"booking_id": bids[2], "video_url": "demo/services/vid-water-1.mp4", "image_url": "",
         "caption": "استلمنا جهازك، جاري تفكيكه وتقييم الضرر", "is_public_experience": True,
         "crosspost_to_social": False, "merchant_id": mid, "service_id": svc_ids[2],
         "avg_rating": 5.0, "review_count": 1, "created_at": now},
        {"booking_id": bids[2], "video_url": "demo/services/vid-water-2.mp4", "image_url": "",
         "caption": "تم غسل اللوحة الأم بالموجات فوق الصوتية، اختبار المكونات جاري", "is_public_experience": True,
         "crosspost_to_social": True, "merchant_id": mid, "service_id": svc_ids[2],
         "avg_rating": 5.0, "review_count": 1, "created_at": now},
        {"booking_id": bids[3], "video_url": "demo/services/vid-screen-1.mp4", "image_url": "",
         "caption": "التركيب اكتمل بنجاح، اختبار اللمس والألوان", "is_public_experience": True,
         "crosspost_to_social": True, "merchant_id": mid, "service_id": svc_ids[0],
         "avg_rating": 4.5, "review_count": 2, "created_at": now},
    ]
    await db.service_updates.delete_many({"merchant_id": mid})
    ur = await db.service_updates.insert_many(updates)
    uids = [str(x) for x in ur.inserted_ids]
    print(f"✅ inserted {len(uids)} demo video updates")

    # ─── REVIEWS ───
    reviews = [
        {"user_id": cid, "user_name": customer.get("name","عميل"), "booking_id": bids[2],
         "update_id": uids[0], "service_id": svc_ids[2], "stars": 5,
         "comment": "شرح واضح ومحترف، بارك الله فيكم", "created_at": now},
        {"user_id": cid, "user_name": customer.get("name","عميل"), "booking_id": bids[2],
         "update_id": uids[1], "service_id": svc_ids[2], "stars": 5,
         "comment": "شغل نظيف، متابعتكم مطمّنة", "created_at": now},
        {"user_id": cid, "user_name": customer.get("name","عميل"), "booking_id": bids[3],
         "update_id": uids[2], "service_id": svc_ids[0], "stars": 4,
         "comment": "الإصلاح ممتاز والتغليف نظيف", "created_at": now},
        {"user_id": cid, "user_name": customer.get("name","عميل"), "booking_id": bids[3],
         "update_id": "", "service_id": svc_ids[0], "stars": 5,
         "comment": "خدمة راقية والسعر ممتاز، أنصح فيهم", "created_at": now},
    ]
    await db.service_reviews.delete_many({"user_id": cid, "service_id": {"$in": svc_ids}})
    await db.service_reviews.insert_many(reviews)
    print(f"✅ inserted {len(reviews)} reviews")

    # ─── PRODUCTS with rich colors + dual warranty ───
    demo_products = [
        {
            "name_ar": "iPhone 16 Pro Max", "name_en": "iPhone 16 Pro Max",
            "description_ar": "أحدث جوال آيفون مع كاميرا A18 Pro وشاشة ProMotion وشحن سريع.",
            "description_en": "Latest iPhone with A18 Pro camera, ProMotion display and MagSafe.",
            "category_id": "", "brand_id": "", "price": 5899, "discount_price": 5599,
            "condition": "new",
            "images": ["demo/products/iphone-16-pro-1.jpg","demo/products/iphone-16-pro-2.jpg"],
            "video": "", "storage_options": ["256GB","512GB","1TB"],
            "colors": [
                {"name": "تيتانيوم طبيعي", "hex": "#B8AA8E"},
                {"name": "تيتانيوم أبيض", "hex": "#F2EFE9"},
                {"name": "تيتانيوم أسود", "hex": "#2C2C2C"},
                {"name": "تيتانيوم صحراوي", "hex": "#D9B78E"},
            ],
            "warranty_type": "both",
            "shop_warranty_days": 30, "shop_warranty_terms": "ضمان استبدال في حال العيب الصناعي.",
            "manufacturer_name": "Apple", "manufacturer_days": 365,
            "manufacturer_url": "https://support.apple.com/ar-sa/iphone",
            "manufacturer_phone": "8008500700",
            "manufacturer_terms": "ضمان دولي شامل من Apple لمدة سنة كاملة.",
            "specs": {"الشاشة":"6.9 بوصة", "المعالج":"A18 Pro", "الكاميرا":"48 ميجا",
                      "البطارية":"4685 mAh", "التخزين":"1TB"},
            "sku":"IP16PM-1TB","tags":["آيفون","أبل","برو","2025"],
            "in_stock": True, "featured": True, "published": True,
            "merchant_id": mid, "rating": 4.9, "review_count": 24, "sold_count": 87,
            "created_at": now,
        },
        {
            "name_ar": "iPhone 13 مستخدم", "name_en": "iPhone 13 (Used)",
            "description_ar": "آيفون 13 نظيف جداً مستخدم 6 أشهر بضمان محلي مع اختبار كامل.",
            "description_en": "Clean 6-month used iPhone 13 with shop warranty and full inspection.",
            "category_id": "", "brand_id": "", "price": 1499, "discount_price": None,
            "condition": "used_6months",
            "images": ["demo/products/iphone-13-used-1.jpg"],
            "video": "", "storage_options": ["128GB","256GB"],
            "colors": [
                {"name": "أزرق", "hex": "#4A90E2"},
                {"name": "أحمر", "hex": "#EF4444"},
                {"name": "أبيض", "hex": "#F9F9F9"},
            ],
            "warranty_type": "shop",
            "shop_warranty_days": 90, "shop_warranty_terms": "ضمان المحل يشمل: البطارية، الشاشة، لوحة الأم لمدة 90 يوم.",
            "manufacturer_name": "", "manufacturer_days": 0, "manufacturer_url": "",
            "manufacturer_phone": "", "manufacturer_terms": "",
            "specs":{"الشاشة":"6.1 بوصة","التخزين":"256GB","الحالة":"مستخدم 6 أشهر"},
            "sku":"IP13U-256","tags":["مستخدم","آيفون"],
            "in_stock": True, "featured": False, "published": True,
            "merchant_id": mid, "rating": 4.5, "review_count": 6, "sold_count": 12,
            "created_at": now,
        },
    ]
    await db.products.delete_many({"sku": {"$in": [p["sku"] for p in demo_products]}})
    await db.products.insert_many(demo_products)
    print(f"✅ inserted {len(demo_products)} demo products")

    # notification for the customer about a video update (simulating merchant post)
    await db.notifications.delete_many({"user_id": cid, "data.type": "service_update"})
    await db.notifications.insert_one({
        "user_id": cid, "title": "🎥 تحديث جديد على جوالك",
        "body": "شاهد آخر خطوة في إصلاح جهازك — Galaxy S24 Ultra",
        "read": False, "data": {"type":"service_update","booking_id":bids[2],"update_id":uids[1]},
        "created_at": now,
    })
    print("✅ inserted 1 in-app notification")

    print("\n🎉 Demo seed complete. Login as 0500000000/test1234 to see:\n"
          "   • 4 active/completed service bookings on 'خدماتي'\n"
          "   • Video updates + reviews under booking #3 (in_progress) and #4 (completed)\n"
          "   • Home widget shows the pending booking on the customer home tab\n"
          "   • 2 new products with color circles + dual warranty visible on their pages")


if __name__ == "__main__":
    asyncio.run(seed())
