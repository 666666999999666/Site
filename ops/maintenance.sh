#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

action="${1:-status}"

exec 9>"/tmp/qzsite-operation.lock"
flock -w 900 9 || fail "Another deployment or maintenance action is still running"

run_mcp_maintenance() {
  compose exec --no-TTY web node -e \
    "fetch('http://127.0.0.1:3000/api/internal/mcp-maintenance',{method:'POST'}).then(async r=>{const body=await r.text();if(!r.ok)throw new Error('MCP maintenance HTTP '+r.status+(body?': '+body:''));console.log(body)}).catch(error=>{console.error(error);process.exit(1)})"
}

case "$action" in
  status)
    compose ps
    bash "$APP_DIR/ops/verify-release.sh"
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
  study-uploads-dry-run)
    bash "$APP_DIR/ops/cleanup-study-uploads.sh" --dry-run
    ;;
  study-uploads)
    bash "$APP_DIR/ops/cleanup-study-uploads.sh" --apply
    ;;
  storage-cleanup)
    bash "$APP_DIR/ops/storage-cleanup.sh"
    bash "$APP_DIR/ops/prune-images.sh"
    ;;
  acme)
    bash "$APP_DIR/ops/acme-renew.sh"
    ;;
  mcp)
    run_mcp_maintenance
    ;;
  *)
    fail "Allowed actions: status, backup, verify-backup, ssl, install-cron, install-tls, content-dry-run, uploads-dry-run, study-uploads-dry-run, study-uploads, storage-cleanup, acme, mcp"
    ;;
esac
