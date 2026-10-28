# CRUD audit for More-menu sections (TEST_ data, cleaned up). Iteration 46.
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


def tok(p, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"phone": p, "password": pw}, timeout=30)
    return r.json()["token"] if r.status_code == 200 else None


@pytest.fixture(scope="module")
def H():
    t = tok("0509999999", "merchant2025")
    if not t:
        pytest.skip("merchant login failed")
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def CUST():
    return {"Authorization": f"Bearer {tok('0500000000', 'test1234')}"}


@pytest.fixture(scope="module")
def MKT():
    return {"Authorization": f"Bearer {tok('0530000002', 'emp1234')}"}


def crud(H, create_path, payload, list_path, del_tpl, upd_tpl=None, upd=None, method_upd="put"):
    r = requests.post(f"{BASE_URL}{create_path}", headers=H, json=payload, timeout=30)
    assert r.status_code == 200, f"create {r.status_code} {r.text[:200]}"
    rid = r.json().get("id")
    assert rid, r.text
    lst = requests.get(f"{BASE_URL}{list_path}", headers=H, timeout=30).json()
    lst = lst if isinstance(lst, list) else (lst.get("items") or lst.get("ads") or lst.get("rules") or [])
    found = any(x.get("id") == rid for x in lst)
    upd_ok = None
    if upd_tpl:
        u = getattr(requests, method_upd)(f"{BASE_URL}{upd_tpl.format(rid)}", headers=H, json={**payload, **upd}, timeout=30)
        upd_ok = u.status_code
    d = requests.delete(f"{BASE_URL}{del_tpl.format(rid)}", headers=H, timeout=30)
    print(create_path, "created", rid, "listed", found, "update", upd_ok, "delete", d.status_code)
    assert found, "created item not returned by list endpoint"
    assert d.status_code == 200
    return rid


# Competitions create/edit/delete
def test_competition_crud(H):
    crud(H, "/api/merchant/competitions", {"title": "TEST_comp", "description": "x", "prize": "TEST", "competition_type": "qa",
         "question": "2+2?", "correct_answer": "4", "options": ["3", "4"]}, "/api/merchant/competitions",
         "/api/merchant/competitions/{}", "/api/merchant/competitions/{}", {"title": "TEST_comp2"})


# Marketer employee (perm 'competitions') can delete ANY competition? (no tenant scope) - check with fake id only
def test_customer_cannot_create_competition(CUST):
    r = requests.post(f"{BASE_URL}/api/merchant/competitions", headers=CUST, json={"title": "TEST_x", "prize": "x"}, timeout=30)
    assert r.status_code == 403


def test_banner_crud(H):
    r = requests.post(f"{BASE_URL}/api/merchant/banners", headers=H, json={"image": "https://x/y.png", "title": "TEST_banner", "published": False}, timeout=30)
    assert r.status_code == 200
    bid = r.json().get("id")
    pub = requests.get(f"{BASE_URL}/api/banners", timeout=30).json()
    print("unpublished banner visible in merchant list (/api/banners)?", any(b.get("id") == bid for b in pub))
    requests.delete(f"{BASE_URL}/api/merchant/banners/{bid}", headers=H, timeout=30)
    assert any(b.get("id") == bid for b in pub), "Unpublished banners disappear from merchant Banners screen (uses public /api/banners)"


def test_marketing_ad_crud(H):
    crud(H, "/api/merchant/marketing/ads", {"title": "TEST_ad", "description": "d"}, "/api/merchant/marketing/ads",
         "/api/merchant/marketing/ads/{}")


def test_role_crud(H):
    crud(H, "/api/merchant/roles", {"name": "TEST_role", "permissions": ["pos"]}, "/api/merchant/roles",
         "/api/merchant/roles/{}", "/api/merchant/roles/{}", {"name": "TEST_role2"})


def test_branch_crud(H):
    crud(H, "/api/merchant/branches", {"name": "TEST_branch", "address": "a", "lat": 24.7, "lng": 46.6},
         "/api/merchant/branches", "/api/merchant/branches/{}", "/api/merchant/branches/{}", {"name": "TEST_b2"})


def test_driver_crud(H):
    crud(H, "/api/merchant/drivers", {"name": "TEST_drv", "phone": "0549999777", "password": "x12345"},
         "/api/merchant/drivers", "/api/merchant/drivers/{}")


def test_service_crud(H):
    crud(H, "/api/merchant/services", {"name": "TEST_svc", "price": 10}, "/api/merchant/services",
         "/api/merchant/services/{}", "/api/merchant/services/{}", {"name": "TEST_svc2"})


def test_employee_crud(H):
    crud(H, "/api/merchant/employees", {"name": "TEST_emp", "phone": "0539999777", "password": "x12345", "permissions": ["pos"]},
         "/api/merchant/employees", "/api/merchant/employees/{}", "/api/merchant/employees/{}", {"name": "TEST_emp2"})


def test_shipping_rule_crud(H):
    crud(H, "/api/merchant/shipping/matrix", {"carrier_code": "aramex", "city_code": "riyadh", "base_price": 1},
         "/api/merchant/shipping/matrix", "/api/merchant/shipping/matrix/{}")


# Marketer employee with only social/competitions/banners perms reading financial stats
def test_marketer_sees_financials(MKT):
    r = requests.get(f"{BASE_URL}/api/merchant/stats", headers=MKT, timeout=30)
    r2 = requests.get(f"{BASE_URL}/api/merchant/orders", headers=MKT, timeout=30)
    r3 = requests.get(f"{BASE_URL}/api/merchant/rmas", headers=MKT, timeout=30)
    print("marketer stats", r.status_code, "orders", r2.status_code, "rmas", r3.status_code)
    assert r.status_code == 403 and r2.status_code == 403 and r3.status_code == 403
