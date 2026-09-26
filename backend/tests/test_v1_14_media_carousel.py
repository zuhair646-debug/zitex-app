"""Backend content check for v1.14.0 — MediaCarousel/multi-image + video seed.
Verifies:
 - >= 30 posts with images[] length >= 2
 - >= 10 posts with a video object whose url starts with https://videos.pexels.com/
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://mobile-builder-146.preview.emergentagent.com').rstrip('/')


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"phone": "0500000000", "password": "test1234"}, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def posts(customer_token):
    headers = {"Authorization": f"Bearer {customer_token}"} if customer_token else {}
    r = requests.get(f"{BASE_URL}/api/social/posts", headers=headers, timeout=30)
    assert r.status_code == 200, f"posts fetch failed {r.status_code} {r.text[:400]}"
    data = r.json()
    if isinstance(data, dict) and "posts" in data:
        data = data["posts"]
    assert isinstance(data, list), f"unexpected response shape: {type(data)}"
    return data


def test_posts_total_count(posts):
    assert len(posts) >= 30, f"only {len(posts)} posts (want >=30)"


def test_at_least_30_multi_image_posts(posts):
    multi = [p for p in posts if isinstance(p.get("images"), list) and len(p.get("images")) >= 2]
    assert len(multi) >= 30, f"only {len(multi)} posts have images[] with 2+ items (want >=30). Sample keys: {list(posts[0].keys()) if posts else []}"


def test_at_least_10_video_posts(posts):
    with_video = [p for p in posts if isinstance(p.get("video"), dict) and str(p["video"].get("url", "")).startswith("https://videos.pexels.com/")]
    assert len(with_video) >= 10, f"only {len(with_video)} posts have Pexels video (want >=10)"


def test_video_object_shape(posts):
    with_video = [p for p in posts if isinstance(p.get("video"), dict) and p["video"].get("url")]
    assert with_video, "no posts with video"
    v = with_video[0]["video"]
    # shape is loose — url is minimum requirement
    assert "url" in v and v["url"].startswith("https://")


def test_no_mongo_id_leaked(posts):
    for p in posts[:5]:
        assert "_id" not in p, f"MongoDB _id leaked in post {p.get('id')}"
