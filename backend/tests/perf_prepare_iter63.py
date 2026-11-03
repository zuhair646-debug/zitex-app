"""Iter63: time POST /draws/{cid}/sessions (prepare) x3 on a fresh TEST comp, then clean up."""
import time, requests
from bson import ObjectId
from test_chamber_flags_iter60 import BASE, db, login, NOW, PAST2
from datetime import timedelta

H, uid = login('0550000000', 'chamber2025')
for i in range(3):
    cid = str(db.competitions.insert_one({'title': 'TEST_ITER63_PERF', 'prize': 'T', 'prize_count': 1, 'competition_type': 'general',
        'status': 'open', 'is_test': True, 'chamber_supervised': True, 'assigned_chamber_employee_id': uid, 'permit_number': 'P',
        'start_date': PAST2, 'end_date': (NOW - timedelta(hours=1)).isoformat(), 'draw_date': '', 'winners': [], 'created_at': NOW.isoformat()}).inserted_id)
    db.competition_entries.insert_many([{'competition_id': cid, 'user_id': f'TEST_p{j}', 'user_name': 'P', 'created_at': NOW.isoformat()} for j in range(5)])
    t = time.time(); r = requests.post(f'{BASE}/draws/{cid}/sessions', headers=H, json={'kind': 'initial'}, timeout=60)
    print('prepare', r.status_code, f'{time.time() - t:.2f}s', r.json().get('beacon_commit_round'))
    db.competitions.delete_one({'_id': ObjectId(cid)})
    for col in ('competition_entries', 'draw_sessions'):
        db[col].delete_many({'competition_id': cid})
t = time.time(); requests.get('https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/latest', timeout=10)
print(f'drand direct {time.time() - t:.2f}s')
