#!/usr/bin/env bash

source "${QZSITE_OPS_COMMON:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh}"

image="${1:-}"
role="${2:-configured}"

if [[ -z "$image" ]]; then
  image="$(awk -F= '$1 == "WEB_IMAGE" { print substr($0, index($0, "=") + 1) }' "$APP_DIR/.env" | tail -n 1)"
fi
[[ "$role" =~ ^[A-Za-z0-9._-]{1,32}$ ]] || fail "Study upload runtime role is invalid"
if [[ ! "$image" =~ ^ccr\.ccs\.tencentyun\.com/lqzzql/web[:@][A-Za-z0-9._:@-]+$ \
  && ! "$image" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  fail "$role Web image reference is invalid"
fi
docker image inspect "$image" > /dev/null 2>&1 \
  || fail "$role Web image is not available locally"

runtime_identity="$({
  docker run --rm --read-only --network none \
    --entrypoint sh \
    "$image" \
    -ceu 'uid="$(id -u)"; gid="$(id -g)"; test "$uid" -ne 0; printf "%s:%s\n" "$uid" "$gid"'
} 2>/dev/null)" || fail "Could not inspect the $role Web runtime identity"
if [[ ! "$runtime_identity" =~ ^([0-9]+):([0-9]+)$ ]]; then
  fail "$role Web image returned an invalid runtime UID/GID"
fi
runtime_uid="${BASH_REMATCH[1]}"
runtime_gid="${BASH_REMATCH[2]}"
((runtime_uid != 0)) || fail "$role Web image must not run as root"

data_path="$APP_DIR/data"
[[ -d "$data_path" && ! -L "$data_path" ]] \
  || fail "Application data path must be a real directory"
data_root="$(realpath -- "$data_path")"
[[ "$data_root" == "$data_path" ]] \
  || fail "Application data directory resolved outside the expected path"
study_uploads_path="$data_root/study-uploads"
if [[ -e "$study_uploads_path" || -L "$study_uploads_path" ]]; then
  [[ -d "$study_uploads_path" && ! -L "$study_uploads_path" ]] \
    || fail "Study upload path must be a real directory"
  [[ "$(realpath -- "$study_uploads_path")" == "$study_uploads_path" ]] \
    || fail "Study upload directory resolved outside the expected data directory"
fi

# Docker intentionally creates a missing bind source through the daemon, because
# an existing production data directory may be owned by a container runtime UID.
docker run --rm --read-only --network none \
  --user 0:0 \
  --volume "$study_uploads_path:/study-uploads:rw" \
  --entrypoint sh \
  "$image" \
  -ceu '
    target=/study-uploads
    test -d "$target"
    chown -R "$1:$2" "$target"
    chmod 0750 "$target"
    actual="$(stat -c "%u:%g:%a" "$target")"
    test "$actual" = "$1:$2:750"
  ' -- "$runtime_uid" "$runtime_gid" \
  || fail "Could not assign study uploads to the $role Web runtime"

study_uploads_dir="$(realpath -- "$study_uploads_path")"
[[ "$study_uploads_dir" == "$study_uploads_path" ]] \
  || fail "Study upload directory resolved outside the expected data directory"
[[ -d "$study_uploads_dir" && ! -L "$study_uploads_path" ]] \
  || fail "Study upload path must be a real directory"

docker run --rm --read-only --network none \
  --volume "$study_uploads_dir:/study-uploads" \
  --entrypoint sh \
  "$image" \
  -ceu '
    test "$(id -u)" -ne 0
    test -r /study-uploads
    test -w /study-uploads
    probe="$(mktemp /study-uploads/.deploy-write-probe.XXXXXX)"
    trap '\''rm -f -- "$probe"'\'' EXIT
    test -f "$probe"
    tar -C / -czf - study-uploads > /dev/null
  ' \
  || fail "$role Web runtime failed the non-root study upload write probe"

log "Prepared study uploads for the $role Web runtime ($runtime_uid:$runtime_gid)"
