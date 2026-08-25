#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

existing="$(mktemp)"
updated="$(mktemp)"
installed="$(mktemp)"
list_error="$(mktemp)"
preserved="$(mktemp)"
verified_preserved="$(mktemp)"
launcher_tmp=""
launcher_backup=""
launcher_changed=0
had_launcher=0
cron_changed=0
had_crontab=0
crontab_command=()

cleanup() {
  rm -f -- "$existing" "$updated" "$installed" "$list_error" "$preserved" "$verified_preserved"
  [[ -z "$launcher_tmp" ]] || rm -f -- "$launcher_tmp"
  [[ -z "$launcher_backup" ]] || rm -f -- "$launcher_backup"
}

finish() {
  local exit_code=$?
  local rollback_failed=0 rollback_list_status=0
  trap - EXIT
  set +e
  if ((exit_code != 0 && cron_changed == 1)); then
    log "Cron installation failed; restoring the previous crontab"
    if ((had_crontab == 1)); then
      "${crontab_command[@]}" "$existing" > /dev/null 2>&1 \
        || rollback_failed=1
      LC_ALL=C "${crontab_command[@]}" -l > "$installed" 2> "$list_error"
      rollback_list_status=$?
      [[ "$rollback_list_status" -eq 0 ]] \
        && cmp --silent "$existing" "$installed" \
        || rollback_failed=1
    else
      "${crontab_command[@]}" -r > /dev/null 2>&1 || true
      LC_ALL=C "${crontab_command[@]}" -l > "$installed" 2> "$list_error"
      rollback_list_status=$?
      [[ "$rollback_list_status" -eq 1 && ! -s "$installed" ]] \
        && grep -Eq '^no crontab for ([^[:space:]]+|user .+)$' "$list_error" \
        || rollback_failed=1
    fi
  fi
  if ((exit_code != 0 && launcher_changed == 1)); then
    log "Cron installation failed; restoring the previous watchdog launcher"
    if ((had_launcher == 1)); then
      install -m 700 "$launcher_backup" "$launcher_path" \
        || rollback_failed=1
      if [[ "$(id -u)" -eq 0 ]]; then
        chown "$cron_user:$cron_group" "$launcher_path" \
          || rollback_failed=1
      fi
      cmp --silent "$launcher_backup" "$launcher_path" \
        || rollback_failed=1
    else
      rm -f -- "$launcher_path" || rollback_failed=1
      [[ ! -e "$launcher_path" ]] || rollback_failed=1
    fi
  fi
  if ((rollback_failed == 1)); then
    log "CRITICAL: Cron rollback verification failed; preserved crontab evidence: $existing"
    [[ -z "$launcher_backup" ]] \
      || log "CRITICAL: Preserved launcher rollback evidence: $launcher_backup"
    exit 70
  fi
  cleanup
  exit "$exit_code"
}
trap finish EXIT

validate_markers() {
  awk '
    function invalid() { exit 42 }
    $0 == "# BEGIN QZSITE WATCHDOG BOOTSTRAP" {
      if (bootstrap || managed || bootstrap_seen) invalid()
      bootstrap = 1
      bootstrap_seen = 1
      next
    }
    $0 == "# END QZSITE WATCHDOG BOOTSTRAP" {
      if (!bootstrap) invalid()
      bootstrap = 0
      next
    }
    $0 == "# BEGIN QZSITE MANAGED" {
      if (bootstrap || managed || managed_seen) invalid()
      managed = 1
      managed_seen = 1
      next
    }
    $0 == "# END QZSITE MANAGED" {
      if (!managed) invalid()
      managed = 0
      next
    }
    END { if (bootstrap || managed) invalid() }
  ' "$1" || fail "Existing crontab has malformed or duplicate QZ Site markers"
}

strip_managed_cron() {
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
  ' "$1"
}

cron_user="${MAINTENANCE_CRON_USER:-ubuntu}"
id "$cron_user" > /dev/null 2>&1 || fail "Maintenance cron user does not exist: $cron_user"
cron_group="$(id -gn "$cron_user")"
cron_uid="$(id -u "$cron_user")"
cron_home="$(getent passwd "$cron_user" | awk -F: 'NR == 1 { print $6 }')"
[[ "$cron_home" == /* && -d "$cron_home" && ! -L "$cron_home" ]] || fail "Maintenance cron home is not a safe absolute directory"
[[ "$(realpath -- "$cron_home")" == "$cron_home" ]] \
  || fail "Maintenance cron home resolved through an unexpected path"
[[ "$(stat --format='%u' -- "$cron_home")" == "$cron_uid" ]] \
  || fail "Maintenance cron home has an unexpected owner"
cron_home_mode="$(stat --format='%a' -- "$cron_home")"
[[ "$cron_home_mode" =~ ^[0-7]{3,4}$ ]] \
  || fail "Maintenance cron home mode is invalid"
(( (8#$cron_home_mode & 8#022) == 0 )) \
  || fail "Maintenance cron home must not be group/world-writable"

if [[ "$(id -u)" -eq 0 ]]; then
  crontab_command=(crontab -u "$cron_user")
elif command -v sudo > /dev/null 2>&1 && sudo -n true > /dev/null 2>&1; then
  crontab_command=(sudo -n crontab -u "$cron_user")
elif [[ "$(id -un)" == "$cron_user" ]]; then
  crontab_command=(crontab)
else
  fail "Installing the maintenance cron requires non-interactive sudo access for $cron_user"
fi

set +e
LC_ALL=C "${crontab_command[@]}" -l > "$existing" 2> "$list_error"
list_status=$?
set -e
case "$list_status" in
  0) had_crontab=1 ;;
  1)
    if [[ ! -s "$existing" ]] && grep -Eq '^no crontab for ([^[:space:]]+|user .+)$' "$list_error"; then
      had_crontab=0
      : > "$existing"
    else
      fail "Unable to read the existing crontab safely"
    fi
    ;;
  *) fail "Unable to read the existing crontab safely" ;;
esac

validate_markers "$existing"
strip_managed_cron "$existing" > "$preserved"

launcher_source="$APP_DIR/ops/deploy-watchdog-launcher.sh"
[[ -f "$launcher_source" && ! -L "$launcher_source" ]] || fail "Deployment watchdog launcher source is unavailable"
launcher_dir="$cron_home/.local/lib/qzsite"
launcher_path="$launcher_dir/deploy-watchdog-launcher.sh"
for launcher_component in \
  "$cron_home/.local" \
  "$cron_home/.local/lib" \
  "$launcher_dir"; do
  [[ ! -L "$launcher_component" ]] \
    || fail "Deployment watchdog launcher path contains a symbolic link"
  if [[ ! -e "$launcher_component" ]]; then
    if [[ "$(id -u)" -eq 0 ]]; then
      install -d -m 700 -o "$cron_user" -g "$cron_group" "$launcher_component"
    else
      [[ "$(id -un)" == "$cron_user" ]] \
        || fail "Installing the persistent watchdog launcher requires $cron_user or root"
      install -d -m 700 "$launcher_component"
    fi
  fi
  [[ -d "$launcher_component" && ! -L "$launcher_component" ]] \
    || fail "Deployment watchdog launcher directory is unsafe"
  [[ "$(realpath -- "$launcher_component")" == "$launcher_component" ]] \
    || fail "Deployment watchdog launcher directory resolved outside the cron home"
  [[ "$(stat --format='%u' -- "$launcher_component")" == "$cron_uid" ]] \
    || fail "Deployment watchdog launcher directory has an unexpected owner"
  launcher_component_mode="$(stat --format='%a' -- "$launcher_component")"
  [[ "$launcher_component_mode" =~ ^[0-7]{3,4}$ ]] \
    || fail "Deployment watchdog launcher directory mode is invalid"
  (( (8#$launcher_component_mode & 8#022) == 0 )) \
    || fail "Deployment watchdog launcher directory must not be group/world-writable"
  if [[ "$launcher_component" == "$launcher_dir" ]]; then
    [[ "$launcher_component_mode" == "700" ]] \
      || fail "Deployment watchdog launcher directory must have mode 700"
  fi
done
[[ "$(realpath -- "$launcher_dir")" == "$cron_home/.local/lib/qzsite" ]] \
  || fail "Deployment watchdog launcher escaped the cron home"
if [[ -e "$launcher_path" ]]; then
  [[ -f "$launcher_path" && ! -L "$launcher_path" ]] || fail "Existing deployment watchdog launcher is unsafe"
  launcher_backup="$(mktemp)"
  cp --preserve=mode,timestamps -- "$launcher_path" "$launcher_backup"
  had_launcher=1
fi
launcher_tmp="$(mktemp "$launcher_dir/.deploy-watchdog-launcher.XXXXXX")"
install -m 700 "$launcher_source" "$launcher_tmp"
if [[ "$(id -u)" -eq 0 ]]; then
  chown "$cron_user:$cron_group" "$launcher_tmp"
fi
launcher_changed=1
mv -- "$launcher_tmp" "$launcher_path"
launcher_tmp=""

cp -- "$preserved" "$updated"
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

cron_changed=1
"${crontab_command[@]}" "$updated"
"${crontab_command[@]}" -l > "$installed"
validate_markers "$installed"

[[ "$(grep -Fxc '# BEGIN QZSITE MANAGED' "$installed")" -eq 1 ]] || fail "Managed maintenance cron header was not installed exactly once"
[[ "$(grep -Fxc '# END QZSITE MANAGED' "$installed")" -eq 1 ]] || fail "Managed maintenance cron footer was not installed exactly once"
grep -Fq 'ops/run-maintenance-cron.sh backup' "$installed" || fail "Database backup cron entry was not installed"
grep -Fq 'ops/run-maintenance-cron.sh storage-cleanup' "$installed" || fail "Storage cleanup cron entry was not installed"
grep -Fq 'ops/run-maintenance-cron.sh verify-backup' "$installed" || fail "Backup verification cron entry was not installed"
grep -Fq 'ops/run-maintenance-cron.sh mcp' "$installed" || fail "MCP maintenance cron entry was not installed"
grep -Fq 'ops/run-maintenance-cron.sh acme' "$installed" || fail "ACME renewal cron entry was not installed"
grep -Fq "$launcher_path" "$installed" || fail "Persistent deployment watchdog cron entry was not installed"

strip_managed_cron "$installed" > "$verified_preserved"
cmp --silent "$preserved" "$verified_preserved" || fail "Non-managed crontab entries changed during installation"

cron_changed=0
launcher_changed=0
log "Managed maintenance cron entries installed for $cron_user"
