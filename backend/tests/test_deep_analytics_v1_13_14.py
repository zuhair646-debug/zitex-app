"""
Deep Analytics endpoints (v1.13.14) — backend regression + new coverage
Endpoints:
  - GET /api/merchant/products/{pid}/deep-analytics (existing)
  - GET /api/merchant/services/{sid}/deep-analytics (new)
  - GET /api/merchant/competitions/{cid}/deep-analytics (new)
  - GET /api/merchant/social/posts/{pid}/deep-analytics (new)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")
MERCHANT = {"phone": "0509999999", "password": "merchant2025"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=MERCHANT, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in {data.keys()}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


# ─────────── Product (regression) ───────────
def test_product_deep_analytics(headers):
    lst = requests.get(f"{BASE_URL}/api/merchant/products?limit=5", headers=headers, timeout=30)
    assert lst.status_code == 200, lst.text[:200]
    data = lst.json()
    items = data if isinstance(data, list) else data.get("items", data.get("products", []))
    assert items, "No merchant products found"
    pid = items[0].get("id") or items[0].get("_id")
    r = requests.get(f"{BASE_URL}/api/merchant/products/{pid}/deep-analytics", headers=headers, timeout=30)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    for key in ("product", "kpis", "top_visitors", "buyers", "shares_by_platform", "reviews", "comparison"):
        assert key in body, f"missing {key} in product response"
    k = body["kpis"]
    assert k.get("total_views", 0) > 0
    assert "add_to_cart" in k
    assert "total_orders" in k
    assert "total_revenue" in k


# ─────────── Services (new) ───────────
def test_service_deep_analytics(headers):
    lst = requests.get(f"{BASE_URL}/api/merchant/services", headers=headers, timeout=30)
    assert lst.status_code == 200, lst.text[:200]
    data = lst.json()
    items = data if isinstance(data, list) else data.get("items", data.get("services", []))
    assert items, "No merchant services found"
    sid = items[0].get("id") or items[0].get("_id")
    r = requests.get(f"{BASE_URL}/api/merchant/services/{sid}/deep-analytics", headers=headers, timeout=30)
    assert r.status_code == 200, f"service deep-analytics failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    for key in ("product", "kpis", "top_visitors", "buyers", "shares_by_platform", "reviews", "comparison"):
        assert key in body, f"missing {key}"
    k = body["kpis"]
    assert k.get("total_views", 0) > 0, f"total_views must be > 0, got {k.get('total_views')}"
    assert "add_to_cart" in k, "expected bookings mapped to add_to_cart"
    assert "total_orders" in k
    # Revenue must NOT be 0 when bookings exist
    if k.get("add_to_cart", 0) > 0:
        assert k.get("total_revenue", 0) > 0, (
            f"total_revenue must be > 0 when bookings exist, got {k.get('total_revenue')} "
            f"add_to_cart={k.get('add_to_cart')}"
        )


# ─────────── Competitions (new) ───────────
def test_competition_deep_analytics(headers):
    lst = requests.get(f"{BASE_URL}/api/merchant/competitions", headers=headers, timeout=30)
    assert lst.status_code == 200, lst.text[:200]
    data = lst.json()
    items = data if isinstance(data, list) else data.get("items", data.get("competitions", []))
    assert items, "No merchant competitions found"
    cid = items[0].get("id") or items[0].get("_id")
    r = requests.get(f"{BASE_URL}/api/merchant/competitions/{cid}/deep-analytics", headers=headers, timeout=30)
    assert r.status_code == 200, f"competition deep-analytics failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    for key in ("product", "kpis", "top_visitors", "buyers", "shares_by_platform", "reviews", "comparison"):
        assert key in body, f"missing {key}"
    k = body["kpis"]
    assert k.get("total_views", 0) > 0, f"views must be > 0, got {k.get('total_views')}"
    # participants — mapped to add_to_cart in kpis
    assert k.get("add_to_cart", 0) > 0, f"participants (add_to_cart) must be > 0, got {k.get('add_to_cart')}"
    assert "capacity_pct" in k, "capacity_pct missing"


# ─────────── Social Posts (new) ───────────
def test_post_deep_analytics(headers):
    lst = requests.get(f"{BASE_URL}/api/merchant/social/posts", headers=headers, timeout=30)
    assert lst.status_code == 200, lst.text[:200]
    data = lst.json()
    items = data if isinstance(data, list) else data.get("items", data.get("posts", []))
    assert items, "No merchant social posts found"
    pid = items[0].get("id") or items[0].get("_id")
    r = requests.get(f"{BASE_URL}/api/merchant/social/posts/{pid}/deep-analytics", headers=headers, timeout=30)
    assert r.status_code == 200, f"post deep-analytics failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    for key in ("product", "kpis", "top_visitors", "buyers", "shares_by_platform", "reviews", "comparison"):
        assert key in body, f"missing {key}"
    k = body["kpis"]
    assert k.get("likes_total", 0) > 0, f"likes_total must be > 0, got {k.get('likes_total')}"
    assert k.get("shares_total", 0) > 0, f"shares_total must be > 0, got {k.get('shares_total')}"
    assert k.get("engagement_score", 0) > 0, f"engagement_score must be > 0, got {k.get('engagement_score')}"
    assert k.get("reach_estimate", 0) > 0, f"reach_estimate must be > 0, got {k.get('reach_estimate')}"
