# Zitex - Deployment Credentials (Permanent Storage)
# جميع المفاتيح والوصول المطلوب للنشر — احتفظ بها للمستقبل

## ═══════════════════════════════════════
## GitHub Access
## ═══════════════════════════════════════
- **Repo (Frontend + Backend):** https://github.com/zuhair646-debug/zitex-app
- **Branch:** main
- **GitHub Token:** `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`
- **Clone URL:** `https://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@github.com/zuhair646-debug/zitex-app.git`

## ═══════════════════════════════════════
## Expo / EAS
## ═══════════════════════════════════════
- **Account:** zuhair-7700 (zuhair646@gmail.com)
- **Expo Token:** `YVBYBJdtkXOHvpXZo16yxyXCtePkaeIzt00acoO6`
- **Project ID:** `1c052dbd-e0cd-4688-bf30-856013a7068b`
- **Project Slug:** zitex
- Usage: `export EXPO_TOKEN="YVBYBJdtkXOHvpXZo16yxyXCtePkaeIzt00acoO6"` then `eas build ...`

## ═══════════════════════════════════════
## Apple / App Store Connect
## ═══════════════════════════════════════
- **Apple ID:** `smartag.sa@gmail.com`
- **App-Specific Password:** `srls-tdmj-ddmz-ijnm`
- **ASC App ID:** `6773073572`
- **Apple Team ID:** `3ZQR97D8T4` (Zuhair Abbas - Individual)
- **Bundle Identifier:** `com.smartangle.zitex`
- Usage: `export EXPO_APPLE_APP_SPECIFIC_PASSWORD="srls-tdmj-ddmz-ijnm"` then `eas submit --platform ios ...`

## ═══════════════════════════════════════
## Google Play Console
## ═══════════════════════════════════════
- **Package Name:** `com.smartangle.zitex`
- **Service Account Email:** `zitex-upload@zitex-upload.iam.gserviceaccount.com`
- **Service Account Key Path (local):** `/tmp/zitex-app/zitex-upload-f1fcca92544c.json`
- **Project ID (GCP):** `zitex-upload`
- Note: JSON key NOT in GitHub (security). Recreate locally if needed from user input.

## ═══════════════════════════════════════
## Backend (Railway)
## ═══════════════════════════════════════
- **Live URL:** `https://api-production-df2ce.up.railway.app`
- **MongoDB:** Hosted on Railway (managed)

## ═══════════════════════════════════════
## Current Version State (last updated)
## ═══════════════════════════════════════
- **App Version:** 1.0.0
- **iOS buildNumber:** Last successful submit = 2 (next should be 3)
- **Android versionCode:** Last successful submit = 3 (next should be 4)

## ═══════════════════════════════════════
## Standard Deploy Workflow
## ═══════════════════════════════════════
1. Clone repo: `cd /tmp && rm -rf zitex-app && git clone <GITHUB_TOKEN_URL>`
2. Restore Google Service Account JSON to `/tmp/zitex-app/zitex-upload-f1fcca92544c.json`
3. Update `frontend/app.json` — bump `ios.buildNumber` and `android.versionCode`
4. Run `cd /tmp/zitex-app/frontend && yarn install`
5. Build iOS: `eas build --platform ios --profile production --non-interactive --no-wait`
6. Build Android: `eas build --platform android --profile production --non-interactive --no-wait`
7. Wait for builds (poll via `eas build:view <BUILD_ID>`)
8. Submit iOS: `eas submit --platform ios --profile production --id <BUILD_ID> --non-interactive`
9. Submit Android: `eas submit --platform android --profile production --id <BUILD_ID> --non-interactive`
10. Commit + push changes to GitHub

## ═══════════════════════════════════════
## Test User Credentials
## ═══════════════════════════════════════
- Regular User: `0500000000` / `test1234`
- Chamber of Commerce Admin: `0550000000` / `chamber2025`
