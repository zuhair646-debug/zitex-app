# Driver realistic data (seed_driver_trips) + staff sanity regression tests
import os
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', os.environ.get('EXPO_BACKEND_URL', '')).rstrip('/')


def _login(phone, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"phone": phone, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def drv():
    d = _login("0540001111", "driver1234")
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {d['token']}"})
    return s


# Driver trips history
def test_driver_trips(drv):
    r = drv.get(f"{BASE_URL}/api/driver/trips", timeout=20)
    assert r.status_code == 200
    trips = r.json()
    print("trips:", len(trips), "sample:", trips[0] if trips else None)
    assert isinstance(trips, list) and len(trips) >= 90


# Driver earnings (week/month)
@pytest.mark.parametrize("period", ["week", "month"])
def test_driver_earnings(drv, period):
    r = drv.get(f"{BASE_URL}/api/driver/earnings?period={period}", timeout=20)
    assert r.status_code == 200
    d = r.json()
    print(period, {k: (v if not isinstance(v, list) else f"list[{len(v)}]") for k, v in d.items()})
    print("payouts sample:", (d.get("payouts") or [])[:3])


# Driver performance / profile
def test_driver_performance(drv):
    r = drv.get(f"{BASE_URL}/api/driver/performance", timeout=20)
    assert r.status_code == 200
    print("performance:", r.json())
    me = drv.get(f"{BASE_URL}/api/driver/me", timeout=20)
    assert me.status_code == 200
    print("me keys:", list(me.json().keys()))


# Driver home + available orders
def test_driver_home_and_available(drv):
    h = drv.get(f"{BASE_URL}/api/driver/home", timeout=20)
    assert h.status_code == 200
    hj = h.json()
    print("home:", {k: hj[k] for k in hj if k not in ('active',)}, "active:", len(hj.get('active', [])))
    a = drv.get(f"{BASE_URL}/api/driver/available-orders", timeout=20)
    print("available status:", a.status_code, "count:", len(a.json()) if a.status_code == 200 else a.text)


# Staff sanity: specialist logins land with merchant panel
@pytest.mark.parametrize("phone", ["0530000006", "0530000007", "0530000008", "0530000009", "0530000010"])
def test_staff_login(phone):
    d = _login(phone, "emp1234")
    assert d["user"]["role"] == "employee"
