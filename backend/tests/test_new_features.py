"""
Tech Store API - New Features Tests
Tests for: Competitions (with quiz/draw), Wallet, Addresses, Ads, Orders
"""
import pytest
import requests
import os
from pathlib import Path

# Read BASE_URL from frontend .env file
frontend_env = Path('/app/frontend/.env')
BASE_URL = ''
if frontend_env.exists():
    for line in frontend_env.read_text().splitlines():
        if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
            BASE_URL = line.split('=', 1)[1].strip().strip('"')
            break

if not BASE_URL:
    raise ValueError("EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env")


class TestCompetitions:
    """Competitions endpoints - quiz and draw functionality"""
    
    def test_get_competitions(self):
        """Test getting all competitions"""
        response = requests.get(f"{BASE_URL}/api/competitions")
        assert response.status_code == 200, f"Get competitions failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Competitions should be a list"
        assert len(data) >= 3, f"Should have at least 3 competitions, got {len(data)}"
        
        # Check competition structure
        comp = data[0]
        assert "id" in comp
        assert "title" in comp
        assert "status" in comp
        assert "prize" in comp
        assert "joined_count" in comp
        assert "max_participants" in comp
        assert "_id" not in comp, "MongoDB _id should be excluded"
        print(f"✓ Got {len(data)} competitions")
    
    def test_get_competition_by_id(self):
        """Test getting a specific competition"""
        # Get competitions first
        comps_res = requests.get(f"{BASE_URL}/api/competitions")
        comp_id = comps_res.json()[0]["id"]
        
        response = requests.get(f"{BASE_URL}/api/competitions/{comp_id}")
        assert response.status_code == 200, f"Get competition failed: {response.text}"
        
        data = response.json()
        assert data["id"] == comp_id
        assert "title" in data
        assert "description" in data
        assert "questions" in data
        print(f"✓ Got competition: {data['title']}")
    
    def test_get_participants(self):
        """Test getting competition participants"""
        # Get competitions first
        comps_res = requests.get(f"{BASE_URL}/api/competitions")
        comp_id = comps_res.json()[0]["id"]
        
        response = requests.get(f"{BASE_URL}/api/competitions/{comp_id}/participants")
        assert response.status_code == 200, f"Get participants failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Participants should be a list"
        print(f"✓ Got {len(data)} participants")
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        return response.json()["token"]
    
    def test_answer_quiz(self, auth_token):
        """Test answering competition quiz"""
        # Get a competition with questions
        comps_res = requests.get(f"{BASE_URL}/api/competitions")
        comps = comps_res.json()
        comp_with_quiz = next((c for c in comps if c.get("questions") and len(c["questions"]) > 0), None)
        
        if not comp_with_quiz:
            pytest.skip("No competition with quiz found")
        
        comp_id = comp_with_quiz["id"]
        num_questions = len(comp_with_quiz["questions"])
        
        # Answer all questions correctly (answer 0 for all)
        answers = [0] * num_questions
        
        response = requests.post(f"{BASE_URL}/api/competitions/{comp_id}/answer",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"answers": answers}
        )
        assert response.status_code == 200, f"Answer quiz failed: {response.text}"
        
        data = response.json()
        assert "score" in data
        assert "correct" in data
        assert "total" in data
        assert "passed" in data
        print(f"✓ Quiz answered: {data['correct']}/{data['total']} correct, score: {data['score']:.0f}%, passed: {data['passed']}")
    
    def test_competition_draw(self):
        """Test performing competition draw"""
        # Get an open competition
        comps_res = requests.get(f"{BASE_URL}/api/competitions")
        comps = comps_res.json()
        open_comp = next((c for c in comps if c.get("status") == "open"), None)
        
        if not open_comp:
            pytest.skip("No open competition found")
        
        comp_id = open_comp["id"]
        
        response = requests.post(f"{BASE_URL}/api/competitions/{comp_id}/draw")
        assert response.status_code == 200, f"Draw failed: {response.text}"
        
        data = response.json()
        assert "winners" in data
        assert isinstance(data["winners"], list)
        print(f"✓ Draw completed with {len(data['winners'])} winners")


class TestWallet:
    """Wallet endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        return response.json()["token"]
    
    def test_get_wallet(self, auth_token):
        """Test getting wallet data"""
        response = requests.get(f"{BASE_URL}/api/wallet",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Get wallet failed: {response.text}"
        
        data = response.json()
        assert "balance" in data
        assert "points" in data
        assert "transactions" in data
        assert isinstance(data["transactions"], list)
        
        # Verify data types
        assert isinstance(data["balance"], (int, float))
        assert isinstance(data["points"], (int, float))
        
        print(f"✓ Wallet: {data['balance']} SAR, {data['points']} points, {len(data['transactions'])} transactions")
    
    def test_wallet_without_auth(self):
        """Test wallet access without authentication"""
        response = requests.get(f"{BASE_URL}/api/wallet")
        assert response.status_code == 401, "Should require authentication"
        print("✓ Wallet correctly requires authentication")


class TestAddresses:
    """Addresses endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        return response.json()["token"]
    
    def test_get_addresses(self, auth_token):
        """Test getting user addresses"""
        response = requests.get(f"{BASE_URL}/api/addresses",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Get addresses failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Addresses should be a list"
        
        if len(data) > 0:
            addr = data[0]
            assert "id" in addr
            assert "label" in addr
            assert "address" in addr
            assert "_id" not in addr, "MongoDB _id should be excluded"
        
        print(f"✓ Got {len(data)} addresses")
    
    def test_add_address(self, auth_token):
        """Test adding a new address"""
        response = requests.post(f"{BASE_URL}/api/addresses",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "label": "TEST_Office",
                "address": "King Fahad Road, Riyadh",
                "city": "Riyadh",
                "is_default": False
            }
        )
        assert response.status_code == 200, f"Add address failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "message" in data
        
        # Verify address was added by fetching addresses
        get_res = requests.get(f"{BASE_URL}/api/addresses",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        addresses = get_res.json()
        assert any(a["label"] == "TEST_Office" for a in addresses), "Address not found after creation"
        
        print(f"✓ Address added successfully: {data['id']}")
    
    def test_delete_address(self, auth_token):
        """Test deleting an address"""
        # First add an address
        add_res = requests.post(f"{BASE_URL}/api/addresses",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "label": "TEST_ToDelete",
                "address": "Test Address",
                "city": "Riyadh",
                "is_default": False
            }
        )
        addr_id = add_res.json()["id"]
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/addresses/{addr_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Delete address failed: {response.text}"
        
        # Verify it's deleted
        get_res = requests.get(f"{BASE_URL}/api/addresses",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        addresses = get_res.json()
        assert not any(a["id"] == addr_id for a in addresses), "Address still exists after deletion"
        
        print(f"✓ Address deleted successfully")


class TestAds:
    """Paid ads endpoints"""
    
    def test_get_ads(self):
        """Test getting active ads"""
        response = requests.get(f"{BASE_URL}/api/ads")
        assert response.status_code == 200, f"Get ads failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Ads should be a list"
        
        if len(data) > 0:
            ad = data[0]
            assert "id" in ad
            assert "title" in ad
            assert "description" in ad
            assert "status" in ad
            assert "_id" not in ad, "MongoDB _id should be excluded"
        
        print(f"✓ Got {len(data)} active ads")
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        return response.json()["token"]
    
    def test_create_ad(self, auth_token):
        """Test creating a new ad"""
        response = requests.post(f"{BASE_URL}/api/ads",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "title": "TEST_Ad Campaign",
                "description": "Test ad description",
                "image": "https://example.com/image.jpg",
                "ad_type": "banner",
                "duration_days": 7,
                "budget": 100
            }
        )
        assert response.status_code == 200, f"Create ad failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "message" in data
        print(f"✓ Ad created successfully: {data['id']}")
    
    def test_get_my_ads(self, auth_token):
        """Test getting user's ads"""
        response = requests.get(f"{BASE_URL}/api/ads/my",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Get my ads failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "My ads should be a list"
        print(f"✓ Got {len(data)} user ads")


class TestOrders:
    """Orders endpoints - verify filters work"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        return response.json()["token"]
    
    def test_get_orders(self, auth_token):
        """Test getting user orders"""
        response = requests.get(f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Get orders failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Orders should be a list"
        
        if len(data) > 0:
            order = data[0]
            assert "id" in order
            assert "status" in order
            assert "total" in order
            assert "items" in order
            assert "_id" not in order, "MongoDB _id should be excluded"
        
        print(f"✓ Got {len(data)} orders")
