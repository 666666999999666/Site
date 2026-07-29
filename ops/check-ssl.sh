#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"

certificate="$APP_DIR/nginx/certs/server_bundle.crt"
require_file "$certificate"

openssl x509 -in "$certificate" -noout -checkend 2592000 \
  || fail "TLS certificate expires within 30 days"
expiry="$(openssl x509 -in "$certificate" -noout -enddate)"

curl --fail --silent --show-error --retry 3 \
  --resolve liaoqizai.site:443:127.0.0.1 \
  https://liaoqizai.site/api/health > /dev/null

log "TLS certificate and HTTPS health check passed: $expiry"
