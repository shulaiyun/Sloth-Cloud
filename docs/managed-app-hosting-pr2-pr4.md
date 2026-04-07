# Managed App Hosting PR2-PR4 Runbook

This runbook captures implementation and operations for VPS + Managed App Hosting dual lines.

## Product Lines
- VPS line: Paymenter + Convoy + PVE/KVM (existing compatibility preserved)
- Managed App line: Paymenter + `apps/api` + Kubernetes (no panel jump)

## Managed App Lifecycle
Source of truth: `apps/api`.

States:
- `pending`
- `queued`
- `building`
- `pushing`
- `deploying`
- `ready`
- `retrying`
- `failed`
- `deleting`

## Catalog
- Category slug: `app-hosting`
- Category zh-CN: `托管容器云`
- Category en-US: `Managed App Hosting`
- Products: `app-starter`, `app-standard`, `app-pro`, `app-team`

Default matrix:
- `app-starter`: `0.5 CPU / 512Mi / 5Gi / 1 replica / 1 domain`
- `app-standard`: `1 CPU / 1Gi / 10Gi / 1 replica / 2 domains`
- `app-pro`: `2 CPU / 2Gi / 20Gi / 2 replicas / 5 domains`
- `app-team`: `4 CPU / 4Gi / 40Gi / 4 replicas / 10 domains`

## Kubernetes Dependencies
- Ingress controller
- cert-manager
- StorageClass
- reachable image registry
- kubeconfig mount for API container when using kubeconfig driver

Recommended defaults:
- `MANAGED_APP_INGRESS_CLASS=nginx`
- `MANAGED_APP_CERT_ISSUER=letsencrypt-prod`
- `MANAGED_APP_STORAGE_CLASS=standard`
- `MANAGED_APP_IMAGE_REGISTRY=registry.sloth-cloud.local`

## Deployment
1. Update env files:
   - `deploy/sloth-cloud/env/api.env`
   - `deploy/sloth-cloud/env/paymenter.env`
2. Build and recreate changed containers:
   - `sloth-cloud-paymenter`
   - `sloth-cloud-api`
   - `sloth-cloud-web` (if frontend changed)
3. Migrate and clear caches:
   - `php artisan migrate --force`
   - `php artisan optimize:clear`
4. Bootstrap catalog:
   - `php artisan app:catalog:bootstrap-managed-app`
5. Sync mappings + enqueue:
   - `php artisan app:provisioning:mappings:sync --provider=convoy --enqueue-services`
   - `php artisan app:provisioning:mappings:sync --provider=managed-app --enqueue-services`
6. Run queue pass:
   - `php artisan app:provisioning:run --limit=100`
   - `php artisan app:provisioning:reconcile-status --limit=100`

Helper script:
- `deploy/sloth-cloud/scripts/wsl-full-redeploy.sh`

## Smoke Checks
Helper script:
- `deploy/sloth-cloud/scripts/wsl-smoke-check.sh`

Checks:
- web responds
- API health responds
- Paymenter responds
- Convoy responds
- VPS service runtime endpoints respond
- Managed-app runtime endpoints respond

## Rollback
1. Roll back code.
2. Set `MANAGED_APP_ENABLED=false`.
3. Restart containers.
4. Keep business data (no destructive cleanup).

## v1 Limits
- public Git repos only
- no private repository token flow
- no external CI callback as primary source
- delete-instance deletes runtime only (does not auto-cancel billing)
