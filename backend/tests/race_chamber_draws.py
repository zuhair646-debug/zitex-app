"""Race check: parallel POST /api/draws/{cid}/sessions must yield a single open session; parallel finish must push draw_history once."""
import asyncio, os
from concurrent.futures import ThreadPoolExecutor
import requests
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
load_dotenv('/app/backend/.env'); load_dotenv('/app/frontend/.env')
B = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/') + '/api'


async def go(fn):
    cli = AsyncIOMotorClient(os.environ['MONGO_URL'])
    try:
        return await fn(cli[os.environ['DB_NAME']])
    finally:
        cli.close()


async def seed(db):
    r = await db.competitions.insert_one({'title': 'TEST_RACE', 'prize': 'x', 'prize_count': 2, 'status': 'open', 'created_at': '2026-01-01'})
    cid = str(r.inserted_id)
    await db.competition_entries.insert_many([{'competition_id': cid, 'user_id': f'TEST_r{i}', 'user_name': f'r{i}', 'user_phone': f'0500000{i:03d}',
                                               'created_at': f'2026-01-01T00:00:{i:02d}'} for i in range(6)])
    return cid

cid = asyncio.run(go(seed))
H = {'Authorization': 'Bearer ' + requests.post(f'{B}/auth/login', json={'phone': '0509999999', 'password': 'merchant2025'}).json()['token']}
with ThreadPoolExecutor(8) as ex:
    ids = list(ex.map(lambda _: requests.post(f'{B}/draws/{cid}/sessions', headers=H, json={'kind': 'initial'}).json().get('id'), range(8)))
print('distinct session ids from parallel prepare:', len(set(ids)))
sid = ids[0]
requests.post(f'{B}/draws/sessions/{sid}/pick', headers=H, json={'count': 2})
with ThreadPoolExecutor(6) as ex:
    codes = list(ex.map(lambda _: requests.post(f'{B}/draws/sessions/{sid}/finish', headers=H).status_code, range(6)))
print('finish codes', codes)


async def check(db):
    c = await db.competitions.find_one({'_id': ObjectId(cid)})
    n = await db.draw_sessions.count_documents({'competition_id': cid})
    print('sessions in db:', n, 'draw_history entries:', len(c.get('draw_history', [])))
    await db.competitions.delete_one({'_id': ObjectId(cid)})
    await db.competition_entries.delete_many({'competition_id': cid})
    await db.draw_sessions.delete_many({'competition_id': cid})
    await db.notifications.delete_many({'user_id': {'$regex': '^TEST_r'}})
asyncio.run(go(check))
