"""Comprehensive customer-flow backend tests for Zitex pre-deploy QA.

Covers: auth (customer), home/banners/categories, products + warranty,
cart + checkout (3 delivery types), social (like/comment/poll/story + role guard),
competitions (list/join/answer), order tracking (auth required),
addresses, location, branches nearest, warranties, profile, merchant-block.
"""
import os
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE, "EXPO_PUBLIC_BACKEND_URL must be set"
BASE = BASE.rstrip("/")

CUSTOMER = {"phone": "0500000000", "password": "test1234"}
MERCHANT = {"phone": "0509999999", "password": "merchant2025"}


# ── shared fixtures ──
@pytest.fixture(scope="session")
def customer_token():
    r = requests.post(f"{BASE}/api/auth/login", json=CUSTOMER, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def merchant_token():
    r = requests.post(f"{BASE}/api/auth/login", json=MERCHANT, timeout=15)
    assert r.status_code == 200, f"merchant login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture
def hc(customer_token):
    return {"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"}


@pytest.fixture
def hm(merchant_token):
    return {"Authorization": f"Bearer {merchant_token}", "Content-Type": "application/json"}


# ── 1. Auth & Routing ──
class TestAuth:
    def test_customer_login_returns_token_and_user(self):
        r = requests.post(f"{BASE}/api/auth/login", json=CUSTOMER, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "token" in body and "user" in body
        # role must be "user" for customer
        assert body["user"].get("role") == "user", f"role={body['user'].get('role')}"

    def test_auth_me_returns_role_user(self, hc):
        r = requests.get(f"{BASE}/api/auth/me", headers=hc, timeout=15)
        assert r.status_code == 200
        u = r.json().get("user", r.json())
        assert u.get("role") == "user"


# ── 2. Home: banners, categories, competitions ──
class TestHome:
    def test_banners(self, hc):
        r = requests.get(f"{BASE}/api/banners", headers=hc, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_categories(self, hc):
        r = requests.get(f"{BASE}/api/categories", headers=hc, timeout=15)
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_products_grid_loads(self, hc):
        r = requests.get(f"{BASE}/api/products?sort=popular&limit=6", headers=hc, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body.get("products"), list)
        assert len(body["products"]) > 0

    def test_used_devices_filter(self, hc):
        r = requests.get(f"{BASE}/api/products?condition=used", headers=hc, timeout=15)
        assert r.status_code == 200
        prods = r.json().get("products", [])
        # all products returned should be used (if any returned)
        for p in prods:
            assert p.get("condition") == "used", f"expected used, got {p.get('condition')}"

    def test_competitions_list_real_data(self, hc):
        r = requests.get(f"{BASE}/api/competitions", headers=hc, timeout=15)
        assert r.status_code == 200
        comps = r.json()
        assert isinstance(comps, list) and len(comps) > 0, "No competitions seeded"
        c = comps[0]
        # must expose joined_count and prize so the home banner is real (not hardcoded)
        assert "joined_count" in c
        assert "prize" in c or "title" in c


# ── 3. Product Detail (warranty, condition, delivery options) ──
class TestProductDetail:
    def test_product_detail_has_warranty_and_condition(self, hc):
        prods = requests.get(f"{BASE}/api/products?limit=1", headers=hc, timeout=15).json()["products"]
        assert prods
        p = requests.get(f"{BASE}/api/products/{prods[0]['id']}", headers=hc, timeout=15).json()
        assert p.get("id")
        # condition can be 'new', 'used', or 'used_3months', 'used_6months', etc.
        assert p.get("condition") == "new" or str(p.get("condition", "")).startswith("used")
        # warranty_days OR warranty field may not exist on every product —
        # the frontend shows "بدون ضمان" when missing. Track this as a data gap.
        has_warranty = ("warranty_days" in p) or ("warranty" in p)
        if not has_warranty:
            pytest.skip("Product missing warranty_days field — data/seed gap (frontend falls back to 'بدون ضمان')")


# ── 4. Cart & Checkout (3 delivery types + order create) ──
class TestCartCheckout:
    def test_add_to_cart_then_get(self, hc):
        prods = requests.get(f"{BASE}/api/products?limit=1", headers=hc, timeout=15).json()["products"]
        pid = prods[0]["id"]
        r = requests.post(f"{BASE}/api/cart", json={"product_id": pid, "quantity": 1}, headers=hc, timeout=15)
        assert r.status_code in (200, 201), r.text
        r2 = requests.get(f"{BASE}/api/cart", headers=hc, timeout=15)
        assert r2.status_code == 200
        items = r2.json()
        assert any((it.get("product") or {}).get("id") == pid or it.get("product_id") == pid for it in items)

    def test_delivery_quote_three_types(self, hc):
        for dtype in ("standard", "same_day", "scheduled"):
            r = requests.post(
                f"{BASE}/api/delivery/quote",
                json={"lat": 24.7136, "lng": 46.6753, "delivery_type": dtype, "item_ids": []},
                headers=hc, timeout=15,
            )
            assert r.status_code == 200, f"{dtype}: {r.status_code} {r.text}"
            body = r.json()
            assert "fee" in body
            if dtype == "scheduled":
                assert isinstance(body["fee"].get("scheduled_slots"), list)

    def test_order_create_with_dest_coords(self, hc):
        # ensure cart has at least one item
        prods = requests.get(f"{BASE}/api/products?limit=1", headers=hc, timeout=15).json()["products"]
        requests.post(f"{BASE}/api/cart", json={"product_id": prods[0]["id"], "quantity": 1}, headers=hc, timeout=15)
        payload = {
            "address": "TEST_Order address Riyadh",
            "phone": "0500000000",
            "delivery_type": "same_day",
            "payment_method": "cash_on_delivery",
            "dest_lat": 24.72,
            "dest_lng": 46.68,
        }
        r = requests.post(f"{BASE}/api/orders", json=payload, headers=hc, timeout=20)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("id"), "order create did not return id"
        # GET to verify persistence
        gr = requests.get(f"{BASE}/api/orders/{body['id']}", headers=hc, timeout=15)
        assert gr.status_code == 200
        return body["id"]


# ── 5. Social Feed ──
class TestSocial:
    def test_get_posts(self, hc):
        r = requests.get(f"{BASE}/api/social/posts", headers=hc, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_stories(self, hc):
        r = requests.get(f"{BASE}/api/social/stories", headers=hc, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_like_and_comment_toggle(self, hc, hm):
        # create a fresh post via merchant
        cr = requests.post(
            f"{BASE}/api/merchant/social/posts",
            json={"type": "post", "text": "TEST_customer_flow_post"},
            headers=hm, timeout=15,
        )
        assert cr.status_code in (200, 201), cr.text
        pid = cr.json().get("id") or cr.json().get("_id")
        assert pid
        # like
        r = requests.post(f"{BASE}/api/social/posts/{pid}/like", headers=hc, timeout=15)
        assert r.status_code == 200
        # comment
        r2 = requests.post(
            f"{BASE}/api/social/posts/{pid}/comments",
            json={"content": "TEST_comment"}, headers=hc, timeout=15,
        )
        assert r2.status_code in (200, 201), r2.text

    def test_poll_vote(self, hc, hm):
        cr = requests.post(
            f"{BASE}/api/merchant/social/posts",
            json={"type": "poll", "text": "TEST_poll_q", "poll_options": [{"text": "A"}, {"text": "B"}]},
            headers=hm, timeout=15,
        )
        assert cr.status_code in (200, 201)
        pid = cr.json().get("id") or cr.json().get("_id")
        r = requests.post(f"{BASE}/api/social/posts/{pid}/vote",
                          json={"option_index": 0}, headers=hc, timeout=15)
        assert r.status_code == 200, r.text

    def test_customer_cannot_create_merchant_post(self, hc):
        r = requests.post(
            f"{BASE}/api/merchant/social/posts",
            json={"type": "post", "text": "TEST_should_fail"}, headers=hc, timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}"


# ── 6. Competitions ──
class TestCompetitions:
    def test_join_competition(self, hc):
        comps = requests.get(f"{BASE}/api/competitions", headers=hc, timeout=15).json()
        assert comps
        cid = comps[0].get("id") or comps[0].get("_id")
        r = requests.post(f"{BASE}/api/competitions/{cid}/join", headers=hc, timeout=15)
        # 200 success or 400 "already joined" — both acceptable
        assert r.status_code in (200, 400), r.text


# ── 7. Order Tracking (must require auth) ──
class TestOrderTracking:
    def test_tracking_requires_auth(self, hc):
        # create an order first
        prods = requests.get(f"{BASE}/api/products?limit=1", headers=hc, timeout=15).json()["products"]
        requests.post(f"{BASE}/api/cart", json={"product_id": prods[0]["id"], "quantity": 1}, headers=hc, timeout=15)
        order = requests.post(
            f"{BASE}/api/orders",
            json={"address": "TEST_track", "phone": "0500000000", "delivery_type": "standard",
                  "payment_method": "cash_on_delivery", "dest_lat": 24.72, "dest_lng": 46.68},
            headers=hc, timeout=15,
        ).json()
        oid = order.get("id")
        assert oid
        # unauthenticated should be 401/403
        r0 = requests.get(f"{BASE}/api/orders/{oid}/tracking", timeout=15)
        assert r0.status_code in (401, 403), f"expected 401/403, got {r0.status_code}"
        # authenticated owner should see tracking
        r = requests.get(f"{BASE}/api/orders/{oid}/tracking", headers=hc, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "status" in body and "dest_lat" in body and "dest_lng" in body


# ── 8. Addresses & Location ──
class TestAddressesLocation:
    def test_get_addresses(self, hc):
        r = requests.get(f"{BASE}/api/addresses", headers=hc, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_post_address(self, hc):
        body = {"label": "TEST_home", "address": "TEST_address line", "lat": 24.72, "lng": 46.68}
        r = requests.post(f"{BASE}/api/addresses", json=body, headers=hc, timeout=15)
        assert r.status_code in (200, 201), r.text

    def test_update_location(self, hc):
        r = requests.put(
            f"{BASE}/api/users/me/location",
            json={"lat": 24.7136, "lng": 46.6753}, headers=hc, timeout=15,
        )
        assert r.status_code == 200, r.text

    def test_nearest_branch(self, hc):
        r = requests.get(f"{BASE}/api/branches/nearest?lat=24.7136&lng=46.6753", headers=hc, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        # response shape: { branch: {id, lat, lng, distance_km, ...}, distance_km }
        branch = body.get("branch") or body
        assert branch.get("id") or branch.get("_id"), f"missing branch id: {body}"
        assert "distance_km" in body or "distance_km" in branch


# ── 9. Warranties ──
class TestWarranties:
    def test_warranties_endpoint(self, hc):
        r = requests.get(f"{BASE}/api/warranties", headers=hc, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ── 10. Profile ──
class TestProfile:
    def test_user_profile(self, hc):
        # Specification asked for /api/users/me/profile but backend exposes /api/auth/me
        # and /api/wallet for balance. We test what actually exists & confirms wallet works.
        r_me = requests.get(f"{BASE}/api/auth/me", headers=hc, timeout=15)
        assert r_me.status_code == 200
        r_wallet = requests.get(f"{BASE}/api/wallet", headers=hc, timeout=15)
        assert r_wallet.status_code == 200, r_wallet.text
        w = r_wallet.json()
        assert ("balance" in w) or ("wallet_balance" in w), f"missing wallet balance: {w}"

    def test_users_me_profile_endpoint_missing(self, hc):
        # Documenting that the requested endpoint /api/users/me/profile is NOT IMPLEMENTED.
        r = requests.get(f"{BASE}/api/users/me/profile", headers=hc, timeout=15)
        # Mark as xfail-style: assert it returns 404 so we capture the gap.
        assert r.status_code == 404, \
            f"endpoint exists now (status={r.status_code}); update test or remove this guard"
