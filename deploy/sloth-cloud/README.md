# Sloth Cloud Same-Host Docker Stack

This stack is designed to run on the same server as an existing Paymenter or Convoy deployment without reusing ports, containers, networks, databases, or storage paths.

## Expected server layout

```text
/opt/sloth-cloud
├─ apps/
├─ Paymenter-master/
├─ deploy/
│  └─ sloth-cloud/
├─ runtime/
│  ├─ env/
│  │  ├─ api.env
│  │  └─ paymenter.env
│  └─ data/
│     ├─ mariadb/
│     ├─ redis/
│     └─ paymenter/
│        └─ storage/
└─ ...
```

## First boot

1. Copy `deploy/sloth-cloud/.env.example` to `deploy/sloth-cloud/.env`.
2. Copy `deploy/sloth-cloud/env/paymenter.env.example` to `runtime/env/paymenter.env`.
3. Copy `deploy/sloth-cloud/env/api.env.example` to `runtime/env/api.env`.
4. Keep `SLOTH_DB_PASSWORD` in `deploy/sloth-cloud/.env` the same as `DB_PASSWORD` in `runtime/env/paymenter.env`.
5. Fill in real domains and passwords. `paymenter.env` can keep `APP_KEY=` empty before first boot.
6. If your host uses a local proxy, keep the proxy values in `deploy/sloth-cloud/.env`. The stack distinguishes between build-time and runtime proxy endpoints.
7. Start the stack:

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml up -d sloth-cloud-proxy-relay
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml up -d --build
```

## Updating an existing server

If `/opt/sloth-cloud` already exists, do not clone again. Update it in place:

```bash
cd /opt/sloth-cloud
git remote -v
git fetch origin
git checkout main
git pull --ff-only origin main
git rev-parse --short HEAD
```

## Local WSL one-command repair

If product pages show raw backend errors, provisioning reports `PROVISIONING_MAPPING_NOT_FOUND`, or Paymenter log permissions are broken, run:

```bash
cd /home/shu/code/vps
bash deploy/sloth-cloud/scripts/wsl-repair-local.sh
```

This script is idempotent and will:

- rebuild/restart local core containers
- repair Paymenter storage/log permissions
- bootstrap managed-app catalog
- bootstrap + sync convoy mappings for all visible VPS products/plans
- enqueue and process provisioning jobs
- run smoke checks

## Proxy-aware builds

`deploy/sloth-cloud/.env` now supports:

```bash
BUILD_HTTP_PROXY=http://127.0.0.1:12334
BUILD_HTTPS_PROXY=http://127.0.0.1:12334
build_http_proxy=http://127.0.0.1:12334
build_https_proxy=http://127.0.0.1:12334
HTTP_PROXY=http://host.docker.internal:12335
HTTPS_PROXY=http://host.docker.internal:12335
http_proxy=http://host.docker.internal:12335
https_proxy=http://host.docker.internal:12335
NO_PROXY=localhost,127.0.0.1,host.docker.internal,sloth-cloud-paymenter,sloth-cloud-api,sloth-cloud-web
no_proxy=localhost,127.0.0.1,host.docker.internal,sloth-cloud-paymenter,sloth-cloud-api,sloth-cloud-web
```

The compose stack forwards these values to:

- Docker build args for `sloth-cloud-paymenter`, `sloth-cloud-api`, `sloth-cloud-web`, using the WSL-local proxy on `127.0.0.1:12334` together with `build.network: host`
- Runtime container environments for the same services, using a relay endpoint on `host.docker.internal:12335`
- `sloth-cloud-proxy-relay`, which forwards container traffic to the WSL-local proxy on `127.0.0.1:12334`
- `host.docker.internal` host-gateway mapping for build and runtime network access

If your target VPS does not run a local proxy on `127.0.0.1:12334`, set all `BUILD_*PROXY`, `HTTP_PROXY`, `HTTPS_PROXY`, `http_proxy`, and `https_proxy` values to empty strings or replace them with the VPS-local proxy address before building.

## First-time Laravel initialization

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan key:generate --force
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan migrate --force
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan passport:keys --force
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan passport:client --personal --name="Sloth Cloud Personal Access Client"
```
