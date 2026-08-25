#!/usr/bin/env bash

source "${QZSITE_OPS_COMMON:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh}"

label="${1:-manual}"
[[ "$label" =~ ^[a-z0-9-]+$ ]] || fail "Backup label must contain only a-z, 0-9, and hyphens"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
exec 8>"$BACKUP_DIR/.backup.lock"
flock -w 60 8 || fail "Another backup is still running"

stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
base="qzsite-${stamp}-${label}"
db_file="$BACKUP_DIR/${base}.dump"
uploads_file="$BACKUP_DIR/${base}-uploads.tar.gz"
study_uploads_file="$BACKUP_DIR/${base}-study-uploads.tar.gz"
manifest_file="$BACKUP_DIR/${base}.sha256"
db_tmp="${db_file}.tmp"
uploads_tmp="${uploads_file}.tmp"
study_uploads_tmp="${study_uploads_file}.tmp"

cleanup() {
  rm -f -- "$db_tmp" "$uploads_tmp" "$study_uploads_tmp"
}
trap cleanup EXIT

log "Creating PostgreSQL backup"
compose exec -T db sh -ceu \
  'exec pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  > "$db_tmp"
[[ -s "$db_tmp" ]] || fail "PostgreSQL backup is empty"
compose exec -T db pg_restore --list < "$db_tmp" > /dev/null

log "Creating uploads backup"
public_uploads_dir="$(ensure_safe_data_subdirectory uploads)"
public_data_root="$(dirname -- "$public_uploads_dir")"
# `.mcp-staging` contains short-lived import payloads, not durable user data.
# Excluding the directory keeps every new public archive inside the strict
# single-level restore contract enforced by verify-backup.sh.
tar --create --gzip --file "$uploads_tmp" --directory "$public_data_root" \
  --exclude='uploads/.mcp-staging' \
  --exclude='uploads/.mcp-staging/**' \
  uploads
tar --list --gzip --file "$uploads_tmp" > /dev/null

log "Creating private study uploads backup through the Web image's non-root identity"
web_container_id="$(compose ps --quiet web 2>/dev/null || true)"
if [[ -n "$web_container_id" ]]; then
  backup_web_image="$(docker inspect "$web_container_id" --format '{{.Image}}')"
else
  backup_web_image="$(awk -F= '$1 == "WEB_IMAGE" { print substr($0, index($0, "=") + 1) }' "$APP_DIR/.env" | tail -n 1)"
fi
if [[ ! "$backup_web_image" =~ ^ccr\.ccs\.tencentyun\.com/lqzzql/web[:@][A-Za-z0-9._:@-]+$ \
  && ! "$backup_web_image" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  fail "Configured Web image reference is invalid"
fi
docker image inspect "$backup_web_image" > /dev/null 2>&1 \
  || fail "Configured Web image is not available locally for private backup"

study_archive_mode="empty"
study_mount_args=()
if [[ -e "$APP_DIR/data/study-uploads" || -L "$APP_DIR/data/study-uploads" ]]; then
  [[ -d "$APP_DIR/data/study-uploads" && ! -L "$APP_DIR/data/study-uploads" ]] \
    || fail "Host study upload path must be a real directory"
  data_root="$(realpath -- "$APP_DIR/data")"
  study_uploads_dir="$(realpath -- "$APP_DIR/data/study-uploads")"
  [[ "$study_uploads_dir" == "$data_root/study-uploads" ]] \
    || fail "Study upload directory resolved outside the expected data directory"
  study_archive_mode="mounted"
  study_mount_args=(--volume "$study_uploads_dir:/study-uploads:ro")
fi

docker run --rm --read-only --network none \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,mode=1777,size=1m \
  "${study_mount_args[@]}" \
  --entrypoint sh \
  "$backup_web_image" \
  -ceu '
    test "$(id -u)" -ne 0
    if test "$1" = mounted; then
      test -d /study-uploads
      test -r /study-uploads
      test -x /study-uploads
      exec tar -C / -czf - study-uploads
    fi

    test "$1" = empty
    empty_root="$(mktemp -d)"
    trap '\''rm -rf -- "$empty_root"'\'' EXIT
    mkdir "$empty_root/study-uploads"
    tar -C "$empty_root" -czf - study-uploads
  ' -- "$study_archive_mode" > "$study_uploads_tmp"
[[ -s "$study_uploads_tmp" ]] || fail "Private study uploads backup is empty"
tar --list --gzip --file "$study_uploads_tmp" > /dev/null

mv -- "$db_tmp" "$db_file"
mv -- "$uploads_tmp" "$uploads_file"
mv -- "$study_uploads_tmp" "$study_uploads_file"
(
  cd "$BACKUP_DIR"
  sha256sum \
    "$(basename "$db_file")" \
    "$(basename "$uploads_file")" \
    "$(basename "$study_uploads_file")" \
    > "$(basename "$manifest_file")"
)
chmod 600 "$db_file" "$uploads_file" "$study_uploads_file" "$manifest_file"

declare -A pruned_backup_sets=()

backup_set_complete() {
  local candidate="$1"
  [[ -f "$BACKUP_DIR/${candidate}.dump" \
    && -f "$BACKUP_DIR/${candidate}-uploads.tar.gz" \
    && -f "$BACKUP_DIR/${candidate}-study-uploads.tar.gz" \
    && -f "$BACKUP_DIR/${candidate}.sha256" ]]
}

backup_label() {
  local candidate="$1"
  printf '%s\n' "${candidate#qzsite-????????T??????Z-}"
}

delete_backup_set() {
  local candidate="$1"
  [[ "$candidate" =~ ^qzsite-[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+$ ]] \
    || fail "Refusing to prune an unsafe backup set name: $candidate"
  backup_set_complete "$candidate" \
    || fail "Refusing to split an incomplete backup set: $candidate"
  [[ "${protected_backup_set:-}" != "$candidate" ]] \
    || return 0
  log "Pruning complete backup set: $candidate"
  rm -f -- \
    "$BACKUP_DIR/${candidate}.dump" \
    "$BACKUP_DIR/${candidate}-uploads.tar.gz" \
    "$BACKUP_DIR/${candidate}-study-uploads.tar.gz" \
    "$BACKUP_DIR/${candidate}.sha256"
  pruned_backup_sets["$candidate"]=1
}

protected_backup_set=""
verified_marker="$BACKUP_DIR/.last-verified-backup"
if [[ -f "$verified_marker" ]]; then
  IFS= read -r protected_backup_set < "$verified_marker" || true
  if [[ ! "$protected_backup_set" =~ ^qzsite-[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+$ ]] \
    || ! backup_set_complete "$protected_backup_set"; then
    log "Ignoring invalid latest-verified backup marker"
    protected_backup_set=""
  fi
fi

shopt -s nullglob
complete_backup_sets=()
for candidate_manifest in "$BACKUP_DIR"/qzsite-*.sha256; do
  candidate_name="$(basename "$candidate_manifest" .sha256)"
  [[ "$candidate_name" =~ ^qzsite-[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+$ ]] || continue
  backup_set_complete "$candidate_name" || continue
  complete_backup_sets+=("$candidate_name")
done
if ((${#complete_backup_sets[@]} > 0)); then
  mapfile -t complete_backup_sets < <(printf '%s\n' "${complete_backup_sets[@]}" | sort)
fi

# Scheduled sets expire by age. Other policies are count based so a delayed
# maintenance run cannot accidentally split or over-delete a backup family.
for candidate_name in "${complete_backup_sets[@]}"; do
  [[ "$(backup_label "$candidate_name")" == "scheduled" ]] || continue
  [[ -n "$(find "$BACKUP_DIR/${candidate_name}.sha256" -maxdepth 0 -type f -mtime +30 -print -quit)" ]] \
    || continue
  delete_backup_set "$candidate_name"
done

prune_group_to_count() {
  local group="$1"
  local keep="$2"
  local grouped=()
  local candidate current_label remove_count index
  for candidate in "${complete_backup_sets[@]}"; do
    [[ -z "${pruned_backup_sets[$candidate]+present}" ]] || continue
    current_label="$(backup_label "$candidate")"
    case "$group" in
      predeploy)
        [[ "$current_label" == "predeploy" ]] || continue
        ;;
      cleanup)
        [[ "$current_label" == "storage-cleanup" \
          || "$current_label" == "upload-cleanup" \
          || "$current_label" == "study-upload-cleanup" \
          || "$current_label" == "cleanup" ]] || continue
        ;;
      migration)
        [[ "$current_label" == "migration" ]] || continue
        ;;
      *)
        fail "Unknown backup retention group: $group"
        ;;
    esac
    grouped+=("$candidate")
  done
  remove_count=$((${#grouped[@]} - keep))
  ((remove_count > 0)) || return 0
  for ((index = 0; index < remove_count; index += 1)); do
    delete_backup_set "${grouped[$index]}"
  done
}

prune_group_to_count predeploy 5
prune_group_to_count cleanup 3
prune_group_to_count migration 3

backup_total_bytes() {
  local total=0 candidate suffix file_size
  for candidate in "${complete_backup_sets[@]}"; do
    [[ -z "${pruned_backup_sets[$candidate]+present}" ]] || continue
    for suffix in .dump -uploads.tar.gz -study-uploads.tar.gz .sha256; do
      file_size="$(stat --format='%s' -- "$BACKUP_DIR/${candidate}${suffix}")"
      total=$((total + file_size))
    done
  done
  printf '%s\n' "$total"
}

# If complete sets alone exceed 1 GiB, remove older non-protected predeploy
# sets first. Keep the newest predeploy set for a local rollback even under the
# quota; never broaden quota cleanup to manual or verified backups.
quota_bytes=$((1024 * 1024 * 1024))
current_total="$(backup_total_bytes)"
remaining_predeploy=()
for candidate_name in "${complete_backup_sets[@]}"; do
  [[ -z "${pruned_backup_sets[$candidate_name]+present}" ]] || continue
  [[ "$(backup_label "$candidate_name")" == "predeploy" ]] || continue
  remaining_predeploy+=("$candidate_name")
done
for candidate_name in "${remaining_predeploy[@]}"; do
  ((current_total > quota_bytes)) || break
  ((${#remaining_predeploy[@]} > 1)) || break
  [[ "$candidate_name" != "${remaining_predeploy[${#remaining_predeploy[@]}-1]}" ]] || break
  delete_backup_set "$candidate_name"
  current_total="$(backup_total_bytes)"
done
if ((current_total > quota_bytes)); then
  log "Backup sets still exceed 1 GiB; protected and non-predeploy sets were retained"
fi

log "Backup complete: $base"
printf 'BACKUP_SET=%s\n' "$base"
