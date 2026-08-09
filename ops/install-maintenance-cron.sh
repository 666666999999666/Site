#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

existing="$(mktemp)"
updated="$(mktemp)"
cleanup() {
  rm -f -- "$existing" "$updated"
}
trap cleanup EXIT

crontab -l > "$existing" 2>/dev/null || true
awk '
  $0 == "# BEGIN QZSITE MANAGED" { managed = 1; next }
  $0 == "# END QZSITE MANAGED" { managed = 0; next }
  managed { next }
  index($0, "/home/ubuntu/backup-db.sh") { next }
  index($0, "/home/ubuntu/check-ssl.sh") { next }
  { print }
' "$existing" > "$updated"

{
  printf '# BEGIN QZSITE MANAGED\n'
  printf '0 3 * * * cd %q && nice -n 10 bash ops/maintenance.sh backup >> %q 2>&1\n' \
    "$APP_DIR" "$BACKUP_DIR/maintenance.log"
  printf '30 3 * * 0 cd %q && nice -n 10 bash ops/maintenance.sh verify-backup >> %q 2>&1\n' \
    "$APP_DIR" "$BACKUP_DIR/maintenance.log"
  printf '0 9 * * 1 cd %q && bash ops/maintenance.sh ssl >> %q 2>&1\n' \
    "$APP_DIR" "$BACKUP_DIR/maintenance.log"
  printf '15 * * * * cd %q && nice -n 10 bash ops/maintenance.sh mcp >> %q 2>&1\n' \
    "$APP_DIR" "$BACKUP_DIR/maintenance.log"
  printf '# END QZSITE MANAGED\n'
} >> "$updated"

crontab "$updated"
log "Managed maintenance cron entries installed"
