#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

# Prevent inherited WSL shell proxies from overriding deploy/sloth-cloud/.env
# during docker compose variable interpolation.
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy NO_PROXY no_proxy
unset BUILD_HTTP_PROXY BUILD_HTTPS_PROXY build_http_proxy build_https_proxy BUILD_NO_PROXY build_no_proxy

# Load compose env values for URL bootstrap commands.
if [[ -f "$ROOT_DIR/deploy/sloth-cloud/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/deploy/sloth-cloud/.env"
fi

SL="docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml"

echo "[0/10] Start proxy relay"
$SL up -d sloth-cloud-proxy-relay

echo "[1/10] Build core images"
$SL build --no-cache sloth-cloud-paymenter sloth-cloud-api sloth-cloud-web

echo "[2/10] Recreate containers"
$SL up -d --force-recreate sloth-cloud-paymenter sloth-cloud-api sloth-cloud-web

echo "[3/10] Repair Paymenter storage permissions"
$SL exec -T --user root sloth-cloud-paymenter sh -lc '
  mkdir -p /var/www/html/storage/logs /var/www/html/storage/framework/cache/data /var/www/html/storage/framework/sessions /var/www/html/storage/framework/views /var/www/html/bootstrap/cache &&
  touch /var/www/html/storage/logs/laravel-$(date +%F).log &&
  chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache &&
  chmod -R ug+rwX /var/www/html/storage /var/www/html/bootstrap/cache
'

echo "[4/10] Clear caches / migrate"
$SL exec -T sloth-cloud-paymenter php artisan migrate --force
$SL exec -T sloth-cloud-paymenter php artisan optimize:clear

echo "[5/10] Configure Epay callback/return URLs (safe defaults)"
PAYMENTER_PUBLIC_URL="${SLOTH_PAYMENTER_PUBLIC_URL:-http://localhost:${SLOTH_PAYMENTER_PORT:-18080}}"
WEB_PUBLIC_URL="${SLOTH_WEB_PUBLIC_URL:-http://localhost:${SLOTH_WEB_PORT:-13000}}"
if [[ "$PAYMENTER_PUBLIC_URL" == *".example"* || "$WEB_PUBLIC_URL" == *".example"* ]]; then
  PAYMENTER_PUBLIC_URL="http://localhost:${SLOTH_PAYMENTER_PORT:-18080}"
  WEB_PUBLIC_URL="http://localhost:${SLOTH_WEB_PORT:-13000}"
fi

if [[ "$PAYMENTER_PUBLIC_URL" == http://localhost* || "$PAYMENTER_PUBLIC_URL" == https://localhost* || "$WEB_PUBLIC_URL" == http://localhost* || "$WEB_PUBLIC_URL" == https://localhost* ]]; then
  $SL exec -T sloth-cloud-paymenter php artisan app:gateway:configure-epay \
    --allow-private \
    --callback-base-url="$PAYMENTER_PUBLIC_URL" \
    --frontend-return-url="${WEB_PUBLIC_URL%/}/invoices/{number}" || true
else
  $SL exec -T sloth-cloud-paymenter php artisan app:gateway:configure-epay \
    --callback-base-url="$PAYMENTER_PUBLIC_URL" \
    --frontend-return-url="${WEB_PUBLIC_URL%/}/invoices/{number}" || true
fi

echo "[6/10] Bootstrap managed-app catalog"
$SL exec -T sloth-cloud-paymenter php artisan app:catalog:bootstrap-managed-app

echo "[7/10] Bootstrap regional VPS catalog"
$SL exec -T sloth-cloud-paymenter php artisan app:catalog:bootstrap-vps-regional

echo "[8/10] Bootstrap + sync provisioning mappings"
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:mappings:bootstrap --provider=convoy --sync-file
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=convoy --enqueue-services
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=managed-app --enqueue-services

echo "[9/10] Run provisioning queue"
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:run --limit=100
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:reconcile-status --limit=100

echo "[10/10] Smoke check"
"$ROOT_DIR"/deploy/sloth-cloud/scripts/wsl-smoke-check.sh

echo
echo "Redeploy done."
echo "Web       : http://localhost:13000"
echo "API       : http://localhost:14000/api/v1/health"
echo "Paymenter : http://localhost:18080"
echo "Convoy    : http://localhost:18181"
