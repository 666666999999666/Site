#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

[[ "$(uname -s)" == "Linux" ]] || fail "Host log governance requires Linux"
command -v sudo > /dev/null 2>&1 || fail "sudo is required"
sudo -n true > /dev/null 2>&1 || fail "Non-interactive sudo is required"
systemctl is-active --quiet gitee-go-agent.service \
  || fail "Gitee Agent must be active before changing its logging"

stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
rollback_dir="$BACKUP_DIR/host-log-governance-$stamp"
mkdir -p "$rollback_dir"
chmod 700 "$rollback_dir"

journal_target="/etc/systemd/journald.conf.d/qzsite.conf"
agent_target="/etc/systemd/system/gitee-go-agent.service.d/qzsite-logging.conf"
if sudo test -f "$journal_target"; then
  sudo cp --preserve=mode,ownership,timestamps "$journal_target" "$rollback_dir/journald.conf"
  sudo chown "$(id -u):$(id -g)" "$rollback_dir/journald.conf"
  printf 'present\n' > "$rollback_dir/journald.previous"
else
  printf 'absent\n' > "$rollback_dir/journald.previous"
fi
if sudo test -f "$agent_target"; then
  sudo cp --preserve=mode,ownership,timestamps "$agent_target" "$rollback_dir/agent.conf"
  sudo chown "$(id -u):$(id -g)" "$rollback_dir/agent.conf"
  printf 'present\n' > "$rollback_dir/agent.previous"
else
  printf 'absent\n' > "$rollback_dir/agent.previous"
fi

journal_tmp="$(mktemp)"
agent_tmp="$(mktemp)"
governance_started=0
finish() {
  local exit_code=$?
  trap - EXIT
  rm -f -- "$journal_tmp" "$agent_tmp"
  if ((exit_code != 0 && governance_started == 1)); then
    log "Host log governance failed; restoring the captured configuration"
    bash "$APP_DIR/ops/rollback-host-log-governance.sh" "$rollback_dir" || true
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
  'StandardError=journal' > "$agent_tmp"

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

chmod 600 "$rollback_dir/journald.previous" "$rollback_dir/agent.previous"
[[ ! -f "$rollback_dir/journald.conf" ]] || chmod 600 "$rollback_dir/journald.conf"
[[ ! -f "$rollback_dir/agent.conf" ]] || chmod 600 "$rollback_dir/agent.conf"
governance_started=0
log "Host log governance installed; test one real pipeline before accepting it"
printf 'ROLLBACK_DIR=%s\n' "$rollback_dir"
