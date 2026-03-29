# Sloth Cloud Operations Runbook (Epay + Convoy)

This runbook is the exact command flow for fixing two common production issues:

1. Epay payment success page keeps spinning and invoice stays pending.
2. `con.jxjvip.help` returns `502 Bad Gateway`.

## 1) Pull and rebuild latest code

```bash
cd /opt/sloth-cloud
git fetch origin
git checkout main
git pull --rebase origin main
git log -5 --oneline
```

## 2) Rebuild and restart Sloth Cloud stack

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml build --no-cache sloth-cloud-paymenter sloth-cloud-api sloth-cloud-web
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml up -d
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec sloth-cloud-paymenter php artisan optimize:clear
```

## 3) Rebuild and restart Convoy stack

```bash
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml build --no-cache sloth-convoy-web sloth-convoy-php sloth-convoy-workers
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml up -d
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml ps
```

## 4) Configure Nginx Proxy Manager (NPM) correctly

Use **HTTP** upstream only (NPM does TLS, internal container does not):

- Domain: `con.jxjvip.help`
- Scheme: `http`
- Forward Hostname/IP: `127.0.0.1`
- Forward Port: `18181`
- Websocket Support: `ON`
- Block Common Exploits: `ON`

If NPM is in another docker network, use host IP instead of `127.0.0.1`.

## 5) Validate Convoy upstream from host

```bash
curl -I http://127.0.0.1:18181
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml logs --tail=120 sloth-convoy-web sloth-convoy-php
```

Expected:

- `curl` returns `HTTP/1.1 200` or `302`.
- `sloth-convoy-web` has no `connect: connection refused` to php-fpm.

## 6) Epay gateway setup in Paymenter admin

Create/update gateway with:

- `API URL`: `https://yzf.shulaiyun.top`
- `App ID`: your merchant ID
- `App Key`: your merchant key
- `Upstream Channel Type`: `alipay` or `wxpay` (as needed)
- `Frontend Return URL`: `https://app.jxjvip.help/invoices/{invoice}`
- `Allowed Currencies`: include `CNY` (and `USD` only if upstream supports it)

## 7) V免签/Epay merchant callback setup (must be reachable from internet)

- Notify URL: `https://bill.jxjvip.help/extensions/gateways/epay/notify`
- Return URL: `https://bill.jxjvip.help/extensions/gateways/epay/return`

If your V免签 backend only supports a fixed global callback URL, use the two URLs above.
This repo now supports resolving the invoice from callback payload fields, so the return URL no longer has to contain `{invoice}`.

The notify URL is still the most important one. Invoice paid state depends on notify.

## 8) Verify callback traffic in runtime logs

Paymenter in this stack logs to container stdout/stderr, not necessarily `storage/logs/laravel.log`.

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml logs -f sloth-cloud-paymenter | grep -E "Epay notify|Epay return"
```

Expected after a test payment:

- `Epay notify received`
- `Epay notify accepted: payment recorded`
- `Epay return redirect`

If notify lines never appear, the payment provider is not calling your notify URL.
Before this patch, Epay logs only went to Laravel daily files; now they are also mirrored to container stderr so `docker compose logs` can see them after rebuild.

## 9) Check BFF and frontend if invoice stays pending

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml logs --tail=200 sloth-cloud-api
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml logs --tail=200 sloth-cloud-web
```

Invoice detail page should poll status every 5 seconds after opening gateway payment.

## 10) Convoy control in service detail shows HTTP 409

`HTTP 409` means service has no mapped Convoy server reference yet.
You need one of these keys in Paymenter service properties/config:

- `convoy_server_uuid`
- `convoy_server_id`
- `convoy_server_short_id`
- `server_uuid`

Until mapping exists, start/stop/reinstall actions cannot run.
