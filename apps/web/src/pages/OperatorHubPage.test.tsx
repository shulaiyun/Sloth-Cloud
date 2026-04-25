import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OperatorHubPage } from './OperatorHubPage';
import type { OperatorCapsuleListResponse, OperatorResponse } from '../lib/operator-types';
import type { AssistantSessionResponse } from '../lib/types';

const apiMocks = vi.hoisted(() => ({
  requestJson: vi.fn(),
  useApiData: vi.fn(),
}));

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ...actual,
    requestJson: apiMocks.requestJson,
    useApiData: apiMocks.useApiData,
  };
});

vi.mock('../lib/auth-context', () => ({
  useAuth: () => ({
    isAuthenticated: true,
  }),
}));

vi.mock('../lib/site-context', () => ({
  useSite: () => ({
    locale: 'en-US',
    text: {
      common: {
        loading: 'Loading',
        error: 'Error',
      },
    },
  }),
}));

const timestamp = '2026-04-21T10:00:00.000Z';
const meta = {
  generatedAt: timestamp,
  sourceMode: 'mock',
} as const;

const workspacesResponse = {
  message: 'ok',
  meta,
  data: [
    {
      id: 'capsule_idle',
      name: 'Idle Workspace',
      slug: 'idle-workspace',
      entryKind: 'generate-from-idea',
      status: 'planning',
      headline: 'Idle',
      summary: 'Idle summary',
      stackLabel: 'Vite',
      healthScore: 72,
      previewUrl: null,
      productionUrl: null,
      source: {
        repoUrl: null,
        idea: 'An idle idea',
        serverHost: null,
      },
      connector: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      recentEvents: [],
      truthState: 'planning',
      latestJob: null,
      workflowStage: 'llm_planning',
    },
    {
      id: 'capsule_active',
      name: 'Active Workspace',
      slug: 'active-workspace',
      entryKind: 'upload-project',
      status: 'needs_attention',
      headline: 'Active',
      summary: 'Active summary',
      stackLabel: 'Vite',
      healthScore: 54,
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
      truthState: 'preview_failed',
      latestJob: {
        id: 'job_preview_1',
        kind: 'deploy_preview',
        title: 'Deploy preview',
        status: 'running',
        progress: 62,
        summary: 'Preview deploy running',
        updatedAt: timestamp,
        completedAt: null,
        error: null,
      },
      workflowStage: 'verifying',
    },
  ],
} as const satisfies OperatorCapsuleListResponse;

const workspaceResponse = {
  message: 'ok',
  meta,
  data: {
    capsule: workspacesResponse.data[1],
    plan: {
      id: 'plan_1',
      title: 'Build preview',
      summary: 'Preview deploy plan',
      risk: 'medium',
      estimatedMinutes: 8,
      estimatedMonthlyCost: '$0',
      assumptions: [],
      confirmations: [],
      steps: [],
    },
    risk: 'medium',
    requiredConfirmation: null,
    previewUrl: null,
    productionUrl: null,
    healthScore: 54,
    infraSummary: {
      runtime: 'node',
      region: 'local',
      estimatedMonthlyCost: '$0',
      endpoint: null,
      productionEndpoint: null,
      items: [],
    },
    logsSummary: {
      headline: 'Preview logs',
      entries: [],
    },
    generatedProject: null,
    truthState: 'preview_failed',
    latestJob: {
      id: 'job_preview_1',
      kind: 'deploy_preview',
      title: 'Deploy preview',
      status: 'running',
      progress: 62,
      summary: 'Preview deploy running',
      updatedAt: timestamp,
      completedAt: null,
      error: null,
    },
    jobs: [],
    workspaceArtifactLedger: {
      lastUpdatedAt: timestamp,
      latestUserIntent: 'Deploy the repo',
      latestArtifact: {
        sourceType: 'repository',
        sourceRef: 'https://github.com/example/app',
        archiveUrl: null,
        manifestUrl: 'artifact://manifest',
        archiveName: null,
        fileCount: 24,
      },
      chosenStack: {
        kind: 'vite',
        label: 'Vite',
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
        url: null,
        verified: false,
        verifiedAt: null,
        lastError: 'pnpm build failed',
      },
      deployReadiness: {
        sshStatus: 'ready',
        envStatus: 'pending',
        ready: false,
        summary: 'Needs env values',
      },
      gaps: ['missing_preview_target', 'readiness_blocked'],
    },
    artifactSummary: {
      sourceType: 'repository',
      sourceRef: 'https://github.com/example/app',
      archiveUrl: null,
      manifestUrl: 'artifact://manifest',
      entryFile: 'src/main.tsx',
      runCommands: ['pnpm install', 'pnpm build'],
      fileCount: 24,
      installCommand: 'pnpm install',
      buildCommand: 'pnpm build',
    },
    previewSummary: {
      status: 'failed',
      verified: false,
      previewUrl: null,
      entryFile: 'src/main.tsx',
      assetCount: 0,
      verifiedAt: null,
      lastError: 'pnpm build failed',
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
      stage: 'verification',
      headline: 'Preview failed',
      detail: 'Build output missing',
      command: null,
      lastError: 'pnpm build failed',
    },
    techStackSummary: {
      kind: 'vite',
      label: 'Vite',
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
      status: 'pending',
      headline: 'Pending',
      detail: 'Pending',
      missingRequiredCount: 0,
      items: [],
    },
    credentialReadiness: {
      status: 'ready',
      headline: 'SSH ready',
      detail: 'SSH credentials are ready.',
      nextAction: 'Continue deployment',
      checkedAt: timestamp,
      source: 'preflight',
    },
    deploymentSummary: {
      targetLabel: 'Server #19',
      targetRef: '#19',
      previewOnly: true,
      supported: false,
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
          id: 'task_old',
          title: 'Earlier task',
          planningMode: 'off',
          thread: {
            sessionId: 'session_old',
            messages: [],
            lastUpdatedAt: timestamp,
          },
          draft: '',
          userIntent: 'old intent',
          parsedInput: {
            kind: 'repo',
            rawInput: 'old input',
            repoUrl: 'https://github.com/example/old',
            notes: null,
            idea: null,
            serverHost: null,
            planningMode: 'off',
            confidence: 0.4,
          },
          currentStage: 'llm_planning',
          timeline: [
            {
              id: 'card-old-plan',
              kind: 'plan',
              stage: 'llm_planning',
              title: 'Old plan',
              summary: 'Old plan summary',
              evidence: [],
              nextStep: 'Old next step',
              source: 'llm',
              createdAt: timestamp,
              failureCode: null,
            },
          ],
          evidence: [],
          diagnostics: [],
          artifacts: [],
          deployReadiness: {
            sshStatus: null,
            envStatus: null,
            ready: false,
            summary: 'pending',
          },
          publishHistory: [],
          failure: null,
          pendingConfirmation: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: 'task_active',
          title: 'Preview verification',
          planningMode: 'off',
          thread: {
            sessionId: 'session_active',
            messages: [],
            lastUpdatedAt: timestamp,
          },
          draft: '',
          userIntent: 'Deploy the repo',
          parsedInput: {
            kind: 'repo',
            rawInput: 'https://github.com/example/app',
            repoUrl: 'https://github.com/example/app',
            notes: null,
            idea: null,
            serverHost: null,
            planningMode: 'off',
            confidence: 0.97,
          },
          currentStage: 'verifying',
          timeline: [
            {
              id: 'card-understanding-1',
              kind: 'understanding',
              stage: 'parsing',
              title: 'Understanding the goal',
              summary: 'The operator understood the repo deploy request.',
              evidence: [
                {
                  id: 'evidence-understanding-1',
                  label: 'repo_url',
                  detail: 'https://github.com/example/app',
                  source: 'llm',
                },
              ],
              nextStep: 'Run repo preflight',
              source: 'llm',
              createdAt: timestamp,
              failureCode: null,
            },
            {
              id: 'card-verification-2',
              kind: 'verification',
              stage: 'verifying',
              title: 'Verify preview build',
              summary: 'The operator is checking preview readiness.',
              evidence: [],
              nextStep: null,
              source: 'executor',
              createdAt: timestamp,
              failureCode: 'preview_failed',
            },
          ],
          evidence: [],
          diagnostics: ['pnpm build failed'],
          artifacts: [
            {
              id: 'artifact_preview_1',
              label: 'Preview artifact',
              detail: 'artifact://preview-build',
              url: null,
            },
          ],
          deployReadiness: {
            sshStatus: 'ready',
            envStatus: 'pending',
            ready: false,
            summary: 'Needs env values',
          },
          publishHistory: [],
          failure: {
            failureCode: 'preview_failed',
            humanSummary: 'Preview build failed on pnpm build.',
            probableRootCause: 'Build output missing',
            recommendedActions: ['retry preview', 'inspect build logs'],
            evidence: [
              {
                id: 'failure-evidence-1',
                label: 'build_log',
                detail: 'Missing dist/index.html',
                source: 'executor',
              },
            ],
            detectedAt: timestamp,
            stage: 'failed',
          },
          pendingConfirmation: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    },
  },
} as const satisfies OperatorResponse;

const assistantSessionResponse = {
  message: 'ok',
  data: {
    session: {
      sessionId: 'session_ui_test',
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: '2026-04-22T10:00:00.000Z',
      context: {
        path: '/operator/capsule_active',
        locale: 'en-US',
        capsuleId: 'capsule_active',
      },
      messages: [
        {
          id: 'assistant_legacy_message',
          role: 'assistant',
          content: 'Legacy assistant message',
          createdAt: timestamp,
        },
      ],
    },
    authenticated: true,
    user: null,
    capabilities: {},
    quota: {},
    upgradeCta: null,
  },
} as unknown as AssistantSessionResponse;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/operator/capsule_active']}>
      <Routes>
        <Route element={<OperatorHubPage />} path="/operator/:capsuleId" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OperatorHubPage', () => {
  beforeEach(() => {
    apiMocks.useApiData.mockImplementation((path: string | null) => {
      if (!path) {
        return { data: null, error: null, loading: false };
      }

      if (path.startsWith('/api/v1/operator/workspaces?')) {
        return { data: workspacesResponse, error: null, loading: false };
      }

      if (path.startsWith('/api/v1/operator/workspaces/capsule_active?')) {
        return { data: workspaceResponse, error: null, loading: false };
      }

      return { data: null, error: null, loading: false };
    });

    apiMocks.requestJson.mockResolvedValue(assistantSessionResponse);
  });

  it('rerender does not duplicate cards', async () => {
    const view = renderPage();

    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalled();
    });

    await screen.findByTestId('timeline-card-card-understanding-1');
    expect(view.container.querySelectorAll('[data-testid^="timeline-card-"]')).toHaveLength(2);
    expect(screen.getByText('card-understanding-1')).toBeInTheDocument();
    expect(screen.getByText('card-verification-2')).toBeInTheDocument();
    expect(screen.queryByText('Start from intent, then move into real execution')).not.toBeInTheDocument();
    expect(screen.queryByText('Repo import')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy assistant message')).not.toBeInTheDocument();

    view.rerender(
      <MemoryRouter initialEntries={['/operator/capsule_active']}>
        <Routes>
          <Route element={<OperatorHubPage />} path="/operator/:capsuleId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(view.container.querySelectorAll('[data-testid^="timeline-card-"]')).toHaveLength(2);
  });

  it('current stage is visible', async () => {
    renderPage();

    await screen.findByTestId('truth-current_stage');
    expect(screen.getByText('current_stage')).toBeVisible();
    expect(screen.getByTestId('truth-current_stage')).toHaveTextContent('verifying');
  });

  it('right panel reflects active task truth', async () => {
    renderPage();

    await screen.findByTestId('truth-actions');
    expect(screen.getByTestId('truth-current_stage')).toHaveTextContent('verifying');
    expect(screen.getByTestId('truth-run_state')).toHaveTextContent('running');
    expect(screen.getByTestId('truth-active_task_id')).toHaveTextContent('task_active');
    expect(screen.getByTestId('truth-latest_artifact')).toHaveTextContent('artifact://preview-build');
    expect(screen.getByTestId('truth-failure_code')).toHaveTextContent('preview_failed');
    expect(screen.getByTestId('truth-human_summary')).toHaveTextContent('Preview build failed on pnpm build.');
    expect(screen.getByTestId('truth-probable_root_cause')).toHaveTextContent('Build output missing');
    expect(screen.getByTestId('truth-actions')).toHaveTextContent('retry preview');
    expect(screen.getByTestId('truth-actions')).toHaveTextContent('inspect build logs');
  });
});
