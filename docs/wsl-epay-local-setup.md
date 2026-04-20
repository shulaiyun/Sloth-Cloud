# WSL Local Epay Setup (Sloth Cloud)

This guide is only for local WSL testing (`localhost`).

## 1) Callback and return URLs in local WSL

Use:

- `Callback Base URL`: `http://localhost:18080`
- `Frontend Return URL`: `http://localhost:13000/invoices/{number}`

Do not use container-internal hosts such as `http://sloth-cloud-paymenter/...`.

## 2) Apply gateway URL config with private-host allowance

Run inside project root:

```bash
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml exec -T sloth-cloud-paymenter \
  php artisan app:gateway:configure-epay \
  --allow-private \
  --callback-base-url="http://localhost:18080" \
  --frontend-return-url="http://localhost:13000/invoices/{number}"
```

This stores:

- `callback_base_url`
- `frontend_return_url`
- `allow_private_return_urls=1`

## 3) Common payment errors in local

- Signature verification failed:
  - Verify `App ID` and `App Key` in Paymenter gateway match your Epay upstream exactly.
  - Ensure no extra spaces in key fields.
- Paid but invoice stays pending:
  - In local mode, async notify to `localhost` may not be reachable from upstream.
  - Sloth Cloud will use return-page sync and invoice polling to confirm status.

## 4) Production reminder

In production, always use public domains and run without `--allow-private`.
