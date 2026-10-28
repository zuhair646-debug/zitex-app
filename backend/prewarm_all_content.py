"""Pre-translate ALL user-facing DB text (posts, comments, services, competitions, banners, categories,
brands, loyalty programs, branches, notifications, wallet/points history, addresses, warranties, bookings…)
into all 20 languages. Usage: API=http://127.0.0.1:8001 ENV_PATH=... python prewarm_all_content.py"""
import asyncio, os, re, httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(os.environ.get('ENV_PATH', '/app/backend/.env'), override=True)
API = os.environ.get('API', 'http://127.0.0.1:8001') + '/api/translate/bulk'
LANGS = os.environ.get('LANGS', 'en,ar,ur,fa,he,es,fr,de,it,pt,ru,tr,zh,ja,ko,hi,bn,id,ms,th').split(',')
COLLS = ['social_posts', 'services', 'competitions', 'notifications', 'banners', 'categories', 'brands', 'loyalty_programs',
         'branches', 'wallet_transactions', 'points_history', 'addresses', 'warranties', 'service_bookings', 'returns',
         'products', 'users', 'orders', 'drivers', 'stores', 'store_settings', 'employees', 'roles', 'tenant_modules',
         'service_returns', 'loyalty_transactions']
SKIP_KEYS = re.compile(r'(^|_)(id|ids|image|images|img|url|urls|video|thumbnail|avatar|phone|email|password|hash|token|status|type|'
                       r'role|created_at|updated_at|date|time|code|sku|barcode|lat|lng|color|icon|slug|lang|currency|key|platform|method)$', re.I)
LETTERS = re.compile(r'[A-Za-z\u0600-\u06FF]{2,}')


def walk(v, key, out):
    if isinstance(v, str):
        s = v.strip()
        if 1 < len(s) < 1500 and LETTERS.search(s) and not SKIP_KEYS.search(key or '') and not s.startswith(('http', 'data:', '/', '#'))\
                and not re.fullmatch(r'[0-9a-f]{24}', s):
            out.add(s)
    elif isinstance(v, dict):
        for k, x in v.items():
            walk(x, k, out)
    elif isinstance(v, list):
        for x in v[:50]:
            walk(x, key, out)


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    names = set(await db.list_collection_names())
    texts = set()
    for c in COLLS:
        if c not in names: continue
        async for d in db[c].find({}).limit(400):
            walk(d, '', texts)
    texts = sorted(texts)
    print('texts', len(texts), flush=True)
    async with httpx.AsyncClient(timeout=900) as cl:
        for lang in LANGS:
            failed = 0
            batches = [texts[i:i + 40] for i in range(0, len(texts), 40)]
            sem = asyncio.Semaphore(4)

            async def go(b):
                nonlocal failed
                async with sem:
                    try:
                        r = await cl.post(API, json={'texts': b, 'target_lang': lang})
                        fl = r.json().get('failed', []); failed += len(fl)
                        if os.environ.get('SHOW'): print('FAILED', lang, fl, flush=True)
                    except Exception:
                        failed += len(b)
            await asyncio.gather(*[go(b) for b in batches])
            print(lang, 'failed', failed, flush=True)

asyncio.run(main())
