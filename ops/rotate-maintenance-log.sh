#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

log_file="$BACKUP_DIR/maintenance.log"
max_bytes=$((10 * 1024 * 1024))

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
touch "$log_file"
chmod 600 "$log_file"

exec 7>"$BACKUP_DIR/.maintenance-log.lock"
flock -w 30 7 || fail "Another maintenance log rotation is still running"

current_bytes="$(stat --format='%s' -- "$log_file")"
[[ "$current_bytes" =~ ^[0-9]+$ ]] || fail "Maintenance log size is invalid"
((current_bytes >= max_bytes)) || exit 0

rm -f -- "$log_file.5.gz"
for generation in 4 3 2 1; do
  if [[ -f "$log_file.$generation.gz" ]]; then
    mv -- "$log_file.$generation.gz" "$log_file.$((generation + 1)).gz"
  fi
done

compressed_tmp="$(mktemp "$BACKUP_DIR/.maintenance.log.XXXXXX.gz")"
cleanup() {
  rm -f -- "$compressed_tmp"
}
trap cleanup EXIT
gzip --stdout -- "$log_file" > "$compressed_tmp"
chmod 600 "$compressed_tmp"
mv -- "$compressed_tmp" "$log_file.1.gz"
truncate --size 0 "$log_file"
chmod 600 "$log_file"

log "Rotated maintenance.log at ${current_bytes} bytes"
