# Tech Store App - PRD

## Overview
Full-featured Tech Store mobile app built with React Native (Expo) + FastAPI Backend + MongoDB. Matches PDF design files exactly with English UI.

## All Screens Implemented

### Auth Flow
- Sign In (Phone + Password) → Sign Up → Login with JWT tokens

### Home Screen (Tab 1) - Matching PDF design
1. Header: Notifications + Search | "Riyadh Store" | "My home" | Cart(3)
2. Banner Slider
3. Categories: Phones, Tablets, Laptops, Accessories, Smartwatches, Gaming
4. "Used Devices" Banner: 75% OFF
5. Hot products section
6. iPhone 16 Featured Banner
7. Best deals section
8. Competition Progress bar

### Services (Tab 2)
- Promo card + 6 repair services with prices/request counts

### Competitions (Tab 3) - FULL INTERNAL DRAW SYSTEM
- Competitions loaded from API (3 seeded: Eid Draw, Summer Giveaway, Accessories Bundle)
- Competition Detail screen: Info, dates, participants, prizes
- Answer & Win Quiz: Multiple choice (70% to qualify)
- Internal Draw Mechanism: Random winner selection from participants
- Winners display with "Get the gift" button
- Participants list with names and phone numbers

### Social (Tab 4)
- Stories row + Posts feed + Polls + Like/Comment/Bookmark

### Profile (Tab 5)
- User info + Wallet card → Connected sub-screens

### Sub-Screens (All Connected)
- **Orders**: Filter tabs (All/Processing/Completed/Canceled), order cards with status
- **Wallet**: Balance card (50 SAR) + Points card (199) + Transaction history
- **Addresses**: Saved addresses (My home default, Office), Edit/Delete, Add new
- **About Store**: Store info, Riyadh/Jeddah selector, phone, address, social links
- **Notifications**: 6 notification types + Clear all / Mark all as read
- **Product Detail**: Image, colors, storage, specs, reviews, Add to Cart / Buy now
- **Shopping Cart**: Items, quantity, Order Summary, Place Order
- **Search**: Search bar, category filter pills, product grid

### Paid Ads System (Backend)
- GET /api/ads - Active ads
- POST /api/ads - Create new ad (title, description, type, budget, duration)
- GET /api/ads/my - My submitted ads
- 3 seeded ads: iPhone 16 Pro offer, Screen Repair 50% OFF, Trade-in promotion

## Navigation
Bottom Tabs: Home | Services | Contests | Social | Profile

## Tech Stack
- Frontend: React Native / Expo SDK 54 / Expo Router
- Backend: FastAPI / Python / Motor (async MongoDB)
- Auth: JWT + bcrypt

## Test Credentials
- Phone: 0500000000 | Password: test1234
