# Security Policy

## Secrets

Never commit:

- `.env` files
- API keys or model provider keys
- Paymenter or Convoy tokens
- SSH private keys or passphrases
- Database dumps
- Cookies, sessions, or customer data
- Runtime workspaces, generated projects, screenshots, logs, or backups

Use `.env.example` files for placeholders only.

## Reporting Issues

If you find a vulnerability, do not open a public issue containing exploit details or secrets. Contact the maintainers privately first.

## Pre-Publish Checklist

Run:

```bash
pnpm run secret:scan
pnpm build
pnpm test
```

Also manually confirm that these paths are absent:

- `runtime/`
- `node_modules/`
- `apps/*/dist`
- `Convoy panel-develop`
- `Paymenter-master`
- real `.env` files
