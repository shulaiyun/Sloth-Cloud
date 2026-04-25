# Integration Closeout

Updated on `2026-04-21 09:10 PDT` after integrating Threads A-E in the current `vps` worktree.

## What Was Integrated

- A: workflow state machine and confirmation continuation
- B: workspace artifact ledger and generate -> deploy handoff
- C: runtime support matrix, runtime recipe tightening, fake verified shutdown
- D: UI main workflow, timeline, and truth panel consolidation
- E: failure taxonomy, readiness truth, E2E acceptance, and screenshot regeneration

## Verification Passed

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml up -d --build sloth-cloud-proxy-relay sloth-cloud-api sloth-cloud-web`
- `curl http://127.0.0.1:14000/api/v1/health`
- `curl http://127.0.0.1:14000/api/v1/operator/system/status`
- `node scripts/capture-operator-workbench.mjs`

## Golden Paths That Are Real

- Confirming an active plan now resumes the same workspace task and moves through `queued -> running -> verifying`.
- Same-workspace `generate -> artifact ledger -> deploy_playable` continuation works and reuses the current workspace handoff instead of starting a detached flow.
- Refresh/rehydrate retains workflow stage, failure payload, active task id, and artifact truth.
- Supported preview golden paths are now explicit:
  - `single-file HTML/Canvas`
  - `Vite/React`
  - `Next.js`
  - `Docker Compose` with a reliable recipe

## Paths Intentionally Blocked

- Unsupported stacks are blocked with `unsupported_stack`.
- Docker Compose without a reliable service/port/health recipe is blocked with `compose_recipe_missing`.
- Static-only preview lanes are blocked from publish with `static_preview_only`.
- Failed preview states remain blocked from publish with `preview_failed`.
- Publish stays blocked on readiness failures such as:
  - `ssh_missing_credentials`
  - `ssh_auth_failed`
  - `host_unreachable`
  - `host_key_untrusted`
- Wrong confirmation ids are blocked instead of silently drifting the workflow.

## Fake Verified Paths Closed

- A preview is no longer considered verified just because a `previewUrl` exists.
- Failed previews are no longer left in a verified-looking state.
- Poster-like / placeholder / diagnostic pages are rejected by preview verification.
- Persisted fake verified records are downgraded on reload when full verification evidence is missing.
- Verified preview now depends on complete evidence, not optimistic state:
  - runtime live
  - health passed
  - smoke passed
  - screenshot captured

## Remaining Non-Blocking Notes

- The current integrated worktree is still uncommitted.
- Web build still emits the pre-existing Vite chunk size warning.
- External publish success still depends on real runtime conditions and credentials; those are now exposed as structured truth instead of hidden behind false success.

## Evidence

- Acceptance report: [failure-readiness-e2e-report.md](</Users/shulai/Documents/New project/vps/docs/failure-readiness-e2e-report.md>)
- Screenshot set: [runtime/evidence/visible-agent-workflow](</Users/shulai/Documents/New project/vps/runtime/evidence/visible-agent-workflow>)
