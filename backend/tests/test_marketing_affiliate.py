"""
End-to-end tests for the Marketing & Affiliate module.
Covers:
  - Merchant campaign creation (regular ad + affiliate)
  - Customer active-campaigns feed (with city/gender targeting)
  - Track view/click counters
  - Affiliate application (dedup, includes account fields)
  - Merchant approve → referral_code + commission from campaign
  - Customer affiliate dashboard (/my, /dashboard)
  - Public click tracker
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # Fallback: read frontend .env directly
    from pathlib import Path
    txt = Path("/app/frontend/.env").read_text()
    for line in txt.splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break
API = f"{BASE_URL}/api"

MERCHANT_PHONE = "0509999999"
MERCHANT_PASS = "merchant2025"
CUSTOMER_PHONE = "0500000000"
CUSTOMER_PASS = "test1234"


def _login(phone: str, password: str) -> dict:
    r = requests.post(f"{API}/auth/login", json={"phone": phone, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {phone}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"login response missing token: {data}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def merchant_hdr():
    return _login(MERCHANT_PHONE, MERCHANT_PASS)


@pytest.fixture(scope="module")
def customer_hdr():
    return _login(CUSTOMER_PHONE, CUSTOMER_PASS)


@pytest.fixture(scope="module")
def merchant_id(merchant_hdr):
    r = requests.get(f"{API}/auth/me", headers=merchant_hdr, timeout=10)
    assert r.status_code == 200
    body = r.json()
    return (body.get("user") or body)["id"]


@pytest.fixture(scope="module", autouse=True)
def _ensure_customer_city(customer_hdr):
    """Patch customer's city+gender so targeting can be verified."""
    r = requests.put(
        f"{API}/profile",
        headers=customer_hdr,
        json={"city": "الرياض", "gender": "male"},
        timeout=10,
    )
    assert r.status_code == 200, f"profile patch failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("city") == "الرياض"
    assert body.get("gender") == "male"
    yield


# Shared state across tests
STATE: dict = {}


# ── Marketing campaign creation ─────────────────────────────────────────────
class TestMerchantCampaigns:
    def test_create_regular_ad(self, merchant_hdr):
        payload = {
            "campaign_type": "ad",
            "title": "TEST_ عرض جوالات الرياض",
            "description": "خصومات ضخمة على أحدث الجوالات",
            "cta_label": "تسوّق الآن",
            "target_cities": ["الرياض"],
            "target_genders": ["male"],
            "target_interest_tags": ["phones"],
        }
        r = requests.post(f"{API}/merchant/marketing/ads", headers=merchant_hdr, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "id" in body
        STATE["ad_id"] = body["id"]

    def test_create_affiliate_campaign(self, merchant_hdr):
        payload = {
            "campaign_type": "affiliate",
            "title": "TEST_ انضم لبرنامج مسوّقي زايتكس",
            "description": "اربح مع كل عملية بيع",
            "commission_percent": 10,
            "incentives": "أفضل مسوق 500 ر.س",
            "target_cities": ["الرياض"],
            "target_genders": ["male"],
        }
        r = requests.post(f"{API}/merchant/marketing/ads", headers=merchant_hdr, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        STATE["affiliate_campaign_id"] = r.json()["id"]

    def test_list_ads_contains_both(self, merchant_hdr):
        r = requests.get(f"{API}/merchant/marketing/ads", headers=merchant_hdr, timeout=10)
        assert r.status_code == 200
        ads = r.json()
        ids = {a["id"] for a in ads}
        assert STATE["ad_id"] in ids
        assert STATE["affiliate_campaign_id"] in ids
        # Verify affiliate one has commission + incentives persisted
        aff = next(a for a in ads if a["id"] == STATE["affiliate_campaign_id"])
        assert aff["campaign_type"] == "affiliate"
        assert float(aff["commission_percent"]) == 10.0
        assert "أفضل مسوق" in aff["incentives"]


# ── Customer feed ───────────────────────────────────────────────────────────
class TestCustomerFeed:
    def test_active_ads_visible(self, customer_hdr):
        r = requests.get(f"{API}/marketing/ads/active", headers=customer_hdr, timeout=10)
        assert r.status_code == 200, r.text
        ids = {a["id"] for a in r.json()}
        assert STATE["ad_id"] in ids, "regular ad should be visible for Riyadh male"
        assert STATE["affiliate_campaign_id"] in ids, "affiliate campaign should be visible"

    def test_filter_by_affiliate_type(self, customer_hdr):
        r = requests.get(f"{API}/marketing/ads/active?campaign_type=affiliate", headers=customer_hdr, timeout=10)
        assert r.status_code == 200
        ads = r.json()
        assert all(a["campaign_type"] == "affiliate" for a in ads)
        assert STATE["affiliate_campaign_id"] in {a["id"] for a in ads}
        assert STATE["ad_id"] not in {a["id"] for a in ads}

    def test_targeting_excludes_non_matching_city(self, customer_hdr):
        # Move customer to جدة and re-check regular ad hidden
        rp = requests.put(f"{API}/profile", headers=customer_hdr,
                          json={"city": "جدة"}, timeout=10)
        assert rp.status_code == 200
        try:
            r = requests.get(f"{API}/marketing/ads/active", headers=customer_hdr, timeout=10)
            assert r.status_code == 200
            ids = {a["id"] for a in r.json()}
            assert STATE["ad_id"] not in ids, "Riyadh-targeted ad must not appear for جدة user"
        finally:
            # Restore
            requests.put(f"{API}/profile", headers=customer_hdr,
                         json={"city": "الرياض"}, timeout=10)

    def test_track_view_and_click(self, customer_hdr, merchant_hdr):
        aid = STATE["ad_id"]
        for _ in range(2):
            rv = requests.post(f"{API}/marketing/ads/{aid}/track?event=view",
                               headers=customer_hdr, timeout=10)
            assert rv.status_code == 200
        rc = requests.post(f"{API}/marketing/ads/{aid}/track?event=click",
                           headers=customer_hdr, timeout=10)
        assert rc.status_code == 200

        # Verify counters
        r = requests.get(f"{API}/merchant/marketing/ads", headers=merchant_hdr, timeout=10)
        assert r.status_code == 200
        ad = next(a for a in r.json() if a["id"] == aid)
        assert ad["views"] >= 2, f"views did not increment: {ad['views']}"
        assert ad["clicks"] >= 1, f"clicks did not increment: {ad['clicks']}"

    def test_track_invalid_event(self, customer_hdr):
        r = requests.post(f"{API}/marketing/ads/{STATE['ad_id']}/track?event=bogus",
                          headers=customer_hdr, timeout=10)
        assert r.status_code == 400


# ── Affiliate application ───────────────────────────────────────────────────
class TestAffiliateApplication:
    def test_apply(self, customer_hdr, merchant_id):
        payload = {
            "merchant_id": merchant_id,
            "campaign_id": STATE["affiliate_campaign_id"],
            "full_name": "TEST_ مسوق تجريبي",
            "social_handle": "@test_affiliate",
            "audience_size": 5000,
            "note": "خبرة في التسويق الرقمي",
        }
        r = requests.post(f"{API}/affiliate/apply", headers=customer_hdr, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        STATE["application_id"] = r.json()["id"]

    def test_duplicate_pending_blocked(self, customer_hdr, merchant_id):
        payload = {
            "merchant_id": merchant_id,
            "campaign_id": STATE["affiliate_campaign_id"],
            "full_name": "TEST_ مسوق تجريبي",
        }
        r = requests.post(f"{API}/affiliate/apply", headers=customer_hdr, json=payload, timeout=10)
        assert r.status_code == 400

    def test_merchant_sees_application_with_customer_info(self, merchant_hdr):
        r = requests.get(f"{API}/merchant/affiliate/applications", headers=merchant_hdr, timeout=10)
        assert r.status_code == 200
        apps = r.json()
        app_row = next((a for a in apps if a["id"] == STATE["application_id"]), None)
        assert app_row is not None, "new application not visible to merchant"
        assert app_row["status"] == "pending"
        # Auto-included from user account
        assert app_row["applicant_phone"] == CUSTOMER_PHONE, f"phone missing: {app_row}"
        assert app_row.get("applicant_city") == "الرياض"
        assert app_row["social_handle"] == "@test_affiliate"
        assert app_row["audience_size"] == 5000


# ── Approve + downstream ────────────────────────────────────────────────────
class TestApproval:
    def test_approve_returns_code_and_commission(self, merchant_hdr):
        r = requests.post(
            f"{API}/merchant/affiliate/applications/{STATE['application_id']}/approve",
            headers=merchant_hdr, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "referral_code" in body
        assert len(body["referral_code"]) == 10, f"code should be 10 chars: {body['referral_code']}"
        assert float(body["commission_percent"]) == 10.0, "commission must come from campaign (10%)"
        STATE["referral_code"] = body["referral_code"]

    def test_approve_idempotent_returns_400(self, merchant_hdr):
        r = requests.post(
            f"{API}/merchant/affiliate/applications/{STATE['application_id']}/approve",
            headers=merchant_hdr, timeout=10,
        )
        assert r.status_code == 400

    def test_application_status_now_approved(self, merchant_hdr):
        r = requests.get(f"{API}/merchant/affiliate/applications", headers=merchant_hdr, timeout=10)
        app_row = next(a for a in r.json() if a["id"] == STATE["application_id"])
        assert app_row["status"] == "approved"
        assert app_row.get("referral_code") == STATE["referral_code"]


# ── Customer dashboard ──────────────────────────────────────────────────────
class TestCustomerDashboard:
    def test_dashboard_returns_account(self, customer_hdr):
        r = requests.get(f"{API}/affiliate/dashboard", headers=customer_hdr, timeout=10)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert len(rows) >= 1
        row = next(a for a in rows if a["referral_code"] == STATE["referral_code"])
        for key in ("commission_percent", "referral_code", "total_earnings",
                    "total_clicks", "total_conversions", "unique_visitors",
                    "incentives", "this_month_earnings"):
            assert key in row, f"missing field: {key}"
        assert float(row["commission_percent"]) == 10.0
        assert "أفضل مسوق" in row["incentives"]

    def test_my_accounts_endpoint(self, customer_hdr):
        r = requests.get(f"{API}/affiliate/my", headers=customer_hdr, timeout=10)
        assert r.status_code == 200
        codes = {a["referral_code"] for a in r.json()}
        assert STATE["referral_code"] in codes

    def test_public_click_increments(self, customer_hdr):
        code = STATE["referral_code"]
        # Public — no auth
        r = requests.post(f"{API}/affiliate/{code}/click", timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # Verify counter went up
        r2 = requests.get(f"{API}/affiliate/dashboard", headers=customer_hdr, timeout=10)
        row = next(a for a in r2.json() if a["referral_code"] == code)
        assert row["total_clicks"] >= 1, f"click counter did not increment: {row}"

    def test_public_click_invalid_code(self):
        r = requests.post(f"{API}/affiliate/ZZZZZZZZZZ/click", timeout=10)
        assert r.status_code == 404


# ── Cleanup ─────────────────────────────────────────────────────────────────
@pytest.fixture(scope="module", autouse=True)
def _cleanup(merchant_hdr):
    yield
    # Delete created ads
    for k in ("ad_id", "affiliate_campaign_id"):
        aid = STATE.get(k)
        if aid:
            try:
                requests.delete(f"{API}/merchant/marketing/ads/{aid}", headers=merchant_hdr, timeout=10)
            except Exception:
                pass
