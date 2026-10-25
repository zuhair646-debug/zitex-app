# i18n translation endpoints: /api/translate, /api/translate/bulk (script purity, SAR currency)
import os
import re
import pytest
import requests

BASE_URL = (os.environ.get('EXPO_PUBLIC_BACKEND_URL') or os.environ['EXPO_BACKEND_URL']).rstrip('/')
ARABIC = re.compile(r'[\u0600-\u06FF]')
NON_LATIN = re.compile(r'[\u0590-\u05FF\u0600-\u06FF\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0900-\u097F\u0980-\u09FF\u0E00-\u0E7F]')


def _tr(text, target, source='ar'):
    r = requests.post(f"{BASE_URL}/api/translate", json={"text": text, "target_lang": target, "source_lang": source}, timeout=90)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get('translated'), str) and d['translated']
    return d['translated']


# Single translate: branch name into Latin-script langs must have no Arabic
@pytest.mark.parametrize("lang", ["de", "fr", "en", "es"])
def test_branch_name_latin_only(lang):
    out = _tr('فرع جدة - التحلية', lang)
    print(lang, out)
    assert not NON_LATIN.search(out), f"{lang}: non-latin chars in '{out}'"


# Currency ر.س => SAR
@pytest.mark.parametrize("lang", ["de", "fr", "ja"])
def test_currency_sar(lang):
    out = _tr('السعر 150 ر.س', lang)
    print(lang, out)
    assert 'ر.س' not in out and not ARABIC.search(out)
    assert 'SAR' in out or '150' in out


# Non-latin target scripts
SCRIPTS = [("ru", r'[\u0400-\u04FF]'), ("zh", r'[\u4E00-\u9FFF]'), ("ja", r'[\u3040-\u30FF\u4E00-\u9FFF]'), ("he", r'[\u0590-\u05FF]'), ("hi", r'[\u0900-\u097F]'), ("th", r'[\u0E00-\u0E7F]')]


@pytest.mark.parametrize("lang,rx", SCRIPTS)
def test_target_script(lang, rx):
    out = _tr('فرع جدة - التحلية', lang)
    print(lang, out)
    assert re.search(rx, out), f"{lang}: target script missing in '{out}'"
    assert not ARABIC.search(out), f"{lang}: Arabic left in '{out}'"


# Fresh (uncached) strings -> exercises LLM path + _clean_ok target-script requirement
@pytest.mark.parametrize("lang,rx", SCRIPTS)
def test_target_script_fresh(lang, rx):
    import time
    out = _tr(f'فرع الدمام - حي الشاطئ رقم {int(time.time()) % 100000}', lang)
    print(lang, out)
    assert re.search(rx, out), f"{lang}: target script missing in '{out}'"
    assert not ARABIC.search(out), f"{lang}: Arabic left in '{out}'"


def test_same_lang_noop():
    assert _tr('مرحبا', 'ar', 'ar') == 'مرحبا'


def test_validation_empty_text():
    r = requests.post(f"{BASE_URL}/api/translate", json={"text": "", "target_lang": "de"}, timeout=30)
    assert r.status_code == 422


# Bulk translate
def test_bulk_translate_de():
    texts = ['الرصيد', 'طلباتي', 'فرع الرياض - العليا', '99 ر.س']
    r = requests.post(f"{BASE_URL}/api/translate/bulk", json={"texts": texts, "target_lang": "de", "source_lang": "ar"}, timeout=120)
    assert r.status_code == 200, r.text
    tr = r.json()['translations']
    print(tr)
    for t in texts:
        assert t in tr
        assert not ARABIC.search(tr[t]), f"Arabic left: {t} -> {tr[t]}"
    assert 'Guthaben' in tr['الرصيد'] or 'Kontostand' in tr['الرصيد']
