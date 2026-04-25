# Governance

Sloth Cloud uses a maintainer-led governance model.

## Maintainer Responsibilities

Maintainers are responsible for:

- Protecting the open-source boundary.
- Reviewing code, docs, and dependency changes.
- Keeping secrets and production data out of the public repository.
- Deciding what belongs in the public repo versus a private deployment repo.
- Managing releases, security reports, and roadmap direction.

## Decision Rules

Changes are more likely to be accepted when they:

- Improve the self-authored Sloth Cloud UI, API/BFF, operator workflow, adapters, docs, or tests.
- Preserve replaceable upstream integrations.
- Make failure states more honest and recoverable.
- Add tests or reduce operational risk.

Changes are likely to be declined when they:

- Vendor Paymenter, Convoy, OpenClaw, CLI proxy services, or other upstream source trees.
- Add real credentials, private deployment state, or production data.
- Turn mock/demo flows into user-visible production behavior.
- Make Sloth Cloud depend on a single private infrastructure setup.

## Maintainer Workflow

- Use draft PRs for large boundary, architecture, or licensing changes.
- Require passing CI before merge.
- Require security review for auth, billing, provisioning, remote execution, and assistant-provider changes.
- Prefer small PRs with clear rollback paths.

## Public and Private Repositories

Recommended repository split:

- `Sloth-Cloud`: public source, adapters, examples, tests, and docs.
- `sloth-cloud-deploy-private`: private deployment state, production env files, host inventory, real keys, and operational runbooks.

The private repository should never be merged into the public repository.

