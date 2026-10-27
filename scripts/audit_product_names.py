"""Audit: translate every product/service/competition name into all 20 languages via
/api/translate/bulk and flag leftovers (wrong script, duplicated words, failures)."""
import asyncio, os, re, json, httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv('/app/backend/.env', override=True)

LANGS = ['en', 'ar', 'ur', 'fa', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'tr', 'zh', 'ja', 'ko', 'hi', 'bn', 'id', 'ms', 'th']
NONLATIN = {'ar','ur','fa','he','ru','zh','ja','ko','hi','bn','th'}
AR = re.compile(r'[\u0600-\u06FF]')
API = 'http://localhost:8001/api/translate/bulk'


def dup_words(s):
    w = [x.lower() for x in re.findall(r'[A-Za-z]{3,}', s)]
    return sorted({x for x in w if w.count(x) > 1})


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    texts = set()
    async for p in db.products.find({}, {'name_ar': 1, 'name_en': 1, 'name': 1}):
        for k in ('name_ar', 'name_en', 'name'):
            if p.get(k): texts.add(p[k].strip())
    async for s in db.services.find({}, {'title': 1, 'name': 1}):
        for k in ('title', 'name'):
            if s.get(k): texts.add(s[k].strip())
    async for c in db.competitions.find({}, {'title': 1, 'prize': 1}):
        for k in ('title', 'prize'):
            if c.get(k): texts.add(c[k].strip())
    async for u in db.users.find({}, {'name': 1}):
        if u.get('name'): texts.add(u['name'].strip())
    texts = sorted(texts)
    issues, total = [], 0
    async with httpx.AsyncClient(timeout=900) as cl:
        for lang in LANGS:
            out = {'translations': {}, 'failed': []}
            for i in range(0, len(texts), 80):
                j = (await cl.post(API, json={'texts': texts[i:i+80], 'target_lang': lang})).json()
                out['translations'].update(j['translations']); out['failed'] += j.get('failed', [])
            for src in texts:
                tr = out['translations'].get(src, src)
                total += 1
                prob = []
                if src in out.get('failed', []): prob.append('failed')
                if lang not in ('ar', 'ur', 'fa') and AR.search(tr): prob.append('arabic-left')
                if lang in NONLATIN:
                    lw = [w for w in re.findall(r'[A-Za-z0-9][A-Za-z0-9\-]*', tr) if re.search('[A-Za-z]', w) and not re.search(r'\d', w) and not (w.replace('-', '').isupper() and len(w.replace('-', '')) <= 4) and w.lower() != 'zenrex']
                    if lw: prob.append('latin-left:' + ','.join(lw))
                d = dup_words(tr)
                if d: prob.append('dup:' + ','.join(d))
                if prob: issues.append({'lang': lang, 'src': src, 'out': tr, 'problems': prob})
            print(lang, 'done', len([i for i in issues if i['lang'] == lang]), 'issues', flush=True)
    json.dump({'texts': len(texts), 'checks': total, 'issues': issues}, open('/app/memory/name_audit.json', 'w'), ensure_ascii=False, indent=1)
    print('TOTAL', total, 'ISSUES', len(issues))

asyncio.run(main())
