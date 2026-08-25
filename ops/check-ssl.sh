#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

cert_dir="$APP_DIR/nginx/certs"
require_exact_directory "$cert_dir" "$APP_DIR/nginx/certs" "TLS certificate"
certificate="$cert_dir/server_bundle.crt"
require_regular_or_absent "$certificate" "TLS certificate"
require_file "$certificate"
certificate_openssl=(openssl)
if [[ ! -r "$certificate" ]]; then
  command -v sudo > /dev/null 2>&1 \
    || fail "TLS certificate is not readable and sudo is unavailable"
  sudo -n true > /dev/null 2>&1 \
    || fail "TLS certificate is not readable without non-interactive sudo"
  certificate_openssl=(sudo -n openssl)
fi

"${certificate_openssl[@]}" x509 -in "$certificate" -noout -checkend 2592000 \
  || fail "TLS certificate expires within 30 days"
"${certificate_openssl[@]}" x509 -in "$certificate" -noout -checkhost liaoqizai.site \
  > /dev/null || fail "TLS certificate does not cover liaoqizai.site"
"${certificate_openssl[@]}" x509 -in "$certificate" -noout -checkhost www.liaoqizai.site \
  > /dev/null || fail "TLS certificate does not cover www.liaoqizai.site"
expiry="$("${certificate_openssl[@]}" x509 -in "$certificate" -noout -enddate)"
command -v timeout > /dev/null 2>&1 || fail "timeout is required for live TLS verification"
disk_certificate_fingerprint="$(
  "${certificate_openssl[@]}" x509 -in "$certificate" -outform DER 2>/dev/null \
    | sha256sum \
    | cut -d' ' -f1
)"
live_certificate_fingerprint="$(
  timeout 10 openssl s_client \
    -connect 127.0.0.1:443 -servername liaoqizai.site < /dev/null 2>/dev/null \
    | openssl x509 -outform DER 2>/dev/null \
    | sha256sum \
    | cut -d' ' -f1
)"
[[ -n "$disk_certificate_fingerprint" \
  && "$disk_certificate_fingerprint" == "$live_certificate_fingerprint" ]] \
  || fail "Live TLS certificate does not match the installed certificate"

curl --fail --silent --show-error --retry 3 \
  --resolve liaoqizai.site:443:127.0.0.1 \
  https://liaoqizai.site/api/health > /dev/null

log "TLS certificate and HTTPS health check passed: $expiry"
