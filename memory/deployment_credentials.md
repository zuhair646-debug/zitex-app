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
- **Railway Account:** zuhair770000@gmail.com (User ID: 0c17dbb1-45bf-4c4b-9195-630673899dc2)
- **Railway Token:** `dc53264f-0ea6-439a-aad7-a652801f2487`
- **Workspace ID:** `839a9814-45f9-45bb-84b0-803d251462bd`
- **Project ID (zitex):** `501a2e06-bfcc-41b1-8ea7-6b0b7f0b141f`
- **Service ID (api):** `21667c79-f537-44fd-a59d-3b55dae67963`
- **Environment ID (production):** `fc9bcb35-cc9f-47db-91b6-dc585917e522`
- **Backend GitHub repo (Railway connected):** `zuhair646-debug/zitex-backend`
- **MongoDB:** Hosted on Railway (managed - service ID: beeee698-1fd5-4559-83da-838ec1ab0a9c)

### Railway Manual Deploy (when auto-deploy doesn't trigger):
```bash
curl -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Authorization: Bearer dc53264f-0ea6-439a-aad7-a652801f2487" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { serviceInstanceDeployV2(serviceId: \"21667c79-f537-44fd-a59d-3b55dae67963\", environmentId: \"fc9bcb35-cc9f-47db-91b6-dc585917e522\", commitSha: \"<LATEST_COMMIT>\") }"}'
```

## ═══════════════════════════════════════
## Current Version State (last updated)
## ═══════════════════════════════════════
- **App Version:** 1.0.0
- **iOS buildNumber:** Last successful submit = 4 (next should be 5)
- **Android versionCode:** Last successful submit = 5 (next should be 6)

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
