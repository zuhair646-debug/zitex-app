"""
Backend tests for Zitex Live Preview v1.11.0 merchant analytics endpoints.
Covers: sales-overview, top-products, product/service/competition analytics,
competitions-analytics-overview, social post detail, like-as-store, reply-to-comment.
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

MERCHANT_PHONE = "0509999999"
MERCHANT_PASSWORD = "merchant2025"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"phone": MERCHANT_PHONE, "password": MERCHANT_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Merchant login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def first_product_id():
    r = requests.get(f"{API}/products", timeout=15)
    assert r.status_code == 200, r.text
    products = r.json()
    # Response might be dict with "items" or list
    if isinstance(products, dict):
        products = products.get("items") or products.get("products") or []
    assert products and len(products) > 0, "No products found"
    pid = products[0].get("id") or products[0].get("_id")
    assert pid, f"first product has no id: {products[0]}"
    return pid


@pytest.fixture(scope="module")
def first_service_id(auth_headers):
    r = requests.get(f"{API}/services", timeout=15)
    assert r.status_code == 200, r.text
    services = r.json()
    if isinstance(services, dict):
        services = services.get("items") or services.get("services") or []
    assert services and len(services) > 0, "No services found"
    sid = services[0].get("id") or services[0].get("_id")
    assert sid
    return sid


@pytest.fixture(scope="module")
def first_competition_id():
    r = requests.get(f"{API}/competitions", timeout=15)
    assert r.status_code == 200, r.text
    comps = r.json()
    if isinstance(comps, dict):
        comps = comps.get("items") or comps.get("competitions") or []
    assert comps and len(comps) > 0
    cid = comps[0].get("id") or comps[0].get("_id")
    assert cid
    return cid


@pytest.fixture(scope="module")
def first_social_post_id():
    r = requests.get(f"{API}/social/posts", timeout=15)
    assert r.status_code == 200, r.text
    posts = r.json()
    if isinstance(posts, dict):
        posts = posts.get("items") or posts.get("posts") or []
    assert posts and len(posts) > 0, "No social posts found"
    return posts[0].get("id") or posts[0].get("_id")


# ------------------- Test 1: sales-overview -------------------
class TestSalesOverview:
    def test_sales_overview_shape(self, auth_headers):
        r = requests.get(f"{API}/merchant/analytics/sales-overview", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ("today", "week", "month", "daily_series"):
            assert key in data, f"Missing key: {key}"
        for period in ("today", "week", "month"):
            obj = data[period]
            for f in ("pos_sales", "app_sales", "count"):
                assert f in obj, f"{period} missing {f}"
        assert isinstance(data["daily_series"], list)
        # At least some non-zero series with pos/app split
        if data["daily_series"]:
            sample = data["daily_series"][0]
            assert "pos" in sample and "app" in sample, f"daily_series entry missing pos/app: {sample}"

    def test_sales_overview_has_data(self, auth_headers):
        """100+ orders seeded — expect non-zero month values."""
        r = requests.get(f"{API}/merchant/analytics/sales-overview", headers=auth_headers, timeout=30)
        data = r.json()
        month = data["month"]
        total_month = month["pos_sales"] + month["app_sales"]
        assert month["count"] >= 1, f"Expected orders in month, got {month['count']}"
        assert total_month > 0, f"Expected non-zero month revenue, got {total_month}"


# ------------------- Test 2: top-products -------------------
class TestTopProducts:
    def test_top_products_shape(self, auth_headers):
        r = requests.get(f"{API}/merchant/analytics/top-products?limit=8", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "top" in data
        top = data["top"]
        assert isinstance(top, list)
        assert len(top) >= 5, f"Expected at least 5 top products, got {len(top)}"
        for row in top:
            for key in ("product_id", "name", "revenue", "units", "pos_orders", "app_orders"):
                assert key in row, f"Row missing {key}: {row}"


# ------------------- Test 3: product analytics -------------------
class TestProductAnalytics:
    def test_product_analytics_shape(self, auth_headers, first_product_id):
        r = requests.get(f"{API}/merchant/products/{first_product_id}/analytics", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "kpis" in data and "monthly_series" in data
        kpis = data["kpis"]
        for f in ("total_sales", "pos_sales", "app_sales", "total_units_sold", "total_orders"):
            assert f in kpis, f"kpis missing {f}"
        assert isinstance(data["monthly_series"], list)
        if data["monthly_series"]:
            m = data["monthly_series"][0]
            assert "pos_sales" in m and "app_sales" in m, f"monthly_series missing pos/app split: {m}"


# ------------------- Test 4: service analytics -------------------
class TestServiceAnalytics:
    def test_service_analytics_shape(self, auth_headers, first_service_id):
        r = requests.get(f"{API}/merchant/services/{first_service_id}/analytics", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ("kpis", "status_breakdown", "star_distribution", "weekly_series", "recent_reviews"):
            assert key in data, f"Missing {key}"
        kpis = data["kpis"]
        for f in ("total_bookings", "revenue", "avg_rating", "review_count"):
            assert f in kpis, f"kpis missing {f}"
        assert isinstance(data["status_breakdown"], list)
        assert isinstance(data["star_distribution"], list)
        # Star distribution must contain 5 entries (stars 5..1)
        assert len(data["star_distribution"]) == 5


# ------------------- Test 5: competition analytics -------------------
class TestCompetitionAnalytics:
    def test_competition_analytics_shape(self, auth_headers, first_competition_id):
        r = requests.get(f"{API}/merchant/competitions/{first_competition_id}/analytics", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ("kpis", "sources", "top_cities", "daily_series", "recent_participants"):
            assert key in data, f"Missing {key}"
        kpis = data["kpis"]
        for f in ("total_participants", "unique_users", "followers_gained"):
            assert f in kpis, f"kpis missing {f}"
        assert isinstance(data["sources"], list)

    def test_competition_sources_contain_seeded_types(self, auth_headers, first_competition_id):
        """Seed script adds link, organic, push, social_share sources."""
        r = requests.get(f"{API}/merchant/competitions/{first_competition_id}/analytics", headers=auth_headers, timeout=30)
        data = r.json()
        source_names = {s["source"] for s in data["sources"]}
        expected = {"link", "organic", "push", "social_share"}
        missing = expected - source_names
        # If none of the sources are present, seed likely didn't run for this comp
        if not source_names:
            pytest.skip(f"No participants in first competition {first_competition_id}")
        # Report soft assertion: at least 2 of 4 seed sources should be present
        assert len(expected & source_names) >= 2, f"Expected seeded sources present, got {source_names}; missing {missing}"


# ------------------- Test 6: competitions analytics-overview -------------------
class TestCompetitionsOverview:
    def test_by_type_present(self, auth_headers):
        r = requests.get(f"{API}/merchant/competitions/analytics-overview", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "by_type" in data
        assert isinstance(data["by_type"], list)
        assert len(data["by_type"]) >= 1
        for row in data["by_type"]:
            for f in ("type", "count", "total_participants"):
                assert f in row, f"by_type row missing {f}: {row}"


# ------------------- Test 7: social post detail -------------------
class TestSocialPostDetail:
    def test_post_detail_shape(self, auth_headers, first_social_post_id):
        r = requests.get(f"{API}/merchant/social/posts/{first_social_post_id}/detail", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ("post", "kpis", "viewers", "likers", "comments"):
            assert key in data, f"Missing {key}"
        kpis = data["kpis"]
        for f in ("views", "likes", "comment_count", "reply_count"):
            assert f in kpis, f"kpis missing {f}"
        assert isinstance(data["comments"], list)

    def test_comments_sorted_latest_first(self, auth_headers, first_social_post_id):
        r = requests.get(f"{API}/merchant/social/posts/{first_social_post_id}/detail", headers=auth_headers, timeout=30)
        data = r.json()
        comments = data["comments"]
        if len(comments) < 2:
            pytest.skip("Not enough comments to verify sorting")
        for i in range(len(comments) - 1):
            a = comments[i].get("created_at", "")
            b = comments[i + 1].get("created_at", "")
            assert a >= b, f"Comments not sorted latest-first at idx {i}: {a} vs {b}"


# ------------------- Test 8: like-as-store -------------------
class TestLikeAsStore:
    def test_like_increments(self, auth_headers, first_social_post_id):
        # snapshot before
        d0 = requests.get(f"{API}/merchant/social/posts/{first_social_post_id}/detail", headers=auth_headers, timeout=30).json()
        likes_before = d0["post"].get("likes", 0)
        r = requests.post(f"{API}/merchant/social/posts/{first_social_post_id}/like-as-store", headers=auth_headers, json={}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        d1 = requests.get(f"{API}/merchant/social/posts/{first_social_post_id}/detail", headers=auth_headers, timeout=30).json()
        likes_after = d1["post"].get("likes", 0)
        assert likes_after >= likes_before + 1, f"Likes did not increment: {likes_before} -> {likes_after}"


# ------------------- Test 9: reply-to-comment as store -------------------
class TestReplyAsStore:
    def test_reply_as_store(self, auth_headers, first_social_post_id):
        # get comments
        d = requests.get(f"{API}/merchant/social/posts/{first_social_post_id}/detail", headers=auth_headers, timeout=30).json()
        comments = d.get("comments", [])
        if not comments:
            pytest.skip("No comments to reply to")
        cid = comments[0].get("id")
        assert cid, f"comment has no id: {comments[0]}"
        r = requests.post(
            f"{API}/merchant/social/posts/{first_social_post_id}/comments/{cid}/replies",
            headers=auth_headers, json={"text": "TEST_ZTX reply from store"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        reply = body.get("reply")
        assert reply is not None
        assert reply.get("is_store") is True, f"reply is_store must be true: {reply}"
        assert reply.get("text") == "TEST_ZTX reply from store"

    def test_reply_empty_text_400(self, auth_headers, first_social_post_id):
        d = requests.get(f"{API}/merchant/social/posts/{first_social_post_id}/detail", headers=auth_headers, timeout=30).json()
        comments = d.get("comments", [])
        if not comments:
            pytest.skip("No comments")
        cid = comments[0].get("id")
        r = requests.post(
            f"{API}/merchant/social/posts/{first_social_post_id}/comments/{cid}/replies",
            headers=auth_headers, json={"text": "   "}, timeout=15,
        )
        assert r.status_code == 400
