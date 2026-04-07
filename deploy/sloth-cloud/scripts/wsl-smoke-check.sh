#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SL="docker compose --env-file ${ROOT_DIR}/deploy/sloth-cloud/.env -f ${ROOT_DIR}/deploy/sloth-cloud/docker-compose.yml"
API_BASE="${SLOTH_SMOKE_API_BASE:-http://127.0.0.1:14000}"
WEB_BASE="${SLOTH_SMOKE_WEB_BASE:-http://127.0.0.1:13000}"
PAYMENTER_BASE="${SLOTH_SMOKE_PAYMENTER_BASE:-http://127.0.0.1:18080}"
CONVOY_BASE="${SLOTH_SMOKE_CONVOY_BASE:-http://127.0.0.1:18181}"
COOKIE_JAR="${ROOT_DIR}/runtime/data/smoke-cookie.txt"

cleanup() {
  rm -f "$COOKIE_JAR"
}

trap cleanup EXIT

check_url() {
  local url="$1"
  local label="$2"
  if curl -fsS "$url" >/dev/null; then
    echo "$label ok"
  else
    echo "$label failed"
    return 1
  fi
}

echo "[1/7] Containers"
$SL ps
echo

echo "[2/7] Endpoints"
check_url "$WEB_BASE" "web"
check_url "$API_BASE/api/v1/health" "api health"
check_url "$PAYMENTER_BASE" "paymenter"
check_url "$CONVOY_BASE" "convoy"
echo

if [[ -n "${SLOTH_SMOKE_EMAIL:-}" && -n "${SLOTH_SMOKE_PASSWORD:-}" ]]; then
  echo "[3/7] Login and session bootstrap"
  curl -fsS \
    -c "$COOKIE_JAR" \
    -H 'Content-Type: application/json' \
    -d "$(printf '{"email":"%s","password":"%s"}' "$SLOTH_SMOKE_EMAIL" "$SLOTH_SMOKE_PASSWORD")" \
    "$API_BASE/api/v1/auth/login" >/dev/null
  echo "login ok"
else
  echo "[3/7] Login and session bootstrap"
  echo "skipped (set SLOTH_SMOKE_EMAIL and SLOTH_SMOKE_PASSWORD to enable authenticated runtime checks)"
fi
echo

if [[ -f "$COOKIE_JAR" ]]; then
  echo "[4/7] Authenticated account check"
  curl -fsS -b "$COOKIE_JAR" "$API_BASE/api/v1/auth/me" >/dev/null
  echo "auth me ok"
else
  echo "[4/7] Authenticated account check"
  echo "skipped"
fi
echo

if [[ -n "${SLOTH_SMOKE_VPS_SERVICE_ID:-}" && -f "$COOKIE_JAR" ]]; then
  echo "[5/7] VPS runtime checks for service ${SLOTH_SMOKE_VPS_SERVICE_ID}"
  curl -fsS -b "$COOKIE_JAR" "$API_BASE/api/v1/services/${SLOTH_SMOKE_VPS_SERVICE_ID}/runtime" >/dev/null
  curl -fsS -b "$COOKIE_JAR" "$API_BASE/api/v1/services/${SLOTH_SMOKE_VPS_SERVICE_ID}/runtime/capabilities" >/dev/null
  curl -fsS -b "$COOKIE_JAR" "$API_BASE/api/v1/services/${SLOTH_SMOKE_VPS_SERVICE_ID}/runtime/logs?limit=5" >/dev/null
  echo "vps runtime ok"
else
  echo "[5/7] VPS runtime checks"
  echo "skipped (set SLOTH_SMOKE_VPS_SERVICE_ID and login credentials)"
fi
echo

if [[ -n "${SLOTH_SMOKE_APP_SERVICE_ID:-}" && -f "$COOKIE_JAR" ]]; then
  echo "[6/7] Managed-app runtime checks for service ${SLOTH_SMOKE_APP_SERVICE_ID}"
  curl -fsS -b "$COOKIE_JAR" "$API_BASE/api/v1/services/${SLOTH_SMOKE_APP_SERVICE_ID}/runtime" >/dev/null
  curl -fsS -b "$COOKIE_JAR" "$API_BASE/api/v1/services/${SLOTH_SMOKE_APP_SERVICE_ID}/runtime/capabilities" >/dev/null
  curl -fsS -b "$COOKIE_JAR" "$API_BASE/api/v1/services/${SLOTH_SMOKE_APP_SERVICE_ID}/runtime/logs?limit=5" >/dev/null
  echo "managed-app runtime ok"
else
  echo "[6/7] Managed-app runtime checks"
  echo "skipped (set SLOTH_SMOKE_APP_SERVICE_ID and login credentials)"
fi
echo

echo "[7/7] Provisioning commands"
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:run --limit=25
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:reconcile-status --limit=25
echo "Smoke check completed."
