"""Iter61 UI seed: waiting / ugc-ended / open-last-day comps assigned to chamber 0550000000. Run with 'clean' to remove."""
import os, sys
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
KSA = timezone(timedelta(hours=3))
NOW = datetime.now(timezone.utc)
D = lambda n: (NOW.astimezone(KSA).date() + timedelta(days=n)).isoformat()

if len(sys.argv) > 1 and sys.argv[1] == 'clean':
    ids = [str(c['_id']) for c in db.competitions.find({'title': {'$regex': '^TEST_ITER61'}}, {'_id': 1})]
    db.competitions.delete_many({'title': {'$regex': '^TEST_ITER61'}})
    for col in ('competition_entries', 'draw_sessions', 'competition_videos'):
        db[col].delete_many({'competition_id': {'$in': ids}})
    print('cleaned', len(ids))
    sys.exit()

ch = str(db.users.find_one({'phone': '0550000000'})['_id'])
me = str(db.users.find_one({'phone': '0509999999'})['_id'])
base = {'prize': 'آيفون', 'prize_count': 1, 'status': 'open', 'chamber_supervised': True, 'assigned_chamber_employee_id': ch,
        'permit_number': 'P-61', 'created_by_merchant': me, 'start_date': D(-5), 'winners': [], 'max_participants': 1000,
        'joined_count': 1, 'created_at': NOW.isoformat(), 'description': 'اختبار'}
for name, kw in (('waiting', {'competition_type': 'general', 'end_date': D(-1), 'draw_date': D(2)}),
                 ('ugc', {'competition_type': 'ugc_video', 'end_date': D(-2), 'draw_date': ''}),
                 ('open', {'competition_type': 'general', 'end_date': D(0), 'draw_date': D(0)})):
    cid = str(db.competitions.insert_one({**base, **kw, 'title': f'TEST_ITER61_UI_{name}'}).inserted_id)
    db.competition_entries.insert_one({'competition_id': cid, 'user_id': 'tu61', 'user_name': 'X', 'user_phone': '0500000999',
                                       'created_at': NOW.isoformat()})
    print(name, cid)
