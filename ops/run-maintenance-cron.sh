#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

action="${1:-}"
case "$action" in
  backup|storage-cleanup|verify-backup|mcp|acme)
    target=(bash "$APP_DIR/ops/maintenance.sh" "$action")
    ;;
  deploy-watchdog)
    require_file "$APP_DIR/ops/deploy-watchdog.sh"
    target=(bash "$APP_DIR/ops/deploy-watchdog.sh")
    ;;
  *)
    fail "Unsupported scheduled maintenance action: $action"
    ;;
esac

bash "$APP_DIR/ops/rotate-maintenance-log.sh"
"${target[@]}" >> "$BACKUP_DIR/maintenance.log" 2>&1
