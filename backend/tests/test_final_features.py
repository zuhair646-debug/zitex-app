"""
Tech Store API - Final Features Tests
Tests for: Coupons, Social Posts, Reviews, Delivery Webhooks, Payment Integration
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


@pytest.fixture
def auth_token():
    """Get auth token for authenticated tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "phone": "0500000000",
        "password": "test1234"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]


class TestCoupons:
    """Coupon validation endpoints"""
    
    def test_validate_welcome10_coupon(self):
        """Test WELCOME10 coupon - 10% discount"""
        response = requests.get(f"{BASE_URL}/api/coupons/validate/WELCOME10")
        assert response.status_code == 200, f"Validate WELCOME10 failed: {response.text}"
        
        data = response.json()
        assert data["code"] == "WELCOME10"
        assert data["discount_type"] == "percent"
        assert data["discount_value"] == 10
        assert data["min_order"] == 100
        assert data["max_discount"] == 50
        assert data["active"] == True
        assert "_id" not in data, "MongoDB _id should be excluded"
        print(f"✓ WELCOME10: {data['discount_value']}% discount, min order {data['min_order']} SAR")
    
    def test_validate_flat50_coupon(self):
        """Test FLAT50 coupon - fixed 50 SAR discount"""
        response = requests.get(f"{BASE_URL}/api/coupons/validate/FLAT50")
        assert response.status_code == 200, f"Validate FLAT50 failed: {response.text}"
        
        data = response.json()
        assert data["code"] == "FLAT50"
        assert data["discount_type"] == "fixed"
        assert data["discount_value"] == 50
        assert data["min_order"] == 200
        assert data["active"] == True
        print(f"✓ FLAT50: {data['discount_value']} SAR fixed discount, min order {data['min_order']} SAR")
    
    def test_validate_eid25_coupon(self):
        """Test EID25 coupon - 25% discount"""
        response = requests.get(f"{BASE_URL}/api/coupons/validate/EID25")
        assert response.status_code == 200, f"Validate EID25 failed: {response.text}"
        
        data = response.json()
        assert data["code"] == "EID25"
        assert data["discount_type"] == "percent"
        assert data["discount_value"] == 25
        assert data["min_order"] == 500
        assert data["max_discount"] == 200
        print(f"✓ EID25: {data['discount_value']}% discount, min order {data['min_order']} SAR")
    
    def test_validate_invalid_coupon(self):
        """Test invalid coupon code"""
        response = requests.get(f"{BASE_URL}/api/coupons/validate/INVALID123")
        assert response.status_code == 404, "Invalid coupon should return 404"
        print("✓ Invalid coupon correctly returns 404")


class TestSocialPosts:
    """Social posts endpoints"""
    
    def test_get_social_posts(self):
        """Test getting social posts"""
        response = requests.get(f"{BASE_URL}/api/social/posts")
        assert response.status_code == 200, f"Get social posts failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Posts should be a list"
        assert len(data) >= 4, f"Should have at least 4 posts, got {len(data)}"
        
        # Check post structure
        post = data[0]
        assert "id" in post
        assert "author" in post
        assert "text" in post
        assert "likes" in post
        assert "comments" in post
        assert "_id" not in post, "MongoDB _id should be excluded"
        
        # Check for sponsored ad
        ad_posts = [p for p in data if p.get("is_ad") == True]
        assert len(ad_posts) >= 1, "Should have at least 1 sponsored ad post"
        ad = ad_posts[0]
        assert ad.get("ad_label") == "Sponsored", "Ad should have 'Sponsored' label"
        
        print(f"✓ Got {len(data)} posts, {len(ad_posts)} sponsored ads")
    
    def test_like_post(self, auth_token):
        """Test liking a post (toggle)"""
        # Get posts first
        posts_res = requests.get(f"{BASE_URL}/api/social/posts")
        posts = posts_res.json()
        post_id = posts[0]["id"]
        
        # Like the post
        response = requests.post(f"{BASE_URL}/api/social/posts/{post_id}/like",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Like post failed: {response.text}"
        
        data = response.json()
        assert "liked" in data
        assert isinstance(data["liked"], bool)
        print(f"✓ Post like toggled: {data['liked']}")
    
    def test_add_comment(self, auth_token):
        """Test adding a comment to a post"""
        # Get posts first
        posts_res = requests.get(f"{BASE_URL}/api/social/posts")
        posts = posts_res.json()
        post_id = posts[0]["id"]
        
        response = requests.post(f"{BASE_URL}/api/social/posts/{post_id}/comments",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"text": "TEST_Great post!"}
        )
        assert response.status_code == 200, f"Add comment failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        print(f"✓ Comment added successfully")
    
    def test_get_comments(self):
        """Test getting comments for a post"""
        # Get posts first
        posts_res = requests.get(f"{BASE_URL}/api/social/posts")
        posts = posts_res.json()
        post_id = posts[0]["id"]
        
        response = requests.get(f"{BASE_URL}/api/social/posts/{post_id}/comments")
        assert response.status_code == 200, f"Get comments failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Comments should be a list"
        print(f"✓ Got {len(data)} comments")
    
    def test_bookmark_post(self, auth_token):
        """Test bookmarking a post (toggle)"""
        # Get posts first
        posts_res = requests.get(f"{BASE_URL}/api/social/posts")
        posts = posts_res.json()
        post_id = posts[0]["id"]
        
        response = requests.post(f"{BASE_URL}/api/social/posts/{post_id}/bookmark",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Bookmark post failed: {response.text}"
        
        data = response.json()
        assert "bookmarked" in data
        assert isinstance(data["bookmarked"], bool)
        print(f"✓ Post bookmark toggled: {data['bookmarked']}")


class TestReviews:
    """Product reviews endpoints"""
    
    def test_get_product_reviews(self):
        """Test getting reviews for a product"""
        # Get a product first
        products_res = requests.get(f"{BASE_URL}/api/products?limit=1")
        products = products_res.json()["products"]
        product_id = products[0]["id"]
        
        response = requests.get(f"{BASE_URL}/api/products/{product_id}/reviews")
        assert response.status_code == 200, f"Get reviews failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Reviews should be a list"
        print(f"✓ Got {len(data)} reviews for product")
    
    def test_add_review(self, auth_token):
        """Test adding a review to a product"""
        # Get a product first
        products_res = requests.get(f"{BASE_URL}/api/products?limit=1")
        products = products_res.json()["products"]
        product_id = products[0]["id"]
        
        response = requests.post(f"{BASE_URL}/api/products/{product_id}/reviews",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "rating": 5,
                "comment": "TEST_Excellent product! Highly recommended."
            }
        )
        assert response.status_code == 200, f"Add review failed: {response.text}"
        
        data = response.json()
        assert "message" in data
        assert "avg_rating" in data
        assert isinstance(data["avg_rating"], (int, float))
        print(f"✓ Review added, new avg rating: {data['avg_rating']}")
        
        # Verify review was added
        reviews_res = requests.get(f"{BASE_URL}/api/products/{product_id}/reviews")
        reviews = reviews_res.json()
        assert any(r["comment"] == "TEST_Excellent product! Highly recommended." for r in reviews), "Review not found after creation"
        print(f"✓ Review verified in product reviews list")


class TestDeliveryWebhooks:
    """Delivery integration webhook endpoints"""
    
    def test_delivery_update_webhook(self):
        """Test delivery status update webhook"""
        # Create a test order first
        auth_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        token = auth_res.json()["token"]
        
        # Add item to cart
        products_res = requests.get(f"{BASE_URL}/api/products?limit=1")
        product_id = products_res.json()["products"][0]["id"]
        
        requests.post(f"{BASE_URL}/api/cart",
            headers={"Authorization": f"Bearer {token}"},
            json={"product_id": product_id, "quantity": 1}
        )
        
        # Create order
        order_res = requests.post(f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "address": "Test Address",
                "phone": "0500000000",
                "delivery_type": "standard",
                "payment_method": "cash"
            }
        )
        order_id = order_res.json()["id"]
        
        # Send webhook update
        response = requests.post(f"{BASE_URL}/api/webhooks/delivery/update",
            json={
                "order_id": order_id,
                "status": "out_for_delivery",
                "driver_name": "Ahmed Ali",
                "driver_phone": "0501234567",
                "location": {"lat": 24.7136, "lng": 46.6753},
                "eta": "30 minutes"
            }
        )
        assert response.status_code == 200, f"Delivery update webhook failed: {response.text}"
        
        data = response.json()
        assert data["received"] == True
        print(f"✓ Delivery update webhook received")
    
    def test_delivery_assigned_webhook(self):
        """Test delivery driver assigned webhook"""
        # Create a test order first
        auth_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        token = auth_res.json()["token"]
        
        # Add item to cart
        products_res = requests.get(f"{BASE_URL}/api/products?limit=1")
        product_id = products_res.json()["products"][0]["id"]
        
        requests.post(f"{BASE_URL}/api/cart",
            headers={"Authorization": f"Bearer {token}"},
            json={"product_id": product_id, "quantity": 1}
        )
        
        # Create order
        order_res = requests.post(f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "address": "Test Address",
                "phone": "0500000000",
                "delivery_type": "express",
                "payment_method": "cash"
            }
        )
        order_id = order_res.json()["id"]
        
        # Send webhook
        response = requests.post(f"{BASE_URL}/api/webhooks/delivery/assigned",
            json={
                "order_id": order_id,
                "driver_name": "Mohammed Hassan",
                "driver_phone": "0509876543"
            }
        )
        assert response.status_code == 200, f"Delivery assigned webhook failed: {response.text}"
        
        data = response.json()
        assert data["received"] == True
        print(f"✓ Delivery assigned webhook received")


class TestPaymentIntegration:
    """Payment integration endpoints"""
    
    def test_create_payment_intent(self, auth_token):
        """Test creating payment intent"""
        response = requests.post(f"{BASE_URL}/api/payments/create-intent",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "amount": 500,
                "method": "card"
            }
        )
        assert response.status_code == 200, f"Create payment intent failed: {response.text}"
        
        data = response.json()
        assert "payment_id" in data
        assert data["amount"] == 500
        assert data["currency"] == "SAR"
        assert data["method"] == "card"
        assert data["status"] == "pending"
        assert "supported_methods" in data
        
        supported = data["supported_methods"]
        assert "card" in supported
        assert "apple_pay" in supported
        assert "mada" in supported
        assert "tamara_installments" in supported
        assert "cash_on_delivery" in supported
        
        print(f"✓ Payment intent created: {data['payment_id']}")
        print(f"✓ Supported methods: {', '.join(supported)}")
    
    def test_payment_webhook(self):
        """Test payment confirmation webhook"""
        # Create a test order first
        auth_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "phone": "0500000000",
            "password": "test1234"
        })
        token = auth_res.json()["token"]
        
        # Add item to cart
        products_res = requests.get(f"{BASE_URL}/api/products?limit=1")
        product_id = products_res.json()["products"][0]["id"]
        
        requests.post(f"{BASE_URL}/api/cart",
            headers={"Authorization": f"Bearer {token}"},
            json={"product_id": product_id, "quantity": 1}
        )
        
        # Create order
        order_res = requests.post(f"{BASE_URL}/api/orders",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "address": "Test Address",
                "phone": "0500000000",
                "delivery_type": "standard",
                "payment_method": "card"
            }
        )
        order_id = order_res.json()["id"]
        
        # Send payment webhook
        response = requests.post(f"{BASE_URL}/api/webhooks/payment/confirm",
            json={
                "order_id": order_id,
                "status": "paid"
            }
        )
        assert response.status_code == 200, f"Payment webhook failed: {response.text}"
        
        data = response.json()
        assert data["received"] == True
        print(f"✓ Payment webhook received")
