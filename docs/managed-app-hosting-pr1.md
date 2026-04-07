# PR1 - Managed App Hosting Baseline

This PR1 baseline introduces the second product line `app-hosting` without destructive changes.

## Scope
- product/category contract
- provisioning mapping contract (`provider=managed-app`)
- runtime API contract in `apps/api`
- non-destructive env and deployment checklist

## Product Line
- Category slug: `app-hosting`
- Category name (zh-CN): `托管容器云`
- Category name (en-US): `Managed App Hosting`
- Product slugs: `app-starter`, `app-standard`, `app-pro`, `app-team`

## Service Properties
Managed-app runtime writes these keys into `service.properties`:
- `runtime_kind=managed-app`
- `runtime_ref`
- `k8s_cluster_ref`
- `k8s_namespace`
- `k8s_workload`
- `k8s_service`
- `k8s_ingress_url`
- `app_status`
- `app_endpoint`
- `app_last_deploy_at`
- `app_domain`
- `app_tls_status`
- `app_replicas`
- `app_env_vars`
- `app_image_ref`

## Mapping Contract
- Reuse `provisioning_mappings`
- Add `provider=managed-app`
- Match by:
1. `product_id + plan_id`
2. fallback `product_slug + plan_name`

## Runtime API Contract
- `GET /api/v1/services/:id/runtime`
- `GET /api/v1/services/:id/runtime/capabilities`
- `POST /api/v1/services/:id/runtime/actions/:action`
- `GET /api/v1/services/:id/runtime/logs`
- `PATCH /api/v1/services/:id/runtime/env`
- `POST /api/v1/services/:id/runtime/domain`
- `POST /api/v1/services/:id/runtime/tls`
- `POST /api/v1/services/:id/runtime/scale`

VPS compatibility is preserved: existing `/server*` routes remain available.

## Environment Placeholders
API:
- `MANAGED_APP_ENABLED=false`
- `MANAGED_APP_DRIVER=contract`
- `MANAGED_APP_KUBECONFIG_PATH=/var/runtime/kubeconfig/config`
- `MANAGED_APP_NAMESPACE_PREFIX=app`
- `MANAGED_APP_IMAGE_REPOSITORY_PREFIX=sloth-managed-apps`

Paymenter:
- `PROVISIONING_PROVIDERS=convoy,managed-app`
- `MANAGED_APP_INTERNAL_API_URL=http://sloth-cloud-api:4000`
- `MANAGED_APP_INTERNAL_API_TOKEN=<token>`
- `MANAGED_APP_INTERNAL_API_TIMEOUT=30`

## Deployment (Incremental)
1. Deploy changed Paymenter + API (+ Web when needed).
2. Restart queue worker and scheduler.
3. Run bootstrap:
`php artisan app:catalog:bootstrap-managed-app`
4. Run mapping sync:
`php artisan app:provisioning:mappings:sync --provider=managed-app --enqueue-services`

## Rollback
1. Roll back code.
2. Set `MANAGED_APP_ENABLED=false`.
3. Restart containers.
4. Keep existing DB data (no reset, no destructive cleanup).
