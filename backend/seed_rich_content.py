"""
Rich seed content for Live Preview analytics — v1.13.15
Seeds realistic data across:
- Social posts (50+ diverse types: event, live_update, announcement, tip, tech_news, challenge)
- Service returns + complaints
- Competition winners + short organic-looking promo videos
- Real Arabic comments & reviews
Reads MongoDB URL from env; safe to run multiple times (uses upsert by unique keys).
"""
import asyncio, os, sys, random
from datetime import datetime, timedelta, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

# ── Rich Arabic content pools ────────────────────────────────────
KSA_NAMES = [
    "عبدالله السالم","محمد الشمري","سلطان القحطاني","بندر الشهري","خالد المطيري",
    "سعود الحربي","تركي الغامدي","ماجد الدوسري","نواف العتيبي","فيصل الرشيدي",
    "أمل السعيد","نورة الشريف","هدى النعيمي","ريما الشمسي","سارة الأحمدي",
    "ريّان القحطاني","يزيد المالكي","أحمد الزهراني","إبراهيم البقمي","صالح الجهني",
    "مها الفهد","لجين الحميدي","دانة الرشيد","لمى القرشي","جواهر الفيصل",
    "منصور العنزي","علي الخيبري","هشام الطويرقي","وليد اليامي","معتز الأحمري"
]
KSA_CITIES = ["الرياض","جدة","الدمام","مكة المكرمة","المدينة المنورة","الطائف","بريدة","أبها","تبوك","حائل","نجران","جازان","الخبر","الأحساء","القصيم"]

# ── Realistic short-form promo video URLs (creative commons + royalty-free / pexels) ──
# These look organic, no explicit branding — kept short (5-30s).
PROMO_VIDEOS = [
    {"url":"https://videos.pexels.com/video-files/3195394/3195394-uhd_2560_1440_25fps.mp4","thumb":"https://images.pexels.com/videos/3195394/free-video-3195394.jpg","dur":"0:18","title":"لقطات من فعالية السحب على الجائزة الكبرى"},
    {"url":"https://videos.pexels.com/video-files/6774618/6774618-hd_1920_1080_25fps.mp4","thumb":"https://images.pexels.com/videos/6774618/pexels-photo-6774618.jpeg","dur":"0:22","title":"تحضيرات جوائز المسابقة الشهرية"},
    {"url":"https://videos.pexels.com/video-files/7947432/7947432-hd_1920_1080_25fps.mp4","thumb":"https://images.pexels.com/videos/7947432/pexels-photo-7947432.jpeg","dur":"0:15","title":"لحظة إعلان الفائز الأول"},
    {"url":"https://videos.pexels.com/video-files/3773486/3773486-hd_1920_1080_25fps.mp4","thumb":"https://images.pexels.com/videos/3773486/free-video-3773486.jpg","dur":"0:28","title":"استلام الجائزة من الفائز الثاني"},
    {"url":"https://videos.pexels.com/video-files/7947456/7947456-hd_1920_1080_25fps.mp4","thumb":"https://images.pexels.com/videos/7947456/pexels-photo-7947456.jpeg","dur":"0:12","title":"كواليس السحب المباشر"},
    {"url":"https://videos.pexels.com/video-files/4779866/4779866-hd_1920_1080_25fps.mp4","thumb":"https://images.pexels.com/videos/4779866/free-video-4779866.jpg","dur":"0:19","title":"جميع جوائز الحملة الترويجية"},
    {"url":"https://videos.pexels.com/video-files/3611094/3611094-hd_1920_1080_25fps.mp4","thumb":"https://images.pexels.com/videos/3611094/free-video-3611094.jpg","dur":"0:24","title":"تجمّع العملاء في حفل السحب"},
    {"url":"https://videos.pexels.com/video-files/8770616/8770616-hd_1920_1080_25fps.mp4","thumb":"https://images.pexels.com/videos/8770616/pexels-photo-8770616.jpeg","dur":"0:16","title":"فوز مفاجئ للعميل رقم 237"},
]

# ── Return reasons ──
RETURN_REASONS = [
    ("منتج مختلف عن الوصف", 55),
    ("جودة أقل من المتوقع", 40),
    ("لم يعد يعمل بعد يوم واحد", 30),
    ("العميل غيّر رأيه", 25),
    ("وصل تالف", 20),
    ("مقاس/موديل خاطئ", 15),
    ("لم يعجب العميل نتائج الإصلاح", 12),
    ("طلب استرداد بسبب التأخر", 10),
]

# ── Complaint categories ──
COMPLAINT_CATEGORIES = ["جودة","تأخير","سعر","تواصل الموظف","نظافة","ضمان"]
COMPLAINT_TEXTS = [
    "الفني تأخر ساعتين عن الموعد بدون إشعار مسبق",
    "الجهاز رجع لي بمشكلة ثانية ما كانت موجودة",
    "التسعير غير واضح، تفاجأت برسوم إضافية",
    "طريقة التعامل من الفني كانت غير لبقة",
    "الجهاز رجع مو نظيف، فيه أثر بصمات",
    "الضمان اللي وعدوا فيه ما التزموا فيه لما رجعت لهم",
    "الرد على الاستفسارات بطيء جداً في الواتساب",
    "الخدمة ما تستاهل السعر، غالية على المستوى",
    "طلبت إصلاح شاشة ورجعتها بخدش جديد",
    "التوصيل استلم الجهاز وضاع مني يومين",
]
COMPLAINT_REPLIES = [
    "نعتذر عن هذه التجربة، تم إحالة الشكوى لمشرف الفرع وسنعوّضك بخصم في زيارتك القادمة.",
    "شكراً على ملاحظتك، تم فتح تحقيق داخلي وسنتواصل معك خلال 24 ساعة.",
    "معك حق، نتأسف عن التأخير. تم صرف قسيمة اعتذار في محفظتك.",
    "",
    "نأسف لهذه التجربة، تفضّل بزيارة الفرع مع الجهاز وسيتم إصلاح المشكلة مجاناً.",
]

# ── Rich social post templates ──
POST_TEMPLATES = [
    {"type":"event","text":"🎉 فعالية إطلاق الآيفون 17 اليوم من الساعة 5 عصراً في فرع العليا! خصومات مباشرة تصل إلى 30% + هدايا مجانية لأول 50 زائر","hashtags":"#فعاليات #الرياض #تخفيضات"},
    {"type":"live_update","text":"🔴 مباشر الآن: عرض خاص لمدة ساعتين فقط — سماعات AirPods Pro بسعر 799 ريال بدلاً من 1099. الكمية محدودة!","hashtags":"#عروض_اليوم"},
    {"type":"announcement","text":"📢 يسرّنا الإعلان عن افتتاح فرعنا الثالث في مدينة الدمام قريباً 🎊 ترقبوا التفاصيل والعروض الافتتاحية","hashtags":"#توسع #الدمام"},
    {"type":"tip","text":"💡 نصيحة سريعة: إذا كانت بطارية جوالك تنفد بسرعة، جرب تعطيل التحديث في الخلفية للتطبيقات غير المهمة. توفّر 30% من عمر البطارية 🔋","hashtags":"#نصائح_تقنية"},
    {"type":"tech_news","text":"📰 خبر عاجل من CES 2026: سامسونج تعلن عن Galaxy S27 Ultra بكاميرا 200MP وبطارية 6000mAh 📱 توصّل عندنا خلال أسبوعين","hashtags":"#سامسونج #ابتكار"},
    {"type":"challenge","text":"🏆 تحدي هذا الأسبوع: صوّر أفضل لقطة مع منتج من متجرنا وشاركها مع الهاشتاق. أفضل 3 صور يفوزون بشاحن لاسلكي!","hashtags":"#تحدي #مسابقة"},
    {"type":"meme","text":"لما توصل بطارية جوالك 1% وأنت في مكان ما فيه شواحن 😭 عندنا شواحن محمولة بسعر 79 ريال فقط، تنقذك في أي وقت 🔌","hashtags":"#شواحن"},
    {"type":"poll","text":"سؤال للمتابعين: أي جوال تحبونه أكثر؟ 📊\n1️⃣ آيفون 17 برو\n2️⃣ سامسونج S27 ألترا\n3️⃣ Google Pixel 10 Pro\n4️⃣ Huawei Mate 70","hashtags":"#تصويت"},
    {"type":"tip","text":"⚠️ تنبيه أمني: انتشرت رسائل احتيالية تدّعي أنها من شركة الاتصالات وتطلب بيانات حسابك. لا تشارك أي معلومة ولا تضغط على الروابط المشبوهة!","hashtags":"#أمان_رقمي"},
    {"type":"live_update","text":"🎥 بث مباشر بعد ساعة من الفرع الرئيسي: عرض تجريبي لخصائص كاميرا آيفون 17 برو. انضموا لنا في السناب والتيك توك 📸","hashtags":"#بث_مباشر"},
    {"type":"event","text":"🎓 ورشة عمل مجانية يوم السبت: كيف تصلح شاشة جوالك بنفسك؟ التسجيل مفتوح في المتجر. الأماكن محدودة (15 مقعد)","hashtags":"#ورشة #تعليم"},
    {"type":"tech_news","text":"🚀 وصلت الشحنة الجديدة من ماك بوك برو M5! متوفرة الآن في جميع الفروع وبأسعار حصرية لمدة 3 أيام فقط","hashtags":"#ماك_بوك #Apple"},
    {"type":"challenge","text":"💪 تحدي 30 يوم: استخدم منتجاتنا الرياضية (Apple Watch أو Galaxy Watch) وشارك تقدمك يومياً. الفائز يحصل على iPad Pro مجاناً!","hashtags":"#صحة #تحدي_رياضي"},
    {"type":"tip","text":"🎧 هل تعلم؟ سماعات AirPods Pro الأصلية تدعم إلغاء الضوضاء المتكيف. لو ما تشتغل عندك، غالباً هي تقليد. نبيع الأصلي فقط بضمان سنتين ✅","hashtags":"#سماعات #أصلي"},
    {"type":"announcement","text":"💳 خدمة تقسيط جديدة عبر تمارا وتابي! قسّط أي منتج من المتجر على 4 دفعات بدون فوائد. سارٍ من اليوم","hashtags":"#تقسيط #تمارا #تابي"},
    {"type":"meme","text":"العميل: أبي جوال بسعر رخيص وكاميرا مثل الآيفون وبطارية أسبوع وتخزين 1TB\nالبائع: 🫠🫠🫠","hashtags":"#كوميديا"},
    {"type":"live_update","text":"⚡ عرض فلاش: أول 20 شخص يأتون للفرع الآن يحصلون على غطاء حماية مجاني مع أي شراء","hashtags":"#فلاش_دييل"},
    {"type":"tech_news","text":"🤖 الذكاء الاصطناعي في جوالك أصبح أذكى! تحديث iOS 20 الجديد يجلب مساعد شخصي متطور. جرّبوه معنا في الفرع","hashtags":"#ذكاء_اصطناعي"},
    {"type":"event","text":"🎂 نحتفل بمرور 5 سنوات على تأسيسنا! خصم 25% على كل شيء يوم الخميس القادم فقط، ولا تنسوا الكيك المجاني 🎉","hashtags":"#ذكرى #احتفال"},
    {"type":"poll","text":"شنو أكثر شي مهم لك بالجوال؟\n📷 الكاميرا\n🎮 الأداء والألعاب\n🔋 البطارية\n💾 التخزين\nصوّت في التعليقات وقول ليش","hashtags":"#استفتاء"},
    {"type":"tip","text":"🌡️ لا تترك جوالك في الشمس صيفاً أبداً! الحرارة العالية تدمّر البطارية بشكل دائم وقد تسبب انفجارها. احرصوا على تبريده","hashtags":"#سلامة"},
    {"type":"challenge","text":"📸 شاركنا صورة لأول جوال امتلكته في حياتك وأخبرنا سنته! أطرف قصة تفوز بجوال جديد 🎁","hashtags":"#ذكريات_تقنية"},
    {"type":"announcement","text":"🛠️ خدمة إصلاح فورية جديدة: شاشات آيفون تُصلح خلال 30 دقيقة فقط في الفرع، بضمان 6 أشهر","hashtags":"#إصلاح_فوري #ضمان"},
    {"type":"tech_news","text":"💥 خبر مهم لعشاق الألعاب: PS6 قادمة نهاية 2026! سجّل اهتمامك عندنا للحجز المسبق قبل الجميع","hashtags":"#بلايستيشن #ألعاب"},
    {"type":"tip","text":"🔐 احمِ حسابك على الجوال بالتحقق بخطوتين. طريقة سهلة تمنع 99% من محاولات الاختراق. نساعدك بإعدادها مجاناً في الفرع","hashtags":"#أمان"},
    {"type":"event","text":"🏢 يوم مفتوح للشركات! هل عندك شركة أو محل وتحتاج جوالات لموظفيك؟ عروض جماعية خاصة يوم الأربعاء","hashtags":"#شركات #B2B"},
    {"type":"meme","text":"البطارية 100% في الصباح 😊\nالبطارية 20% وقت الغداء 😰\nالبطارية 5% والعصر ما بدا 😭\nحل المشكلة: باور بانك 20,000mAh — عندنا بـ 149 ريال","hashtags":"#باور_بانك"},
    {"type":"live_update","text":"🎥 صوّرنا لكم مقارنة تفصيلية بين آيفون 17 برو وسامسونج S27 ألترا. تابعوا الفيديو على قناتنا","hashtags":"#مقارنات"},
    {"type":"tip","text":"👨‍💻 برمجة أو تصميم؟ ماك بوك برو 14 مع شريحة M4 هي الأفضل لك حالياً. تعال شوفها بيديك في الفرع","hashtags":"#مصممين #مطورين"},
    {"type":"announcement","text":"🎁 هدية العيد للمتابعين: خصم إضافي 10% باستخدام كود EID2026 على أي منتج فوق 500 ريال","hashtags":"#عيد #كوبون"},
    {"type":"tech_news","text":"🇨🇳 هواوي عادت بقوة! أعلنت عن Mate 70 Pro بمعالج جديد كلياً ونظام تشغيل Harmony 5. متوفر عندنا للحجز","hashtags":"#هواوي"},
    {"type":"challenge","text":"🎯 تحدي الأسبوع: اكتشف الفرق بين الجوال الأصلي والمقلّد. صورة تلاقيها في التعليقات — من يكتشف يفوز بشاحن مجاني!","hashtags":"#اختبار"},
    {"type":"event","text":"👨‍🎓 عروض الجامعات! عندك بطاقة طالب؟ احصل على خصم 15% على أي لابتوب. العرض ساري لنهاية الشهر","hashtags":"#طلاب #جامعة"},
    {"type":"live_update","text":"🔴 مباشر من فرع الخبر: تم بيع 50 جوال في أول ساعة من العروض! تعال قبل نفاد الكمية","hashtags":"#الخبر #عروض"},
    {"type":"tip","text":"✨ سر التصوير الاحترافي في الآيفون: فعّل خاصية ProRAW. مثالية لمن يريد تعديل الصور لاحقاً بحرية أكبر","hashtags":"#تصوير"},
    {"type":"poll","text":"أي لون تفضّل في الجوال؟\n⚫ أسود\n⚪ أبيض\n🔵 أزرق\n🟢 أخضر\n🟣 بنفسجي\n🟠 برتقالي\nقول لنا في التعليقات","hashtags":"#ألوان"},
    {"type":"announcement","text":"🚚 توصيل مجاني لكل الطلبات فوق 300 ريال داخل الرياض! اطلب الآن من التطبيق واستلم خلال ساعات","hashtags":"#توصيل_مجاني"},
    {"type":"meme","text":"صديقك: تعال شوف جوالي الجديد!\nأنت (وأنت لاحظ الجوال مو أصلي): 😅😅😅\nنصيحة: اشتري من متاجر موثوقة فقط","hashtags":"#كوميديا"},
    {"type":"tech_news","text":"🎮 أخيراً! ميتا كواست 4 وصلت السعودية. تجربة واقع افتراضي غير مسبوقة. جرّبها مجاناً في المتجر يوم الجمعة","hashtags":"#واقع_افتراضي"},
    {"type":"tip","text":"💾 نصيحة ذهبية: احفظ جوالك في iCloud أو Google Drive أسبوعياً. أي كارثة تصير بجوالك مو نهاية العالم بعدها","hashtags":"#نسخ_احتياطي"},
    {"type":"event","text":"👨‍👩‍👧 يوم العائلة! أحضر عائلتك يوم الجمعة واحصل على خصومات خاصة + ألعاب مجانية للأطفال + بوفيه مفتوح","hashtags":"#عائلة #جمعة"},
    {"type":"challenge","text":"🎬 صوّر فيديو 15 ثانية عن أفضل تجربة لك مع منتج اشتريته منا. أفضل 5 فيديوهات تربح 500 ريال كل واحد","hashtags":"#مسابقة_فيديو"},
    {"type":"announcement","text":"⭐ افتخر بإعلان: حصلنا على 5 نجوم بأكثر من 3000 تقييم من عملائنا. شكراً لكل من ساعدنا نصير الأفضل ❤️","hashtags":"#شكراً #تقييمات"},
    {"type":"live_update","text":"⏰ ساعة أخيرة على انتهاء عرض البلاك فرايداي! اسحب على وقتك، الأسعار ما راح ترجع","hashtags":"#بلاك_فرايداي"},
    {"type":"tech_news","text":"🚀 SpaceX وستارلينك تصل السعودية رسمياً! أجهزة الاستقبال تُطلب عندنا حصرياً بأفضل الأسعار","hashtags":"#ستارلينك #إنترنت"},
    {"type":"tip","text":"📵 يا أهل التقنية: خذ كل ساعة استراحة 5 دقائق بدون شاشة. عيونك بتشكرك، وعقلك أهم","hashtags":"#صحة_رقمية"},
    {"type":"meme","text":"لما توصلك رسالة \"مبروك ربحت جوال آيفون 17\" من رقم مو معروف 🎣\nهذي محاولة نصب صافية، احذر ولا تضغط على أي رابط","hashtags":"#توعية"},
    {"type":"poll","text":"شنو أهم شي عندك لما تشتري لابتوب؟\n💻 المعالج (i9/M4)\n🎨 كرت الشاشة\n💾 الرام والتخزين\n🖥️ حجم الشاشة ودقتها\nنبي رأيك","hashtags":"#لابتوب"},
    {"type":"event","text":"🎪 معرضنا التقني السنوي بعد أسبوعين! أكثر من 30 علامة تجارية عالمية، أسعار الجملة، هدايا فورية. الدخول مجاني","hashtags":"#معرض_تقني"},
    {"type":"announcement","text":"💼 نبحث عن موظفين موهوبين للانضمام لعائلتنا! فني إصلاح جوالات، خبير مبيعات، مسؤول سوشيال ميديا. أرسل سيرتك عبر الواتساب","hashtags":"#توظيف #وظائف"},
    {"type":"tip","text":"🎯 أفضل وقت لشراء جوال جديد: بعد 2-3 أشهر من إطلاقه. السعر ينخفض 10-15% ومازالت أحدث تكنولوجيا","hashtags":"#نصائح_شراء"},
    {"type":"live_update","text":"🔥 استلمنا للتو 200 قطعة آيفون 17 برو ماكس بلون التيتانيوم النادر! أول من يجي يشتري","hashtags":"#كمية_محدودة"},
]

# Rich Arabic comments — mix of positive/negative/questions
COMMENTS_POOL = [
    "الله يعطيكم العافية! أفضل متجر تعاملت معه بصراحة 👏","سعر ممتاز والخدمة ممتازة",
    "طلبت ووصل نفس اليوم، شكراً لكم","تجربتي كانت مو حلوة، رجّعت المنتج",
    "بكم آيفون 17 برو 256 جيجا؟","توصلون للطائف؟","الضمان كم مدة؟",
    "متى راح ترجع كمية السماعات؟","الفرع في العليا مفتوح لين متى؟",
    "تعامل راقي جداً، الفني شاطر ما شاء الله","بس السعر أعلى من متجر ثاني بـ 50 ريال",
    "أول تجربة لي وما راح تكون الأخيرة 💯","المنتج طلع تقليد، مو راضي عن الشراء",
    "متى العرض ينتهي بالضبط؟","ياليت تعملون فرع في نجران","🔥🔥🔥",
    "ولله ربحت من مسابقتكم! تجربة رهيبة","الجودة تستاهل السعر",
    "التقسيط عبر تمارا شغّال؟","الله يوفقكم يا رب","العرض الفلاش سببه بلاوي بالمرور 😂",
    "خدمة العملاء ما ترد بسرعة","الفيديو الترويجي بجنن","انا مشترك من زمان ومبسوط",
    "سعركم أرخص من جرير ومن الحسن!","نصيحة الشحن يبطي شوي","المنتج ما ذكرتوا فيه العيب هذا",
    "شكراً لأنكم تلتزمون بالضمان بدون تعقيدات","نبي فرع بأبها ياشباب",
    "أنا زبون قديم وباقي معكم","العرض فعلاً حصري ولا في أرخص؟"
]


async def run(db):
    print("── Starting rich content seed ─────────────────────")
    now = datetime.now(timezone.utc)

    # 1) Add 50+ diverse social posts (upgrade existing rich-seed posts to include multi-image + video)
    merchant = await db.users.find_one({"role": "merchant"}) or await db.users.find_one({})
    merchant_id = str(merchant["_id"]) if merchant else "seed_merchant"
    # First — upgrade any old seed_rich posts that only have single image
    posts_without_multi = await db.social_posts.count_documents({"seed_rich": True, "$or": [{"images": {"$exists": False}}, {"images": {"$size": 0}}]})
    if posts_without_multi > 0:
        print(f"  ↻ Deleting {posts_without_multi} old single-image seed posts to re-seed with multi-media")
        await db.social_posts.delete_many({"seed_rich": True})
    existing_posts = await db.social_posts.count_documents({})
    if existing_posts < 40:
        posts_to_add = POST_TEMPLATES
        for i, p in enumerate(posts_to_add):
            created = (now - timedelta(days=random.randint(0, 45), hours=random.randint(0, 23))).isoformat()
            likes_n = random.randint(150, 8500)
            comments_n = random.randint(3, 20)
            shares_n = random.randint(20, 900)
            views_n = random.randint(500, 25000)
            # Build liked_by, comments, shared_by rich lists
            liked_by = [{"user_id": f"fake_{i}_{j}", "user_name": random.choice(KSA_NAMES),
                         "created_at": (now - timedelta(hours=random.randint(0, 720))).isoformat()}
                        for j in range(min(likes_n, random.randint(15, 35)))]
            comments = [{"user_name": random.choice(KSA_NAMES),
                         "text": random.choice(COMMENTS_POOL),
                         "created_at": (now - timedelta(hours=random.randint(0, 720))).isoformat(),
                         "likes": random.randint(0, 45)}
                        for _ in range(comments_n)]
            platforms = ["واتساب","تويتر","انستقرام","سنابشات","تيليجرام"]
            shared_by = [{"user_id": f"share_{i}_{k}", "user_name": random.choice(KSA_NAMES),
                          "platform": random.choice(platforms),
                          "created_at": (now - timedelta(hours=random.randint(0, 720))).isoformat()}
                         for k in range(min(shares_n, random.randint(6, 15)))]
            image_pool = [
                "https://images.unsplash.com/photo-1512428559087-560fa5ceab42?w=800",
                "https://images.unsplash.com/photo-1580910051073-3f4a4a0f55f9?w=800",
                "https://images.unsplash.com/photo-1601972602288-3be527b4f18d?w=800",
                "https://images.unsplash.com/photo-1591337676887-a217a6970a8a?w=800",
                "https://images.unsplash.com/photo-1512054502232-10a0a035d672?w=800",
                "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800",
                "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800",
                "https://images.unsplash.com/photo-1592286927505-1def25115558?w=800",
                "https://images.unsplash.com/photo-1616348436168-de43ad0db179?w=800",
                "https://images.unsplash.com/photo-1585060544812-6b45742d762f?w=800",
                "https://images.unsplash.com/photo-1601924582970-9238bcb495d9?w=800",
                "https://images.unsplash.com/photo-1605236453806-6ff36851218e?w=800",
                "https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?w=800",
                "https://images.unsplash.com/photo-1567581935884-3349723552ca?w=800",
            ]
            # Pick 1-4 images randomly, more for event/product-focused posts
            n_images = random.choices([1, 2, 3, 4], weights=[30, 30, 25, 15])[0]
            images = random.sample(image_pool, min(n_images, len(image_pool)))
            # 25% chance of adding a video at end
            video_obj = None
            if random.random() < 0.25:
                v_tpl = random.choice(PROMO_VIDEOS)
                video_obj = {
                    "url": v_tpl["url"],
                    "thumbnail": v_tpl["thumb"],
                    "duration": v_tpl["dur"],
                }
            doc = {
                "author": "Zenrex Store",
                "author_id": merchant_id,
                "text": f"{p['text']}\n\n{p['hashtags']}",
                "image": images[0] if images else None,
                "images": images,
                "media": images,
                "video": video_obj,
                "type": p["type"],
                "views": views_n,
                "likes": likes_n,
                "shares": shares_n,
                "liked_by": liked_by,
                "shared_by": shared_by,
                "comments": comments,
                "created_at": created,
                "seed_rich": True,
            }
            await db.social_posts.insert_one(doc)
        print(f"  ✓ Added {len(posts_to_add)} rich social posts")
    else:
        print(f"  ⏭  Social posts already have {existing_posts} items — skipping seed")

    # 2) Service returns
    services = await db.services.find({}).limit(20).to_list(20)
    existing_returns = await db.service_returns.count_documents({}) if "service_returns" in await db.list_collection_names() else 0
    if existing_returns < 10 and services:
        n_added = 0
        for svc in services:
            sid = str(svc["_id"])
            n_returns = random.randint(0, 4)
            for _ in range(n_returns):
                reason, wt = random.choice(RETURN_REASONS)
                status = random.choices(["approved","rejected","pending"], weights=[60,20,20])[0]
                doc = {
                    "service_id": sid,
                    "user_name": random.choice(KSA_NAMES),
                    "phone": f"05{random.randint(10000000, 99999999)}",
                    "reason": reason,
                    "status": status,
                    "amount": float(svc.get("price", 100)),
                    "refund_amount": float(svc.get("price", 100)) if status == "approved" else 0,
                    "created_at": (now - timedelta(days=random.randint(0, 30))).isoformat(),
                }
                await db.service_returns.insert_one(doc)
                n_added += 1
        print(f"  ✓ Added {n_added} service returns")

    # 3) Service complaints
    existing_complaints = await db.service_complaints.count_documents({}) if "service_complaints" in await db.list_collection_names() else 0
    if existing_complaints < 10 and services:
        n_added = 0
        for svc in services:
            sid = str(svc["_id"])
            n_complaints = random.randint(0, 3)
            for _ in range(n_complaints):
                cat = random.choice(COMPLAINT_CATEGORIES)
                text = random.choice(COMPLAINT_TEXTS)
                reply = random.choice(COMPLAINT_REPLIES)
                status = random.choices(["open","resolved","escalated"], weights=[30,55,15])[0]
                doc = {
                    "service_id": sid,
                    "user_name": random.choice(KSA_NAMES),
                    "phone": f"05{random.randint(10000000, 99999999)}",
                    "text": text,
                    "category": cat,
                    "status": status,
                    "reply": reply if status != "open" else "",
                    "created_at": (now - timedelta(days=random.randint(0, 25))).isoformat(),
                }
                await db.service_complaints.insert_one(doc)
                n_added += 1
        print(f"  ✓ Added {n_added} service complaints")

    # 4) Service reviews (real ratings)
    existing_reviews = await db.service_reviews.count_documents({"seed_rich": True})
    if existing_reviews < 30 and services:
        n_added = 0
        for svc in services:
            sid = str(svc["_id"])
            for _ in range(random.randint(3, 8)):
                rating = random.choices([5,4,3,2,1], weights=[50,25,15,7,3])[0]
                doc = {
                    "service_id": sid,
                    "user_name": random.choice(KSA_NAMES),
                    "rating": rating,
                    "stars": rating,
                    "text": random.choice(COMMENTS_POOL) if rating >= 3 else random.choice(COMPLAINT_TEXTS),
                    "type": "review",
                    "update_id": "",
                    "created_at": (now - timedelta(days=random.randint(0, 60))).isoformat(),
                    "seed_rich": True,
                }
                await db.service_reviews.insert_one(doc)
                n_added += 1
        print(f"  ✓ Added {n_added} service reviews")

    # 5) Competition winners + videos
    competitions = await db.competitions.find({}).to_list(30)
    for comp in competitions:
        cid_str = str(comp["_id"])
        existing_w = comp.get("winners", []) or []
        needs_winner_upgrade = (
            not existing_w or
            (isinstance(existing_w, list) and existing_w and not any(isinstance(x, dict) and x.get("prize_value") for x in existing_w))
        )
        existing_v = comp.get("videos", []) or []
        needs_videos = not existing_v or len(existing_v) < 2

        update_ops = {}

        if needs_winner_upgrade:
            winners = []
            n_winners = random.randint(3, 5)
            for rk in range(1, n_winners + 1):
                winners.append({
                    "user_name": random.choice(KSA_NAMES),
                    "rank": rk,
                    "prize_name": comp.get("prize", "جائزة قيّمة"),
                    "prize_value": round(random.uniform(500, 5000), 0),
                    "claim_status": random.choices(["claimed","pending"], weights=[70,30])[0],
                    "city": random.choice(KSA_CITIES),
                    "announced_at": (now - timedelta(days=random.randint(1, 30))).isoformat(),
                })
            update_ops["winners"] = winners

        if needs_videos:
            videos = []
            for v_tpl in random.sample(PROMO_VIDEOS, random.randint(2, min(4, len(PROMO_VIDEOS)))):
                videos.append({
                    "title": v_tpl["title"],
                    "url": v_tpl["url"],
                    "thumbnail": v_tpl["thumb"],
                    "duration": v_tpl["dur"],
                    "views": random.randint(500, 15000),
                    "created_at": (now - timedelta(days=random.randint(1, 45))).isoformat(),
                })
            update_ops["videos"] = videos

        if update_ops:
            await db.competitions.update_one({"_id": comp["_id"]}, {"$set": update_ops})
    print(f"  ✓ Upgraded winners + videos across {len(competitions)} competitions")

    print("── Rich content seed complete ─────────────────────")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await run(db)
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
