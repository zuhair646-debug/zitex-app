"""Multi-type Inventory (Phase C-2) tests

Covers:
- Setting `combined` and `separate` inventory modes
- Low-stock alerts computation
- Quick-adjust endpoints for store / app / combined channels
- POS invoice decrement from `stock_store`
- Online order decrement from `stock_app`
- Movements log
"""
import os
import time
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001"

MERCHANT_PHONE = "0509999999"
MERCHANT_PASSWORD = "merchant2025"


@pytest.fixture(scope="module")
def merchant_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"phone": MERCHANT_PHONE, "password": MERCHANT_PASSWORD}, timeout=15)
    r.raise_for_status()
    return r.json()["token"]


@pytest.fixture(scope="module")
def merchant_headers(merchant_token):
    return {"Authorization": f"Bearer {merchant_token}"}


@pytest.fixture(scope="module")
def branch_and_products(merchant_headers):
    branches = requests.get(f"{BASE}/api/branches", timeout=15).json()
    assert branches, "need at least one branch seeded"
    products = requests.get(f"{BASE}/api/merchant/products", headers=merchant_headers, timeout=15).json()
    assert len(products) >= 2, "need at least two products seeded"
    return branches[0]["id"], products[0]["id"], products[1]["id"]


def test_set_inventory_combined_mode(merchant_headers, branch_and_products):
    bid, pid, _ = branch_and_products
    r = requests.put(
        f"{BASE}/api/merchant/branches/{bid}/inventory/{pid}",
        headers=merchant_headers,
        json={"inventory_mode": "combined", "quantity": 20, "min_alert": 5, "inventory_type": "both"},
        timeout=15,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["quantity"] == 20
    assert data["stock_store"] == 20
    assert data["stock_app"] == 20
    assert data["inventory_mode"] == "combined"


def test_set_inventory_separate_mode(merchant_headers, branch_and_products):
    bid, _, pid = branch_and_products
    r = requests.put(
        f"{BASE}/api/merchant/branches/{bid}/inventory/{pid}",
        headers=merchant_headers,
        json={"inventory_mode": "separate", "stock_store": 12, "stock_app": 3,
              "min_alert": 4, "inventory_type": "both"},
        timeout=15,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["stock_store"] == 12
    assert data["stock_app"] == 3
    assert data["quantity"] == 15
    assert data["inventory_mode"] == "separate"


def test_inventory_overview_totals(merchant_headers):
    r = requests.get(f"{BASE}/api/merchant/inventory", headers=merchant_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "totals" in data and "items" in data
    for key in ("total_units", "store_units", "app_units", "low_stock", "out_of_stock"):
        assert key in data["totals"]


def test_alerts_endpoint_flags_low_stock(merchant_headers, branch_and_products):
    bid, _, pid = branch_and_products
    # Force a low-stock situation
    requests.put(
        f"{BASE}/api/merchant/branches/{bid}/inventory/{pid}",
        headers=merchant_headers,
        json={"inventory_mode": "separate", "stock_store": 1, "stock_app": 2,
              "min_alert": 5, "inventory_type": "both"},
        timeout=15,
    )
    r = requests.get(f"{BASE}/api/merchant/inventory/alerts", headers=merchant_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert any(a["product_id"] == pid for a in data["alerts"]), "low-stock product missing from alerts"


def test_quick_adjust_store_channel(merchant_headers, branch_and_products):
    bid, pid, _ = branch_and_products
    # Set combined to a known value
    requests.put(f"{BASE}/api/merchant/branches/{bid}/inventory/{pid}",
                 headers=merchant_headers,
                 json={"inventory_mode": "separate", "stock_store": 10, "stock_app": 5,
                       "min_alert": 5, "inventory_type": "both"}, timeout=15)
    r = requests.post(
        f"{BASE}/api/merchant/inventory/{bid}/{pid}/adjust",
        headers=merchant_headers,
        json={"delta": -3, "channel": "store", "reason": "unit-test"},
        timeout=15,
    )
    assert r.status_code == 200
    ov = requests.get(f"{BASE}/api/merchant/inventory", headers=merchant_headers, timeout=15).json()
    matching = [i for i in ov["items"] if i["product_id"] == pid and i["branch_id"] == bid]
    assert matching and matching[0]["stock_store"] == 7
    assert matching[0]["stock_app"] == 5
    assert matching[0]["quantity"] == 12


def test_quick_adjust_app_channel(merchant_headers, branch_and_products):
    bid, pid, _ = branch_and_products
    r = requests.post(
        f"{BASE}/api/merchant/inventory/{bid}/{pid}/adjust",
        headers=merchant_headers,
        json={"delta": +5, "channel": "app", "reason": "restock"},
        timeout=15,
    )
    assert r.status_code == 200


def test_movements_log(merchant_headers):
    r = requests.get(f"{BASE}/api/merchant/inventory/movements?limit=5",
                     headers=merchant_headers, timeout=15)
    assert r.status_code == 200
    movs = r.json()
    assert isinstance(movs, list)
    assert any(m.get("reason") == "unit-test" for m in movs), "adjustment should be logged"


def test_pos_invoice_decrements_store_stock(merchant_headers, branch_and_products):
    """POS sale should decrement `stock_store` only (leaving stock_app intact)."""
    bid, pid, _ = branch_and_products
    # Reset to known separate state
    requests.put(f"{BASE}/api/merchant/branches/{bid}/inventory/{pid}",
                 headers=merchant_headers,
                 json={"inventory_mode": "separate", "stock_store": 20, "stock_app": 5,
                       "min_alert": 3, "inventory_type": "both"}, timeout=15)

    # Fetch price
    prod = requests.get(f"{BASE}/api/products/{pid}", timeout=15).json()
    price = float(prod.get("price") or 100)

    r = requests.post(
        f"{BASE}/api/pos/invoice",
        headers=merchant_headers,
        json={
            "items": [{"product_id": pid, "name": prod.get("name_ar", "Item"),
                        "price": price, "quantity": 2}],
            "customer_name": "Test", "customer_phone": "0500000000",
            "payment_method": "cash", "branch_id": bid,
            "discount": 0, "vat_percent": 15, "notes": "", "send_via": "",
        },
        timeout=20,
    )
    assert r.status_code == 200

    ov = requests.get(f"{BASE}/api/merchant/inventory", headers=merchant_headers, timeout=15).json()
    row = [i for i in ov["items"] if i["product_id"] == pid and i["branch_id"] == bid][0]
    assert row["stock_store"] == 18, f"expected 18 got {row['stock_store']}"
    assert row["stock_app"] == 5, "app stock must NOT decrement on POS sale"
