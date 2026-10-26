import os, re
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv(os.environ.get('ENV_PATH', '/app/backend/.env'))
c = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']].translations_cache
rx = re.compile(r"(?i)\b(I need to|I'll translate|translate (it|this|TO)|here is the|translation:|Wait\b|I cannot|I can't|please provide)|ฉันพร้อม|我需要翻译|请提供")
ar = re.compile(r'[\u0600-\u06FF]')
bad = []
for d in c.find({}, {'translated': 1, 'source_preview': 1, 'source_lang': 1}):
    if rx.search(d.get('translated') or ''):
        bad.append(d['_id'])
    elif d.get('source_lang') == 'ar' and not ar.search(d.get('source_preview') or ''):
        bad.append(d['_id'])
print('deleted', c.delete_many({'_id': {'$in': bad}}).deleted_count)
