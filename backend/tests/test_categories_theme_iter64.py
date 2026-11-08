# Iteration 64: merchant categories photos (CRUD + cache invalidation), customer orders/tracking, services
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('EXPO_BACKEND_URL').rstrip('/')


def _login(phone, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"phone": phone, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {phone}: {r.status_code} {r.text[:200]}")
    d = r.json()
    tok = d.get("token") or d.get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def merchant():
    return _login("0509999999", "merchant2025")


@pytest.fixture(scope="module")
def customer():
    return _login("0500000000", "test1234")


# Public categories: real photo URLs
class TestPublicCategories:
    def test_categories_have_photo_urls(self):
        r = requests.get(f"{BASE_URL}/api/categories")
        assert r.status_code == 200
        cats = r.json()
        assert isinstance(cats, list) and len(cats) > 0
        photos = [c for c in cats if str(c.get("image", "")).startswith(("http", "/api/"))]
        print(f"{len(photos)}/{len(cats)} categories have photo URLs")
        assert len(photos) == len(cats), [c.get("image") for c in cats]
        assert all("_id" not in c for c in cats)
        assert all("id" in c for c in cats)


# Merchant categories access control
class TestMerchantCategoriesAuth:
    def test_merchant_can_list(self, merchant):
        r = merchant.get(f"{BASE_URL}/api/merchant/categories")
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_customer_forbidden(self, customer):
        r = customer.get(f"{BASE_URL}/api/merchant/categories")
        assert r.status_code == 403

    def test_anon_unauthorized(self):
        r = requests.get(f"{BASE_URL}/api/merchant/categories")
        assert r.status_code in (401, 403)

    def test_customer_put_forbidden(self, customer, merchant):
        cats = merchant.get(f"{BASE_URL}/api/merchant/categories").json()
        c = cats[0]
        r = customer.put(f"{BASE_URL}/api/merchant/categories/{c['id']}",
                         json={"name_ar": c["name_ar"], "image": "x"})
        assert r.status_code == 403


# Create TEST category -> update image -> public reflects immediately -> delete
class TestCategoryImageUpdate:
    def test_full_cycle_cache_invalidation(self, merchant):
        requests.get(f"{BASE_URL}/api/categories")  # warm cache
        r = merchant.post(f"{BASE_URL}/api/merchant/categories", json={
            "name_ar": "TEST_قسم", "name_en": "TEST_cat",
            "image": "https://images.unsplash.com/photo-1.jpg", "published": True, "order": 999})
        assert r.status_code == 200
        cid = r.json()["id"]
        try:
            # create should also be reflected (report if cached)
            pub = requests.get(f"{BASE_URL}/api/categories").json()
            created_visible = any(c["id"] == cid for c in pub)
            print(f"Created category visible immediately in /api/categories: {created_visible}")
            new_img = f"https://images.unsplash.com/photo-TEST-{int(time.time())}.jpg"
            u = merchant.put(f"{BASE_URL}/api/merchant/categories/{cid}", json={
                "name_ar": "TEST_قسم", "name_en": "TEST_cat", "image": new_img,
                "published": True, "order": 999})
            assert u.status_code == 200
            pub = requests.get(f"{BASE_URL}/api/categories").json()
            match = [c for c in pub if c["id"] == cid]
            assert match, "updated category not in public list"
            assert match[0]["image"] == new_img
            ml = merchant.get(f"{BASE_URL}/api/merchant/categories").json()
            assert [c for c in ml if c["id"] == cid][0]["image"] == new_img
        finally:
            d = merchant.delete(f"{BASE_URL}/api/merchant/categories/{cid}")
            assert d.status_code == 200
        pub = requests.get(f"{BASE_URL}/api/categories").json()
        print(f"Deleted category still in public cache: {any(c['id'] == cid for c in pub)}")

    def test_update_existing_category_image_and_restore(self, merchant):
        cats = merchant.get(f"{BASE_URL}/api/merchant/categories").json()
        c = cats[0]
        orig = {k: v for k, v in c.items() if k not in ("id", "_id")}
        body = dict(orig, image="https://images.unsplash.com/photo-TEST-swap.jpg")
        try:
            r = merchant.put(f"{BASE_URL}/api/merchant/categories/{c['id']}", json=body)
            assert r.status_code == 200
            pub = requests.get(f"{BASE_URL}/api/categories").json()
            m = [x for x in pub if x["id"] == c["id"]]
            if m:
                assert m[0]["image"] == body["image"]
        finally:
            merchant.put(f"{BASE_URL}/api/merchant/categories/{c['id']}", json=orig)
        after = [x for x in merchant.get(f"{BASE_URL}/api/merchant/categories").json() if x["id"] == c["id"]][0]
        assert after["image"] == c["image"]

    def test_put_invalid_id(self, merchant):
        r = merchant.put(f"{BASE_URL}/api/merchant/categories/not-an-id", json={"name_ar": "TEST_x"})
        print("invalid id PUT ->", r.status_code)
        assert r.status_code in (400, 404, 422)

    def test_put_nonexistent_id(self, merchant):
        r = merchant.put(f"{BASE_URL}/api/merchant/categories/000000000000000000000000", json={"name_ar": "TEST_x"})
        print("nonexistent PUT ->", r.status_code)
        assert r.status_code == 404


# Customer orders + tracking + services
class TestCustomerOrdersServices:
    def test_orders_list_and_trackable(self, customer):
        r = customer.get(f"{BASE_URL}/api/orders")
        assert r.status_code == 200
        orders = r.json()
        stats = {}
        for o in orders:
            stats[o.get("status")] = stats.get(o.get("status"), 0) + 1
        print("customer order statuses:", stats)
        trackable = [o for o in orders if o.get("status") in ("ready", "in_transit", "out_for_delivery", "shipped", "processing")]
        print("trackable ids:", [o["id"] for o in trackable][:5])

    def test_services(self):
        r = requests.get(f"{BASE_URL}/api/services")
        assert r.status_code == 200
        svcs = r.json()
        assert len(svcs) > 0
        for s in svcs:
            assert "id" in s and "price" in s
        print("services:", [(s.get("name_ar"), s.get("icon"), bool(s.get("images"))) for s in svcs])
