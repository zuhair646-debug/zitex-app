# 🚨 CRITICAL PERMANENT RULE — Auto Release After EVERY Change
# =====================================================================
# Owner instruction (Arabic): "ارفع تحديث دايم خليها قاعده عندك"
# Owner reinforcement (25/9/2026): "حطها قاعدة دايم ارفع على المتاجر بشكل مباشر"
# Translation: "Always publish an update AND submit DIRECTLY to the stores
# (TestFlight + Play Internal Track) — this is a PERMANENT RULE, never skip."

## Non-negotiable Publishing Rule
After ANY successful feature, bug fix, polish, or content change on this
repo, the agent MUST:
1. Bump `expo.version`, `ios.buildNumber`, `android.versionCode`
2. Commit + push to `main`
3. Run `eas build --platform all --profile production --no-wait`
4. Spawn the auto-submit poller (`/app/memory/tools/auto_submit_template.sh`)
   which auto-submits to:
   - **TestFlight** (iOS App Store Connect) — user tests immediately
   - **Play Store Internal Track** (Android) — user tests immediately
5. Log poller PID in this file so next agent can check status
6. Never ask "should I publish now?" — always publish

## The 6-Step Auto-Release Sequence (NEVER skip)
Any agent working on this repo — after ANY successful feature, bug fix,
polish, or content change — MUST execute the following sequence BEFORE
calling `finish`:

1. **Bump versions** in `frontend/app.json`:
   - `expo.version` → next semver
   - `expo.ios.buildNumber` → +1
   - `expo.android.versionCode` → +1
2. **Backend health**: `sudo supervisorctl restart backend && sleep 4`
3. **Tests**: run the relevant pytest suites — everything must be green.
4. **Commit**: `git add -A && git commit -m "vX.Y.Z: <what changed>"`
5. **Push**: `git push origin main`
6. **Build & submit** on Expo + submit to TestFlight and Play:
   ```
   export EXPO_TOKEN="YVBYBJdtkXOHvpXZo16yxyXCtePkaeIzt00acoO6"
   export EXPO_APPLE_APP_SPECIFIC_PASSWORD="srls-tdmj-ddmz-ijnm"
   cd /app/frontend && eas build --platform all --profile production \
     --non-interactive --no-wait --message "vX.Y.Z - <what>"
   ```
   Then spawn a **persistent background poller** with `nohup bash <script> & disown`
   that waits for FINISHED status and auto-submits. Template lives in
   `/app/memory/tools/auto_submit_template.sh`.

## Environment credentials (already valid, DO NOT ask user)
- `EXPO_TOKEN`               → `YVBYBJdtkXOHvpXZo16yxyXCtePkaeIzt00acoO6`
- Apple app-specific pw      → `srls-tdmj-ddmz-ijnm`
- Google Play service account→ `/app/frontend/../zitex-upload-f1fcca92544c.json`
- Bundle IDs                 → iOS `com.smartangle.zitex` / Android `com.smartangle.zitex`
- ASC App ID                 → `6773073572`

## Retry policy
- If `eas submit` fails once → sleep 30s → retry
- If it fails 3 times consecutively → log to `/tmp/eas_release.log` and
  continue with next attempt every 10 minutes (Apple / Google are sometimes
  transiently down). The template script implements this.

## Current released versions
- iOS: v1.13.0 (build 37) — Zenrex Store rebrand + Hetzner backend — build in progress (poller PID 13125 will auto-submit)
- Android: v1.13.0 (versionCode 38) — Zenrex Store rebrand + Hetzner backend — build in progress (poller PID 13125 will auto-submit)
- v1.11.2: Android submitted ✅ (23/9/2026)
- v1.11.1: iOS submitted ✅ (17:18 UTC 23/9/2026)
- v1.10.1 & prior: submitted ✅

## Version-bump quick reference
Feature category → semver bump:
- Bug fix / spelling / small tweak            → patch (x.y.**Z**)
- New sub-feature (screen, endpoint, module)  → minor (x.**Y**.0)
- Big refactor / breaking change              → major (**X**.0.0)

## DO NOT
- ❌ Skip auto-release "because the change is small"
- ❌ Ask the user "should I publish now?"
- ❌ Downgrade a version to reuse a build number
- ❌ Leave EAS submit unattended (always spawn the retry poller)
- ❌ Modify EXPO_PACKAGER_PROXY_URL, EXPO_PACKAGER_HOSTNAME in .env
