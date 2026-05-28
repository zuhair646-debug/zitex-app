"""
Re-verification of merchant employees & store support endpoints
per the iteration spec (12 sequential checks).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("TEST_BACKEND_URL", "http://localhost:8001")
MERCHANT_PHONE = "0509999999"
MERCHANT_PASS = "merchant2025"
EMP_PHONE = "0500099999"
EMP_PASS = "emp1234"

SUPPORT_FIELDS = [
    "whatsapp", "phone", "email", "instagram", "twitter",
    "tiktok", "snapchat", "telegram", "address", "working_hours",
    "contact_via_social_first",
]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# Shared state across the ordered tests
state = {}


@pytest.fixture(scope="module", autouse=True)
def _cleanup_pre_post():
    # pre-cleanup: remove employee w/ test phone if exists
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"phone": MERCHANT_PHONE, "password": MERCHANT_PASS})
    assert r.status_code == 200, r.text
    mt = r.json()["token"]
    rl = requests.get(f"{BASE_URL}/api/merchant/employees", headers=_auth(mt))
    if rl.status_code == 200:
        for e in rl.json():
            if e.get("phone") == EMP_PHONE:
                requests.delete(f"{BASE_URL}/api/merchant/employees/{e['id']}",
                                headers=_auth(mt))
    yield
    rl = requests.get(f"{BASE_URL}/api/merchant/employees", headers=_auth(mt))
    if rl.status_code == 200:
        for e in rl.json():
            if e.get("phone") == EMP_PHONE:
                requests.delete(f"{BASE_URL}/api/merchant/employees/{e['id']}",
                                headers=_auth(mt))


# 1) merchant login
def test_01_merchant_login():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"phone": MERCHANT_PHONE, "password": MERCHANT_PASS})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["user"]["role"] == "merchant"
    state["mt"] = j["token"]


# 2) public store support
def test_02_get_support_public_has_all_fields():
    r = requests.get(f"{BASE_URL}/api/store/support")
    assert r.status_code == 200, r.text
    d = r.json()
    for f in SUPPORT_FIELDS:
        assert f in d, f"missing field {f} in support response"


# 3) update support
def test_03_update_support():
    body = {
        "whatsapp": "966500000001",
        "phone": "0500000001",
        "email": "test@zitex.sa",
        "instagram": "zitex_test",
        "tiktok": "zitex_test_tiktok",
        "snapchat": "zitex_test_snap",
        "working_hours": "24/7",
    }
    r = requests.put(f"{BASE_URL}/api/merchant/store/support",
                     json=body, headers=_auth(state["mt"]))
    assert r.status_code == 200, r.text


# 4) read back & verify
def test_04_get_support_after_update():
    r = requests.get(f"{BASE_URL}/api/store/support")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["whatsapp"] == "966500000001"
    assert d["phone"] == "0500000001"
    assert d["email"] == "test@zitex.sa"
    assert d["instagram"] == "zitex_test"
    assert d["tiktok"] == "zitex_test_tiktok"
    assert d["snapchat"] == "zitex_test_snap"
    assert d["working_hours"] == "24/7"


# 5) employee perms list (>= 13 perms expected)
def test_05_employee_perms():
    r = requests.get(f"{BASE_URL}/api/merchant/employee-perms",
                     headers=_auth(state["mt"]))
    assert r.status_code == 200, r.text
    d = r.json()
    assert "permissions" in d and isinstance(d["permissions"], list)
    assert "labels" in d and isinstance(d["labels"], dict)
    assert len(d["permissions"]) >= 13, f"expected >=13 perms, got {len(d['permissions'])}"
    # spot-check labels exist
    for p in d["permissions"]:
        assert p in d["labels"], f"perm {p} missing label"


# 6) list employees
def test_06_list_employees():
    r = requests.get(f"{BASE_URL}/api/merchant/employees",
                     headers=_auth(state["mt"]))
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


# 7) create employee
def test_07_create_employee():
    body = {
        "phone": EMP_PHONE,
        "name": "موظف تجريبي",
        "password": EMP_PASS,
        "department": "marketing",
        "permissions": ["social", "banners"],
        "salary_monthly": 3000,
    }
    r = requests.post(f"{BASE_URL}/api/merchant/employees",
                      json=body, headers=_auth(state["mt"]))
    assert r.status_code == 200, r.text
    j = r.json()
    assert "id" in j
    state["emp_id"] = j["id"]


# 8) login as new employee
def test_08_employee_login():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"phone": EMP_PHONE, "password": EMP_PASS})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["user"]["role"] == "employee"
    state["et"] = j["token"]


# 9) employee with social perm can GET social posts
def test_09_employee_can_get_social_posts():
    r = requests.get(f"{BASE_URL}/api/merchant/social/posts",
                     headers=_auth(state["et"]))
    assert r.status_code == 200, f"{r.status_code} {r.text}"


# 10) employee without products perm gets 403 on /merchant/products
def test_10_employee_blocked_products():
    r = requests.get(f"{BASE_URL}/api/merchant/products",
                     headers=_auth(state["et"]))
    assert r.status_code == 403, f"{r.status_code} {r.text}"


# 11) update employee perms to ['all']
def test_11_update_employee_perms_all():
    r = requests.put(f"{BASE_URL}/api/merchant/employees/{state['emp_id']}",
                     json={"permissions": ["all"]},
                     headers=_auth(state["mt"]))
    assert r.status_code == 200, r.text
    # verify
    rl = requests.get(f"{BASE_URL}/api/merchant/employees",
                      headers=_auth(state["mt"]))
    emp = next(e for e in rl.json() if e["id"] == state["emp_id"])
    assert emp["permissions"] == ["all"]


# 12) delete employee
def test_12_delete_employee():
    r = requests.delete(f"{BASE_URL}/api/merchant/employees/{state['emp_id']}",
                        headers=_auth(state["mt"]))
    assert r.status_code == 200, r.text
    rl = requests.get(f"{BASE_URL}/api/merchant/employees",
                      headers=_auth(state["mt"]))
    assert state["emp_id"] not in [e["id"] for e in rl.json()]
