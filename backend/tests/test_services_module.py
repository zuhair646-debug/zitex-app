"""
Backend tests for the Zitex "Services" module (iteration 20).
Covers:
  1. Merchant rich Service CRUD (new fields: images, category, warranty*, home_pickup, GPS)
  2. Public service listing/detail/quote with dynamic pickup fee
  3. Customer booking flow with home_pickup + GPS distance
  4. Merchant booking status transitions (pending → completed) + invalid status
  5. Service updates (merchant videos) + customer notifications
  6. Public "is_public_experience" toggle + cross-post to social feed
  7. Customer reviews (per-update + final overall) with aggregate recompute
  8. Auth/role guards (401/403)

Run:
  pytest /app/backend/tests/test_services_module.py -v \
    --tb=short --junitxml=/app/test_reports/pytest/pytest_services_module.xml
"""

import os
import math
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    os.environ.get("EXPO_BACKEND_URL", ""),
).rstrip("/")

if not BASE_URL:
    # last-resort read of frontend .env for CI convenience
    try:
        with open("/app/frontend/.env") as fh:
            for line in fh:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass

assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL is not configured"

CUSTOMER = {"phone": "0500000000", "password": "test1234"}
MERCHANT = {"phone": "0509999999", "password": "merchant2025"}

# Riyadh (shop) → Al Malaz-ish (dest), ≈ 12–14 km straight line
SHOP_LAT, SHOP_LNG = 24.7136, 46.6753
DEST_LAT, DEST_LNG = 24.8000, 46.7500


def _haversine_km(a_lat, a_lng, b_lat, b_lng):
    from math import radians, sin, cos, asin, sqrt
    R = 6371.0
    dlat = radians(b_lat - a_lat)
    dlng = radians(b_lng - a_lng)
    x = sin(dlat / 2) ** 2 + cos(radians(a_lat)) * cos(radians(b_lat)) * sin(dlng / 2) ** 2
    return 2 * R * asin(sqrt(x))


# ─── fixtures ───────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(api, creds):
    r = api.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['phone']}: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="module")
def customer_token(api):
    tok, _ = _login(api, CUSTOMER)
    return tok


@pytest.fixture(scope="module")
def merchant_token(api):
    tok, _ = _login(api, MERCHANT)
    return tok


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ─── module-level shared state (populated as tests run) ─────────────────────
STATE: dict = {
    "service_id": None,
    "booking_id": None,
    "update_id": None,
    "crosspost_update_id": None,
}


SERVICE_PAYLOAD = {
    "name": "TEST_ZTX_Screen_Repair",
    "desc": "استبدال شاشة أصلية",
    "long_description": "خدمة استبدال شاشة أصلية مع ضمان + فحص كامل للجهاز.",
    "category": "repair",
    "images": ["services/p1.jpg", "services/p2.jpg"],
    "price": 299,
    "warranty_available": True,
    "warranty_days": 90,
    "warranty_terms": "ضمان لمدة 90 يوم لعيوب التصنيع فقط.",
    "home_pickup": True,
    "pickup_base_fee": 10,
    "pickup_price_per_km": 3,
    "shop_lat": SHOP_LAT,
    "shop_lng": SHOP_LNG,
    "published": True,
}


# ─── 1. Merchant CRUD ───────────────────────────────────────────────────────
class TestMerchantServiceCRUD:
    def test_anon_cannot_create(self, api):
        r = api.post(f"{BASE_URL}/api/merchant/services", json=SERVICE_PAYLOAD, timeout=20)
        assert r.status_code in (401, 403)

    def test_anon_cannot_list(self, api):
        r = api.get(f"{BASE_URL}/api/merchant/services", timeout=20)
        assert r.status_code in (401, 403)

    def test_anon_cannot_delete(self, api):
        r = api.delete(f"{BASE_URL}/api/merchant/services/507f1f77bcf86cd799439011", timeout=20)
        assert r.status_code in (401, 403)

    def test_merchant_create_rich_service(self, api, merchant_token):
        r = api.post(f"{BASE_URL}/api/merchant/services", json=SERVICE_PAYLOAD,
                     headers=H(merchant_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "id" in body and body["id"]
        STATE["service_id"] = body["id"]

    def test_merchant_list_includes_new(self, api, merchant_token):
        r = api.get(f"{BASE_URL}/api/merchant/services", headers=H(merchant_token), timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        item = next((s for s in items if s.get("id") == STATE["service_id"]), None)
        assert item, f"created service {STATE['service_id']} not found in merchant list"
        # verify all rich fields round-trip
        for k in ("name", "desc", "long_description", "category", "warranty_terms"):
            assert item.get(k) == SERVICE_PAYLOAD[k], f"{k} mismatch: {item.get(k)!r}"
        assert item.get("price") == 299
        assert item.get("images") == SERVICE_PAYLOAD["images"]
        assert item.get("warranty_available") is True
        assert item.get("warranty_days") == 90
        assert item.get("home_pickup") is True
        assert float(item.get("pickup_base_fee")) == 10.0
        assert float(item.get("pickup_price_per_km")) == 3.0
        assert float(item.get("shop_lat")) == SHOP_LAT
        assert float(item.get("shop_lng")) == SHOP_LNG


# ─── 2. Public services ─────────────────────────────────────────────────────
class TestPublicServices:
    def test_list_contains_published_service(self, api):
        assert STATE["service_id"], "prev test did not populate service_id"
        r = api.get(f"{BASE_URL}/api/services", timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert any(s.get("id") == STATE["service_id"] for s in items), \
            "newly-created published service not visible in /api/services"

    def test_detail_returns_rich_fields(self, api):
        r = api.get(f"{BASE_URL}/api/services/{STATE['service_id']}", timeout=20)
        assert r.status_code == 200
        s = r.json()
        for k in ("name", "desc", "long_description", "category", "images",
                  "warranty_available", "warranty_days", "warranty_terms",
                  "home_pickup", "pickup_base_fee", "pickup_price_per_km",
                  "shop_lat", "shop_lng", "price"):
            assert k in s, f"missing field in /services/{{id}} response: {k}"

    def test_quote_dynamic_pickup_fee(self, api):
        r = api.post(f"{BASE_URL}/api/services/{STATE['service_id']}/quote",
                     json={"dest_lat": DEST_LAT, "dest_lng": DEST_LNG}, timeout=20)
        assert r.status_code == 200, r.text
        q = r.json()
        for k in ("service_price", "pickup_fee", "distance_km", "home_pickup_supported"):
            assert k in q
        assert q["home_pickup_supported"] is True
        assert q["service_price"] == 299
        # round-trip: fee ≈ base + dist * 2 * price_per_km
        expected_dist = _haversine_km(SHOP_LAT, SHOP_LNG, DEST_LAT, DEST_LNG)
        expected_fee = 10 + expected_dist * 2 * 3
        assert math.isclose(float(q["distance_km"]), round(expected_dist, 2), abs_tol=0.05), \
            f"distance mismatch: {q['distance_km']} vs {expected_dist:.2f}"
        assert math.isclose(float(q["pickup_fee"]), round(expected_fee, 2), abs_tol=0.1), \
            f"pickup_fee mismatch: {q['pickup_fee']} vs {expected_fee:.2f}"
        # stash for booking assert
        STATE["expected_dist"] = round(expected_dist, 2)
        STATE["expected_fee"] = round(expected_fee, 2)


# ─── 3. Customer booking ────────────────────────────────────────────────────
class TestCustomerBooking:
    def test_book_home_pickup(self, api, customer_token):
        payload = {
            "service_id": STATE["service_id"],
            "service_name": SERVICE_PAYLOAD["name"],
            "device_model": "iPhone 14",
            "issue_desc": "الشاشة مكسورة",
            "phone": "0500000000",
            "delivery_type": "home_pickup",
            "address": "الرياض - حي الملز",
            "dest_lat": DEST_LAT,
            "dest_lng": DEST_LNG,
        }
        r = api.post(f"{BASE_URL}/api/services/book", json=payload,
                     headers=H(customer_token), timeout=20)
        assert r.status_code == 200, r.text
        b = r.json()
        assert "id" in b and b["id"]
        assert b["pickup_fee"] > 0
        assert b["distance_km"] > 0
        # total = service_price + pickup_fee
        assert math.isclose(float(b["total_amount"]),
                            299 + float(b["pickup_fee"]),
                            abs_tol=0.01), f"total_amount wrong: {b}"
        # dynamic pickup fee should match the quote
        assert math.isclose(float(b["pickup_fee"]), STATE["expected_fee"], abs_tol=0.1)
        STATE["booking_id"] = b["id"]

    def test_my_bookings_lists_new(self, api, customer_token):
        r = api.get(f"{BASE_URL}/api/services/bookings/my",
                    headers=H(customer_token), timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert any(x.get("id") == STATE["booking_id"] for x in items)

    def test_get_booking_has_updates_and_reviews_arrays(self, api, customer_token):
        r = api.get(f"{BASE_URL}/api/services/bookings/{STATE['booking_id']}",
                    headers=H(customer_token), timeout=20)
        assert r.status_code == 200
        b = r.json()
        assert isinstance(b.get("updates"), list)
        assert isinstance(b.get("reviews"), list)
        # persisted numbers
        assert b.get("pickup_fee", 0) > 0
        assert b.get("distance_km", 0) > 0
        assert b.get("service_price") == 299


# ─── 4. Merchant booking status flow ────────────────────────────────────────
class TestBookingStatusFlow:
    @pytest.mark.parametrize("status", ["pending", "received", "in_progress", "ready", "completed"])
    def test_status_transitions(self, api, merchant_token, status):
        r = api.put(f"{BASE_URL}/api/merchant/bookings/{STATE['booking_id']}/status",
                    json={"status": status}, headers=H(merchant_token), timeout=20)
        assert r.status_code == 200, f"{status}: {r.text}"

    def test_invalid_status_rejected(self, api, merchant_token):
        r = api.put(f"{BASE_URL}/api/merchant/bookings/{STATE['booking_id']}/status",
                    json={"status": "banana"}, headers=H(merchant_token), timeout=20)
        assert r.status_code == 400


# ─── 5. Service updates (videos) ────────────────────────────────────────────
class TestServiceUpdates:
    def test_customer_cannot_create_update(self, api, customer_token):
        payload = {"booking_id": STATE["booking_id"], "video_url": "test/vid1.mp4",
                   "caption": "not allowed"}
        r = api.post(f"{BASE_URL}/api/services/updates", json=payload,
                     headers=H(customer_token), timeout=20)
        assert r.status_code == 403

    def test_merchant_create_update(self, api, merchant_token, customer_token):
        # snapshot customer notifications count first
        rn = api.get(f"{BASE_URL}/api/notifications", headers=H(customer_token), timeout=20)
        assert rn.status_code == 200
        before = len(rn.json())

        payload = {
            "booking_id": STATE["booking_id"],
            "video_url": "test/vid1.mp4",
            "caption": "جاري تبديل الشاشة",
            "is_public_experience": True,
            "crosspost_to_social": False,
        }
        r = api.post(f"{BASE_URL}/api/services/updates", json=payload,
                     headers=H(merchant_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "id" in body
        STATE["update_id"] = body["id"]

        # notification created for the customer
        rn2 = api.get(f"{BASE_URL}/api/notifications", headers=H(customer_token), timeout=20)
        assert rn2.status_code == 200
        after = rn2.json()
        assert len(after) == before + 1, f"expected +1 notification, got {before} → {len(after)}"
        top = after[0]
        assert top.get("data", {}).get("type") == "service_update"
        assert top.get("data", {}).get("update_id") == STATE["update_id"]

    def test_booking_updates_array_has_one(self, api, customer_token):
        r = api.get(f"{BASE_URL}/api/services/bookings/{STATE['booking_id']}",
                    headers=H(customer_token), timeout=20)
        assert r.status_code == 200
        ups = r.json().get("updates", [])
        assert len(ups) == 1
        assert ups[0].get("video_url") == "test/vid1.mp4"
        assert ups[0].get("caption") == "جاري تبديل الشاشة"
        assert ups[0].get("is_public_experience") is True

    def test_merchant_edit_update_toggle_public(self, api, merchant_token):
        r = api.put(f"{BASE_URL}/api/services/updates/{STATE['update_id']}",
                    json={"is_public_experience": False},
                    headers=H(merchant_token), timeout=20)
        assert r.status_code == 200, r.text

    def test_toggle_reflected_on_booking(self, api, customer_token):
        r = api.get(f"{BASE_URL}/api/services/bookings/{STATE['booking_id']}",
                    headers=H(customer_token), timeout=20)
        u = next((u for u in r.json().get("updates", []) if u.get("id") == STATE["update_id"]), None)
        assert u and u.get("is_public_experience") is False


# ─── 6. Reviews ─────────────────────────────────────────────────────────────
class TestReviews:
    def test_invalid_stars_low(self, api, customer_token):
        r = api.post(f"{BASE_URL}/api/services/reviews",
                     json={"booking_id": STATE["booking_id"], "update_id": STATE["update_id"],
                           "stars": 0, "comment": ""},
                     headers=H(customer_token), timeout=20)
        assert r.status_code == 400

    def test_invalid_stars_high(self, api, customer_token):
        r = api.post(f"{BASE_URL}/api/services/reviews",
                     json={"booking_id": STATE["booking_id"], "update_id": STATE["update_id"],
                           "stars": 6, "comment": ""},
                     headers=H(customer_token), timeout=20)
        assert r.status_code == 400

    def test_non_owner_cannot_review(self, api, merchant_token):
        # merchant is not the booking owner
        r = api.post(f"{BASE_URL}/api/services/reviews",
                     json={"booking_id": STATE["booking_id"], "update_id": STATE["update_id"],
                           "stars": 5, "comment": "self review"},
                     headers=H(merchant_token), timeout=20)
        assert r.status_code == 403

    def test_customer_rates_update_5(self, api, customer_token):
        r = api.post(f"{BASE_URL}/api/services/reviews",
                     json={"booking_id": STATE["booking_id"], "update_id": STATE["update_id"],
                           "stars": 5, "comment": "ممتاز"},
                     headers=H(customer_token), timeout=20)
        assert r.status_code == 200, r.text
        # verify avg_rating=5 and review_count=1 on the update
        rb = api.get(f"{BASE_URL}/api/services/bookings/{STATE['booking_id']}",
                     headers=H(customer_token), timeout=20)
        u = next((u for u in rb.json()["updates"] if u["id"] == STATE["update_id"]), None)
        assert u, "update not found"
        assert float(u.get("avg_rating", 0)) == 5.0
        assert int(u.get("review_count", 0)) == 1

    def test_customer_upsert_rates_update_3(self, api, customer_token):
        r = api.post(f"{BASE_URL}/api/services/reviews",
                     json={"booking_id": STATE["booking_id"], "update_id": STATE["update_id"],
                           "stars": 3, "comment": "بس عادي"},
                     headers=H(customer_token), timeout=20)
        assert r.status_code == 200
        rb = api.get(f"{BASE_URL}/api/services/bookings/{STATE['booking_id']}",
                     headers=H(customer_token), timeout=20)
        u = next((u for u in rb.json()["updates"] if u["id"] == STATE["update_id"]), None)
        assert float(u.get("avg_rating", 0)) == 3.0
        assert int(u.get("review_count", 0)) == 1, "upsert must not duplicate"

    def test_final_service_rating(self, api, customer_token):
        r = api.post(f"{BASE_URL}/api/services/reviews",
                     json={"booking_id": STATE["booking_id"], "update_id": "",
                           "stars": 4, "comment": "خدمة جيدة"},
                     headers=H(customer_token), timeout=20)
        assert r.status_code == 200, r.text
        # service.rating updated + review_count=1
        rs = api.get(f"{BASE_URL}/api/services/{STATE['service_id']}", timeout=20)
        s = rs.json()
        assert float(s.get("rating", 0)) == 4.0, f"service rating = {s.get('rating')}"
        assert int(s.get("review_count", 0)) == 1


# ─── 7. Public experiences gallery ──────────────────────────────────────────
class TestPublicExperiences:
    def test_toggle_public_true(self, api, merchant_token):
        r = api.put(f"{BASE_URL}/api/services/updates/{STATE['update_id']}",
                    json={"is_public_experience": True},
                    headers=H(merchant_token), timeout=20)
        assert r.status_code == 200

    def test_experiences_lists_update(self, api):
        r = api.get(f"{BASE_URL}/api/services/{STATE['service_id']}/experiences", timeout=20)
        assert r.status_code == 200
        exps = r.json()
        assert any(e.get("id") == STATE["update_id"] for e in exps), \
            f"public update not found in experiences: {exps}"

    def test_toggle_public_false_removes(self, api, merchant_token):
        r = api.put(f"{BASE_URL}/api/services/updates/{STATE['update_id']}",
                    json={"is_public_experience": False},
                    headers=H(merchant_token), timeout=20)
        assert r.status_code == 200
        rg = api.get(f"{BASE_URL}/api/services/{STATE['service_id']}/experiences", timeout=20)
        assert rg.status_code == 200
        exps = rg.json()
        assert not any(e.get("id") == STATE["update_id"] for e in exps)


# ─── 8. Cross-post to social feed ───────────────────────────────────────────
class TestCrossPost:
    def test_crosspost_creates_social_post(self, api, merchant_token):
        payload = {
            "booking_id": STATE["booking_id"],
            "video_url": "test/vid_crosspost.mp4",
            "caption": "شاهد كيف أصلحنا الشاشة",
            "is_public_experience": True,
            "crosspost_to_social": True,
        }
        r = api.post(f"{BASE_URL}/api/services/updates", json=payload,
                     headers=H(merchant_token), timeout=20)
        assert r.status_code == 200, r.text
        STATE["crosspost_update_id"] = r.json()["id"]

        # verify a matching social post exists (public feed endpoint)
        rp = api.get(f"{BASE_URL}/api/social/posts", timeout=20)
        assert rp.status_code == 200, rp.text
        posts = rp.json() if isinstance(rp.json(), list) else rp.json().get("posts", [])
        match = next(
            (p for p in posts
             if p.get("video") == "test/vid_crosspost.mp4"
             and p.get("badge") == "خدمة صيانة"
             and p.get("linked_service_id") == STATE["service_id"]),
            None,
        )
        assert match, "cross-posted social entry not found (expected badge='خدمة صيانة' + linked_service_id + video)"


# ─── cleanup ────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module", autouse=True)
def _teardown(api):
    yield
    # clean up service update(s) + service using merchant token
    try:
        tok, _ = _login(api, MERCHANT)
        headers = H(tok)
        for k in ("update_id", "crosspost_update_id"):
            uid = STATE.get(k)
            if uid:
                api.delete(f"{BASE_URL}/api/services/updates/{uid}", headers=headers, timeout=15)
        if STATE.get("service_id"):
            api.delete(f"{BASE_URL}/api/merchant/services/{STATE['service_id']}",
                       headers=headers, timeout=15)
    except Exception as e:
        print(f"teardown warn: {e}")
