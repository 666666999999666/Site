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
OPERATION_LOCK_PATH="/tmp/qzsite-operation.lock"
ACME_LOCK_PATH="/tmp/qzsite-acme.lock"

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

require_exact_directory() {
  local path="$1"
  local expected="$2"
  local label="$3"
  [[ "$path" == "$expected" ]] \
    || fail "$label path is not the expected application directory"
  [[ -d "$path" && ! -L "$path" ]] \
    || fail "$label path must be a real directory"
  [[ "$(realpath -- "$path")" == "$expected" ]] \
    || fail "$label path resolved outside the application directory"
}

ensure_exact_directory() {
  local path="$1"
  local expected="$2"
  local label="$3"
  [[ "$path" == "$expected" && ! -L "$path" ]] \
    || fail "$label path is not a safe application directory"
  mkdir -p -- "$path"
  require_exact_directory "$path" "$expected" "$label"
}

require_regular_or_absent() {
  local path="$1"
  local label="$2"
  [[ ! -L "$path" && (! -e "$path" || -f "$path") ]] \
    || fail "$label must be a regular file or absent"
}

prepare_owned_lock_file() {
  local lock_path="$1"
  local lock_label="$2"
  local app_owner app_mode current_uid lock_owner lock_mode
  app_owner="$(stat --format='%u' -- "$APP_DIR")"
  app_mode="$(stat --format='%a' -- "$APP_DIR")"
  current_uid="$(id -u)"
  [[ "$current_uid" == "$app_owner" ]] \
    || fail "Operations must run as the application directory owner, without sudo bash"
  [[ "$app_mode" =~ ^[0-7]{3,4}$ ]] \
    || fail "Application directory mode is invalid"
  (( (8#$app_mode & 8#022) == 0 )) \
    || fail "Application directory must not be group/world-writable"
  if [[ ! -e "$lock_path" && ! -L "$lock_path" ]]; then
    (
      umask 077
      set -o noclobber
      : > "$lock_path"
    ) 2> /dev/null || true
  fi
  [[ -f "$lock_path" && ! -L "$lock_path" ]] \
    || fail "$lock_label must be a regular file"
  lock_owner="$(stat --format='%u' -- "$lock_path")"
  lock_mode="$(stat --format='%a' -- "$lock_path")"
  [[ "$lock_owner" == "$current_uid" && "$lock_mode" == "600" ]] \
    || fail "$lock_label must be owned by the application owner with mode 600"
}

prepare_operation_lock() {
  prepare_owned_lock_file "$OPERATION_LOCK_PATH" "Operation lock"
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
