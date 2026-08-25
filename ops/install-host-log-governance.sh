#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

[[ "$(uname -s)" == "Linux" ]] || fail "Host log governance requires Linux"
command -v sudo > /dev/null 2>&1 || fail "sudo is required"
sudo -n true > /dev/null 2>&1 || fail "Non-interactive sudo is required"
prepare_operation_lock
exec 9>>"$OPERATION_LOCK_PATH"
flock -w 900 9 || fail "Another deployment or maintenance action is still running"
systemctl is-active --quiet gitee-go-agent.service \
  || fail "Gitee Agent must be active before changing its logging"

agent_user="$(systemctl show gitee-go-agent.service --property=User --value)"
agent_group="$(systemctl show gitee-go-agent.service --property=Group --value)"
agent_workdir="$(systemctl show gitee-go-agent.service --property=WorkingDirectory --value)"
[[ -n "$agent_user" ]] || fail "Gitee Agent service user is missing"
[[ -n "$agent_group" ]] || agent_group="$(id -gn "$agent_user")"
agent_uid="$(id -u "$agent_user")"
[[ "$agent_workdir" == "/home/ubuntu/gitee_go_agent" ]] \
  || fail "Refusing to harden an unexpected Gitee Agent working directory"
[[ -d "$agent_workdir" && ! -L "$agent_workdir" ]] \
  || fail "Gitee Agent working directory must be a real directory"
[[ "$(stat --format='%U' -- "$agent_workdir")" == "$agent_user" ]] \
  || fail "Gitee Agent working directory has an unexpected owner"
agent_wrapper="/usr/local/sbin/qzsite-gitee-agent"
[[ -f "$agent_wrapper" && ! -L "$agent_wrapper" ]] \
  || fail "Gitee Agent wrapper must be a real file"
[[ "$(stat --format='%U' -- "$agent_wrapper")" == "root" ]] \
  || fail "Gitee Agent wrapper has an unexpected owner"

journal_target="/etc/systemd/journald.conf.d/qzsite.conf"
agent_target="/etc/systemd/system/gitee-go-agent.service.d/qzsite-logging.conf"
for existing_dropin in "$journal_target" "$agent_target"; do
  sudo test ! -L "$existing_dropin" \
    || fail "Existing host governance drop-in must not be a symbolic link"
  if sudo test -e "$existing_dropin"; then
    sudo test -f "$existing_dropin" \
      || fail "Existing host governance drop-in must be a regular file"
    [[ "$(sudo stat --format='%u:%g:%a' -- "$existing_dropin")" == "0:0:644" ]] \
      || fail "Existing host governance drop-in must be root-owned mode 644"
  fi
done

stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
rollback_root="/var/lib/qzsite/host-log-governance"
sudo install -d -m 700 -o root -g root "/var/lib/qzsite" "$rollback_root"
rollback_dir="$(
  sudo mktemp -d -p "$rollback_root" "host-log-governance-${stamp}.XXXXXX"
)"
sudo chown root:root "$rollback_dir"
sudo chmod 700 "$rollback_dir"

stat --format='%a %u %g' -- "$agent_workdir" \
  | sudo tee "$rollback_dir/agent-workdir.meta" > /dev/null
stat --format='%a %u %g' -- "$agent_wrapper" \
  | sudo tee "$rollback_dir/agent-wrapper.meta" > /dev/null
agent_logs_list="$(mktemp)"
agent_logs_meta="$(mktemp)"
if ! find "$agent_workdir" -maxdepth 1 -type f -name 'agent*.log' -print0 \
  > "$agent_logs_list"; then
  rm -f -- "$agent_logs_list" "$agent_logs_meta"
  fail "Unable to enumerate Gitee Agent logs safely"
fi
agent_logs_error=""
while IFS= read -r -d '' agent_log; do
  agent_log_name="$(basename -- "$agent_log")"
  if [[ ! "$agent_log_name" =~ ^agent(-[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+)?\.log$ ]]; then
    agent_logs_error="Gitee Agent log has an unsupported name"
    break
  fi
  if ! agent_log_metadata="$(stat --format='%a %u %g' -- "$agent_log")"; then
    agent_logs_error="Unable to read Gitee Agent log metadata"
    break
  fi
  read -r agent_log_mode agent_log_uid agent_log_gid agent_log_extra \
    <<< "$agent_log_metadata"
  if [[ -n "${agent_log_extra:-}" \
    || ! "$agent_log_mode" =~ ^[0-7]{3,4}$ \
    || ! "$agent_log_uid" =~ ^[0-9]+$ \
    || ! "$agent_log_gid" =~ ^[0-9]+$ ]]; then
    agent_logs_error="Gitee Agent log metadata is malformed"
    break
  fi
  if [[ "$agent_log_uid" != "$agent_uid" ]]; then
    agent_logs_error="Gitee Agent log has an unexpected owner"
    break
  fi
  printf '%s\t%s\t%s\t%s\n' \
    "$agent_log_name" \
    "$agent_log_mode" \
    "$agent_log_uid" \
    "$agent_log_gid" \
    >> "$agent_logs_meta"
done < "$agent_logs_list"
rm -f -- "$agent_logs_list"
if [[ -n "$agent_logs_error" ]]; then
  rm -f -- "$agent_logs_meta"
  fail "$agent_logs_error"
fi
sudo install -m 600 -o root -g root \
  "$agent_logs_meta" "$rollback_dir/agent-logs.meta"
rm -f -- "$agent_logs_meta"

if sudo test -f "$journal_target"; then
  sudo cp --preserve=mode,ownership,timestamps "$journal_target" "$rollback_dir/journald.conf"
  printf 'present\n' | sudo tee "$rollback_dir/journald.previous" > /dev/null
else
  printf 'absent\n' | sudo tee "$rollback_dir/journald.previous" > /dev/null
fi
if sudo test -f "$agent_target"; then
  sudo cp --preserve=mode,ownership,timestamps "$agent_target" "$rollback_dir/agent.conf"
  printf 'present\n' | sudo tee "$rollback_dir/agent.previous" > /dev/null
else
  printf 'absent\n' | sudo tee "$rollback_dir/agent.previous" > /dev/null
fi
sudo chown -R root:root "$rollback_dir"
sudo find "$rollback_dir" -type f -exec chmod 600 -- {} +

journal_tmp="$(mktemp)"
agent_tmp="$(mktemp)"
governance_started=0
finish() {
  local exit_code=$?
  trap - EXIT
  set +e
  rm -f -- "$journal_tmp" "$agent_tmp" \
    || log "WARNING: Could not remove temporary governance configuration"
  if ((exit_code != 0 && governance_started == 1)); then
    log "Host log governance failed; restoring the captured configuration"
    if ! QZSITE_OPERATION_LOCK_HELD=1 \
      bash "$APP_DIR/ops/rollback-host-log-governance.sh" "$rollback_dir"; then
      log "CRITICAL: Host log governance rollback failed; snapshot retained at $rollback_dir" >&2
      exit 70
    fi
  fi
  exit "$exit_code"
}
trap finish EXIT
printf '%s\n' \
  '[Journal]' \
  'SystemMaxUse=512M' \
  'SystemKeepFree=5G' \
  'MaxRetentionSec=7day' \
  'SystemMaxFileSize=64M' > "$journal_tmp"
printf '%s\n' \
  '[Service]' \
  'StandardOutput=null' \
  'StandardError=journal' \
  'UMask=0077' > "$agent_tmp"

sudo install -d -m 755 /etc/systemd/journald.conf.d /etc/systemd/system/gitee-go-agent.service.d
governance_started=1
sudo install -m 644 "$journal_tmp" "$journal_target"
sudo install -m 644 "$agent_tmp" "$agent_target"
sudo systemctl daemon-reload
sudo systemctl restart systemd-journald
sudo journalctl --vacuum-time=7d --vacuum-size=512M
sudo systemctl restart gitee-go-agent.service
systemctl is-active --quiet gitee-go-agent.service \
  || fail "Gitee Agent did not recover after logging change"

sudo chmod 700 "$agent_workdir"
sudo find "$agent_workdir" -maxdepth 1 -type f -name 'agent*.log' \
  -exec chmod 600 -- {} +
sudo chown "root:$agent_group" "$agent_wrapper"
sudo chmod 750 "$agent_wrapper"
sudo systemctl restart gitee-go-agent.service
systemctl is-active --quiet gitee-go-agent.service \
  || fail "Gitee Agent did not recover after credential hardening"

governance_started=0
log "Host log governance installed; test one real pipeline before accepting it"
printf 'ROLLBACK_DIR=%s\n' "$rollback_dir"
