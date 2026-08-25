#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

rollback_dir="${1:-}"
[[ -n "$rollback_dir" ]] || fail "Usage: ops/rollback-host-log-governance.sh <rollback-dir>"
rollback_dir="$(realpath -- "$rollback_dir")"
backup_root="$(realpath -- "$BACKUP_DIR")"
[[ "$(dirname -- "$rollback_dir")" == "$backup_root" ]] \
  || fail "Rollback directory is outside the backup root"
rollback_name="$(basename -- "$rollback_dir")"
[[ "$rollback_name" =~ ^host-log-governance-[0-9]{8}T[0-9]{6}Z$ ]] \
  || fail "Rollback directory is outside the expected backup family"
require_file "$rollback_dir/journald.previous"
require_file "$rollback_dir/agent.previous"

command -v sudo > /dev/null 2>&1 || fail "sudo is required"
sudo -n true > /dev/null 2>&1 || fail "Non-interactive sudo is required"
journal_target="/etc/systemd/journald.conf.d/qzsite.conf"
agent_target="/etc/systemd/system/gitee-go-agent.service.d/qzsite-logging.conf"

IFS= read -r journal_previous < "$rollback_dir/journald.previous"
IFS= read -r agent_previous < "$rollback_dir/agent.previous"
case "$journal_previous" in
  present)
    require_file "$rollback_dir/journald.conf"
    sudo install -m 644 "$rollback_dir/journald.conf" "$journal_target"
    ;;
  absent)
    sudo rm -f -- "$journal_target"
    ;;
  *) fail "Invalid journald rollback marker" ;;
esac
case "$agent_previous" in
  present)
    require_file "$rollback_dir/agent.conf"
    sudo install -m 644 "$rollback_dir/agent.conf" "$agent_target"
    ;;
  absent)
    sudo rm -f -- "$agent_target"
    ;;
  *) fail "Invalid Agent rollback marker" ;;
esac

sudo systemctl daemon-reload
sudo systemctl restart systemd-journald
sudo systemctl restart gitee-go-agent.service
systemctl is-active --quiet gitee-go-agent.service \
  || fail "Gitee Agent did not recover after rollback"
log "Host log governance rollback complete"
