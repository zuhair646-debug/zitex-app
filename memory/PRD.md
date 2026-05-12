# Tech Store App - Complete PRD

## Overview
Full-featured Tech Store mobile app. React Native (Expo) + FastAPI + MongoDB. All features from PDF design files implemented with English UI.

## Complete Screen Map (20+ screens)

### Auth: Sign In → Sign Up → Login (JWT)

### Tab 1 - Home
Header (Notifications/Search/Store/Location/Cart) → Banner → Categories (6) → Used Devices 75% OFF → Hot Products → iPhone 16 Banner → Best Deals → Competition Progress

### Tab 2 - Services (API-connected)
Promo card + 6 services from API → **Service Detail** (price, inspection, delivery/pickup/warranty options, rating) → **Book Service** modal (device model, issue, delivery type) → Service Booking created

### Tab 3 - Competitions (API-connected + Draw)
3 competitions from API → **Competition Detail** → Quiz (5 questions, 70% to qualify) → **Internal Draw** (random winner from participants) → Winners display

### Tab 4 - Social
Stories row → Posts feed with images → Polls → Like/Comment/Bookmark/Share

### Tab 5 - Profile (All sub-screens connected)
- **My Orders** → Filter (All/Processing/Completed/Canceled)
- **Invoices** → Invoice list with INV-XXXXX format, subtotal/tax/total
- **Favorites** → Product list with unfavorite action
- **Warranties** → Active warranties with progress bars, days left
- **Addresses** → Saved addresses (default badge), add/edit/delete
- **Wallet** → Balance (50 SAR) + Points (199) + Transaction history
- **Support** → Tickets with replies + Create new ticket modal
- **About Store** → Riyadh/Jeddah selector, phone, address, social links
- **Notification Settings, Language, Return Policy, Terms**

### Other Screens
- **Notifications** (6 types) | **Product Detail** (colors/storage/specs) | **Cart** (summary/checkout) | **Search** (filter/category pills)

## API Endpoints (30+)
Auth, Products, Categories, Brands, Cart, Orders, Favorites, Banners, Competitions (CRUD + Draw + Quiz), Services (CRUD + Book), Wallet, Addresses, Ads, Support Tickets, Warranties, Invoices

## Test Credentials
Phone: 0500000000 | Password: test1234
