# Zenrex v1.13.9 — Phase A/B/C/D Complete

## Phase A — Smart Shipping Matrix (Backend + Merchant UI + Customer Picker)
- `shipping_matrix.py` module registered
- Collection: `shipping_matrix` with rules (carrier × branch × city)
- Merchant CRUD: `/api/merchant/shipping/matrix` GET/POST/PUT/DELETE
- Customer live rate: `POST /api/checkout/shipping-options` with lat/lng auto city inference
- Merchant screen: `/merchant/shipping-matrix`
- Customer widget: `ShippingOptionsPicker` in checkout

## Phase B — RMA (Returns/Warranty) — Noon-style
- `rma.py` module registered
- Collection: `rmas` (order-item level)
- Per-product return rules on `Product` model: `allow_return`, `return_days`, `manufacturing_defect_days`, `return_conditions`
- Full state machine: pending → approved → picked_up → inspecting → resolved → refunded
- 9 reason codes, 4 resolution types
- Refund route mapping: card→original, cod→wallet, bnpl→original
- Auto wallet credit on refund
- Merchant screen: `/merchant/returns`
- Customer screens: `/my-returns`, `/create-return`, `/rma-detail`

## Phase C — Saudi Loyalty Programs Framework
- `loyalty_programs.py` module registered
- 8 KSA programs seeded: Qitaf, Mokafaa, AlFursan, White Points, Riyad Rewards, SNB WOW, urpay Points, Internal
- Merchant enable/disable + credentials vault + legal_docs
- Adapter framework (authorize/redeem stubbed; real integration requires contracts)
- Merchant screen: `/merchant/loyalty-programs`

## Phase D — Feature Modules Toggle (SaaS-ready)
- `tenant_modules.py` module registered
- 21 modules across 8 categories
- Public `/api/tenant/modules` for frontend hide/show
- Merchant screen: `/merchant/services-catalog`
- Enables cloning app for other merchants — flip flags to customize

## Test Verified (Python API smoke)
- Customer login → order → mark delivered → returnable list → create RMA → merchant approve → inspect refund → wallet credited ✅
- Modules toggle (chamber) reflects in public endpoint ✅
- Shipping options for Riyadh coords returns 3 carriers ✅

## Deferred
- Real carrier API integrations (contract-gated per merchant)
- Real loyalty program APIs (contract-gated)
- server.py refactor to /routes/ (P1 next)
