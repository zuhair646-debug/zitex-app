#!/usr/bin/env bash
# ─── Zitex EAS auto-submit template ─────────────────────────────────────
# Usage:  IOS_ID=<uuid> AND_ID=<uuid> VERSION=1.2.3 bash auto_submit_template.sh
# Runs in background. Retries submit every 10 minutes on transient failures
# (Apple + Google are sometimes down). Logs to /tmp/eas_release.log.
set +e
export EXPO_TOKEN="${EXPO_TOKEN:-YVBYBJdtkXOHvpXZo16yxyXCtePkaeIzt00acoO6}"
export EXPO_APPLE_APP_SPECIFIC_PASSWORD="${EXPO_APPLE_APP_SPECIFIC_PASSWORD:-srls-tdmj-ddmz-ijnm}"
LOG="${LOG:-/tmp/eas_release.log}"
IOS_ID="${IOS_ID:-}"; AND_ID="${AND_ID:-}"
VERSION="${VERSION:-unknown}"

echo "[$(date)] v${VERSION} auto-submit polling started (ios=$IOS_ID android=$AND_ID)" >> "$LOG"
command -v eas > /dev/null || npm install -g eas-cli >> "$LOG" 2>&1

wait_and_submit() {
  local id="$1" plat="$2"
  [ -z "$id" ] && { echo "[$(date)] $plat skipped (no id)" >> "$LOG"; return 0; }
  local build_ready=0
  local tries=0
  # Wait for build to finish
  while [ $build_ready -eq 0 ]; do
    STATUS=$(cd /app/frontend && eas build:view "$id" --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "unknown")
    echo "[$(date)] $plat $id status=$STATUS" >> "$LOG"
    case "$STATUS" in
      FINISHED) build_ready=1 ;;
      ERRORED|CANCELED) echo "[$(date)] $plat build $STATUS — aborting" >> "$LOG"; return 1 ;;
      *) tries=$((tries+1)); [ $tries -gt 180 ] && { echo "[$(date)] $plat build timeout" >> "$LOG"; return 1; }; sleep 60 ;;
    esac
  done
  # Submit with escalating retries (transient Apple/Google errors)
  local delay=30
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    echo "[$(date)] $plat submit attempt $attempt" >> "$LOG"
    if (cd /app/frontend && eas submit --platform "$plat" --id "$id" --non-interactive) >> "$LOG" 2>&1; then
      echo "[$(date)] $plat ✅ submitted OK" >> "$LOG"
      return 0
    fi
    echo "[$(date)] $plat submit failed, sleeping ${delay}s" >> "$LOG"
    sleep $delay
    # After 3 failures, wait 10 minutes between attempts (Apple often recovers)
    [ $attempt -ge 3 ] && delay=600
  done
  echo "[$(date)] $plat ❌ FAILED after 10 attempts (Apple/Google service may be down; retry manually later)" >> "$LOG"
  return 1
}

wait_and_submit "$IOS_ID" "ios" &
wait_and_submit "$AND_ID" "android" &
wait
echo "[$(date)] v${VERSION} submissions job finished" >> "$LOG"
