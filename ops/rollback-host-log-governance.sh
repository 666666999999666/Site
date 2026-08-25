#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

rollback_dir="${1:-}"
[[ -n "$rollback_dir" ]] || fail "Usage: ops/rollback-host-log-governance.sh <rollback-dir>"
command -v sudo > /dev/null 2>&1 || fail "sudo is required"
sudo -n true > /dev/null 2>&1 || fail "Non-interactive sudo is required"
if [[ "${QZSITE_OPERATION_LOCK_HELD:-0}" == "1" ]]; then
  [[ -e "/proc/$$/fd/9" \
    && "$(readlink -- "/proc/$$/fd/9")" == "$OPERATION_LOCK_PATH" ]] \
    || fail "Inherited operation lock descriptor is missing"
  flock -n 9 || fail "Inherited operation lock is not held"
else
  prepare_operation_lock
  exec 9>>"$OPERATION_LOCK_PATH"
  flock -w 900 9 || fail "Another deployment or maintenance action is still running"
fi
unset QZSITE_OPERATION_LOCK_HELD
rollback_root="/var/lib/qzsite/host-log-governance"
rollback_name="$(basename -- "$rollback_dir")"
[[ "$rollback_name" =~ ^host-log-governance-[0-9]{8}T[0-9]{6}Z\.[A-Za-z0-9]{6}$ ]] \
  || fail "Rollback directory is outside the expected backup family"
[[ "$rollback_dir" == "$rollback_root/$rollback_name" ]] \
  || fail "Rollback directory must use the root-owned governance path"
rollback_dir="$(sudo realpath -- "$rollback_dir")"
root_real="$(sudo realpath -- "$rollback_root")"
[[ "$(dirname -- "$rollback_dir")" == "$root_real" ]] \
  || fail "Rollback directory resolved outside the governance root"
[[ "$(sudo stat --format='%u:%g:%a' -- "$rollback_dir")" == "0:0:700" ]] \
  || fail "Rollback directory is not root-owned mode 700"

journal_target="/etc/systemd/journald.conf.d/qzsite.conf"
agent_target="/etc/systemd/system/gitee-go-agent.service.d/qzsite-logging.conf"
agent_workdir="/home/ubuntu/gitee_go_agent"
agent_wrapper="/usr/local/sbin/qzsite-gitee-agent"
for current_dropin in "$journal_target" "$agent_target"; do
  sudo test ! -L "$current_dropin" \
    || fail "Current host governance drop-in must not be a symbolic link"
  if sudo test -e "$current_dropin"; then
    sudo test -f "$current_dropin" \
      || fail "Current host governance drop-in must be a regular file"
  fi
done

require_secure_file() {
  local path="$1"
  sudo test -f "$path" && ! sudo test -L "$path" \
    || fail "Required secure rollback file is missing or unsafe: $path"
  [[ "$(sudo stat --format='%u:%g:%a' -- "$path")" == "0:0:600" ]] \
    || fail "Rollback file is not root-owned mode 600: $path"
}

for rollback_file in \
  journald.previous agent.previous \
  agent-workdir.meta agent-wrapper.meta agent-logs.meta; do
  require_secure_file "$rollback_dir/$rollback_file"
done

read_mode_owner() {
  local metadata="$1"
  local target="$2"
  local mode uid gid extra metadata_content
  metadata_content="$(sudo cat -- "$metadata")" \
    || fail "Unable to read ownership metadata: $metadata"
  read -r mode uid gid extra <<< "$metadata_content"
  [[ -z "${extra:-}" && "$mode" =~ ^[0-7]{3,4}$ \
    && "$uid" =~ ^[0-9]+$ && "$gid" =~ ^[0-9]+$ ]] \
    || fail "Invalid ownership metadata: $metadata"
  [[ -e "$target" && ! -L "$target" ]] \
    || fail "Refusing to restore metadata on an unsafe target: $target"
  printf '%s %s %s\n' "$mode" "$uid" "$gid"
}

apply_mode_owner() {
  local metadata="$1"
  local target="$2"
  local mode uid gid apply_failed=0
  read -r mode uid gid <<< "$metadata"
  sudo chown "$uid:$gid" "$target" || apply_failed=1
  sudo chmod "$mode" "$target" || apply_failed=1
  return "$apply_failed"
}

journal_previous="$(sudo cat -- "$rollback_dir/journald.previous")" \
  || fail "Unable to read journald rollback marker"
agent_previous="$(sudo cat -- "$rollback_dir/agent.previous")" \
  || fail "Unable to read Agent rollback marker"
case "$journal_previous" in
  present)
    require_secure_file "$rollback_dir/journald.conf"
    ;;
  absent) ;;
  *) fail "Invalid journald rollback marker" ;;
esac
case "$agent_previous" in
  present)
    require_secure_file "$rollback_dir/agent.conf"
    ;;
  absent) ;;
  *) fail "Invalid Agent rollback marker" ;;
esac

workdir_metadata="$(read_mode_owner "$rollback_dir/agent-workdir.meta" "$agent_workdir")"
wrapper_metadata="$(read_mode_owner "$rollback_dir/agent-wrapper.meta" "$agent_wrapper")"
log_restore_entries=()
agent_logs_metadata="$(sudo cat -- "$rollback_dir/agent-logs.meta")" \
  || fail "Unable to read Gitee Agent log metadata"
while IFS=$'\t' read -r log_name mode uid gid extra; do
  [[ -n "$log_name" ]] || continue
  [[ -z "${extra:-}" \
    && "$log_name" =~ ^agent(-[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+)?\.log$ \
    && "$mode" =~ ^[0-7]{3,4}$ \
    && "$uid" =~ ^[0-9]+$ && "$gid" =~ ^[0-9]+$ ]] \
    || fail "Invalid Gitee Agent log metadata"
  log_path="$agent_workdir/$log_name"
  if [[ ! -e "$log_path" ]]; then
    log "Skipping metadata restore for a rotated Gitee Agent log: $log_name"
    continue
  fi
  [[ -f "$log_path" && ! -L "$log_path" ]] \
    || fail "Gitee Agent log restore target is unsafe"
  log_restore_entries+=("$log_name" "$mode" "$uid" "$gid")
done <<< "$agent_logs_metadata"

rollback_failed=0
set +e
case "$journal_previous" in
  present)
    sudo install -m 644 -o root -g root \
      "$rollback_dir/journald.conf" "$journal_target" \
      || rollback_failed=1
    sudo cmp --silent -- "$rollback_dir/journald.conf" "$journal_target" \
      || rollback_failed=1
    [[ "$(sudo stat --format='%u:%g:%a' -- "$journal_target")" == "0:0:644" ]] \
      || rollback_failed=1
    ;;
  absent)
    sudo rm -f -- "$journal_target" || rollback_failed=1
    sudo test ! -e "$journal_target" && sudo test ! -L "$journal_target" \
      || rollback_failed=1
    ;;
esac
case "$agent_previous" in
  present)
    sudo install -m 644 -o root -g root \
      "$rollback_dir/agent.conf" "$agent_target" \
      || rollback_failed=1
    sudo cmp --silent -- "$rollback_dir/agent.conf" "$agent_target" \
      || rollback_failed=1
    [[ "$(sudo stat --format='%u:%g:%a' -- "$agent_target")" == "0:0:644" ]] \
      || rollback_failed=1
    ;;
  absent)
    sudo rm -f -- "$agent_target" || rollback_failed=1
    sudo test ! -e "$agent_target" && sudo test ! -L "$agent_target" \
      || rollback_failed=1
    ;;
esac

for ((index = 0; index < ${#log_restore_entries[@]}; index += 4)); do
  log_name="${log_restore_entries[index]}"
  mode="${log_restore_entries[index + 1]}"
  uid="${log_restore_entries[index + 2]}"
  gid="${log_restore_entries[index + 3]}"
  log_path="$agent_workdir/$log_name"
  sudo chown "$uid:$gid" "$log_path" || rollback_failed=1
  sudo chmod "$mode" "$log_path" || rollback_failed=1
done
apply_mode_owner "$wrapper_metadata" "$agent_wrapper" || rollback_failed=1
apply_mode_owner "$workdir_metadata" "$agent_workdir" || rollback_failed=1

sudo systemctl daemon-reload || rollback_failed=1
sudo systemctl restart systemd-journald || rollback_failed=1
sudo systemctl restart gitee-go-agent.service || rollback_failed=1
systemctl is-active --quiet gitee-go-agent.service \
  || rollback_failed=1
if ((rollback_failed == 1)); then
  log "CRITICAL: Host log governance rollback was incomplete; snapshot retained at $rollback_dir" >&2
  exit 70
fi
log "Host log governance rollback complete"
