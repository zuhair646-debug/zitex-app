"""UI seed/cleanup for chamber draw studio tests: `python ui_seed_chamber_draw.py seed|clean`."""
import asyncio, os, sys
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
load_dotenv('/app/backend/.env')


async def main(cmd):
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    if cmd == 'seed':
        off = await db.users.find_one({'phone': '0550000000'})
        r = await db.competitions.insert_one({'title': 'TEST_UI_DRAW مسابقة تجريبية', 'prize': 'TEST جائزة', 'prize_count': 5,
            'status': 'open', 'chamber_supervised': True, 'permit_number': 'CC-UI-1', 'competition_type': 'free',
            'assigned_chamber_employee_id': str(off['_id']), 'created_at': '2027-12-31T00:00:00', 'end_date': '2027-12-31',
            'description': 'TEST', 'image': ''})
        cid = str(r.inserted_id)
        for i in range(10):
            await db.competition_entries.insert_one({'competition_id': cid, 'user_id': f'TEST_ui{i}', 'user_name': f'TEST مشارك {i}',
                'user_phone': f'05000003{i:02d}', 'created_at': f'2026-01-01T00:00:{i:02d}'})
        print(cid)
    else:
        comps = await db.competitions.find({'title': {'$regex': '^TEST_'}}).to_list(100)
        for c in comps:
            cid = str(c['_id'])
            await db.competition_entries.delete_many({'competition_id': cid})
            await db.draw_sessions.delete_many({'competition_id': cid})
            await db.competitions.delete_one({'_id': c['_id']})
        await db.notifications.delete_many({'user_id': {'$regex': '^TEST_'}})
        await db.users.delete_many({'phone': {'$regex': '^0559990'}})
        print('cleaned', len(comps))

asyncio.run(main(sys.argv[1]))
