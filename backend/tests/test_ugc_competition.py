"""
UGC Video Competition backend tests.
Covers:
- Merchant creates a UGC competition
- Customer flow: submit video, cap enforcement, list/like/comment/share/view
- Auto-finalize sorts winners by likes DESC and marks status=ended
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # Fallback: read frontend .env
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip()
                break
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
BASE_URL = BASE_URL.rstrip("/")

MERCHANT = {"phone": "0509999999", "password": "merchant2025"}
CUSTOMER = {"phone": "0500000000", "password": "test1234"}


def _login(sess, creds):
    r = sess.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    return r.json()["token"]


def _register_or_login(sess, phone, password, name):
    r = sess.post(f"{BASE_URL}/api/auth/register",
                  json={"phone": phone, "password": password, "name": name},
                  timeout=30)
    if r.status_code == 200:
        return r.json()["token"]
    # already exists
    r = sess.post(f"{BASE_URL}/api/auth/login", json={"phone": phone, "password": password}, timeout=30)
    assert r.status_code == 200, f"reg/login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def merchant_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    token = _login(s, MERCHANT)
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def customer_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    token = _login(s, CUSTOMER)
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def created_competition(merchant_client):
    payload = {
        "title": "TEST_تحدي فيديو Zitex",
        "prize": "iPhone 15",
        "prize_count": 3,
        "competition_type": "ugc_video",
        "end_date": "2026-12-31",
        "max_submissions_per_user": 1,
        "ugc_hashtag": "zitex_challenge",
    }
    r = merchant_client.post(f"{BASE_URL}/api/merchant/competitions", json=payload, timeout=30)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    data = r.json()
    assert "id" in data
    return data["id"]


# ─── Competition creation ───
class TestCreateUGC:
    def test_merchant_creates_ugc_competition(self, created_competition):
        assert isinstance(created_competition, str) and len(created_competition) >= 12

    def test_get_competition_reflects_type(self, created_competition, customer_client):
        r = customer_client.get(f"{BASE_URL}/api/competitions/{created_competition}", timeout=30)
        assert r.status_code == 200
        c = r.json()
        assert c.get("competition_type") == "ugc_video"
        assert c.get("prize") == "iPhone 15"
        assert c.get("prize_count") == 3
        assert c.get("ugc_hashtag") == "zitex_challenge"
        assert c.get("max_submissions_per_user") == 1


# ─── Customer video submission flow ───
class TestCustomerUGCFlow:
    def test_customer_submits_video(self, customer_client, created_competition):
        r = customer_client.post(
            f"{BASE_URL}/api/competitions/{created_competition}/videos",
            json={"video": "zitex/uploads/test/fake.mp4",
                  "caption": "فيديوي",
                  "hashtags": ["zitex_challenge"]},
            timeout=30,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        data = r.json()
        assert "id" in data

    def test_second_submission_blocked(self, customer_client, created_competition):
        r = customer_client.post(
            f"{BASE_URL}/api/competitions/{created_competition}/videos",
            json={"video": "zitex/uploads/test/fake2.mp4",
                  "caption": "ثاني", "hashtags": []},
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"

    def test_list_videos_includes_rank_and_flags(self, customer_client, created_competition):
        r = customer_client.get(f"{BASE_URL}/api/competitions/{created_competition}/videos",
                                timeout=30)
        assert r.status_code == 200
        videos = r.json()
        assert isinstance(videos, list) and len(videos) >= 1
        v = videos[0]
        assert "rank" in v
        assert "liked_by_me" in v
        assert "likes" in v
        assert v["rank"] == 1

    def test_like_toggle(self, customer_client, created_competition):
        # get first video
        r = customer_client.get(f"{BASE_URL}/api/competitions/{created_competition}/videos", timeout=30)
        vid = r.json()[0]["id"]
        initial_likes = r.json()[0]["likes"]
        # like
        r1 = customer_client.post(f"{BASE_URL}/api/competitions/{created_competition}/videos/{vid}/like", timeout=30)
        assert r1.status_code == 200
        assert r1.json().get("liked") is True
        # verify increment
        r2 = customer_client.get(f"{BASE_URL}/api/competitions/{created_competition}/videos", timeout=30)
        after1 = [v for v in r2.json() if v["id"] == vid][0]
        assert after1["likes"] == initial_likes + 1
        # unlike
        r3 = customer_client.post(f"{BASE_URL}/api/competitions/{created_competition}/videos/{vid}/like", timeout=30)
        assert r3.status_code == 200
        assert r3.json().get("liked") is False
        r4 = customer_client.get(f"{BASE_URL}/api/competitions/{created_competition}/videos", timeout=30)
        after2 = [v for v in r4.json() if v["id"] == vid][0]
        assert after2["likes"] == initial_likes

    def test_comment_and_list(self, customer_client, created_competition):
        r = customer_client.get(f"{BASE_URL}/api/competitions/{created_competition}/videos", timeout=30)
        vid = r.json()[0]["id"]
        prev_comments = r.json()[0].get("comments", 0)
        rc = customer_client.post(
            f"{BASE_URL}/api/competitions/{created_competition}/videos/{vid}/comment",
            json={"text": "تعليق اختباري"},
            timeout=30,
        )
        assert rc.status_code == 200, rc.text
        # verify list
        rl = customer_client.get(f"{BASE_URL}/api/competitions/{created_competition}/videos/{vid}/comments", timeout=30)
        assert rl.status_code == 200
        comms = rl.json()
        assert isinstance(comms, list) and len(comms) >= 1
        assert any(c.get("text") == "تعليق اختباري" for c in comms)
        # verify counter increment
        r2 = customer_client.get(f"{BASE_URL}/api/competitions/{created_competition}/videos", timeout=30)
        after = [v for v in r2.json() if v["id"] == vid][0]
        assert after["comments"] == prev_comments + 1

    def test_share_increments(self, customer_client, created_competition):
        r = customer_client.get(f"{BASE_URL}/api/competitions/{created_competition}/videos", timeout=30)
        vid = r.json()[0]["id"]
        prev = r.json()[0].get("shares", 0)
        rs = customer_client.post(f"{BASE_URL}/api/competitions/{created_competition}/videos/{vid}/share", timeout=30)
        assert rs.status_code == 200
        r2 = customer_client.get(f"{BASE_URL}/api/competitions/{created_competition}/videos", timeout=30)
        after = [v for v in r2.json() if v["id"] == vid][0]
        assert after["shares"] == prev + 1

    def test_view_increments(self, customer_client, created_competition):
        r = customer_client.get(f"{BASE_URL}/api/competitions/{created_competition}/videos", timeout=30)
        vid = r.json()[0]["id"]
        prev = r.json()[0].get("views", 0)
        rv = requests.post(f"{BASE_URL}/api/competitions/{created_competition}/videos/{vid}/view", timeout=30)
        assert rv.status_code == 200
        r2 = customer_client.get(f"{BASE_URL}/api/competitions/{created_competition}/videos", timeout=30)
        after = [v for v in r2.json() if v["id"] == vid][0]
        assert after["views"] == prev + 1


# ─── Auto-finalize flow: 3 videos with distinct likes ───
class TestAutoFinalize:
    """Creates a fresh comp + 3 users each submit + assign different likes."""

    @pytest.fixture(scope="class")
    def fresh_comp(self, merchant_client):
        payload = {
            "title": "TEST_تحدي فيديو Finalize",
            "prize": "iPhone 15",
            "prize_count": 3,
            "competition_type": "ugc_video",
            "end_date": "2026-12-31",
            "max_submissions_per_user": 1,
            "ugc_hashtag": "zitex_finalize",
        }
        r = merchant_client.post(f"{BASE_URL}/api/merchant/competitions", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    @pytest.fixture(scope="class")
    def three_customers(self):
        """Create 3 fresh customers (idempotent register/login) + submit one video each."""
        import time
        clients = []
        suffix = str(int(time.time()))[-6:]
        for i in range(3):
            s = requests.Session()
            s.headers.update({"Content-Type": "application/json"})
            phone = f"055{suffix}{i:02d}"[-10:]  # 10-digit ish
            # ensure starts with 05
            if not phone.startswith("05"):
                phone = "05" + phone[-8:]
            token = _register_or_login(s, phone, "test1234", f"TEST_UGC_{i}")
            s.headers.update({"Authorization": f"Bearer {token}"})
            clients.append(s)
        return clients

    def test_three_submissions_and_likes(self, fresh_comp, three_customers, customer_client, merchant_client):
        videos = []
        for i, c in enumerate(three_customers):
            r = c.post(
                f"{BASE_URL}/api/competitions/{fresh_comp}/videos",
                json={"video": f"zitex/uploads/test/fake_{i}.mp4",
                      "caption": f"video {i}", "hashtags": []},
                timeout=30,
            )
            assert r.status_code == 200, f"submit {i}: {r.status_code} {r.text}"
            videos.append(r.json()["id"])

        # Assign likes: v0=3, v1=2, v2=1
        # Likers: three_customers[0..2] + customer_client + merchant_client = 5 potential
        likers = three_customers + [customer_client, merchant_client]
        target_likes = [3, 2, 1]
        for idx, vid in enumerate(videos):
            for k in range(target_likes[idx]):
                r = likers[k].post(
                    f"{BASE_URL}/api/competitions/{fresh_comp}/videos/{vid}/like",
                    timeout=30,
                )
                assert r.status_code == 200, f"like v{idx} by liker{k}: {r.text}"
                assert r.json().get("liked") is True

        # verify listing
        rlist = customer_client.get(f"{BASE_URL}/api/competitions/{fresh_comp}/videos", timeout=30)
        assert rlist.status_code == 200
        all_v = rlist.json()
        assert len(all_v) == 3
        # sorted DESC by likes
        assert all_v[0]["likes"] >= all_v[1]["likes"] >= all_v[2]["likes"]
        assert all_v[0]["likes"] == 3
        assert all_v[1]["likes"] == 2
        assert all_v[2]["likes"] == 1

        # Auto-finalize (merchant)
        rf = merchant_client.post(f"{BASE_URL}/api/competitions/{fresh_comp}/auto-finalize", timeout=30)
        assert rf.status_code == 200, rf.text
        winners = rf.json().get("winners", [])
        assert len(winners) == 3
        assert winners[0]["likes"] >= winners[1]["likes"] >= winners[2]["likes"]
        assert winners[0]["rank"] == 1

        # GET competition → status=ended, winners populated
        rc = customer_client.get(f"{BASE_URL}/api/competitions/{fresh_comp}", timeout=30)
        assert rc.status_code == 200
        comp = rc.json()
        assert comp.get("status") == "ended"
        assert len(comp.get("winners", [])) == 3
