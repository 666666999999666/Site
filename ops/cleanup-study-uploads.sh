#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

mode="${1:---dry-run}"
common_args=(
  /prisma/node_modules/.bin/tsx
  /prisma/tools/scripts/cleanup-study-uploads.ts
)

require_safe_data_subdirectory study-uploads > /dev/null

case "$mode" in
  --dry-run)
    compose exec -T \
      --env STUDY_UPLOAD_DIR=/app/data/study-uploads \
      web "${common_args[@]}"
    ;;
  --apply)
    if [[ -n "${QZSITE_STORAGE_BACKUP_READY:-}" ]]; then
      [[ "$QZSITE_STORAGE_BACKUP_READY" =~ ^qzsite-[0-9]{8}T[0-9]{6}Z-storage-cleanup$ ]] \
        || fail "Unified storage backup identifier is invalid"
      require_file "$BACKUP_DIR/${QZSITE_STORAGE_BACKUP_READY}.dump"
      require_file "$BACKUP_DIR/${QZSITE_STORAGE_BACKUP_READY}-uploads.tar.gz"
      require_file "$BACKUP_DIR/${QZSITE_STORAGE_BACKUP_READY}-study-uploads.tar.gz"
      require_file "$BACKUP_DIR/${QZSITE_STORAGE_BACKUP_READY}.sha256"
    else
      bash "$APP_DIR/ops/backup.sh" study-upload-cleanup
    fi
    compose exec -T \
      --env STUDY_UPLOAD_DIR=/app/data/study-uploads \
      --env STUDY_UPLOAD_CLEANUP_CONFIRMED=1 \
      web "${common_args[@]}" --apply
    ;;
  *)
    fail "Usage: ops/cleanup-study-uploads.sh [--dry-run|--apply]"
    ;;
esac
