"""
Chamber of Commerce Competition Control Room Tests
Tests: Chamber login, chamber endpoints with auth, draw functionality, access control
"""
import pytest
import requests
import os

# Load from frontend .env if not in environment
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
if not BASE_URL:
    from pathlib import Path
    env_file = Path('/app/frontend/.env')
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip()
                break
BASE_URL = BASE_URL.rstrip('/') if BASE_URL else 'http://localhost:8001'

class TestChamberAuth:
    """Chamber authentication tests"""

    def test_chamber_login_returns_chamber_role(self):
        """Chamber account login should return user with role='chamber'"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0550000000",
            "password": "chamber2025"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["role"] == "chamber", f"Expected role='chamber', got {data['user']['role']}"
        assert data["user"]["name"] == "Chamber of Commerce", f"Expected name='Chamber of Commerce', got {data['user']['name']}"
        assert data["user"]["phone"] == "0550000000", f"Expected phone='0550000000', got {data['user']['phone']}"

    def test_regular_user_login_returns_user_role(self):
        """Regular user login should return user with role='user'"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user" in data, "Response should contain user"
        assert data["user"]["role"] == "user", f"Expected role='user', got {data['user']['role']}"


class TestChamberEndpoints:
    """Chamber-only endpoints tests"""

    @pytest.fixture(scope="class")
    def chamber_token(self):
        """Get chamber account token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0550000000",
            "password": "chamber2025"
        })
        assert response.status_code == 200
        return response.json()["token"]

    @pytest.fixture(scope="class")
    def regular_token(self):
        """Get regular user token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        assert response.status_code == 200
        return response.json()["token"]

    def test_chamber_get_competitions_with_participant_counts(self, chamber_token):
        """GET /api/chamber/competitions should return competitions with total_participants"""
        response = requests.get(
            f"{BASE_URL}/api/chamber/competitions",
            headers={"Authorization": f"Bearer {chamber_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) >= 3, f"Expected at least 3 competitions, got {len(data)}"
        
        # Check first competition has required fields
        comp = data[0]
        assert "id" in comp, "Competition should have id"
        assert "title" in comp, "Competition should have title"
        assert "total_participants" in comp, "Competition should have total_participants count"
        assert isinstance(comp["total_participants"], int), "total_participants should be integer"
        assert "status" in comp, "Competition should have status"
        assert "prize_count" in comp, "Competition should have prize_count"

    def test_chamber_get_competition_full_detail(self, chamber_token):
        """GET /api/chamber/competitions/{id}/full should return full detail with participants list"""
        # First get competitions list
        list_response = requests.get(
            f"{BASE_URL}/api/chamber/competitions",
            headers={"Authorization": f"Bearer {chamber_token}"}
        )
        assert list_response.status_code == 200
        comps = list_response.json()
        assert len(comps) > 0, "Should have at least one competition"
        
        comp_id = comps[0]["id"]
        
        # Get full detail
        response = requests.get(
            f"{BASE_URL}/api/chamber/competitions/{comp_id}/full",
            headers={"Authorization": f"Bearer {chamber_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Should have id"
        assert "title" in data, "Should have title"
        assert "participants" in data, "Should have participants list"
        assert isinstance(data["participants"], list), "participants should be a list"
        
        # Check participant structure if any exist
        if len(data["participants"]) > 0:
            p = data["participants"][0]
            assert "user_name" in p, "Participant should have user_name"
            assert "user_phone" in p, "Participant should have user_phone"
            assert "joined_at" in p, "Participant should have joined_at"

    def test_chamber_perform_draw_records_drawn_by(self, chamber_token):
        """POST /api/chamber/competitions/{id}/draw should perform draw and record drawn_by name and role"""
        # Get competitions list
        list_response = requests.get(
            f"{BASE_URL}/api/chamber/competitions",
            headers={"Authorization": f"Bearer {chamber_token}"}
        )
        assert list_response.status_code == 200
        comps = list_response.json()
        
        # Find a competition with participants
        comp_with_participants = None
        for c in comps:
            if c.get("total_participants", 0) > 0:
                comp_with_participants = c
                break
        
        if not comp_with_participants:
            pytest.skip("No competition with participants found for draw test")
        
        comp_id = comp_with_participants["id"]
        
        # Perform draw
        response = requests.post(
            f"{BASE_URL}/api/chamber/competitions/{comp_id}/draw",
            headers={"Authorization": f"Bearer {chamber_token}"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "winners" in data, "Response should contain winners"
        assert "draw_number" in data, "Response should contain draw_number"
        assert "drawn_by" in data, "Response should contain drawn_by"
        assert data["drawn_by"] == "Chamber of Commerce", f"Expected drawn_by='Chamber of Commerce', got {data['drawn_by']}"
        assert isinstance(data["winners"], list), "winners should be a list"
        assert len(data["winners"]) > 0, "Should have at least one winner"
        
        # Verify draw was recorded in competition
        full_response = requests.get(
            f"{BASE_URL}/api/chamber/competitions/{comp_id}/full",
            headers={"Authorization": f"Bearer {chamber_token}"}
        )
        assert full_response.status_code == 200
        full_data = full_response.json()
        
        assert "draw_history" in full_data, "Competition should have draw_history"
        assert len(full_data["draw_history"]) > 0, "draw_history should not be empty"
        
        # Check last draw record
        last_draw = full_data["draw_history"][-1]
        assert "drawn_by" in last_draw, "Draw record should have drawn_by"
        assert "drawn_by_role" in last_draw, "Draw record should have drawn_by_role"
        assert last_draw["drawn_by"] == "Chamber of Commerce", f"Expected drawn_by='Chamber of Commerce', got {last_draw['drawn_by']}"
        assert last_draw["drawn_by_role"] == "chamber", f"Expected drawn_by_role='chamber', got {last_draw['drawn_by_role']}"
        assert "draw_number" in last_draw, "Draw record should have draw_number"
        assert "winners" in last_draw, "Draw record should have winners"

    def test_regular_user_cannot_access_chamber_competitions(self, regular_token):
        """Regular user should get 403 when accessing /api/chamber/competitions"""
        response = requests.get(
            f"{BASE_URL}/api/chamber/competitions",
            headers={"Authorization": f"Bearer {regular_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Error response should have detail"
        assert "Chamber access only" in data["detail"], f"Expected 'Chamber access only' in error, got {data['detail']}"

    def test_regular_user_cannot_access_chamber_competition_full(self, regular_token):
        """Regular user should get 403 when accessing /api/chamber/competitions/{id}/full"""
        # Use a dummy ID
        response = requests.get(
            f"{BASE_URL}/api/chamber/competitions/507f1f77bcf86cd799439011/full",
            headers={"Authorization": f"Bearer {regular_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"

    def test_regular_user_cannot_perform_chamber_draw(self, regular_token):
        """Regular user should get 403 when trying to perform chamber draw"""
        response = requests.post(
            f"{BASE_URL}/api/chamber/competitions/507f1f77bcf86cd799439011/draw",
            headers={"Authorization": f"Bearer {regular_token}"}
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"

    def test_unauthenticated_cannot_access_chamber_endpoints(self):
        """Unauthenticated requests should get 401"""
        response = requests.get(f"{BASE_URL}/api/chamber/competitions")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"


class TestChamberDrawHistory:
    """Test draw history functionality"""

    @pytest.fixture(scope="class")
    def chamber_token(self):
        """Get chamber account token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0550000000",
            "password": "chamber2025"
        })
        assert response.status_code == 200
        return response.json()["token"]

    def test_multiple_draws_increment_draw_number(self, chamber_token):
        """Multiple draws should increment draw_number correctly"""
        # Get competitions list
        list_response = requests.get(
            f"{BASE_URL}/api/chamber/competitions",
            headers={"Authorization": f"Bearer {chamber_token}"}
        )
        assert list_response.status_code == 200
        comps = list_response.json()
        
        # Find a competition with participants
        comp_with_participants = None
        for c in comps:
            if c.get("total_participants", 0) > 0:
                comp_with_participants = c
                break
        
        if not comp_with_participants:
            pytest.skip("No competition with participants found for draw test")
        
        comp_id = comp_with_participants["id"]
        
        # Get current draw count
        full_response = requests.get(
            f"{BASE_URL}/api/chamber/competitions/{comp_id}/full",
            headers={"Authorization": f"Bearer {chamber_token}"}
        )
        assert full_response.status_code == 200
        initial_draw_count = len(full_response.json().get("draw_history", []))
        
        # Perform another draw
        draw_response = requests.post(
            f"{BASE_URL}/api/chamber/competitions/{comp_id}/draw",
            headers={"Authorization": f"Bearer {chamber_token}"}
        )
        assert draw_response.status_code == 200
        
        draw_data = draw_response.json()
        expected_draw_number = initial_draw_count + 1
        assert draw_data["draw_number"] == expected_draw_number, f"Expected draw_number={expected_draw_number}, got {draw_data['draw_number']}"
        
        # Verify in full detail
        verify_response = requests.get(
            f"{BASE_URL}/api/chamber/competitions/{comp_id}/full",
            headers={"Authorization": f"Bearer {chamber_token}"}
        )
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        
        assert len(verify_data["draw_history"]) == expected_draw_number, f"Expected {expected_draw_number} draws in history, got {len(verify_data['draw_history'])}"
