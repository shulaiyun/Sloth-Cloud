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
6. Start the stack:

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml up -d --build
```

## First-time Laravel initialization

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan key:generate --force
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan migrate --force
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan passport:keys --force
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan passport:client --personal --name="Sloth Cloud Personal Access Client"
```
