#!/bin/bash
# Daily MongoDB backup for Zenrex Store (installed on Hetzner via systemd timer)
BACKUP_DIR="/var/backups/zenrex-store"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
mongodump --host 127.0.0.1 --port 27018 --db zenrex_store --out "$BACKUP_DIR/dump_$DATE" --quiet
tar czf "$BACKUP_DIR/zenrex_$DATE.tar.gz" -C "$BACKUP_DIR" "dump_$DATE" 2>/dev/null
rm -rf "$BACKUP_DIR/dump_$DATE"
find "$BACKUP_DIR" -name "zenrex_*.tar.gz" -mtime +14 -delete
echo "$(date): Backup completed: zenrex_$DATE.tar.gz"
