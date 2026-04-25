import { describe, expect, it } from 'vitest';

import {
  classifyPreviewState,
  matchesProjectFilter,
} from './operator-v4-view-model';
import type { OperatorCapsule, OperatorEnvelope } from './operator-types';

const timestamp = '2026-04-21T10:00:00.000Z';

function makeCapsule(overrides: Partial<OperatorCapsule> = {}): OperatorCapsule {
  return {
    id: 'capsule_preview',
    name: 'Preview Capsule',
    slug: 'preview-capsule',
    entryKind: 'upload-project',
    status: 'planning',
    headline: 'Preview capsule',
    summary: 'summary',
    stackLabel: 'Vite',
    healthScore: 90,
    previewUrl: null,
    productionUrl: null,
    source: {
      repoUrl: 'https://github.com/example/app',
      idea: null,
      serverHost: null,
    },
    connector: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    lastActiveAt: timestamp,
    recentEvents: [],
    truthState: 'planning',
    latestJob: null,
    workflowStage: 'llm_planning',
    ...overrides,
  };
}

function makeEnvelope(
  overrides: Partial<Omit<OperatorEnvelope['previewSummary'], 'evidence'>> & {
    evidence?: Partial<OperatorEnvelope['previewSummary']['evidence']>;
  } = {},
  previewUrl?: string | null,
): OperatorEnvelope {
  const {
    evidence: overrideEvidence,
    ...previewOverrides
  } = overrides;
  const evidence = {
    runtimeLiveAt: null,
    healthPassedAt: null,
    smokePassedAt: null,
    screenshotPath: null,
    ...(overrideEvidence ?? {}),
  };

  return {
    capsule: makeCapsule({ previewUrl: previewUrl ?? null }),
    previewUrl: previewUrl ?? null,
    previewSummary: {
      status: 'building',
      verified: false,
      previewUrl: previewUrl ?? null,
      entryFile: 'src/main.tsx',
      assetCount: 2,
      verifiedAt: null,
      lastError: null,
      ...previewOverrides,
      evidence,
    },
    workspaceArtifactLedger: {
      lastUpdatedAt: timestamp,
      latestUserIntent: 'deploy preview',
      latestArtifact: {
        sourceType: 'repository',
        sourceRef: 'https://github.com/example/app',
        archiveUrl: 'artifact://build.zip',
        manifestUrl: 'artifact://manifest.json',
        archiveName: 'preview-build.zip',
        fileCount: 24,
      },
      chosenStack: {
        kind: 'vite',
        label: 'Vite React',
        detectionSource: 'package.json',
        installCommand: 'pnpm install',
        buildCommand: 'pnpm build',
        startCommand: 'pnpm preview',
        runtimePort: 4173,
        healthcheckPath: '/health',
        dockerfilePath: null,
        composeFilePath: null,
        composeServiceName: null,
      },
      runnableEntry: {
        entryFile: 'src/main.tsx',
        installCommand: 'pnpm install',
        buildCommand: 'pnpm build',
        runCommands: ['pnpm build'],
      },
      previewTarget: {
        kind: 'preview',
        url: previewUrl ?? null,
        verified: false,
        verifiedAt: null,
        lastError: null,
      },
      deployReadiness: {
        sshStatus: 'ready',
        envStatus: 'ready',
        ready: true,
        summary: 'Ready',
      },
      gaps: [],
    },
  } as unknown as OperatorEnvelope;
}

describe('operator-v4 preview classification', () => {
  it('classifies draft preview when runtime evidence is not live yet', () => {
    const preview = classifyPreviewState(makeEnvelope({}, 'http://127.0.0.1:4173'), 'zh-CN');
    expect(preview.level).toBe('draft_preview');
  });

  it('classifies live preview when runtime is reachable but evidence is incomplete', () => {
    const preview = classifyPreviewState(makeEnvelope({
      evidence: {
        runtimeLiveAt: timestamp,
      },
    }, 'http://127.0.0.1:4173'), 'zh-CN');
    expect(preview.level).toBe('live_preview');
  });

  it('classifies verified preview only when runtime, health, smoke, and screenshot all pass', () => {
    const preview = classifyPreviewState(makeEnvelope({
      status: 'verified',
      verified: true,
      verifiedAt: timestamp,
      evidence: {
        runtimeLiveAt: timestamp,
        healthPassedAt: timestamp,
        smokePassedAt: timestamp,
        screenshotPath: '/tmp/preview.png',
      },
    }, 'http://127.0.0.1:4173'), 'zh-CN');
    expect(preview.level).toBe('verified_preview');
  });
});

describe('operator-v4 project filters', () => {
  it('keeps archived projects out of the default all filter', () => {
    expect(matchesProjectFilter(makeCapsule({ archivedAt: timestamp }), 'all')).toBe(false);
    expect(matchesProjectFilter(makeCapsule({ archivedAt: timestamp }), 'archived')).toBe(true);
  });
});
