"""
Phase 4 — Merchant competitions management:
edit (PUT), safe draw (409 on 2nd), winners prize_status, claim by winner,
mark delivered, notifications, QA answer by option index.
All data is TEST_ prefixed and removed (comps, entries, notifications) at the end.
"""
import os
import pytest
import requests
from pymongo import MongoClient
from bson import ObjectId

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = ln.split("=", 1)[1].strip()
assert BASE_URL
BASE_URL = BASE_URL.rstrip("/")


def _env(key):
    with open("/app/backend/.env") as f:
        for ln in f:
            if ln.startswith(key + "="):
                return ln.split("=", 1)[1].strip().strip('"')


MERCHANT = {"phone": "0509999999", "password": "merchant2025"}
CUSTOMER = {"phone": "0500000000", "password": "test1234"}
CREATED = []


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    d = r.json()
    return {"Authorization": f"Bearer {d['token']}"}, d["user"]


@pytest.fixture(scope="module")
def m():
    return _login(MERCHANT)


@pytest.fixture(scope="module")
def c():
    return _login(CUSTOMER)


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    db = MongoClient(_env("MONGO_URL"))[_env("DB_NAME")]
    for cid in CREATED:
        db.competitions.delete_one({"_id": ObjectId(cid)})
        db.competition_entries.delete_many({"competition_id": cid})
        db.notifications.delete_many({"data.competition_id": cid})


def _create(m, **kw):
    body = {"title": "TEST_P4 comp", "prize": "TEST prize", "prize_count": 1, "competition_type": "general"}
    body.update(kw)
    r = requests.post(f"{BASE_URL}/api/merchant/competitions", json=body, headers=m[0], timeout=30)
    assert r.status_code == 200, r.text
    CREATED.append(r.json()["id"])
    return r.json()["id"]


@pytest.fixture(scope="module")
def general_comp(m):
    return _create(m)


# ── Edit (PUT) ──
class TestEdit:
    def test_put_invalid_id_404(self, m):
        r = requests.put(f"{BASE_URL}/api/merchant/competitions/notanid", json={"title": "x", "prize": "y"}, headers=m[0])
        assert r.status_code == 404

    def test_put_nonexistent_404(self, m):
        r = requests.put(f"{BASE_URL}/api/merchant/competitions/{ObjectId()}", json={"title": "x", "prize": "y"}, headers=m[0])
        assert r.status_code == 404

    def test_put_qa_validation_422(self, m, general_comp):
        r = requests.put(f"{BASE_URL}/api/merchant/competitions/{general_comp}",
                         json={"title": "x", "prize": "y", "competition_type": "qa", "options": ["A"], "correct_answer": "A"}, headers=m[0])
        assert r.status_code == 422
        r = requests.put(f"{BASE_URL}/api/merchant/competitions/{general_comp}",
                         json={"title": "x", "prize": "y", "competition_type": "qa", "options": ["A", "B"], "correct_answer": "Z"}, headers=m[0])
        assert r.status_code == 422

    def test_put_customer_forbidden(self, c, general_comp):
        r = requests.put(f"{BASE_URL}/api/merchant/competitions/{general_comp}", json={"title": "x", "prize": "y"}, headers=c[0])
        assert r.status_code in (401, 403)

    def test_put_success_persists(self, m, general_comp):
        r = requests.put(f"{BASE_URL}/api/merchant/competitions/{general_comp}",
                         json={"title": "TEST_P4 edited", "prize": "TEST prize 2", "prize_count": 1}, headers=m[0])
        assert r.status_code == 200
        g = requests.get(f"{BASE_URL}/api/competitions/{general_comp}").json()
        assert g["title"] == "TEST_P4 edited" and g["prize"] == "TEST prize 2"
        assert g["status"] == "open"


# ── Draw / Claim / Deliver ──
class TestDrawClaimDeliver:
    def test_draw_no_participants_400(self, m):
        cid = _create(m, title="TEST_P4 empty")
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/draw", headers=m[0])
        assert r.status_code == 400

    def test_customer_join(self, c, general_comp):
        r = requests.post(f"{BASE_URL}/api/competitions/{general_comp}/join", headers=c[0])
        assert r.status_code == 200
        assert requests.get(f"{BASE_URL}/api/competitions/{general_comp}").json()["joined_count"] == 1

    def test_customer_cannot_draw(self, c, general_comp):
        r = requests.post(f"{BASE_URL}/api/competitions/{general_comp}/draw", headers=c[0])
        assert r.status_code == 403

    def test_claim_before_draw_403(self, c, general_comp):
        r = requests.post(f"{BASE_URL}/api/competitions/{general_comp}/claim", json={"method": "pickup"}, headers=c[0])
        assert r.status_code == 403

    def test_draw_winners_pending(self, m, c, general_comp):
        r = requests.post(f"{BASE_URL}/api/competitions/{general_comp}/draw", headers=m[0])
        assert r.status_code == 200, r.text
        w = r.json()["winners"]
        assert len(w) == 1 and w[0]["user_id"] == c[1]["id"] and w[0]["prize_status"] == "pending"
        g = requests.get(f"{BASE_URL}/api/competitions/{general_comp}").json()
        assert g["status"] == "ended" and g["winners"][0]["prize_status"] == "pending"

    def test_second_draw_409(self, m, general_comp):
        r = requests.post(f"{BASE_URL}/api/competitions/{general_comp}/draw", headers=m[0])
        assert r.status_code == 409

    def test_winner_notification(self, c, general_comp):
        n = requests.get(f"{BASE_URL}/api/notifications", headers=c[0]).json()
        items = n if isinstance(n, list) else n.get("notifications", n.get("items", []))
        hit = [x for x in items if (x.get("data") or {}).get("competition_id") == general_comp]
        assert any(x["title"] == "🏆 مبروك! فزت في المسابقة" for x in hit), hit

    def test_non_winner_claim_403(self, m, general_comp):
        r = requests.post(f"{BASE_URL}/api/competitions/{general_comp}/claim", json={"method": "pickup"}, headers=m[0])
        assert r.status_code == 403

    def test_delivery_without_address_400(self, c, general_comp):
        r = requests.post(f"{BASE_URL}/api/competitions/{general_comp}/claim", json={"method": "delivery", "address": "  "}, headers=c[0])
        assert r.status_code == 400

    def test_claim_pickup(self, c, general_comp):
        r = requests.post(f"{BASE_URL}/api/competitions/{general_comp}/claim", json={"method": "pickup"}, headers=c[0])
        assert r.status_code == 200 and r.json()["prize_status"] == "claimed"
        w = requests.get(f"{BASE_URL}/api/competitions/{general_comp}").json()["winners"][0]
        assert w["prize_status"] == "claimed" and w["claim_method"] == "pickup" and w.get("claimed_at")

    def test_claim_repeat_409(self, c, general_comp):
        r = requests.post(f"{BASE_URL}/api/competitions/{general_comp}/claim", json={"method": "pickup"}, headers=c[0])
        assert r.status_code == 409

    def test_merchant_claim_notification(self, m, general_comp):
        n = requests.get(f"{BASE_URL}/api/notifications", headers=m[0]).json()
        items = n if isinstance(n, list) else n.get("notifications", n.get("items", []))
        assert any(x["title"] == "🎁 طلب استلام جائزة" and (x.get("data") or {}).get("competition_id") == general_comp for x in items)

    def test_delivered_unknown_winner_404(self, m, general_comp):
        r = requests.post(f"{BASE_URL}/api/merchant/competitions/{general_comp}/winners/nobody/delivered", headers=m[0])
        assert r.status_code == 404

    def test_delivered_by_customer_forbidden(self, c, general_comp):
        r = requests.post(f"{BASE_URL}/api/merchant/competitions/{general_comp}/winners/{c[1]['id']}/delivered", headers=c[0])
        assert r.status_code in (401, 403)

    def test_mark_delivered(self, m, c, general_comp):
        r = requests.post(f"{BASE_URL}/api/merchant/competitions/{general_comp}/winners/{c[1]['id']}/delivered", headers=m[0])
        assert r.status_code == 200 and r.json()["prize_status"] == "delivered"
        w = requests.get(f"{BASE_URL}/api/competitions/{general_comp}").json()["winners"][0]
        assert w["prize_status"] == "delivered" and w.get("delivered_at")
        n = requests.get(f"{BASE_URL}/api/notifications", headers=c[0]).json()
        items = n if isinstance(n, list) else n.get("notifications", n.get("items", []))
        assert any(x["title"] == "✅ تم تسليم جائزتك" and (x.get("data") or {}).get("competition_id") == general_comp for x in items)


# ── QA answer by option index ──
class TestQAAnswer:
    def test_qa_answer_index(self, m, c):
        cid = _create(m, title="TEST_P4 qa", competition_type="qa", question="2+2?", options=["3", "4", "5"], correct_answer="4")
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/answer", json={"answers": [0]}, headers=c[0])
        assert r.status_code == 200 and r.json()["passed"] is False and r.json()["score"] == 0
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/answer", json={"answers": [1]}, headers=c[0])
        assert r.status_code == 200 and r.json()["passed"] is True and r.json()["score"] == 100
        assert requests.get(f"{BASE_URL}/api/competitions/{cid}").json()["joined_count"] == 1
        # answering correct again doesn't double count
        requests.post(f"{BASE_URL}/api/competitions/{cid}/answer", json={"answers": [1]}, headers=c[0])
        assert requests.get(f"{BASE_URL}/api/competitions/{cid}").json()["joined_count"] == 1

    def test_qa_answer_out_of_range(self, m, c):
        cid = _create(m, title="TEST_P4 qa2", competition_type="qa", question="q", options=["a", "b"], correct_answer="a")
        r = requests.post(f"{BASE_URL}/api/competitions/{cid}/answer", json={"answers": [9]}, headers=c[0])
        assert r.status_code == 200 and r.json()["passed"] is False
