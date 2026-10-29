# POS barcode scanner / quick-add / unified inventory / WhatsApp receipt / labels
import os
import random
import pytest
import requests

def _base():
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not url:
        for line in open("/app/frontend/.env"):
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                url = line.split("=", 1)[1].strip().strip('"')
    return url.rstrip("/")

BASE_URL = _base()


def _login(phone, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"phone": phone, "password": pw}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {phone}: {r.status_code} {r.text[:100]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def merchant():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_login('0509999999', 'merchant2025')}"
    return s


@pytest.fixture(scope="module")
def cashier():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_login('0530000001', 'emp1234')}"
    return s


@pytest.fixture(scope="module")
def customer():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_login('0500000000', 'test1234')}"
    return s


@pytest.fixture(scope="module")
def created(merchant):
    ids = []
    yield ids
    for pid in ids:
        merchant.delete(f"{BASE_URL}/api/merchant/products/{pid}")


def _code():
    return f"TEST{random.randint(10**8, 10**9)}"


# ── by-barcode lookup ──
class TestLookup:
    def test_unknown_404(self, merchant):
        r = merchant.get(f"{BASE_URL}/api/merchant/products/by-barcode/TESTNOPE{random.randint(1, 10**9)}")
        assert r.status_code == 404

    def test_quick_add_then_lookup(self, merchant, created):
        code = _code()
        r = merchant.post(f"{BASE_URL}/api/merchant/products/quick-add",
                          json={"barcode": code, "name_ar": "TEST منتج", "price": 50, "stock": 5})
        assert r.status_code == 200, r.text
        p = r.json()
        created.append(p["id"])
        assert p["barcode"] == code and p["stock"] == 5 and p["price"] == 50.0 and p["in_stock"] is True
        assert "_id" not in p
        g = merchant.get(f"{BASE_URL}/api/merchant/products/by-barcode/{code}")
        assert g.status_code == 200 and g.json()["id"] == p["id"] and "_id" not in g.json()

    def test_lookup_by_sku(self, merchant, created):
        sku = _code()
        r = merchant.post(f"{BASE_URL}/api/merchant/products",
                          json={"name_ar": "TEST sku", "price": 10, "sku": sku, "stock": 3})
        assert r.status_code == 200, r.text
        created.append(r.json()["id"])
        g = merchant.get(f"{BASE_URL}/api/merchant/products/by-barcode/{sku}")
        assert g.status_code == 200 and g.json()["sku"] == sku

    def test_cashier_can_lookup(self, cashier):
        r = cashier.get(f"{BASE_URL}/api/merchant/products/by-barcode/TESTNOPE1")
        assert r.status_code == 404


# ── quick-add validation ──
class TestQuickAdd:
    def test_duplicate_409(self, merchant, created):
        code = _code()
        r = merchant.post(f"{BASE_URL}/api/merchant/products/quick-add", json={"barcode": code, "name_ar": "TEST a", "price": 5})
        assert r.status_code == 200
        created.append(r.json()["id"])
        r2 = merchant.post(f"{BASE_URL}/api/merchant/products/quick-add", json={"barcode": code, "name_ar": "TEST b", "price": 5})
        assert r2.status_code == 409

    @pytest.mark.parametrize("body", [
        {"barcode": "TESTX1", "name_ar": "", "price": 5},
        {"barcode": "TESTX2", "name_ar": "TEST", "price": 0},
        {"barcode": "", "name_ar": "TEST", "price": 5},
    ])
    def test_missing_fields_400(self, merchant, body):
        r = merchant.post(f"{BASE_URL}/api/merchant/products/quick-add", json=body)
        assert r.status_code == 400

    def test_missing_price_key_422(self, merchant):
        r = merchant.post(f"{BASE_URL}/api/merchant/products/quick-add", json={"barcode": "TESTX3", "name_ar": "TEST"})
        assert r.status_code in (400, 422)


# ── unified inventory + WhatsApp ──
class TestInvoiceStockWhatsApp:
    def test_invoice_decrements_and_whatsapp(self, merchant, created):
        code = _code()
        p = merchant.post(f"{BASE_URL}/api/merchant/products/quick-add",
                          json={"barcode": code, "name_ar": "TEST inv", "price": 100, "stock": 10}).json()
        created.append(p["id"])
        inv = merchant.post(f"{BASE_URL}/api/pos/invoice", json={
            "items": [{"product_id": p["id"], "name": "x", "price": 1, "quantity": 3}],
            "customer_name": "TEST", "customer_phone": "0512345678", "payment_method": "cash"})
        assert inv.status_code == 200, inv.text
        iid = inv.json()["id"]
        assert abs(inv.json()["total"] - 345.0) < 0.01
        g = merchant.get(f"{BASE_URL}/api/merchant/products/by-barcode/{code}").json()
        assert g["stock"] == 7
        w = merchant.get(f"{BASE_URL}/api/pos/invoice/{iid}/whatsapp")
        assert w.status_code == 200, w.text
        d = w.json()
        assert d["phone"] == "966512345678"
        assert d["url"].startswith("https://api.whatsapp.com/send?phone=966512345678&text=")
        assert inv.json()["invoice_number"] in d["text"]

    def test_whatsapp_no_phone_400(self, merchant, created):
        code = _code()
        p = merchant.post(f"{BASE_URL}/api/merchant/products/quick-add",
                          json={"barcode": code, "name_ar": "TEST np", "price": 10, "stock": 2}).json()
        created.append(p["id"])
        inv = merchant.post(f"{BASE_URL}/api/pos/invoice", json={
            "items": [{"product_id": p["id"], "name": "x", "price": 1, "quantity": 1}], "payment_method": "cash"})
        assert inv.status_code == 200
        w = merchant.get(f"{BASE_URL}/api/pos/invoice/{inv.json()['id']}/whatsapp")
        assert w.status_code == 400


# ── barcode generation + label ──
class TestGenerateAndLabel:
    def test_generate_and_label(self, merchant, created):
        r = merchant.post(f"{BASE_URL}/api/merchant/products", json={"name_ar": "TEST nobarcode", "price": 20, "stock": 1})
        pid = r.json()["id"]
        created.append(pid)
        lb0 = merchant.get(f"{BASE_URL}/api/merchant/products/{pid}/label")
        assert lb0.status_code == 400
        g = merchant.post(f"{BASE_URL}/api/merchant/products/{pid}/barcode")
        assert g.status_code == 200
        code = g.json()["barcode"]
        assert len(code) == 13 and code.startswith("20") and code.isdigit()
        s = sum(int(c) * (3 if i % 2 else 1) for i, c in enumerate(code[:12]))
        assert int(code[12]) == (10 - s % 10) % 10
        g2 = merchant.post(f"{BASE_URL}/api/merchant/products/{pid}/barcode")
        assert g2.json()["barcode"] == code
        token = merchant.headers["Authorization"][7:]
        lb = requests.get(f"{BASE_URL}/api/merchant/products/{pid}/label?copies=2&token={token}")
        assert lb.status_code == 200 and "text/html" in lb.headers["content-type"]
        assert lb.text.count("<svg") == 2 and code in lb.text and "23.00" in lb.text

    def test_generate_invalid_404(self, merchant):
        assert merchant.post(f"{BASE_URL}/api/merchant/products/bad/barcode").status_code == 404
        assert merchant.post(f"{BASE_URL}/api/merchant/products/000000000000000000000000/barcode").status_code == 404


# ── RBAC ──
class TestRBAC:
    def test_customer_403(self, customer):
        assert customer.get(f"{BASE_URL}/api/merchant/products/by-barcode/X").status_code == 403
        assert customer.post(f"{BASE_URL}/api/merchant/products/quick-add",
                             json={"barcode": "TESTC", "name_ar": "a", "price": 1}).status_code == 403
        assert customer.post(f"{BASE_URL}/api/merchant/products/000000000000000000000000/barcode").status_code == 403
        assert customer.get(f"{BASE_URL}/api/merchant/products/000000000000000000000000/label").status_code == 403
        assert customer.get(f"{BASE_URL}/api/pos/invoice/000000000000000000000000/whatsapp").status_code == 403

    def test_unauth_401(self):
        assert requests.get(f"{BASE_URL}/api/merchant/products/by-barcode/X").status_code in (401, 403)
