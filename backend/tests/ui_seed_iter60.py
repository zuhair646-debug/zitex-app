"""Iter60 UI seed: chamber-assigned comps in each live state. Usage: python3 ui_seed_iter60.py [seed|clean]"""
import os, sys, json
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
NOW = datetime.now(timezone.utc)
iso = lambda d: (NOW + timedelta(days=d)).isoformat()
TAG = 'TEST_UI60'

if sys.argv[1:] == ['clean']:
    ids = [str(c['_id']) for c in db.competitions.find({'tag': TAG})]
    for col in ('competition_entries', 'draw_sessions'):
        db[col].delete_many({'competition_id': {'$in': ids}})
    print('deleted', db.competitions.delete_many({'tag': TAG}).deleted_count)
    sys.exit()

ch = str(db.users.find_one({'phone': '0550000000'})['_id'])
me = str(db.users.find_one({'phone': '0509999999'})['_id'])
base = dict(tag=TAG, prize='TEST', prize_count=1, competition_type='general', chamber_supervised=True,
            assigned_chamber_employee_id=ch, permit_number='UI-60', created_by_merchant=me, start_date=iso(-5),
            purchase_mode='single', tickets_mode='one', max_tickets_per_user=1, max_participants=1000, winners=[])
out = {}
for key, kw in {
    'open': dict(title='TEST_UI60 open', status='open', end_date=iso(4), draw_date=iso(5)),
    'waiting': dict(title='TEST_UI60 waiting', status='open', end_date=iso(-1), draw_date=iso(2)),
    'drawn': dict(title='TEST_UI60 drawn', status='ended', end_date=iso(-3), draw_date='', winners_finalized_at=iso(-1),
                  winners=[{'user_id': 'u60a', 'user_name': 'Winner Sixty', 'user_phone': '0501112233', 'prize_status': 'pending', 'won_at': iso(-1)}]),
}.items():
    cid = str(db.competitions.insert_one({**base, **kw, 'created_at': iso(0)}).inserted_id)
    db.competition_entries.insert_many([{'competition_id': cid, 'user_id': f'u60{c}', 'user_name': f'P {c}', 'user_phone': '0500000111',
                                         'created_at': iso(-2)} for c in 'abc'])
    out[key] = cid
print(json.dumps(out))
