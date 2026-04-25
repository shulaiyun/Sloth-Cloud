import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createOperatorEngine } from './operator.js';
import { mapWorkflowErrorToFailureCode } from './operator-workflow.js';

function createTempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeRepoFiles(root: string, files: Record<string, string>) {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }
}

function createLocalGitRemote(files: Record<string, string>) {
  const tempRoot = createTempDir('sloth-visible-workflow-repo-');
  const worktree = join(tempRoot, 'worktree');
  const remote = join(tempRoot, 'remote.git');
  mkdirSync(worktree, { recursive: true });
  execFileSync('git', ['init', '--initial-branch=main'], { cwd: worktree });
  writeRepoFiles(worktree, files);
  execFileSync('git', ['add', '.'], { cwd: worktree });
  execFileSync('git', ['-c', 'user.name=Sloth', '-c', 'user.email=sloth@example.com', 'commit', '-m', 'init'], { cwd: worktree });
  execFileSync('git', ['init', '--bare', remote]);
  execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: worktree });
  execFileSync('git', ['push', '-u', 'origin', 'main'], { cwd: worktree });
  return remote;
}

function createSupportedViteReactRemote(options?: {
  includeBuildScript?: boolean;
  scripts?: Record<string, string>;
  appSource?: string;
  extraFiles?: Record<string, string>;
}) {
  const scripts = {
    dev: 'vite --host 0.0.0.0 --port 3000',
    ...(options?.includeBuildScript === false ? {} : { build: 'vite build' }),
    ...(options?.scripts ?? {}),
  };
  return createLocalGitRemote({
    'package.json': JSON.stringify({
      name: 'visible-workflow-react',
      private: true,
      version: '0.1.0',
      type: 'module',
      scripts,
      dependencies: {
        react: '^19.1.0',
        'react-dom': '^19.1.0',
      },
      devDependencies: {
        vite: '^7.1.5',
        '@vitejs/plugin-react': '^4.7.0',
      },
    }, null, 2),
    'vite.config.js': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});`,
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Visible Workflow</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
    'src/main.jsx': `import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);`,
    'src/App.jsx': options?.appSource ?? `export default function App() {
  return <main>hello workflow</main>;
}`,
    ...(options?.extraFiles ?? {}),
  });
}

function patchPersistedCapsule(
  root: string,
  capsuleId: string,
  mutate: (record: Record<string, any>) => void,
) {
  const statePath = join(root, 'state.json');
  const payload = JSON.parse(readFileSync(statePath, 'utf8')) as { records?: Array<Record<string, any>> };
  const record = payload.records?.find((entry) => entry?.capsule?.id === capsuleId);
  if (!record) {
    throw new Error(`capsule_not_found:${capsuleId}`);
  }
  mutate(record);
  writeFileSync(statePath, JSON.stringify(payload, null, 2));
}

function markPersistedCapsuleConnectorReady(root: string, capsuleId: string) {
  patchPersistedCapsule(root, capsuleId, (record) => {
    record.capsule = {
      ...(record.capsule ?? {}),
      connector: {
        mode: 'agent',
        host: '127.0.0.1',
        port: 22,
        username: 'root',
        trust: 'verified',
      },
    };
    record.credentialReadiness = {
      ...(record.credentialReadiness ?? {}),
      status: 'ready',
      headline: 'SSH credentials are ready',
      detail: 'Preflight passed: root@127.0.0.1:22',
      nextAction: 'You can continue deploying to server #19.',
      checkedAt: '2026-04-21T00:00:00.000Z',
      source: 'preflight',
    };
  });
}

async function withFakeAgentSocket<T>(run: () => Promise<T> | T) {
  const previous = process.env.SSH_AUTH_SOCK;
  process.env.SSH_AUTH_SOCK = '/tmp/sloth-visible-workflow-agent.sock';
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.SSH_AUTH_SOCK;
    } else {
      process.env.SSH_AUTH_SOCK = previous;
    }
  }
}

const interactiveSingleFileHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Interactive Preview</title>
  </head>
  <body>
    <canvas id="stage" width="240" height="120"></canvas>
    <button id="start" type="button">Start</button>
    <script>
      const button = document.getElementById('start');
      const canvas = document.getElementById('stage');
      const context = canvas.getContext('2d');
      button?.addEventListener('click', () => {
        document.title = 'Interactive Preview Running';
        button.textContent = 'Started';
        context.fillStyle = '#0a7a64';
        context.fillRect(0, 0, 120, 60);
      });
    </script>
  </body>
</html>`;

function successfulPreviewVerification(root: string, screenshotName = 'verified-runtime.png') {
  return {
    ok: true,
    reason: null,
    evidence: {
      runtimeLiveAt: '2026-04-21T00:00:00.000Z',
      healthPassedAt: '2026-04-21T00:00:01.000Z',
      smokePassedAt: '2026-04-21T00:00:02.000Z',
      screenshotPath: join(root, screenshotName),
    },
    observedChange: true,
    placeholderLike: false,
  };
}

function createTestEngine() {
  const root = createTempDir('sloth-visible-workflow-engine-');
  return createTestEngineFromRoot(root);
}

function createTestEngineFromRoot(
  root: string,
  options: {
    previewVerifier?: ((input: {
      previewKind: 'static' | 'proxy';
      goldenPath: 'single-file-html-canvas' | 'vite-react' | 'nextjs' | 'docker-compose' | null;
      previewUrl: string;
      healthcheckPath: string | null;
      screenshotPath: string | null;
      buildRoot?: string | null;
      runtimeUrl?: string | null;
      timeoutMs?: number;
    }) => Promise<{
      ok: boolean;
      reason: string | null;
      evidence: {
        runtimeLiveAt: string | null;
        healthPassedAt: string | null;
        smokePassedAt: string | null;
        screenshotPath: string | null;
      };
      observedChange: boolean;
      placeholderLike: boolean;
    }>) | null;
  } = {},
) {
  return createOperatorEngine({
    stateFilePath: join(root, 'state.json'),
    generatedProjectsRoot: join(root, 'generated-projects'),
    previewBaseUrl: 'http://preview.local',
    artifactBaseUrl: 'http://artifact.local',
    executionProviders: [],
    previewVerifier: options.previewVerifier ?? (async () => successfulPreviewVerification(root)),
  });
}

function readState(root: string) {
  return JSON.parse(readFileSync(join(root, 'state.json'), 'utf8')) as {
    records: Array<Record<string, unknown>>;
  };
}

async function waitFor<T>(fn: () => T | null | undefined | false, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = fn();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('wait_timeout');
}

describe('visible agent workflow', () => {
  it('confirm action advances task state', () => {
    const engine = createTestEngine();

    const staged = engine.createPlan({
      entryKind: 'generate-from-idea',
      title: 'idea-confirmation',
      brief: 'build a tiny playable game',
      planningMode: 'on',
      userIntent: 'build a tiny playable game',
      parsedInput: {
        kind: 'idea',
        rawInput: 'build a tiny playable game',
        idea: 'build a tiny playable game',
      },
    });
    const stagedTask = staged.workflow.tasks.find((entry) => entry.id === staged.workflow.activeTaskId)!;
    expect(stagedTask.currentStage).toBe('awaiting_confirmation');
    expect(stagedTask.pendingConfirmation?.token).toBeTruthy();

    const confirmed = engine.confirmActivePlan({
      capsuleId: staged.capsule.id,
    });
    expect(confirmed).toBeTruthy();
    const confirmedTask = confirmed!.workflow.tasks.find((entry) => entry.id === confirmed!.workflow.activeTaskId)!;
    expect(['queued', 'running', 'verifying', 'partial_success']).toContain(confirmedTask.currentStage);
    expect(confirmedTask.pendingConfirmation).toBeNull();
    expect(confirmedTask.timeline.some((card) => card.kind === 'execution' && card.source === 'executor')).toBe(true);
  });

  it('continue_current_task uses active pending id', () => {
    const engine = createTestEngine();

    const staged = engine.createPlan({
      entryKind: 'generate-from-idea',
      title: 'idea-continue-active-pending',
      brief: 'build a tiny playable game',
      planningMode: 'on',
      userIntent: 'build a tiny playable game',
      parsedInput: {
        kind: 'idea',
        rawInput: 'build a tiny playable game',
        idea: 'build a tiny playable game',
      },
    });
    const stagedTask = staged.workflow.tasks.find((entry) => entry.id === staged.workflow.activeTaskId)!;
    const expectedPendingId = stagedTask.pendingConfirmation?.token;
    expect(expectedPendingId).toBeTruthy();

    const continued = engine.continueActiveTask({
      capsuleId: staged.capsule.id,
    });
    expect(continued).toBeTruthy();
    const continuedTask = continued!.workflow.tasks.find((entry) => entry.id === continued!.workflow.activeTaskId)!;
    expect(['queued', 'running', 'verifying', 'partial_success']).toContain(continuedTask.currentStage);
    expect(continuedTask.pendingConfirmation).toBeNull();
    expect(continuedTask.timeline.some((card) => card.evidence.some((entry) => entry.detail === expectedPendingId))).toBe(true);
  });

  it('continues the active pending task from awaiting_confirmation into queued/running', async () => {
    const remote = createSupportedViteReactRemote();
    const engine = createTestEngine();

    const staged = await engine.analyzeProject({
      projectName: 'continue-confirmation',
      repoUrl: remote,
      planningMode: 'on',
      autoStartBuild: false,
      userIntent: `deploy ${remote}`,
    });
    const stagedTask = staged.workflow.tasks.find((entry) => entry.id === staged.workflow.activeTaskId)!;
    expect(stagedTask.currentStage).toBe('awaiting_confirmation');
    expect(stagedTask.pendingConfirmation?.token).toBeTruthy();

    const continued = engine.continueActiveTask({
      capsuleId: staged.capsule.id,
    });
    expect(continued).toBeTruthy();
    const task = continued!.workflow.tasks.find((entry) => entry.id === continued!.workflow.activeTaskId)!;
    expect(['queued', 'running', 'verifying', 'partial_success']).toContain(task.currentStage);
    expect(task.pendingConfirmation).toBeNull();
    expect(task.timeline.some((card) => card.kind === 'execution' && ['queued', 'running'].includes(card.stage))).toBe(true);
  });

  it('uses the active pending confirmation id and blocks mismatches', async () => {
    const remote = createSupportedViteReactRemote();
    const engine = createTestEngine();

    const staged = await engine.analyzeProject({
      projectName: 'continue-confirmation-id',
      repoUrl: remote,
      planningMode: 'on',
      autoStartBuild: false,
      userIntent: `deploy ${remote}`,
    });
    const stagedTask = staged.workflow.tasks.find((entry) => entry.id === staged.workflow.activeTaskId)!;
    const expectedPendingId = stagedTask.pendingConfirmation?.token;
    expect(expectedPendingId).toBeTruthy();

    const mismatch = engine.continueActiveTask({
      capsuleId: staged.capsule.id,
      pendingConfirmationId: 'workflow-confirm-wrong',
    });
    expect(mismatch).toBeTruthy();
    const mismatchTask = mismatch!.workflow.tasks.find((entry) => entry.id === mismatch!.workflow.activeTaskId)!;
    expect(mismatchTask.currentStage).toBe('blocked');
    expect(mismatchTask.failure?.failureCode).toBe('deploy_blocked');

    const retry = await engine.analyzeProject({
      projectName: 'continue-confirmation-id-retry',
      repoUrl: remote,
      planningMode: 'on',
      autoStartBuild: false,
      existingCapsuleId: staged.capsule.id,
      taskMode: 'new_turn',
      userIntent: `deploy ${remote}`,
    });
    const retryTask = retry.workflow.tasks.find((entry) => entry.id === retry.workflow.activeTaskId)!;
    const retryPendingId = retryTask.pendingConfirmation?.token;
    expect(retryPendingId).toBeTruthy();

    const continued = engine.continueActiveTask({
      capsuleId: staged.capsule.id,
      pendingConfirmationId: retryPendingId,
    });
    expect(continued).toBeTruthy();
    const continuedTask = continued!.workflow.tasks.find((entry) => entry.id === continued!.workflow.activeTaskId)!;
    expect(['queued', 'running', 'verifying', 'partial_success']).toContain(continuedTask.currentStage);
  });

  it('keeps planning mode on at awaiting_confirmation before any build starts', async () => {
    const remote = createSupportedViteReactRemote();
    const engine = createTestEngine();

    const envelope = await engine.analyzeProject({
      projectName: 'planning-on',
      repoUrl: remote,
      planningMode: 'on',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const task = envelope.workflow.tasks.find((entry) => entry.id === envelope.workflow.activeTaskId)!;
    expect(task.planningMode).toBe('on');
    expect(task.currentStage).toBe('awaiting_confirmation');
    expect(task.pendingConfirmation?.label).toBeTruthy();
    expect(envelope.latestJob).toBeNull();
  });

  it('queues the repository build after confirmation when preflight confidence is high', async () => {
    const remote = createSupportedViteReactRemote();
    const engine = createTestEngine();

    const envelope = await engine.analyzeProject({
      projectName: 'confident-static',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const task = envelope.workflow.tasks.find((entry) => entry.id === envelope.workflow.activeTaskId)!;
    expect(['queued', 'running', 'verifying', 'partial_success']).toContain(task.currentStage);
    expect(task.timeline.some((card) => card.kind === 'execution' && card.source === 'executor')).toBe(true);
  });

  it('blocks low-confidence repositories before build instead of guessing commands', async () => {
    const remote = createLocalGitRemote({
      'README.md': '# no runtime here',
    });
    const engine = createTestEngine();

    const envelope = await engine.analyzeProject({
      projectName: 'uncertain-repo',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const task = envelope.workflow.tasks.find((entry) => entry.id === envelope.workflow.activeTaskId)!;
    expect(task.currentStage).toBe('blocked');
    expect(task.failure?.failureCode).toBe('package_manager_unknown');
    expect(envelope.latestJob).toBeNull();
  });

  it('does not duplicate timeline cards when continuing the same task', async () => {
    const remote = createSupportedViteReactRemote();
    const engine = createTestEngine();

    const first = await engine.analyzeProject({
      projectName: 'dedupe',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: false,
      userIntent: `deploy ${remote}`,
      taskMode: 'continue',
    });
    const firstTask = first.workflow.tasks.find((entry) => entry.id === first.workflow.activeTaskId)!;

    const second = await engine.analyzeProject({
      projectName: 'dedupe',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: false,
      existingCapsuleId: first.capsule.id,
      userIntent: `deploy ${remote}`,
      taskMode: 'continue',
    });
    const secondTask = second.workflow.tasks.find((entry) => entry.id === second.workflow.activeTaskId)!;

    const ids = secondTask.timeline.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(secondTask.timeline.length).toBeLessThanOrEqual(firstTask.timeline.length + 1);
  });

  it('refresh rehydrates active task state', () => {
    const root = createTempDir('sloth-visible-workflow-active-task-');
    const firstEngine = createTestEngineFromRoot(root);
    const staged = firstEngine.createPlan({
      entryKind: 'generate-from-idea',
      title: 'idea-refresh-rehydrate',
      brief: 'build a tiny playable game',
      planningMode: 'on',
      userIntent: 'build a tiny playable game',
      parsedInput: {
        kind: 'idea',
        rawInput: 'build a tiny playable game',
        idea: 'build a tiny playable game',
      },
    });
    const stagedTask = staged.workflow.tasks.find((entry) => entry.id === staged.workflow.activeTaskId)!;
    expect(stagedTask.pendingConfirmation?.token).toBeTruthy();

    const resumedBeforeConfirm = createTestEngineFromRoot(root).getCapsule(staged.capsule.id);
    expect(resumedBeforeConfirm).toBeTruthy();
    const resumedAwaitingTask = resumedBeforeConfirm!.workflow.tasks.find((entry) => entry.id === resumedBeforeConfirm!.workflow.activeTaskId)!;
    expect(resumedBeforeConfirm!.workflow.activeTaskId).toBe(staged.workflow.activeTaskId);
    expect(resumedAwaitingTask.currentStage).toBe('awaiting_confirmation');
    expect(resumedAwaitingTask.pendingConfirmation?.token).toBe(stagedTask.pendingConfirmation?.token);

    const confirmed = firstEngine.confirmActivePlan({
      capsuleId: staged.capsule.id,
    });
    expect(confirmed).toBeTruthy();

    const resumedAfterConfirm = createTestEngineFromRoot(root).getCapsule(staged.capsule.id);
    expect(resumedAfterConfirm).toBeTruthy();
    const resumedTask = resumedAfterConfirm!.workflow.tasks.find((entry) => entry.id === resumedAfterConfirm!.workflow.activeTaskId)!;
    expect(resumedAfterConfirm!.workflow.activeTaskId).toBe(confirmed!.workflow.activeTaskId);
    expect(resumedTask.pendingConfirmation).toBeNull();
    expect(['queued', 'running', 'verifying', 'partial_success']).toContain(resumedTask.currentStage);
    expect(resumedAfterConfirm!.capsule.workflowStage).toBe(resumedTask.currentStage);
  });

  it('generated artifact persists in workspace ledger', async () => {
    const root = createTempDir('sloth-visible-workflow-ledger-');
    const engine = createTestEngineFromRoot(root);
    const generated = await engine.generateProject({
      projectName: 'ledger-persist',
      idea: 'build a tiny playable game',
      planningMode: 'off',
      userIntent: 'build a tiny playable game',
    });

    expect(generated.workspaceArtifactLedger.latestUserIntent).toBe('build a tiny playable game');
    expect(generated.workspaceArtifactLedger.latestArtifact.sourceType).toBe('generated');
    expect(generated.workspaceArtifactLedger.latestArtifact.archiveUrl).toBeTruthy();
    expect(generated.workspaceArtifactLedger.latestArtifact.manifestUrl).toBeTruthy();
    expect(generated.workspaceArtifactLedger.chosenStack.label).not.toBe('Unknown stack');
    expect(generated.workspaceArtifactLedger.runnableEntry.entryFile).toBeTruthy();
    expect(generated.workspaceArtifactLedger.runnableEntry.runCommands.length).toBeGreaterThan(0);
    expect(generated.workspaceArtifactLedger.previewTarget.url).toBeTruthy();

    const resumedEngine = createTestEngineFromRoot(root);
    const resumed = resumedEngine.getCapsule(generated.capsule.id);
    expect(resumed).toBeTruthy();
    expect(resumed!.workspaceArtifactLedger.latestArtifact.sourceType).toBe('generated');
    expect(resumed!.workspaceArtifactLedger.latestArtifact.archiveUrl).toBe(generated.workspaceArtifactLedger.latestArtifact.archiveUrl);
    expect(resumed!.workspaceArtifactLedger.runnableEntry.entryFile).toBe(generated.workspaceArtifactLedger.runnableEntry.entryFile);
    expect(resumed!.workspaceArtifactLedger.previewTarget.url).toBe(generated.workspaceArtifactLedger.previewTarget.url);
  });

  it('rehydrates workflow stage and artifacts from persisted workspace ledger', async () => {
    const root = createTempDir('sloth-visible-workflow-rehydrate-');
    const firstEngine = createTestEngineFromRoot(root);
    const generated = await firstEngine.generateProject({
      projectName: 'rehydrate-workspace',
      idea: 'build a tiny playable game',
      planningMode: 'off',
      userIntent: 'build a tiny playable game',
    });
    const firstTask = generated.workflow.tasks.find((entry) => entry.id === generated.workflow.activeTaskId)!;
    expect(generated.artifactSummary.sourceType).toBe('generated');
    expect(firstTask.currentStage).toBeTruthy();

    const resumedEngine = createTestEngineFromRoot(root);
    const resumed = resumedEngine.getCapsule(generated.capsule.id);
    expect(resumed).toBeTruthy();
    const resumedTask = resumed!.workflow.tasks.find((entry) => entry.id === resumed!.workflow.activeTaskId)!;
    expect(resumedTask.currentStage).toBe(firstTask.currentStage);
    expect(resumed!.artifactSummary.sourceType).toBe('generated');
    expect(resumed!.artifactSummary.entryFile).toBeTruthy();
    expect(resumed!.workspaceArtifactLedger.latestArtifact.sourceType).toBe('generated');
    expect(resumed!.workspaceArtifactLedger.runnableEntry.entryFile).toBeTruthy();
  });

  it('same-workspace deploy consumes latest artifact', async () => {
    const root = createTempDir('sloth-visible-workflow-latest-artifact-');
    const firstEngine = createTestEngineFromRoot(root);
    const generated = await firstEngine.generateProject({
      projectName: 'deploy-playable-handoff',
      idea: 'build a tiny playable game',
      planningMode: 'off',
      userIntent: 'build a tiny playable game',
    });
    const state = readState(root);
    const record = state.records.find((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return false;
      }
      return (entry as { capsule?: { id?: string } }).capsule?.id === generated.capsule.id;
    }) as {
      artifactSummary: Record<string, unknown>;
    } | undefined;
    expect(record).toBeTruthy();
    record!.artifactSummary.archiveUrl = 'http://artifact.local/stale-bundle.tar.gz';
    record!.artifactSummary.entryFile = 'stale-entry.tsx';
    record!.artifactSummary.runCommands = ['echo stale'];
    writeFileSync(join(root, 'state.json'), JSON.stringify(state, null, 2));

    const resumedEngine = createTestEngineFromRoot(root);
    const resumed = resumedEngine.getCapsule(generated.capsule.id);
    expect(resumed).toBeTruthy();
    expect(resumed!.workspaceArtifactLedger.latestArtifact.archiveUrl).toBe(generated.workspaceArtifactLedger.latestArtifact.archiveUrl);
    expect(resumed!.workspaceArtifactLedger.runnableEntry.entryFile).toBe(generated.workspaceArtifactLedger.runnableEntry.entryFile);

    const continued = resumedEngine.continueActiveTask({
      capsuleId: generated.capsule.id,
      operation: 'deploy_playable',
      userIntent: '帮我部署出来可以玩的',
    });
    expect(continued).toBeTruthy();
    const task = continued!.workflow.tasks.find((entry) => entry.id === continued!.workflow.activeTaskId)!;
    expect(['queued', 'running', 'verifying', 'partial_success']).toContain(task.currentStage);
    expect(continued!.latestJob?.kind).toBe('deploy_preview');
    expect(task.failure).toBeNull();
    const executionCard = [...task.timeline].reverse().find((card) => card.kind === 'execution' && card.stage === 'queued');
    expect(executionCard).toBeTruthy();
    expect(executionCard!.evidence.some((entry) => entry.label === 'Latest artifact' && entry.detail === continued!.workspaceArtifactLedger.latestArtifact.archiveUrl)).toBe(true);
    expect(executionCard!.evidence.some((entry) => entry.label === 'Runnable entry' && entry.detail === continued!.workspaceArtifactLedger.runnableEntry.entryFile)).toBe(true);
    expect(executionCard!.evidence.some((entry) => entry.label === 'Chosen stack' && entry.detail === continued!.workspaceArtifactLedger.chosenStack.label)).toBe(true);
  });

  it('missing info is surfaced as explicit gap, not context loss', async () => {
    const root = createTempDir('sloth-visible-workflow-ledger-gap-');
    const firstEngine = createTestEngineFromRoot(root);
    const generated = await firstEngine.generateProject({
      projectName: 'deploy-gap',
      idea: 'build a tiny playable game',
      planningMode: 'off',
      userIntent: 'build a tiny playable game',
    });

    const state = readState(root);
    const record = state.records.find((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return false;
      }
      return (entry as { capsule?: { id?: string } }).capsule?.id === generated.capsule.id;
    }) as {
      generatedProject: Record<string, unknown> | null;
      artifactSummary: {
        archiveUrl: string | null;
        manifestUrl: string | null;
        entryFile: string | null;
        runCommands: string[];
        fileCount: number;
      };
      previewSummary: { previewUrl: string | null };
      capsule: { previewUrl: string | null };
      workspaceArtifactLedger: {
        latestArtifact: { archiveUrl: string | null; manifestUrl: string | null; archiveName: string | null; fileCount: number };
        runnableEntry: { entryFile: string | null; runCommands: string[] };
        previewTarget: { url: string | null };
      };
    } | undefined;
    expect(record).toBeTruthy();
    record!.generatedProject = null;
    record!.artifactSummary.archiveUrl = null;
    record!.artifactSummary.manifestUrl = null;
    record!.artifactSummary.entryFile = null;
    record!.artifactSummary.runCommands = [];
    record!.artifactSummary.fileCount = 0;
    record!.previewSummary.previewUrl = null;
    record!.capsule.previewUrl = null;
    record!.workspaceArtifactLedger.latestArtifact.archiveUrl = null;
    record!.workspaceArtifactLedger.latestArtifact.manifestUrl = null;
    record!.workspaceArtifactLedger.latestArtifact.archiveName = null;
    record!.workspaceArtifactLedger.latestArtifact.fileCount = 0;
    record!.workspaceArtifactLedger.runnableEntry.entryFile = null;
    record!.workspaceArtifactLedger.runnableEntry.runCommands = [];
    record!.workspaceArtifactLedger.previewTarget.url = null;
    writeFileSync(join(root, 'state.json'), JSON.stringify(state, null, 2));

    const resumedEngine = createTestEngineFromRoot(root);
    const continued = resumedEngine.continueActiveTask({
      capsuleId: generated.capsule.id,
      operation: 'deploy_playable',
      userIntent: '帮我部署出来可以玩的',
    });
    expect(continued).toBeTruthy();

    const task = continued!.workflow.tasks.find((entry) => entry.id === continued!.workflow.activeTaskId)!;
    expect(task.currentStage).toBe('blocked');
    expect(task.failure?.failureCode).toBe('deploy_blocked');
    expect(task.failure?.humanSummary).toContain('workspace ledger');
    expect(task.failure?.humanSummary).toContain('artifact');
    expect(task.failure?.evidence.some((entry) => entry.label === 'Ledger gaps' && entry.detail.includes('missing_latest_artifact'))).toBe(true);
    expect(task.failure?.evidence.some((entry) => entry.label === 'Ledger gaps' && entry.detail.includes('missing_runnable_entry'))).toBe(true);
  });

  it('repeated envelope reads do not duplicate timeline cards', async () => {
    const remote = createSupportedViteReactRemote();
    const engine = createTestEngine();
    const staged = await engine.analyzeProject({
      projectName: 'rerender-dedupe',
      repoUrl: remote,
      planningMode: 'on',
      autoStartBuild: false,
      userIntent: `deploy ${remote}`,
    });
    engine.continueActiveTask({ capsuleId: staged.capsule.id });

    const firstRead = engine.getCapsule(staged.capsule.id)!;
    const secondRead = engine.getCapsule(staged.capsule.id)!;
    const firstTask = firstRead.workflow.tasks.find((entry) => entry.id === firstRead.workflow.activeTaskId)!;
    const secondTask = secondRead.workflow.tasks.find((entry) => entry.id === secondRead.workflow.activeTaskId)!;
    const firstIds = firstTask.timeline.map((card) => card.id);
    const secondIds = secondTask.timeline.map((card) => card.id);

    expect(new Set(firstIds).size).toBe(firstIds.length);
    expect(new Set(secondIds).size).toBe(secondIds.length);
    expect(secondIds).toEqual(firstIds);
  });

  it('keeps workflow card sources traceable', async () => {
    const remote = createSupportedViteReactRemote();
    const engine = createTestEngine();

    const envelope = await engine.analyzeProject({
      projectName: 'sources',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: false,
      userIntent: `deploy ${remote}`,
    });

    const task = envelope.workflow.tasks.find((entry) => entry.id === envelope.workflow.activeTaskId)!;
    expect(task.timeline.length).toBeGreaterThan(0);
    expect(task.timeline.every((card) => ['llm', 'executor', 'preflight', 'system', 'mock'].includes(card.source))).toBe(true);
    expect(task.timeline.some((card) => card.kind === 'preflight' && card.source === 'preflight')).toBe(true);
  });

  it('supports continue current task vs new turn inside the same workspace', () => {
    const engine = createTestEngine();
    const first = engine.createPlan({
      entryKind: 'generate-from-idea',
      title: 'idea-workspace',
      brief: 'build a small operator-first launch flow',
      planningMode: 'on',
      taskMode: 'continue',
      userIntent: 'build a small operator-first launch flow',
    });
    const firstTaskId = first.workflow.activeTaskId;
    expect(first.workflow.tasks).toHaveLength(1);

    const continued = engine.createPlan({
      entryKind: 'generate-from-idea',
      title: 'idea-workspace',
      brief: 'continue the same task',
      planningMode: 'on',
      existingCapsuleId: first.capsule.id,
      taskMode: 'continue',
      userIntent: 'continue the same task',
    });
    expect(continued.workflow.tasks).toHaveLength(1);
    expect(continued.workflow.activeTaskId).toBe(firstTaskId);

    const nextTurn = engine.createPlan({
      entryKind: 'generate-from-idea',
      title: 'idea-workspace',
      brief: 'start a new task thread',
      planningMode: 'on',
      existingCapsuleId: first.capsule.id,
      taskMode: 'new_turn',
      userIntent: 'start a new task thread',
    });
    expect(nextTurn.workflow.tasks).toHaveLength(2);
    expect(nextTurn.workflow.activeTaskId).not.toBe(firstTaskId);
  });

  it('maps missing build scripts to a structured failure code', async () => {
    const remote = createLocalGitRemote({
      'package.json': JSON.stringify({
        name: 'missing-build',
        private: true,
        version: '0.1.0',
        scripts: {
          dev: 'next dev',
        },
        dependencies: {
          next: '^15.5.0',
          react: '^19.1.0',
          'react-dom': '^19.1.0',
        },
      }, null, 2),
      'next.config.js': 'export default {};',
      'app/page.tsx': `export default function Page() {
  return <main>missing build</main>;
}`,
      'app/layout.tsx': `import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}`,
    });
    const engine = createTestEngine();

    const envelope = await engine.analyzeProject({
      projectName: 'missing-build',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const task = envelope.workflow.tasks.find((entry) => entry.id === envelope.workflow.activeTaskId)!;
    expect(task.failure?.failureCode).toBe('build_script_missing');
  });

  it('maps structured failure messages into the expected failure codes', () => {
    const cases = [
      ['Repository URL is invalid.', 'repo_url_invalid'],
      ['Could not resolve host: github.com', 'repo_unreachable'],
      ['could not read username for https://github.com/org/repo', 'repo_auth_failed'],
      ['Proxy connect aborted while fetching repository metadata.', 'github_proxy_aborted'],
      ['package_manager_unknown', 'package_manager_unknown'],
      ['workspace_detection_failed', 'workspace_detection_failed'],
      ['build_command_uncertain', 'build_command_uncertain'],
      ['build_script_missing', 'build_script_missing'],
      ['unsupported_stack', 'unsupported_stack'],
      ['compose_recipe_missing', 'compose_recipe_missing'],
      ['required deployment input is still missing', 'env_missing'],
      ['static_preview_only', 'static_preview_only'],
      ['preview build failed', 'preview_failed'],
      ['vite_cli_not_found_after_install', 'preview_failed'],
      ['ssh_preflight_missing_credentials', 'ssh_missing_credentials'],
      ['ssh_preflight_auth_failed', 'ssh_auth_failed'],
      ['unsupported_deploy_path', 'deploy_blocked'],
    ] as const;

    for (const [message, expected] of cases) {
      expect(mapWorkflowErrorToFailureCode(message)).toBe(expected);
    }
  });

  it('classifies compose repositories without a grounded runtime recipe as compose_recipe_missing', async () => {
    const remote = createLocalGitRemote({
      'docker-compose.yml': [
        'services:',
        '  web:',
        '    image: nginx:alpine',
        '  worker:',
        '    image: busybox',
      ].join('\n'),
    });
    const engine = createTestEngine();

    const envelope = await engine.analyzeProject({
      projectName: 'compose-recipe-missing',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const task = envelope.workflow.tasks.find((entry) => entry.id === envelope.workflow.activeTaskId)!;
    expect(task.currentStage).toBe('blocked');
    expect(task.failure?.failureCode).toBe('compose_recipe_missing');
    expect(task.failure?.probableRootCause.toLowerCase()).toContain('compose');
    expect(task.failure?.recommendedActions.length).toBeGreaterThan(0);
  });

  it('blocks publish with static_preview_only when only a verified static preview lane exists', async () => {
    const root = createTempDir('sloth-visible-workflow-static-preview-only-');
    const remote = createLocalGitRemote({
      'index.html': interactiveSingleFileHtml,
    });
    const firstEngine = createTestEngineFromRoot(root);

    const started = await firstEngine.analyzeProject({
      projectName: 'static-preview-only',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    await waitFor(() => {
      const current = firstEngine.getCapsule(started.capsule.id);
      return current?.previewSummary.verified ? current : null;
    }, 60_000);

    markPersistedCapsuleConnectorReady(root, started.capsule.id);

    await withFakeAgentSocket(async () => {
      const resumedEngine = createTestEngineFromRoot(root);
      const firstPublish = resumedEngine.publishRelease(started.capsule.id);
      const confirmationToken = firstPublish?.requiredConfirmation?.token ?? null;
      expect(confirmationToken).toBeTruthy();

      resumedEngine.publishRelease(started.capsule.id, confirmationToken);
      const blockedEnvelope = await waitFor(() => {
        const current = resumedEngine.getCapsule(started.capsule.id);
        const task = current?.workflow.activeTaskId
          ? current.workflow.tasks.find((entry) => entry.id === current.workflow.activeTaskId) ?? null
          : null;
        return task?.failure?.failureCode === 'static_preview_only' ? current : null;
      }, 15_000);

      const task = blockedEnvelope.workflow.tasks.find((entry) => entry.id === blockedEnvelope.workflow.activeTaskId)!;
      expect(task.currentStage).toBe('blocked');
      expect(task.failure?.failureCode).toBe('static_preview_only');
      expect(task.failure?.humanSummary).toContain('static preview');
      expect(task.failure?.recommendedActions.length).toBeGreaterThan(0);
      expect(blockedEnvelope.capsule.productionUrl).toBeNull();
      expect(blockedEnvelope.deploymentSummary.previewOnly).toBe(true);
    });
  }, 60_000);

  it('keeps failed previews unverified and blocks publish from a failed preview state', async () => {
    const root = createTempDir('sloth-visible-workflow-preview-failed-');
    const remote = createLocalGitRemote({
      'index.html': interactiveSingleFileHtml,
    });
    const firstEngine = createTestEngineFromRoot(root, {
      previewVerifier: async () => ({
        ok: false,
        reason: 'preview_static_poster_detected',
        evidence: {
          runtimeLiveAt: '2026-04-21T00:00:00.000Z',
          healthPassedAt: '2026-04-21T00:00:01.000Z',
          smokePassedAt: null,
          screenshotPath: null,
        },
        observedChange: false,
        placeholderLike: true,
      }),
    });

    const started = await firstEngine.analyzeProject({
      projectName: 'preview-failed',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const failedEnvelope = await waitFor(() => {
      const current = firstEngine.getCapsule(started.capsule.id);
      return current?.previewSummary.status === 'failed' ? current : null;
    }, 120_000);

    expect(failedEnvelope.previewSummary.status).toBe('failed');
    expect(failedEnvelope.previewSummary.verified).toBe(false);
    expect(failedEnvelope.previewSummary.verifiedAt).toBeNull();
    expect(failedEnvelope.previewSummary.lastError).toContain('preview_static_poster_detected');

    markPersistedCapsuleConnectorReady(root, started.capsule.id);

    await withFakeAgentSocket(async () => {
      const resumedEngine = createTestEngineFromRoot(root);
      const firstPublish = resumedEngine.publishRelease(started.capsule.id);
      const confirmationToken = firstPublish?.requiredConfirmation?.token ?? null;
      expect(confirmationToken).toBeTruthy();

      resumedEngine.publishRelease(started.capsule.id, confirmationToken);
      const blockedEnvelope = await waitFor(() => {
        const current = resumedEngine.getCapsule(started.capsule.id);
        const task = current?.workflow.activeTaskId
          ? current.workflow.tasks.find((entry) => entry.id === current.workflow.activeTaskId) ?? null
          : null;
        return task?.failure?.failureCode === 'deploy_blocked' ? current : null;
      }, 30_000);

      const task = blockedEnvelope.workflow.tasks.find((entry) => entry.id === blockedEnvelope.workflow.activeTaskId)!;
      expect(task.failure?.humanSummary).toContain('preview verification has not completed');
      expect(task.failure?.recommendedActions.length).toBeGreaterThan(0);
      expect(blockedEnvelope.capsule.productionUrl).toBeNull();
    });
  }, 180_000);

  it('preserves structured preview failure after repeated workspace rehydrates during execution', async () => {
    const remote = createSupportedViteReactRemote({
      extraFiles: {
        'vite.config.js': `import { defineConfig } from 'vite';

export default defineConfig(() => {
  throw new Error('vite build failed');
});`,
      },
    });
    const engine = createTestEngine();

    const started = await engine.analyzeProject({
      projectName: 'preview-failure-rehydrate',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: false,
      userIntent: `deploy ${remote}`,
    });

    engine.continueActiveTask({
      capsuleId: started.capsule.id,
    });

    await waitFor(() => {
      const current = engine.getCapsule(started.capsule.id);
      const task = current?.workflow.activeTaskId
        ? current.workflow.tasks.find((entry) => entry.id === current.workflow.activeTaskId) ?? null
        : null;
      return task?.currentStage === 'running' ? current : null;
    }, 15_000);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      engine.getCapsule(started.capsule.id);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const failedEnvelope = await waitFor(() => {
      const current = engine.getCapsule(started.capsule.id);
      const task = current?.workflow.activeTaskId
        ? current.workflow.tasks.find((entry) => entry.id === current.workflow.activeTaskId) ?? null
        : null;
      return task?.failure?.failureCode === 'preview_failed' ? current : null;
    }, 120_000);

    const task = failedEnvelope.workflow.tasks.find((entry) => entry.id === failedEnvelope.workflow.activeTaskId)!;
    expect(task.currentStage).toBe('failed');
    expect(task.failure?.failureCode).toBe('preview_failed');
    expect(task.failure?.humanSummary.toLowerCase()).toContain('vite build failed');
    expect(failedEnvelope.previewSummary.verified).toBe(false);
  }, 180_000);

  it('rehydrates blocked failure payload and artifacts after persisted reload', async () => {
    const root = createTempDir('sloth-visible-workflow-failure-rehydrate-');
    const remote = createLocalGitRemote({
      'index.html': interactiveSingleFileHtml,
    });
    const firstEngine = createTestEngineFromRoot(root);

    const started = await firstEngine.analyzeProject({
      projectName: 'failure-rehydrate',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    await waitFor(() => {
      const current = firstEngine.getCapsule(started.capsule.id);
      return current?.previewSummary.verified ? current : null;
    }, 60_000);

    const firstPublish = firstEngine.publishRelease(started.capsule.id);
    const confirmationToken = firstPublish?.requiredConfirmation?.token ?? null;
    expect(confirmationToken).toBeTruthy();

    firstEngine.publishRelease(started.capsule.id, confirmationToken);
    const blockedEnvelope = await waitFor(() => {
      const current = firstEngine.getCapsule(started.capsule.id);
      const task = current?.workflow.activeTaskId
        ? current.workflow.tasks.find((entry) => entry.id === current.workflow.activeTaskId) ?? null
        : null;
      return task?.failure ? current : null;
    }, 15_000);

    const blockedTask = blockedEnvelope.workflow.tasks.find((entry) => entry.id === blockedEnvelope.workflow.activeTaskId)!;
    expect(['ssh_missing_credentials', 'ssh_auth_failed']).toContain(blockedTask.failure?.failureCode);
    expect(blockedEnvelope.artifactSummary.entryFile).toBeTruthy();
    expect(blockedEnvelope.artifactSummary.archiveUrl).toBeTruthy();

    const resumed = createTestEngineFromRoot(root).getCapsule(started.capsule.id);
    expect(resumed).toBeTruthy();
    const resumedTask = resumed!.workflow.tasks.find((entry) => entry.id === resumed!.workflow.activeTaskId)!;
    expect(resumed!.workflow.activeTaskId).toBe(blockedEnvelope.workflow.activeTaskId);
    expect(resumedTask.currentStage).toBe(blockedTask.currentStage);
    expect(resumedTask.failure).toEqual(blockedTask.failure);
    expect(resumed!.artifactSummary.entryFile).toBe(blockedEnvelope.artifactSummary.entryFile);
    expect(resumed!.artifactSummary.archiveUrl).toBe(blockedEnvelope.artifactSummary.archiveUrl);
    expect(resumed!.previewSummary.previewUrl).toBe(blockedEnvelope.previewSummary.previewUrl);
  }, 30_000);

  it('blocks publish when SSH readiness is not ready', async () => {
    const remote = createLocalGitRemote({
      'index.html': interactiveSingleFileHtml,
    });
    const engine = createTestEngine();

    const started = await engine.analyzeProject({
      projectName: 'publish-blocked',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    await waitFor(() => {
      const current = engine.getCapsule(started.capsule.id);
      return current?.previewSummary.verified ? current : null;
    });

    const firstPublish = engine.publishRelease(started.capsule.id);
    const confirmationToken = firstPublish?.requiredConfirmation?.token ?? null;
    expect(confirmationToken).toBeTruthy();

    engine.publishRelease(started.capsule.id, confirmationToken);
    const blockedEnvelope = await waitFor(() => {
      const current = engine.getCapsule(started.capsule.id);
      const task = current?.workflow.activeTaskId
        ? current.workflow.tasks.find((entry) => entry.id === current.workflow.activeTaskId) ?? null
        : null;
      return task?.failure ? current : null;
    });

    const task = blockedEnvelope.workflow.tasks.find((entry) => entry.id === blockedEnvelope.workflow.activeTaskId)!;
    expect(['ssh_missing_credentials', 'ssh_auth_failed']).toContain(task.failure?.failureCode);
  }, 15_000);

  it('blocks unsupported stacks instead of pretending they can deploy', async () => {
    const remote = createLocalGitRemote({
      'package.json': JSON.stringify({
        name: 'generic-node-app',
        version: '1.0.0',
        scripts: {
          start: 'node server.js',
        },
      }, null, 2),
      'server.js': 'console.log("generic node");',
    });
    const engine = createTestEngine();

    const envelope = await engine.analyzeProject({
      projectName: 'unsupported-stack',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const task = envelope.workflow.tasks.find((entry) => entry.id === envelope.workflow.activeTaskId)!;
    expect(task.currentStage).toBe('blocked');
    expect(task.failure?.failureCode).toBe('unsupported_stack');
    expect(envelope.techStackSummary.blockReason).toBe('unsupported_stack');
    expect(envelope.deploymentSummary.supported).toBe(false);
  });

  it('marks compose without a reliable recipe as compose_recipe_missing', async () => {
    const remote = createLocalGitRemote({
      'docker-compose.yml': `services:
  web:
    image: nginx:alpine
    ports:
      - "18080:80"
`,
    });
    const engine = createTestEngine();

    const envelope = await engine.analyzeProject({
      projectName: 'compose-missing-recipe',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const task = envelope.workflow.tasks.find((entry) => entry.id === envelope.workflow.activeTaskId)!;
    expect(task.currentStage).toBe('blocked');
    expect(task.failure?.failureCode).toBe('compose_recipe_missing');
    expect(envelope.techStackSummary.blockReason).toBe('compose_recipe_missing');
    expect(envelope.deploymentSummary.supported).toBe(false);
  });

  it('routes Dockerfile outside golden paths into repair flow and recommended recipe can continue execution', async () => {
    const remote = createLocalGitRemote({
      'docker/Dockerfile': `FROM node:20-alpine
WORKDIR /app
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
`,
      'server.js': 'require("http").createServer((_, res) => res.end("ok")).listen(process.env.PORT || 8080);',
    });
    const engine = createTestEngine();

    const blocked = await engine.analyzeProject({
      projectName: 'dockerfile-repair-flow',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const blockedTask = blocked.workflow.tasks.find((entry) => entry.id === blocked.workflow.activeTaskId)!;
    expect(blockedTask.currentStage).toBe('blocked');
    expect(blockedTask.failure?.failureCode).toBe('unsupported_stack');

    const continued = engine.continueActiveTask({
      capsuleId: blocked.capsule.id,
      taskId: blocked.workflow.activeTaskId,
      repair: {
        mode: 'recommended',
        startCommand: 'docker build -f docker/Dockerfile -t repaired-preview . && docker run --rm -p $PORT:8080 repaired-preview',
        port: 8080,
        healthcheckPath: '/health',
        dockerServiceName: null,
      },
    });
    expect(continued).toBeTruthy();
    const continuedTask = continued!.workflow.tasks.find((entry) => entry.id === continued!.workflow.activeTaskId)!;
    expect(continuedTask.currentStage).not.toBe('blocked');
    expect(continued!.latestJob?.kind).toBe('build_repo_preview');
    expect(continued!.artifactSummary.sourceType).toBe('repository');
    expect(continued!.workspaceArtifactLedger.chosenStack.startCommand).toContain('docker build -f docker/Dockerfile');
  }, 15000);

  it('manual repair recipe continues execution instead of stopping at blocked', async () => {
    const remote = createLocalGitRemote({
      'package.json': JSON.stringify({
        name: 'manual-repair-entry',
        version: '1.0.0',
        scripts: {
          start: 'node server.js',
        },
      }, null, 2),
      'server.js': 'require("http").createServer((_, res) => res.end("manual repair ok")).listen(process.env.PORT || 3000);',
    });
    const engine = createTestEngine();

    const blocked = await engine.analyzeProject({
      projectName: 'manual-repair-flow',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const blockedTask = blocked.workflow.tasks.find((entry) => entry.id === blocked.workflow.activeTaskId)!;
    expect(blockedTask.currentStage).toBe('blocked');
    expect(blockedTask.failure?.failureCode).toBe('unsupported_stack');

    const continued = engine.continueActiveTask({
      capsuleId: blocked.capsule.id,
      taskId: blocked.workflow.activeTaskId,
      repair: {
        mode: 'manual',
        startCommand: 'node server.js',
        port: 3000,
        healthcheckPath: '/healthz',
        dockerServiceName: null,
      },
    });
    expect(continued).toBeTruthy();
    const continuedTask = continued!.workflow.tasks.find((entry) => entry.id === continued!.workflow.activeTaskId)!;
    expect(continuedTask.currentStage).not.toBe('blocked');
    expect(continued!.latestJob?.kind).toBe('build_repo_preview');
    expect(continued!.artifactSummary.sourceType).toBe('repository');
    expect(continued!.workspaceArtifactLedger.chosenStack.startCommand).toBe('node server.js');
    expect(continued!.workspaceArtifactLedger.chosenStack.runtimePort).toBe(3000);
  }, 15000);

  it('requires full runtime evidence before preview can become verified', async () => {
    const root = createTempDir('sloth-visible-workflow-evidence-required-');
    const remote = createLocalGitRemote({
      'index.html': interactiveSingleFileHtml,
    });
    const engine = createTestEngineFromRoot(root, {
      previewVerifier: async () => ({
        ok: true,
        reason: null,
        evidence: {
          runtimeLiveAt: '2026-04-21T00:00:00.000Z',
          healthPassedAt: '2026-04-21T00:00:01.000Z',
          smokePassedAt: null,
          screenshotPath: null,
        },
        observedChange: true,
        placeholderLike: false,
      }),
    });

    const started = await engine.analyzeProject({
      projectName: 'evidence-required',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const failedEnvelope = await waitFor(() => {
      const current = engine.getCapsule(started.capsule.id);
      return current?.previewSummary.status === 'failed' ? current : null;
    }, 30_000);

    expect(failedEnvelope.previewSummary.verified).toBe(false);
    expect(failedEnvelope.previewSummary.status).toBe('failed');
    expect(failedEnvelope.previewSummary.evidence.screenshotPath).toBeNull();
    expect(failedEnvelope.previewSummary.evidence.smokePassedAt).toBeNull();
  }, 60_000);

  it('never marks poster-like previews as verified', async () => {
    const root = createTempDir('sloth-visible-workflow-poster-detected-');
    const remote = createLocalGitRemote({
      'index.html': interactiveSingleFileHtml,
    });
    const engine = createTestEngineFromRoot(root, {
      previewVerifier: async () => ({
        ok: false,
        reason: 'preview_static_poster_detected',
        evidence: {
          runtimeLiveAt: '2026-04-21T00:00:00.000Z',
          healthPassedAt: '2026-04-21T00:00:01.000Z',
          smokePassedAt: null,
          screenshotPath: null,
        },
        observedChange: false,
        placeholderLike: true,
      }),
    });

    const started = await engine.analyzeProject({
      projectName: 'poster-rejected',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const failedEnvelope = await waitFor(() => {
      const current = engine.getCapsule(started.capsule.id);
      return current?.previewSummary.status === 'failed' ? current : null;
    }, 30_000);

    expect(failedEnvelope.previewSummary.verified).toBe(false);
    expect(failedEnvelope.previewSummary.lastError).toContain('preview_static_poster_detected');
  }, 60_000);

  it('does not auto-verify a generated preview URL without runtime evidence', async () => {
    const root = createTempDir('sloth-visible-workflow-generated-no-evidence-');
    const engine = createTestEngineFromRoot(root, {
      previewVerifier: async () => ({
        ok: true,
        reason: null,
        evidence: {
          runtimeLiveAt: '2026-04-21T00:00:00.000Z',
          healthPassedAt: '2026-04-21T00:00:01.000Z',
          smokePassedAt: null,
          screenshotPath: null,
        },
        observedChange: true,
        placeholderLike: false,
      }),
    });

    const generated = await engine.generateProject({
      projectName: 'generated-no-evidence',
      idea: 'build a tiny interactive launch page',
      planningMode: 'off',
      userIntent: 'build a tiny interactive launch page',
    });

    expect(generated.previewUrl).toBeTruthy();
    expect(generated.previewSummary.verified).toBe(false);
    expect(generated.previewSummary.status).toBe('failed');
    expect(generated.previewSummary.evidence.screenshotPath).toBeNull();
  });

  it('does not auto-verify generated preview recovery without rerun evidence', async () => {
    const root = createTempDir('sloth-visible-workflow-recovery-evidence-');
    const firstEngine = createTestEngineFromRoot(root);
    const generated = await firstEngine.generateProject({
      projectName: 'recovery-no-evidence',
      idea: 'build a tiny interactive launch page',
      planningMode: 'off',
      userIntent: 'build a tiny interactive launch page',
    });
    patchPersistedCapsule(root, generated.capsule.id, (record) => {
      record.previewSummary = {
        ...(record.previewSummary ?? {}),
        status: 'verified',
        verified: true,
        verifiedAt: '2026-04-21T00:00:03.000Z',
        evidence: {
          runtimeLiveAt: '2026-04-21T00:00:00.000Z',
          healthPassedAt: '2026-04-21T00:00:01.000Z',
          smokePassedAt: '2026-04-21T00:00:02.000Z',
          screenshotPath: join(root, 'seeded-runtime.png'),
        },
      };
      if (record.workflow?.tasks?.length) {
        const activeTaskId = record.workflow.activeTaskId;
        const activeTask = record.workflow.tasks.find((entry: any) => entry?.id === activeTaskId) ?? record.workflow.tasks.at(-1);
        if (activeTask) {
          activeTask.failure = null;
          activeTask.currentStage = 'partial_success';
        }
      }
    });

    const resumedEngine = createTestEngineFromRoot(root, {
      previewVerifier: async () => ({
        ok: true,
        reason: null,
        evidence: {
          runtimeLiveAt: '2026-04-21T00:00:00.000Z',
          healthPassedAt: '2026-04-21T00:00:01.000Z',
          smokePassedAt: null,
          screenshotPath: null,
        },
        observedChange: true,
        placeholderLike: false,
      }),
    });

    const kicked = resumedEngine.deployPreview(generated.capsule.id);
    expect(kicked).toBeTruthy();

    const failedEnvelope = await waitFor(() => {
      const current = resumedEngine.getCapsule(generated.capsule.id);
      return current?.latestJob?.kind === 'deploy_preview' && current.previewSummary.status === 'failed'
        ? current
        : null;
    }, 30_000);

    expect(failedEnvelope.previewSummary.verified).toBe(false);
    expect(failedEnvelope.previewSummary.status).toBe('failed');
    const task = failedEnvelope.workflow.tasks.find((entry) => entry.id === failedEnvelope.workflow.activeTaskId)!;
    expect(task.failure?.failureCode).toBe('preview_failed');
  });

  it('rehydrates preview evidence and downgrades persisted fake verified states without it', async () => {
    const root = createTempDir('sloth-visible-workflow-preview-evidence-rehydrate-');
    const remote = createLocalGitRemote({
      'index.html': interactiveSingleFileHtml,
    });
    const firstEngine = createTestEngineFromRoot(root);

    const started = await firstEngine.analyzeProject({
      projectName: 'preview-evidence-rehydrate',
      repoUrl: remote,
      planningMode: 'off',
      autoStartBuild: true,
      userIntent: `deploy ${remote}`,
    });

    const verifiedEnvelope = await waitFor(() => {
      const current = firstEngine.getCapsule(started.capsule.id);
      return current?.previewSummary.verified ? current : null;
    }, 30_000);

    const resumedVerified = createTestEngineFromRoot(root).getCapsule(started.capsule.id)!;
    expect(resumedVerified.previewSummary.verified).toBe(true);
    expect(resumedVerified.previewSummary.evidence.screenshotPath).toBe(verifiedEnvelope.previewSummary.evidence.screenshotPath);

    patchPersistedCapsule(root, started.capsule.id, (record) => {
      record.previewSummary = {
        ...(record.previewSummary ?? {}),
        status: 'verified',
        verified: true,
        evidence: {
          ...(record.previewSummary?.evidence ?? {}),
          smokePassedAt: null,
          screenshotPath: null,
        },
      };
    });

    const downgraded = createTestEngineFromRoot(root).getCapsule(started.capsule.id)!;
    expect(downgraded.previewSummary.verified).toBe(false);
    expect(downgraded.previewSummary.status).toBe('building');
    expect(downgraded.previewSummary.evidence.screenshotPath).toBeNull();
  });
});
