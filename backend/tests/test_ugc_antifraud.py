"""
Anti-fraud protection for UGC video competitions.
Tests IP-based limit (5 unique accounts per IP per competition).
Also regression on existing UGC flow (list/comment/share/view).
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
BASE_URL = BASE_URL.rstrip("/")

MERCHANT_PHONE = "0509999999"
MERCHANT_PASS = "merchant2025"
CUSTOMER_PHONE = "0500000000"
CUSTOMER_PASS = "test1234"

# Use synthetic IPs so this test is deterministic regardless of ingress
SPOOF_IP = "10.0.0.42"
SPOOF_IP_2 = "10.0.0.43"


def _headers(token=None, ip=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    if ip:
        h["X-Forwarded-For"] = ip
    return h


def _login(phone, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"phone": phone, "password": password},
                      headers=_headers(), timeout=15)
    assert r.status_code == 200, f"Login failed for {phone}: {r.status_code} {r.text}"
    return r.json()["token"]


def _register(phone, password, name):
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"phone": phone, "password": password, "name": name},
                      headers=_headers(), timeout=15)
    if r.status_code == 400 and "مسبقاً" in r.text:
        return _login(phone, password)
    assert r.status_code in (200, 201), f"Register failed {phone}: {r.status_code} {r.text}"
    return r.json()["token"]


def _create_ugc_competition(merchant_token, suffix=""):
    payload = {
        "title": f"TEST_AntiFraud_{suffix}_{uuid.uuid4().hex[:6]}",
        "description": "Anti-fraud test",
        "prize": "iPhone 15",
        "prize_count": 1,
        "competition_type": "ugc_video",
        "max_submissions_per_user": 10,
        "ugc_hashtag": "#zitex_challenge",
        "start_date": "2025-01-01",
        "end_date": "2026-12-31",
        "draw_date": "2026-12-31",
        "max_participants": 1000,
    }
    r = requests.post(f"{BASE_URL}/api/merchant/competitions",
                      json=payload, headers=_headers(merchant_token), timeout=15)
    assert r.status_code == 200, f"Create competition failed: {r.status_code} {r.text}"
    return r.json()["id"]


# Register a stable pool of 6 test customers (idempotent)
@pytest.fixture(scope="module")
def customer_tokens():
    tokens = []
    for i in range(1, 7):   # 1..6
        phone = f"05111111{i:02d}"   # 0511111101 .. 0511111106
        tokens.append(_register(phone, "test1234", f"AntiFraud User {i}"))
    return tokens


@pytest.fixture(scope="module")
def merchant_token():
    return _login(MERCHANT_PHONE, MERCHANT_PASS)


# ─── Anti-fraud on submissions ───────────────────────────────────────────
class TestSubmissionAntiFraud:
    def test_five_submissions_from_same_ip_pass_then_sixth_blocked(self, merchant_token, customer_tokens):
        cid = _create_ugc_competition(merchant_token, suffix="submit")
        # First 5 users submit from SPOOF_IP → all succeed
        for i in range(5):
            payload = {"video": f"zitex/uploads/test/u{i}.mp4",
                       "thumbnail": "", "caption": f"video {i}",
                       "hashtags": ["#zitex_challenge"]}
            r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos",
                              json=payload,
                              headers=_headers(customer_tokens[i], SPOOF_IP),
                              timeout=15)
            assert r.status_code in (200, 201), \
                f"User {i} submit expected success, got {r.status_code}: {r.text}"
            assert "id" in r.json()

        # 6th user, same IP → 429
        payload = {"video": "zitex/uploads/test/u6.mp4", "caption": "6th",
                   "hashtags": ["#zitex_challenge"]}
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos",
                          json=payload,
                          headers=_headers(customer_tokens[5], SPOOF_IP),
                          timeout=15)
        assert r.status_code == 429, f"Expected 429, got {r.status_code}: {r.text}"
        assert "تم تجاوز الحد المسموح من نفس الشبكة" in r.json().get("detail", "")

    def test_sixth_user_from_different_ip_can_still_submit(self, merchant_token, customer_tokens):
        cid = _create_ugc_competition(merchant_token, suffix="submitdiff")
        # 5 from SPOOF_IP
        for i in range(5):
            r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos",
                              json={"video": f"u{i}.mp4", "caption": f"v{i}",
                                    "hashtags": []},
                              headers=_headers(customer_tokens[i], SPOOF_IP),
                              timeout=15)
            assert r.status_code in (200, 201)
        # 6th from DIFFERENT IP → allowed
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos",
                          json={"video": "u6.mp4", "caption": "v6",
                                "hashtags": []},
                          headers=_headers(customer_tokens[5], SPOOF_IP_2),
                          timeout=15)
        assert r.status_code in (200, 201), \
            f"Different IP submission should pass, got {r.status_code}: {r.text}"


# ─── Anti-fraud on likes ─────────────────────────────────────────────────
class TestLikeAntiFraud:
    def test_five_liking_accounts_pass_sixth_blocked_toggle_still_works(self, merchant_token, customer_tokens):
        cid = _create_ugc_competition(merchant_token, suffix="likes")
        # Submit 1 video from user 0 (different IP so it doesn't consume the same-IP budget)
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos",
                          json={"video": "target.mp4", "caption": "target",
                                "hashtags": []},
                          headers=_headers(customer_tokens[0], "10.9.9.9"),
                          timeout=15)
        assert r.status_code in (200, 201), f"Submit target failed: {r.text}"
        vid = r.json()["id"]

        # 5 users like from SPOOF_IP → all succeed + likes counter grows to 5
        for i in range(5):
            r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos/{vid}/like",
                              json={},
                              headers=_headers(customer_tokens[i], SPOOF_IP),
                              timeout=15)
            assert r.status_code == 200, f"Like #{i} failed: {r.status_code} {r.text}"
            assert r.json().get("liked") is True

        # Verify likes count = 5 via list endpoint
        r = requests.get(f"{BASE_URL}/api/competitions/{cid}/videos",
                         headers=_headers(customer_tokens[0]), timeout=15)
        assert r.status_code == 200
        vids = r.json()
        target = next(v for v in vids if v["id"] == vid)
        assert target["likes"] == 5, f"Expected 5 likes, got {target['likes']}"

        # 6th distinct user from same IP → 429
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos/{vid}/like",
                          json={},
                          headers=_headers(customer_tokens[5], SPOOF_IP),
                          timeout=15)
        assert r.status_code == 429, f"Expected 429 for 6th liker, got {r.status_code}: {r.text}"
        assert "الشبكة" in r.json().get("detail", "")

        # Existing 5 users can toggle (unlike + re-like) without hitting limit
        # user[2] unlikes
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos/{vid}/like",
                          json={},
                          headers=_headers(customer_tokens[2], SPOOF_IP),
                          timeout=15)
        assert r.status_code == 200 and r.json().get("liked") is False
        # user[2] re-likes → still allowed (they were already counted)
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos/{vid}/like",
                          json={},
                          headers=_headers(customer_tokens[2], SPOOF_IP),
                          timeout=15)
        assert r.status_code == 200 and r.json().get("liked") is True, \
            f"Existing user re-like should be allowed, got {r.status_code}: {r.text}"


# ─── Regression: list/comment/share/view still work ──────────────────────
class TestUGCRegression:
    def test_list_sorted_by_likes_with_rank(self, merchant_token, customer_tokens):
        cid = _create_ugc_competition(merchant_token, suffix="regress")
        # Submit 3 videos from 3 different users on different IPs (so no anti-fraud)
        vids = []
        for i in range(3):
            r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos",
                              json={"video": f"reg{i}.mp4", "caption": f"reg{i}",
                                    "hashtags": []},
                              headers=_headers(customer_tokens[i], f"10.1.1.{i+1}"),
                              timeout=15)
            assert r.status_code in (200, 201), f"Submit reg{i} failed: {r.text}"
            vids.append(r.json()["id"])

        # Give video[0] 2 likes, video[1] 1 like, video[2] 0 likes
        for liker in (customer_tokens[3], customer_tokens[4]):
            r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos/{vids[0]}/like",
                              json={}, headers=_headers(liker, "10.2.2.2"), timeout=15)
            assert r.status_code == 200
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos/{vids[1]}/like",
                          json={}, headers=_headers(customer_tokens[3], "10.2.2.2"), timeout=15)
        assert r.status_code == 200

        # List
        r = requests.get(f"{BASE_URL}/api/competitions/{cid}/videos",
                         headers=_headers(customer_tokens[0]), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 3
        # Sorted DESC by likes
        assert data[0]["likes"] >= data[1]["likes"] >= data[2]["likes"]
        assert data[0]["rank"] == 1 and data[1]["rank"] == 2 and data[2]["rank"] == 3

    def test_comment_share_view_still_increment(self, merchant_token, customer_tokens):
        cid = _create_ugc_competition(merchant_token, suffix="csv")
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos",
                          json={"video": "csv.mp4", "caption": "csv",
                                "hashtags": []},
                          headers=_headers(customer_tokens[0], "10.5.5.1"),
                          timeout=15)
        assert r.status_code in (200, 201)
        vid = r.json()["id"]

        # Comment
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos/{vid}/comment",
                          json={"text": "nice video!"},
                          headers=_headers(customer_tokens[1]), timeout=15)
        assert r.status_code == 200, f"Comment failed: {r.text}"

        # GET comments
        r = requests.get(f"{BASE_URL}/api/competitions/{cid}/videos/{vid}/comments",
                         headers=_headers(customer_tokens[1]), timeout=15)
        assert r.status_code == 200
        comments = r.json()
        assert len(comments) >= 1

        # Share + View
        r_share = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos/{vid}/share",
                                json={}, headers=_headers(customer_tokens[1]), timeout=15)
        assert r_share.status_code == 200
        r_view = requests.post(f"{BASE_URL}/api/competitions/{cid}/videos/{vid}/view",
                               json={}, headers=_headers(customer_tokens[1]), timeout=15)
        assert r_view.status_code == 200

        # Verify counters
        r = requests.get(f"{BASE_URL}/api/competitions/{cid}/videos",
                         headers=_headers(customer_tokens[0]), timeout=15)
        target = next(v for v in r.json() if v["id"] == vid)
        assert target["comments"] >= 1
        assert target["shares"] >= 1
        assert target["views"] >= 1
