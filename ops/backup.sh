#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

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
manifest_file="$BACKUP_DIR/${base}.sha256"
db_tmp="${db_file}.tmp"
uploads_tmp="${uploads_file}.tmp"

cleanup() {
  rm -f -- "$db_tmp" "$uploads_tmp"
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

mv -- "$db_tmp" "$db_file"
mv -- "$uploads_tmp" "$uploads_file"
(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$db_file")" "$(basename "$uploads_file")" \
    > "$(basename "$manifest_file")"
)
chmod 600 "$db_file" "$uploads_file" "$manifest_file"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'qzsite-*' -mtime +30 -delete

log "Backup complete: $base"
printf 'BACKUP_SET=%s\n' "$base"
