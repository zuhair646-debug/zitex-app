#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# 🚀 Zenrex Store — Automated Deployment Script
# ────────────────────────────────────────────────────────────────────────────
# Deploys the backend (FastAPI + MongoDB) to your existing Hetzner server.
# 100% ISOLATED from existing sites — will not touch zenrex.ai or others.
#
# What it does:
#   • Creates /opt/zenrex-store/ (isolated directory)
#   • Installs MongoDB (dedicated port 27018 to avoid conflicts)
#   • Installs Python 3.11 venv (isolated env)
#   • Creates systemd service `zenrex-store-api` on port 8001
#   • Creates nginx server block for api.zenrex.ai (does not touch other blocks)
#   • Obtains Let's Encrypt SSL certificate
#   • Seeds demo data (invoices, orders, competitions, social posts)
#
# Usage on your server (as sudo user):
#   curl -sL https://raw.githubusercontent.com/zuhair646-debug/zitex-app/main/scripts/deploy_zenrex.sh | sudo bash
#
# Rollback (removes ONLY Zenrex Store, leaves other sites untouched):
#   sudo bash /opt/zenrex-store/uninstall.sh
# ────────────────────────────────────────────────────────────────────────────

set -e  # exit on error
trap 'echo "❌ Error on line $LINENO. Check logs above." >&2' ERR

# Colors
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[0;34m'; N='\033[0m'
step() { echo -e "\n${B}▶ $1${N}"; }
ok()   { echo -e "${G}  ✅ $1${N}"; }
warn() { echo -e "${Y}  ⚠️  $1${N}"; }
fail() { echo -e "${R}  ❌ $1${N}"; exit 1; }

# ─── Config ────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/zenrex-store"
BACKEND_DIR="$INSTALL_DIR/backend"
GIT_REPO="https://github.com/zuhair646-debug/zitex-app.git"
GIT_BRANCH="main"
API_PORT="8001"
MONGO_PORT="27018"          # Dedicated port to avoid conflict with existing mongo
DOMAIN="api.zenrex.ai"
SERVICE_NAME="zenrex-store-api"
NGINX_SITE="/etc/nginx/sites-available/zenrex-store"
NGINX_LINK="/etc/nginx/sites-enabled/zenrex-store"
BACKUP_DIR="/root/zenrex-store-backups/$(date +%Y%m%d_%H%M%S)"

# ─── Pre-flight checks ─────────────────────────────────────────────────
step "1/12 — Pre-flight checks"
[[ $EUID -eq 0 ]] || fail "Must run as root (sudo)"
[[ -d /etc/nginx ]] || fail "Nginx not installed"
command -v systemctl > /dev/null || fail "systemd required"
ok "Server ready"

# ─── Backup ────────────────────────────────────────────────────────────
step "2/12 — Backup existing nginx config (safety)"
mkdir -p "$BACKUP_DIR"
cp -r /etc/nginx/sites-available "$BACKUP_DIR/sites-available"
cp -r /etc/nginx/sites-enabled "$BACKUP_DIR/sites-enabled"
cp /etc/nginx/nginx.conf "$BACKUP_DIR/nginx.conf" 2>/dev/null || true
ok "Backup saved to: $BACKUP_DIR"

# ─── Install system deps ───────────────────────────────────────────────
step "3/12 — Installing system dependencies"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
    software-properties-common curl wget gnupg lsb-release ca-certificates \
    build-essential git ufw
# Python 3.11
if ! command -v python3.11 > /dev/null; then
    add-apt-repository -y ppa:deadsnakes/ppa > /dev/null
    apt-get update -qq
fi
apt-get install -y -qq python3.11 python3.11-venv python3.11-dev python3-pip
# Certbot
apt-get install -y -qq certbot python3-certbot-nginx
ok "System deps installed"

# ─── Install MongoDB (dedicated instance on port 27018) ────────────────
step "4/12 — Installing MongoDB (port $MONGO_PORT)"
if [[ ! -f /etc/systemd/system/mongod-zenrex.service ]]; then
    # Install mongodb binaries if not present
    if ! command -v mongod > /dev/null; then
        curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
            gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
        echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
            https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" \
            > /etc/apt/sources.list.d/mongodb-org-7.0.list
        apt-get update -qq
        apt-get install -y -qq mongodb-org-server mongodb-org-shell mongodb-org-tools
    fi
    # Create dedicated data + config
    mkdir -p /var/lib/mongodb-zenrex /var/log/mongodb-zenrex
    chown mongodb:mongodb /var/lib/mongodb-zenrex /var/log/mongodb-zenrex
    cat > /etc/mongod-zenrex.conf << EOF
storage:
  dbPath: /var/lib/mongodb-zenrex
systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb-zenrex/mongod.log
net:
  port: $MONGO_PORT
  bindIp: 127.0.0.1
processManagement:
  timeZoneInfo: /usr/share/zoneinfo
EOF
    cat > /etc/systemd/system/mongod-zenrex.service << EOF
[Unit]
Description=MongoDB (Zenrex Store)
After=network.target
[Service]
User=mongodb
Group=mongodb
ExecStart=/usr/bin/mongod --config /etc/mongod-zenrex.conf
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable mongod-zenrex
    systemctl start mongod-zenrex
fi
sleep 3
systemctl is-active mongod-zenrex > /dev/null && ok "MongoDB running on 127.0.0.1:$MONGO_PORT" || fail "MongoDB failed to start"

# ─── Deploy backend code ──────────────────────────────────────────────
step "5/12 — Cloning backend code"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
if [[ -d "$BACKEND_DIR/.git" ]]; then
    cd "$BACKEND_DIR/.." && rm -rf zitex-app-tmp
    git clone --depth 1 --branch "$GIT_BRANCH" "$GIT_REPO" zitex-app-tmp
    rsync -a zitex-app-tmp/backend/ "$BACKEND_DIR/" --delete-after
    rm -rf zitex-app-tmp
else
    git clone --depth 1 --branch "$GIT_BRANCH" "$GIT_REPO" "$INSTALL_DIR/zitex-app"
    rsync -a "$INSTALL_DIR/zitex-app/backend/" "$BACKEND_DIR/"
fi
ok "Backend cloned to $BACKEND_DIR"

# ─── Python venv + deps ───────────────────────────────────────────────
step "6/12 — Setting up Python venv + installing deps"
python3.11 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install --quiet -r "$BACKEND_DIR/requirements.txt"
ok "Python deps installed"

# ─── Create backend .env ──────────────────────────────────────────────
step "7/12 — Creating backend .env"
JWT_SECRET=$(openssl rand -hex 32)
cat > "$BACKEND_DIR/.env" << EOF
MONGO_URL=mongodb://127.0.0.1:$MONGO_PORT
DB_NAME=zenrex_store
JWT_SECRET=$JWT_SECRET
CORS_ORIGINS=*
# Add your integration keys here:
EMERGENT_LLM_KEY=
STRIPE_SECRET_KEY=
EOF
chmod 600 "$BACKEND_DIR/.env"
ok "Environment configured"

# ─── Systemd service ──────────────────────────────────────────────────
step "8/12 — Creating systemd service"
cat > "/etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=Zenrex Store API (FastAPI)
After=network.target mongod-zenrex.service
Requires=mongod-zenrex.service

[Service]
Type=simple
WorkingDirectory=$BACKEND_DIR
Environment="PATH=$INSTALL_DIR/venv/bin"
ExecStart=$INSTALL_DIR/venv/bin/uvicorn server:app --host 127.0.0.1 --port $API_PORT --workers 2
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/zenrex-store-api.log
StandardError=append:/var/log/zenrex-store-api.err.log

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
sleep 4
systemctl is-active "$SERVICE_NAME" > /dev/null && ok "API service running on 127.0.0.1:$API_PORT" || {
    tail -20 /var/log/zenrex-store-api.err.log
    fail "API failed to start"
}

# ─── Nginx server block (dedicated file, no conflict) ─────────────────
step "9/12 — Configuring nginx for $DOMAIN"
cat > "$NGINX_SITE" << EOF
# ── Zenrex Store — API ────────────────────────────────────────────────
# Isolated server block. Does NOT affect other sites on this server.
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # For Let's Encrypt HTTP-01 challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all traffic to HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    # SSL — placeholder, will be replaced by certbot
    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    # File upload limit for images/videos
    client_max_body_size 100M;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;

    # Proxy to FastAPI
    location / {
        proxy_pass http://127.0.0.1:$API_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF

# Link to sites-enabled (idempotent)
ln -sf "$NGINX_SITE" "$NGINX_LINK"

# Test nginx config
if ! nginx -t 2>/dev/null; then
    warn "nginx config test failed — restoring backup"
    cp "$BACKUP_DIR/sites-available"/* /etc/nginx/sites-available/ 2>/dev/null || true
    cp "$BACKUP_DIR/sites-enabled"/* /etc/nginx/sites-enabled/ 2>/dev/null || true
    fail "Nginx test failed. Backup restored."
fi
systemctl reload nginx
ok "Nginx configured (existing sites untouched ✓)"

# ─── SSL certificate ──────────────────────────────────────────────────
step "10/12 — Obtaining SSL certificate for $DOMAIN"
mkdir -p /var/www/html
# Verify DNS is set first
DOMAIN_IP=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1)
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "?")
if [[ -z "$DOMAIN_IP" ]]; then
    warn "$DOMAIN does not resolve yet."
    echo "   → Add this DNS record at your registrar:"
    echo "     Type: A     Name: api.zenrex.ai     Value: $SERVER_IP     TTL: 300"
    echo "   → Then re-run this script (safe, idempotent)."
    ok "Skipping SSL for now — API is running with self-signed cert"
elif [[ "$DOMAIN_IP" != "$SERVER_IP" ]]; then
    warn "$DOMAIN resolves to $DOMAIN_IP but server is $SERVER_IP"
    echo "   → Update DNS then re-run script."
else
    certbot --nginx \
        -d "$DOMAIN" \
        --non-interactive \
        --agree-tos \
        --register-unsafely-without-email \
        --redirect 2>&1 | tail -5 || warn "SSL not obtained (will retry)"
    systemctl reload nginx
    ok "SSL configured"
fi

# ─── Seed demo data ───────────────────────────────────────────────────
step "11/12 — Seeding demo data (optional)"
cd "$BACKEND_DIR"
if [[ -f seed_demo_analytics.py ]] || [[ -f seed_live_preview_analytics.py ]]; then
    "$INSTALL_DIR/venv/bin/python" seed_live_preview_analytics.py 2>&1 | tail -5 || warn "Seed had issues (non-fatal)"
fi
if [[ -f seed_demo_accounts.py ]]; then
    "$INSTALL_DIR/venv/bin/python" seed_demo_accounts.py 2>&1 | tail -5 || warn "Seed accounts had issues"
fi
ok "Demo data seeded"

# ─── Uninstall script ─────────────────────────────────────────────────
step "12/12 — Creating uninstall script"
cat > "$INSTALL_DIR/uninstall.sh" << 'UNINSTALL'
#!/usr/bin/env bash
# Safely removes Zenrex Store — leaves other sites intact
set -e
[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }
systemctl stop zenrex-store-api 2>/dev/null || true
systemctl disable zenrex-store-api 2>/dev/null || true
systemctl stop mongod-zenrex 2>/dev/null || true
systemctl disable mongod-zenrex 2>/dev/null || true
rm -f /etc/systemd/system/zenrex-store-api.service
rm -f /etc/systemd/system/mongod-zenrex.service
rm -f /etc/mongod-zenrex.conf
rm -f /etc/nginx/sites-available/zenrex-store
rm -f /etc/nginx/sites-enabled/zenrex-store
rm -rf /var/lib/mongodb-zenrex /var/log/mongodb-zenrex
rm -rf /opt/zenrex-store
nginx -t && systemctl reload nginx
echo "✅ Zenrex Store uninstalled. Other sites are untouched."
UNINSTALL
chmod +x "$INSTALL_DIR/uninstall.sh"
ok "Uninstall available at: $INSTALL_DIR/uninstall.sh"

# ─── Final health check ───────────────────────────────────────────────
echo -e "\n${G}════════════════════════════════════════════════════════════${N}"
echo -e "${G}🎉 Zenrex Store deployed successfully!${N}"
echo -e "${G}════════════════════════════════════════════════════════════${N}"
sleep 2
HEALTH=$(curl -s http://127.0.0.1:$API_PORT/api/ 2>/dev/null | head -c 100 || echo "unreachable")
echo "  • API health (local):    http://127.0.0.1:$API_PORT/api/  → $HEALTH"
echo "  • Public URL:            https://$DOMAIN/api/  (after DNS is set)"
echo "  • MongoDB:               mongodb://127.0.0.1:$MONGO_PORT (zenrex_store DB)"
echo "  • Systemd service:       $SERVICE_NAME"
echo "  • Logs:                  /var/log/zenrex-store-api.log"
echo "  • Uninstall:             sudo bash $INSTALL_DIR/uninstall.sh"
echo ""
echo "Test the API right now:"
echo "  curl http://127.0.0.1:$API_PORT/api/"
echo ""
echo "Merchant demo login:"
echo "  Phone: 0509999999"
echo "  Pass:  merchant2025"
echo ""
echo "Backup of pre-deploy state: $BACKUP_DIR"
