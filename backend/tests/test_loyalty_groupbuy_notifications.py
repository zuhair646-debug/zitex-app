"""
Backend tests for Zitex iteration-10 NEW features:
  1. Loyalty Points  (earn on order, redeem, history)         /api/points/*
  2. Group Buy CRUD                                            /api/group-buys/*
  3. Notifications  (list, read, read-all, push-token)         /api/notifications/*
  4. Order-status auto-notification                            /api/merchant/orders/{oid}/status
  5. Permissions  (customer cannot use merchant endpoints)

NOTE: We hit the local backend (where the new code lives). The public preview URL
      points at a frozen Railway deploy that does NOT have these endpoints yet.
"""
import os
import time
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("BACKEND_TEST_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

CUSTOMER = {"phone": "0500000000", "password": "test1234"}
MERCHANT = {"phone": "0509999999", "password": "merchant2025"}


# ─────────────────────────────────────────── Fixtures ───────────────────────────────────────────
@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(http, creds):
    r = http.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed {creds['phone']}: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="session")
def customer_auth(http):
    token, user = _login(http, CUSTOMER)
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}",
                                                      "Content-Type": "application/json"}}


@pytest.fixture(scope="session")
def merchant_auth(http):
    token, user = _login(http, MERCHANT)
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}",
                                                      "Content-Type": "application/json"}}


@pytest.fixture(scope="session")
def some_product(http):
    """Pick any product with price >= 100 SAR so order subtotal triggers points."""
    r = http.get(f"{API}/products?limit=50", timeout=15)
    assert r.status_code == 200
    payload = r.json()
    items = payload["products"] if isinstance(payload, dict) else payload
    for p in items:
        price = p.get("discount_price") or p.get("price") or 0
        if price >= 100:
            return p
    pytest.skip("No product with price >= 100 SAR available for testing")


# ─────────────────────────────────────────── 1. Loyalty: earn on order ─────────────────────────
class TestLoyaltyEarn:
    def test_points_me_shape(self, http, customer_auth):
        r = http.get(f"{API}/points/me", headers=customer_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("balance", "tier", "history", "value_sar", "earn_rate"):
            assert k in data, f"missing key {k} in /points/me response: {data}"
        assert isinstance(data["balance"], int)
        assert isinstance(data["history"], list)

    def test_order_awards_points(self, http, customer_auth, some_product):
        headers = customer_auth["headers"]

        # 1) initial balance
        before = http.get(f"{API}/points/me", headers=headers).json()["balance"]

        # 2) reset cart by GET then deleting items (safest: just add 1 of a >=100 SAR product)
        # ensure subtotal >= 100 by adding qty = ceil(100/price) at least 1
        price = some_product.get("discount_price") or some_product["price"]
        qty = max(1, int(100 // price) + (1 if 100 % price else 0))
        # Add to cart
        ar = http.post(f"{API}/cart", headers=headers, json={
            "product_id": some_product["id"], "quantity": qty,
            "color": None, "storage": None,
        })
        assert ar.status_code == 200, ar.text

        # 3) Create order
        order_payload = {
            "address": "TEST Riyadh - King Fahd Road",
            "phone": "0500000000",
            "delivery_type": "standard",
            "payment_method": "cash",
            "notes": "TEST loyalty",
        }
        orr = http.post(f"{API}/orders", headers=headers, json=order_payload, timeout=20)
        assert orr.status_code == 200, orr.text
        order = orr.json()
        assert "id" in order
        assert order.get("subtotal", 0) >= 100, f"subtotal too low: {order}"
        # points_earned only present when > 0
        assert "points_earned" in order, "order response missing points_earned"
        expected = int(order["subtotal"] / 10)
        assert order["points_earned"] == expected

        # 4) balance increased
        after = http.get(f"{API}/points/me", headers=headers).json()["balance"]
        assert after == before + expected, f"balance not increased: before={before} after={after} expected_delta={expected}"

        # 5) history shows it
        hist = http.get(f"{API}/points/me", headers=headers).json()["history"]
        assert any(h.get("delta") == expected and h.get("order_id") == order["id"] for h in hist), \
            "points_history missing entry for this order"

        # stash order id for later tests via pytest cache-like attribute
        pytest.shared_order_id = order["id"]


# ─────────────────────────────────────────── 2. Loyalty: redeem ─────────────────────────────────
class TestLoyaltyRedeem:
    def test_redeem_success_and_wallet_increase(self, http, customer_auth):
        headers = customer_auth["headers"]
        before = http.get(f"{API}/points/me", headers=headers).json()
        balance_before = before["balance"]
        if balance_before < 10:
            pytest.skip("Customer has less than 10 points; cannot test redeem.")

        wallet_before = http.get(f"{API}/profile", headers=headers)
        # /profile via PUT; we don't have GET for profile — use /auth/me
        # Try /auth/me
        me_r = http.get(f"{API}/auth/me", headers=headers)
        def _wallet(resp_json):
            if isinstance(resp_json, dict) and "user" in resp_json:
                return resp_json["user"].get("wallet_balance", 0) or 0
            return (resp_json or {}).get("wallet_balance", 0) or 0
        wallet_before_val = _wallet(me_r.json()) if me_r.status_code == 200 else 0

        r = http.post(f"{API}/points/redeem", headers=headers, json={"points": 10}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("sar_credited") == 1.0, f"expected sar_credited=1.0, got {body}"

        # points decreased
        after = http.get(f"{API}/points/me", headers=headers).json()
        assert after["balance"] == balance_before - 10

        # wallet increased by 1 SAR
        me2 = http.get(f"{API}/auth/me", headers=headers)
        if me2.status_code == 200:
            wallet_after_val = _wallet(me2.json())
            assert wallet_after_val == round(wallet_before_val + 1.0, 2), \
                f"wallet not incremented: before={wallet_before_val} after={wallet_after_val}"

    def test_redeem_insufficient(self, http, customer_auth):
        # Ask for a giant number
        r = http.post(f"{API}/points/redeem", headers=customer_auth["headers"],
                      json={"points": 10_000_000})
        assert r.status_code == 400, f"expected 400 on insufficient: {r.status_code} {r.text}"

    def test_redeem_invalid_amount(self, http, customer_auth):
        r = http.post(f"{API}/points/redeem", headers=customer_auth["headers"],
                      json={"points": 0})
        assert r.status_code == 400


# ─────────────────────────────────────────── 3. Group Buy ───────────────────────────────────────
class TestGroupBuy:
    def test_list_seeded(self, http):
        r = http.get(f"{API}/group-buys", timeout=15)
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list)
        assert len(arr) >= 1, "expected at least 1 seeded group buy"
        g = arr[0]
        for k in ("product", "participant_count", "progress_pct", "min_participants", "group_price"):
            assert k in g, f"missing {k} in group-buy item: {g}"
        pytest.shared_gb_id = g["id"]
        pytest.shared_gb = g

    def test_join_success(self, http, customer_auth):
        gid = getattr(pytest, "shared_gb_id", None)
        assert gid, "shared_gb_id not set (list test must run first)"
        r = http.post(f"{API}/group-buys/{gid}/join", headers=customer_auth["headers"], timeout=15)
        # If already joined from a previous run, first response will be 400; tolerate that
        if r.status_code == 400 and "مسبق" in r.text:
            pytest.skip("Customer already joined this group buy from a previous run")
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("message", "participant_count", "min_reached"):
            assert k in body

    def test_join_duplicate(self, http, customer_auth):
        gid = getattr(pytest, "shared_gb_id", None)
        assert gid
        r = http.post(f"{API}/group-buys/{gid}/join", headers=customer_auth["headers"])
        assert r.status_code == 400, f"expected 400 duplicate: {r.status_code} {r.text}"
        assert "مسبق" in r.text or "joined" in r.text.lower()

    def test_merchant_create_and_delete(self, http, merchant_auth, some_product):
        end = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        payload = {
            "product_id": some_product["id"],
            "title": f"TEST GroupBuy {uuid.uuid4().hex[:6]}",
            "description": "TEST description",
            "min_participants": 5,
            "max_participants": 20,
            "group_price": 1.0,
            "end_date": end,
        }
        cr = http.post(f"{API}/merchant/group-buys", headers=merchant_auth["headers"],
                       json=payload, timeout=15)
        assert cr.status_code == 200, cr.text
        gid = cr.json().get("id")
        assert gid

        # delete
        dr = http.delete(f"{API}/merchant/group-buys/{gid}", headers=merchant_auth["headers"])
        assert dr.status_code == 200, dr.text


# ─────────────────────────────────────────── 4. Notifications ──────────────────────────────────
class TestNotifications:
    def test_list_and_order_notification_present(self, http, customer_auth):
        r = http.get(f"{API}/notifications", headers=customer_auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list)
        # Order-created notification (title starts with "تم استلام طلبك")
        order_id = getattr(pytest, "shared_order_id", None)
        assert order_id, "no order created previously"
        matches = [n for n in arr if "تم استلام طلبك" in n.get("title", "")
                   and n.get("data", {}).get("order_id") == order_id]
        assert matches, f"order-received notification missing for order {order_id}. Got: {[n.get('title') for n in arr[:5]]}"
        pytest.shared_notif_id = matches[0]["id"]

    def test_read_single(self, http, customer_auth):
        nid = getattr(pytest, "shared_notif_id", None)
        assert nid
        r = http.post(f"{API}/notifications/{nid}/read", headers=customer_auth["headers"])
        assert r.status_code == 200, r.text

    def test_read_all(self, http, customer_auth):
        r = http.post(f"{API}/notifications/read-all", headers=customer_auth["headers"])
        assert r.status_code == 200, r.text
        # verify all are read
        arr = http.get(f"{API}/notifications", headers=customer_auth["headers"]).json()
        assert all(n.get("read") for n in arr), "some notifications still unread"

    def test_push_token_register(self, http, customer_auth):
        r = http.post(f"{API}/push-tokens/register", headers=customer_auth["headers"],
                      json={"token": "ExponentPushToken[xxxTESTxxx]", "platform": "ios"})
        assert r.status_code == 200, r.text
        assert "Push token" in r.json().get("message", "") or "registered" in r.json().get("message", "").lower()


# ─────────────────────────────────────────── 5. Order-status auto notify ───────────────────────
class TestOrderStatusNotification:
    def test_merchant_ship_triggers_customer_notification(self, http, merchant_auth, customer_auth):
        order_id = getattr(pytest, "shared_order_id", None)
        assert order_id, "previous test should have created an order"

        r = http.put(f"{API}/merchant/orders/{order_id}/status",
                     headers=merchant_auth["headers"], json={"status": "shipped"}, timeout=15)
        assert r.status_code == 200, r.text

        # As customer
        time.sleep(0.5)
        arr = http.get(f"{API}/notifications", headers=customer_auth["headers"]).json()
        shipped = [n for n in arr if "تم شحن طلبك" in n.get("title", "")
                   and n.get("data", {}).get("order_id") == order_id]
        assert shipped, f"shipped notification missing. Titles: {[n.get('title') for n in arr[:5]]}"


# ─────────────────────────────────────────── 6. Permissions ─────────────────────────────────────
class TestPermissions:
    def test_customer_cannot_create_group_buy(self, http, customer_auth, some_product):
        end = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        payload = {
            "product_id": some_product["id"], "title": "TEST_forbidden",
            "min_participants": 5, "max_participants": 10, "group_price": 1.0, "end_date": end,
        }
        r = http.post(f"{API}/merchant/group-buys", headers=customer_auth["headers"], json=payload)
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

    def test_customer_cannot_delete_group_buy(self, http, customer_auth):
        gid = getattr(pytest, "shared_gb_id", None) or "000000000000000000000000"
        r = http.delete(f"{API}/merchant/group-buys/{gid}", headers=customer_auth["headers"])
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
