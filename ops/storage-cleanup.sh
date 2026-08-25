#!/usr/bin/env bash

source "${QZSITE_OPS_COMMON:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh}"

extract_count() {
  local report="$1"
  local key="$2"
  local value
  value="$(printf '%s\n' "$report" | sed -n "s/.*${key}=\([0-9][0-9]*\).*/\1/p" | tail -n 1)"
  [[ "$value" =~ ^[0-9]+$ ]] || fail "Cleanup probe did not report $key"
  printf '%s\n' "$value"
}

log "Calculating public upload cleanup workload"
public_report="$(bash "$APP_DIR/ops/cleanup-uploads.sh" --dry-run)"
printf '%s\n' "$public_report"
public_count="$(extract_count "$public_report" orphanUploads)"
public_bytes="$(extract_count "$public_report" orphanUploadBytes)"

log "Calculating private Question image and review-ticket workload"
study_report="$(bash "$APP_DIR/ops/cleanup-study-uploads.sh" --dry-run)"
printf '%s\n' "$study_report"
expired_tickets="$(extract_count "$study_report" expiredReviewTickets)"
repair_images="$(extract_count "$study_report" repairCandidates)"
due_images="$(extract_count "$study_report" dueImageRows)"
orphan_study_files="$(extract_count "$study_report" oldFilesWithoutRow)"
private_count=$((repair_images + due_images + orphan_study_files))
total_count=$((public_count + private_count + expired_tickets))

log "Storage workload: publicUploads=$public_count publicBytes=$public_bytes privateQuestionItems=$private_count expiredReviewTickets=$expired_tickets"
if ((total_count == 0)); then
  log "No storage cleanup candidates; no backup was created"
  exit 0
fi

log "Candidates exist; creating one complete backup before both guarded cleanups"
backup_report="$(bash "$APP_DIR/ops/backup.sh" storage-cleanup)"
printf '%s\n' "$backup_report"
backup_set="$(printf '%s\n' "$backup_report" | sed -n 's/^BACKUP_SET=\(qzsite-[0-9]\{8\}T[0-9]\{6\}Z-storage-cleanup\)$/\1/p' | tail -n 1)"
[[ "$backup_set" =~ ^qzsite-[0-9]{8}T[0-9]{6}Z-storage-cleanup$ ]] \
  || fail "Complete storage cleanup backup identifier was not returned"

export QZSITE_STORAGE_BACKUP_READY="$backup_set"
bash "$APP_DIR/ops/cleanup-uploads.sh" --apply
bash "$APP_DIR/ops/cleanup-study-uploads.sh" --apply

log "Storage cleanup complete using backup set: $backup_set"
