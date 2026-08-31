# Tech Store App - Complete PRD (Final) — v1.3.7

## Latest Release Notes (v1.3.7 — 2026-06)
- **Competition Form Upgrade**: cover_image + prize_image uploads via Emergent Object Storage, 4-option Q&A with star-toggle for correct answer, RTL preview modal.
- **Critical Fix**: removed duplicate `POST /api/competitions/{id}/answer` route that shadowed the new QA answer handler.
- **Backend Validation**: QA competitions must have ≥2 non-empty options and a correct_answer that exists in the options list.
- **A11y**: Star touch target 44×44 px, cross-platform Modal (not iOS-only pageSheet).
- **Tests**: 11/11 pass on `test_merchant_competition_upgrade.py`.

## Overview
Full-featured Tech Store mobile app. React Native Expo + FastAPI + MongoDB. 25+ screens, 40+ API endpoints. All internal flows integrated.

## Complete Feature Map

### Auth: Sign In → Sign Up (JWT + bcrypt)

### Home (Tab 1)
Header → Banner Slider → 6 Categories → Used Devices 75% OFF → Hot Products → iPhone 16 Banner → Best Deals → Competition Progress

### Services (Tab 2) - API Connected
6 services from DB → Service Detail (price/inspection/warranty/delivery/pickup/rating) → Book Service → Booking created

### Competitions (Tab 3) - Full Internal Draw
3 competitions from API → Detail → Quiz (5Q, 70% pass) → Draw → Winners → Participants list

### Social (Tab 4) - API Connected + Sponsored Ads
Posts from API → Like/Comment/Bookmark (API calls) → Sponsored posts (is_ad badge) → Polls → Stories

### Profile (Tab 5) - All Sub-Screens
Orders (filter tabs) | Invoices (auto-generated) | Favorites (API) | Warranties (progress bars) | Addresses (CRUD) | Wallet (balance+points+history) | Support (tickets+replies) | About Store (Riyadh/Jeddah)

### Checkout - Complete Flow
1. Address Selection (from saved)
2. Shipping Type (Standard 15 SAR / Express 25 SAR)
3. Payment Method (5 options - all integration-ready):
   - Cash on Delivery ✅
   - Credit/Debit Card → Connect Stripe
   - Apple Pay → Connect
   - Mada → Connect
   - Tamara Installments → Connect Tamara
4. Coupon Code (WELCOME10, FLAT50, EID25)
5. Order Notes
6. Buy Now → Order Created

### Integration-Ready Endpoints (External Services)

**Delivery Integration:**
- POST /api/webhooks/delivery/update - External delivery service updates order status
- POST /api/webhooks/delivery/assigned - Driver assigned notification
- Order tracking with driver_name, driver_phone, location, eta

**Payment Integration:**
- POST /api/payments/create-intent - Returns supported_methods
- POST /api/webhooks/payment/confirm - Payment confirmation
- Supported: card, apple_pay, mada, tamara_installments, cash_on_delivery

**Other APIs:**
- Coupons: validate, 3 codes seeded
- Reviews: add/get per product, auto-update rating
- Social: posts/like/comment/bookmark
- Ads: create/view/my-ads with budget/duration

## Test Credentials
Phone: 0500000000 | Password: test1234
