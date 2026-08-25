#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

OPS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${QZSITE_APP_DIR_OVERRIDE:-}" ]]; then
  [[ "$QZSITE_APP_DIR_OVERRIDE" == /* ]] \
    || {
      printf 'QZSITE_APP_DIR_OVERRIDE must be an absolute path\n' >&2
      exit 1
    }
  APP_DIR="$(cd -- "$QZSITE_APP_DIR_OVERRIDE" && pwd -P)"
  [[ -e "$APP_DIR/.git" && ! -L "$APP_DIR/.git" ]] \
    || {
      printf 'QZSITE_APP_DIR_OVERRIDE is not a Git worktree\n' >&2
      exit 1
    }
else
  APP_DIR="$(cd -- "$OPS_DIR/.." && pwd)"
fi
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

require_safe_data_subdirectory() {
  local name="$1"
  [[ "$name" =~ ^[a-z0-9-]+$ ]] \
    || fail "Data subdirectory name is invalid: $name"
  local data_path="$APP_DIR/data"
  local target_path="$data_path/$name"
  [[ -d "$data_path" && ! -L "$data_path" ]] \
    || fail "Data root must be a real directory: $data_path"
  [[ -d "$target_path" && ! -L "$target_path" ]] \
    || fail "Data subdirectory must be a real directory: $target_path"
  local data_root target_root
  data_root="$(realpath "$data_path")"
  target_root="$(realpath "$target_path")"
  [[ "$target_root" == "$data_root/$name" ]] \
    || fail "Data subdirectory resolved outside the data root: $target_path"
  printf '%s\n' "$target_root"
}

ensure_safe_data_subdirectory() {
  local name="$1"
  [[ "$name" =~ ^[a-z0-9-]+$ ]] \
    || fail "Data subdirectory name is invalid: $name"
  local data_path="$APP_DIR/data"
  local target_path="$data_path/$name"
  [[ ! -L "$data_path" ]] || fail "Data root must not be a symbolic link"
  mkdir -p -- "$data_path"
  [[ ! -L "$target_path" ]] || fail "Data subdirectory must not be a symbolic link"
  mkdir -p -- "$target_path"
  require_safe_data_subdirectory "$name"
}

compose() {
  docker compose \
    --env-file "$APP_DIR/.env" \
    --file "$APP_DIR/docker-compose.yml" \
    --project-directory "$APP_DIR" \
    "$@"
}

require_file "$APP_DIR/.env"
cd "$APP_DIR"
