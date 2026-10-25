"""v1.19 retest: /api/translate/bulk target-lang in user msg, parallel chunks, retry, 'failed' list."""
import os
import re
import hashlib
import time
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
BASE_URL = (os.environ.get('EXPO_PUBLIC_BACKEND_URL') or os.environ.get('EXPO_BACKEND_URL')).rstrip('/')
CJK = re.compile(r'[\u4E00-\u9FFF]')
AR = re.compile(r'[\u0600-\u06FF]')
T = 240

SERVICES = ["Screen Repair", "Professional screen replacement for all phone models", "Battery Replacement",
            "Genuine battery replacement with warranty", "Water Damage Repair", "Advanced water damage recovery service",
            "Software Fix", "OS updates, virus removal, data recovery", "Device Inspection",
            "Full device health check and diagnostic report", "Charging Port Fix", "Repair or replace damaged charging ports",
            "Camera Lens Replacement", "Professional camera lens repair for all smartphones", "Data Recovery",
            "Recover lost files, photos and contacts from damaged devices", "Speaker & Microphone Fix",
            "Fix speaker and microphone issues on any device", "Motherboard Repair",
            "Advanced motherboard repair by certified technicians", "Screen Protector Installation",
            "Premium glass screen protector installation", "Home Service Visit",
            "Certified technician visits your home for on-site repair"]


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    x.headers.update({"Content-Type": "application/json"})
    return x


@pytest.fixture(scope="module")
def coll():
    c = MongoClient(os.environ['MONGO_URL'])
    yield c[os.environ['DB_NAME']]['translations_cache']
    c.close()


def _clear(coll, texts, lang):
    hs = [hashlib.sha1(t.strip().encode('utf-8')).hexdigest() for t in texts]
    coll.delete_many({"hash": {"$in": hs}, "target": lang})


def _bust_mem(s, texts, lang):
    # in-process LRU is not reachable; we add a unique suffix-free approach by restarting is not allowed,
    # so we rely on DB clear + new texts variant (trailing space is stripped -> same hash). Use punctuation variant.
    return texts


# 24 English service names/descs -> zh, 3 fresh attempts (vary text slightly to bypass mem cache)
@pytest.mark.parametrize("attempt", [1, 2, 3])
def test_services_zh(s, coll, attempt):
    texts = [f"{t}{'.' * attempt}" if i % 2 else t + (' ' * 0) for i, t in enumerate(SERVICES)]
    # names keep exact text on attempt 1; for attempts 2/3 use suffix to force LLM
    if attempt > 1:
        texts = [f"{t} ({attempt})" if i % 2 == 0 else f"{t}{'.' * attempt}" for i, t in enumerate(SERVICES)]
    _clear(coll, texts, "zh")
    t0 = time.time()
    r = s.post(f"{BASE_URL}/api/translate/bulk", json={"texts": texts, "target_lang": "zh"}, timeout=T)
    dt = time.time() - t0
    assert r.status_code == 200, r.text
    j = r.json()
    tr = j["translations"]
    print(f"attempt {attempt} {dt:.1f}s failed={j.get('failed')}")
    assert "failed" in j
    bad = [(k, v) for k, v in tr.items() if not CJK.search(v) or AR.search(v)]
    for k, v in list(tr.items())[:6]:
        print(k, '=>', v)
    assert not bad, f"non-Chinese lines: {bad}"
    assert j["failed"] == []


# Naqel Express kept as brand name
@pytest.mark.parametrize("lang", ["de", "fr", "zh", "en"])
def test_naqel_brand(s, coll, lang):
    _clear(coll, ["ناقل إكسبرس"], lang)
    r = s.post(f"{BASE_URL}/api/translate/bulk", json={"texts": ["ناقل إكسبرس"], "target_lang": lang}, timeout=T)
    assert r.status_code == 200
    out = r.json()["translations"]["ناقل إكسبرس"]
    print(lang, out)
    assert "Naqel" in out, f"{lang}: '{out}'"


# English-only -> Arabic
def test_en_to_ar_bulk(s):
    r = s.post(f"{BASE_URL}/api/translate/bulk", json={"texts": ["Spend $100 or more during Eid", "Riyadh Store"], "target_lang": "ar"}, timeout=T)
    assert r.status_code == 200
    tr = r.json()["translations"]
    print(tr)
    assert all(AR.search(v) for v in tr.values())


# Large batch (>40) goes in parallel chunks and response has 'failed' key
def test_parallel_chunks(s, coll):
    texts = [f"{t} v19" for t in SERVICES] + [f"{t} batch2" for t in SERVICES]
    _clear(coll, texts, "de")
    t0 = time.time()
    r = s.post(f"{BASE_URL}/api/translate/bulk", json={"texts": texts, "target_lang": "de"}, timeout=T)
    dt = time.time() - t0
    assert r.status_code == 200
    j = r.json()
    print(f"48 texts de in {dt:.1f}s failed={len(j.get('failed', []))}")
    assert isinstance(j.get("failed"), list)
    assert len(j["translations"]) == 48
