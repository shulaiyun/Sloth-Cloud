#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

SL="docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml"

echo "[0/8] Start proxy relay"
$SL up -d sloth-cloud-proxy-relay

echo "[1/8] Build core images"
$SL build --no-cache sloth-cloud-paymenter sloth-cloud-api sloth-cloud-web

echo "[2/8] Recreate containers"
$SL up -d --force-recreate sloth-cloud-paymenter sloth-cloud-api sloth-cloud-web

echo "[3/8] Clear caches / migrate"
$SL exec -T sloth-cloud-paymenter php artisan migrate --force
$SL exec -T sloth-cloud-paymenter php artisan optimize:clear

echo "[4/8] Bootstrap managed-app catalog"
$SL exec -T sloth-cloud-paymenter php artisan app:catalog:bootstrap-managed-app

echo "[5/8] Bootstrap + sync provisioning mappings"
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:mappings:bootstrap --provider=convoy --sync-file
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=convoy --enqueue-services
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=managed-app --enqueue-services

echo "[6/8] Run provisioning queue"
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:run --limit=100
$SL exec -T sloth-cloud-paymenter php artisan app:provisioning:reconcile-status --limit=100

echo "[7/8] Smoke check"
"$ROOT_DIR"/deploy/sloth-cloud/scripts/wsl-smoke-check.sh

echo
echo "Redeploy done."
echo "Web       : http://localhost:13000"
echo "API       : http://localhost:14000/api/v1/health"
echo "Paymenter : http://localhost:18080"
echo "Convoy    : http://localhost:18181"
