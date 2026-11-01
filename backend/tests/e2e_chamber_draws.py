"""E2E: chamber draw session → picks → finish → video compose → verify."""
import asyncio, os, time, subprocess, requests, imageio_ffmpeg
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
B = 'http://localhost:8001/api'

def login(phone, pw):
    r = requests.post(f'{B}/auth/login', json={'phone': phone, 'password': pw}); r.raise_for_status()
    return {'Authorization': f"Bearer {r.json()['token']}"}

async def seed():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    off = await db.users.find_one({'phone': '0550000000'})
    r = await db.competitions.insert_one({'title': 'TEST_DRAW سحب تجريبي', 'prize': 'آيفون', 'prize_count': 5, 'status': 'open',
        'chamber_supervised': True, 'permit_number': 'CC-TEST-1', 'assigned_chamber_employee_id': str(off['_id']), 'created_at': '2026-11-01'})
    cid = str(r.inserted_id)
    for i in range(12):
        await db.competition_entries.insert_one({'competition_id': cid, 'user_id': f'tu{i}', 'user_name': f'مشارك {i}', 'user_phone': f'05000001{i:02d}', 'created_at': f'2026-11-01T00:00:{i:02d}'})
    return cid

cid = asyncio.run(seed())
H = login('0550000000', 'chamber2025')
print('studio', requests.get(f'{B}/draws/{cid}/studio', headers=H).status_code)
ss = requests.post(f'{B}/draws/{cid}/sessions', headers=H, json={'kind': 'initial'}).json()
sid = ss['id']; print('session', sid, ss['seed'] is None, len(ss['names']))
again = requests.post(f'{B}/draws/{cid}/sessions', headers=H, json={'kind': 'initial'}).json()
print('resume same', again['id'] == sid, again['seed_hash'] == ss['seed_hash'])
r1 = requests.post(f'{B}/draws/sessions/{sid}/pick', headers=H, json={'count': 1}).json(); print('pick1', r1['remaining'])
r2 = requests.post(f'{B}/draws/sessions/{sid}/pick', headers=H, json={'count': 4}).json(); print('pick4', r2['remaining'], len(r2['winners']))
print('over-pick', requests.post(f'{B}/draws/sessions/{sid}/pick', headers=H, json={'count': 1}).status_code)
fin = requests.post(f'{B}/draws/sessions/{sid}/finish', headers=H).json(); print('finished', fin['status'], bool(fin['seed']))
print('second initial blocked', requests.post(f'{B}/draws/{cid}/sessions', headers=H, json={'kind': 'initial'}).status_code)
print('redraw too early', requests.post(f'{B}/draws/{cid}/sessions', headers=H, json={'kind': 'redraw', 'replace_user_id': r1['winners'][0]['user_id'], 'reason': 'لم يرد خلال شهر'}).status_code)
ff = imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ff, '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=480x640:rate=30', '-f', 'lavfi', '-i', 'sine', '-t', '14', '-c:v', 'libx264', '-c:a', 'aac', '/tmp/face2.mp4'], check=True)
up = requests.post(f'{B}/upload', headers=H, files={'file': ('face.mp4', open('/tmp/face2.mp4', 'rb'), 'video/mp4')}).json()
v = requests.post(f'{B}/draws/sessions/{sid}/video', headers=H, json={'face_path': up['path'], 'intro_ms': 3000, 'duration_ms': 14000, 'finish_ms': 12000,
    'events': [{'t_ms': 4000, 'pick_from': 1, 'pick_to': 1}, {'t_ms': 8000, 'pick_from': 2, 'pick_to': 5}]}).json(); print('video', v)
for _ in range(30):
    time.sleep(2)
    st = requests.get(f'{B}/draws/sessions/{sid}', headers=H).json()
    if st['video_status'] in ('ready', 'failed'): break
print('video_status', st['video_status'], st.get('video_error'))
mp4 = requests.get(f'{B}/draws/sessions/{sid}/video.mp4'); print('public mp4', mp4.status_code, len(mp4.content))
ver = requests.get(f'{B}/draws/sessions/{sid}/verify').json(); print('verified', ver['verified'], ver['checks'])
print('public list', len(requests.get(f'{B}/draws/public/{cid}').json()))
M = login('0509999999', 'merchant2025')
print('hub', requests.get(f'{B}/draws/hub', headers=M).status_code)
C = login('0500000000', 'test1234')
print('customer studio forbidden', requests.get(f'{B}/draws/{cid}/studio', headers=C).status_code)
async def clean():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    from bson import ObjectId
    await db.competitions.delete_one({'_id': ObjectId(cid)}); await db.competition_entries.delete_many({'competition_id': cid}); await db.draw_sessions.delete_many({'competition_id': cid})
asyncio.run(clean())
