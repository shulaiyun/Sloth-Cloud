# Managed App Hosting Quickstart

This guide is for operators who want to bring up the Sloth Cloud managed app line in a real deployment.

It focuses on:
- Registry wiring
- image naming rules
- required environment variables
- Kubernetes prerequisites
- how to verify the runtime end to end

## 1. What this feature needs

Managed App Hosting uses these external pieces:
- a reachable Kubernetes cluster
- an ingress controller
- cert-manager
- a valid `StorageClass`
- a container registry that the cluster can pull from
- a kubeconfig file mounted into the API container when using the `kubeconfig` driver

The API is the runtime orchestrator. Frontend traffic does not talk to Kubernetes directly.

## 2. Image naming rule

The runtime builds image references in this shape:

`<registry>/<repository-prefix>/service-<serviceId>:<branch>-<timestamp>`

Example:

`registry.example.com/sloth-managed-apps/service-18:main-20260409T060000Z`

Important:
- `MANAGED_APP_IMAGE_REGISTRY` must be the registry host only, without `https://`
- `MANAGED_APP_IMAGE_REPOSITORY_PREFIX` is the project or namespace inside that registry
- the code appends `service-<serviceId>` and a tag automatically

If your registry requires auth, the same credentials are used for:
- BuildKit push access
- runtime imagePullSecret creation

The image pull secret name is `managed-app-registry`.

## 3. Required environment variables

### `deploy/sloth-cloud/env/api.env`

Set these at minimum:

```env
MANAGED_APP_ENABLED=true
MANAGED_APP_DRIVER=kubeconfig
MANAGED_APP_KUBECONFIG_PATH=/var/runtime/kubeconfig/config
MANAGED_APP_DEFAULT_CLUSTER_REF=default
MANAGED_APP_NAMESPACE_PREFIX=app
MANAGED_APP_BUILD_NAMESPACE=managed-app-build
MANAGED_APP_BUILDKIT_IMAGE=moby/buildkit:rootless
MANAGED_APP_BUILDKIT_SNAPSHOTTER=native
MANAGED_APP_BUILDKIT_ROOT_PATH=/var/lib/buildkit
MANAGED_APP_GIT_CLONE_IMAGE=alpine/git:2.45.2
MANAGED_APP_BUILD_CPU_REQUEST=250m
MANAGED_APP_BUILD_MEMORY_REQUEST=512Mi
MANAGED_APP_IMAGE_REGISTRY=registry.example.com
MANAGED_APP_IMAGE_REPOSITORY_PREFIX=sloth-managed-apps
MANAGED_APP_REGISTRY_AUTH_JSON=
MANAGED_APP_INGRESS_CLASS=
MANAGED_APP_DEFAULT_DOMAIN_SUFFIX=apps.example.com
MANAGED_APP_CERT_ISSUER=letsencrypt-prod
MANAGED_APP_STORAGE_CLASS=standard
```

### `deploy/sloth-cloud/env/paymenter.env`

Set these at minimum:

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

## 4. How to generate `MANAGED_APP_REGISTRY_AUTH_JSON`

Use the helper script:

```bash
./deploy/sloth-cloud/scripts/managed-app-registry-auth-json.sh \
  registry.example.com \
  sloth-bot \
  'replace-with-password' \
  'ops@example.com'
```

It prints a JSON payload suitable for `MANAGED_APP_REGISTRY_AUTH_JSON`.

You can then paste the output into `deploy/sloth-cloud/env/api.env`:

```env
MANAGED_APP_REGISTRY_AUTH_JSON={"auths":{"registry.example.com":{"username":"sloth-bot","password":"replace-with-password","email":"ops@example.com","auth":"..."}}}
```

If your registry is private, the host in the JSON must match `MANAGED_APP_IMAGE_REGISTRY` exactly.

## 5. Kubernetes prerequisites

### Kubeconfig

When `MANAGED_APP_DRIVER=kubeconfig`, the API container expects the kubeconfig file at:

`/var/runtime/kubeconfig/config`

Make sure:
- the file exists inside the API container
- the path is readable by the container user
- the context has permission to create and update namespaces, workloads, services, ingresses, PVCs, secrets, configmaps, resource quotas, limit ranges, and network policies

### Ingress

If your cluster has a default IngressClass, leave `MANAGED_APP_INGRESS_CLASS` empty.
Only set it when you intentionally want a specific class.

Examples:
- empty string (use cluster default, recommended)
- `traefik`
- `nginx`
- `cilium`

The value must match an IngressClass that exists in the cluster.
If it does not exist, ingress resources may be created but never routed.

### Auto domain policy

Managed App v1 now auto-assigns an initial domain during provisioning:

`app-{serviceId}.{MANAGED_APP_DEFAULT_DOMAIN_SUFFIX}`

Example:
- service `44` + suffix `shulaiyun.top` -> `app-44.shulaiyun.top`

Checkout no longer requires users to type an initial domain.
Make sure DNS is ready for this pattern, typically by adding a wildcard record:
- `*.shulaiyun.top` -> your ingress entrypoint / cloudflared tunnel target

### cert-manager

Set `MANAGED_APP_CERT_ISSUER` to the issuer that exists in the cluster.

Typical values:
- `letsencrypt-prod`
- `letsencrypt-staging`

If you use a `ClusterIssuer`, the name must be reachable from the target namespace.

### StorageClass

Set `MANAGED_APP_STORAGE_CLASS` to a real `StorageClass` name in the cluster.

Example:
- `standard`
- `fast-ssd`
- `rook-ceph-block`

If this name is wrong, PVCs will stay pending and app creation will not finish.

## 6. Deployment order

1. Fill `deploy/sloth-cloud/env/api.env` and `deploy/sloth-cloud/env/paymenter.env`.
2. Generate and set `MANAGED_APP_REGISTRY_AUTH_JSON` if your registry is private.
3. Restart the API and Paymenter containers.
4. Run the Paymenter bootstrap command for the managed app catalog.
5. Run provisioning mapping sync for both providers.
6. Process the provisioning queue.

Example commands:

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml up -d --build sloth-cloud-paymenter sloth-cloud-api
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan app:catalog:bootstrap-managed-app
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan app:provisioning:mappings:sync --provider=managed-app --enqueue-services
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan app:provisioning:run --limit=100
```

## 7. Common symptoms and what they usually mean

- `ImagePullBackOff` or `ErrImagePull`
  - registry host mismatch
  - bad registry auth JSON
  - missing repository/project in the registry
- build job fails on push
  - registry is not reachable from the cluster
  - the build namespace cannot access the secret
- app gets stuck before ready
  - ingress class mismatch
  - cert-manager issuer mismatch
  - PVC waiting because `StorageClass` is wrong
- no email after provisioning
  - notification templates are not bootstrapped
  - queue worker is not running

## 8. Verification checklist

- `GET /api/v1/services/:id/runtime` returns a managed-app snapshot
- `GET /api/v1/services/:id/runtime/capabilities` shows runtime actions
- the service has `runtime_kind=managed-app`
- a registry secret named `managed-app-registry` exists when auth JSON is configured
- the app gets a real endpoint and ingress URL after deployment
