# Social comments: POST /api/social/posts/{id}/comments works for posts with array `comments` (iteration_36)
import os
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")
TEXT = "TEST_comment_iter36"


@pytest.fixture(scope="module")
def db():
    c = MongoClient(os.environ["MONGO_URL"])
    d = c[os.environ["DB_NAME"]]
    yield d
    d.social_comments.delete_many({"text": TEXT})
    c.close()


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"phone": "0500000000", "password": "test1234"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    return r.json()["token"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def test_array_posts_exist(db):
    n = db.social_posts.count_documents({"comments": {"$type": "array"}})
    print("array posts:", n)
    assert n > 0


def test_comment_on_array_post_returns_200(db, token):
    post = db.social_posts.find_one({"comments": {"$type": "array"}})
    pid = str(post["_id"])
    before = post["comments"]
    r = requests.post(f"{BASE_URL}/api/social/posts/{pid}/comments", json={"text": TEXT}, headers=_hdr(token))
    assert r.status_code == 200, r.text
    assert r.json().get("message") == "Comment added"
    g = requests.get(f"{BASE_URL}/api/social/posts/{pid}/comments", headers=_hdr(token))
    assert g.status_code == 200
    data = g.json()
    items = data if isinstance(data, list) else data.get("comments", [])
    assert any(c.get("text") == TEXT for c in items)
    after = db.social_posts.find_one({"_id": post["_id"]})["comments"]
    assert after == before  # array untouched


def test_comment_multiple_array_posts(db, token):
    posts = list(db.social_posts.find({"comments": {"$type": "array"}}).limit(5))
    codes = []
    for p in posts:
        r = requests.post(f"{BASE_URL}/api/social/posts/{p['_id']}/comments", json={"text": TEXT}, headers=_hdr(token))
        codes.append(r.status_code)
    assert all(c == 200 for c in codes), codes


def test_comment_numeric_post_increments(db, token):
    post = db.social_posts.find_one({"comments": {"$type": "number"}})
    if not post:
        pytest.skip("no numeric comments post")
    before = post["comments"]
    r = requests.post(f"{BASE_URL}/api/social/posts/{post['_id']}/comments", json={"text": TEXT}, headers=_hdr(token))
    assert r.status_code == 200
    after = db.social_posts.find_one({"_id": post["_id"]})["comments"]
    assert after == before + 1
    db.social_posts.update_one({"_id": post["_id"]}, {"$inc": {"comments": -1}})
