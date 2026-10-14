#!/usr/bin/env bash
# Nightly backup: the database and uploaded files, kept for 14 days.
# Installed as /usr/local/bin/bhavishya-backup.sh and run from root's crontab.
set -euo pipefail
APP=/home/deploy/bhavishya-psc
DIR=/home/deploy/backups
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DIR"
sudo -u postgres pg_dump bhavishya | gzip > "$DIR/db-$TS.sql.gz"
if [ -d "$APP/backend/media" ]; then
  tar -czf "$DIR/media-$TS.tar.gz" -C "$APP/backend" media
fi
find "$DIR" -name 'db-*.sql.gz' -mtime +14 -delete
find "$DIR" -name 'media-*.tar.gz' -mtime +14 -delete
echo "$(date '+%F %T') backup ok ($TS)"
