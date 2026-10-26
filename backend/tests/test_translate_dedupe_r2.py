# Translation r2 rules: dedupe of mixed Arabic+English names, keep brands in Latin
import os
import re
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', os.environ.get('EXPO_BACKEND_URL', '')).rstrip('/')
AR = re.compile(r'[\u0600-\u06FF]')
CJK_BRANDS = ['小米', '戴尔', '联想', '三星', '苹果', '华为']


def bulk(texts, lang):
    r = requests.post(f"{BASE_URL}/api/translate/bulk", json={"texts": texts, "target_lang": lang}, timeout=120)
    assert r.status_code == 200, r.text
    return r.json()


def _dupes(s):
    words = [w.lower() for w in re.findall(r'[A-Za-z]{2,}', s)]
    return [w for w in set(words) if words.count(w) > 1]


# Core dedupe example from the review request
def test_iphone_mixed_dedupe_zh():
    src = 'آيفون 16 iPhone 16 برو 256 جيجا'
    j = bulk([src], 'zh')
    tr = j['translations'][src]
    print('zh:', tr)
    assert not AR.search(tr)
    assert 'iPhone' in tr and '16' in tr and '256' in tr
    assert tr.count('iPhone') == 1 and tr.count('16') == 1
    assert 'Pro' in tr


@pytest.mark.parametrize('lang', ['en', 'ru', 'hi', 'fr', 'ja'])
def test_iphone_mixed_dedupe_langs(lang):
    src = 'آيفون 16 iPhone 16 برو 256 جيجا'
    tr = bulk([src], lang)['translations'][src]
    print(lang, tr)
    assert not AR.search(tr)
    assert tr.count('iPhone') == 1
    assert tr.count('16') == 1
    assert not _dupes(tr)


# Brands must stay Latin in zh/ja
@pytest.mark.parametrize('lang', ['zh', 'ja'])
def test_brands_stay_latin(lang):
    texts = ['لابتوب ديل Dell انسبايرون 15', 'شاومي Xiaomi ريدمي نوت 13', 'لينوفو Lenovo ثينك باد',
             'ماك بوك برو MacBook Pro 14']
    tr = bulk(texts, lang)['translations']
    print(tr)
    for src, out in tr.items():
        assert not AR.search(out), out
        for b in CJK_BRANDS:
            assert b not in out, f'{out} has {b}'
    assert 'Dell' in tr[texts[0]]
    assert 'Xiaomi' in tr[texts[1]]
    assert 'Lenovo' in tr[texts[2]]
    assert 'MacBook' in tr[texts[3]]


def test_bulk_validation_empty():
    r = requests.post(f"{BASE_URL}/api/translate/bulk", json={"texts": [], "target_lang": 'zh'}, timeout=30)
    assert r.status_code == 422


def test_single_translate_mixed():
    r = requests.post(f"{BASE_URL}/api/translate", json={"text": 'ساعة أبل Apple Watch الترا', "target_lang": 'en'}, timeout=60)
    assert r.status_code == 200
    tr = r.json()['translated']
    print(tr)
    assert not AR.search(tr)
    assert tr.count('Apple') == 1 and tr.count('Watch') == 1
