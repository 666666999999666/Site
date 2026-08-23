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
mkdir -p "$APP_DIR/data/uploads"
tar --create --gzip --file "$uploads_tmp" --directory "$APP_DIR/data" uploads
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

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'qzsite-*' -mtime +30 -delete

log "Backup complete: $base"
printf 'BACKUP_SET=%s\n' "$base"
