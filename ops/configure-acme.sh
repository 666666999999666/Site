#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

[[ -n "${ACME_EMAIL:-}" ]] || fail "ACME_EMAIL is required"
[[ "$ACME_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] \
  || fail "ACME_EMAIL is invalid"
prepare_operation_lock
exec 9>>"$OPERATION_LOCK_PATH"
flock -w 900 9 || fail "Another deployment or maintenance action is still running"
ensure_exact_directory "$BACKUP_DIR" "$APP_DIR/backups" "Backup"
acme_image="${ACME_IMAGE:-certbot/certbot@sha256:d07bd043d61d6bee1114235ac12c2e9a5c54b6931b3ccf5e1174d6c8c4afaa95}"
[[ "$acme_image" =~ ^certbot/certbot@sha256:[0-9a-f]{64}$ ]] \
  || fail "ACME_IMAGE must be an immutable certbot/certbot digest"

docker image inspect "$acme_image" > /dev/null 2>&1 || docker pull "$acme_image"
resolved_digest="$(docker image inspect "$acme_image" --format '{{index .RepoDigests 0}}')"
[[ "$resolved_digest" == "$acme_image" ]] \
  || fail "Pulled ACME image digest does not match ACME_IMAGE"

chmod 700 "$BACKUP_DIR"
config_tmp="$(mktemp "$BACKUP_DIR/.acme-config.XXXXXX")"
config_path="$BACKUP_DIR/.acme-config"
previous_config=""
had_config=0
config_installed=0
finish() {
  local exit_code=$?
  local recovery_failed=0
  trap - EXIT
  set +e
  if ((exit_code != 0 && config_installed == 1)); then
    if ((had_config == 1)); then
      install -m 600 "$previous_config" "$config_path" \
        || recovery_failed=1
      cmp --silent -- "$previous_config" "$config_path" \
        || recovery_failed=1
      [[ "$(stat --format='%a' -- "$config_path" 2>/dev/null)" == "600" ]] \
        || recovery_failed=1
    else
      rm -f -- "$config_path" || recovery_failed=1
      [[ ! -e "$config_path" && ! -L "$config_path" ]] \
        || recovery_failed=1
    fi
  fi
  rm -f -- "$config_tmp"
  if ((recovery_failed == 0)); then
    [[ -z "$previous_config" ]] || rm -f -- "$previous_config"
  else
    log "CRITICAL: ACME configuration recovery failed; evidence retained at $previous_config" >&2
    exit 70
  fi
  exit "$exit_code"
}
trap finish EXIT
require_regular_or_absent "$config_path" "ACME configuration"
if [[ -f "$config_path" ]]; then
  [[ "$(stat --format='%a' -- "$config_path")" == "600" ]] \
    || fail "Existing ACME configuration must have mode 600"
  previous_config="$(mktemp "$BACKUP_DIR/.acme-config.previous.XXXXXX")"
  cp --preserve=mode,timestamps -- "$config_path" "$previous_config"
  had_config=1
fi
printf '%s\n%s\n' "$ACME_EMAIL" "$acme_image" > "$config_tmp"
chmod 600 "$config_tmp"
mv -- "$config_tmp" "$config_path"
config_installed=1

unset ACME_EMAIL ACME_IMAGE acme_image
bash "$APP_DIR/ops/acme-renew.sh" --issue
config_installed=0
log "ACME account and certificate configured; install and verify maintenance cron separately"
