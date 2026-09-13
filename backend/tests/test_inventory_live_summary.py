"""Backend regression for Zitex v1.9.0/v1.10.0 features:
- Merchant inventory dashboard, alerts, adjust, movements
- Competitions live-summary (public)
- Merchant services live-summary + review reply
- Merchant bookings list
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # Fallback to frontend .env location
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if "EXPO_PUBLIC_BACKEND_URL" in line and "=" in line:
                    BASE_URL = line.split("=", 1)[1].strip()
                    break
    except Exception:
        pass
BASE_URL = (BASE_URL or "http://localhost:8001").rstrip("/")


@pytest.fixture(scope="module")
def merchant_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"phone": "0509999999", "password": "merchant2025"},
        timeout=15,
    )
    assert r.status_code == 200, f"Merchant login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def merchant_headers(merchant_token):
    return {"Authorization": f"Bearer {merchant_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def customer_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"phone": "0500000000", "password": "test1234"},
        timeout=15,
    )
    assert r.status_code == 200
    tok = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ── Inventory dashboard ─────────────────────────────────────────
class TestInventoryDashboard:
    def test_overview_returns_totals_and_items(self, merchant_headers):
        r = requests.get(f"{BASE_URL}/api/merchant/inventory", headers=merchant_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "totals" in data and "items" in data
        totals = data["totals"]
        for key in ("total_units", "store_units", "app_units", "low_stock", "out_of_stock"):
            assert key in totals, f"Missing totals key {key}"
        items = data["items"]
        assert isinstance(items, list)
        # Seed says ~4 items
        assert len(items) >= 1, "Expected seeded inventory items"
        first = items[0]
        for key in ("product_id", "product_name", "branch_id", "branch_name",
                    "quantity", "stock_store", "stock_app", "inventory_mode",
                    "inventory_type", "is_low", "is_out"):
            assert key in first, f"Missing item key {key}"
        # inventory_type should be one of the 3 channels
        for it in items:
            assert it["inventory_type"] in ("store", "app", "both")

    def test_overview_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/merchant/inventory", timeout=15)
        assert r.status_code in (401, 403)

    def test_alerts_endpoint(self, merchant_headers):
        r = requests.get(f"{BASE_URL}/api/merchant/inventory/alerts",
                         headers=merchant_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "alerts" in data and "totals" in data
        for a in data["alerts"]:
            assert a["is_low"] or a["is_out"]

    def test_channel_filter_store(self, merchant_headers):
        r = requests.get(f"{BASE_URL}/api/merchant/inventory?channel=store",
                         headers=merchant_headers, timeout=15)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["inventory_type"] in ("store", "both")

    def test_channel_filter_app(self, merchant_headers):
        r = requests.get(f"{BASE_URL}/api/merchant/inventory?channel=app",
                         headers=merchant_headers, timeout=15)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["inventory_type"] in ("app", "both")


# ── Inventory adjust & movements ────────────────────────────────
class TestInventoryAdjust:
    def test_adjust_increments_and_records_movement(self, merchant_headers):
        # Pick one row
        ov = requests.get(f"{BASE_URL}/api/merchant/inventory", headers=merchant_headers, timeout=15).json()
        items = ov["items"]
        assert items, "no inventory rows to test adjust on"
        item = items[0]
        bid, pid = item["branch_id"], item["product_id"]
        before = item["quantity"]

        # +1 adjustment
        r = requests.post(
            f"{BASE_URL}/api/merchant/inventory/{bid}/{pid}/adjust",
            headers=merchant_headers,
            json={"delta": 1, "channel": "combined", "reason": "TEST_ZTX_pytest"},
            timeout=15,
        )
        assert r.status_code == 200, r.text

        # Verify via re-fetch
        ov2 = requests.get(f"{BASE_URL}/api/merchant/inventory", headers=merchant_headers, timeout=15).json()
        after_item = next((x for x in ov2["items"] if x["branch_id"] == bid and x["product_id"] == pid), None)
        assert after_item is not None
        assert after_item["quantity"] == before + 1, f"expected {before+1} got {after_item['quantity']}"

        # Undo -1
        r = requests.post(
            f"{BASE_URL}/api/merchant/inventory/{bid}/{pid}/adjust",
            headers=merchant_headers,
            json={"delta": -1, "channel": "combined", "reason": "TEST_ZTX_pytest_undo"},
            timeout=15,
        )
        assert r.status_code == 200

    def test_adjust_missing_record(self, merchant_headers):
        r = requests.post(
            f"{BASE_URL}/api/merchant/inventory/deadbeef/deadbeef/adjust",
            headers=merchant_headers,
            json={"delta": 1, "channel": "combined"},
            timeout=15,
        )
        assert r.status_code == 404

    def test_movements_endpoint(self, merchant_headers):
        r = requests.get(f"{BASE_URL}/api/merchant/inventory/movements",
                         headers=merchant_headers, timeout=15)
        assert r.status_code == 200
        movs = r.json()
        assert isinstance(movs, list)
        # After adjust above there should be movements
        if movs:
            m = movs[0]
            for key in ("branch_id", "product_id", "delta", "channel", "created_at"):
                assert key in m


# ── PUT branch inventory (combined + separate mode) ─────────────
class TestSetBranchInventory:
    def test_put_combined_mode(self, merchant_headers):
        ov = requests.get(f"{BASE_URL}/api/merchant/inventory", headers=merchant_headers, timeout=15).json()
        assert ov["items"]
        item = ov["items"][0]
        bid, pid = item["branch_id"], item["product_id"]
        r = requests.put(
            f"{BASE_URL}/api/merchant/branches/{bid}/inventory/{pid}",
            headers=merchant_headers,
            json={"inventory_mode": "combined", "quantity": item["quantity"], "min_alert": 5, "inventory_type": item["inventory_type"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("inventory_mode") == "combined"

    def test_put_separate_mode(self, merchant_headers):
        ov = requests.get(f"{BASE_URL}/api/merchant/inventory", headers=merchant_headers, timeout=15).json()
        item = ov["items"][0]
        bid, pid = item["branch_id"], item["product_id"]
        r = requests.put(
            f"{BASE_URL}/api/merchant/branches/{bid}/inventory/{pid}",
            headers=merchant_headers,
            json={
                "inventory_mode": "separate",
                "stock_store": item["quantity"] // 2 or 1,
                "stock_app": item["quantity"] // 2 or 1,
                "min_alert": 5,
                "inventory_type": "both",
            },
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("inventory_mode") == "separate"
        # Revert to combined
        requests.put(
            f"{BASE_URL}/api/merchant/branches/{bid}/inventory/{pid}",
            headers=merchant_headers,
            json={"inventory_mode": "combined", "quantity": item["quantity"], "min_alert": 5},
            timeout=15,
        )


# ── Competitions live summary (public) ─────────────────────────
class TestCompetitionsLiveSummary:
    def test_public_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/competitions/live-summary", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "competitions" in data and "generated_at" in data
        for c in data["competitions"]:
            for key in ("id", "title", "prize", "competition_type", "starts_at", "ends_at",
                        "remaining_ms", "joined_count", "winners", "status"):
                assert key in c, f"missing {key}"


# ── Services live summary (merchant) ───────────────────────────
class TestServicesLiveSummary:
    def test_endpoint_returns_services_with_reviews(self, merchant_headers):
        r = requests.get(f"{BASE_URL}/api/merchant/services/live-summary",
                         headers=merchant_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        if data:
            svc = data[0]
            for key in ("id", "reviews", "review_count", "avg_rating", "booking_count"):
                assert key in svc, f"missing {key} in service"
            assert isinstance(svc["reviews"], list)

    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/merchant/services/live-summary", timeout=10)
        assert r.status_code in (401, 403)


# ── Review reply (merchant) ────────────────────────────────────
class TestReviewReply:
    def test_reply_to_existing_review(self, merchant_headers):
        # Grab a service that has at least one review
        r = requests.get(f"{BASE_URL}/api/merchant/services/live-summary",
                         headers=merchant_headers, timeout=15)
        assert r.status_code == 200
        review_id = None
        for svc in r.json():
            if svc.get("reviews"):
                review_id = svc["reviews"][0]["id"]
                break
        if not review_id:
            pytest.skip("No seed reviews available for reply test")

        rr = requests.post(
            f"{BASE_URL}/api/services/reviews/{review_id}/reply",
            headers=merchant_headers,
            json={"text": "TEST_ZTX شكراً لملاحظتك"},
            timeout=15,
        )
        assert rr.status_code == 200, rr.text
        assert rr.json().get("message")

    def test_reply_requires_text(self, merchant_headers):
        r = requests.get(f"{BASE_URL}/api/merchant/services/live-summary",
                         headers=merchant_headers, timeout=15)
        review_id = None
        for svc in r.json():
            if svc.get("reviews"):
                review_id = svc["reviews"][0]["id"]
                break
        if not review_id:
            pytest.skip("No seed reviews for empty-text test")
        rr = requests.post(
            f"{BASE_URL}/api/services/reviews/{review_id}/reply",
            headers=merchant_headers,
            json={"text": "   "},
            timeout=10,
        )
        assert rr.status_code == 400

    def test_reply_rejects_non_merchant(self, customer_headers):
        rr = requests.post(
            f"{BASE_URL}/api/services/reviews/000000000000000000000000/reply",
            headers=customer_headers,
            json={"text": "hello"},
            timeout=10,
        )
        assert rr.status_code == 403


# ── Merchant bookings list ─────────────────────────────────────
class TestMerchantBookings:
    def test_list_bookings(self, merchant_headers):
        r = requests.get(f"{BASE_URL}/api/merchant/bookings",
                         headers=merchant_headers, timeout=15)
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        # Review request says ~14 seeded bookings
        assert len(arr) >= 1
        b = arr[0]
        for key in ("id", "status"):
            assert key in b
