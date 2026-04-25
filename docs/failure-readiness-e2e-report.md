# Failure / Readiness / E2E Report

Generated on `2026-04-21 09:10:26 PDT` after integrating Threads A-E.

## Worktree Context

- Repo: `/Users/shulai/Documents/New project/vps`
- HEAD: `b4a92ae594c1dfcff8d1bd8737bfd6a30c381f81`
- Note: the worktree was already dirty across multiple files and parallel threads before final reporting. `git status --short` was captured as-is and reflects the integrated worktree rather than a fresh commit boundary.

## Commands Run

```bash
pnpm build
docker compose -f deploy/sloth-cloud/docker-compose.yml up -d --build sloth-cloud-api
docker compose --env-file deploy/sloth-cloud/.env -f deploy/sloth-cloud/docker-compose.yml up -d --build sloth-cloud-proxy-relay sloth-cloud-api sloth-cloud-web
docker exec sloth-cloud-api sh -lc "which chromium-browser || which chromium || ls -1 /usr/lib/chromium"
docker exec sloth-cloud-api sh -lc "cd /app/apps/api/dist && node -e \"import('playwright').then(async ({ chromium }) => { const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium-browser' }); await browser.close(); console.log('chromium-ok'); }).catch((error) => { console.error(error.stack || error.message); process.exit(1); })\""
curl -sS http://127.0.0.1:14000/api/v1/health
curl -sS http://127.0.0.1:14000/api/v1/operator/system/status
pnpm exec vitest run apps/api/src/lib/operator-visible-workflow.test.ts
pnpm test
pnpm typecheck
node scripts/capture-operator-workbench.mjs
```

## Result Summary

- `pnpm build`: passed
- `pnpm test`: passed, `50` tests
- `pnpm exec vitest run apps/api/src/lib/operator-visible-workflow.test.ts`: passed, `31` tests
- `pnpm typecheck`: passed
- `curl /api/v1/health`: passed, API returned `{"ok":true,...}`
- `curl /api/v1/operator/system/status`: passed, operator integration reported Cloudflare/operator runtime ready
- `node scripts/capture-operator-workbench.mjs`: passed, produced `9` screenshots under `runtime/evidence/visible-agent-workflow/`
- Runtime note: API preview verification now uses system Chromium at `/usr/bin/chromium-browser` inside the container instead of relying on Playwright-managed browser downloads.

## Acceptance Matrix

| Acceptance item | Status | Evidence |
| --- | --- | --- |
| confirm dead-end fixed | PASS | `apps/api/src/lib/operator-visible-workflow.test.ts` covers `uses the active pending confirmation id and blocks mismatches` and `continues the active pending task from awaiting_confirmation into queued/running`; screenshot `runtime/evidence/visible-agent-workflow/07-continue-confirmation-running.png` |
| same-workspace deploy continuation works | PASS | `apps/api/src/lib/operator-visible-workflow.test.ts` covers `same-workspace deploy consumes latest artifact`; screenshot `runtime/evidence/visible-agent-workflow/08-artifact-handoff-deploy-playable.png`; capture script asserts artifact reuse instead of a fresh workspace |
| fake verified closed | PASS | `apps/api/src/lib/operator-visible-workflow.test.ts` covers `keeps failed previews unverified and blocks publish from a failed preview state`, `preserves structured preview failure after repeated workspace rehydrates during execution`, `requires full runtime evidence before preview can become verified`, and `rehydrates preview evidence and downgrades persisted fake verified states without it`; screenshot `runtime/evidence/visible-agent-workflow/05-preview-failed.png` |
| refresh rehydrate works | PASS | `apps/api/src/lib/operator-visible-workflow.test.ts` covers `refresh rehydrates active task state` and `rehydrates blocked failure payload and artifacts after persisted reload`; screenshot `runtime/evidence/visible-agent-workflow/09-refresh-rehydrate.png` |

## Failure Code Matrix

| failure_code | Proving test |
| --- | --- |
| `repo_url_invalid` | `apps/api/src/lib/operator-visible-workflow.test.ts`: `maps structured failure messages into the expected failure codes` |
| `repo_unreachable` | `apps/api/src/lib/operator-visible-workflow.test.ts`: `maps structured failure messages into the expected failure codes` |
| `repo_auth_failed` | `apps/api/src/lib/operator-visible-workflow.test.ts`: `maps structured failure messages into the expected failure codes` |
| `github_proxy_aborted` | `apps/api/src/lib/operator-visible-workflow.test.ts`: `maps structured failure messages into the expected failure codes` |
| `package_manager_unknown` | `apps/api/src/lib/operator-visible-workflow.test.ts`: `blocks low-confidence repositories before build instead of guessing commands`; also covered by `maps structured failure messages into the expected failure codes` |
| `workspace_detection_failed` | `apps/api/src/lib/operator-visible-workflow.test.ts`: `maps structured failure messages into the expected failure codes` |
| `build_command_uncertain` | `apps/api/src/lib/operator-visible-workflow.test.ts`: `maps structured failure messages into the expected failure codes` |
| `build_script_missing` | `apps/api/src/lib/operator-visible-workflow.test.ts`: `maps missing build scripts to a structured failure code`; also covered by `maps structured failure messages into the expected failure codes` |
| `compose_recipe_missing` | `apps/api/src/lib/operator-visible-workflow.test.ts`: `classifies compose repositories without a grounded runtime recipe as compose_recipe_missing` and `marks compose without a reliable recipe as compose_recipe_missing` |
| `static_preview_only` | `apps/api/src/lib/operator-visible-workflow.test.ts`: `blocks publish with static_preview_only when only a verified static preview lane exists` |
| `preview_failed` | `apps/api/src/lib/operator-visible-workflow.test.ts`: `keeps failed previews unverified and blocks publish from a failed preview state` and `preserves structured preview failure after repeated workspace rehydrates during execution`; web truth rendering also covered in `apps/web/src/pages/OperatorHubPage.test.tsx` |
| `ssh_missing_credentials` | `apps/api/src/lib/operator-readiness.test.ts`: `blocks deployment when credentials are missing`; deploy blocking surfaced in `apps/api/src/lib/operator-visible-workflow.test.ts`: `blocks publish when SSH readiness is not ready` |
| `ssh_auth_failed` | `apps/api/src/lib/operator-readiness.test.ts`: `maps auth and host failures into structured readiness states`; failure-code mapping also covered in `apps/api/src/lib/operator-visible-workflow.test.ts`: `maps structured failure messages into the expected failure codes` |
| `deploy_blocked` | `apps/api/src/lib/operator-visible-workflow.test.ts`: `uses the active pending confirmation id and blocks mismatches` and `blocks unsupported stacks instead of pretending they can deploy` |

## Right-Side Failure Truth Evidence

The right-side truth panel is now treated as an acceptance surface, not a redesign target.

- Backend failure payloads always populate:
  - `failureCode`
  - `humanSummary`
  - `probableRootCause`
  - `recommendedActions`
- Frontend truth-state tests cover field mapping and rendering:
  - `apps/web/src/lib/operator-workbench-state.test.ts`: `selects active task truth for the right panel from workflow state`
  - `apps/web/src/pages/OperatorHubPage.test.tsx`: `right panel reflects active task truth`
- The screenshot harness asserts these fields exist before blocked/failure captures:
  - `truth-failure_code`
  - `truth-human_summary`
  - `truth-probable_root_cause`
  - `truth-actions`

## Screenshot Inventory

All screenshots were regenerated at `Apr 21 09:09 PDT` under `runtime/evidence/visible-agent-workflow/`.

| File | What it proves |
| --- | --- |
| `01-planning-mode-on.png` | planning mode active baseline |
| `02-planning-mode-off.png` | planning mode disabled baseline with main workflow visible |
| `03-low-confidence-blocked.png` | blocked flow with structured failure truth visible |
| `04-executor-running.png` | active running stage shown in the main workflow timeline |
| `05-preview-failed.png` | failed preview remains unverified and exposes structured failure truth |
| `06-ssh-readiness-blocked.png` | publish blocked by readiness and credentials truth |
| `07-continue-confirmation-running.png` | wrong confirmation no longer dead-ends the workspace; correct confirmation resumes the same task |
| `08-artifact-handoff-deploy-playable.png` | deploy continuation reuses the same workspace artifact handoff |
| `09-refresh-rehydrate.png` | page refresh retains workflow stage, failure payload, and artifacts |

## Residual Notes

- No open code regression blocker remained at the end of this integrated A-E run.
- `pnpm build` still emits the pre-existing Vite chunk-size warning for the web bundle. This is non-blocking and outside the failure/readiness lane.
- Rebuilding `sloth-cloud-api` also rebuilt `sloth-cloud-paymenter` as part of the compose stack. That was environmental churn, not a product regression.
