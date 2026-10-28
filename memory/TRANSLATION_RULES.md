# Zenrex Store — Translation Rules (LOCKED, Oct 2026)

These rules are the agreed contract with the owner. Do not change behaviour without his approval.
A full 20-language scan (`tests/full_lang_scan.py`) MUST be run again at the end of the project.

## 1. Languages
- 20 languages: ar, en, ur, fa, es, fr, de, it, pt, ru, tr, zh, ja, ko, hi, bn, id, ms, th, he.
- RTL: ar, ur, fa, he. Every screen must work in both directions.

## 2. Three layers
1. **Static UI keys** — `frontend/src/i18n.tsx` (`t('key')`), written by hand for all 20 languages.
2. **Static Arabic strings in code** — `<TX>`, `tSync()`, `tf()` → pre-translated into
   `frontend/src/i18n-generated.json` by `python3 scripts/bulk_translate.py` (run after adding any new Arabic UI text).
   The script never stores failed lines.
3. **Dynamic content** (products, names, posts, services, competitions, brands) — `TranslatableName` /
   `Translatable` → `/api/translate/bulk` → cached forever in Mongo `translations_cache` (shared by all merchants).

## 3. Display rules
- A text is shown **entirely in the viewer's language and alphabet**. Never Arabic + English mixed.
- Brand & product names are written in the viewer's alphabet (iPhone → آيفون in Arabic, アイフォン in Japanese).
  Latin-script languages keep the Latin brand name.
- Allowed Latin in non-Latin scripts: digit codes (M3, 15, 256GB), short uppercase codes (POS, SAR, AI),
  units (km, kg, cm, mm, ml, mAh), iOS, and the app name "Zenrex Store". Emails/handles stay as is.
- Persian/Urdu always use ک / ی (never Arabic ك / ي).
- Default view = translated text. The small translate toggle shows the original; pressing again returns to translation.
- Names (people/stores) use `noToggle` where the toggle would clutter (chips, headers).

## 4. Validation
- Backend `_clean_ok()` (`backend/translate.py`) rejects any translation in the wrong script and retries once
  with a stricter prompt. Rejected results are never cached.
- Multi-line texts (posts, descriptions) are translated one by one (not in the numbered bulk format).

## 5. AI provider
- All AI calls go through `_llm()` in `backend/translate.py`.
- Provider switch: Merchant → More → "مزوّد الترجمة الذكية" (`/merchant/ai-provider`):
  Emergent (current) or the owner's own OpenAI-compatible platform + optional Emergent fallback.
- Switching provider later is deferred by the owner until the end of the project.

## 6. Final check (end of project)
- `python3 tests/full_lang_scan.py` (all roles × all screens × 20 languages) → 0 real issues, 0 toggle failures.
- Then verify on a real Android + iPhone build.
