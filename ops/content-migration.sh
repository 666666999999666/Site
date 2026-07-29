#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

mode="${1:---dry-run}"
case "$mode" in
  --dry-run)
    compose exec -T web \
      /prisma/node_modules/.bin/tsx \
      /prisma/tools/scripts/migrate-tiptap-content.ts
    ;;
  --apply)
    bash "$APP_DIR/ops/backup.sh" content-migration
    compose exec -T \
      --env CONTENT_MIGRATION_BACKUP_CONFIRMED=1 \
      web \
      /prisma/node_modules/.bin/tsx \
      /prisma/tools/scripts/migrate-tiptap-content.ts \
      --apply
    ;;
  *)
    fail "Usage: ops/content-migration.sh [--dry-run|--apply]"
    ;;
esac
