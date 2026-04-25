import { describe, expect, it } from 'vitest';

import {
  buildOperatorV3OptimisticAck,
  buildOperatorV3ViewModel,
  hasVerifiedPreviewEvidence,
} from './operator-v3-view-model';
import type { OperatorEnvelope } from './operator-types';

const timestamp = '2026-04-21T10:00:00.000Z';

function createEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    capsule: {
      id: 'capsule_active',
      name: 'Playable Workspace',
      slug: 'playable-workspace',
      entryKind: 'upload-project',
      status: 'planning',
      headline: 'Playable Workspace',
      summary: 'summary',
      stackLabel: 'Vite',
      healthScore: 88,
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
      recentEvents: [],
      truthState: 'planning',
      latestJob: null,
      workflowStage: 'queued',
    },
    plan: {
      id: 'plan_1',
      title: 'Plan',
      summary: 'plan summary',
      risk: 'medium',
      estimatedMinutes: 10,
      estimatedMonthlyCost: '$0',
      assumptions: [],
      confirmations: [],
      steps: [],
    },
    risk: 'medium',
    requiredConfirmation: null,
    previewUrl: null,
    productionUrl: null,
    healthScore: 88,
    infraSummary: {
      runtime: 'node',
      region: 'local',
      estimatedMonthlyCost: '$0',
      endpoint: null,
      productionEndpoint: null,
      items: [],
    },
    logsSummary: {
      headline: 'Logs',
      entries: [],
    },
    generatedProject: null,
    truthState: 'job_running',
    latestJob: {
      id: 'job_1',
      kind: 'deploy_preview',
      title: 'Deploy preview',
      status: 'running',
      progress: 54,
      summary: 'running',
      updatedAt: timestamp,
      completedAt: null,
      error: null,
    },
    jobs: [],
    workspaceArtifactLedger: {
      lastUpdatedAt: timestamp,
      latestUserIntent: 'continue deployment',
      latestArtifact: {
        sourceType: 'repository',
        sourceRef: 'https://github.com/example/app',
        archiveUrl: 'artifact://preview-build',
        manifestUrl: 'artifact://manifest',
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
        runCommands: ['pnpm install', 'pnpm build'],
      },
      previewTarget: {
        kind: 'preview',
        url: 'http://127.0.0.1:4173',
        verified: false,
        verifiedAt: null,
        lastError: null,
      },
      deployReadiness: {
        sshStatus: 'ready',
        envStatus: 'ready',
        ready: true,
        summary: 'Ready for deployment.',
      },
      gaps: [],
    },
    artifactSummary: {
      sourceType: 'repository',
      sourceRef: 'https://github.com/example/app',
      archiveUrl: 'artifact://preview-build',
      manifestUrl: 'artifact://manifest',
      entryFile: 'src/main.tsx',
      runCommands: ['pnpm install', 'pnpm build'],
      fileCount: 24,
      installCommand: 'pnpm install',
      buildCommand: 'pnpm build',
    },
    previewSummary: {
      status: 'building',
      verified: false,
      previewUrl: 'http://127.0.0.1:4173',
      entryFile: 'src/main.tsx',
      assetCount: 4,
      verifiedAt: null,
      lastError: null,
      evidence: {
        runtimeLiveAt: null,
        healthPassedAt: null,
        smokePassedAt: null,
        screenshotPath: null,
      },
    },
    auditSummary: {
      status: 'pending',
      host: null,
      port: null,
      username: null,
      collectedAt: null,
      os: null,
      kernel: null,
      cpu: null,
      memory: null,
      disk: null,
      docker: null,
      compose: null,
      webServers: [],
      openPorts: [],
      domains: [],
      processes: [],
      risks: [],
      lastError: null,
    },
    diagnosticsSummary: {
      stage: 'execution',
      headline: 'Running',
      detail: 'The operator is executing the preview flow.',
      command: null,
      lastError: null,
    },
    techStackSummary: {
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
      goldenPath: 'vite-react',
      recipeReliable: true,
      blockReason: null,
      notes: [],
    },
    envChecklistSummary: {
      status: 'ready',
      headline: 'Ready',
      detail: 'ready',
      missingRequiredCount: 0,
      items: [],
    },
    credentialReadiness: {
      status: 'ready',
      headline: 'SSH ready',
      detail: 'SSH ready',
      nextAction: 'Continue deployment',
      checkedAt: timestamp,
      source: 'preflight',
    },
    deploymentSummary: {
      targetLabel: 'Server #19',
      targetRef: '#19',
      previewOnly: true,
      supported: true,
      successCriteria: [],
      rollbackPlan: [],
      pipeline: [],
    },
    nextActions: [],
    workflow: {
      planningMode: 'off',
      activeTaskId: 'task_active',
      tasks: [
        {
          id: 'task_active',
          title: 'Deploy preview',
          planningMode: 'off',
          thread: {
            sessionId: 'session_1',
            messages: [],
            lastUpdatedAt: timestamp,
          },
          draft: '',
          userIntent: 'deploy this repo',
          parsedInput: {
            kind: 'repo',
            rawInput: 'deploy this repo',
            repoUrl: 'https://github.com/example/app',
            notes: null,
            idea: null,
            serverHost: null,
            planningMode: 'off',
            confidence: 0.98,
          },
          currentStage: 'queued',
          timeline: [
            {
              id: 'card_execution',
              kind: 'execution',
              stage: 'queued',
              title: 'Queue executor',
              summary: 'The executor queued the preview task.',
              evidence: [],
              nextStep: 'Wait for runtime',
              source: 'executor',
              createdAt: timestamp,
              failureCode: null,
            },
          ],
          evidence: [],
          diagnostics: [],
          artifacts: [],
          deployReadiness: {
            sshStatus: 'ready',
            envStatus: 'ready',
            ready: true,
            summary: 'Ready for deployment.',
          },
          publishHistory: [],
          failure: null,
          pendingConfirmation: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    },
    ...overrides,
  } as unknown as OperatorEnvelope;
}

describe('operator-v3 view model', () => {
  it('maps workflow stages into the fixed five-step progress rail', () => {
    const viewModel = buildOperatorV3ViewModel({
      envelope: createEnvelope(),
      workspaces: [],
      selectedWorkspaceId: 'capsule_active',
      locale: 'zh-CN',
    });

    expect(viewModel.progress.currentStepLabel).toBe('执行任务');
    expect(viewModel.progress.steps.map((step) => step.status)).toEqual([
      'complete',
      'complete',
      'complete',
      'current',
      'upcoming',
    ]);
  });

  it('keeps artifact continuation tied to the workspace artifact ledger', () => {
    const verifiedEnvelope = createEnvelope({
      previewSummary: {
        status: 'verified',
        verified: true,
        previewUrl: 'http://127.0.0.1:4173',
        entryFile: 'src/main.tsx',
        assetCount: 4,
        verifiedAt: timestamp,
        lastError: null,
        evidence: {
          runtimeLiveAt: timestamp,
          healthPassedAt: timestamp,
          smokePassedAt: timestamp,
          screenshotPath: '/tmp/preview.png',
        },
      },
      workspaceArtifactLedger: {
        ...createEnvelope().workspaceArtifactLedger,
        previewTarget: {
          kind: 'preview',
          url: 'http://127.0.0.1:4173',
          verified: true,
          verifiedAt: timestamp,
          lastError: null,
        },
      },
      workflow: {
        ...createEnvelope().workflow,
        tasks: [
          {
            ...createEnvelope().workflow.tasks[0],
            currentStage: 'success',
          },
        ],
      },
    });
    const viewModel = buildOperatorV3ViewModel({
      envelope: verifiedEnvelope,
      workspaces: [],
      selectedWorkspaceId: 'capsule_active',
      locale: 'zh-CN',
    });

    expect(viewModel.artifact?.title).toBe('preview-build.zip');
    expect(viewModel.artifact?.entryFile).toBe('src/main.tsx');
    expect(viewModel.artifact?.mainAction?.label).toBe('继续部署出来可以玩的');
  });

  it('maps failure codes into fixed human CTAs', () => {
    const failureEnvelope = createEnvelope({
      workflow: {
        ...createEnvelope().workflow,
        tasks: [
          {
            ...createEnvelope().workflow.tasks[0],
            currentStage: 'failed',
            failure: {
              failureCode: 'compose_recipe_missing',
              humanSummary: 'Missing compose service mapping.',
              probableRootCause: 'Main service name is missing.',
              recommendedActions: ['补充 Docker 服务信息'],
              evidence: [],
              detectedAt: timestamp,
              stage: 'failed',
            },
          },
        ],
      },
    });
    const viewModel = buildOperatorV3ViewModel({
      envelope: failureEnvelope,
      workspaces: [],
      selectedWorkspaceId: 'capsule_active',
      locale: 'zh-CN',
    });

    expect(viewModel.failure?.mainAction?.label).toBe('补充 Docker 服务信息');
    expect(viewModel.failure?.why).toContain('Main service name is missing.');
  });

  it('keeps verified gated on complete live evidence', () => {
    const preview = {
      status: 'verified',
      verified: true,
      previewUrl: 'http://127.0.0.1:4173',
      entryFile: 'src/main.tsx',
      assetCount: 4,
      verifiedAt: timestamp,
      lastError: null,
      evidence: {
        runtimeLiveAt: timestamp,
        healthPassedAt: timestamp,
        smokePassedAt: timestamp,
        screenshotPath: null,
      },
    } as const;

    expect(hasVerifiedPreviewEvidence(preview)).toBe(false);
    const viewModel = buildOperatorV3ViewModel({
      envelope: createEnvelope({
        previewSummary: preview,
        latestJob: {
          ...createEnvelope().latestJob,
          status: 'completed',
        },
        workflow: {
          ...createEnvelope().workflow,
          tasks: [
            {
              ...createEnvelope().workflow.tasks[0],
              currentStage: 'success',
            },
          ],
        },
      }),
      workspaces: [],
      selectedWorkspaceId: 'capsule_active',
      locale: 'zh-CN',
    });

    expect(viewModel.artifact?.verified).toBe(false);
    expect(viewModel.artifact?.statusLabel).toBe('待验证');
  });

  it('produces deterministic optimistic acknowledgements', () => {
    expect(buildOperatorV3OptimisticAck({
      message: '请部署这个仓库 https://github.com/example/app',
      locale: 'zh-CN',
      hasArtifact: false,
    })).toBe('我收到并开始检查仓库。');

    expect(buildOperatorV3OptimisticAck({
      message: '继续部署出来可以玩的',
      locale: 'zh-CN',
      hasArtifact: true,
    })).toBe('我收到并开始规划部署。');
  });
});
