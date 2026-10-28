# Audit of merchant "More" menu sections (read-only + safe TEST_ flows). Iteration 46.
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
T = 30


def login(phone, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"phone": phone, "password": pw}, timeout=T)
    if r.status_code != 200:
        return None, None
    j = r.json()
    return j["token"], j["user"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def m():
    tok, u = login("0509999999", "merchant2025")
    if not tok:
        pytest.skip("merchant login failed")
    return tok


@pytest.fixture(scope="module")
def cashier():
    tok, u = login("0530000001", "emp1234")
    if not tok:
        pytest.skip("cashier login failed")
    return tok, u


@pytest.fixture(scope="module")
def marketer():
    tok, u = login("0530000002", "emp1234")
    if not tok:
        pytest.skip("marketer login failed")
    return tok, u


@pytest.fixture(scope="module")
def customer():
    tok, u = login("0500000000", "test1234")
    if not tok:
        pytest.skip("customer login failed")
    return tok, u


# Section GET endpoints backing each More-menu screen
SECTION_GETS = [
    "/api/pos/invoices", "/api/merchant/inventory", "/api/merchant/inventory/alerts",
    "/api/merchant/inventory/movements", "/api/merchant/marketing/ads",
    "/api/merchant/affiliate/applications", "/api/merchant/affiliate/list", "/api/merchant/affiliate/summary",
    "/api/merchant/social/posts", "/api/merchant/social/comments", "/api/merchant/competitions",
    "/api/merchant/competitions/analytics-overview", "/api/banners", "/api/merchant/services",
    "/api/merchant/bookings", "/api/merchant/branches", "/api/merchant/drivers", "/api/delivery/settings",
    "/api/merchant/shipping/matrix", "/api/merchant/shipping/cities", "/api/merchant/rmas",
    "/api/merchant/loyalty/programs", "/api/merchant/modules", "/api/merchant/customers",
    "/api/merchant/employees", "/api/merchant/roles", "/api/merchant/team/overview",
    "/api/store/support", "/api/merchant/orders",
]


@pytest.mark.parametrize("path", SECTION_GETS)
def test_section_get(m, path):
    r = requests.get(f"{BASE_URL}{path}", headers=H(m), timeout=T)
    print(path, r.status_code, (r.text[:160]))
    assert r.status_code == 200


# Security: public competition draw endpoint must require auth
def test_competition_draw_requires_auth(m):
    comps = requests.get(f"{BASE_URL}/api/merchant/competitions", headers=H(m), timeout=T).json()
    assert comps, "no competitions"
    # Use a fake but valid id to avoid mutating real data
    r = requests.post(f"{BASE_URL}/api/competitions/000000000000000000000000/draw", timeout=T)
    print("anon draw on fake id ->", r.status_code, r.text[:100])
    assert r.status_code in (401, 403), f"anonymous draw not blocked (got {r.status_code})"


def test_participants_phone_leak(m):
    comps = requests.get(f"{BASE_URL}/api/merchant/competitions", headers=H(m), timeout=T).json()
    leaked = False
    for c in comps[:10]:
        r = requests.get(f"{BASE_URL}/api/competitions/{c['id']}/participants", timeout=T)
        if r.status_code == 200 and any(e.get("user_phone") for e in r.json()):
            leaked = True
            break
    assert not leaked, "participants endpoint is public and leaks user_phone"


def test_payment_webhook_unauthenticated():
    r = requests.post(f"{BASE_URL}/api/webhooks/payment/confirm", json={"order_id": None, "status": "x"}, timeout=T)
    print("payment webhook anon ->", r.status_code)
    assert r.status_code in (401, 403), "payment webhook accepts unauthenticated calls (anyone can mark order paid)"


# POS -> inventory decrement -> invoice
def test_pos_invoice_inventory_flow(m):
    inv = requests.get(f"{BASE_URL}/api/merchant/inventory", headers=H(m), timeout=T).json()
    print("inventory keys", list(inv.keys())[:10] if isinstance(inv, dict) else type(inv))
    branches = requests.get(f"{BASE_URL}/api/merchant/branches", headers=H(m), timeout=T).json()
    assert branches
    bid = branches[0]["id"]
    binv = requests.get(f"{BASE_URL}/api/merchant/branches/{bid}/inventory", headers=H(m), timeout=T).json()
    rows = binv if isinstance(binv, list) else binv.get("items") or binv.get("inventory") or []
    assert rows, f"no branch inventory {str(binv)[:200]}"
    row = rows[0]
    pid = row.get("product_id") or row.get("id")
    before = row.get("stock_store", row.get("stock"))
    r = requests.post(f"{BASE_URL}/api/pos/invoice", headers=H(m), json={
        "items": [{"product_id": pid, "name": "TEST_POS", "price": 1, "quantity": 1}],
        "customer_name": "TEST_cust", "branch_id": bid, "send_via": "none"}, timeout=T)
    assert r.status_code == 200, r.text
    j = r.json()
    print("POS invoice", j)
    full = requests.get(f"{BASE_URL}/api/pos/invoice/{j['id']}", headers=H(m), timeout=T).json()
    zatca = [k for k in ("qr", "qr_code", "uuid", "invoice_hash", "previous_hash", "seller_vat_number", "vat_number", "icv") if k in full]
    print("ZATCA fields present:", zatca, "| all keys:", list(full.keys()))
    binv2 = requests.get(f"{BASE_URL}/api/merchant/branches/{bid}/inventory", headers=H(m), timeout=T).json()
    rows2 = binv2 if isinstance(binv2, list) else binv2.get("items") or binv2.get("inventory") or []
    after = next((x.get("stock_store", x.get("stock")) for x in rows2 if (x.get("product_id") or x.get("id")) == pid), None)
    print("stock before/after", before, after)
    assert zatca, "POS invoice has NO ZATCA fields (QR/UUID/hash/VAT no)"


def test_pos_trusts_client_price_and_vat(m):
    r = requests.post(f"{BASE_URL}/api/pos/invoice", headers=H(m), json={
        "items": [{"product_id": "000000000000000000000000", "name": "TEST_FAKE", "price": -50, "quantity": 1}],
        "vat_percent": 0, "send_via": "none"}, timeout=T)
    print("negative/fake POS ->", r.status_code, r.text[:150])
    assert r.status_code in (400, 422), "POS accepts fake product, negative price and 0% VAT"


# Employees -> roles -> permissions enforced on backend
def test_cashier_cannot_delete_branch_or_edit_roles(cashier):
    tok, u = cashier
    print("cashier perms", u.get("permissions"), u.get("role"))
    r1 = requests.post(f"{BASE_URL}/api/merchant/roles", headers=H(tok),
                       json={"name": "TEST_hack", "permissions": ["all"]}, timeout=T)
    print("cashier create role ->", r1.status_code)
    if r1.status_code == 200:
        rid = r1.json().get("id")
        requests.delete(f"{BASE_URL}/api/merchant/roles/{rid}", headers=H(tok), timeout=T)
    r2 = requests.get(f"{BASE_URL}/api/merchant/employees", headers=H(tok), timeout=T)
    r3 = requests.get(f"{BASE_URL}/api/merchant/customers", headers=H(tok), timeout=T)
    print("cashier employees ->", r2.status_code, "customers ->", r3.status_code)
    assert r1.status_code == 403 and r2.status_code == 403 and r3.status_code == 403, \
        f"perms not enforced: roles={r1.status_code} employees={r2.status_code} customers={r3.status_code}"


# Marketer role dashboard
def test_marketer_dashboard(marketer):
    tok, u = marketer
    print("marketer role", u.get("role"), u.get("permissions"))
    r = requests.get(f"{BASE_URL}/api/affiliate/dashboard", headers=H(tok), timeout=T)
    r2 = requests.get(f"{BASE_URL}/api/affiliate/my", headers=H(tok), timeout=T)
    print("marketer /affiliate/dashboard ->", r.status_code, r.text[:150], "| /affiliate/my ->", r2.status_code)
    assert r.status_code == 200


def test_affiliate_payouts_exist(m):
    r = requests.get(f"{BASE_URL}/api/merchant/affiliate/payouts", headers=H(m), timeout=T)
    print("payouts ->", r.status_code)
    assert r.status_code == 200, "No payout/transfer endpoint for marketers"


# Online orders -> invoices
def test_customer_invoices_are_order_derived(customer):
    tok, u = customer
    r = requests.get(f"{BASE_URL}/api/invoices", headers=H(tok), timeout=T)
    assert r.status_code == 200
    data = r.json()
    print("customer invoices count", len(data), "sample", str(data[:1])[:250])
    if data:
        assert "qr" in data[0] or "uuid" in data[0], "customer invoices are synthetic (INV-<orderid>), no ZATCA data"
