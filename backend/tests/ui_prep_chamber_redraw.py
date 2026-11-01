"""UI prep: age winners 31 days and compose a draw video for the initial session. `python ui_prep_chamber_redraw.py <cid>`"""
import asyncio, os, sys, subprocess, time
from datetime import datetime, timezone, timedelta
import requests, imageio_ffmpeg
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
load_dotenv('/app/backend/.env'); load_dotenv('/app/frontend/.env')
B = os.environ['EXPO_PUBLIC_BACKEND_URL'].rstrip('/') + '/api'
cid = sys.argv[1]


async def prep():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    await db.competitions.update_one({'_id': ObjectId(cid)}, {'$set': {
        'winners_finalized_at': (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()}})
    s = await db.draw_sessions.find_one({'competition_id': cid, 'kind': 'initial', 'status': 'finished'})
    return str(s['_id'])

sid = asyncio.run(prep())
H = {'Authorization': 'Bearer ' + requests.post(f'{B}/auth/login', json={'phone': '0509999999', 'password': 'merchant2025'}).json()['token']}
ff = imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ff, '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=480x640:rate=30', '-f', 'lavfi', '-i', 'sine',
                '-t', '12', '-c:v', 'libx264', '-c:a', 'aac', '/tmp/face_ui.mp4'], check=True)
up = requests.post(f'{B}/upload', headers=H, files={'file': ('face.mp4', open('/tmp/face_ui.mp4', 'rb'), 'video/mp4')}).json()
print(requests.post(f'{B}/draws/sessions/{sid}/video', headers=H, json={'face_path': up['path'], 'intro_ms': 2000, 'duration_ms': 12000,
      'finish_ms': 10000, 'events': [{'t_ms': 3000, 'pick_from': 1, 'pick_to': 1}, {'t_ms': 6000, 'pick_from': 2, 'pick_to': 5}]}).json())
for _ in range(30):
    time.sleep(2)
    st = requests.get(f'{B}/draws/sessions/{sid}', headers=H).json()
    if st['video_status'] in ('ready', 'failed'):
        break
print('sid', sid, 'video', st['video_status'], st.get('video_error'))
