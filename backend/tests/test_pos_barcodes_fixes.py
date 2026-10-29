# Iteration 51: retest of POS barcode fixes (untracked stock, WA ownership, dup barcode 409, quick-add branch inv)
import random
import pytest
import requests
from test_pos_barcodes import BASE_URL, _login, _code


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
def created(merchant):
    ids = []
    yield ids
    for pid in ids:
        merchant.delete(f"{BASE_URL}/api/merchant/products/{pid}")


def _mk(merchant, created, **kw):
    body = {"name_ar": "TEST_fix", "price": 10, **kw}
    r = merchant.post(f"{BASE_URL}/api/merchant/products", json=body)
    assert r.status_code == 200, r.text
    created.append(r.json()["id"])
    return r.json()["id"]


def _get(merchant, pid):
    lst = merchant.get(f"{BASE_URL}/api/merchant/products").json()
    lst = lst if isinstance(lst, list) else lst.get("products", lst.get("items", []))
    return next((p for p in lst if p.get("id") == pid), None)


# decrement_stock: untracked products stay available
class TestUntrackedStock:
    def test_form_product_sale_keeps_in_stock(self, merchant, created):
        code = _code()
        pid = _mk(merchant, created, barcode=code)
        inv = merchant.post(f"{BASE_URL}/api/pos/invoice", json={
            "items": [{"product_id": pid, "name": "x", "price": 1, "quantity": 2}], "payment_method": "cash"})
        assert inv.status_code == 200, inv.text
        p = merchant.get(f"{BASE_URL}/api/merchant/products/by-barcode/{code}").json()
        assert p.get("in_stock") is True
        assert p.get("stock") in (None,)  # still untracked

    def test_tracked_product_reaches_zero(self, merchant, created):
        code = _code()
        p = merchant.post(f"{BASE_URL}/api/merchant/products/quick-add",
                          json={"barcode": code, "name_ar": "TEST tracked", "price": 5, "stock": 1}).json()
        created.append(p["id"])
        merchant.post(f"{BASE_URL}/api/pos/invoice", json={
            "items": [{"product_id": p["id"], "name": "x", "price": 1, "quantity": 1}], "payment_method": "cash"})
        g = merchant.get(f"{BASE_URL}/api/merchant/products/by-barcode/{code}").json()
        assert g["stock"] == 0 and g["in_stock"] is False


# duplicate barcode 409 on create / update
class TestDuplicateBarcode:
    def test_create_dup_barcode_409(self, merchant, created):
        code = _code()
        _mk(merchant, created, barcode=code)
        r = merchant.post(f"{BASE_URL}/api/merchant/products", json={"name_ar": "TEST dup", "price": 1, "barcode": code})
        assert r.status_code == 409, r.text
        if r.status_code == 200:
            created.append(r.json()["id"])

    def test_create_barcode_matching_other_sku_409(self, merchant, created):
        code = _code()
        _mk(merchant, created, sku=code)
        r = merchant.post(f"{BASE_URL}/api/merchant/products", json={"name_ar": "TEST dup2", "price": 1, "barcode": code})
        assert r.status_code == 409

    def test_update_dup_409_and_self_ok(self, merchant, created):
        a, b = _code(), _code()
        _mk(merchant, created, barcode=a)
        pid_b = _mk(merchant, created, barcode=b)
        r = merchant.put(f"{BASE_URL}/api/merchant/products/{pid_b}", json={"name_ar": "TEST b", "price": 1, "barcode": a})
        assert r.status_code == 409
        r2 = merchant.put(f"{BASE_URL}/api/merchant/products/{pid_b}", json={"name_ar": "TEST b2", "price": 2, "barcode": b})
        assert r2.status_code == 200, r2.text

    def test_empty_barcode_no_conflict(self, merchant, created):
        _mk(merchant, created)
        _mk(merchant, created)


# WhatsApp receipt ownership for employees
class TestWhatsAppOwnership:
    def test_cashier_403_on_merchant_invoice(self, merchant, cashier, created):
        code = _code()
        p = merchant.post(f"{BASE_URL}/api/merchant/products/quick-add",
                          json={"barcode": code, "name_ar": "TEST wa", "price": 10, "stock": 5}).json()
        created.append(p["id"])
        inv = merchant.post(f"{BASE_URL}/api/pos/invoice", json={
            "items": [{"product_id": p["id"], "name": "x", "price": 1, "quantity": 1}],
            "customer_phone": "0512345678", "payment_method": "cash"}).json()
        assert cashier.get(f"{BASE_URL}/api/pos/invoice/{inv['id']}").status_code == 403
        assert cashier.get(f"{BASE_URL}/api/pos/invoice/{inv['id']}/whatsapp").status_code == 403

    def test_cashier_own_invoice_whatsapp_200(self, merchant, cashier, created):
        code = _code()
        p = merchant.post(f"{BASE_URL}/api/merchant/products/quick-add",
                          json={"barcode": code, "name_ar": "TEST wa2", "price": 10, "stock": 5}).json()
        created.append(p["id"])
        inv = cashier.post(f"{BASE_URL}/api/pos/invoice", json={
            "items": [{"product_id": p["id"], "name": "x", "price": 1, "quantity": 1}],
            "customer_phone": "0512345678", "payment_method": "cash"})
        assert inv.status_code == 200, inv.text
        w = cashier.get(f"{BASE_URL}/api/pos/invoice/{inv.json()['id']}/whatsapp")
        assert w.status_code == 200 and w.json()["phone"] == "966512345678"


# quick-add with branch_id writes branch_inventory; cashier still lacks products perm
class TestQuickAddBranch:
    def test_branch_inventory_written(self, merchant, created):
        br = merchant.get(f"{BASE_URL}/api/merchant/branches").json()
        br = br if isinstance(br, list) else br.get("branches", [])
        if not br:
            pytest.skip("no branches")
        bid = br[0].get("id")
        code = _code()
        p = merchant.post(f"{BASE_URL}/api/merchant/products/quick-add",
                          json={"barcode": code, "name_ar": "TEST br", "price": 10, "stock": 7, "branch_id": bid})
        assert p.status_code == 200
        created.append(p.json()["id"])
        inv = merchant.get(f"{BASE_URL}/api/merchant/branches/{bid}/inventory")
        if inv.status_code != 200:
            pytest.skip(f"branch inventory endpoint {inv.status_code}")
        data = inv.json()
        rows = data if isinstance(data, list) else data.get("items", data.get("inventory", []))
        row = next((r for r in rows if r.get("product_id") == p.json()["id"]), None)
        assert row is not None and int(row.get("quantity", 0)) == 7

    def test_cashier_quick_add_403(self, cashier):
        r = cashier.post(f"{BASE_URL}/api/merchant/products/quick-add",
                         json={"barcode": _code(), "name_ar": "TEST c", "price": 1, "stock": 1})
        assert r.status_code == 403
