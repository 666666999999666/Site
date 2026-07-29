#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

action="${1:-status}"
case "$action" in
  status)
    compose ps
    curl --fail --silent --show-error \
      --resolve liaoqizai.site:443:127.0.0.1 \
      https://liaoqizai.site/api/health
    printf '\n'
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
  content-dry-run)
    bash "$APP_DIR/ops/content-migration.sh" --dry-run
    ;;
  uploads-dry-run)
    bash "$APP_DIR/ops/cleanup-uploads.sh" --dry-run
    ;;
  *)
    fail "Allowed actions: status, backup, verify-backup, ssl, content-dry-run, uploads-dry-run"
    ;;
esac
