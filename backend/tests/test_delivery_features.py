"""
Tests for the new Zitex delivery + merchant social comments features.

Covers:
1. GET /api/delivery/settings (defaults)
2. PUT /api/merchant/delivery/settings (full settings + zones)
3. POST /api/delivery/calculate-fee (4 cases)
4. Zone polygon matching
5. Zone circle matching
6. POST /api/delivery/quote (branch + fee + alternative_note)
7. POST /api/orders (customer flow with delivery_type=same_day)
8. GET /api/orders/{id}/tracking
9. GET /api/merchant/social/comments (with attached post)
10. DELETE /api/merchant/social/comments/{cid}
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://mobile-builder-146.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

MERCHANT = {"phone": "0509999999", "password": "merchant2025"}
CUSTOMER = {"phone": "0500000000", "password": "test1234"}


# ─── Shared fixtures ───
@pytest.fixture(scope="session")
def merchant_token():
    r = requests.post(f"{API}/auth/login", json=MERCHANT, timeout=15)
    assert r.status_code == 200, f"Merchant login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def customer_token():
    r = requests.post(f"{API}/auth/login", json=CUSTOMER, timeout=15)
    assert r.status_code == 200, f"Customer login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def merchant_headers(merchant_token):
    return {"Authorization": f"Bearer {merchant_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def customer_headers(customer_token):
    return {"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"}


# ─── Default delivery settings to restore between tests ───
DEFAULT_SETTINGS = {
    "base_fee": 10,
    "base_distance_km": 10,
    "per_km_rate": 1.2,
    "free_delivery_threshold": 0,
    "max_distance_km": 50,
    "same_day_enabled": True,
    "same_day_flat_price": 30,
    "scheduled_enabled": True,
    "scheduled_flat_price": 20,
    "scheduled_slots": [
        {"label": "صباحاً 9 - 12", "label_en": "Morning 9 - 12", "start": "09:00", "end": "12:00"},
        {"label": "ظهراً 12 - 4", "label_en": "Noon 12 - 4", "start": "12:00", "end": "16:00"},
        {"label": "مساءً 4 - 8", "label_en": "Evening 4 - 8", "start": "16:00", "end": "20:00"},
        {"label": "ليلاً 8 - 11", "label_en": "Night 8 - 11", "start": "20:00", "end": "23:00"},
    ],
    "zones": [],
}


def _put_settings(headers, payload):
    r = requests.put(f"{API}/merchant/delivery/settings", headers=headers, json=payload, timeout=15)
    assert r.status_code == 200, f"PUT settings failed: {r.status_code} {r.text}"
    return r.json()


def _get_settings():
    r = requests.get(f"{API}/delivery/settings", timeout=15)
    assert r.status_code == 200, f"GET settings failed: {r.text}"
    return r.json()


# ───────────────────────────────────────
# 1) GET /api/delivery/settings (defaults)
# ───────────────────────────────────────
class TestDeliverySettings:
    def test_get_settings_returns_required_fields(self, merchant_headers):
        # Reset zones to empty + ensure defaults
        _put_settings(merchant_headers, DEFAULT_SETTINGS)
        s = _get_settings()
        for key in [
            "base_fee", "base_distance_km", "per_km_rate",
            "same_day_enabled", "same_day_flat_price",
            "scheduled_enabled", "scheduled_flat_price",
            "scheduled_slots", "zones",
        ]:
            assert key in s, f"Missing {key} in settings: {s}"

        assert s["base_fee"] == 10
        assert s["base_distance_km"] == 10
        assert s["per_km_rate"] == 1.2
        assert s["same_day_enabled"] is True
        assert s["same_day_flat_price"] == 30
        assert s["scheduled_enabled"] is True
        assert s["scheduled_flat_price"] == 20
        assert isinstance(s["scheduled_slots"], list)
        assert len(s["scheduled_slots"]) == 4
        assert isinstance(s["zones"], list)


# ───────────────────────────────────────
# 2) PUT /api/merchant/delivery/settings — persist full settings + zones
# ───────────────────────────────────────
class TestUpdateDeliverySettings:
    def test_put_then_get_returns_updated_values(self, merchant_headers):
        payload = dict(DEFAULT_SETTINGS)
        payload["base_fee"] = 12
        payload["per_km_rate"] = 1.5
        payload["zones"] = [
            {
                "name": "Polygon Zone",
                "name_en": "Polygon Zone",
                "delivery_type": "any",
                "fixed_price": 50,
                "polygon": [[24.7, 46.6], [24.75, 46.6], [24.75, 46.7], [24.7, 46.7]],
            },
            {
                "name": "Circle Zone",
                "name_en": "Circle Zone",
                "delivery_type": "same_day",
                "fixed_price": 15,
                "center_lat": 24.7136,
                "center_lng": 46.6753,
                "radius_km": 2,
            },
        ]
        _put_settings(merchant_headers, payload)
        s = _get_settings()
        assert s["base_fee"] == 12
        assert s["per_km_rate"] == 1.5
        assert len(s["zones"]) == 2
        assert s["zones"][0]["name"] == "Polygon Zone"
        assert s["zones"][1]["delivery_type"] == "same_day"

        # restore defaults so other tests start clean
        _put_settings(merchant_headers, DEFAULT_SETTINGS)

    def test_put_settings_requires_merchant_auth(self, customer_headers):
        r = requests.put(
            f"{API}/merchant/delivery/settings",
            headers=customer_headers,
            json=DEFAULT_SETTINGS,
            timeout=15,
        )
        assert r.status_code == 403, f"Expected 403 for customer, got {r.status_code}: {r.text}"


# ───────────────────────────────────────
# 3) POST /api/delivery/calculate-fee — 4 cases
# ───────────────────────────────────────
class TestCalculateFee:
    @pytest.fixture(autouse=True)
    def _reset_settings(self, merchant_headers):
        _put_settings(merchant_headers, DEFAULT_SETTINGS)
        yield
        _put_settings(merchant_headers, DEFAULT_SETTINGS)

    def test_standard_within_base_distance(self):
        r = requests.post(
            f"{API}/delivery/calculate-fee",
            json={"delivery_type": "standard", "distance_km": 5},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["delivery_fee"] == 10
        assert data["delivery_type"] == "standard"
        assert data["in_zone"] is False

    def test_standard_beyond_base_distance(self):
        r = requests.post(
            f"{API}/delivery/calculate-fee",
            json={"delivery_type": "standard", "distance_km": 15},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # 10 + (15-10)*1.2 = 16
        assert data["delivery_fee"] == 16, f"Expected 16, got {data['delivery_fee']}"
        assert data["in_zone"] is False

    def test_same_day_no_zone_match(self):
        r = requests.post(
            f"{API}/delivery/calculate-fee",
            json={"delivery_type": "same_day", "distance_km": 5},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["delivery_fee"] == 30
        assert data["delivery_type"] == "same_day"
        assert data["in_zone"] is False

    def test_scheduled_no_zone_match_includes_slots(self):
        r = requests.post(
            f"{API}/delivery/calculate-fee",
            json={"delivery_type": "scheduled", "distance_km": 5},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["delivery_fee"] == 20
        assert data["delivery_type"] == "scheduled"
        assert "scheduled_slots" in data
        assert isinstance(data["scheduled_slots"], list)
        assert len(data["scheduled_slots"]) == 4


# ───────────────────────────────────────
# 4) Zone polygon match
# ───────────────────────────────────────
class TestZonePolygonMatch:
    def test_polygon_zone_matches_point_inside(self, merchant_headers):
        payload = dict(DEFAULT_SETTINGS)
        payload["zones"] = [{
            "name": "Polygon Test Zone",
            "name_en": "Polygon Test Zone",
            "delivery_type": "any",
            "fixed_price": 50,
            "polygon": [[24.7, 46.6], [24.75, 46.6], [24.75, 46.7], [24.7, 46.7]],
        }]
        _put_settings(merchant_headers, payload)
        try:
            r = requests.post(
                f"{API}/delivery/calculate-fee",
                json={"lat": 24.72, "lng": 46.65, "delivery_type": "standard", "distance_km": 5},
                timeout=15,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["delivery_fee"] == 50, data
            assert data["in_zone"] is True, data
            assert data["zone_name"] == "Polygon Test Zone"
        finally:
            _put_settings(merchant_headers, DEFAULT_SETTINGS)


# ───────────────────────────────────────
# 5) Zone circle match
# ───────────────────────────────────────
class TestZoneCircleMatch:
    def test_circle_zone_matches_for_same_day(self, merchant_headers):
        payload = dict(DEFAULT_SETTINGS)
        payload["zones"] = [{
            "name": "Circle Test Zone",
            "name_en": "Circle Test Zone",
            "delivery_type": "same_day",
            "fixed_price": 15,
            "center_lat": 24.7136,
            "center_lng": 46.6753,
            "radius_km": 2,
        }]
        _put_settings(merchant_headers, payload)
        try:
            r = requests.post(
                f"{API}/delivery/calculate-fee",
                json={"lat": 24.72, "lng": 46.68, "delivery_type": "same_day", "distance_km": 1},
                timeout=15,
            )
            assert r.status_code == 200, r.text
            data = r.json()
            assert data["in_zone"] is True, data
            assert data["delivery_fee"] == 15, data
            assert data["zone_name"] == "Circle Test Zone"
        finally:
            _put_settings(merchant_headers, DEFAULT_SETTINGS)


# ───────────────────────────────────────
# 6) POST /api/delivery/quote
# ───────────────────────────────────────
class TestDeliveryQuote:
    def test_quote_returns_branch_and_fee(self, merchant_headers):
        # ensure default settings (no zones) so a deterministic fee
        _put_settings(merchant_headers, DEFAULT_SETTINGS)

        # Ensure at least one branch exists
        branches = requests.get(f"{API}/branches", timeout=15).json()
        if not branches:
            requests.post(
                f"{API}/merchant/branches",
                headers=merchant_headers,
                json={
                    "name": "TEST_Main Branch",
                    "address": "Riyadh",
                    "lat": 24.7136,
                    "lng": 46.6753,
                    "phone": "0501111111",
                    "published": True,
                },
                timeout=15,
            )

        r = requests.post(
            f"{API}/delivery/quote",
            json={"lat": 24.72, "lng": 46.68, "delivery_type": "standard", "item_ids": []},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "branch" in data and data["branch"] is not None
        assert "id" in data["branch"]
        assert "name" in data["branch"]
        assert "distance_km" in data["branch"]
        assert "fee" in data
        assert "delivery_fee" in data["fee"]
        # alternative_note is null when items list is empty
        assert data.get("alternative_note") in (None, {})


# ───────────────────────────────────────
# 7) POST /api/orders — customer flow with same_day delivery
# 8) GET /api/orders/{id}/tracking
# ───────────────────────────────────────
class TestOrderFlow:
    @pytest.fixture(scope="class")
    def created_order(self, customer_headers, merchant_headers):
        # Reset settings to defaults (no zones, same_day_flat_price=30)
        _put_settings(merchant_headers, DEFAULT_SETTINGS)

        # Ensure at least one branch
        branches = requests.get(f"{API}/branches", timeout=15).json()
        if not branches:
            requests.post(
                f"{API}/merchant/branches",
                headers=merchant_headers,
                json={
                    "name": "TEST_Main Branch",
                    "address": "Riyadh",
                    "lat": 24.7136,
                    "lng": 46.6753,
                    "phone": "0501111111",
                    "published": True,
                },
                timeout=15,
            )

        # Pick a product
        pr = requests.get(f"{API}/products?limit=1", timeout=15).json()
        products = pr.get("products", []) if isinstance(pr, dict) else pr
        assert products, "No products available to add to cart"
        product_id = products[0]["id"]

        # Clear any existing cart items first by deleting them
        existing_cart = requests.get(f"{API}/cart", headers=customer_headers, timeout=15).json()
        for ci in existing_cart:
            requests.put(
                f"{API}/cart/{ci['id']}?quantity=0",
                headers=customer_headers,
                timeout=15,
            )

        # Add product to cart
        rc = requests.post(
            f"{API}/cart",
            headers=customer_headers,
            json={"product_id": product_id, "quantity": 1},
            timeout=15,
        )
        assert rc.status_code == 200, f"Add to cart failed: {rc.text}"

        # Create order
        order_body = {
            "address": "TEST_Riyadh, Olaya Street",
            "phone": "0500000000",
            "delivery_type": "same_day",
            "payment_method": "cash_on_delivery",
            "dest_lat": 24.72,
            "dest_lng": 46.68,
        }
        ro = requests.post(f"{API}/orders", headers=customer_headers, json=order_body, timeout=20)
        assert ro.status_code == 200, f"Create order failed: {ro.status_code} {ro.text}"
        return ro.json()

    def test_order_has_delivery_fee_and_branch(self, created_order):
        o = created_order
        assert "id" in o, o
        # same_day flat = 30 (no zones)
        assert o.get("delivery_fee") in (30, 30.0), f"Expected 30, got {o.get('delivery_fee')}"
        assert o.get("delivery_cost") in (30, 30.0)
        assert o.get("dest_lat") == 24.72
        assert o.get("dest_lng") == 46.68
        assert o.get("branch_id"), f"branch_id missing: {o}"
        assert o.get("delivery_type") == "same_day"
        assert o.get("status") == "processing"

    def test_get_order_tracking(self, created_order):
        oid = created_order["id"]
        r = requests.get(f"{API}/orders/{oid}/tracking", timeout=15)
        assert r.status_code == 200, r.text
        t = r.json()
        for key in ["id", "status", "total", "address", "dest_lat", "dest_lng", "branch_lat", "branch_lng"]:
            assert key in t, f"Missing {key} in tracking response: {t}"
        assert t["id"] == oid
        assert t["address"] == "TEST_Riyadh, Olaya Street"
        assert t["dest_lat"] == 24.72
        assert t["dest_lng"] == 46.68


# ───────────────────────────────────────
# 9) GET /api/merchant/social/comments
# 10) DELETE /api/merchant/social/comments/{cid}
# ───────────────────────────────────────
class TestMerchantSocialComments:
    def test_create_get_and_delete_comment(self, merchant_headers, customer_headers):
        # Fetch any social post
        posts = requests.get(f"{API}/social/posts", timeout=15).json()
        assert isinstance(posts, list), posts
        if not posts:
            pytest.skip("No social posts exist to attach comments to")
        post_id = posts[0]["id"]
        initial_comments_count = posts[0].get("comments", 0)

        # Customer adds a comment
        rc = requests.post(
            f"{API}/social/posts/{post_id}/comments",
            headers=customer_headers,
            json={"text": "TEST_Great product! Looking forward to buying it."},
            timeout=15,
        )
        assert rc.status_code == 200, rc.text

        # Merchant fetches all comments
        rm = requests.get(f"{API}/merchant/social/comments", headers=merchant_headers, timeout=15)
        assert rm.status_code == 200, rm.text
        comments = rm.json()
        assert isinstance(comments, list)
        # Find our comment
        our_comment = next(
            (c for c in comments if c.get("text") == "TEST_Great product! Looking forward to buying it."),
            None,
        )
        assert our_comment is not None, f"Comment not found in merchant inbox: {comments[:3]}"
        # Should have post info attached
        assert "post" in our_comment, our_comment
        assert our_comment["post"].get("id") == post_id

        cid = our_comment["id"]

        # Merchant deletes the comment
        rd = requests.delete(f"{API}/merchant/social/comments/{cid}", headers=merchant_headers, timeout=15)
        assert rd.status_code == 200, rd.text

        # Verify removed
        rm2 = requests.get(f"{API}/merchant/social/comments", headers=merchant_headers, timeout=15)
        remaining = rm2.json()
        assert not any(c["id"] == cid for c in remaining), "Comment still present after delete"

        # Verify post.comments count decremented (should match initial value)
        posts2 = requests.get(f"{API}/social/posts", timeout=15).json()
        post_after = next((p for p in posts2 if p["id"] == post_id), None)
        assert post_after is not None
        assert post_after.get("comments", 0) == initial_comments_count, (
            f"Post comments count not decremented: before={initial_comments_count}, "
            f"after={post_after.get('comments')}"
        )

    def test_get_merchant_comments_requires_merchant_role(self, customer_headers):
        r = requests.get(f"{API}/merchant/social/comments", headers=customer_headers, timeout=15)
        assert r.status_code == 403, r.text
