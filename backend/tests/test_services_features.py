"""
Tech Store API - Services, Warranties, Invoices, Support Tests
Tests for: Services (GET, booking), Warranties, Invoices, Support Tickets (CRUD)
"""
import pytest
import requests
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


class TestServices:
    """Services endpoints - GET services, service detail, booking"""
    
    def test_get_services(self):
        """Test getting all services"""
        response = requests.get(f"{BASE_URL}/api/services")
        assert response.status_code == 200, f"Get services failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Services should be a list"
        assert len(data) >= 6, f"Should have at least 6 services, got {len(data)}"
        
        # Check service structure
        svc = data[0]
        assert "id" in svc
        assert "name" in svc
        assert "desc" in svc
        assert "price" in svc
        assert "total_requests" in svc
        assert "icon" in svc
        assert "color" in svc
        assert "_id" not in svc, "MongoDB _id should be excluded"
        
        # Verify specific services exist
        service_names = [s["name"] for s in data]
        assert "Screen Repair" in service_names
        assert "Battery Replacement" in service_names
        assert "Water Damage Repair" in service_names
        assert "Software Fix" in service_names
        assert "Device Inspection" in service_names
        assert "Charging Port Fix" in service_names
        
        print(f"✓ Got {len(data)} services")
    
    def test_get_service_by_id(self):
        """Test getting a specific service"""
        # Get services first
        services_res = requests.get(f"{BASE_URL}/api/services")
        services = services_res.json()
        service_id = services[0]["id"]
        
        response = requests.get(f"{BASE_URL}/api/services/{service_id}")
        assert response.status_code == 200, f"Get service failed: {response.text}"
        
        data = response.json()
        assert data["id"] == service_id
        assert "name" in data
        assert "desc" in data
        assert "price" in data
        assert "inspection_price" in data
        assert "delivery_available" in data
        assert "home_pickup" in data
        assert "warranty_available" in data
        assert "warranty_days" in data
        assert "turnaround" in data
        assert "rating" in data
        assert "review_count" in data
        
        print(f"✓ Got service: {data['name']} - {data['price']} SAR")
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        return response.json()["token"]
    
    def test_book_service(self, auth_token):
        """Test booking a service"""
        response = requests.post(f"{BASE_URL}/api/services/book",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "service_name": "Screen Repair",
                "device_model": "iPhone 15 Pro",
                "issue_desc": "Screen cracked after drop",
                "delivery_type": "store",
                "phone": "0500000000"
            }
        )
        assert response.status_code == 200, f"Book service failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "message" in data
        
        print(f"✓ Service booked successfully: {data['id']}")
    
    def test_get_my_service_bookings(self, auth_token):
        """Test getting user's service bookings"""
        response = requests.get(f"{BASE_URL}/api/services/bookings/my",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Get bookings failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Bookings should be a list"
        
        if len(data) > 0:
            booking = data[0]
            assert "id" in booking
            assert "service_name" in booking
            assert "status" in booking
            assert "_id" not in booking, "MongoDB _id should be excluded"
        
        print(f"✓ Got {len(data)} service bookings")


class TestWarranties:
    """Warranties endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        return response.json()["token"]
    
    def test_get_warranties(self, auth_token):
        """Test getting user warranties"""
        response = requests.get(f"{BASE_URL}/api/warranties",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Get warranties failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Warranties should be a list"
        assert len(data) >= 2, f"Should have at least 2 warranties, got {len(data)}"
        
        # Check warranty structure
        warranty = data[0]
        assert "id" in warranty
        assert "product_name" in warranty
        assert "service_name" in warranty
        assert "warranty_days" in warranty
        assert "start_date" in warranty
        assert "end_date" in warranty
        assert "status" in warranty
        assert "_id" not in warranty, "MongoDB _id should be excluded"
        
        # Verify specific warranties exist
        warranty_names = [w["product_name"] for w in data]
        assert any("Screen" in name for name in warranty_names), "Screen warranty not found"
        assert any("Battery" in name for name in warranty_names), "Battery warranty not found"
        
        print(f"✓ Got {len(data)} warranties")
    
    def test_warranties_without_auth(self):
        """Test warranties access without authentication"""
        response = requests.get(f"{BASE_URL}/api/warranties")
        assert response.status_code == 401, "Should require authentication"
        print("✓ Warranties correctly requires authentication")


class TestInvoices:
    """Invoices endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        return response.json()["token"]
    
    def test_get_invoices(self, auth_token):
        """Test getting user invoices"""
        response = requests.get(f"{BASE_URL}/api/invoices",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Get invoices failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Invoices should be a list"
        
        if len(data) > 0:
            invoice = data[0]
            assert "id" in invoice
            assert "invoice_no" in invoice
            assert "date" in invoice
            assert "total" in invoice
            assert "tax" in invoice
            assert "subtotal" in invoice
            assert "items" in invoice
            assert "status" in invoice
            assert "_id" not in invoice, "MongoDB _id should be excluded"
            
            # Verify invoice number format
            assert invoice["invoice_no"].startswith("INV-"), "Invoice number should start with INV-"
            
            # Verify amounts are numbers
            assert isinstance(invoice["total"], (int, float))
            assert isinstance(invoice["tax"], (int, float))
            assert isinstance(invoice["subtotal"], (int, float))
        
        print(f"✓ Got {len(data)} invoices")
    
    def test_invoices_without_auth(self):
        """Test invoices access without authentication"""
        response = requests.get(f"{BASE_URL}/api/invoices")
        assert response.status_code == 401, "Should require authentication"
        print("✓ Invoices correctly requires authentication")


class TestSupportTickets:
    """Support tickets endpoints - CRUD operations"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        return response.json()["token"]
    
    def test_get_support_tickets(self, auth_token):
        """Test getting user support tickets"""
        response = requests.get(f"{BASE_URL}/api/support/tickets",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Get tickets failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Tickets should be a list"
        assert len(data) >= 2, f"Should have at least 2 tickets, got {len(data)}"
        
        # Check ticket structure
        ticket = data[0]
        assert "id" in ticket
        assert "subject" in ticket
        assert "message" in ticket
        assert "category" in ticket
        assert "status" in ticket
        assert "replies" in ticket
        assert "created_at" in ticket
        assert "_id" not in ticket, "MongoDB _id should be excluded"
        
        # Verify specific tickets exist
        subjects = [t["subject"] for t in data]
        assert any("delay" in s.lower() for s in subjects), "Order delay ticket not found"
        assert any("warranty" in s.lower() for s in subjects), "Warranty ticket not found"
        
        print(f"✓ Got {len(data)} support tickets")
    
    def test_create_support_ticket(self, auth_token):
        """Test creating a new support ticket"""
        response = requests.post(f"{BASE_URL}/api/support/tickets",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "subject": "TEST_Product inquiry",
                "message": "I need help with product selection",
                "category": "general"
            }
        )
        assert response.status_code == 200, f"Create ticket failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "message" in data
        
        # Verify ticket was created by fetching tickets
        get_res = requests.get(f"{BASE_URL}/api/support/tickets",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        tickets = get_res.json()
        assert any(t["subject"] == "TEST_Product inquiry" for t in tickets), "Ticket not found after creation"
        
        print(f"✓ Support ticket created successfully: {data['id']}")
    
    def test_reply_to_ticket(self, auth_token):
        """Test replying to a support ticket"""
        # First create a ticket
        create_res = requests.post(f"{BASE_URL}/api/support/tickets",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "subject": "TEST_Reply test",
                "message": "Original message",
                "category": "technical"
            }
        )
        ticket_id = create_res.json()["id"]
        
        # Reply to it
        response = requests.post(f"{BASE_URL}/api/support/tickets/{ticket_id}/reply",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"message": "This is a test reply"}
        )
        assert response.status_code == 200, f"Reply to ticket failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        
        # Verify reply was added by fetching the ticket
        get_res = requests.get(f"{BASE_URL}/api/support/tickets",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        tickets = get_res.json()
        ticket = next((t for t in tickets if t["id"] == ticket_id), None)
        assert ticket is not None, "Ticket not found"
        assert len(ticket["replies"]) > 0, "Reply not added"
        assert any("test reply" in r["message"].lower() for r in ticket["replies"]), "Reply message not found"
        
        print(f"✓ Reply added successfully to ticket {ticket_id}")
    
    def test_support_tickets_without_auth(self):
        """Test support tickets access without authentication"""
        response = requests.get(f"{BASE_URL}/api/support/tickets")
        assert response.status_code == 401, "Should require authentication"
        print("✓ Support tickets correctly requires authentication")


class TestFavorites:
    """Favorites endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        return response.json()["token"]
    
    def test_get_favorites(self, auth_token):
        """Test getting user favorites"""
        response = requests.get(f"{BASE_URL}/api/favorites",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Get favorites failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Favorites should be a list"
        
        if len(data) > 0:
            fav = data[0]
            assert "id" in fav
            assert "name_en" in fav or "name_ar" in fav
            assert "price" in fav
            assert "_id" not in fav, "MongoDB _id should be excluded"
        
        print(f"✓ Got {len(data)} favorites")
    
    def test_toggle_favorite(self, auth_token):
        """Test adding and removing favorite"""
        # Get a product first
        products_res = requests.get(f"{BASE_URL}/api/products?limit=1")
        products = products_res.json()["products"]
        if len(products) == 0:
            pytest.skip("No products available")
        
        product_id = products[0]["id"]
        
        # Add to favorites
        add_res = requests.post(f"{BASE_URL}/api/favorites/{product_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert add_res.status_code == 200, f"Add favorite failed: {add_res.text}"
        add_data = add_res.json()
        assert "favorited" in add_data
        
        # Remove from favorites
        remove_res = requests.post(f"{BASE_URL}/api/favorites/{product_id}",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert remove_res.status_code == 200, f"Remove favorite failed: {remove_res.text}"
        remove_data = remove_res.json()
        assert "favorited" in remove_data
        
        print(f"✓ Favorite toggle working correctly")
