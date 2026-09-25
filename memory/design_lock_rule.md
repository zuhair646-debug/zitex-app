# 🔒 CRITICAL DESIGN LOCK — Approved on 2026-09-26

The following screens are FINALIZED and MUST NOT be modified without explicit user permission:

## Approved Design Reference
- `/app/frontend/app/merchant/product-analytics.tsx` — Deep product analytics (v1.13.12)

## Approved Design Language (apply to all merchant analytics screens)
- Colors: BG=#0B0C10, CARD=#151721, BORDER=#2A2D38, GOLD=#F5C518, TEXT=#F5F5F7, MUTED=#9CA3AF, OK=#10B981, RED=#EF4444, BLUE=#3B82F6, PURPLE=#8B5CF6, AMBER=#F59E0B
- Header: back chevron (right) + title (gold, 14pt, 900) + subtitle (muted 10pt) + rank badge (right)
- Hero image: 220px height with dark overlay bottom, condition pill + warranty pill, title, price, rating pill
- KPI grid: 2 columns × N rows, each card border-colored, icon in 20px pill, big value 18pt 900, sub trend text
- Tab bar: horizontal scroll, gold when active, badge count on each
- Section title: 14px 900 gold with icon
- User cards: 36px avatar with initial letter, name + meta text, mini pills
- Charts: horizontal bars for traffic/sales trends
- Funnel: 5 stages with % and colored bars
- Comparison table: highlight current row in gold

## Change Policy
Any change to the approved analytics UI patterns (KPI cards, tabs layout, user cards, color palette, section titles) requires EXPLICIT user approval.

New analytics screens (services, competitions, posts, drivers, employees, branches) MUST replicate this exact design pattern.
