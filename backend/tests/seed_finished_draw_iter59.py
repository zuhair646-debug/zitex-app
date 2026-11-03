"""Helper: create a small TEST is_test comp with a finished verified draw (for DrawProof UI). Prints competition id.
Usage: python3 tests/seed_finished_draw_iter59.py   |  cleanup: python3 tests/seed_finished_draw_iter59.py --delete <cid>"""
import os, sys, requests
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv('/app/backend/.env'); load_dotenv('/app/frontend/.env')
BASE = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/') + '/api'
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
if len(sys.argv) > 2 and sys.argv[1] == '--delete':
    cid = sys.argv[2]
    db.competitions.delete_one({'_id': ObjectId(cid)}); db.competition_entries.delete_many({'competition_id': cid}); db.draw_sessions.delete_many({'competition_id': cid})
    sys.exit(0)
j = requests.post(f'{BASE}/auth/login', json={'phone': '0550000000', 'password': 'chamber2025'}).json()
H = {'Authorization': f"Bearer {j['token']}"}
now = datetime.now(timezone.utc)
cid = str(db.competitions.insert_one({'title': 'TEST_ITER59 DrawProof', 'prize': 'TEST', 'prize_count': 2, 'competition_type': 'general',
    'status': 'open', 'is_test': True, 'chamber_supervised': True, 'assigned_chamber_employee_id': j['user']['id'],
    'end_date': (now - timedelta(hours=1)).isoformat(), 'winners': [], 'draw_history': [], 'created_at': now.isoformat()}).inserted_id)
db.competition_entries.insert_many([{'competition_id': cid, 'user_id': f'dp{i}', 'user_name': f'مشارك {i}', 'user_phone': f'05000002{i:02d}',
                                     'created_at': now.isoformat()} for i in range(8)])
sid = requests.post(f'{BASE}/draws/{cid}/sessions', headers=H, json={'kind': 'initial'}).json()['id']
requests.post(f'{BASE}/draws/sessions/{sid}/start', headers=H, json={'officer_code': '246810'}, timeout=60)
requests.post(f'{BASE}/draws/sessions/{sid}/pick', headers=H, json={'count': 2})
requests.post(f'{BASE}/draws/sessions/{sid}/finish', headers=H)
print(cid, sid, requests.get(f'{BASE}/draws/sessions/{sid}/verify').json()['checks'])
