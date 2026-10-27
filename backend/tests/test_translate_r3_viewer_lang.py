# Translation rules r3: viewer language is the target; brands in target script; names transliterated; no duplication
import os
import re
import pytest
import requests

BASE_URL = os.environ.get('EXPO_BACKEND_URL').rstrip('/')
AR = re.compile(r'[\u0600-\u06FF]')
LATIN_WORD = re.compile(r'[A-Za-z]{3,}')


def bulk(texts, lang):
    r = requests.post(f"{BASE_URL}/api/translate/bulk", json={"texts": texts, "target_lang": lang}, timeout=120)
    assert r.status_code == 200, r.text
    return r.json()


# Login works for merchant
def test_merchant_login():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"phone": "0509999999", "password": "merchant2025"}, timeout=30)
    assert r.status_code == 200
    assert r.json().get("token")


# English product names -> Arabic script
def test_bulk_ar_brands_in_arabic():
    texts = ["MacBook Pro 16 M3 Max", "iPhone 15 Pro", "John Smith"]
    j = bulk(texts, "ar")
    for t in texts:
        tr = j["translations"][t]
        print(t, '->', tr)
        assert AR.search(tr), f"{t} -> {tr} not Arabic"
        assert not LATIN_WORD.sub('', tr) is None
        assert not [w for w in re.findall(r'[A-Za-z][A-Za-z0-9\-]*', tr) if not re.search(r'\d', w) and not (w.isupper() and len(w) <= 4)], tr


# Arabic customer names -> English
def test_bulk_en_names_latin():
    j = bulk(["فهد العتيبي"], "en")
    tr = j["translations"]["فهد العتيبي"]
    print(tr)
    assert not AR.search(tr)
    assert "Fahad" in tr or "Fahd" in tr


# Duplicated bilingual name said once
def test_bulk_dedupe():
    src = "Watch S3 · Xiaomi Watch S3"
    j = bulk([src], "en")
    tr = j["translations"][src]
    print(tr)
    assert '·' not in tr and tr.count('S3') == 1


@pytest.mark.parametrize("lang,rx", [("ur", r'[\u0600-\u06FF]'), ("hi", r'[\u0900-\u097F]'), ("zh", r'[\u4E00-\u9FFF]')])
def test_bulk_non_latin_script(lang, rx):
    src = "iPhone 15 Pro"
    j = bulk([src], lang)
    tr = j["translations"][src]
    print(lang, tr, j.get("failed"))
    assert re.search(rx, tr), f"{lang}: {tr}"
