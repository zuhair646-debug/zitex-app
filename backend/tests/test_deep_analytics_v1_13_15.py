"""
Zenrex Deep Analytics v1.13.15 regression + new-feature tests.
Validates:
  - Service deep-analytics: returns[], complaints[], kpis.returns_count, kpis.complaints_count
  - Competition deep-analytics: winners[] (rich shape), videos[] (rich shape), kpis.videos_count
  - Social posts count >= 50
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "http://localhost:8001"
BASE_URL = BASE_URL.rstrip("/")

MERCHANT_PHONE = "0509999999"
MERCHANT_PASS = "merchant2025"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"phone": MERCHANT_PHONE, "password": MERCHANT_PASS}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} / {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ────────────────────────────────────────────────
# 1) Service deep-analytics — returns + complaints
# ────────────────────────────────────────────────
class TestServiceDeepAnalytics:

    def test_pick_service_with_returns(self, headers):
        r = requests.get(f"{BASE_URL}/api/merchant/services", headers=headers, timeout=15)
        assert r.status_code == 200
        services = r.json()
        assert isinstance(services, list) and len(services) > 0
        # Try each service; pick one whose deep-analytics contains returns
        picked_sid = None
        picked_payload = None
        for svc in services:
            sid = svc.get("id") or svc.get("_id")
            if not sid:
                continue
            resp = requests.get(f"{BASE_URL}/api/merchant/services/{sid}/deep-analytics",
                                headers=headers, timeout=20)
            if resp.status_code != 200:
                continue
            body = resp.json()
            if len(body.get("returns", [])) > 0 or len(body.get("complaints", [])) > 0:
                picked_sid = sid
                picked_payload = body
                break
        assert picked_sid, "No service exposes returns/complaints — seed_rich_content may not have run"
        # Persist for next assertions
        pytest.picked_service_id = picked_sid
        pytest.picked_service_payload = picked_payload

    def test_service_response_shape(self):
        body = pytest.picked_service_payload
        # Required top-level arrays
        assert "returns" in body and isinstance(body["returns"], list), "returns[] missing"
        assert "complaints" in body and isinstance(body["complaints"], list), "complaints[] missing"
        # Required KPI fields
        kpis = body.get("kpis") or {}
        assert "returns_count" in kpis, "kpis.returns_count missing"
        assert "complaints_count" in kpis, "kpis.complaints_count missing"
        assert kpis["returns_count"] == len(body["returns"]) or kpis["returns_count"] > 0
        assert isinstance(kpis["complaints_count"], int)

    def test_service_return_item_fields(self):
        body = pytest.picked_service_payload
        if not body["returns"]:
            pytest.skip("No returns in picked service; complaints validated separately")
        r0 = body["returns"][0]
        for key in ("user_name", "reason", "status", "amount", "created_at"):
            assert key in r0, f"return item missing {key}"

    def test_service_complaint_item_fields(self):
        body = pytest.picked_service_payload
        if not body["complaints"]:
            pytest.skip("No complaints in picked service")
        c0 = body["complaints"][0]
        for key in ("user_name", "text", "category", "status", "reply", "created_at"):
            assert key in c0, f"complaint item missing {key}"


# ────────────────────────────────────────────────
# 2) Competition deep-analytics — winners + videos
# ────────────────────────────────────────────────
class TestCompetitionDeepAnalytics:

    def test_pick_competition_and_fetch(self, headers):
        r = requests.get(f"{BASE_URL}/api/merchant/competitions", headers=headers, timeout=15)
        assert r.status_code == 200
        comps = r.json()
        assert isinstance(comps, list) and len(comps) > 0
        picked = None
        payload = None
        for c in comps:
            cid = c.get("id") or c.get("_id")
            if not cid:
                continue
            resp = requests.get(f"{BASE_URL}/api/merchant/competitions/{cid}/deep-analytics",
                                headers=headers, timeout=20)
            if resp.status_code != 200:
                continue
            body = resp.json()
            if body.get("winners") and body.get("videos"):
                picked = cid
                payload = body
                break
        assert picked, "No competition returned both winners[] and videos[]"
        pytest.picked_comp_id = picked
        pytest.picked_comp_payload = payload

    def test_competition_winners_shape(self):
        body = pytest.picked_comp_payload
        assert isinstance(body["winners"], list) and len(body["winners"]) > 0
        w = body["winners"][0]
        for key in ("user_name", "rank", "prize_value", "claim_status", "city"):
            assert key in w, f"winner missing {key}"
        assert isinstance(w["rank"], int) and w["rank"] >= 1
        assert isinstance(w["prize_value"], (int, float))

    def test_competition_videos_shape(self):
        body = pytest.picked_comp_payload
        assert isinstance(body["videos"], list) and len(body["videos"]) > 0
        v = body["videos"][0]
        for key in ("title", "url", "thumbnail", "duration", "views"):
            assert key in v, f"video missing {key}"
        assert v["url"].startswith("http"), "video url must be http"
        assert isinstance(v["views"], int)

    def test_competition_kpi_videos_count(self):
        kpis = pytest.picked_comp_payload.get("kpis") or {}
        assert "videos_count" in kpis, "kpis.videos_count missing"
        assert kpis["videos_count"] == len(pytest.picked_comp_payload["videos"])
        # winners_count also expected
        assert "winners_count" in kpis, "kpis.winners_count missing"


# ────────────────────────────────────────────────
# 3) Social posts >= 50
# ────────────────────────────────────────────────
class TestSocialPostsCount:

    def test_posts_count(self, headers):
        r = requests.get(f"{BASE_URL}/api/merchant/social/posts", headers=headers, timeout=15)
        assert r.status_code == 200
        posts = r.json()
        assert isinstance(posts, list)
        assert len(posts) >= 50, f"Expected >=50 posts, got {len(posts)}"

    def test_post_deep_analytics_shape(self, headers):
        r = requests.get(f"{BASE_URL}/api/merchant/social/posts", headers=headers, timeout=15)
        posts = r.json()
        pid = posts[0].get("id") or posts[0].get("_id")
        assert pid
        resp = requests.get(f"{BASE_URL}/api/merchant/social/posts/{pid}/deep-analytics",
                            headers=headers, timeout=20)
        assert resp.status_code == 200
        body = resp.json()
        kpis = body.get("kpis") or {}
        # Must contain likes_total, comments_total for row-5 KPI
        assert "likes_total" in kpis
        assert "comments_total" in kpis
        assert "reach_estimate" in kpis
