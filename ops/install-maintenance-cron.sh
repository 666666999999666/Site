#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

existing="$(mktemp)"
updated="$(mktemp)"
installed="$(mktemp)"
cleanup() {
  rm -f -- "$existing" "$updated" "$installed"
}
trap cleanup EXIT

cron_user="${MAINTENANCE_CRON_USER:-ubuntu}"
id "$cron_user" >/dev/null 2>&1 || fail "Maintenance cron user does not exist: $cron_user"

if [[ "$(id -u)" -eq 0 ]]; then
  crontab_command=(crontab -u "$cron_user")
elif command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
  crontab_command=(sudo -n crontab -u "$cron_user")
elif [[ "$(id -un)" == "$cron_user" ]]; then
  crontab_command=(crontab)
else
  fail "Installing the maintenance cron requires non-interactive sudo access for $cron_user"
fi

"${crontab_command[@]}" -l > "$existing" 2>/dev/null || true
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

"${crontab_command[@]}" "$updated"
"${crontab_command[@]}" -l > "$installed"

grep -Fqx '# BEGIN QZSITE MANAGED' "$installed" || fail "Managed maintenance cron header was not installed"
grep -Fq 'ops/maintenance.sh backup' "$installed" || fail "Database backup cron entry was not installed"
grep -Fq 'ops/maintenance.sh verify-backup' "$installed" || fail "Backup verification cron entry was not installed"
grep -Fq 'ops/maintenance.sh ssl' "$installed" || fail "SSL check cron entry was not installed"
grep -Fq 'ops/maintenance.sh mcp' "$installed" || fail "MCP maintenance cron entry was not installed"
grep -Fqx '# END QZSITE MANAGED' "$installed" || fail "Managed maintenance cron footer was not installed"

log "Managed maintenance cron entries installed for $cron_user"
