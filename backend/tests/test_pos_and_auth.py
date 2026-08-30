"""
Backend tests for POS endpoints + Auth login (trim fix).
Covers changes in /app/backend/server.py:
- POST /api/auth/login (with strip on phone/password)
- POST /api/pos/invoice
- GET  /api/pos/invoices
- GET  /api/pos/invoice/{iid}
- Verify branch_inventory decrement after invoice
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mobile-builder-146.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


# ─── Auth ─────────────────────────────────────────────────────────────
class TestAuthLogin:
    def test_merchant_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"phone": "0509999999", "password": "merchant2025"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "token" in body and "user" in body
        assert body["user"]["role"] == "merchant"

    def test_driver_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"phone": "0540001111", "password": "driver1234"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "driver"

    def test_chamber_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"phone": "0550000000", "password": "chamber2025"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "chamber"

    def test_customer_login(self):
        r = requests.post(f"{API}/auth/login",
                          json={"phone": "0500000000", "password": "test1234"}, timeout=30)
        assert r.status_code == 200, r.text
        # customer role in this app is stored as "user"
        assert r.json()["user"]["role"] in ("customer", "user")

    def test_login_with_whitespace_trim(self):
        """Regression: leading/trailing spaces on phone & password must be stripped."""
        r = requests.post(f"{API}/auth/login",
                          json={"phone": "  0540001111  ", "password": "  driver1234  "}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "driver"

    def test_login_invalid_password_401_arabic(self):
        r = requests.post(f"{API}/auth/login",
                          json={"phone": "0509999999", "password": "wrong"}, timeout=30)
        assert r.status_code == 401
        detail = r.json().get("detail", "")
        assert any(ord(c) > 127 for c in detail), f"Expected Arabic detail, got: {detail!r}"


# ─── Fixtures ─────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def merchant_token():
    r = requests.post(f"{API}/auth/login",
                      json={"phone": "0509999999", "password": "merchant2025"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def merchant_headers(merchant_token):
    return {"Authorization": f"Bearer {merchant_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def merchant_product(merchant_headers):
    """Ensure merchant has at least one product. Returns product dict."""
    r = requests.get(f"{API}/merchant/products", headers=merchant_headers, timeout=30)
    assert r.status_code == 200, r.text
    products = r.json()
    if products:
        return products[0]
    # Create a minimal product
    payload = {
        "name": "TEST_POS_Product",
        "name_ar": "منتج اختبار",
        "price": 100.0,
        "stock": 50,
        "published": True,
        "category_id": "",
        "brand_id": "",
        "description": "test",
        "images": [],
    }
    r = requests.post(f"{API}/merchant/products", json=payload, headers=merchant_headers, timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()


@pytest.fixture(scope="module")
def merchant_branch(merchant_headers):
    """Grab or create a merchant branch. Returns branch_id or ''."""
    try:
        r = requests.get(f"{API}/merchant/branches", headers=merchant_headers, timeout=30)
        if r.status_code == 200 and r.json():
            b = r.json()[0]
            return b.get("id") or b.get("_id") or ""
    except Exception:
        pass
    return ""


# ─── POS ──────────────────────────────────────────────────────────────
class TestPOSInvoice:
    created_invoice_id = None
    created_invoice_number = None

    def test_create_invoice(self, merchant_headers, merchant_product, merchant_branch):
        pid = merchant_product.get("id") or merchant_product.get("_id")
        assert pid, f"Product missing id: {merchant_product}"
        price = float(merchant_product.get("price", 100))
        payload = {
            "items": [
                {"product_id": pid, "name": merchant_product.get("name", "TEST"), "price": price, "quantity": 2, "discount": 0}
            ],
            "customer_name": "TEST_Customer",
            "customer_phone": "0500000001",
            "payment_method": "cash",
            "branch_id": merchant_branch,
            "vat_percent": 15,
            "discount": 0,
            "notes": "TEST_POS",
        }
        r = requests.post(f"{API}/pos/invoice", json=payload, headers=merchant_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "id" in body and "invoice_number" in body
        assert body["invoice_number"].startswith("INV-")
        assert len(body["invoice_number"]) == len("INV-") + 6  # 6 padded digits
        subtotal = price * 2
        expected_vat = subtotal * 0.15
        expected_total = subtotal + expected_vat
        assert abs(body["vat_amount"] - expected_vat) < 0.01
        assert abs(body["total"] - expected_total) < 0.01
        TestPOSInvoice.created_invoice_id = body["id"]
        TestPOSInvoice.created_invoice_number = body["invoice_number"]

    def test_list_invoices_contains_new(self, merchant_headers):
        assert TestPOSInvoice.created_invoice_id, "prior test failed"
        r = requests.get(f"{API}/pos/invoices", headers=merchant_headers, timeout=30)
        assert r.status_code == 200, r.text
        invs = r.json()
        assert isinstance(invs, list)
        numbers = [i.get("invoice_number") for i in invs]
        assert TestPOSInvoice.created_invoice_number in numbers, f"Missing {TestPOSInvoice.created_invoice_number} in {numbers[:5]}"

    def test_get_invoice_details(self, merchant_headers):
        iid = TestPOSInvoice.created_invoice_id
        assert iid, "prior test failed"
        r = requests.get(f"{API}/pos/invoice/{iid}", headers=merchant_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("invoice_number") == TestPOSInvoice.created_invoice_number
        assert body.get("customer_name") == "TEST_Customer"
        assert body.get("payment_method") == "cash"
        assert len(body.get("items", [])) == 1

    def test_create_invoice_empty_items_400(self, merchant_headers):
        r = requests.post(f"{API}/pos/invoice",
                          json={"items": [], "payment_method": "cash", "vat_percent": 15},
                          headers=merchant_headers, timeout=30)
        assert r.status_code == 400, r.text

    def test_create_invoice_requires_auth(self):
        r = requests.post(f"{API}/pos/invoice",
                          json={"items": [{"product_id": "x", "name": "y", "price": 1, "quantity": 1}]},
                          timeout=30)
        assert r.status_code in (401, 403)

    def test_customer_cannot_create_invoice(self):
        rl = requests.post(f"{API}/auth/login",
                           json={"phone": "0500000000", "password": "test1234"}, timeout=30)
        assert rl.status_code == 200
        tok = rl.json()["token"]
        r = requests.post(f"{API}/pos/invoice",
                          json={"items": [{"product_id": "x", "name": "y", "price": 1, "quantity": 1}], "payment_method": "cash"},
                          headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert r.status_code == 403, r.text


# ─── Branch inventory decrement ───────────────────────────────────────
class TestInventoryDecrement:
    def test_inventory_decrement_after_invoice(self, merchant_headers, merchant_product, merchant_branch):
        if not merchant_branch:
            pytest.skip("No merchant branch available to test inventory decrement")
        pid = merchant_product.get("id") or merchant_product.get("_id")
        # Get baseline inventory
        r0 = requests.get(f"{API}/merchant/branch-inventory/{merchant_branch}",
                          headers=merchant_headers, timeout=30)
        if r0.status_code != 200:
            pytest.skip(f"branch-inventory endpoint returned {r0.status_code} — skipping decrement check")
        rows = r0.json() if isinstance(r0.json(), list) else r0.json().get("items", [])
        before = next((it.get("quantity", 0) for it in rows if it.get("product_id") == pid), None)
        # Create invoice qty 1
        payload = {
            "items": [{"product_id": pid, "name": "T", "price": 10.0, "quantity": 1, "discount": 0}],
            "customer_name": "TEST_Inv",
            "payment_method": "cash",
            "branch_id": merchant_branch,
            "vat_percent": 15,
        }
        r = requests.post(f"{API}/pos/invoice", json=payload, headers=merchant_headers, timeout=30)
        assert r.status_code == 200, r.text
        # Re-fetch inventory
        r2 = requests.get(f"{API}/merchant/branch-inventory/{merchant_branch}",
                          headers=merchant_headers, timeout=30)
        rows2 = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", [])
        after = next((it.get("quantity", 0) for it in rows2 if it.get("product_id") == pid), None)
        if before is not None and after is not None:
            assert after == before - 1, f"Expected inventory to drop by 1 (before={before}, after={after})"
