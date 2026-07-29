#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

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
manifest="${base}.sha256"
require_file "$uploads_backup"
require_file "$manifest"

log "Checking backup hashes and archive structure"
(
  cd "$BACKUP_DIR"
  sha256sum --check "$(basename "$manifest")"
)
tar --list --gzip --file "$uploads_backup" > /dev/null

restore_image="${RESTORE_IMAGE:-postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777}"
container="qzsite-restore-$$-$RANDOM"
cleanup() {
  docker rm --force "$container" > /dev/null 2>&1 || true
}
trap cleanup EXIT

log "Starting isolated PostgreSQL restore container"
docker run --detach --name "$container" \
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
[[ -n "$counts" ]] || fail "Restore verification query returned no result"

log "Restore verified: $counts"
