# Zitex — Product Requirements (Living Doc)

## Vision
Zitex — Comprehensive Tech Store native mobile app (iOS + Android) with e-commerce, social feed, competitions, delivery, chamber portal, and merchant admin panel.

## Current release: v1.9.0
- **Phase C-2 Multi-type Inventory** (NEW):
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
