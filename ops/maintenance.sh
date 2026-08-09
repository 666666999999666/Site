#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

action="${1:-status}"

exec 9>"/tmp/qzsite-operation.lock"
flock -w 900 9 || fail "Another deployment or maintenance action is still running"

run_mcp_maintenance() {
  compose exec --no-TTY web node -e \
    "fetch('http://127.0.0.1:3000/api/internal/mcp-maintenance',{method:'POST'}).then(async r=>{const body=await r.text();if(!r.ok)throw new Error('MCP maintenance HTTP '+r.status+(body?': '+body:''));console.log(body)}).catch(error=>{console.error(error);process.exit(1)})"
}

run_scheduled_once() {
  local marker="$1"
  local label="$2"
  shift 2

  if [[ -f "$marker" ]]; then
    log "Scheduled action already completed: $label"
    return
  fi

  log "Running scheduled action: $label"
  "$@"
  printf '%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" > "$marker"
  chmod 600 "$marker"
}

run_scheduled_maintenance() {
  local state_dir="$BACKUP_DIR/.maintenance-state"
  local local_date local_hour local_weekday local_week

  mkdir -p "$BACKUP_DIR" "$state_dir"
  chmod 700 "$BACKUP_DIR" "$state_dir"

  local_date="$(TZ=Asia/Shanghai date +%F)"
  local_hour="$(TZ=Asia/Shanghai date +%H)"
  local_weekday="$(TZ=Asia/Shanghai date +%u)"
  local_week="$(TZ=Asia/Shanghai date +%G-W%V)"

  if ((10#$local_hour >= 3)); then
    run_scheduled_once \
      "$state_dir/backup-$local_date.done" \
      "daily backup for $local_date" \
      bash "$APP_DIR/ops/backup.sh" scheduled

    if [[ "$local_weekday" == "7" ]]; then
      run_scheduled_once \
        "$state_dir/verify-$local_week.done" \
        "weekly backup verification for $local_week" \
        bash "$APP_DIR/ops/verify-backup.sh"
    fi
  fi

  if [[ "$local_weekday" == "1" ]] && ((10#$local_hour >= 9)); then
    run_scheduled_once \
      "$state_dir/ssl-$local_week.done" \
      "weekly TLS check for $local_week" \
      bash "$APP_DIR/ops/check-ssl.sh"
  fi

  run_mcp_maintenance
  find "$state_dir" -maxdepth 1 -type f -name '*.done' -mtime +45 -delete
}

case "$action" in
  scheduled)
    run_scheduled_maintenance
    ;;
  status)
    compose ps
    bash "$APP_DIR/ops/verify-release.sh"
    bash "$APP_DIR/ops/smoke-test.sh"
    run_mcp_maintenance
    ;;
  backup)
    bash "$APP_DIR/ops/backup.sh" scheduled
    ;;
  verify-backup)
    bash "$APP_DIR/ops/verify-backup.sh"
    ;;
  ssl)
    bash "$APP_DIR/ops/check-ssl.sh"
    ;;
  install-cron)
    bash "$APP_DIR/ops/install-maintenance-cron.sh"
    ;;
  install-tls)
    bash "$APP_DIR/ops/install-tls.sh"
    ;;
  content-dry-run)
    bash "$APP_DIR/ops/content-migration.sh" --dry-run
    ;;
  uploads-dry-run)
    bash "$APP_DIR/ops/cleanup-uploads.sh" --dry-run
    ;;
  mcp)
    run_mcp_maintenance
    ;;
  *)
    fail "Allowed actions: scheduled, status, backup, verify-backup, ssl, install-cron, install-tls, content-dry-run, uploads-dry-run, mcp"
    ;;
esac
