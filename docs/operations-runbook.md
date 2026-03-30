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

## 4) Configure Nginx Proxy Manager (NPM) for Convoy

Use HTTP upstream only (NPM does TLS, internal convoy web is plain HTTP):

- Domain: `con.jxjvip.help`
- Scheme: `http`
- Forward Hostname/IP: host machine IP (for example `82.22.50.92`)
- Forward Port: `18181`
- Websocket Support: `ON`
- Block Common Exploits: `ON`

If your NPM container cannot reach host public IP, use `172.17.0.1` instead.

## 5) Validate Convoy upstream from host

```bash
curl -I http://127.0.0.1:18181
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml logs --tail=200 sloth-convoy-web
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml logs --tail=200 sloth-convoy-php
```

Expected:

- `curl` returns `HTTP/1.1 200` or `302`.
- `sloth-convoy-web` has no `connect: connection refused` to php-fpm.

If curl fails, check bind setting:

```bash
grep -n "CONVOY_HTTP_BIND" /opt/sloth-cloud/deploy/convoy/.env
```

Must be:

```bash
CONVOY_HTTP_BIND=0.0.0.0:18181
```

Then rebuild convoy services:

```bash
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml up -d --build sloth-convoy-web sloth-convoy-php sloth-convoy-workers
```

If `con.jxjvip.help` still shows `vendor/autoload.php not found`, run once:

```bash
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml exec sloth-convoy-php sh -lc "php -r \"copy('https://getcomposer.org/installer','/tmp/composer-setup.php');\" && php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer && composer install --working-dir=/var/www --no-interaction --prefer-dist --no-dev && rm -f /tmp/composer-setup.php"
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml exec sloth-convoy-php sh -lc "php artisan key:generate --force || true"
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml exec sloth-convoy-php sh -lc "php artisan migrate --force || true"
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml restart sloth-convoy-web sloth-convoy-php sloth-convoy-workers
```

## 6) Epay gateway setup in Paymenter admin

Create/update gateway with:

- `API URL`: `https://yzf.shulaiyun.top`
- `App ID`: your merchant ID
- `App Key`: your merchant key
- `Upstream Channel Type`: `alipay` or `wxpay`
- `Frontend Return URL`: `https://app.jxjvip.help/invoices/{invoice}`
- `Allowed Currencies`: include `CNY`
- `Callback Base URL`: `https://bill.jxjvip.help` (recommended)

## 7) V免签/Epay callback setup (official-style path)

Use Paymenter domain with official callback path style:

- Notify URL: `https://bill.jxjvip.help/example/notify.php`
- Return URL: `https://bill.jxjvip.help/example/return.php`

Important:

- Do not use `https://azj.jxjvip.help/example/*.php` unless that service forwards callback to Paymenter.
- Invoice paid state depends on notify callback hitting Paymenter.
- `/example/*.php` are now real compatibility entrypoints in `public/example/` to avoid nginx `.php` path interception.

## 8) Verify callback traffic in runtime logs

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml logs -f sloth-cloud-paymenter | grep --line-buffered -E "Epay entry notify|Epay entry return|Epay notify|Epay return|Epay pay request"
```

Expected after a test payment:

- `Epay notify received`
- `Epay notify accepted: payment recorded`
- `Epay return redirect`

If notify lines never appear, provider is not calling your Paymenter notify URL.

Quick route check:

```bash
curl -I https://bill.jxjvip.help/example/notify.php
curl -I https://bill.jxjvip.help/example/return.php
```

If Convoy still returns 500, inspect Laravel runtime and build assets directly:

```bash
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml logs --tail=200 sloth-convoy-php
docker compose --env-file deploy/convoy/.env -f deploy/convoy/docker-compose.yml exec sloth-convoy-php sh -lc "ls -lah /var/www/public/build && tail -n 200 /var/www/storage/logs/laravel.log"
```

## 9) Check BFF/frontend if invoice stays pending

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml logs --tail=200 sloth-cloud-api
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml logs --tail=200 sloth-cloud-web
```

Invoice detail page should poll status every 5 seconds after opening gateway payment.

## 10) Service detail shows HTTP 409 for server panel

`HTTP 409` means service has no mapped Convoy server reference yet.
You need one of these keys in Paymenter service properties/config:

- `convoy_server_uuid`
- `convoy_server_id`
- `convoy_server_short_id`
- `server_uuid`

Until mapping exists, start/stop/reinstall actions cannot run.
