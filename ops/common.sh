#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

OPS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "$OPS_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
  log "ERROR: $*" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "Required file is missing: $1"
}

compose() {
  docker compose \
    --env-file "$APP_DIR/.env" \
    --project-directory "$APP_DIR" \
    "$@"
}

require_file "$APP_DIR/.env"
cd "$APP_DIR"
