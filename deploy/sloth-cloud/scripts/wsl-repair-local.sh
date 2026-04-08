#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

SL="docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml"

echo "[1/7] Ensure core services are up"
$SL up -d sloth-cloud-proxy-relay sloth-cloud-db sloth-cloud-redis
$SL up -d --build sloth-cloud-paymenter sloth-cloud-api sloth-cloud-web

echo "[2/7] Repair Paymenter storage permissions"
$SL exec -T --user root sloth-cloud-paymenter sh -lc '
  mkdir -p /var/www/html/storage/logs /var/www/html/storage/framework/cache/data /var/www/html/storage/framework/sessions /var/www/html/storage/framework/views /var/www/html/bootstrap/cache &&
  touch /var/www/html/storage/logs/laravel-$(date +%F).log &&
  chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache &&
  chmod -R ug+rwX /var/www/html/storage /var/www/html/bootstrap/cache
'

echo "[3/7] Migrate and clear caches"
$SL exec -T sloth-cloud-paymenter php artisan migrate --force
$SL exec -T sloth-cloud-paymenter php artisan optimize:clear

echo "[4/7] Bootstrap managed app catalog"
$SL exec -T sloth-cloud-paymenter php artisan app:catalog:bootstrap-managed-app

echo "[5/7] Bootstrap + sync provisioning mappings"
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:mappings:bootstrap --provider=convoy --sync-file
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=convoy --enqueue-services
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=managed-app --enqueue-services

echo "[6/7] Process provisioning queue and reconcile state"
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:run --provider=convoy --limit=100
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:run --provider=managed-app --limit=100
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:reconcile-status --provider=convoy --limit=100
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:reconcile-status --provider=managed-app --limit=100

echo "[7/7] Basic smoke checks"
"$ROOT_DIR"/deploy/sloth-cloud/scripts/wsl-smoke-check.sh

echo
echo "Local repair finished."
echo "Web       : http://localhost:13000"
echo "API       : http://localhost:14000/api/v1/health"
echo "Paymenter : http://localhost:18080"
