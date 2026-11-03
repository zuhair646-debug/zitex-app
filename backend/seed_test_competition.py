"""Seed a TEST chamber-supervised competition with 15,000 real-looking Saudi entries (no login accounts).
Usage: python seed_test_competition.py [count]   — delete it from Merchant ▸ Competitions (is_test allows deletion)."""
import asyncio, os, random, sys
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
FIRST = "محمد أحمد عبدالله خالد فهد سعود عبدالرحمن فيصل تركي سلطان نايف بندر ماجد ياسر عمر علي حسن إبراهيم يوسف راكان مشعل نواف بدر طلال سارة نورة ريم لمى هيا العنود جواهر شهد غادة منيرة أمل دانة رغد لينا جود ريما مها هند وعد أسيل".split()
LAST = "العتيبي القحطاني الشهري الدوسري الحربي المطيري الزهراني الغامدي الشمري العنزي السبيعي الرشيدي البقمي المالكي الجهني العمري السهلي الخالدي التميمي الشهراني العسيري الحارثي اليامي الصاعدي البلوي".split()


async def main(n):
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    off = await db.users.find_one({'phone': '0550000000'})
    merchant = await db.users.find_one({'phone': '0509999999'})
    now = datetime.now(timezone.utc)
    r = await db.competitions.insert_one({
        'title': 'مسابقة تجريبية — 15 ألف مشارك', 'description': 'مسابقة اختبار لنظام السحب الموثق (تُحذف بعد التجربة)',
        'prize': 'آيفون 17 برو ماكس', 'prize_count': 3, 'competition_type': 'general', 'status': 'open', 'is_test': True,
        'chamber_supervised': True, 'permit_number': 'CC-TEST-15000', 'assigned_chamber_employee_id': str(off['_id']) if off else '',
        'created_by_merchant': str(merchant['_id']) if merchant else '', 'start_date': (now - timedelta(days=30)).isoformat(),
        'end_date': (now - timedelta(minutes=5)).isoformat(), 'draw_date': '', 'joined_count': n, 'winners': [], 'draw_history': [],
        'created_at': now.isoformat()})
    cid = str(r.inserted_id)
    rnd = random.Random(15000)
    docs = []
    for i in range(n):
        docs.append({'competition_id': cid, 'user_id': f'test-{cid[-6:]}-{i:05d}', 'user_name': f'{rnd.choice(FIRST)} {rnd.choice(LAST)}',
                     'user_phone': f'05{rnd.randint(0, 99999999):08d}', 'entry_type': 'test',
                     'created_at': (now - timedelta(days=30) + timedelta(seconds=i * 170)).isoformat()})
    for i in range(0, n, 2000):
        await db.competition_entries.insert_many(docs[i:i + 2000])
    print(cid, n)

asyncio.run(main(int(sys.argv[1]) if len(sys.argv) > 1 else 15000))
