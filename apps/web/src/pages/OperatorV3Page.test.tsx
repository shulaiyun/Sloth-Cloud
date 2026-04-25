import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OperatorV3Page } from './OperatorV3Page';
import type { OperatorCapsuleListResponse, OperatorResponse } from '../lib/operator-types';
import type {
  AssistantMessagesResponse,
  AssistantSessionResponse,
} from '../lib/types';

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
    locale: 'zh-CN',
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
      id: 'capsule_recent',
      name: 'Recent Workspace',
      slug: 'recent-workspace',
      entryKind: 'generate-from-idea',
      status: 'planning',
      headline: 'Recent',
      summary: 'recent summary',
      stackLabel: 'Canvas',
      healthScore: 70,
      previewUrl: null,
      productionUrl: null,
      source: {
        repoUrl: null,
        idea: 'idea',
        serverHost: null,
      },
      connector: null,
      createdAt: timestamp,
      updatedAt: '2026-04-21T12:00:00.000Z',
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
      status: 'planning',
      headline: 'Active',
      summary: 'active summary',
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
      updatedAt: '2026-04-21T13:00:00.000Z',
      recentEvents: [],
      truthState: 'job_running',
      latestJob: null,
      workflowStage: 'queued',
    },
  ],
} as const satisfies OperatorCapsuleListResponse;

function createWorkspaceResponse(overrides: Record<string, unknown> = {}) {
  return {
    message: 'ok',
    meta,
    data: {
      capsule: workspacesResponse.data[1],
      plan: {
        id: 'plan_1',
        title: 'Deploy preview',
        summary: 'Deploy preview',
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
      healthScore: 90,
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
        progress: 55,
        summary: 'running',
        updatedAt: timestamp,
        completedAt: null,
        error: null,
      },
      jobs: [],
      workspaceArtifactLedger: {
        lastUpdatedAt: timestamp,
        latestUserIntent: 'continue deploy',
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
        assetCount: 2,
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
        headline: 'running',
        detail: 'The operator is continuing the current workspace.',
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
              messages: [
                {
                  id: 'assistant_initial',
                  role: 'assistant',
                  content: '我会沿用当前工作区继续处理。',
                  createdAt: timestamp,
                },
              ],
              lastUpdatedAt: timestamp,
            },
            draft: '',
            userIntent: 'Deploy repo',
            parsedInput: {
              kind: 'repo',
              rawInput: 'Deploy repo',
              repoUrl: 'https://github.com/example/app',
              notes: null,
              idea: null,
              serverHost: null,
              planningMode: 'off',
              confidence: 0.9,
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
    },
  } as const satisfies OperatorResponse;
}

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
        locale: 'zh-CN',
        capsuleId: 'capsule_active',
      },
      messages: [],
    },
    authenticated: true,
    user: null,
    capabilities: {},
    quota: {},
    upgradeCta: null,
  },
} as unknown as AssistantSessionResponse;

const assistantMessageResponse = {
  message: 'ok',
  data: {
    session: {
      ...assistantSessionResponse.data.session,
      messages: [
        {
          id: 'user_sent',
          role: 'user',
          content: '继续部署这个仓库',
          createdAt: timestamp,
        },
        {
          id: 'assistant_reply',
          role: 'assistant',
          content: '好的，我会继续检查仓库并推进。',
          createdAt: timestamp,
        },
      ],
    },
    authenticated: true,
    reply: {
      id: 'assistant_reply',
      role: 'assistant',
      content: '好的，我会继续检查仓库并推进。',
      createdAt: timestamp,
    },
    runState: 'running',
    source: 'system',
    proposals: [],
    pendingConfirmation: null,
    actionResult: null,
    workflow: null,
    workspace: null,
    quota: {},
    upgradeCta: null,
    chargedTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    resolvedModelId: 'mock-model',
  },
} as unknown as AssistantMessagesResponse;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

function renderPage(initialEntries: string[] = ['/operator/capsule_active']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationProbe />
      <Routes>
        <Route element={<OperatorV3Page />} path="/operator" />
        <Route element={<OperatorV3Page />} path="/operator/:capsuleId" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OperatorV3Page', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    apiMocks.useApiData.mockImplementation((path: string | null) => {
      if (!path) {
        return { data: null, error: null, loading: false };
      }

      if (path.startsWith('/api/v1/operator/workspaces?')) {
        return { data: workspacesResponse, error: null, loading: false };
      }

      if (path.startsWith('/api/v1/operator/workspaces/capsule_active?')) {
        return { data: createWorkspaceResponse(), error: null, loading: false };
      }

      if (path.startsWith('/api/v1/operator/workspaces/capsule_recent?')) {
        return { data: createWorkspaceResponse({ capsule: workspacesResponse.data[0] }), error: null, loading: false };
      }

      return { data: null, error: null, loading: false };
    });

    apiMocks.requestJson.mockImplementation(async (path: string) => {
      if (path === '/api/v1/assistant/session') {
        return assistantSessionResponse;
      }
      if (path === '/api/v1/assistant/messages') {
        return assistantMessageResponse;
      }
      if (path === '/api/v1/operator/workspaces/capsule_active/continue') {
        return createWorkspaceResponse();
      }
      return createWorkspaceResponse();
    });
  });

  it('auto-restores the recent workspace when landing on /operator', async () => {
    window.localStorage.setItem('operator-v3:recent-workspace', 'capsule_recent');
    renderPage(['/operator']);

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/operator/capsule_recent');
    });
  });

  it('shows an empty state when no workspace exists', async () => {
    apiMocks.useApiData.mockImplementation((path: string | null) => {
      if (path?.startsWith('/api/v1/operator/workspaces?')) {
        return {
          data: { ...workspacesResponse, data: [] },
          error: null,
          loading: false,
        };
      }
      return { data: null, error: null, loading: false };
    });

    renderPage(['/operator']);

    expect(await screen.findByTestId('operator-v3-empty')).toHaveTextContent('从一句需求开始');
  });

  it('toggles the details drawer and keeps debug fields hidden by default', async () => {
    renderPage();

    await screen.findByTestId('operator-v3-artifact-bar');
    expect(screen.queryByTestId('details-run_state')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('operator-v3-details-toggle'));
    expect(await screen.findByTestId('details-run_state')).toHaveTextContent('running');
    expect(screen.getByTestId('details-task_id')).toHaveTextContent('task_active');
  });

  it('persists the draft across remounts', async () => {
    const view = renderPage();
    const input = await screen.findByTestId('operator-v3-composer-input');

    fireEvent.change(input, { target: { value: '继续帮我部署出来可以玩的' } });
    expect(screen.getByDisplayValue('继续帮我部署出来可以玩的')).toBeInTheDocument();

    view.unmount();
    renderPage();

    expect(await screen.findByDisplayValue('继续帮我部署出来可以玩的')).toBeInTheDocument();
  });

  it('shows optimistic user/system bubbles immediately after send', async () => {
    let resolveMessage: ((value: AssistantMessagesResponse) => void) | undefined;
    apiMocks.requestJson.mockImplementation((path: string) => {
      if (path === '/api/v1/assistant/session') {
        return Promise.resolve(assistantSessionResponse);
      }
      if (path === '/api/v1/assistant/messages') {
        return new Promise((resolve) => {
          resolveMessage = resolve as (value: AssistantMessagesResponse) => void;
        });
      }
      return Promise.resolve(createWorkspaceResponse());
    });

    renderPage();
    const input = await screen.findByTestId('operator-v3-composer-input');
    fireEvent.change(input, { target: { value: '请部署这个仓库 https://github.com/example/app' } });
    fireEvent.click(screen.getByText('发送'));

    expect(await screen.findByText('请部署这个仓库 https://github.com/example/app')).toBeInTheDocument();
    expect(screen.getByText('我收到并开始检查仓库。')).toBeInTheDocument();

    if (typeof resolveMessage === 'function') {
      resolveMessage(assistantMessageResponse);
    }
    await waitFor(() => {
      expect(screen.getByText('好的，我会继续检查仓库并推进。')).toBeInTheDocument();
    });
  });

  it('continues the same workspace artifact into deploy_playable', async () => {
    apiMocks.useApiData.mockImplementation((path: string | null) => {
      if (!path) {
        return { data: null, error: null, loading: false };
      }
      if (path.startsWith('/api/v1/operator/workspaces?')) {
        return { data: workspacesResponse, error: null, loading: false };
      }
      if (path.startsWith('/api/v1/operator/workspaces/capsule_active?')) {
        return {
          data: createWorkspaceResponse({
            previewSummary: {
              status: 'verified',
              verified: true,
              previewUrl: 'http://127.0.0.1:4173',
              entryFile: 'src/main.tsx',
              assetCount: 2,
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
              ...createWorkspaceResponse().data.workspaceArtifactLedger,
              previewTarget: {
                kind: 'preview',
                url: 'http://127.0.0.1:4173',
                verified: true,
                verifiedAt: timestamp,
                lastError: null,
              },
            },
            workflow: {
              ...createWorkspaceResponse().data.workflow,
              tasks: [
                {
                  ...createWorkspaceResponse().data.workflow.tasks[0],
                  currentStage: 'success',
                },
              ],
            },
          }),
          error: null,
          loading: false,
        };
      }
      return { data: null, error: null, loading: false };
    });

    renderPage();
    const artifactBar = await screen.findByTestId('operator-v3-artifact-bar');
    const deployButton = within(artifactBar).getByText('继续部署出来可以玩的');
    fireEvent.click(deployButton);

    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalledWith(
        '/api/v1/operator/workspaces/capsule_active/continue',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            operation: 'deploy_playable',
          }),
        }),
      );
    });
  });
});
