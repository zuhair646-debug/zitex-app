"""Iter63 UI seed: TEST draw comp (is_test) + TEST officer-change comp + 2nd chamber officer. Run with 'clean' to remove."""
import os, sys
from datetime import datetime, timezone, timedelta
import bcrypt
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
NOW = datetime.now(timezone.utc)
PHONE2, PW2 = '0550009996', 'officer63pw'

if len(sys.argv) > 1 and sys.argv[1] == 'clean':
    ids = [str(c['_id']) for c in db.competitions.find({'title': {'$regex': '^TEST_ITER63'}}, {'_id': 1})]
    db.competitions.delete_many({'title': {'$regex': '^TEST_ITER63'}})
    for col in ('competition_entries', 'draw_sessions', 'competition_videos'):
        db[col].delete_many({'competition_id': {'$in': ids}})
    u = db.users.find_one({'phone': PHONE2})
    if u:
        db.notifications.delete_many({'user_id': str(u['_id'])})
    db.users.delete_one({'phone': PHONE2})
    print('cleaned', len(ids))
    sys.exit()

ch = str(db.users.find_one({'phone': '0550000000'})['_id'])
me = str(db.users.find_one({'phone': '0509999999'})['_id'])
db.users.update_one({'phone': PHONE2}, {'$set': {'name': 'TEST Officer 63', 'role': 'chamber', 'phone': PHONE2,
                    'password_hash': bcrypt.hashpw(PW2.encode(), bcrypt.gensalt()).decode()}}, upsert=True)
o2 = str(db.users.find_one({'phone': PHONE2})['_id'])
base = {'prize': 'TEST جائزة', 'status': 'open', 'chamber_supervised': True, 'assigned_chamber_employee_id': ch,
        'created_by_merchant': me, 'start_date': (NOW - timedelta(days=5)).isoformat(), 'winners': [], 'max_participants': 1000,
        'competition_type': 'general', 'created_at': (NOW + timedelta(minutes=5)).isoformat(), 'description': 'اختبار'}
draw = str(db.competitions.insert_one({**base, 'title': 'TEST_ITER63_DRAW', 'prize_count': 2, 'is_test': True, 'permit_number': 'P-63D',
                                       'end_date': (NOW - timedelta(hours=2)).isoformat(), 'draw_date': ''}).inserted_id)
chg = str(db.competitions.insert_one({**base, 'title': 'TEST_ITER63_CHANGE', 'prize_count': 1, 'permit_number': 'P-63C',
                                      'end_date': (NOW + timedelta(days=5)).isoformat(), 'draw_date': ''}).inserted_id)
for i in range(6):
    db.competition_entries.insert_one({'competition_id': draw, 'user_id': f'TEST_u63_{i}', 'user_name': f'TEST مشارك {i}',
                                       'user_phone': f'05000009{i:02d}', 'created_at': (NOW - timedelta(hours=10 - i)).isoformat()})
db.competition_entries.insert_one({'competition_id': chg, 'user_id': 'TEST_u63_x', 'user_name': 'TEST مشارك X',
                                   'user_phone': '0500000999', 'created_at': NOW.isoformat()})
print('DRAW', draw); print('CHANGE', chg); print('O2', o2)
