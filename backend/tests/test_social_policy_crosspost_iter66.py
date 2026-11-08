# Iter66: Social community reports (idempotent + auto-hide at 3), service experience crosspost to social, service reviews/experiences
import os, asyncio, pytest, requests
from datetime import datetime, timezone
from bson import ObjectId
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv('/app/frontend/.env'); load_dotenv('/app/backend/.env')
BASE_URL = (os.environ.get('EXPO_BACKEND_URL') or os.environ.get('EXPO_PUBLIC_BACKEND_URL')).rstrip('/')
MONGO_URL = os.environ['MONGO_URL']; DB_NAME = os.environ['DB_NAME']


def run(coro):
    async def _w():
        cli = AsyncIOMotorClient(MONGO_URL)
        try:
            return await coro(cli[DB_NAME])
        finally:
            cli.close()
    return asyncio.run(_w())


def login(phone, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"phone": phone, "password": pw}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {phone}: {r.status_code}")
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def H():
    return {"cust": login("0500000000", "test1234"), "merch": login("0509999999", "merchant2025"),
            "chamber": login("0550000000", "chamber2025")}


# ─── Community reports ───
@pytest.fixture(scope="module")
def test_post():
    async def mk(db):
        r = await db.social_posts.insert_one({"author": "TEST_iter66", "author_id": "TEST", "type": "post",
            "text": "TEST_iter66 report post", "likes": 0, "comments": 0, "views": 0,
            "created_at": datetime.now(timezone.utc).isoformat()})
        return str(r.inserted_id)
    pid = run(mk)
    yield pid
    run(lambda db: db.social_posts.delete_one({"_id": ObjectId(pid)}))


class TestReports:
    def test_report_first_and_idempotent(self, H, test_post):
        u = f"{BASE_URL}/api/social/posts/{test_post}/report"
        r1 = requests.post(u, json={"reason": "سبام"}, headers=H["cust"]); assert r1.status_code == 200, r1.text
        assert r1.json().get("ok") is True and not r1.json().get("already")
        r2 = requests.post(u, json={"reason": "سبام"}, headers=H["cust"]); assert r2.status_code == 200
        assert r2.json().get("already") is True
        doc = run(lambda db: db.social_posts.find_one({"_id": ObjectId(test_post)}))
        assert len(doc["reported_by"]) == 1 and len(doc["reports"]) == 1 and not doc.get("hidden")

    def test_visible_after_two_reports(self, H, test_post):
        r = requests.post(f"{BASE_URL}/api/social/posts/{test_post}/report", json={}, headers=H["merch"])
        assert r.status_code == 200 and not r.json().get("already")
        ids = [p["id"] for p in requests.get(f"{BASE_URL}/api/social/posts?limit=200").json()]
        assert test_post in ids

    def test_hidden_after_three_distinct(self, H, test_post):
        r = requests.post(f"{BASE_URL}/api/social/posts/{test_post}/report", json={}, headers=H["chamber"])
        assert r.status_code == 200 and not r.json().get("already")
        doc = run(lambda db: db.social_posts.find_one({"_id": ObjectId(test_post)}))
        assert doc.get("hidden") is True
        ids = [p["id"] for p in requests.get(f"{BASE_URL}/api/social/posts?limit=200").json()]
        assert test_post not in ids

    def test_restore_unhide(self, test_post):
        run(lambda db: db.social_posts.update_one({"_id": ObjectId(test_post)},
            {"$unset": {"hidden": "", "reported_by": "", "reports": ""}}))
        ids = [p["id"] for p in requests.get(f"{BASE_URL}/api/social/posts?limit=200").json()]
        assert test_post in ids

    def test_report_invalid_id_404(self, H):
        r = requests.post(f"{BASE_URL}/api/social/posts/notanid/report", json={}, headers=H["cust"])
        assert r.status_code == 404

    def test_report_requires_auth(self, test_post):
        r = requests.post(f"{BASE_URL}/api/social/posts/{test_post}/report", json={})
        assert r.status_code in (401, 403)

    def test_feed_does_not_leak_reporter_ids(self):
        posts = requests.get(f"{BASE_URL}/api/social/posts?limit=200").json()
        leaks = [p["id"] for p in posts if "reported_by" in p or "reports" in p]
        assert not leaks, f"feed exposes reporter ids for {len(leaks)} posts"


# ─── Service experience crosspost ───
@pytest.fixture(scope="module")
def booking():
    b = run(lambda db: db.service_bookings.find_one({"service_id": {"$nin": ["", None]}}))
    if not b:
        pytest.skip("no service booking")
    return {"id": str(b["_id"]), "service_id": b["service_id"]}


@pytest.fixture(scope="module")
def created():
    st = {"updates": []}
    yield st
    async def clean(db):
        for uid in st["updates"]:
            await db.social_posts.delete_many({"service_update_id": uid})
            await db.service_updates.delete_one({"_id": ObjectId(uid)})
    run(clean)


class TestCrosspost:
    def test_create_with_crosspost(self, H, booking, created):
        r = requests.post(f"{BASE_URL}/api/services/updates", headers=H["merch"], json={
            "booking_id": booking["id"], "video_url": "https://example.com/TEST_iter66.mp4",
            "caption": "TEST_iter66 cap", "is_public_experience": True, "crosspost_to_social": True})
        assert r.status_code == 200, r.text
        uid = r.json()["id"]; created["updates"].append(uid)
        posts = run(lambda db: db.social_posts.find({"service_update_id": uid}).to_list(10))
        assert len(posts) == 1
        p = posts[0]
        assert p["type"] == "experience" and p["linked_service_id"] == booking["service_id"]
        assert p["video"].endswith("TEST_iter66.mp4")
        up = run(lambda db: db.service_updates.find_one({"_id": ObjectId(uid)}))
        assert up["social_post_id"] == str(p["_id"])
        feed = requests.get(f"{BASE_URL}/api/social/posts?limit=200").json()
        assert str(p["_id"]) in [x["id"] for x in feed]

    def test_put_crosspost_no_duplicates(self, H, booking, created):
        r = requests.post(f"{BASE_URL}/api/services/updates", headers=H["merch"], json={
            "booking_id": booking["id"], "video_url": "https://example.com/TEST_iter66b.mp4",
            "caption": "TEST_iter66 put", "is_public_experience": True, "crosspost_to_social": False})
        assert r.status_code == 200
        uid = r.json()["id"]; created["updates"].append(uid)
        assert run(lambda db: db.social_posts.count_documents({"service_update_id": uid})) == 0
        for _ in range(3):
            pr = requests.put(f"{BASE_URL}/api/services/updates/{uid}", headers=H["merch"], json={"crosspost_to_social": True})
            assert pr.status_code == 200
        assert run(lambda db: db.social_posts.count_documents({"service_update_id": uid})) == 1

    def test_put_crosspost_concurrent_no_duplicates(self, H, booking, created):
        r = requests.post(f"{BASE_URL}/api/services/updates", headers=H["merch"], json={
            "booking_id": booking["id"], "video_url": "https://example.com/TEST_iter66c.mp4", "caption": "TEST_iter66 race"})
        uid = r.json()["id"]; created["updates"].append(uid)
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(5) as ex:
            list(ex.map(lambda _: requests.put(f"{BASE_URL}/api/services/updates/{uid}", headers=H["merch"],
                                               json={"crosspost_to_social": True}), range(5)))
        n = run(lambda db: db.social_posts.count_documents({"service_update_id": uid}))
        assert n == 1, f"concurrent PUT created {n} posts"

    def test_customer_cannot_create_update(self, H, booking):
        r = requests.post(f"{BASE_URL}/api/services/updates", headers=H["cust"], json={"booking_id": booking["id"]})
        assert r.status_code == 403

    def test_experiences_endpoint(self, booking, created):
        ex = requests.get(f"{BASE_URL}/api/services/{booking['service_id']}/experiences").json()
        assert any(e["id"] in created["updates"] for e in ex)

    def test_service_reviews_endpoint(self, booking):
        r = requests.get(f"{BASE_URL}/api/services/{booking['service_id']}/reviews")
        assert r.status_code == 200 and isinstance(r.json(), list)
