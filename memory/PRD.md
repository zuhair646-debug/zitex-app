# Zitex — Product Requirements (Living Doc)

## Vision
Zitex — Comprehensive Tech Store native mobile app (iOS + Android) with e-commerce, social feed, competitions, delivery, chamber portal, and merchant admin panel.

## Current release: v1.13.5 — Live Preview Command Center
- **NEW: Order Heatmap** — 7×24 grid in General tab showing peak day + peak hour with color intensity
- **NEW: Real-time Alerts Bell** — glassmorphic bell in banner with unread badge, sheet with severity colors (info/success/warning), one-tap ack + "قراءة الكل"
- **NEW: PDF Export** — every Driver/Branch/Marketer/Employee sheet exports print-optimized HTML report with gold branded template
- **Enhanced Product Analytics Sheet**: buyers list (name, quantity, source POS/App, branch), top branches selling this product, purchase source breakdown (direct/social/link/referral/ad)
- **Enhanced Service Analytics Sheet**: technicians with completed count, avg duration, revenue per tech, avg rating
- **Enhanced Competition Analytics Sheet**: peak hour chip, engagement rate, detailed winners with phones + picked_at

## Previous release: v1.13.4 — Live Preview Deep Drill-Down
- **NEW: Merchant Live Preview 2.0** — every entity is now tappable and opens a rich detail sheet:
  - **Driver Sheet**: KPIs (today/week/month/year deliveries + earnings), 7-day sparkline, positive/negative reviews with ratings, employment info, assigned branches
  - **Branch Sheet**: Orders breakdown (today/yesterday/2days/week/month/year), revenue split (in-store vs app), monthly-target progress bar, 30-day sales pulse, full staff list (tap → employee sheet)
  - **Marketer Sheet**: Platform breakdown (TikTok/Snapchat/Instagram/Twitter/WhatsApp) with clicks/conversions/revenue per channel, top posts, commission timeline
  - **Employee Sheet**: Performance KPIs, salary/hours/attendance, bonuses & deductions, **Supervisor Notes system** (add/view rating + note, type: positive/improvement/warning)
- **NEW: Social Media Parity** — merchant now sees the exact same feed as customers (same visual style: light cards, stories row, poll bars, contact chips) with a glassmorphic "إحصائيات" overlay pill and a dedicated Insights sheet showing likers, sharers, comments, and one-tap direct reply
- **Cross-navigation**: driver ↔ branch, branch ↔ employees, employee ↔ branches
- **Tab order**: المتجر → الصيانة → المسابقات → السوشيال ميديا → العام (last)

## Previous release: v1.12.0 — Zenrex Store
- **Rebrand:**
  - App renamed `Zitex` → `Zenrex Store` (bundle ID unchanged: `com.smartangle.zitex`)
  - New gold ornate "Z with crown" logo across icon, splash, adaptive-icon, favicon, notification
  - All user-visible strings updated across 20 languages (i18n.tsx)
  - Merchant seed name updated to "Zenrex Store" (email `owner@zenrex.ai`)
- **Backend migrated to Hetzner VPS:**
  - New production API: `https://api.zenrex.ai` (Let's Encrypt SSL, auto-renew)
  - Isolated MongoDB on port 27018 (does not conflict with user's other sites)
  - FastAPI on port 8100 behind Nginx reverse proxy
  - Daily backup at 3 AM (systemd timer, 14-day retention)
  - Deploy script fixed: python-dotenv/pyjwt/multipart, workers=1 (no seed race)
  - `frontend/.env.production` now points to `https://api.zenrex.ai`
- **Phase C-2 Multi-type Inventory**:
  - Per-branch inventory now supports `combined` or `separate` mode
  - `stock_store` decrements on POS sales; `stock_app` decrements on online orders
  - Merchant dashboard `/merchant/inventory` with tabs (All / Store / App / Alerts)
  - Low-stock alert banner on merchant home
  - Quick +/- adjust buttons + full-edit modal
  - Movements log (`stock_movements` collection)

## Earlier milestones (v1.8.0 and before)
- Services module: distance-based pickup/delivery fees, timeline videos
- Dual warranty (shop + manufacturer)
- Interactive color circles on product detail
- Affiliate/Marketer approval + stats dashboard
- Day/Night theme (Gold/Black/White)
- Merchant Live Preview (customer emulator + live analytics)
- Full color unification (Gold/Black/White only)

## Backlog
- Phase D — Support tickets CRUD + Kanban task board
- Phase E — Deep social analytics + sales charts + employee performance
- Chamber of Commerce portal minor bug fixes (needs user spec)
- Customer map auto-enforcement on first load

## Auth accounts (`/app/memory/test_credentials.md`)
- Merchant: 0509999999 / merchant2025
- Cashier: 0530000001 / emp1234
- Marketer: 0530000002 / emp1234
- Driver: 0540001111 / driver1234

## Tech stack
- Frontend: Expo Router + React Native + AsyncStorage theming
- Backend: FastAPI + Motor (MongoDB)
- Storage: Emergent Object Storage
- CI/CD: EAS Build & Submit (auto per `/app/memory/auto_release_rule.md`)
