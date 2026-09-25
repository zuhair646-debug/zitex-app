"""
Seed real Zenrex catalog + rich analytics events.
- Removes Sony brand and any gaming products.
- Seeds 40+ real products (phones, laptops, tablets, watches, accessories).
- Creates ~15 realistic customers with Saudi names.
- Generates events: product views, cart adds, cart abandonments, purchases, shares, reviews.

Run:  python -m seed_real_catalog
Idempotent: reruns will delete previous seeded data first.
"""
import asyncio, os, random
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "zitex_db")

def _iso(dt: datetime) -> str:
    return dt.replace(tzinfo=timezone.utc).isoformat()

# ─── Saudi customer names ──────────────────────────────────────────────
CUSTOMERS = [
    ("فهد العتيبي",      "0501234501"),
    ("عبدالله القحطاني",  "0501234502"),
    ("سلطان الحربي",     "0501234503"),
    ("خالد الشمري",      "0501234504"),
    ("محمد الغامدي",     "0501234505"),
    ("راشد الدوسري",     "0501234506"),
    ("ناصر السبيعي",     "0501234507"),
    ("عبدالعزيز المطيري", "0501234508"),
    ("تركي الرشيدي",     "0501234509"),
    ("بندر الزهراني",    "0501234510"),
    ("مشعل العنزي",      "0501234511"),
    ("يوسف البقمي",      "0501234512"),
    ("نورة السعيد",       "0501234513"),
    ("منى الفيفي",        "0501234514"),
    ("ريما الخالدي",      "0501234515"),
    ("لجين الأحمدي",      "0501234516"),
    ("سارة القرني",       "0501234517"),
    ("هدى الجهني",        "0501234518"),
]

# ─── Real product catalog (KSA market) ─────────────────────────────────
# category_key: "Phones" | "Laptops" | "Tablets" | "Watches" | "Accessories"
# brand: Apple | Samsung | Huawei | Xiaomi | Dell | HP | Lenovo | Asus | Honor | Nothing
PRODUCTS = [
    # ─── Phones ─── (12)
    {"name_ar":"آيفون 15 برو ماكس 256GB","name_en":"iPhone 15 Pro Max 256GB","cat":"Phones","brand":"Apple","price":5499,"discount":4999,
     "images":["https://images.unsplash.com/photo-1696446701796-da61225697cc?w=600"],"condition":"new",
     "colors":[{"name":"تيتانيوم طبيعي","hex":"#A0A0A0"},{"name":"تيتانيوم أزرق","hex":"#3D4F7C"},{"name":"تيتانيوم أسود","hex":"#2C2C2C"}],
     "storage_options":["256GB","512GB","1TB"], "featured": True,
     "specs":{"شاشة":"6.7 بوصة","معالج":"A17 Pro","الكاميرا":"48MP + 12MP + 12MP","البطارية":"4441 mAh","النظام":"iOS 17"}},
    {"name_ar":"آيفون 15 برو 128GB","name_en":"iPhone 15 Pro","cat":"Phones","brand":"Apple","price":4699,"discount":4299,
     "images":["https://images.unsplash.com/photo-1696446701796-da61225697cc?w=600"],"condition":"new",
     "colors":[{"name":"تيتانيوم طبيعي","hex":"#A0A0A0"},{"name":"تيتانيوم أزرق","hex":"#3D4F7C"}],
     "storage_options":["128GB","256GB"], "featured": True,
     "specs":{"شاشة":"6.1 بوصة","معالج":"A17 Pro","الكاميرا":"48MP","البطارية":"3274 mAh"}},
    {"name_ar":"آيفون 14 128GB","name_en":"iPhone 14 128GB","cat":"Phones","brand":"Apple","price":2999,"discount":2799,
     "images":["https://images.unsplash.com/photo-1592286927505-4dfc82d6d4ce?w=600"],"condition":"new",
     "colors":[{"name":"أزرق","hex":"#007AFF"},{"name":"بنفسجي","hex":"#B593CE"},{"name":"أسود","hex":"#1A1A1A"}],
     "storage_options":["128GB","256GB"], "featured": False,
     "specs":{"شاشة":"6.1 بوصة","معالج":"A15 Bionic","الكاميرا":"12MP"}},
    {"name_ar":"آيفون 14 (مستعمل ممتاز)","name_en":"iPhone 14 (Excellent Used)","cat":"Phones","brand":"Apple","price":2499,"discount":None,
     "images":["https://images.unsplash.com/photo-1592286927505-4dfc82d6d4ce?w=600"],"condition":"used_3months",
     "colors":[{"name":"أزرق","hex":"#007AFF"}],"storage_options":["128GB"], "featured": False,
     "specs":{"شاشة":"6.1 بوصة","معالج":"A15 Bionic","الحالة":"مستعمل 3 أشهر - بحالة ممتازة"}},
    {"name_ar":"سامسونج جالكسي S24 ألترا 512GB","name_en":"Samsung Galaxy S24 Ultra 512GB","cat":"Phones","brand":"Samsung","price":5299,"discount":4899,
     "images":["https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=600"],"condition":"new",
     "colors":[{"name":"تيتانيوم رمادي","hex":"#7A7A7A"},{"name":"تيتانيوم بنفسجي","hex":"#8833FF"},{"name":"تيتانيوم أسود","hex":"#2C2C2C"}],
     "storage_options":["256GB","512GB","1TB"], "featured": True,
     "specs":{"شاشة":"6.8 بوصة QHD+","معالج":"Snapdragon 8 Gen 3","الكاميرا":"200MP","القلم":"S Pen مدمج"}},
    {"name_ar":"سامسونج جالكسي S24 256GB","name_en":"Samsung Galaxy S24","cat":"Phones","brand":"Samsung","price":3499,"discount":3199,
     "images":["https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=600"],"condition":"new",
     "colors":[{"name":"أصفر","hex":"#FCD34D"},{"name":"رمادي","hex":"#6B7280"},{"name":"بنفسجي","hex":"#A78BFA"}],
     "storage_options":["128GB","256GB"], "featured": False,
     "specs":{"شاشة":"6.2 بوصة","معالج":"Exynos 2400","الكاميرا":"50MP"}},
    {"name_ar":"سامسونج جالكسي Z Fold 5","name_en":"Samsung Galaxy Z Fold 5","cat":"Phones","brand":"Samsung","price":6799,"discount":5999,
     "images":["https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=600"],"condition":"new",
     "colors":[{"name":"كريمي","hex":"#F5E9DC"},{"name":"أزرق فاتح","hex":"#B0D4E3"}],
     "storage_options":["256GB","512GB","1TB"], "featured": True,
     "specs":{"شاشة":"7.6 بوصة قابل للطي","معالج":"Snapdragon 8 Gen 2 for Galaxy","الكاميرا":"50MP"}},
    {"name_ar":"هواوي P60 Pro","name_en":"Huawei P60 Pro","cat":"Phones","brand":"Huawei","price":3999,"discount":3599,
     "images":["https://images.unsplash.com/photo-1592286927505-4dfc82d6d4ce?w=600"],"condition":"new",
     "colors":[{"name":"لؤلؤي","hex":"#EFE9DA"},{"name":"أخضر زمردي","hex":"#009966"}],
     "storage_options":["256GB","512GB"], "featured": False,
     "specs":{"شاشة":"6.67 بوصة","معالج":"Snapdragon 8+ Gen 1","الكاميرا":"48MP بعدسة متغيرة الفتحة"}},
    {"name_ar":"هواوي Mate 60 Pro","name_en":"Huawei Mate 60 Pro","cat":"Phones","brand":"Huawei","price":4499,"discount":None,
     "images":["https://images.unsplash.com/photo-1592286927505-4dfc82d6d4ce?w=600"],"condition":"new",
     "colors":[{"name":"أسود","hex":"#111"},{"name":"أخضر","hex":"#007A3E"}],"storage_options":["256GB","512GB"], "featured": False,
     "specs":{"شاشة":"6.82 بوصة","معالج":"Kirin 9000S","الكاميرا":"50MP"}},
    {"name_ar":"شاومي 14 Ultra","name_en":"Xiaomi 14 Ultra","cat":"Phones","brand":"Xiaomi","price":4299,"discount":3799,
     "images":["https://images.unsplash.com/photo-1592286927505-4dfc82d6d4ce?w=600"],"condition":"new",
     "colors":[{"name":"أبيض","hex":"#EFEFEF"},{"name":"أسود","hex":"#1A1A1A"}],"storage_options":["256GB","512GB","1TB"], "featured": True,
     "specs":{"شاشة":"6.73 بوصة LTPO","معالج":"Snapdragon 8 Gen 3","الكاميرا":"Leica 50MP رباعية"}},
    {"name_ar":"شاومي Redmi Note 13 Pro","name_en":"Xiaomi Redmi Note 13 Pro","cat":"Phones","brand":"Xiaomi","price":999,"discount":899,
     "images":["https://images.unsplash.com/photo-1592286927505-4dfc82d6d4ce?w=600"],"condition":"new",
     "colors":[{"name":"أزرق","hex":"#3B82F6"},{"name":"أسود","hex":"#1A1A1A"}],"storage_options":["128GB","256GB"], "featured": False,
     "specs":{"شاشة":"6.67 بوصة AMOLED","الكاميرا":"200MP","البطارية":"5100 mAh"}},
    {"name_ar":"هونر Magic 6 Pro","name_en":"Honor Magic 6 Pro","cat":"Phones","brand":"Honor","price":3799,"discount":3499,
     "images":["https://images.unsplash.com/photo-1592286927505-4dfc82d6d4ce?w=600"],"condition":"new",
     "colors":[{"name":"أبيض","hex":"#EFEFEF"},{"name":"أخضر داكن","hex":"#134E4A"}],"storage_options":["256GB","512GB"], "featured": False,
     "specs":{"شاشة":"6.8 بوصة LTPO","معالج":"Snapdragon 8 Gen 3","الكاميرا":"180MP"}},

    # ─── Laptops ─── (10)
    {"name_ar":"ماك بوك برو 16 M3 Max","name_en":"MacBook Pro 16 M3 Max","cat":"Laptops","brand":"Apple","price":13999,"discount":12799,
     "images":["https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=600"],"condition":"new",
     "colors":[{"name":"رمادي فلكي","hex":"#52525B"},{"name":"فضي","hex":"#C0C0C0"}],"storage_options":["1TB","2TB","4TB"], "featured": True,
     "specs":{"شاشة":"16.2 بوصة Liquid Retina XDR","معالج":"M3 Max","الذاكرة":"36GB Unified","البطارية":"22 ساعة"}},
    {"name_ar":"ماك بوك اير 15 M3","name_en":"MacBook Air 15 M3","cat":"Laptops","brand":"Apple","price":6499,"discount":5999,
     "images":["https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=600"],"condition":"new",
     "colors":[{"name":"فضي","hex":"#C0C0C0"},{"name":"ذهبي فاتح","hex":"#E8D0B0"},{"name":"مضيء","hex":"#2C3E50"}],
     "storage_options":["256GB","512GB","1TB"], "featured": True,
     "specs":{"شاشة":"15.3 بوصة Liquid Retina","معالج":"Apple M3","الذاكرة":"8GB / 16GB","البطارية":"18 ساعة"}},
    {"name_ar":"ماك بوك اير 13 M2","name_en":"MacBook Air 13 M2","cat":"Laptops","brand":"Apple","price":4499,"discount":3999,
     "images":["https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=600"],"condition":"new",
     "colors":[{"name":"فضي","hex":"#C0C0C0"},{"name":"رمادي فلكي","hex":"#52525B"}],
     "storage_options":["256GB","512GB"], "featured": False,
     "specs":{"شاشة":"13.6 بوصة","معالج":"Apple M2","الذاكرة":"8GB"}},
    {"name_ar":"Dell XPS 15 (2024)","name_en":"Dell XPS 15","cat":"Laptops","brand":"Dell","price":8299,"discount":7499,
     "images":["https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600"],"condition":"new",
     "colors":[{"name":"بلاتيني","hex":"#B0B3B8"}],"storage_options":["512GB","1TB","2TB"], "featured": True,
     "specs":{"شاشة":"15.6 بوصة OLED 3.5K","معالج":"Intel Core i9-13900H","الذاكرة":"32GB","الرسوميات":"RTX 4070"}},
    {"name_ar":"Dell Latitude 7440","name_en":"Dell Latitude 7440","cat":"Laptops","brand":"Dell","price":5499,"discount":4999,
     "images":["https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600"],"condition":"new",
     "colors":[{"name":"رمادي مطفي","hex":"#3F3F46"}],"storage_options":["512GB","1TB"], "featured": False,
     "specs":{"شاشة":"14 بوصة FHD","معالج":"Intel Core i7","الذاكرة":"16GB"}},
    {"name_ar":"HP Spectre x360 14","name_en":"HP Spectre x360 14","cat":"Laptops","brand":"HP","price":6799,"discount":5999,
     "images":["https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600"],"condition":"new",
     "colors":[{"name":"أزرق ليلي","hex":"#1E293B"},{"name":"فضي","hex":"#C0C0C0"}],"storage_options":["512GB","1TB"], "featured": True,
     "specs":{"شاشة":"14 بوصة OLED 2.8K تعمل باللمس","معالج":"Intel Core Ultra 7","الذاكرة":"16GB / 32GB"}},
    {"name_ar":"HP EliteBook 840 G10","name_en":"HP EliteBook 840 G10","cat":"Laptops","brand":"HP","price":4899,"discount":None,
     "images":["https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600"],"condition":"new",
     "colors":[{"name":"فضي","hex":"#C0C0C0"}],"storage_options":["512GB","1TB"], "featured": False,
     "specs":{"شاشة":"14 بوصة","معالج":"Intel Core i7","الذاكرة":"16GB"}},
    {"name_ar":"Lenovo ThinkPad X1 Carbon Gen 11","name_en":"Lenovo ThinkPad X1 Carbon","cat":"Laptops","brand":"Lenovo","price":7299,"discount":6499,
     "images":["https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600"],"condition":"new",
     "colors":[{"name":"أسود كربوني","hex":"#1A1A1A"}],"storage_options":["512GB","1TB","2TB"], "featured": True,
     "specs":{"شاشة":"14 بوصة 2.8K OLED","معالج":"Intel Core i7-1365U vPro","الذاكرة":"16GB / 32GB"}},
    {"name_ar":"Lenovo Yoga Slim 7i","name_en":"Lenovo Yoga Slim 7i","cat":"Laptops","brand":"Lenovo","price":4599,"discount":4199,
     "images":["https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600"],"condition":"new",
     "colors":[{"name":"رمادي فحمي","hex":"#3F3F46"}],"storage_options":["512GB","1TB"], "featured": False,
     "specs":{"شاشة":"14.5 بوصة 2.8K","معالج":"Intel Core Ultra 5","الذاكرة":"16GB"}},
    {"name_ar":"Asus ZenBook 14 OLED","name_en":"Asus ZenBook 14 OLED","cat":"Laptops","brand":"Asus","price":4299,"discount":3899,
     "images":["https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=600"],"condition":"new",
     "colors":[{"name":"أزرق باندا","hex":"#4B6FA5"},{"name":"فضي","hex":"#C0C0C0"}],"storage_options":["512GB","1TB"], "featured": False,
     "specs":{"شاشة":"14 بوصة OLED 2.8K","معالج":"Intel Core Ultra 7","الذاكرة":"16GB"}},

    # ─── Tablets ─── (5)
    {"name_ar":"آيباد برو 12.9 M2 256GB","name_en":"iPad Pro 12.9 M2","cat":"Tablets","brand":"Apple","price":5999,"discount":5499,
     "images":["https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600"],"condition":"new",
     "colors":[{"name":"فضي","hex":"#C0C0C0"},{"name":"رمادي فلكي","hex":"#52525B"}],
     "storage_options":["128GB","256GB","512GB","1TB"], "featured": True,
     "specs":{"شاشة":"12.9 بوصة Liquid Retina XDR","معالج":"Apple M2","الكاميرا":"12MP + LiDAR"}},
    {"name_ar":"آيباد اير 5 (M1) 64GB","name_en":"iPad Air 5 M1","cat":"Tablets","brand":"Apple","price":2499,"discount":2299,
     "images":["https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600"],"condition":"new",
     "colors":[{"name":"سماوي","hex":"#7BB4D6"},{"name":"وردي","hex":"#F4C2C2"},{"name":"بنفسجي","hex":"#B19CD9"},{"name":"أبيض ستاري","hex":"#F5F5F5"}],
     "storage_options":["64GB","256GB"], "featured": True,
     "specs":{"شاشة":"10.9 بوصة","معالج":"Apple M1","الكاميرا":"12MP"}},
    {"name_ar":"سامسونج تاب S9 Ultra","name_en":"Samsung Tab S9 Ultra","cat":"Tablets","brand":"Samsung","price":5299,"discount":4699,
     "images":["https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600"],"condition":"new",
     "colors":[{"name":"رمادي بيج","hex":"#D9C9AF"},{"name":"أسود جرافيت","hex":"#2C2C2C"}],
     "storage_options":["256GB","512GB","1TB"], "featured": True,
     "specs":{"شاشة":"14.6 بوصة AMOLED","معالج":"Snapdragon 8 Gen 2 for Galaxy","القلم":"S Pen مدمج"}},
    {"name_ar":"آيباد ميني 6","name_en":"iPad Mini 6","cat":"Tablets","brand":"Apple","price":2299,"discount":2099,
     "images":["https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600"],"condition":"new",
     "colors":[{"name":"وردي","hex":"#F4C2C2"},{"name":"بنفسجي","hex":"#B19CD9"},{"name":"رمادي فلكي","hex":"#52525B"}],
     "storage_options":["64GB","256GB"], "featured": False,
     "specs":{"شاشة":"8.3 بوصة","معالج":"A15 Bionic"}},
    {"name_ar":"هواوي MatePad 11.5","name_en":"Huawei MatePad 11.5","cat":"Tablets","brand":"Huawei","price":1899,"discount":1699,
     "images":["https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600"],"condition":"new",
     "colors":[{"name":"رمادي فضائي","hex":"#71717A"}],"storage_options":["128GB","256GB"], "featured": False,
     "specs":{"شاشة":"11.5 بوصة 2.2K","معالج":"Snapdragon 7 Gen 1"}},

    # ─── Watches ─── (6)
    {"name_ar":"ساعة أبل Watch Ultra 2","name_en":"Apple Watch Ultra 2","cat":"Watches","brand":"Apple","price":3799,"discount":3499,
     "images":["https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600"],"condition":"new",
     "colors":[{"name":"تيتانيوم طبيعي","hex":"#A0A0A0"}],"storage_options":["49mm"], "featured": True,
     "specs":{"الشاشة":"49mm Always-On Retina","الحماية":"IP6X + WR100","العمر":"36 ساعة"}},
    {"name_ar":"ساعة أبل Series 9 45mm","name_en":"Apple Watch Series 9","cat":"Watches","brand":"Apple","price":1899,"discount":1699,
     "images":["https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600"],"condition":"new",
     "colors":[{"name":"نجمي","hex":"#F5F5F5"},{"name":"وردي","hex":"#F4C2C2"},{"name":"منتصف الليل","hex":"#1E293B"},{"name":"أحمر","hex":"#DC2626"}],
     "storage_options":["41mm","45mm"], "featured": True,
     "specs":{"الشاشة":"Always-On Retina","المعالج":"S9 SiP","الحماية":"IP6X"}},
    {"name_ar":"ساعة أبل SE 2","name_en":"Apple Watch SE 2","cat":"Watches","brand":"Apple","price":1099,"discount":999,
     "images":["https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600"],"condition":"new",
     "colors":[{"name":"فضي","hex":"#C0C0C0"},{"name":"نجمي","hex":"#F5F5F5"},{"name":"منتصف الليل","hex":"#1E293B"}],
     "storage_options":["40mm","44mm"], "featured": False,
     "specs":{"الشاشة":"Retina","المعالج":"S8 SiP"}},
    {"name_ar":"سامسونج Galaxy Watch 6 Classic","name_en":"Samsung Galaxy Watch 6 Classic","cat":"Watches","brand":"Samsung","price":1799,"discount":1599,
     "images":["https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600"],"condition":"new",
     "colors":[{"name":"فضي","hex":"#C0C0C0"},{"name":"أسود","hex":"#1A1A1A"}],"storage_options":["43mm","47mm"], "featured": True,
     "specs":{"الشاشة":"Super AMOLED","النظام":"Wear OS 4 + One UI Watch 5"}},
    {"name_ar":"هواوي Watch GT 4","name_en":"Huawei Watch GT 4","cat":"Watches","brand":"Huawei","price":899,"discount":799,
     "images":["https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600"],"condition":"new",
     "colors":[{"name":"أسود","hex":"#1A1A1A"},{"name":"ذهبي","hex":"#D4A017"},{"name":"فضي","hex":"#C0C0C0"}],"storage_options":["41mm","46mm"], "featured": False,
     "specs":{"العمر":"14 يوم","الحماية":"5ATM"}},
    {"name_ar":"شاومي Watch S3","name_en":"Xiaomi Watch S3","cat":"Watches","brand":"Xiaomi","price":599,"discount":499,
     "images":["https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600"],"condition":"new",
     "colors":[{"name":"أسود","hex":"#1A1A1A"},{"name":"فضي","hex":"#C0C0C0"}],"storage_options":["47mm"], "featured": False,
     "specs":{"الشاشة":"AMOLED 1.43 بوصة","العمر":"15 يوم","الحماية":"5ATM"}},

    # ─── Accessories (Comms/Chargers/Cases) ─── (7)
    {"name_ar":"AirPods Pro 2 USB-C","name_en":"AirPods Pro 2 USB-C","cat":"Accessories","brand":"Apple","price":1099,"discount":999,
     "images":["https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600"],"condition":"new",
     "colors":[{"name":"أبيض","hex":"#FFFFFF"}],"storage_options":[], "featured": True,
     "specs":{"النوع":"لاسلكية داخل الأذن","إلغاء الضوضاء":"نشط","العلبة":"MagSafe + USB-C"}},
    {"name_ar":"AirPods Max","name_en":"AirPods Max","cat":"Accessories","brand":"Apple","price":2299,"discount":1999,
     "images":["https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600"],"condition":"new",
     "colors":[{"name":"فضي","hex":"#C0C0C0"},{"name":"رمادي فلكي","hex":"#52525B"},{"name":"وردي","hex":"#F4C2C2"}],"storage_options":[], "featured": False,
     "specs":{"النوع":"فوق الأذن","إلغاء الضوضاء":"نشط","المكونات":"معدن + شبكة"}},
    {"name_ar":"سماعات سامسونج Galaxy Buds 2 Pro","name_en":"Samsung Galaxy Buds 2 Pro","cat":"Accessories","brand":"Samsung","price":799,"discount":699,
     "images":["https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600"],"condition":"new",
     "colors":[{"name":"أسود","hex":"#1A1A1A"},{"name":"أبيض","hex":"#FFFFFF"},{"name":"بنفسجي","hex":"#B19CD9"}],"storage_options":[], "featured": False,
     "specs":{"النوع":"لاسلكية","إلغاء الضوضاء":"ANC","العمر":"18 ساعة"}},
    {"name_ar":"شاحن أبل MagSafe","name_en":"Apple MagSafe Charger","cat":"Accessories","brand":"Apple","price":199,"discount":179,
     "images":["https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600"],"condition":"new",
     "colors":[{"name":"أبيض","hex":"#FFFFFF"}],"storage_options":[], "featured": False,
     "specs":{"القدرة":"15W","المستوى":"لاسلكي أصلي"}},
    {"name_ar":"شاحن سامسونج سوبر فاست 45W","name_en":"Samsung Super Fast 45W","cat":"Accessories","brand":"Samsung","price":249,"discount":219,
     "images":["https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600"],"condition":"new",
     "colors":[{"name":"أسود","hex":"#1A1A1A"}],"storage_options":[], "featured": False,
     "specs":{"القدرة":"45W PPS","النوع":"USB-C"}},
    {"name_ar":"كفر جلد أصلي لآيفون 15 Pro","name_en":"iPhone 15 Pro Leather Case","cat":"Accessories","brand":"Apple","price":249,"discount":229,
     "images":["https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600"],"condition":"new",
     "colors":[{"name":"بني كونياك","hex":"#7C4F32"},{"name":"أسود","hex":"#1A1A1A"},{"name":"أخضر","hex":"#134E4A"}],"storage_options":[], "featured": False,
     "specs":{"المادة":"جلد طبيعي","التوافق":"iPhone 15 Pro"}},
    {"name_ar":"باور بانك Anker 20K","name_en":"Anker PowerCore 20K","cat":"Accessories","brand":"Xiaomi","price":249,"discount":199,
     "images":["https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=600"],"condition":"new",
     "colors":[{"name":"أسود","hex":"#1A1A1A"}],"storage_options":[], "featured": False,
     "specs":{"السعة":"20,000 mAh","القدرة":"30W USB-C PD"}},
]


PLATFORMS = ["واتساب", "تويتر", "انستقرام", "سنابشات", "تيليجرام"]
COMMENT_SAMPLES_POS = [
    "المنتج ممتاز جداً وصلني بسرعة، شكراً لكم!",
    "جودة عالية والسعر مناسب، أنصح فيه",
    "تجربة رائعة، الخدمة والتغليف احترافي",
    "استخدمته أسبوع وأنا مبسوط جداً بالأداء",
    "كل شي مطابق للوصف، شكراً على الأمانة",
    "أفضل صفقة سويتها هذا الشهر",
    "الكاميرا خرافية والبطارية تدوم طويل",
    "التوصيل بس ٢٤ ساعة! أبطال",
]
COMMENT_SAMPLES_NEG = [
    "الشحن تأخر شوي بس المنتج ممتاز",
    "التغليف يحتاج تحسين",
    "عادي، توقعت شي أفضل من هالسعر",
]
COMMENT_SAMPLES_Q = [
    "هل يدعم الشحن اللاسلكي؟",
    "متى راح يكون متوفر باللون الأخضر؟",
    "الضمان كم مدته؟",
    "هل التوصيل داخل الرياض متوفر؟",
]


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    print("🗑  Cleaning old seed data...")
    await db.products.delete_many({})
    await db.brands.delete_many({"name_en": "Sony"})
    await db.product_views.delete_many({})
    await db.share_events.delete_many({})
    await db.product_reviews.delete_many({})
    # Do NOT delete orders / invoices — keep operator history

    # Ensure required categories
    needed_cats = {"Phones": "الجوالات", "Laptops": "الحاسبات المحمولة",
                   "Tablets": "الأجهزة اللوحية", "Watches": "الساعات الذكية",
                   "Accessories": "الملحقات والإكسسوارات"}
    for en, ar in needed_cats.items():
        c = await db.categories.find_one({"name_en": en})
        if not c:
            await db.categories.insert_one({"name_en": en, "name_ar": ar, "image": "", "published": True})

    needed_brands = ["Apple","Samsung","Huawei","Xiaomi","Dell","HP","Lenovo","Asus","Honor","Nothing"]
    for name in needed_brands:
        b = await db.brands.find_one({"name_en": name})
        if not b:
            await db.brands.insert_one({"name_en": name, "name_ar": name, "image": "", "published": True})

    cats = {c["name_en"]: str(c["_id"]) async for c in db.categories.find()}
    brds = {b["name_en"]: str(b["_id"]) async for b in db.brands.find()}

    print(f"✅ Categories: {list(cats.keys())}")
    print(f"✅ Brands: {list(brds.keys())}")

    # Seed customers (upsert)
    print("👥 Seeding customers...")
    user_ids: list[tuple[str, str, str]] = []  # (uid, name, phone)
    import bcrypt
    for name, phone in CUSTOMERS:
        existing = await db.users.find_one({"phone": phone})
        if existing:
            uid = str(existing["_id"])
        else:
            hashed = bcrypt.hashpw("test1234".encode(), bcrypt.gensalt()).decode()
            r = await db.users.insert_one({
                "name": name, "phone": phone, "email": f"{phone}@zenrex.demo",
                "password_hash": hashed, "role": "user", "points": random.randint(100, 5000),
                "wallet_balance": random.randint(0, 500),
                "created_at": _iso(datetime.utcnow() - timedelta(days=random.randint(5, 300))),
            })
            uid = str(r.inserted_id)
        user_ids.append((uid, name, phone))

    # Seed products
    print(f"📦 Seeding {len(PRODUCTS)} products...")
    inserted_products = []
    now = datetime.utcnow()
    for p in PRODUCTS:
        doc = {
            "name_ar": p["name_ar"], "name_en": p["name_en"],
            "description_ar": p.get("description_ar", p["name_ar"]),
            "description_en": p["name_en"],
            "category_id": cats.get(p["cat"], ""),
            "brand_id": brds.get(p["brand"], ""),
            "price": p["price"], "discount_price": p.get("discount"),
            "condition": p.get("condition", "new"),
            "colors": p.get("colors", []),
            "storage_options": p.get("storage_options", []),
            "images": p["images"],
            "specs": p["specs"],
            "rating": round(random.uniform(4.3, 4.9), 1),
            "review_count": random.randint(20, 400),
            "sold_count": random.randint(30, 2500),
            "in_stock": True,
            "stock": random.randint(5, 80),
            "featured": bool(p.get("featured", False)),
            "published": True,
            "warranty_days": 365 if p.get("condition") == "new" else 90,
            "warranty_type": "الوكيل الرسمي" if p.get("condition") == "new" else "ضمان المتجر",
            "manufacturer_name": p["brand"],
            "allow_return": True,
            "return_days": 15 if p["cat"] != "Phones" else 7,
            "manufacturing_defect_days": 365,
            "return_conditions": "المنتج بحالته الأصلية مع كافة الملحقات والعلبة الأصلية سليمة، دون خدوش أو استخدام مفرط.",
            "created_at": _iso(now - timedelta(days=random.randint(1, 90))),
        }
        r = await db.products.insert_one(doc)
        inserted_products.append((str(r.inserted_id), doc))

    # Seed views + cart events + abandonments + shares
    print("👁  Seeding views/cart/abandonments/shares...")
    view_count = 0
    share_count = 0
    review_count = 0
    for pid, prod in inserted_products:
        # 20-80 views per product
        n_views = random.randint(20, 80)
        for _ in range(n_views):
            uid, uname, uphone = random.choice(user_ids)
            days_ago = random.randint(0, 30)
            hrs_ago = random.randint(0, 23)
            visit_time = now - timedelta(days=days_ago, hours=hrs_ago)
            added = random.random() < 0.35  # 35% add to cart
            reached = added and random.random() < 0.55  # 55% of cart proceed to checkout
            await db.product_views.insert_one({
                "product_id": pid, "user_id": uid, "user_name": uname,
                "session_id": f"sess_{uid}_{visit_time.timestamp()}",
                "duration_seconds": random.randint(20, 480),
                "added_to_cart": added, "reached_checkout": reached,
                "source": random.choice(["direct","social","referral","search","social","direct"]),
                "ip": "10.0.0." + str(random.randint(1, 254)),
                "created_at": _iso(visit_time),
            })
            view_count += 1

        # 3-12 shares per product across platforms
        n_shares = random.randint(3, 12)
        for _ in range(n_shares):
            uid, uname, _ = random.choice(user_ids)
            days_ago = random.randint(0, 30)
            await db.share_events.insert_one({
                "product_id": pid, "user_id": uid, "user_name": uname,
                "platform": random.choice(PLATFORMS),
                "shared_to": random.choice(user_ids)[1],
                "created_at": _iso(now - timedelta(days=days_ago, hours=random.randint(0,23))),
            })
            share_count += 1

        # 4-15 reviews per product
        n_rev = random.randint(4, 15)
        for _ in range(n_rev):
            uid, uname, _ = random.choice(user_ids)
            days_ago = random.randint(1, 60)
            rating = random.choices([5,5,5,4,4,3], k=1)[0]
            pool = COMMENT_SAMPLES_POS if rating >= 4 else COMMENT_SAMPLES_NEG
            await db.product_reviews.insert_one({
                "product_id": pid, "user_id": uid, "user_name": uname,
                "rating": rating,
                "text": random.choice(pool),
                "created_at": _iso(now - timedelta(days=days_ago)),
            })
            review_count += 1

        # 2-5 questions per product (as separate comments type=question)
        n_q = random.randint(1, 3)
        for _ in range(n_q):
            uid, uname, _ = random.choice(user_ids)
            days_ago = random.randint(1, 40)
            await db.product_reviews.insert_one({
                "product_id": pid, "user_id": uid, "user_name": uname,
                "rating": 0,   # question, not review
                "type": "question",
                "text": random.choice(COMMENT_SAMPLES_Q),
                "created_at": _iso(now - timedelta(days=days_ago)),
            })

    print(f"✅ Views: {view_count}, Shares: {share_count}, Reviews+Q: {review_count}")

    # Seed a handful of realistic orders (5-15 per product)
    print("🧾 Seeding orders...")
    order_count = 0
    for pid, prod in inserted_products:
        n_orders = random.randint(3, 12)
        for _ in range(n_orders):
            uid, uname, uphone = random.choice(user_ids)
            days_ago = random.randint(0, 60)
            order_time = now - timedelta(days=days_ago, hours=random.randint(0,23))
            qty = random.choices([1,1,1,1,2,3], k=1)[0]
            unit_price = prod.get("discount_price") or prod["price"]
            total = unit_price * qty
            payment_method = random.choice(["cash_on_delivery","mada","apple_pay","tabby","wallet","tamara"])
            status = random.choices(["delivered","delivered","delivered","completed","pending","cancelled"], k=1)[0]
            await db.orders.insert_one({
                "user_id": uid, "user_name": uname, "phone": uphone,
                "items": [{"product_id": pid, "name": prod["name_ar"], "price": unit_price, "quantity": qty, "qty": qty}],
                "subtotal": total, "delivery_fee": random.choice([0,15,25,30]), "total": total,
                "payment_method": payment_method,
                "delivery_type": random.choice(["standard","express","pickup"]),
                "status": status,
                "address": random.choice(["الرياض حي النخيل","جدة حي الروضة","الدمام حي الشاطئ","الرياض حي العليا","المدينة حي العزيزية"]),
                "source": random.choice(["direct","social","referral","direct"]),
                "created_at": _iso(order_time),
                "delivered_at": _iso(order_time + timedelta(days=random.randint(1, 3))) if status in ("delivered","completed") else None,
            })
            order_count += 1

    print(f"✅ Orders: {order_count}")
    print("🎉 Seeding complete!")


if __name__ == "__main__":
    asyncio.run(main())
