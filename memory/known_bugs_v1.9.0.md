# Known bugs & minor issues — tracked for later

Recorded on: 2026-09-13, session v1.9.0
Priority: `P0` = blocker, `P1` = important, `P2` = minor / polish

## P2 — Chamber of Commerce portal
- User mentioned "1 or 2 unknown bug points" in the Chamber section.
- Action: Ask user to specify or open the module and QA all workflows (competitions approval, draw, reports, supervisor list).
- Location: `/app/frontend/app/chamber/*`, `/api/chamber/*`

## P2 — Live Preview polish
- Merchant Live Preview analytics button was previously only reachable via long-press. Fixed in v1.9.0 with a visible tap-target.
- (Still pending) Add tap-to-zoom for images inside Social posts.
- (Still pending) Support inline video autoplay muted in Live Preview product cards (currently only images shown).

## P2 — Services
- Some services do not have images yet. UI now shows a graceful fallback icon.
- No image uploader guardrail in merchant/services form — a service can be saved with no image.

## P2 — Competitions
- `ends_at` / `starts_at` fields are inconsistent across older seeds (some use `draw_at`, `created_at`). The live-summary endpoint handles both, but the merchant creation form should always write ISO into `ends_at` + `starts_at`.

## P3 — Inventory (v1.9.0 delivered)
- Adjust +/- resets to the current stock. Consider adding bulk adjust in future.
- Movements log currently has no dedicated screen (only via API); a `/merchant/inventory/movements` screen is a nice-to-have.
