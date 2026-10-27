"""Backfill: pre-translate every product name and customer/employee name into all 20 languages
(warms translations_cache so names appear instantly). Usage: API=http://127.0.0.1:8001 ENV_PATH=... python prewarm_all_names.py"""
import asyncio, os, httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(os.environ.get('ENV_PATH', '/app/backend/.env'), override=True)
API = os.environ.get('API', 'http://127.0.0.1:8001') + '/api/translate/bulk'
LANGS = ['en', 'ar', 'ur', 'fa', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'tr', 'zh', 'ja', 'ko', 'hi', 'bn', 'id', 'ms', 'th']


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    texts = set()
    async for p in db.products.find({}, {'name_ar': 1, 'name_en': 1, 'name': 1}):
        for k in ('name_ar', 'name_en', 'name'):
            if p.get(k): texts.add(p[k].strip())
    async for u in db.users.find({}, {'name': 1}):
        if u.get('name'): texts.add(u['name'].strip())
    for f in ('customer_name', 'user_name'):
        for n in await db.orders.distinct(f):
            if n: texts.add(str(n).strip())
    texts = sorted(t for t in texts if len(t) > 1)
    print('texts', len(texts), flush=True)
    async with httpx.AsyncClient(timeout=600) as cl:
        for lang in LANGS:
            failed = 0
            for i in range(0, len(texts), 80):
                r = await cl.post(API, json={'texts': texts[i:i + 80], 'target_lang': lang})
                failed += len(r.json().get('failed', []))
            print(lang, 'failed', failed, flush=True)

asyncio.run(main())
