#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

action="${1:-status}"

exec 9>"/tmp/qzsite-operation.lock"
flock -w 900 9 || fail "Another deployment or maintenance action is still running"

run_mcp_maintenance() {
  compose exec --no-TTY web node -e \
    "fetch('http://127.0.0.1:3000/api/internal/mcp-maintenance',{method:'POST'}).then(async r=>{if(!r.ok)throw new Error(await r.text());console.log(await r.text())})"
}

case "$action" in
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
    fail "Allowed actions: status, backup, verify-backup, ssl, install-cron, install-tls, content-dry-run, uploads-dry-run, mcp"
    ;;
esac
