# Zenrex — Roadmap, phases & reminders (owner-approved)

## ⏰ REMINDERS FOR THE OWNER (tell him proactively)
1. **At official launch** (app live on App Store / Google Play): remind the owner to set the real
   referral landing link (web store URL or smart download page) → env `APP_OPEN_URL` on the VPS
   (currently default `zenrex://` = opens installed app only). Build the "download the app" fallback page then.
2. At launch: replace demo business profile (VAT 300000000000003) with the real VAT / CR / address.
3. At launch: set `WEBHOOK_SECRET` on VPS and give it to the payment/shipping providers.
4. End of project: full 20-language scan (see TRANSLATION_RULES.md) + switch translation provider if desired.
5. ZATCA Phase 2 (XML UBL, CSID, clearance) once the owner has Fatoora portal registration.

## Business model
Each merchant gets an independent full copy of the app (white-label, own developer accounts). Single-store per copy.

## Phases (audit iteration_46 → plan approved Oct 28 2026)
- ✅ Phase 1 Security — v1.25.0
- ✅ Phase 2 ZATCA Phase-1 invoices + inventory — v1.25.0
- ✅ Phase 3 Marketers (standalone marketer, payouts, referral links) — v1.26.0
- ✅ Payout minimums configurable by merchant (default 50 SAR; marketer + driver) — after v1.26.0
- ⏳ Phase 4 Competitions (edit, safe draw, winners, prize claim, real type logic, notifications, loyalty)
- ⏳ Phase 5 Others (bookings fields, driver assignment, customer history, loyalty double award, marketer stats inside section)
- 💡 Proposed: POS barcode scanning + barcode generation + quick customer account + invoice via WhatsApp/SMS (awaiting approval)
- Later: real payment gateway, real shipping carriers, loyalty programs contracts, driver wallet/withdrawals (driver_min already stored).

## Decisions (Oct 28 2026, later)
- Order: Phase 4 competitions → then inventory + barcode together.
- Invoice to customer: WhatsApp from the seller's phone (free). Printed barcode labels (name, price, barcode). Phone must replace all store devices.
- INVENTORY MODEL (approved): single source of truth = branch_inventory per branch/product; product.stock = sum of branches (auto). Store setting: shared (default, one pool for shop+app) or split (shop pool + app pool, transfer between them), per-product override. Phone does: sell-scan, stock count by scan, receive goods by scan, branch transfers, low-stock alerts, returns to the right branch. App sells from nearest branch with stock. Later: Excel import/export / external system sync. First step: migrate current product.stock into the main branch.

## 🚚 Delivery System v3 — user requirements (Oct 2026, verbatim summary)
- Driver section: language selector (same 20 langs) + light/dark theme option inside driver settings.
- Customer chooses at checkout: EXPRESS (hot, now; priced per km set by merchant, higher), STANDARD (cheaper; picks day + morning/evening slot per merchant settings & daily capacity), SHIPPING (outside branch range).
- Nearest branch shown to customer; if nearest branch lacks product → offer transfer to another branch that has it → becomes shipping with fee/ETA by distance from map pin.
- Merchant: driver shifts (morning/evening + start time) and pools (express / standard / both).
- Express: direct to nearest express-pool driver; if busy, next order comes after finishing current.
- Standard: auto-distributed night before (22:00) per slot to that slot's drivers, by area then equal count, sequenced by shortest route; merchant can move orders. At shift start driver picks all from store, then goes order #1 → customer gets push + in-app bottom live tracking banner (map, live route, ETA).
- Tips: after delivery customer can tip driver (5/10/15/custom) — via wallet.
- Map branding: driver marker = small car with our Z logo (black/gold), and "Zenrex" brand name fixed on top of every map (customer, driver, merchant) — platform identity, constant for all merchants.
