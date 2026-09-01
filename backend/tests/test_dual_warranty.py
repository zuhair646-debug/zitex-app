"""
Zitex v1.4.2 — Tests for Dual Warranty products + Demo Seed verification.
Covers:
  - ProductInput extended fields (warranty_type / shop_warranty_* / manufacturer_* / colors)
  - Backward compat: existing products without warranty_type/colors still work
  - Demo seed: iPhone 16 Pro Max (both warranties + 4 colors), iPhone 13 (shop only)
  - Services demo: 3 services + 4 bookings (pending/received/in_progress/completed)
  - Videos + reviews + public experiences + notification
"""
import os
import pytest
import requests
from pathlib import Path

# Read BASE_URL from frontend .env (single source of truth for public URL)
BASE_URL = ""
_env = Path("/app/frontend/.env")
if _env.exists():
    for line in _env.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL missing in /app/frontend/.env")


# ─── Shared fixtures ─────────────────────────────────────────────
@pytest.fixture(scope="module")
def merchant_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"phone": "0509999999", "password": "merchant2025"})
    assert r.status_code == 200, f"merchant login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def customer_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"phone": "0500000000", "password": "test1234"})
    assert r.status_code == 200, f"customer login failed: {r.text}"
    return r.json()["token"]


def _merchant_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ─── Product created via merchant CRUD (created + cleanup) ─────────
_CREATED_PIDS = []


def _create_product(token, payload):
    r = requests.post(f"{BASE_URL}/api/merchant/products",
                      headers=_merchant_headers(token), json=payload)
    assert r.status_code == 200, f"create product failed: {r.status_code} {r.text}"
    pid = r.json()["id"]
    _CREATED_PIDS.append(pid)
    return pid


@pytest.fixture(scope="module", autouse=True)
def _cleanup(merchant_token):
    yield
    for pid in _CREATED_PIDS:
        try:
            requests.delete(f"{BASE_URL}/api/merchant/products/{pid}",
                            headers=_merchant_headers(merchant_token))
        except Exception:
            pass


# ══════════════════════════════════════════════════════════════════
# 1. Dual warranty product CRUD  (warranty_type = "both")
# ══════════════════════════════════════════════════════════════════
class TestDualWarrantyBoth:
    def test_create_product_with_both_warranties(self, merchant_token):
        payload = {
            "name_ar": "TEST_ZTX_iPhone_Both",
            "name_en": "TEST_ZTX_iPhone_Both",
            "price": 4999,
            "warranty_type": "both",
            "shop_warranty_days": 30,
            "shop_warranty_terms": "ضمان استبدال محل 30 يوم",
            "manufacturer_name": "Apple",
            "manufacturer_days": 365,
            "manufacturer_url": "https://support.apple.com",
            "manufacturer_phone": "8008500700",
            "manufacturer_terms": "ضمان مصنع سنة",
            "colors": [
                {"name": "أسود", "hex": "#000"},
                {"name": "ذهبي", "hex": "#D4A017"},
            ],
        }
        pid = _create_product(merchant_token, payload)

        # verify persistence via public GET
        r = requests.get(f"{BASE_URL}/api/products/{pid}")
        assert r.status_code == 200
        doc = r.json()
        assert doc["warranty_type"] == "both"
        assert doc["shop_warranty_days"] == 30
        assert doc["shop_warranty_terms"] == "ضمان استبدال محل 30 يوم"
        assert doc["manufacturer_name"] == "Apple"
        assert doc["manufacturer_days"] == 365
        assert doc["manufacturer_url"].startswith("https://")
        assert doc["manufacturer_phone"] == "8008500700"
        assert doc["manufacturer_terms"] == "ضمان مصنع سنة"
        assert isinstance(doc["colors"], list) and len(doc["colors"]) == 2
        assert {c["name"] for c in doc["colors"]} == {"أسود", "ذهبي"}
        assert doc["colors"][0]["hex"] == "#000"
        assert "_id" not in doc


# ══════════════════════════════════════════════════════════════════
# 2. warranty_type = "shop" only — manufacturer fields default empty
# ══════════════════════════════════════════════════════════════════
class TestShopOnlyWarranty:
    def test_create_shop_only_defaults_manufacturer(self, merchant_token):
        payload = {
            "name_ar": "TEST_ZTX_ShopOnly",
            "name_en": "TEST_ZTX_ShopOnly",
            "price": 1499,
            "warranty_type": "shop",
            "shop_warranty_days": 90,
            "shop_warranty_terms": "ضمان محل ٩٠ يوم",
        }
        pid = _create_product(merchant_token, payload)
        doc = requests.get(f"{BASE_URL}/api/products/{pid}").json()
        assert doc["warranty_type"] == "shop"
        assert doc["shop_warranty_days"] == 90
        # manufacturer fields default to empty/0
        assert doc["manufacturer_name"] == ""
        assert doc["manufacturer_days"] == 0
        assert doc["manufacturer_url"] == ""
        assert doc["manufacturer_phone"] == ""
        assert doc["manufacturer_terms"] == ""
        assert doc["colors"] == []


# ══════════════════════════════════════════════════════════════════
# 3. warranty_type = "none" — save succeeds with no warranty fields
# ══════════════════════════════════════════════════════════════════
class TestNoWarranty:
    def test_create_no_warranty(self, merchant_token):
        payload = {
            "name_ar": "TEST_ZTX_NoWarranty",
            "price": 299,
            "warranty_type": "none",
        }
        pid = _create_product(merchant_token, payload)
        doc = requests.get(f"{BASE_URL}/api/products/{pid}").json()
        assert doc["warranty_type"] == "none"
        assert doc["shop_warranty_days"] == 0
        assert doc["manufacturer_days"] == 0


# ══════════════════════════════════════════════════════════════════
# 4. Backward compatibility — POST without warranty_type / colors
# ══════════════════════════════════════════════════════════════════
class TestBackwardCompat:
    def test_omit_warranty_and_colors(self, merchant_token):
        payload = {"name_ar": "TEST_ZTX_Legacy", "price": 199}
        pid = _create_product(merchant_token, payload)
        doc = requests.get(f"{BASE_URL}/api/products/{pid}").json()
        assert doc["warranty_type"] == "none"  # default
        assert doc["colors"] == []              # default
        assert doc["shop_warranty_days"] == 0
        assert doc["manufacturer_name"] == ""


# ══════════════════════════════════════════════════════════════════
# 5. Demo seed verification (read-only — data already populated)
# ══════════════════════════════════════════════════════════════════
class TestDemoSeed:
    """Verify /app/backend/seed_demo_services.py output is queryable via public API."""

    # ---- iPhone 16 Pro Max product ----
    def test_iphone_16_pro_max_dual_warranty(self):
        r = requests.get(f"{BASE_URL}/api/products", params={"search": "iPhone 16 Pro Max"})
        assert r.status_code == 200, r.text
        products = r.json()["products"]
        assert any(p["name_ar"] == "iPhone 16 Pro Max" for p in products), \
            "iPhone 16 Pro Max not found in seeded products"
        p = next(p for p in products if p["name_ar"] == "iPhone 16 Pro Max")
        assert p["warranty_type"] == "both"
        assert p["manufacturer_url"].startswith("https://")
        assert p["manufacturer_name"] == "Apple"
        assert p["manufacturer_days"] == 365
        assert p["shop_warranty_days"] == 30
        assert isinstance(p["colors"], list)
        assert len(p["colors"]) == 4, f"expected 4 colors, got {len(p['colors'])}"
        color_names = {c["name"] for c in p["colors"]}
        assert "تيتانيوم طبيعي" in color_names
        assert "تيتانيوم أبيض" in color_names

    def test_iphone_13_used_shop_only(self):
        r = requests.get(f"{BASE_URL}/api/products", params={"search": "iPhone 13"})
        assert r.status_code == 200
        products = r.json()["products"]
        p = next((p for p in products if p.get("sku") == "IP13U-256"), None)
        assert p is not None, "iPhone 13 used (SKU IP13U-256) not found"
        assert p["warranty_type"] == "shop"
        assert p["shop_warranty_days"] == 90
        assert p["manufacturer_name"] == ""
        assert p["manufacturer_days"] == 0
        assert len(p["colors"]) == 3

    # ---- Services (3 demo services with warranty_terms) ----
    def test_demo_services_present(self):
        r = requests.get(f"{BASE_URL}/api/services")
        assert r.status_code == 200
        svcs = r.json()
        names = [s.get("name") for s in svcs]
        for expected in ["تبديل شاشة آيفون", "تبديل بطارية أصلية", "إصلاح الأضرار من المياه"]:
            assert expected in names, f"missing demo service: {expected}"
        # each demo has warranty_terms non-empty
        for expected in ["تبديل شاشة آيفون", "تبديل بطارية أصلية", "إصلاح الأضرار من المياه"]:
            svc = next(s for s in svcs if s["name"] == expected)
            assert svc.get("warranty_terms", "").strip() != "", \
                f"warranty_terms empty for {expected}"

    # ---- 4 bookings for customer 0500000000 ----
    def test_customer_has_four_bookings(self, customer_token):
        r = requests.get(f"{BASE_URL}/api/services/bookings/my",
                         headers={"Authorization": f"Bearer {customer_token}"})
        assert r.status_code == 200, r.text
        bookings = r.json()
        demo_names = {"تبديل شاشة آيفون", "تبديل بطارية أصلية", "إصلاح الأضرار من المياه"}
        demo_bookings = [b for b in bookings if b.get("service_name") in demo_names]
        assert len(demo_bookings) >= 4, \
            f"expected >=4 demo bookings, got {len(demo_bookings)}"
        statuses = {b["status"] for b in demo_bookings}
        for expected in ("pending", "received", "in_progress", "completed"):
            assert expected in statuses, f"missing status {expected} in {statuses}"

    # ---- in_progress booking has 2 video updates with captions ----
    def test_in_progress_booking_has_two_updates(self, customer_token):
        headers = {"Authorization": f"Bearer {customer_token}"}
        bookings = requests.get(f"{BASE_URL}/api/services/bookings/my",
                                headers=headers).json()
        ip = next((b for b in bookings
                   if b["status"] == "in_progress"
                   and b.get("service_name") == "إصلاح الأضرار من المياه"), None)
        assert ip is not None, "no in_progress water-damage booking found"
        detail = requests.get(f"{BASE_URL}/api/services/bookings/{ip['id']}",
                              headers=headers).json()
        updates = detail.get("updates", [])
        assert len(updates) == 2, f"expected 2 updates, got {len(updates)}"
        for u in updates:
            assert u.get("video_url", "").startswith("demo/services/vid-water"), \
                f"unexpected video_url: {u.get('video_url')}"
            assert u.get("caption", "").strip() != ""
            assert "avg_rating" in u

    # ---- per-update reviews ----
    def test_update_reviews_five_stars(self, customer_token):
        headers = {"Authorization": f"Bearer {customer_token}"}
        bookings = requests.get(f"{BASE_URL}/api/services/bookings/my",
                                headers=headers).json()
        ip = next(b for b in bookings
                  if b["status"] == "in_progress"
                  and b.get("service_name") == "إصلاح الأضرار من المياه")
        detail = requests.get(f"{BASE_URL}/api/services/bookings/{ip['id']}",
                              headers=headers).json()
        first_uid = detail["updates"][0]["id"]
        r = requests.get(f"{BASE_URL}/api/services/updates/{first_uid}/reviews")
        assert r.status_code == 200
        reviews = r.json()
        assert len(reviews) >= 1
        assert any(rv["stars"] == 5 for rv in reviews), \
            "no 5-star review found on first update"

    # ---- public experiences on the completed service ----
    def test_completed_service_experiences(self, customer_token):
        # find completed booking -> get its service_id
        headers = {"Authorization": f"Bearer {customer_token}"}
        bookings = requests.get(f"{BASE_URL}/api/services/bookings/my",
                                headers=headers).json()
        comp = next(b for b in bookings
                    if b["status"] == "completed"
                    and b.get("service_name") == "تبديل شاشة آيفون")
        svc_id = comp["service_id"]
        r = requests.get(f"{BASE_URL}/api/services/{svc_id}/experiences")
        assert r.status_code == 200, r.text
        experiences = r.json()
        assert len(experiences) >= 1, "no public experiences for completed service"
        # the screen-repair video should be there
        vids = [e.get("video_url", "") for e in experiences]
        assert any("vid-screen" in v for v in vids), \
            f"screen-repair video not in experiences: {vids}"

    # ---- notification with data.type=service_update ----
    def test_service_update_notification(self, customer_token):
        r = requests.get(f"{BASE_URL}/api/notifications",
                         headers={"Authorization": f"Bearer {customer_token}"})
        assert r.status_code == 200
        notifs = r.json()
        svc_update = [n for n in notifs
                      if (n.get("data") or {}).get("type") == "service_update"]
        assert len(svc_update) >= 1, \
            "expected at least one notification with data.type=service_update"
        first = svc_update[0]
        assert first.get("data", {}).get("booking_id"), "notification missing booking_id"
