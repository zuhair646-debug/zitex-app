"""
Tests for the upgraded Merchant Competition creation flow.
Covers: POST /api/merchant/competitions with new fields (cover_image, prize_image,
options), GET listing & public detail, and the customer answer flow (POST
/api/competitions/{id}/answer for competition_type='qa').
"""

import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://mobile-builder-146.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

MERCHANT = {"phone": "0509999999", "password": "merchant2025"}
CUSTOMER = {"phone": "0500000000", "password": "test1234"}


def _login(session: requests.Session, creds: dict) -> str:
    r = session.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed for {creds['phone']}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def merchant_token():
    s = requests.Session()
    return _login(s, MERCHANT)


@pytest.fixture(scope="module")
def customer_token():
    s = requests.Session()
    return _login(s, CUSTOMER)


@pytest.fixture(scope="module")
def created_competition(merchant_token):
    """Creates a QA competition with the new upgraded fields and returns its id + payload."""
    payload = {
        "title": "TEST_QA_Comp_Upgraded",
        "description": "Test upgraded competition",
        "prize": "iPhone 16 Pro",
        "prize_count": 1,
        "competition_type": "qa",
        "question": "ما عاصمة المملكة العربية السعودية؟",
        "correct_answer": "الرياض",
        "options": ["الرياض", "جدة", "مكة", "الدمام"],
        "spend_requirement": 0,
        "purchase_mode": "single",
        "max_submissions_per_user": 1,
        "ugc_hashtag": "",
        "start_date": "",
        "end_date": "2026-08-30",
        "draw_date": "2026-09-01",
        "max_participants": 1000,
        "chamber_supervised": False,
        "permit_number": "",
        "assigned_chamber_employee_id": "",
        "cover_image": "test/cover.jpg",
        "prize_image": "test/prize.jpg",
    }
    r = requests.post(
        f"{BASE_URL}/api/merchant/competitions",
        headers={"Authorization": f"Bearer {merchant_token}", "Content-Type": "application/json"},
        json=payload,
        timeout=20,
    )
    assert r.status_code == 200, f"POST create failed: {r.status_code} {r.text}"
    body = r.json()
    assert "id" in body and isinstance(body["id"], str) and len(body["id"]) > 0
    yield {"id": body["id"], "payload": payload}
    # cleanup
    requests.delete(
        f"{BASE_URL}/api/merchant/competitions/{body['id']}",
        headers={"Authorization": f"Bearer {merchant_token}"},
        timeout=15,
    )


# ─── Create + persistence ────────────────────────────────────────────────
class TestCreateCompetitionUpgraded:
    def test_create_returns_id(self, created_competition):
        assert created_competition["id"]

    def test_persists_all_new_fields_via_merchant_list(self, merchant_token, created_competition):
        r = requests.get(
            f"{BASE_URL}/api/merchant/competitions",
            headers={"Authorization": f"Bearer {merchant_token}"},
            timeout=20,
        )
        assert r.status_code == 200
        rows = r.json()
        found = next((c for c in rows if c.get("id") == created_competition["id"]), None)
        assert found, f"Created comp {created_competition['id']} not in merchant list"
        assert found["title"] == "TEST_QA_Comp_Upgraded"
        assert found["competition_type"] == "qa"
        assert found["correct_answer"] == "الرياض"
        assert found["options"] == ["الرياض", "جدة", "مكة", "الدمام"]
        assert found["cover_image"] == "test/cover.jpg"
        assert found["prize_image"] == "test/prize.jpg"

    def test_public_get_returns_new_fields(self, created_competition):
        r = requests.get(f"{BASE_URL}/api/competitions/{created_competition['id']}", timeout=20)
        assert r.status_code == 200, r.text
        comp = r.json()
        assert comp["competition_type"] == "qa"
        assert comp["options"] == ["الرياض", "جدة", "مكة", "الدمام"]
        assert comp["correct_answer"] == "الرياض"
        assert comp["cover_image"] == "test/cover.jpg"
        assert comp["prize_image"] == "test/prize.jpg"


# ─── Customer answer flow ────────────────────────────────────────────────
class TestCustomerAnswerFlow:
    def test_correct_answer_enters_draw(self, customer_token, created_competition):
        """POST /api/competitions/{id}/answer with the correct option should mark
        the customer as entered. If backend has a duplicate route bug and hits the
        legacy /questions endpoint instead, this will fail with unexpected shape.
        """
        r = requests.post(
            f"{BASE_URL}/api/competitions/{created_competition['id']}/answer",
            headers={
                "Authorization": f"Bearer {customer_token}",
                "Content-Type": "application/json",
            },
            json={"answer": "الرياض"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # NEW QA endpoint shape:  {"correct": bool, "entered": bool}
        # LEGACY endpoint shape:  {"score": ..., "correct": int, "total": ..., "passed": bool}
        assert "correct" in body
        # If legacy path is hit, `correct` will be an int (0) since payload had no "answers" array
        assert isinstance(body["correct"], bool), (
            f"Duplicate route detected — response shape mismatches new QA endpoint: {body}"
        )
        assert body["correct"] is True, f"Correct answer not accepted: {body}"
        assert body.get("entered") is True, f"Customer not entered on correct answer: {body}"

    def test_wrong_answer_rejected(self, customer_token, created_competition):
        r = requests.post(
            f"{BASE_URL}/api/competitions/{created_competition['id']}/answer",
            headers={
                "Authorization": f"Bearer {customer_token}",
                "Content-Type": "application/json",
            },
            json={"answer": "الدمام"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body.get("correct"), bool), (
            f"Duplicate route detected — response shape mismatches new QA endpoint: {body}"
        )
        assert body["correct"] is False

    def test_participant_registered_after_correct(self, merchant_token, created_competition):
        r = requests.get(
            f"{BASE_URL}/api/competitions/{created_competition['id']}/participants",
            timeout=20,
        )
        assert r.status_code == 200
        participants = r.json()
        assert any(p.get("user_phone") == CUSTOMER["phone"] for p in participants), (
            f"Customer not in participants after correct answer: {participants}"
        )


# ─── Validation errors ───────────────────────────────────────────────────
class TestValidation:
    def test_missing_title_rejected(self, merchant_token):
        payload = {"prize": "X", "competition_type": "general"}
        r = requests.post(
            f"{BASE_URL}/api/merchant/competitions",
            headers={"Authorization": f"Bearer {merchant_token}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        assert r.status_code in (400, 422), f"Missing title should fail; got {r.status_code} {r.text}"

    def test_missing_prize_rejected(self, merchant_token):
        payload = {"title": "TEST_no_prize", "competition_type": "general"}
        r = requests.post(
            f"{BASE_URL}/api/merchant/competitions",
            headers={"Authorization": f"Bearer {merchant_token}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        assert r.status_code in (400, 422), f"Missing prize should fail; got {r.status_code} {r.text}"

    def test_qa_without_correct_answer_backend_behaviour(self, merchant_token):
        """Backend does NOT currently validate that qa comps have a correct_answer
        (frontend does). This test documents the current behaviour — the backend
        happily creates the record. Frontend validation prevents this in practice.
        """
        payload = {
            "title": "TEST_qa_no_answer",
            "prize": "X",
            "competition_type": "qa",
            "question": "Q?",
            "correct_answer": "",
            "options": ["a", "b"],
        }
        r = requests.post(
            f"{BASE_URL}/api/merchant/competitions",
            headers={"Authorization": f"Bearer {merchant_token}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        # Backend now validates qa competitions: must have correct_answer.
        assert r.status_code == 422, r.text


# ─── Auth guards ─────────────────────────────────────────────────────────
class TestAuthGuards:
    def test_create_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/merchant/competitions",
            json={"title": "x", "prize": "y"},
            timeout=15,
        )
        assert r.status_code in (401, 403), r.text

    def test_create_requires_merchant_role(self, customer_token):
        r = requests.post(
            f"{BASE_URL}/api/merchant/competitions",
            headers={"Authorization": f"Bearer {customer_token}", "Content-Type": "application/json"},
            json={"title": "x", "prize": "y"},
            timeout=15,
        )
        assert r.status_code in (401, 403), r.text
