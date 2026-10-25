"""v1.18 auto-translation: /api/translate + /api/translate/bulk mixed-text unification tests."""
import os
import re
import pytest
import requests

BASE_URL = (os.environ.get('EXPO_PUBLIC_BACKEND_URL') or os.environ.get('EXPO_BACKEND_URL')).rstrip('/')
AR = re.compile(r'[\u0600-\u06FF]')
T = 180

MIXED = ["آيفون 15 Pro Max أسود 256 جيجا", "سامسونج Galaxy S24 Ultra رمادي 512 جيجا", "سماعة Sony لاسلكية", "ناقل إكسبرس"]


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    x.headers.update({"Content-Type": "application/json"})
    return x


def _bulk(s, lang, texts=MIXED):
    r = s.post(f"{BASE_URL}/api/translate/bulk", json={"texts": texts, "target_lang": lang}, timeout=T)
    assert r.status_code == 200, r.text
    return r.json()["translations"]


# Bulk mixed-text unification per language
@pytest.mark.parametrize("lang", ["de", "fr", "ru", "zh", "ja", "th"])
def test_bulk_mixed(s, lang):
    tr = _bulk(s, lang)
    print(lang, tr)
    for src in MIXED:
        out = tr[src]
        assert not AR.search(out), f"{lang}: Arabic left in '{out}' (src {src})"
    assert "iPhone" in tr[MIXED[0]] and "15" in tr[MIXED[0]] and "256" in tr[MIXED[0]]
    assert "Galaxy" in tr[MIXED[1]] and "S24" in tr[MIXED[1]]


# German must translate colour
def test_bulk_de_colour(s):
    tr = _bulk(s, "de")
    assert "schwarz" in tr[MIXED[0]].lower(), tr[MIXED[0]]


# Latin proper name accepted for zh/ja/hi (not replaced by Arabic)
@pytest.mark.parametrize("lang", ["zh", "ja", "hi"])
def test_bulk_latin_proper_name(s, lang):
    tr = _bulk(s, lang, ["سوني", "ناقل إكسبرس"])
    print(lang, tr)
    for v in tr.values():
        assert not AR.search(v), f"{lang}: {v}"


# English-only -> Arabic
def test_bulk_en_to_ar(s):
    tr = _bulk(s, "ar", ["Screen Repair Service", "Summer Photo Competition"])
    for v in tr.values():
        assert AR.search(v), v


# Arabic-only -> English
def test_bulk_ar_to_en(s):
    tr = _bulk(s, "en", ["فرع الرياض الرئيسي", "تم شحن طلبك"])
    for v in tr.values():
        assert not AR.search(v) and len(v) > 3, v


# Single translate
def test_single(s):
    r = s.post(f"{BASE_URL}/api/translate", json={"text": "آيفون 15 Pro Max أسود 256 جيجا", "target_lang": "de"}, timeout=T)
    assert r.status_code == 200
    out = r.json()["translated"]
    assert "iPhone" in out and not AR.search(out), out


# Validation
def test_validation(s):
    assert s.post(f"{BASE_URL}/api/translate", json={"text": "", "target_lang": "de"}).status_code == 422
    assert s.post(f"{BASE_URL}/api/translate/bulk", json={"texts": [], "target_lang": "de"}).status_code == 422


# Cache second call returns cached
def test_cache_hit(s):
    _bulk(s, "fr")
    r = s.post(f"{BASE_URL}/api/translate/bulk", json={"texts": MIXED, "target_lang": "fr"}, timeout=T)
    assert r.json()["cached"] is True
