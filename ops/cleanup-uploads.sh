#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

mode="${1:---dry-run}"
common_args=(
  /prisma/node_modules/.bin/tsx
  /prisma/tools/scripts/cleanup-uploads.ts
)

case "$mode" in
  --dry-run)
    compose exec -T \
      --env UPLOAD_DIR=/app/public/uploads \
      web "${common_args[@]}"
    ;;
  --apply)
    bash "$APP_DIR/ops/backup.sh" upload-cleanup
    compose exec -T \
      --env UPLOAD_DIR=/app/public/uploads \
      --env UPLOAD_CLEANUP_CONFIRMED=1 \
      web "${common_args[@]}" --apply
    ;;
  *)
    fail "Usage: ops/cleanup-uploads.sh [--dry-run|--apply]"
    ;;
esac
