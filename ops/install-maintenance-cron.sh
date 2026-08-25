#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

existing="$(mktemp)"
updated="$(mktemp)"
installed="$(mktemp)"
launcher_tmp=""
cleanup() {
  rm -f -- "$existing" "$updated" "$installed"
  [[ -z "$launcher_tmp" ]] || rm -f -- "$launcher_tmp"
}
trap cleanup EXIT

cron_user="${MAINTENANCE_CRON_USER:-ubuntu}"
id "$cron_user" >/dev/null 2>&1 || fail "Maintenance cron user does not exist: $cron_user"
cron_group="$(id -gn "$cron_user")"
cron_home="$(getent passwd "$cron_user" | awk -F: 'NR == 1 { print $6 }')"
[[ "$cron_home" == /* && -d "$cron_home" && ! -L "$cron_home" ]] \
  || fail "Maintenance cron home is not a safe absolute directory"

launcher_source="$APP_DIR/ops/deploy-watchdog-launcher.sh"
[[ -f "$launcher_source" && ! -L "$launcher_source" ]] \
  || fail "Deployment watchdog launcher source is unavailable"
launcher_path="${QZSITE_DEPLOY_WATCHDOG_LAUNCHER_PATH:-$cron_home/.local/lib/qzsite/deploy-watchdog-launcher.sh}"
[[ "$launcher_path" == /* && "$(basename -- "$launcher_path")" == "deploy-watchdog-launcher.sh" ]] \
  || fail "Deployment watchdog launcher path is invalid"
launcher_dir="$(dirname -- "$launcher_path")"

if [[ "$(id -u)" -eq 0 ]]; then
  install -d -m 700 -o "$cron_user" -g "$cron_group" "$launcher_dir"
else
  [[ "$(id -un)" == "$cron_user" ]] \
    || fail "Installing the persistent watchdog launcher requires $cron_user or root"
  install -d -m 700 "$launcher_dir"
fi
[[ -d "$launcher_dir" && ! -L "$launcher_dir" ]] \
  || fail "Deployment watchdog launcher directory is unsafe"
launcher_tmp="$(mktemp "$launcher_dir/.deploy-watchdog-launcher.XXXXXX")"
install -m 700 "$launcher_source" "$launcher_tmp"
if [[ "$(id -u)" -eq 0 ]]; then
  chown "$cron_user:$cron_group" "$launcher_tmp"
fi
mv -- "$launcher_tmp" "$launcher_path"
launcher_tmp=""

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
  $0 == "# BEGIN QZSITE WATCHDOG BOOTSTRAP" { bootstrap = 1; next }
  $0 == "# END QZSITE WATCHDOG BOOTSTRAP" { bootstrap = 0; next }
  bootstrap { next }
  $0 == "# BEGIN QZSITE MANAGED" { managed = 1; next }
  $0 == "# END QZSITE MANAGED" { managed = 0; next }
  managed { next }
  index($0, "/home/ubuntu/backup-db.sh") { next }
  index($0, "/home/ubuntu/check-ssl.sh") { next }
  { print }
' "$existing" > "$updated"

{
  printf '# BEGIN QZSITE MANAGED\n'
  printf '0 3 * * * cd %q && nice -n 10 bash ops/run-maintenance-cron.sh backup\n' "$APP_DIR"
  printf '20 3 * * * cd %q && nice -n 10 bash ops/run-maintenance-cron.sh storage-cleanup\n' "$APP_DIR"
  printf '30 3 * * 0 cd %q && nice -n 10 bash ops/run-maintenance-cron.sh verify-backup\n' "$APP_DIR"
  printf '15 * * * * cd %q && nice -n 10 bash ops/run-maintenance-cron.sh mcp\n' "$APP_DIR"
  printf '10 2,14 * * * cd %q && nice -n 10 bash ops/run-maintenance-cron.sh acme\n' "$APP_DIR"
  printf '* * * * * cd %q && bash %q %q\n' "$APP_DIR" "$launcher_path" "$APP_DIR"
  printf '# END QZSITE MANAGED\n'
} >> "$updated"

"${crontab_command[@]}" "$updated"
"${crontab_command[@]}" -l > "$installed"

grep -Fqx '# BEGIN QZSITE MANAGED' "$installed" || fail "Managed maintenance cron header was not installed"
grep -Fq 'ops/run-maintenance-cron.sh backup' "$installed" || fail "Database backup cron entry was not installed"
grep -Fq 'ops/run-maintenance-cron.sh storage-cleanup' "$installed" || fail "Storage cleanup cron entry was not installed"
grep -Fq 'ops/run-maintenance-cron.sh verify-backup' "$installed" || fail "Backup verification cron entry was not installed"
grep -Fq 'ops/run-maintenance-cron.sh mcp' "$installed" || fail "MCP maintenance cron entry was not installed"
grep -Fq 'ops/run-maintenance-cron.sh acme' "$installed" || fail "ACME renewal cron entry was not installed"
grep -Fq "$launcher_path" "$installed" || fail "Persistent deployment watchdog cron entry was not installed"
grep -Fqx '# END QZSITE MANAGED' "$installed" || fail "Managed maintenance cron footer was not installed"

log "Managed maintenance cron entries installed for $cron_user"
