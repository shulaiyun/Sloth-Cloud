# Parallel Delivery Plan

## Scope And Real Inputs

- Target repo for this split: `/Users/shulai/Documents/New project/vps`
- Reviewed docs:
  - `docs/visible-agent-workflow.md`
  - `docs/unified-ai-workbench-delivery.md`
  - `docs/interface-contract.md`
  - `README.md`
- `AGENTS.md` status:
  - No `AGENTS.md` exists inside `vps/`
  - The only nearby file is `/Users/shulai/Documents/New project/CLIProxyAPI-main/AGENTS.md`, which is not the active repo for this work and should not be treated as binding here
- Previous accepted context reused:
  - session `019daf54-5976-7240-93c1-428ee38a2523` already pushed the visible-workflow direction into real code and tests
  - the current dirty worktree is part of the baseline, not noise

## Current Hotspots

### 1. `apps/api/src/lib/operator.ts`

- Current size: about 13k lines
- Current responsibilities are still too mixed:
  - workflow task/state transitions
  - artifact ledger hydration and workspace handoff
  - repo/runtime recipe detection
  - preview build and deploy continuation
  - readiness / failure propagation
  - persistent state normalization
- This is the main parallel-conflict source for threads A/B/C/E.

### 2. `apps/api/src/index.ts`

- Current size: about 11k lines
- Current responsibilities are still too mixed:
  - operator routes
  - assistant routes
  - confirmation/continue bridging
  - response shaping for workflow surfaces
- This is the second conflict source, especially around:
  - `/api/v1/operator/workspaces/:capsuleId/continue`
  - `/api/v1/assistant/messages`
  - `/api/v1/assistant/actions/confirm`
  - `/api/v1/operator/system/status`

### 3. `apps/web/src/pages/OperatorHubPage.tsx`

- Current size: about 2k lines
- Current responsibilities are still too mixed:
  - workspace selection
  - assistant session lifecycle
  - timeline rendering
  - truth panel rendering
  - deploy action dispatch
  - local thread-state reconciliation
- This is crowded, but it is mostly a D-thread problem rather than a cross-thread problem.

## Minimal Split Already Landed

- Added `apps/api/src/lib/operator-workflow.ts`
- Purpose of this split:
  - pull workflow helper logic out of `operator.ts`
  - give A thread a dedicated home for state-machine / confirmation helper work
  - reduce direct collisions between state-machine work and artifact/runtime work
- What moved:
  - workflow normalization helpers
  - workflow card/evidence builders
  - pending confirmation helpers
  - workflow failure mapping/build/apply helpers

## Shared Rules For All 5 Threads

- Do not do visual beautification.
- Do not change unrelated Paymenter or Convoy upstream code.
- Prefer adding small sibling modules over growing `operator.ts` or `OperatorHubPage.tsx` further.
- If a change needs a new field in the operator envelope:
  - backend contract lands first
  - then `apps/web/src/lib/operator-types.ts`
  - then UI consumption
- If a change can be isolated into a new helper file under `apps/api/src/lib/` or `apps/web/src/lib/`, do that before editing a hotspot file further.
- Do not rewrite the screenshot script or acceptance flow until the producing contract is stable.

## Thread A

### A. State Machine And Confirmation Continuation

- Goal:
  - make workflow stage transitions and confirmation continuation deterministic
  - keep `awaiting_confirmation -> queued -> running -> verifying -> partial_success|success|failed|blocked|rolled_back` authoritative
  - keep same-workspace continuity strict for `continue` and `new_turn`
- Editable files:
  - `apps/api/src/lib/operator-workflow.ts`
  - `apps/api/src/lib/operator.ts`
  - `apps/api/src/index.ts`
  - `apps/api/src/lib/operator-visible-workflow.test.ts`
  - `docs/visible-agent-workflow.md`
- Editable regions inside crowded files:
  - `apps/api/src/lib/operator.ts`
    - workflow task sync / ensure task area
    - preflight-to-confirmation flow
    - `continueActiveTask`
  - `apps/api/src/index.ts`
    - `/api/v1/operator/workspaces/:capsuleId/continue`
    - assistant confirm/continue glue only
- Forbidden files:
  - `apps/api/src/lib/operator-readiness.ts`
  - `apps/web/src/pages/OperatorHubPage.tsx`
  - `apps/web/src/lib/operator-types.ts`
  - `scripts/capture-operator-workbench.mjs`
- External interface contract:
  - do not rename workflow stages
  - do not remove `pending_confirmation_id` semantics
  - confirmation must remain required before any mutating execution step
  - `taskMode` meanings stay:
    - `continue`: append to active task in current workspace
    - `new_turn`: create a new task in current workspace
- Test requirements:
  - keep `apps/api/src/lib/operator-visible-workflow.test.ts` green
  - add/keep tests for:
    - pending confirmation id mismatch
    - active task continuation
    - same-workspace `new_turn`
    - no duplicate timeline cards
- Merge order:
  - merge first

## Thread B

### B. Workspace Artifact Ledger And Generate -> Deploy Handoff

- Goal:
  - make workspace artifact ledger complete enough for same-workspace deploy continuation
  - ensure generate/build/preview outputs are reusable by deploy without inventing missing artifacts
  - remove ambiguity around archive / manifest / entry / run-command handoff
- Editable files:
  - `apps/api/src/lib/operator.ts`
  - `apps/api/src/lib/operator-visible-workflow.test.ts`
  - `docs/unified-ai-workbench-delivery.md`
- Preferred new files if logic grows:
  - `apps/api/src/lib/operator-artifact-ledger.ts`
  - `apps/api/src/lib/operator-generated-project.ts`
- Editable regions inside crowded files:
  - `apps/api/src/lib/operator.ts`
    - artifact summary normalization/building
    - generated project materialization
    - preview build artifact handoff
    - `continueActiveTask` ledger completeness checks
- Forbidden files:
  - `apps/api/src/lib/operator-workflow.ts`
  - `apps/api/src/lib/operator-readiness.ts`
  - `apps/web/src/pages/OperatorHubPage.tsx`
  - `scripts/capture-operator-workbench.mjs`
- External interface contract:
  - artifact ledger must keep these truths aligned:
    - `generatedProject`
    - `artifactSummary`
    - `workflow.tasks[].artifacts`
    - archive / manifest URLs
    - entry file
    - run commands
  - do not claim deploy handoff is ready if any of these are missing:
    - generated artifacts
    - runnable entry
    - run commands
- Test requirements:
  - extend `apps/api/src/lib/operator-visible-workflow.test.ts`
  - keep coverage for:
    - artifact rehydration after restart
    - `deploy_playable` continuation reuses current-workspace artifacts
    - missing ledger fields stop deploy continuation with structured failure
- Merge order:
  - merge third
  - rebase onto A and C first

## Thread C

### C. Support Matrix / Runtime Recipe / Fake Verified Cleanup

- Goal:
  - tighten repo/runtime detection so support claims match what the system can really build and verify
  - stop any path that marks preview as verified without real build+verification evidence
  - make runtime recipe output authoritative enough for downstream handoff
- Editable files:
  - `apps/api/src/lib/operator.ts`
  - `apps/api/src/lib/operator-visible-workflow.test.ts`
  - `docs/visible-agent-workflow.md`
  - `docs/unified-ai-workbench-delivery.md`
- Preferred new files if logic grows:
  - `apps/api/src/lib/operator-runtime-recipe.ts`
  - `apps/api/src/lib/operator-env-checklist.ts`
- Editable regions inside crowded files:
  - `apps/api/src/lib/operator.ts`
    - repo preflight
    - build-plan detection
    - package manager/runtime recipe detection
    - env checklist inference
    - preview verification truth gates
- Forbidden files:
  - `apps/api/src/lib/operator-workflow.ts`
  - `apps/api/src/lib/operator-readiness.ts`
  - `apps/web/src/pages/OperatorHubPage.tsx`
- External interface contract:
  - preserve these envelope surfaces:
    - `techStackSummary`
    - `envChecklistSummary`
    - `deploymentSummary`
    - `previewSummary`
  - `previewSummary.verified === true` must mean a real verified preview, not a placeholder or inferred state
  - `supported` in deployment/runtime output must follow actual recipe support, not optimism
- Test requirements:
  - keep low-confidence repo blocking tests green
  - add or extend tests for:
    - package-manager detection
    - build command uncertainty
    - env missing classification
    - fake verified regression
- Merge order:
  - merge second
  - rebase onto A first

## Thread D

### D. UI Timeline / Truth Panel / Main Workflow

- Goal:
  - make the operator UI consume the new visible-workflow contract cleanly
  - keep timeline, truth panel, and main workflow centered on one workspace thread
  - avoid inventing UI-only truth that backend does not provide
- Editable files:
  - `apps/web/src/pages/OperatorHubPage.tsx`
  - `apps/web/src/lib/operator-workbench-state.ts`
  - `apps/web/src/lib/operator-workbench-state.test.ts`
  - `apps/web/src/lib/operator-types.ts`
  - `apps/web/src/lib/types.ts`
  - `apps/web/src/App.tsx`
  - `apps/web/src/pages/OperatorCapsulePage.tsx`
  - `apps/web/src/components/LaunchStudio.tsx`
  - `apps/web/src/styles/console.css`
- Preferred new files if UI logic grows:
  - `apps/web/src/components/operator/OperatorTimelinePanel.tsx`
  - `apps/web/src/components/operator/OperatorTruthPanel.tsx`
  - `apps/web/src/components/operator/OperatorWorkspaceComposer.tsx`
- Forbidden files:
  - `apps/api/src/lib/operator.ts`
  - `apps/api/src/lib/operator-workflow.ts`
  - `apps/api/src/lib/operator-readiness.ts`
  - `apps/api/src/index.ts`
- External interface contract:
  - UI must treat backend envelope as source of truth
  - if backend contract is missing a field, add it through backend merge first; do not invent local shadow state that implies verified success
  - preserve route shape:
    - `/operator`
    - `/operator/:capsuleId`
- Test requirements:
  - keep `apps/web/src/lib/operator-workbench-state.test.ts` green
  - keep `apps/web/src/lib/operator-input.test.ts` green
  - verify:
    - workspace switching does not cross-contaminate thread state
    - timeline cards do not duplicate
    - truth panel reflects current active task and active workspace
- Merge order:
  - merge fourth
  - rebase onto A, B, and C first

## Thread E

### E. Failure Classification / Readiness / E2E Acceptance

- Goal:
  - make readiness and failure taxonomy trustworthy
  - make acceptance evidence reproducible
  - be the final gate that proves the refactor does not regress into fake success
- Editable files:
  - `apps/api/src/lib/operator-readiness.ts`
  - `apps/api/src/lib/operator-readiness.test.ts`
  - `apps/api/src/lib/operator-visible-workflow.test.ts`
  - `apps/api/src/lib/operator-workflow.ts`
  - `apps/api/src/index.ts`
  - `scripts/capture-operator-workbench.mjs`
  - `runtime/evidence/visible-agent-workflow/`
  - `vitest.config.ts`
- Forbidden files:
  - `apps/web/src/pages/OperatorHubPage.tsx`
  - `apps/web/src/components/LaunchStudio.tsx`
  - runtime recipe/build-plan sections in `apps/api/src/lib/operator.ts`
  - artifact materialization sections in `apps/api/src/lib/operator.ts`
- External interface contract:
  - readiness states remain:
    - `missing_credentials`
    - `auth_failed`
    - `host_unreachable`
    - `host_key_untrusted`
    - `ready`
  - workflow failure codes remain explicit and machine-readable
  - E2E evidence should prove:
    - planning mode on
    - planning mode off
    - low-confidence blocked
    - executor running
    - preview failed
    - SSH readiness blocked
    - continue confirmation running
    - artifact handoff continuation
- Test requirements:
  - run:
    - `pnpm test`
    - `pnpm typecheck`
    - `pnpm build`
  - run live acceptance:
    - `curl http://127.0.0.1:14000/api/v1/health`
    - `curl http://127.0.0.1:14000/api/v1/operator/system/status`
    - `node scripts/capture-operator-workbench.mjs`
  - refresh screenshot evidence after final merge
- Merge order:
  - merge last
  - rebase onto A, B, C, and D first

## Final Merge Sequence

1. A state machine and confirmation continuation
2. C support matrix / runtime recipe / fake verified cleanup
3. B artifact ledger and generate -> deploy handoff
4. D UI timeline / truth panel / main workflow
5. E failure classification / readiness / E2E acceptance

## Why This Order

- A defines the control contract.
- C defines what runtime/build truth means.
- B consumes A+C output to make handoff durable.
- D should render stable contracts, not moving targets.
- E should validate the integrated system last and refresh proof.

## Conflict Notes Before Opening 5 Threads

- If a thread needs to expand `apps/api/src/lib/operator.ts` by more than about 150 lines, stop and split a sibling helper first.
- Only A and E may touch assistant/operator continue-confirm bridging in `apps/api/src/index.ts`.
- Only D may touch `apps/web/src/pages/OperatorHubPage.tsx`.
- Only E may regenerate `runtime/evidence/visible-agent-workflow/*`.
- If B or C needs a new backend field, land it before D consumes it.
