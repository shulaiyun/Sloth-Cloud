# Maintainer Guide

This guide is for people with write access to the public Sloth Cloud repository.

## Before Merging

Run or verify:

```bash
pnpm build
pnpm test
pnpm run secret:scan
```

Also check that the PR does not add:

- `.env` files
- `runtime/`
- `node_modules/`
- `apps/*/dist`
- `Paymenter-master`
- `Convoy panel-develop`
- real provider keys, cookies, SSH keys, database dumps, logs, screenshots, or backups

## Review Hot Spots

Review especially carefully when a PR touches:

- Authentication and session handling
- Billing, invoices, orders, or Paymenter integration
- VPS control, console, reinstall, or Convoy integration
- Remote execution and deployment flows
- Assistant provider routing or model execution
- Preview verification, publishing, and health evidence
- Dockerfiles and CI workflows

## Release Flow

1. Merge small, reviewed PRs into `main`.
2. Confirm CI is green.
3. Tag releases only from clean `main`.
4. Keep production secrets in the private deployment repository or secret manager.
5. Publish release notes that separate public source changes from private deployment changes.

## Handling Boundary Problems

If a contributor opens a PR with vendored upstream panel source or secrets:

1. Do not merge.
2. Ask them to remove the files from the branch history if secrets are involved.
3. Rotate any exposed credentials.
4. Point them to `docs/open-source-boundary.md` and `CONTRIBUTING.md`.

