# Zitex — Product Requirements (Living Doc)

## Vision
Zitex — Comprehensive Tech Store native mobile app (iOS + Android) with e-commerce, social feed, competitions, delivery, chamber portal, and merchant admin panel.

## Current release: v1.13.8 — Saudi Payments + Shipping + Loyalty
- **Payment Framework** — 15 Saudi providers seeded (Mada [SAMA-mandated], Visa, Mastercard, Apple Pay, STC Pay, urpay, Tabby [SAMA-licensed], Tamara [Sharia compliant], SADAD, Bank Transfer, COD + gateways: HyperPay, Moyasar, PayTabs, MyFatoorah). Each has brand color, category, sama_licensed, bnpl, cod flags, credentials schema. Merchant admin toggles each on/off.
- **`PaymentMethodsRibbon`** — glass-blur sticky ribbon at bottom of checkout, mini tiles with SAMA badges + BNPL 'قسّط' pills + tap-for-details sheet with legal note
- **Shipping Framework** — 10 Saudi carriers seeded (SMSA, Aramex, Naqel, J&T, Zajil, Aymakan, Saudi Post SPL, DHL, Fetchr, Torod aggregator) with brand colors, ETA, base+per-kg pricing, cod_supported flags
- **Loyalty Points System** — 4 tiers (Bronze/Silver/Gold/Platinum) with escalating perks (earn multiplier, free shipping threshold, extra warranty days, priority shipping, VIP support). Auto-award on order (with tier multiplier), service, competition, review, referral, birthday
- **`LoyaltyWidget`** — tier badge, balance, progress to next tier
- **Loyalty History screen** — perks grid + full transaction feed with source icons
- Backend: `GET /api/checkout/options`, `GET/PUT /merchant/settings/payments`, `GET/PUT /merchant/settings/shipping`, `GET /loyalty/balance /history`, `POST /loyalty/earn /redeem`

## Previous release: v1.13.7 — Competition Detail + Live Toast
- **NEW: Competition Detail Sheet** — full-modal with hero banner + 4 tabs:
  - نظرة عامة: KPIs, peak hour chip, daily pulse, sources bars, top cities bars
  - المشاركون: full list with avatar/city/source/timestamp + tap-to-call
  - الفائزون: gold gradient cards with rank/name/masked phone/prize + call button
  - الشروط: description, prize card, numbered rules, timeline
- **NEW: Live Toast Notifications** — animated spring-in from top:
  - Polls unread every 15s, first-load marks existing as seen (no spam)
  - Auto-dismiss after 6s, tap to ack on server
  - Stack counter badge if multiple queued
  - Severity color-coded with glass blur backdrop
- **NEW: Test alert endpoint** — `POST /alerts/test` fires random alert to demo the flow
- **UI:** "اختبار" button in alerts bell for demo

## Previous release: v1.13.6 — Full Transparency Fixes
- **Bug fixes from user's video review:**
  - Services: warranty badge no longer overlaps image edge (elegant bottom-right green pill)
  - Services/Products/Competitions: entire card is tappable to open analytics (not just the tiny icon)
  - Services: "التفاصيل" hint pill on card image
  - Empty 0/0/0 analytics fixed via automatic demo seed on startup
- **Full transparency in Social tab:**
  - Post like/share/comment counts are all tappable — each jumps to the correct insights tab
  - 4-tab insights sheet: نظرة عامة / المُعجبون / التعليقات / المشاركات
  - Likers view: full user list with avatars + timestamps
  - Sharers view: grouped by platform (TikTok, Snapchat, Instagram, WhatsApp, Twitter, Copy Link) with color-coded chips
  - Comments view: one-tap "رد باسم المتجر" button on unanswered comments with optimistic UI
- **Backend seed:** `_seed_preview_analytics()` auto-generates realistic views/orders/invoices/bookings/reviews/competition entries/post interactions on startup
- **Merchant post detail endpoint** now returns `sharers[]` + `shares` KPI

## Previous release: v1.13.5 — Live Preview Command Center
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

---
## v1.13.9 — Phase A/B/C/D Complete (2026-09-25)

### A. مصفوفة الشحن الذكية
- Backend: `shipping_matrix.py` — قواعد شحن (شركة × فرع × مدينة) مع live rate calculation
- Frontend merchant: `/merchant/shipping-matrix` — CRUD كامل بواجهة عربية
- Frontend customer: `ShippingOptionsPicker` مدمج في checkout — يعرض تلقائياً شركات الشحن حسب الموقع

### B. نظام الإرجاع والضمان (RMA) على طريقة Noon
- Backend: `rma.py` — جدول `rmas` على مستوى المنتج داخل الطلب
- إضافة حقول لكل منتج: `allow_return`, `return_days`, `manufacturing_defect_days`, `return_conditions`
- 9 أسباب إرجاع + 4 حلول (استرداد/استبدال/إصلاح/محفظة)
- تحويل استرداد ذكي: بطاقة→للبطاقة، COD→المحفظة، BNPL→للأصل
- إيداع تلقائي للمحفظة عند الاسترداد
- Merchant: `/merchant/returns` — Tabs + قرارات + فحص
- Customer: `/my-returns`, `/create-return`, `/rma-detail`
- زر "طلب إرجاع" أُضيف لكل طلب مكتمل

### C. برامج الولاء السعودية (إطار Adapter)
- Backend: `loyalty_programs.py` — 8 برامج (قطاف، مكافآت، الفرسان، وايت، ريّاض، الأهلي WOW، urpay، داخلي)
- كل برنامج: تفعيل/إيقاف + بيانات اعتماد + وثائق قانونية
- Merchant: `/merchant/loyalty-programs`
- ملاحظة: التكامل الفعلي مع API الشركات يتطلب عقد شراكة رسمي

### D. Feature Toggles (SaaS-ready)
- Backend: `tenant_modules.py` — 21 ميزة في 8 فئات
- Merchant: `/merchant/services-catalog` — يتحكم بإظهار/إخفاء أي ميزة
- Public endpoint: `/api/tenant/modules` — الواجهة الأمامية تقرأه لإخفاء/إظهار
- يمكّن استنساخ التطبيق لتاجر آخر بتعديل toggles فقط

### Testing
- 37/38 pytest passed (بعد إصلاحين: rename external redeem + cash_on_delivery route)
- End-to-end RMA flow: تم اختباره كاملاً (طلب → توصيل → إرجاع → موافقة → فحص → استرداد المحفظة)

### Version
- app.json: 1.13.8 → **1.13.9**
- versionCode: 46 → **47**

## v1.13.14 — Kind-aware Deep Analytics (Live Preview)
### Scope
Applied the approved "Product Analytics" design pattern (Design Lock 2026-09-26) to:
- Services (`/merchant/service-analytics?id=…`)
- Competitions (`/merchant/competition-analytics?id=…`)
- Social Posts (`/merchant/post-analytics?id=…`)

### Backend fixes (`deep_analytics.py`)
- Services: revenue now derived from `service_bookings.total_fee` (was 0)
- Competitions: read from `competition_entries` collection using `joined_at` ts + `capacity_pct`, `winners_count`, `prize_count`
- Posts: `likes`/`shares` as int totals; `liked_by`/`shared_by` as drill-down lists; adds `reach_estimate`, `engagement_score`
- Traffic sources, top visitors, buyer/booker/participant lists, comparison table — all populated per kind

### Frontend (`product-analytics.tsx`)
Kind-aware label set (`L`) drives:
- KPI grid (10 tiles per kind, e.g. services show "الحجوزات/إيرادات الخدمة", competitions show "مسجلون/نسبة الامتلاء", posts show "الوصول/نقاط التفاعل")
- Funnel stages (services "حجز → تنفيذ → إنجاز", competitions "سجّل → أكمل → دخل السحب", posts "أعجبوا → علّقوا → شاركوا")
- Hero pills (winners badge for competitions, reach badge for posts)
- Comparison table headers per kind

### Testing
- Backend 4/4 endpoints pass pytest (`test_deep_analytics_v1_13_14.py`)
- Frontend 4/4 flows pass end-to-end via testing_agent (iteration_25.json)
- Production VPS verified live via curl on https://api.zenrex.ai

### Version
- app.json: 1.13.13 → **1.13.14**
- iOS build: 45 → **46**
- Android versionCode: 51 → **52**
- EAS build triggered for both platforms — auto-submit poller running

## v1.13.15 — Rich Content + Returns/Complaints/Winners/Videos Tabs
### Terminology Fixed (KSA-standard from research)
- Social Media: منشور، التفاعل، الوصول، الانطباعات، المشاركات، الإعجابات، التعليقات
- Competitions: مشترك، فائز، مرشح، جائزة السحب، معدل المشاركة
- Removed all "أضيف للسلة" leaks from non-product analytics screens

### New Analytics Sections
- **Services**: 5th KPI row (طلبات إرجاع + الشكاوى) + tabs (الإرجاعات، الشكاوى with reply thread)
- **Competitions**: 5th KPI row (الفائزون + فيديوهات ترويجية) + tabs (الفائزون with prize_value/city/claim_status، الفيديوهات archive that survives past competition end)
- **Posts**: 5th KPI row (التعليقات + معدل التفاعل)

### Layout Fixes
- fmt() number formatter (K/M) prevents overflow: 17.8K, 1.2M
- adjustsFontSizeToFit + numberOfLines=1 on every KPI text
- Unified across all 4 kinds

### Rich Seed Content (backend/seed_rich_content.py)
- 52 diverse social posts (9 types: event, live_update, announcement, tip, tech_news, challenge, meme, poll)
- 26 service returns with realistic reasons & statuses
- 25 service complaints (categories: جودة, تأخير, سعر, تواصل الموظف, نظافة, ضمان) with merchant replies
- 68 realistic service reviews (weighted 5-star bias)
- Competition winners: 3-5 per competition with prize_value, city, claim_status
- 2-4 organic-style Pexels promo videos per competition (18-28s clips, no explicit branding)

### Testing
- Backend 3/3 endpoints + Frontend 7/7 areas pass testing_agent (iteration_26.json)
- Production VPS verified live via curl on https://api.zenrex.ai

### Version
- app.json: 1.13.14 → **1.13.15**
- iOS build: 46 → **47**
- Android versionCode: 52 → **53**
- EAS build triggered; auto-submit poller running

## v1.14.0 — Global Theme + Safe-Area + Multi-Media Carousel
### Foundation (design_agent guardrails)
- Bottom Tab Bar: `height = 56 + insets.bottom` (clears Android gesture bar + iOS home indicator)
- Merchant floating tab bar: `bottom = max(insets.bottom, 12)`
- KPI cards: `adjustsFontSizeToFit + numberOfLines=1 + K/M formatter` (v1.13.14+)
- RTL: prefer paddingStart/End, `textAlign: 'auto'`

### Global Theme Provider (src/theme/ThemeContext.tsx)
- Luxe Dark ↔ Luxe Light palettes with full accent set (gold/blue/purple/rose/ok/red/amber)
- Persisted via `AsyncStorage @zenrex_theme_mode`
- StatusBar adapts automatically to mode
- Toggle in customer Settings (syncs both new ThemeContext + legacy mode.ts)

### Multi-Media Carousel (src/components/MediaCarousel.tsx)
- Instagram-style 4:5 paged FlatList
- Dots indicator (max 8, condensed for >8)
- Counter chip top-right
- Image → tap opens full-screen Modal viewer
- Video via expo-video: auto-play muted on active slide, tap to open, duration badge
- Video icon badge distinguishes video slides from image slides
- Handles mixed sequences (images first, video at end)

### Rich Media Seed
- 39/52 posts have 2-4 images
- 16/52 posts include a short organic Pexels promo video at the end
- Deletes and re-seeds legacy single-image posts

### Backend fixes (hotfix commit)
- `/api/social/posts` limit raised 30 → 100
- `/api/merchant/social/posts` serializer now includes `video`, `media`, `shares`, `liked_by`, `shared_by`
- Customer social feed `comments` treated as array-or-number safely

### Version
- app.json: 1.13.15 → **1.14.0**
- iOS build: 47 → **49**
- Android versionCode: 53 → **55**
- EAS build triggered (fresh, latest hotfix included); auto-submit poller running
