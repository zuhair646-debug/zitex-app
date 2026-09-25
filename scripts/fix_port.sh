#!/bin/bash
# 🔧 Zenrex - Fix port conflict (8001 -> 8100)
set -e

NEW_PORT=8100
OLD_PORT=8001
SERVICE=/etc/systemd/system/zenrex-store-api.service
NGINX=/etc/nginx/sites-available/api.zenrex.ai

echo "==> Checking what's using port ${OLD_PORT}..."
ss -tlnp | grep ":${OLD_PORT}" || echo "Nothing found on ${OLD_PORT}"

echo "==> Stopping Zenrex API service..."
systemctl stop zenrex-store-api 2>/dev/null || true

echo "==> Patching systemd service port ${OLD_PORT} -> ${NEW_PORT}..."
sed -i "s/--port ${OLD_PORT}/--port ${NEW_PORT}/g" "$SERVICE"

echo "==> Patching Nginx config port..."
if [ -f "$NGINX" ]; then
  sed -i "s/127.0.0.1:${OLD_PORT}/127.0.0.1:${NEW_PORT}/g" "$NGINX"
fi

echo "==> Reloading systemd and starting service..."
systemctl daemon-reload
systemctl start zenrex-store-api
sleep 3

echo "==> Testing Nginx config..."
nginx -t

echo "==> Reloading Nginx..."
systemctl reload nginx

echo ""
echo "==> Service status:"
systemctl is-active zenrex-store-api && echo "✅ API is running on port ${NEW_PORT}" || {
  echo "❌ API failed. Logs:"
  journalctl -u zenrex-store-api -n 20 --no-pager
  exit 1
}

echo ""
echo "==> Testing local API..."
curl -s http://127.0.0.1:${NEW_PORT}/api/ || echo "Local API not responding yet"

echo ""
echo "✅ Fix complete! API now on port ${NEW_PORT}"
echo "🌐 Try: https://api.zenrex.ai/api/"
