# Audit translations_cache: count rows that would fail _clean_ok (Arabic leftovers / missing target script)
import os, sys
sys.path.insert(0, '/app/backend')
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from pymongo import MongoClient
from translate import _clean_ok

db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
bad = {}
samples = {}
total = 0
for d in db.translations_cache.find({}, {"_id": 0, "target": 1, "translated": 1, "text": 1}):
    total += 1
    t = d.get('target')
    if t in (None, 'ar'):
        continue
    if not _clean_ok(t, d.get('translated') or ''):
        bad[t] = bad.get(t, 0) + 1
        samples.setdefault(t, []).append((d.get('text', '')[:40], (d.get('translated') or '')[:60]))
print("total rows:", total)
print("bad per lang:", bad)
for t, s in samples.items():
    print(t, s[:3])
