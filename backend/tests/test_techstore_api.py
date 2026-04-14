"""
Tech Store API Backend Tests
Tests for: Auth, Categories, Brands, Products, Cart, Orders, Banners
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

class TestHealth:
    """Basic health check"""
    
    def test_backend_reachable(self):
        """Test if backend is reachable"""
        try:
            response = requests.get(f"{BASE_URL}/api/categories", timeout=10)
            assert response.status_code in [200, 401, 404], f"Backend not reachable, got {response.status_code}"
            print(f"✓ Backend is reachable at {BASE_URL}")
        except Exception as e:
            pytest.fail(f"Backend not reachable: {str(e)}")


class TestAuth:
    """Authentication endpoints"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["phone"] == "0500000000"
        assert data["user"]["name"] == "مستخدم تجريبي"
        print(f"✓ Login successful for user: {data['user']['name']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, "Should return 401 for invalid credentials"
        print("✓ Invalid credentials rejected correctly")
    
    def test_register_new_user(self):
        """Test user registration"""
        import random
        test_phone = f"05{random.randint(10000000, 99999999)}"
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "phone": test_phone,
            "password": "test1234",
            "name": "TEST_User"
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["phone"] == test_phone
        print(f"✓ User registered successfully: {test_phone}")
    
    def test_register_duplicate_phone(self):
        """Test registration with existing phone"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "phone": "0500000000",
            "password": "test1234",
            "name": "Duplicate"
        })
        assert response.status_code == 400, "Should reject duplicate phone"
        print("✓ Duplicate phone registration rejected")
    
    def test_get_current_user(self):
        """Test getting current user with token"""
        # First login
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        token = login_res.json()["token"]
        
        # Get current user
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200, f"Get me failed: {response.text}"
        
        data = response.json()
        assert "user" in data
        assert data["user"]["phone"] == "0500000000"
        print("✓ Get current user successful")


class TestCategories:
    """Categories endpoints"""
    
    def test_get_categories(self):
        """Test getting all categories"""
        response = requests.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200, f"Get categories failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Categories should be a list"
        assert len(data) > 0, "Should have at least one category"
        
        # Check category structure
        cat = data[0]
        assert "id" in cat
        assert "name_ar" in cat
        assert "name_en" in cat
        assert "_id" not in cat, "MongoDB _id should be excluded"
        print(f"✓ Got {len(data)} categories")


class TestBrands:
    """Brands endpoints"""
    
    def test_get_brands(self):
        """Test getting all brands"""
        response = requests.get(f"{BASE_URL}/api/brands")
        assert response.status_code == 200, f"Get brands failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Brands should be a list"
        assert len(data) > 0, "Should have at least one brand"
        
        brand = data[0]
        assert "id" in brand
        assert "name_ar" in brand
        assert "_id" not in brand, "MongoDB _id should be excluded"
        print(f"✓ Got {len(data)} brands")


class TestProducts:
    """Products endpoints"""
    
    def test_get_products(self):
        """Test getting all products"""
        response = requests.get(f"{BASE_URL}/api/products")
        assert response.status_code == 200, f"Get products failed: {response.text}"
        
        data = response.json()
        assert "products" in data
        assert "total" in data
        assert isinstance(data["products"], list)
        assert len(data["products"]) > 0, "Should have at least one product"
        
        product = data["products"][0]
        assert "id" in product
        assert "name_ar" in product
        assert "price" in product
        assert "_id" not in product, "MongoDB _id should be excluded"
        print(f"✓ Got {len(data['products'])} products out of {data['total']} total")
    
    def test_get_featured_products(self):
        """Test getting featured products"""
        response = requests.get(f"{BASE_URL}/api/products/featured")
        assert response.status_code == 200, f"Get featured products failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Should have at least one featured product"
        print(f"✓ Got {len(data)} featured products")
    
    def test_get_product_by_id(self):
        """Test getting a specific product"""
        # First get a product ID
        products_res = requests.get(f"{BASE_URL}/api/products")
        product_id = products_res.json()["products"][0]["id"]
        
        response = requests.get(f"{BASE_URL}/api/products/{product_id}")
        assert response.status_code == 200, f"Get product failed: {response.text}"
        
        data = response.json()
        assert data["id"] == product_id
        assert "name_ar" in data
        assert "price" in data
        assert "specs" in data
        print(f"✓ Got product: {data['name_ar']}")
    
    def test_search_products(self):
        """Test product search"""
        response = requests.get(f"{BASE_URL}/api/products?search=آيفون")
        assert response.status_code == 200, f"Search failed: {response.text}"
        
        data = response.json()
        assert "products" in data
        print(f"✓ Search returned {len(data['products'])} results")
    
    def test_filter_by_category(self):
        """Test filtering products by category"""
        # Get a category ID first
        cats_res = requests.get(f"{BASE_URL}/api/categories")
        cat_id = cats_res.json()[0]["id"]
        
        response = requests.get(f"{BASE_URL}/api/products?category={cat_id}")
        assert response.status_code == 200, f"Filter by category failed: {response.text}"
        
        data = response.json()
        assert "products" in data
        print(f"✓ Category filter returned {len(data['products'])} products")


class TestBanners:
    """Banners endpoints"""
    
    def test_get_banners(self):
        """Test getting all banners"""
        response = requests.get(f"{BASE_URL}/api/banners")
        assert response.status_code == 200, f"Get banners failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Should have at least one banner"
        
        banner = data[0]
        assert "id" in banner
        assert "image" in banner
        assert "_id" not in banner, "MongoDB _id should be excluded"
        print(f"✓ Got {len(data)} banners")


class TestCart:
    """Cart endpoints (requires auth)"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        return response.json()["token"]
    
    @pytest.fixture
    def product_id(self):
        """Get a product ID for tests"""
        response = requests.get(f"{BASE_URL}/api/products")
        return response.json()["products"][0]["id"]
    
    def test_add_to_cart(self, auth_token, product_id):
        """Test adding item to cart"""
        response = requests.post(f"{BASE_URL}/api/cart", 
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "product_id": product_id,
                "quantity": 1,
                "color": "أسود",
                "storage": "128GB"
            }
        )
        assert response.status_code == 200, f"Add to cart failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        print(f"✓ Added product to cart")
    
    def test_get_cart(self, auth_token):
        """Test getting cart items"""
        response = requests.get(f"{BASE_URL}/api/cart",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Get cart failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got cart with {len(data)} items")
    
    def test_cart_without_auth(self):
        """Test cart access without authentication"""
        response = requests.get(f"{BASE_URL}/api/cart")
        assert response.status_code == 401, "Should require authentication"
        print("✓ Cart correctly requires authentication")


class TestOrders:
    """Orders endpoints (requires auth)"""
    
    @pytest.fixture
    def auth_token_with_cart(self):
        """Get auth token and add item to cart"""
        # Login
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        token = login_res.json()["token"]
        
        # Add item to cart
        products_res = requests.get(f"{BASE_URL}/api/products")
        product_id = products_res.json()["products"][0]["id"]
        
        requests.post(f"{BASE_URL}/api/cart",
            headers={"Authorization": f"Bearer {token}"},
            json={"product_id": product_id, "quantity": 1}
        )
        
        return token
    
    def test_create_order(self, auth_token_with_cart):
        """Test creating an order"""
        response = requests.post(f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {auth_token_with_cart}"},
            json={
                "address": "الرياض - حي النرجس",
                "phone": "0500000000",
                "delivery_type": "standard",
                "payment_method": "cash"
            }
        )
        assert response.status_code == 200, f"Create order failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "total" in data
        assert "items" in data
        assert len(data["items"]) > 0
        print(f"✓ Order created with total: {data['total']} ر.س")
    
    def test_get_orders(self, auth_token_with_cart):
        """Test getting user orders"""
        response = requests.get(f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {auth_token_with_cart}"}
        )
        assert response.status_code == 200, f"Get orders failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} orders")
    
    def test_create_order_empty_cart(self):
        """Test creating order with empty cart"""
        # Login with fresh user
        import random
        test_phone = f"05{random.randint(10000000, 99999999)}"
        
        reg_res = requests.post(f"{BASE_URL}/api/auth/register", json={
            "phone": test_phone,
            "password": "test1234",
            "name": "TEST_EmptyCart"
        })
        token = reg_res.json()["token"]
        
        response = requests.post(f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "address": "Test",
                "phone": test_phone,
                "delivery_type": "standard",
                "payment_method": "cash"
            }
        )
        assert response.status_code == 400, "Should reject order with empty cart"
        print("✓ Empty cart order rejected correctly")


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session
