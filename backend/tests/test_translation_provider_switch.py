# Translation provider switch (Emergent <-> custom OpenAI-compatible) + bulk multiline translate
import os
import re
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', os.environ.get('EXPO_BACKEND_URL')).rstrip('/')
EP = f"{BASE_URL}/api/admin/translation-provider"
BAD_URL = "http://127.0.0.1:9/v1"


def _login(phone, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"phone": phone, "password": pw}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {phone}: {r.status_code}")
    d = r.json()
    return d.get("token") or d.get("access_token")


@pytest.fixture(scope="module")
def mh():
    return {"Authorization": f"Bearer {_login('0509999999', 'merchant2025')}"}


@pytest.fixture(scope="module")
def ch():
    return {"Authorization": f"Bearer {_login('0500000000', 'test1234')}"}


@pytest.fixture(scope="module", autouse=True)
def reset_provider(mh):
    yield
    # ALWAYS reset provider to emergent
    requests.put(EP, json={"provider": "emergent", "base_url": "", "model": "", "fallback": True}, headers=mh, timeout=30)


# --- Access control
class TestAccess:
    def test_customer_forbidden_get(self, ch):
        assert requests.get(EP, headers=ch, timeout=30).status_code == 403

    def test_customer_forbidden_put(self, ch):
        r = requests.put(EP, json={"provider": "emergent"}, headers=ch, timeout=30)
        assert r.status_code == 403

    def test_customer_forbidden_test(self, ch):
        r = requests.post(EP + "/test", json={"provider": "emergent"}, headers=ch, timeout=30)
        assert r.status_code == 403

    def test_no_token(self):
        assert requests.get(EP, timeout=30).status_code in (401, 403)

    def test_merchant_get_shape(self, mh):
        r = requests.get(EP, headers=mh, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("provider", "base_url", "model", "api_key", "has_key", "fallback"):
            assert k in d
        assert "_id" not in d


# --- PUT validation / masked key
class TestPut:
    def test_custom_requires_fields(self, mh):
        # reset key first so there's no saved key
        requests.put(EP, json={"provider": "emergent", "api_key": ""}, headers=mh, timeout=30)
        r = requests.put(EP, json={"provider": "custom", "base_url": "", "model": "x", "api_key": "sk-abc"}, headers=mh, timeout=30)
        assert r.status_code == 400

    def test_invalid_provider_422(self, mh):
        r = requests.put(EP, json={"provider": "openai"}, headers=mh, timeout=30)
        assert r.status_code == 422

    def test_custom_save_masked_and_keep(self, mh):
        r = requests.put(EP, json={"provider": "custom", "base_url": BAD_URL, "model": "gpt-4o-mini",
                                   "api_key": "sk-TEST_secret1234", "fallback": True}, headers=mh, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["provider"] == "custom" and d["has_key"] is True
        assert d["api_key"] == "••••••••1234"
        assert "secret" not in d["api_key"]
        # PUT with masked value keeps key
        r2 = requests.put(EP, json={"provider": "custom", "base_url": BAD_URL, "model": "m2",
                                    "api_key": d["api_key"], "fallback": True}, headers=mh, timeout=30)
        assert r2.status_code == 200, r2.text
        g = requests.get(EP, headers=mh, timeout=30).json()
        assert g["has_key"] is True and g["api_key"] == "••••••••1234" and g["model"] == "m2"

    def test_emergent_saves(self, mh):
        r = requests.put(EP, json={"provider": "emergent", "base_url": "", "model": "", "fallback": True}, headers=mh, timeout=30)
        assert r.status_code == 200
        assert requests.get(EP, headers=mh, timeout=30).json()["provider"] == "emergent"


# --- Test-connection endpoint
class TestConnection:
    def test_emergent_ok(self, mh):
        r = requests.post(EP + "/test", json={"provider": "emergent"}, headers=mh, timeout=120)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True, d
        assert re.search(r'[\u0600-\u06FF]', d["sample"])

    def test_custom_invalid_url(self, mh):
        r = requests.post(EP + "/test", json={"provider": "custom", "base_url": BAD_URL, "model": "x", "api_key": "sk-x"},
                          headers=mh, timeout=120)
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is False and d.get("error")


# --- Fallback behaviour of /api/translate
class TestFallback:
    def test_fallback_true_uses_emergent(self, mh):
        r = requests.put(EP, json={"provider": "custom", "base_url": BAD_URL, "model": "x", "api_key": "sk-TEST_fb12",
                                   "fallback": True}, headers=mh, timeout=30)
        assert r.status_code == 200
        txt = f"مرحبا بك في المتجر TEST {uuid.uuid4().hex[:6]}"
        t = requests.post(f"{BASE_URL}/api/translate", json={"text": txt, "target_lang": "en", "source_lang": "ar"}, timeout=120)
        assert t.status_code == 200, t.text
        assert not re.search(r'[\u0600-\u06FF]', t.json()["translated"])

    def test_fallback_false_500(self, mh):
        r = requests.put(EP, json={"provider": "custom", "base_url": BAD_URL, "model": "x", "api_key": "sk-TEST_fb12",
                                   "fallback": False}, headers=mh, timeout=30)
        assert r.status_code == 200
        txt = f"هاتف جديد للبيع TEST {uuid.uuid4().hex[:6]}"
        t = requests.post(f"{BASE_URL}/api/translate", json={"text": txt, "target_lang": "en", "source_lang": "ar"}, timeout=120)
        assert t.status_code == 500, t.text

    def test_reset_emergent(self, mh):
        r = requests.put(EP, json={"provider": "emergent", "base_url": "", "model": "", "fallback": True}, headers=mh, timeout=30)
        assert r.status_code == 200 and r.json()["provider"] == "emergent"


# --- Bulk multi-line to Korean
class TestBulkMultiline:
    def test_bulk_multiline_ko(self):
        txt = f"عرض خاص على الهواتف اليوم {uuid.uuid4().hex[:4]}\n\nاطلب الآن واستمتع بالتوصيل المجاني #عروض_زينركس"
        r = requests.post(f"{BASE_URL}/api/translate/bulk", json={"texts": [txt], "target_lang": "ko", "source_lang": "ar"}, timeout=180)
        assert r.status_code == 200, r.text
        d = r.json()
        print(d)
        assert txt not in d["failed"]
        out = d["translations"][txt]
        assert re.search(r'[\uAC00-\uD7AF]', out)
        assert "\n" in out
