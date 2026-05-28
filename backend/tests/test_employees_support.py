"""
Tests for new employees management & support info endpoints.
Tests against local backend since new endpoints are not yet deployed to production URL.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("TEST_BACKEND_URL", "http://localhost:8001")
MERCHANT_PHONE = "0509999999"
MERCHANT_PASS = "merchant2025"
CUSTOMER_PHONE = "0500000000"
CUSTOMER_PASS = "test1234"
EMP_PHONE = "0500777777"
EMP_PASS = "emp1234"


def _login(phone, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, f"login failed {phone}: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def merchant_token():
    token, _ = _login(MERCHANT_PHONE, MERCHANT_PASS)
    return token


@pytest.fixture(scope="module")
def customer_token():
    token, _ = _login(CUSTOMER_PHONE, CUSTOMER_PASS)
    return token


@pytest.fixture(scope="module")
def cleanup_employee():
    # cleanup before & after by phone
    m_token, _ = _login(MERCHANT_PHONE, MERCHANT_PASS)
    # delete any pre-existing employee with that phone via direct API (list + delete)
    r = requests.get(f"{BASE_URL}/api/merchant/employees", headers=_auth(m_token))
    if r.status_code == 200:
        for e in r.json():
            if e.get("phone") == EMP_PHONE:
                requests.delete(f"{BASE_URL}/api/merchant/employees/{e['id']}", headers=_auth(m_token))
    yield
    # cleanup after
    r = requests.get(f"{BASE_URL}/api/merchant/employees", headers=_auth(m_token))
    if r.status_code == 200:
        for e in r.json():
            if e.get("phone") == EMP_PHONE:
                requests.delete(f"{BASE_URL}/api/merchant/employees/{e['id']}", headers=_auth(m_token))


# ─── Support Info ───
class TestSupportInfo:
    def test_get_support_public(self):
        r = requests.get(f"{BASE_URL}/api/store/support")
        assert r.status_code == 200
        data = r.json()
        for field in ["phone", "whatsapp", "email", "instagram", "twitter",
                      "tiktok", "snapchat", "telegram", "address", "working_hours",
                      "contact_via_social_first"]:
            assert field in data, f"missing field: {field}"

    def test_update_support_as_merchant(self, merchant_token):
        body = {
            "whatsapp": "966555555555",
            "email": "test@zitex.sa",
            "contact_via_social_first": False,
        }
        r = requests.put(f"{BASE_URL}/api/merchant/store/support", json=body, headers=_auth(merchant_token))
        assert r.status_code == 200, r.text
        # GET verify
        r2 = requests.get(f"{BASE_URL}/api/store/support")
        d = r2.json()
        assert d["whatsapp"] == "966555555555"
        assert d["email"] == "test@zitex.sa"
        assert d["contact_via_social_first"] is False

    def test_update_support_as_customer_blocked(self, customer_token):
        r = requests.put(f"{BASE_URL}/api/merchant/store/support",
                         json={"phone": "111"}, headers=_auth(customer_token))
        assert r.status_code == 403


# ─── Employees ───
class TestEmployees:
    employee_id = None

    def test_customer_blocked_list(self, customer_token):
        r = requests.get(f"{BASE_URL}/api/merchant/employees", headers=_auth(customer_token))
        assert r.status_code == 403

    def test_customer_blocked_create(self, customer_token):
        r = requests.post(f"{BASE_URL}/api/merchant/employees", json={
            "phone": "0500000001", "name": "x", "password": "p"
        }, headers=_auth(customer_token))
        assert r.status_code == 403

    def test_invalid_perm_create(self, merchant_token, cleanup_employee):
        r = requests.post(f"{BASE_URL}/api/merchant/employees", json={
            "phone": "0500111222",
            "name": "x",
            "password": "p1234567",
            "permissions": ["xyz"],
        }, headers=_auth(merchant_token))
        assert r.status_code == 400
        assert "صلاحيات غير صالحة" in r.text or "xyz" in r.text

    def test_create_employee(self, merchant_token, cleanup_employee):
        r = requests.post(f"{BASE_URL}/api/merchant/employees", json={
            "phone": EMP_PHONE,
            "name": "موظف تجريبي",
            "password": EMP_PASS,
            "department": "marketing",
            "permissions": ["social", "banners"],
            "salary_monthly": 5000,
        }, headers=_auth(merchant_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data
        assert "message" in data
        TestEmployees.employee_id = data["id"]

    def test_employee_login(self):
        assert TestEmployees.employee_id, "Employee must be created first"
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"phone": EMP_PHONE, "password": EMP_PASS})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["role"] == "employee"
        assert "token" in d
        TestEmployees.employee_token = d["token"]

    def test_employee_can_post_social(self):
        # employee has social perm; require_merchant allows employee role
        token = TestEmployees.employee_token
        r = requests.post(f"{BASE_URL}/api/merchant/social/posts",
                          json={"text": "Hello from employee", "type": "post"},
                          headers=_auth(token))
        assert r.status_code == 200, r.text
        assert "id" in r.json()
        TestEmployees.test_post_id = r.json()["id"]

    def test_employee_blocked_update_support(self):
        # employee lacks 'settings' perm
        token = TestEmployees.employee_token
        r = requests.put(f"{BASE_URL}/api/merchant/store/support",
                         json={"phone": "666"}, headers=_auth(token))
        assert r.status_code == 403, r.text

    def test_employee_blocked_delete_employee(self):
        # employee tries to delete itself - require_merchant passes but role != merchant check returns 403
        token = TestEmployees.employee_token
        r = requests.delete(f"{BASE_URL}/api/merchant/employees/{TestEmployees.employee_id}",
                            headers=_auth(token))
        assert r.status_code == 403
        assert "Owner only" in r.text

    def test_list_employees(self, merchant_token):
        r = requests.get(f"{BASE_URL}/api/merchant/employees", headers=_auth(merchant_token))
        assert r.status_code == 200
        emps = r.json()
        phones = [e["phone"] for e in emps]
        assert EMP_PHONE in phones

    def test_update_employee(self, merchant_token):
        r = requests.put(f"{BASE_URL}/api/merchant/employees/{TestEmployees.employee_id}",
                        json={"permissions": ["all"]}, headers=_auth(merchant_token))
        assert r.status_code == 200, r.text
        # verify via list
        r2 = requests.get(f"{BASE_URL}/api/merchant/employees", headers=_auth(merchant_token))
        emp = next(e for e in r2.json() if e["id"] == TestEmployees.employee_id)
        assert emp["permissions"] == ["all"]

    def test_employee_perms_list(self, merchant_token):
        r = requests.get(f"{BASE_URL}/api/merchant/employee-perms", headers=_auth(merchant_token))
        assert r.status_code == 200
        d = r.json()
        assert "permissions" in d
        assert "labels" in d
        assert isinstance(d["permissions"], list)
        assert isinstance(d["labels"], dict)
        # check Arabic labels
        assert d["labels"]["all"] == "كل الصلاحيات"
        assert "products" in d["labels"]

    def test_delete_employee(self, merchant_token):
        # cleanup social post first
        post_id = getattr(TestEmployees, "test_post_id", None)
        if post_id:
            requests.delete(f"{BASE_URL}/api/merchant/social/posts/{post_id}",
                            headers=_auth(merchant_token))
        r = requests.delete(f"{BASE_URL}/api/merchant/employees/{TestEmployees.employee_id}",
                            headers=_auth(merchant_token))
        assert r.status_code == 200
        # verify gone
        r2 = requests.get(f"{BASE_URL}/api/merchant/employees", headers=_auth(merchant_token))
        phones = [e["phone"] for e in r2.json()]
        assert EMP_PHONE not in phones
