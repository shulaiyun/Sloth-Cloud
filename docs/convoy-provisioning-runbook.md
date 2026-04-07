# Sloth Cloud Provisioning Runbook

## Purpose
This runbook covers both product lines:

1. VPS services enter provisioning queue and resolve to Convoy.
2. Managed-app services enter provisioning queue and resolve to Kubernetes.
3. Mapping is resolved from `DB > fallback file`.
4. Runtime properties are written back to service properties.
5. BFF runtime APIs become available in the Sloth Cloud frontend.
6. Success/failure notifications are logged in Email Log.

## Quick Health Check

```bash
cd /mnt/e/vps
./deploy/sloth-cloud/scripts/wsl-smoke-check.sh
```

This validates:
- both Sloth and Convoy stacks are running
- endpoint reachability (web/api/paymenter/convoy)
- provisioning scheduler activity
- mapping sync + enqueue + run commands
- managed-app runtime API availability when enabled

## Runtime Variables

### `runtime/env/paymenter.env`

```env
PROVISIONING_ENABLED=true
PROVISIONING_MAX_ATTEMPTS=5
PROVISIONING_RETRY_BASE_MS=15000
PROVISIONING_RETRY_MAX_MS=180000
PROVISIONING_LOCK_TTL_MS=120000
PROVISIONING_MAPPING_FILE=/var/runtime/data/provisioning/mappings.json
MANAGED_APP_INTERNAL_API_URL=http://sloth-cloud-api:4000
MANAGED_APP_INTERNAL_API_TOKEN=replace-with-managed-app-internal-token
MANAGED_APP_INTERNAL_API_TIMEOUT=30
```

### `runtime/env/api.env`

```env
CONVOY_ENABLED=true
CONVOY_MODE=live
CONVOY_BASE_URL=http://sloth-convoy-web
CONVOY_APPLICATION_KEY=replace-with-convoy-application-token
CONVOY_TIMEOUT_MS=30000
CONVOY_APPLICATION_PREFIX=/api/application
CONVOY_SERVER_REF_KEYS=convoy_server_uuid,convoy_server_id,convoy_server_short_id,server_uuid
MANAGED_APP_ENABLED=true
MANAGED_APP_DRIVER=kubeconfig
MANAGED_APP_KUBECONFIG_PATH=/var/runtime/kubeconfig/config
MANAGED_APP_DEFAULT_CLUSTER_REF=default
MANAGED_APP_NAMESPACE_PREFIX=app
MANAGED_APP_BUILD_NAMESPACE=managed-app-build
MANAGED_APP_BUILDKIT_IMAGE=moby/buildkit:rootless
MANAGED_APP_GIT_CLONE_IMAGE=alpine/git:2.45.2
MANAGED_APP_IMAGE_REGISTRY=registry.sloth-cloud.local
MANAGED_APP_IMAGE_REPOSITORY_PREFIX=sloth-managed-apps
MANAGED_APP_INGRESS_CLASS=nginx
MANAGED_APP_DEFAULT_DOMAIN_SUFFIX=apps.sloth-cloud.example
MANAGED_APP_CERT_ISSUER=letsencrypt-prod
MANAGED_APP_STORAGE_CLASS=standard
```

## Bootstrap And Fallback Mapping File

Copy and edit:

`deploy/sloth-cloud/provisioning/mappings.example.json` -> `runtime/data/provisioning/mappings.json`

Then sync into database:

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml \
  exec sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=convoy --enqueue-services
```

Dry-run:

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml \
  exec sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=convoy --dry-run
```

Bootstrap all enabled product/plan combos (one-time initialization):

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml \
  exec sloth-cloud-paymenter php artisan app:provisioning:mappings:bootstrap \
  --provider=convoy \
  --node=1 \
  --template=e25d519d-94b1-45c8-a6f6-44c557168f0c \
  --cpu=2 --ram=4096 --disk=40960 --bandwidth=2048 --ipv4=1 --ipv6=0 \
  --sync-file
```

After bootstrap, run a normal sync + enqueue:

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml \
  exec sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=convoy --enqueue-services
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml \
  exec sloth-cloud-paymenter php artisan app:provisioning:run --limit=100
```

Manual enqueue for existing services (when you add new mappings after services already exist):

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml \
  exec sloth-cloud-paymenter php artisan app:provisioning:enqueue-services --provider=convoy
```

## Deploy

```bash
cd /opt/sloth-cloud
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml build --no-cache sloth-cloud-paymenter sloth-cloud-api sloth-cloud-web
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml up -d
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan migrate --force
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan optimize:clear
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan app:catalog:bootstrap-managed-app
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=managed-app --enqueue-services
```

## WSL Local URLs

- Web: `http://localhost:13000`
- BFF API: `http://localhost:14000`
- Paymenter: `http://localhost:18080`
- Convoy: `http://localhost:18181`

If frontend login shows `Failed to fetch`, confirm `http://localhost:14000/api/v1/health` is reachable first.

## Verification

1. `php artisan app:provisioning:run --limit=25` processes queue without fatal errors.
2. `php artisan app:provisioning:enqueue-services --dry-run` shows candidate services.
3. Service detail API returns mapping:
   - `convoy_server_uuid`
   - `convoy_server_id`
   - `convoy_server_short_id`
   - `server_uuid`
4. BFF endpoint `/api/v1/services/{id}/server` returns Convoy data for VPS services.
5. BFF endpoint `/api/v1/services/{id}/runtime` returns managed-app snapshot for app-hosting services.
6. Frontend actions are enabled only when the matching runtime capability exists.
7. Paymenter Email Log contains provisioning success/failure notifications.
8. Managed-app services expose `runtime`, `runtime/capabilities`, and `runtime/logs`.

## Rollback

1. Disable auto-provisioning:

```env
PROVISIONING_ENABLED=false
```

2. Restart Paymenter:

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml up -d sloth-cloud-paymenter
```

3. Revert code to previous commit and rebuild affected containers.

No destructive data rollback is required. `provisioning_jobs` and mappings remain for audit.

## Managed-App Dependencies

Managed-app provisioning expects:

- Kubernetes API access from `sloth-cloud-api`
- `Ingress Controller`
- `cert-manager`
- valid `StorageClass`
- internal container registry credentials if the registry requires auth
- BuildKit image pull access

## Operational Notes

- keep VPS and managed-app provisioning queues separate by `provider`
- use `service.properties.runtime_kind` to decide the runtime branch
- treat delete-instance as runtime deletion only, not billing cancellation
