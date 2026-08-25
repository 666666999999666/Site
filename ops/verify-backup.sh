#!/usr/bin/env bash

source "${QZSITE_OPS_COMMON:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh}"

db_backup="${1:-}"
if [[ -z "$db_backup" ]]; then
  shopt -s nullglob
  backups=("$BACKUP_DIR"/qzsite-*.dump)
  ((${#backups[@]} > 0)) || fail "No database backup found in $BACKUP_DIR"
  db_backup="${backups[${#backups[@]}-1]}"
fi
db_backup="$(realpath -- "$db_backup")"
[[ "$db_backup" == "$BACKUP_DIR/"* ]] || fail "Backup must be inside $BACKUP_DIR"
require_file "$db_backup"

base="${db_backup%.dump}"
uploads_backup="${base}-uploads.tar.gz"
study_uploads_backup="${base}-study-uploads.tar.gz"
manifest="${base}.sha256"
require_file "$uploads_backup"
require_file "$manifest"

study_archive_present=0
if [[ -f "$study_uploads_backup" ]]; then
  study_archive_present=1
fi

db_name="$(basename "$db_backup")"
uploads_name="$(basename "$uploads_backup")"
study_uploads_name="$(basename "$study_uploads_backup")"

log "Checking backup hashes and archive structure"
mapfile -t manifest_names < <(awk '{ print $2 }' "$manifest")
declare -A expected_manifest=(
  ["$db_name"]=0
  ["$uploads_name"]=0
)
if ((study_archive_present == 1)); then
  expected_manifest["$study_uploads_name"]=0
fi
[[ "${#manifest_names[@]}" -eq "${#expected_manifest[@]}" ]] \
  || fail "Backup manifest has the wrong number of files"
for name in "${manifest_names[@]}"; do
  [[ -v "expected_manifest[$name]" ]] || fail "Unexpected file in backup manifest: $name"
  ((expected_manifest["$name"] += 1))
done
for name in "${!expected_manifest[@]}"; do
  [[ "${expected_manifest[$name]}" -eq 1 ]] \
    || fail "Backup manifest entry is missing or duplicated: $name"
done
(
  cd "$BACKUP_DIR"
  sha256sum --check --strict "$(basename "$manifest")"
)
tar --list --gzip --file "$uploads_backup" > /dev/null
mapfile -t uploads_entries < <(tar --list --gzip --file "$uploads_backup")
mapfile -t uploads_types < <(
  tar --list --verbose --gzip --file "$uploads_backup" | awk '{ print substr($0, 1, 1) }'
)
((${#uploads_entries[@]} > 0)) || fail "Public uploads archive has no root directory"
[[ "${#uploads_entries[@]}" -eq "${#uploads_types[@]}" ]] \
  || fail "Public uploads archive metadata is inconsistent"

declare -A seen_uploads_entries=()
uploads_root_entries=0
uploads_staging_entries=0
for index in "${!uploads_entries[@]}"; do
  entry="${uploads_entries[$index]}"
  entry_type="${uploads_types[$index]}"
  [[ -z "${seen_uploads_entries[$entry]+present}" ]] \
    || fail "Duplicate entry in public uploads archive: $entry"
  seen_uploads_entries["$entry"]=1

  if [[ "$entry" == "uploads/" || "$entry" == "uploads" ]]; then
    [[ "$entry_type" == "d" ]] || fail "Public uploads root is not a directory"
    ((uploads_root_entries += 1))
    continue
  fi
  # Historical backups may contain the empty MCP staging directory itself.
  # Its payloads were never durable data: any descendant, link, or duplicate
  # remains forbidden. New backups exclude the directory completely.
  if [[ "$entry" == "uploads/.mcp-staging/" || "$entry" == "uploads/.mcp-staging" ]]; then
    [[ "$entry_type" == "d" ]] || fail "Historical MCP staging entry is not a directory"
    ((uploads_staging_entries += 1))
    ((uploads_staging_entries == 1)) \
      || fail "Public uploads archive contains duplicate MCP staging directories"
    continue
  fi
  [[ "$entry" =~ ^uploads/[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
    || fail "Unsafe entry in public uploads archive: $entry"
  [[ "$entry_type" == "-" ]] \
    || fail "Links and non-regular files are forbidden in public uploads archive: $entry"
done
((uploads_root_entries == 1)) \
  || fail "Public uploads archive must contain one root directory"

if ((study_archive_present == 1)); then
  tar --list --gzip --file "$study_uploads_backup" > /dev/null
  mapfile -t study_entries < <(tar --list --gzip --file "$study_uploads_backup")
  mapfile -t study_types < <(
    tar --list --verbose --gzip --file "$study_uploads_backup" | awk '{ print substr($0, 1, 1) }'
  )
  ((${#study_entries[@]} > 0)) || fail "Private study uploads archive has no root directory"
  [[ "${#study_entries[@]}" -eq "${#study_types[@]}" ]] \
    || fail "Private study uploads archive metadata is inconsistent"

  declare -A seen_study_entries=()
  study_root_entries=0
  for index in "${!study_entries[@]}"; do
    entry="${study_entries[$index]}"
    entry_type="${study_types[$index]}"
    [[ -z "${seen_study_entries[$entry]+present}" ]] \
      || fail "Duplicate entry in private study uploads archive: $entry"
    seen_study_entries["$entry"]=1

    if [[ "$entry" == "study-uploads/" || "$entry" == "study-uploads" ]]; then
      [[ "$entry_type" == "d" ]] || fail "Private study uploads root is not a directory"
      ((study_root_entries += 1))
      continue
    fi
    [[ "$entry" =~ ^study-uploads/[0-9a-f-]{36}\.(jpg|png|gif|webp)$ ]] \
      || fail "Unsafe entry in private study uploads archive: $entry"
    [[ "$entry_type" == "-" ]] \
      || fail "Links and non-regular files are forbidden in private study uploads archive: $entry"
  done
  ((study_root_entries == 1)) \
    || fail "Private study uploads archive must contain one root directory"
fi

restore_tmp="$(mktemp -d)"
container="qzsite-restore-$$-$RANDOM"
cleanup() {
  docker rm --force "$container" > /dev/null 2>&1 || true
  rm -rf -- "$restore_tmp"
}
trap cleanup EXIT

tar --extract --gzip --file "$uploads_backup" \
  --directory "$restore_tmp" --no-same-owner --no-same-permissions \
  --delay-directory-restore
[[ -d "$restore_tmp/uploads" && ! -L "$restore_tmp/uploads" ]] \
  || fail "Public uploads archive did not extract to a real uploads directory"

if ((study_archive_present == 1)); then
  tar --extract --gzip --file "$study_uploads_backup" \
    --directory "$restore_tmp" --no-same-owner --no-same-permissions \
    --delay-directory-restore
else
  mkdir "$restore_tmp/study-uploads"
fi

verified_uploads=0
while IFS= read -r -d '' extracted_path; do
  [[ ! -L "$extracted_path" ]] \
    || fail "Public uploads extraction produced a symbolic link: $extracted_path"
  if [[ -f "$extracted_path" ]]; then
    ((verified_uploads += 1))
  else
    [[ -d "$extracted_path" \
      && "$extracted_path" == "$restore_tmp/uploads/.mcp-staging" ]] \
      || fail "Public uploads extraction produced an unexpected non-regular file: $extracted_path"
  fi
done < <(find "$restore_tmp/uploads" -mindepth 1 -print0)

restore_image="${RESTORE_IMAGE:-postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777}"

log "Starting isolated PostgreSQL restore container"
docker run --detach --name "$container" \
  --network none \
  --memory 384m \
  --memory-swap 384m \
  --cpus 0.75 \
  --pids-limit 256 \
  --tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=256m \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  "$restore_image" > /dev/null

ready=0
for _ in {1..60}; do
  if docker exec "$container" pg_isready --username postgres > /dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
((ready == 1)) || fail "Restore database did not become ready"

docker exec --interactive "$container" \
  pg_restore --username postgres --dbname postgres --no-owner --no-acl \
  < "$db_backup"

has_question_schema="$(
  docker exec "$container" psql --username postgres --dbname postgres \
    --tuples-only --no-align --command \
    "SELECT to_regclass('\"QuestionImage\"') IS NOT NULL;"
)"
if [[ "$has_question_schema" == "t" && "$study_archive_present" -ne 1 ]]; then
  fail "Private study uploads archive is required for backups containing Questions data"
fi

if [[ "$has_question_schema" == "t" ]]; then
  counts="$(
    docker exec "$container" psql --username postgres --dbname postgres \
      --tuples-only --no-align --command \
      'SELECT json_build_object(
        '\''posts'\'', (SELECT COUNT(*) FROM "Post"),
        '\''projects'\'', (SELECT COUNT(*) FROM "Project"),
        '\''settings'\'', (SELECT COUNT(*) FROM "Setting"),
        '\''todos'\'', (SELECT COUNT(*) FROM "Todo"),
        '\''users'\'', (SELECT COUNT(*) FROM "User"),
        '\''questions'\'', (SELECT COUNT(*) FROM "Question"),
        '\''questionReviewLogs'\'', (SELECT COUNT(*) FROM "QuestionReviewLog"),
        '\''questionAttempts'\'', (SELECT COUNT(*) FROM "QuestionAttempt"),
        '\''questionImages'\'', (SELECT COUNT(*) FROM "QuestionImage"),
        '\''migrations'\'', (SELECT COUNT(*) FROM "_prisma_migrations")
      );'
  )"
else
  counts="$(
    docker exec "$container" psql --username postgres --dbname postgres \
      --tuples-only --no-align --command \
      'SELECT json_build_object(
        '\''posts'\'', (SELECT COUNT(*) FROM "Post"),
        '\''projects'\'', (SELECT COUNT(*) FROM "Project"),
        '\''settings'\'', (SELECT COUNT(*) FROM "Setting"),
        '\''todos'\'', (SELECT COUNT(*) FROM "Todo"),
        '\''users'\'', (SELECT COUNT(*) FROM "User"),
        '\''migrations'\'', (SELECT COUNT(*) FROM "_prisma_migrations")
      );'
  )"
fi
[[ -n "$counts" ]] || fail "Restore verification query returned no result"

image_rows="$restore_tmp/question-images.tsv"
if [[ "$has_question_schema" == "t" ]]; then
  docker exec "$container" psql --username postgres --dbname postgres \
    --tuples-only --no-align --field-separator=$'\t' --command \
    'SELECT "storageKey", "byteSize", lower(btrim("sha256"))
     FROM "QuestionImage"
     ORDER BY "storageKey";' \
    > "$image_rows"
else
  : > "$image_rows"
fi

verified_images=0
while IFS=$'\t' read -r storage_key expected_size expected_sha; do
  [[ -n "$storage_key" ]] || continue
  [[ "$storage_key" =~ ^[0-9a-f-]{36}\.(jpg|png|gif|webp)$ ]] \
    || fail "Unsafe QuestionImage storage key in restored database: $storage_key"
  [[ "$expected_size" =~ ^[0-9]+$ ]] \
    || fail "Invalid byteSize for QuestionImage: $storage_key"
  [[ "$expected_sha" =~ ^[0-9a-f]{64}$ ]] \
    || fail "Invalid SHA-256 for QuestionImage: $storage_key"

  image_path="$restore_tmp/study-uploads/$storage_key"
  [[ -f "$image_path" && ! -L "$image_path" ]] \
    || fail "QuestionImage file is missing from private backup: $storage_key"
  actual_size="$(stat --format='%s' -- "$image_path")"
  [[ "$actual_size" == "$expected_size" ]] \
    || fail "QuestionImage byteSize mismatch: $storage_key"
  actual_sha="$(sha256sum -- "$image_path")"
  actual_sha="${actual_sha%% *}"
  [[ "$actual_sha" == "$expected_sha" ]] \
    || fail "QuestionImage SHA-256 mismatch: $storage_key"
  ((verified_images += 1))
done < "$image_rows"

log "Restore verified: $counts publicUploads=$verified_uploads privateStudyImages=$verified_images"

verified_set="$(basename "$base")"
[[ "$verified_set" =~ ^qzsite-[0-9]{8}T[0-9]{6}Z-[a-z0-9-]+$ ]] \
  || fail "Verified backup set name is unsafe"
verified_marker_tmp="$(mktemp "$BACKUP_DIR/.last-verified-backup.XXXXXX")"
printf '%s\n' "$verified_set" > "$verified_marker_tmp"
chmod 600 "$verified_marker_tmp"
mv -- "$verified_marker_tmp" "$BACKUP_DIR/.last-verified-backup"
log "Recorded latest verified backup set: $verified_set"
