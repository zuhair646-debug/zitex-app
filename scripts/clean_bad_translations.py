import os, re
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
c = db.translations_cache
rx = re.compile(r"(?i)\b(I need to|I'll translate|translate (it|this|TO)|here is the|translation:|Wait\b|I cannot|I can't|please provide)|ฉันพร้อม|我需要翻译|请提供")
bad = [d['_id'] for d in c.find({}, {'translated_text': 1}) if rx.search(d.get('translated') or '')]
print('chatter', len(bad), c.delete_many({'_id': {'$in': bad}}).deleted_count)
r = c.delete_many({'source_lang': 'ar', 'source_preview': {'$not': re.compile(r'[\u0600-\u06FF]')}})
print('non-arabic ar-sourced', r.deleted_count)
