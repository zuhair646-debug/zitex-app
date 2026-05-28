"""
Backend tests for Zitex social/auth NEW features (iteration 8).

Scope (per review request, backend-only):
  1. Driver login          -> /api/auth/login (role=driver)
  2. Poll voting           -> /api/social/posts/{pid}/vote
  3. Merchant post types   -> /api/merchant/social/posts (post/poll/question/event/story)
  4. /api/social/stories   -> only non-expired stories
  5. Multi-images          -> images[] persisted, length preserved
  6. Empty-body validation -> 400 on text="" + no image
"""
import os
import time
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL is not set in environment")

API = f"{BASE_URL}/api"

CUSTOMER = {"phone": "0500000000", "password": "test1234"}
MERCHANT = {"phone": "0509999999", "password": "merchant2025"}
DRIVER   = {"phone": "0540001111", "password": "driver1234"}


# ───────────────────────── Fixtures ─────────────────────────
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, creds):
    r = session.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed for {creds['phone']}: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["token"], "No token in login response"
    assert "user" in data, "No user in login response"
    return data


@pytest.fixture(scope="session")
def customer_token(session):
    return _login(session, CUSTOMER)["token"]


@pytest.fixture(scope="session")
def merchant_token(session):
    return _login(session, MERCHANT)["token"]


def _auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ───────────────────────── 1. Driver login ─────────────────────────
class TestDriverLogin:
    def test_driver_login_returns_role_driver_and_token(self, session):
        data = _login(session, DRIVER)
        user = data["user"]
        assert user.get("role") == "driver", f"Expected role=driver, got {user.get('role')}"
        assert user.get("phone") == "0540001111"
        assert isinstance(data.get("token"), str) and len(data["token"]) > 20

    def test_driver_token_works_on_auth_me(self, session):
        data = _login(session, DRIVER)
        r = session.get(f"{API}/auth/me", headers=_auth(data["token"]))
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "driver"


# ───────────────────── 3. Merchant post types (CREATE) ─────────────────────
# Run before poll voting so we always have a fresh poll to vote on.
class TestMerchantPostTypes:
    created_ids: list = []

    def test_create_basic_post(self, session, merchant_token):
        body = {"text": "TEST_post body", "image": "https://example.com/x.jpg", "type": "post"}
        r = session.post(f"{API}/merchant/social/posts", json=body, headers=_auth(merchant_token))
        assert r.status_code == 200, r.text
        pid = r.json().get("id")
        assert pid
        TestMerchantPostTypes.created_ids.append(pid)

    def test_create_poll_post(self, session, merchant_token):
        body = {
            "text": "TEST_Best phone?",
            "type": "poll",
            "poll_options": [{"text": "iPhone"}, {"text": "Samsung"}, {"text": "Pixel"}],
        }
        r = session.post(f"{API}/merchant/social/posts", json=body, headers=_auth(merchant_token))
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        TestMerchantPostTypes.created_ids.append(pid)

        # Fetch back via GET /api/social/posts and verify poll_options votes initialized to 0
        listing = session.get(f"{API}/social/posts").json()
        match = next((p for p in listing if p.get("id") == pid), None)
        assert match is not None, "Created poll not present in /social/posts"
        assert match.get("type") == "poll"
        assert "poll_options" in match and len(match["poll_options"]) == 3
        for opt in match["poll_options"]:
            assert opt.get("votes") == 0, f"votes should init to 0, got {opt}"
            assert opt.get("text")

        # Remember this poll id for the voting tests
        pytest.poll_post_id = pid

    def test_create_question_post(self, session, merchant_token):
        body = {"text": "TEST_What do you think?", "type": "question"}
        r = session.post(f"{API}/merchant/social/posts", json=body, headers=_auth(merchant_token))
        assert r.status_code == 200, r.text
        TestMerchantPostTypes.created_ids.append(r.json()["id"])

    def test_create_event_post(self, session, merchant_token):
        body = {
            "text": "TEST_Grand opening!",
            "type": "event",
            "event_date": "2025-08-20 19:00",
            "event_location": "Riyadh",
        }
        r = session.post(f"{API}/merchant/social/posts", json=body, headers=_auth(merchant_token))
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        TestMerchantPostTypes.created_ids.append(pid)

        listing = session.get(f"{API}/social/posts").json()
        match = next((p for p in listing if p.get("id") == pid), None)
        assert match and match.get("event_date") == "2025-08-20 19:00"
        assert match.get("event_location") == "Riyadh"

    def test_create_story_post_with_expires_at(self, session, merchant_token):
        body = {
            "text": "TEST_24h story!",
            "image": "https://example.com/story.jpg",
            "type": "story",
        }
        r = session.post(f"{API}/merchant/social/posts", json=body, headers=_auth(merchant_token))
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        TestMerchantPostTypes.created_ids.append(pid)
        pytest.story_post_id = pid

        # Fetch back and assert expires_at is ~24h in future
        listing = session.get(f"{API}/social/posts").json()
        match = next((p for p in listing if p.get("id") == pid), None)
        assert match is not None, "Story not in /social/posts"
        assert match.get("type") == "story"
        assert match.get("expires_at"), "Story must have expires_at"

        exp = datetime.fromisoformat(match["expires_at"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        delta_h = (exp - now).total_seconds() / 3600.0
        assert 23.0 < delta_h < 25.0, f"expires_at should be ~24h in future, got {delta_h:.2f}h"


# ───────────────────── 4. /api/social/stories ─────────────────────
class TestStoriesFeed:
    def test_stories_endpoint_returns_only_story_type(self, session):
        r = session.get(f"{API}/social/stories")
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list)
        for s in items:
            assert s.get("type") == "story", f"Non-story leaked into /social/stories: {s.get('type')}"

    def test_recently_created_story_appears(self, session):
        pid = getattr(pytest, "story_post_id", None)
        assert pid, "TestMerchantPostTypes.test_create_story_post_with_expires_at must run first"
        items = session.get(f"{API}/social/stories").json()
        ids = [s.get("id") for s in items]
        assert pid in ids, f"Newly created story {pid} missing from /social/stories ids={ids[:5]}..."


# ───────────────────── 2. Poll voting ─────────────────────
class TestPollVoting:
    def _get_poll(self, session, pid):
        listing = session.get(f"{API}/social/posts").json()
        return next((p for p in listing if p.get("id") == pid), None)

    def test_vote_switch_and_idempotent(self, session, customer_token):
        # Prefer the poll just created in TestMerchantPostTypes; fallback to first poll in feed
        pid = getattr(pytest, "poll_post_id", None)
        if not pid:
            listing = session.get(f"{API}/social/posts").json()
            poll = next((p for p in listing if p.get("type") == "poll" and p.get("poll_options")), None)
            assert poll, "No poll posts available in /social/posts to test against"
            pid = poll["id"]

        # Baseline
        before = self._get_poll(session, pid)
        assert before, "Poll disappeared from listing"
        v0_before = before["poll_options"][0].get("votes", 0)
        v1_before = before["poll_options"][1].get("votes", 0)

        # First vote → option 0
        r = session.post(
            f"{API}/social/posts/{pid}/vote",
            json={"option_index": 0},
            headers=_auth(customer_token),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("message") == "Vote recorded"
        assert body.get("option_index") == 0

        after1 = self._get_poll(session, pid)
        v0_after1 = after1["poll_options"][0].get("votes", 0)
        v1_after1 = after1["poll_options"][1].get("votes", 0)
        assert v0_after1 == v0_before + 1, f"option0 votes should +1: {v0_before}->{v0_after1}"
        assert v1_after1 == v1_before, f"option1 votes should be unchanged: {v1_before}->{v1_after1}"

        # Switch vote → option 1 (no double counting)
        r = session.post(
            f"{API}/social/posts/{pid}/vote",
            json={"option_index": 1},
            headers=_auth(customer_token),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("message") == "Vote recorded"
        assert body.get("option_index") == 1

        after2 = self._get_poll(session, pid)
        v0_after2 = after2["poll_options"][0].get("votes", 0)
        v1_after2 = after2["poll_options"][1].get("votes", 0)
        assert v0_after2 == v0_after1 - 1, f"option0 should DECREASE by 1 on switch: {v0_after1}->{v0_after2}"
        assert v1_after2 == v1_after1 + 1, f"option1 should INCREASE by 1 on switch: {v1_after1}->{v1_after2}"

        # Vote again same option → 'Already voted', no increment
        r = session.post(
            f"{API}/social/posts/{pid}/vote",
            json={"option_index": 1},
            headers=_auth(customer_token),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("message") == "Already voted", f"expected 'Already voted', got {body}"

        after3 = self._get_poll(session, pid)
        assert after3["poll_options"][0].get("votes", 0) == v0_after2
        assert after3["poll_options"][1].get("votes", 0) == v1_after2


# ───────────────────── 5. Multi-images ─────────────────────
class TestMultiImagesPost:
    def test_multi_images_array_length_preserved(self, session, merchant_token):
        body = {
            "text": "TEST_Multi",
            "images": ["https://a.jpg", "https://b.jpg", "https://c.jpg"],
            "type": "post",
        }
        r = session.post(f"{API}/merchant/social/posts", json=body, headers=_auth(merchant_token))
        assert r.status_code == 200, r.text
        pid = r.json()["id"]

        listing = session.get(f"{API}/social/posts").json()
        match = next((p for p in listing if p.get("id") == pid), None)
        assert match is not None, "Multi-image post not in listing"
        imgs = match.get("images") or []
        assert len(imgs) == 3, f"Expected 3 images, got {len(imgs)}: {imgs}"
        assert imgs == ["https://a.jpg", "https://b.jpg", "https://c.jpg"]


# ───────────────────── 6. Empty body validation ─────────────────────
class TestEmptyPostValidation:
    def test_empty_text_and_no_image_returns_400(self, session, merchant_token):
        body = {"text": "", "type": "post"}
        r = session.post(f"{API}/merchant/social/posts", json=body, headers=_auth(merchant_token))
        assert r.status_code == 400, f"Expected 400 for empty post, got {r.status_code}: {r.text}"
        assert "text" in r.text.lower() or "image" in r.text.lower()

    def test_customer_cannot_create_post(self, session, customer_token):
        # Sanity guard: merchant-only endpoint
        body = {"text": "TEST_should_fail", "type": "post"}
        r = session.post(f"{API}/merchant/social/posts", json=body, headers=_auth(customer_token))
        assert r.status_code in (401, 403), f"Customer should NOT be able to create posts, got {r.status_code}"
