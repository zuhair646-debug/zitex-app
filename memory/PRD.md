# Tech Store App - PRD (متجر التقنية)

## Overview
Full-featured Tech Store mobile app built with React Native (Expo) + FastAPI Backend + MongoDB. Follows the PDF design files exactly with English UI.

## Screens Implemented

### Auth Flow
- **Welcome/Splash** → Sign In → Sign Up → OTP (placeholder) → Complete Profile
- Phone + Password authentication with JWT tokens

### Home Screen (Tab 1)
Matching design PDF page 9 exactly:
1. Header: Notifications bell + Search | "Riyadh Store" ▼ | "My home" ▼ | Cart with badge
2. Banner Slider (promotional images)
3. Categories: Phones, Tablets, Laptops, Accessories, Smartwatches, Gaming
4. "Used Devices" Banner: 75% OFF + "Check it now"
5. 🔥 "Hot products" section + "See all"
6. "iPhone 16" Featured Banner + "Check out now!"
7. 🏷️ "Best deals" section + "See all"
8. 🏆 Competition Progress: "Pick 2 more To enter competition"

### Services (Tab 2)
- Promo card: "Fix your device with us!" + "Book a service"
- 6 services: Screen Repair, Battery Replacement, Water Damage, Software Fix, Device Inspection, Charging Port Fix
- Each with icon, description, request count, price

### Competitions (Tab 3)
- Stats: Active (3), Joined (1), Points (199)
- 3 competitions: Eid Special Draw, Summer Tech Giveaway, Accessories Bundle
- Status badges: Still open, Coming soon, Ended
- Progress bars, prizes, join count

### Social (Tab 4)
- Stories row with "Add story" + store stories
- Posts feed with images, text, polls
- Poll: "What is the best Phone this year!" with vote percentages
- Like, Comment, Bookmark, Share actions

### Profile (Tab 5)
- User info with avatar, name, phone
- Wallet card: Points + Balance (SAR)
- Menu: My Orders, Invoices, Favorites, Addresses, Wallet
- Settings: About Store, Support, Notification Settings, Language
- Legal: Return Policy, Terms & Conditions
- Sign Out

### Other Screens
- **Notifications**: 6 types (Product, Service, Competition, Points, Social, Support) + Clear all / Mark all as read
- **Product Detail**: Image, rating, colors, storage, specs, reviews, "Add to Cart" / "Buy now"
- **Shopping Cart**: Items, quantity controls, order summary (Subtotal + Tax 15% + Delivery), "Place Order"
- **Search**: Search bar, category filter pills, 2-column product grid, "No results found" state

## Bottom Navigation
Home | Services | Contests | Social | Profile

## Tech Stack
- Frontend: React Native / Expo SDK 54 / Expo Router
- Backend: FastAPI / Python / Motor (async MongoDB)
- Database: MongoDB
- Auth: JWT + bcrypt

## Test Credentials
- Phone: 0500000000
- Password: test1234
