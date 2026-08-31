# Auto-Release Rule (Zitex Project)

**قاعدة أنشأها صاحب المشروع في هذا الفورك:**

> "بعد أي تعديل أو ميزة جديدة تضيفها، ارفع تحديثاً مباشرة على متجر Apple ومتجر Android حتى أشاهد التغييرات على جوالي."

## MANDATORY WORKFLOW (Zitex only — main branch)

Every time you finish a set of user-requested edits, before calling `finish`:

1. **Bump version** in `/app/frontend/app.json`:
   - Increment `version` (patch: 1.3.2 → 1.3.3)
   - Increment `buildNumber` (iOS) by +1
   - Increment `versionCode` (Android) by +1

2. **Commit + push to GitHub** (`origin/main`):
   ```bash
   cd /app && git add -A && git commit -m "vX.Y.Z: <summary>" && git push origin main
   ```

3. **Trigger EAS builds** (both platforms, non-interactive, no-wait):
   ```bash
   export EXPO_TOKEN="YVBYBJdtkXOHvpXZo16yxyXCtePkaeIzt00acoO6"
   cd /app/frontend
   eas build --platform all --profile production --non-interactive --no-wait \
     --message "vX.Y.Z - <summary>"
   ```
   Capture the two build IDs from the output.

4. **Launch background auto-submit script** (`/tmp/eas_auto.sh`):
   - Polls EAS every 60s
   - Once build finishes → runs `eas submit --platform <os> --id <build_id>`
   - Retries up to 3× on `503 Service Unavailable` transient errors
   - Logs to `/tmp/eas_release.log`

5. **Report to user**: build URLs + expected TestFlight/Play Internal availability
   time (usually 5-10 min for iOS, immediate for Android internal track).

## Credentials (all saved)
- `EXPO_TOKEN`: `YVBYBJdtkXOHvpXZo16yxyXCtePkaeIzt00acoO6`
- `EXPO_APPLE_APP_SPECIFIC_PASSWORD`: `srls-tdmj-ddmz-ijnm`
- Google Service Account: `/app/zitex-upload-f1fcca92544c.json`
- iOS ASC App ID: `6773073572`
- Bundle ID: `com.smartangle.zitex`

## Skip auto-release ONLY when:
- Change is purely internal to backend (no user-visible change)
- User explicitly says "don't publish yet"
- Broken/half-done work — must land a working state first

## Current released versions
- iOS: v1.3.7 (build 19) — Building on EAS ⏳ (2026-06)
- Android: v1.3.7 (versionCode 20) — Building on EAS ⏳ (2026-06)
- Previous: v1.3.2 (build 15/vc 16) — Submitted to App Store & Play Console ✅ (2026-08-31)
