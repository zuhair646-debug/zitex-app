# Iteration 65: strict checks for merchant categories cache invalidation (POST/PUT/DELETE), 404s, partial PUT (exclude_unset)
import os
import pytest
import requests

BASE_URL = os.environ.get('EXPO_BACKEND_URL').rstrip('/')


def _login(phone, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"phone": phone, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {phone}: {r.status_code}")
    d = r.json()
    s.headers.update({"Authorization": f"Bearer {d.get('token') or d.get('access_token')}"})
    return s


@pytest.fixture(scope="module")
def merchant():
    return _login("0509999999", "merchant2025")


def _pub():
    return requests.get(f"{BASE_URL}/api/categories").json()


@pytest.fixture
def test_cat(merchant):
    _pub()  # warm cache
    r = merchant.post(f"{BASE_URL}/api/merchant/categories", json={
        "name_ar": "TEST_قسم65", "name_en": "TEST_cat65", "image": "https://images.unsplash.com/photo-TEST65.jpg",
        "color1": "#112233", "color2": "#445566", "published": True, "order": 998})
    assert r.status_code == 200
    cid = r.json()["id"]
    yield cid
    merchant.delete(f"{BASE_URL}/api/merchant/categories/{cid}")


# Create is visible immediately
def test_create_visible_immediately(test_cat):
    assert any(c["id"] == test_cat for c in _pub())


# Partial PUT keeps other fields
def test_partial_put_keeps_fields(merchant, test_cat):
    r = merchant.put(f"{BASE_URL}/api/merchant/categories/{test_cat}",
                     json={"name_ar": "TEST_قسم65", "image": "https://images.unsplash.com/photo-TEST65b.jpg"})
    assert r.status_code == 200
    c = [x for x in merchant.get(f"{BASE_URL}/api/merchant/categories").json() if x["id"] == test_cat][0]
    assert c["image"].endswith("TEST65b.jpg")
    assert c["color1"] == "#112233" and c["color2"] == "#445566"
    assert c["order"] == 998 and c["published"] is True and c["name_en"] == "TEST_cat65"
    p = [x for x in _pub() if x["id"] == test_cat]
    assert p and p[0]["image"].endswith("TEST65b.jpg")


# Partial PUT without name_ar (required in model)
def test_partial_put_image_only(merchant, test_cat):
    r = merchant.put(f"{BASE_URL}/api/merchant/categories/{test_cat}", json={"image": "https://x/TEST65c.jpg"})
    print("image-only PUT ->", r.status_code, r.text[:200])


# Delete removes immediately from public list
def test_delete_invalidates(merchant):
    _pub()
    cid = merchant.post(f"{BASE_URL}/api/merchant/categories", json={"name_ar": "TEST_del65", "order": 997}).json()["id"]
    assert any(c["id"] == cid for c in _pub())
    d = merchant.delete(f"{BASE_URL}/api/merchant/categories/{cid}")
    assert d.status_code == 200
    assert not any(c["id"] == cid for c in _pub())


def test_put_unknown_404(merchant):
    r = merchant.put(f"{BASE_URL}/api/merchant/categories/000000000000000000000000", json={"name_ar": "TEST_x"})
    assert r.status_code == 404


def test_put_invalid_id_404(merchant):
    r = merchant.put(f"{BASE_URL}/api/merchant/categories/bad-id", json={"name_ar": "TEST_x"})
    assert r.status_code == 404


def test_delete_unknown(merchant):
    r = merchant.delete(f"{BASE_URL}/api/merchant/categories/000000000000000000000000")
    print("DELETE unknown ->", r.status_code)
    r2 = merchant.delete(f"{BASE_URL}/api/merchant/categories/bad-id")
    print("DELETE invalid ->", r2.status_code)
    assert r2.status_code < 500, f"invalid id delete returns {r2.status_code}"
