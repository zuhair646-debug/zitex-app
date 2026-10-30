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
- **v1.16.7 (iOS build 62, Android versionCode 68)** — Static i18n dictionary (7,464 pre-baked translations for EN/FA/HI/ZH) + backend perf (80 MongoDB indexes + TTL cache + /api/translate/bulk endpoint) — **build IN PROGRESS** (poller PID 1018 auto-submits when ready)
  - iOS build: https://expo.dev/accounts/zuhair-7700/projects/zitex/builds/1b76f632-3b6f-4a8a-b8ba-5218e00a7506
  - Android build: https://expo.dev/accounts/zuhair-7700/projects/zitex/builds/cd62cee4-7a03-4106-872c-e171deab3de6
- v1.13.0 (build 37/38) — Zenrex Store rebrand + Hetzner backend
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

## v1.17.0 release — 2026-10-01
- iOS build: 55762daf-4776-4259-a8e1-7892bf14ef58 (buildNumber 63)
- Android build: 9a996324-e080-472c-b218-58b7a98e6241 (versionCode 69)
- Commit: d2caf6a
- Poller PID: 1279 (status log: /tmp/eas_release_v1.17.0.log)
- Changes: Dynamic translate-on-demand + MongoDB persistent cache, VideoComposer crash fix, TranslatableName component applied on 8 screens

## v1.20.0 release — 2026-10-26
- iOS build: 4c7e4ef0-40c9-4c6e-83eb-a5e1efead12d (buildNumber 70)
- Android build: 1b48f297-8ac2-4a7e-97a1-bdfea4a3cc76 (versionCode 75)
- Commit: 6fe00dc. Backend deployed to Hetzner (api.zenrex.ai), bad cached translations cleaned.
- Poller log: /tmp/eas_release_v1.20.0.log
- Changes: smart bilingual name translation (dedupe + brands Latin), full Live Preview + analytics i18n

## v1.20.1 release — 2026-10-27
- iOS build: 6e2627ad-2b04-4593-a269-ce743b1d1a29 (buildNumber 71)
- Android build: 761f479b-5012-4db1-9552-e39d04517733 (versionCode 76)
- Change: version label now reads from Constants.expoConfig.version (was hardcoded v1.14.3)
- NOTE: `eas update` (OTA) cannot run in this container (aarch64; hermesc binary fails). Use full EAS builds.

## v1.21.0 release — 2026-10-27
- iOS c20bb1b3-71bd-49bd-a138-3c91b7f2ba39 (build 72), Android 17db38ae-9859-492a-9763-17a54024b486 (versionCode 77)
- Viewer-language translation engine r3: brands in target script, names transliterated, single name field, no dead toast, failed lines not cached; crash fixes; English demo customers; prewarm on product save + prewarm_all_names.py (run on VPS with API=http://127.0.0.1:8100)

## v1.22.0 release — 2026-10-27
- iOS 26aeff92-2523-4cf5-9841-52c761ad949e (build 73), Android 9a544748-3e39-4269-aeb5-f16a685ff87a (versionCode 78)
- Rules r4: fully native script (no Latin words except digit codes / <=4-letter acronyms), zh glossary fallback; toggle larger. Audit 2880 checks clean; UI toggle verified in all 20 languages (iteration_43).

## v1.22.1 release — 2026-10-27
- iOS 1db05d8f-e9f2-4429-9a47-83d21d4b90f3 (build 74), Android 71f40178-2b1a-453c-8322-c717eaf31e84 (versionCode 79)
- Fix: devices kept stale r3 translations (cache key unchanged). Now GET /api/translate/rules; device wipes its translation cache when rules version changes.

## v1.23.0 release — 2026-10-28
- iOS 1940b763-ec93-43d8-bb1d-9a67555b37c1 (build 75), Android cda1510a-af3e-4f8e-b92d-e67d009baa96 (versionCode 80)
- Full 20-lang sweep (tests/full_lang_scan.py, 1380 visits). Fixes: social/services/staff/drivers/roles/loyalty wrapped, NameInitial avatars, noToggle chips, cache-first bulk + 12-item chunks, bn danda fix, InvalidId→404, prewarm_all_content.py (run on VPS with API=http://127.0.0.1:8100)

## v1.24.0 release — 2026-10-28
- iOS d77c0817-b3c0-4576-8660-47566d6b0b3b (build 76), Android 4da94ad7-2c6f-43eb-b79b-fd4509a59cdc (versionCode 81). Commit 358ced9. Backend deployed to Hetzner.
- Poller log: /tmp/eas_release_v1.24.0.log
- Changes: FilterTabs unified option bars (Android RTL safe), live-preview whole-page scroll, social FlatList+memo, translation provider switch, translation fixes.

## v1.25.0 release — 2026-10-28
- iOS a1919d76-2d42-4fba-90d8-447d121fc466 (build 77), Android 10027e4a-0abb-43cb-b237-01af1407b3c0 (versionCode 82). Backend deployed.
- Security hardening + ZATCA phase-1 invoices + inventory fixes. Poller log /tmp/eas_release_v1.25.0.log

## v1.26.0 release — 2026-10-28
- iOS a8f3c250-bd27-44af-8a6d-58d683f38278 (build 78), Android 1c046253-06a7-4811-92eb-376df37c6260 (versionCode 83). Marketers phase 3. Poller log /tmp/eas_release_v1.26.0.log

## v1.27.0 release — 2026-10-28
- iOS 829282a5-13f0-4876-b9f9-23b1844fc4f9 (build 79), Android 89f597d7-91cc-4439-a955-ab07596c8939 (versionCode 84). Competitions phase 4 + payout minimums. Log /tmp/eas_release_v1.27.0.log

## v1.28.0 release — 2026-10-29
- iOS 948a9e5f-a82a-453f-b3fd-c0d4c4b098a5 (build 80), Android dc937570-74a6-494e-8ccd-7661e4a4ac91 (versionCode 85). Commit bd1a2bb. Backend deployed to Hetzner.
- POS barcode scanner (expo-camera = new native module → full build required), labels, WhatsApp receipts, native upload fix (expo/fetch Blob), bottom buttons above tab bar. Log /tmp/eas_release_v1.28.0.log

## v1.29.0 release — 2026-10-30
- iOS aa0b9c07-b0dc-4352-8802-fd4554d36ede (build 81), Android 8b8eea41-63d5-45e1-8daa-2bbc622cbb56 (versionCode 86). Commit 321ad6e. Backend + map + OSRM on Hetzner.
- Driver system v2 + own map. New native: expo-task-manager + background location. Log /tmp/eas_release_v1.29.0.log

## v1.30.0 release — 2026-10-30
- iOS 2078bb46-f2bf-4485-9ae3-d10920486a75 (build 82), Android 65a912fa-78f7-4d08-a81e-70996211bc3d (versionCode 87). Commit 2cfc461. Backend deployed to Hetzner. NOTE: eas-cli must be reinstalled (`npm i -g eas-cli`) in new pods.

## v1.30.1 release — 2026-10-30
- iOS e9b7be8e-2244-4258-bc5d-8c0e0107afa8 (build 83), Android 9e0d72da-c9fe-4454-8a1b-4268023671d0 (versionCode 88). Commit aa326c3. Log /tmp/eas_release_v1.30.1.log
- Driver prefs = merchant pattern (appearance page, theme switch, language sheet); gold Z car pin; map brand badge moved bottom-left (hidden on driver map, logo in top row).
- Backend deployed to Hetzner via root@91.98.154.148 with /root/.ssh/id_ed25519 (zenrex_deploy key rejected). iOS+Android submitted manually ✅.
