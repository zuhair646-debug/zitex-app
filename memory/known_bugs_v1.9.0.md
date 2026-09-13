# Known bugs & minor issues (v1.10.1)

## RESOLVED in v1.10.1
- ✅ Live Preview crashes with `Unexpected text node: . A text node cannot be a child of a <View>` on services section (fixed via `!!` type-guards everywhere)
- ✅ More menu missing "المسوّقون والعمولات" link — added
- ✅ More menu missing "كل الحجوزات" link — added
- ✅ `bookings.tsx` had English "No bookings yet" — full Arabic rewrite with status filter tabs
- ✅ Inventory cards didn't visually show whether pool is store-only / app-only / both — added dedicated channel pill

## STILL PENDING (P2)
- Chamber of Commerce portal minor bugs — user hinted, not yet specified
- `shadow*` style props emit deprecation warnings (functional but noisy) → migrate to `boxShadow`
- Some seeded competition images point to unreachable hosts → `ERR_NAME_NOT_RESOLVED` in console
- Movements log has no dedicated frontend screen yet (API only)

## STILL PENDING (P3)
- Inline video autoplay muted inside Live Preview product cards
- Tap-to-zoom on Social post images
- Add `testID` attributes to Inventory + Bookings screens (nice-to-have for automation)
