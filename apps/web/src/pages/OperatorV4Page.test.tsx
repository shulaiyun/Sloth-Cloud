import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OperatorV4Page } from './OperatorV4Page';
import type { OperatorCapsuleListResponse, OperatorResponse } from '../lib/operator-types';
import type {
  AssistantCapabilitiesResponse,
  AssistantMessagesResponse,
  AssistantProviderStatusResponse,
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

let currentSessionResponse: AssistantSessionResponse;
let currentCapabilitiesResponse: AssistantCapabilitiesResponse;
let currentProviderStatusResponse: AssistantProviderStatusResponse;
let currentWorkspaceResponse: OperatorResponse;
let workspaceResponseQueue: OperatorResponse[];

const workspacesResponse = {
  message: 'ok',
  meta,
  data: [
    {
      id: 'capsule_internal',
      name: 'failed-preview-workflow',
      slug: 'failed-preview-workflow',
      entryKind: 'upload-project',
      status: 'needs_attention',
      headline: 'Internal',
      summary: 'internal summary',
      stackLabel: 'Vite',
      healthScore: 50,
      previewUrl: null,
      productionUrl: null,
      source: {
        repoUrl: 'https://github.com/acme/hello-app',
        idea: null,
        serverHost: null,
      },
      connector: null,
      createdAt: timestamp,
      updatedAt: '2026-04-21T11:00:00.000Z',
      archivedAt: null,
      lastActiveAt: '2026-04-21T11:05:00.000Z',
      recentEvents: [],
      truthState: 'preview_failed',
      latestJob: null,
      workflowStage: 'failed',
    },
    {
      id: 'capsule_active',
      name: 'Playable Workspace',
      slug: 'playable-workspace',
      entryKind: 'upload-project',
      status: 'planning',
      headline: 'Playable',
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
      archivedAt: null,
      lastActiveAt: '2026-04-21T13:10:00.000Z',
      recentEvents: [],
      truthState: 'job_running',
      latestJob: null,
      workflowStage: 'queued',
    },
    {
      id: 'capsule_archived',
      name: 'Archived Workspace',
      slug: 'archived-workspace',
      entryKind: 'generate-from-idea',
      status: 'planning',
      headline: 'Archived',
      summary: 'archived summary',
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
      updatedAt: '2026-04-21T14:00:00.000Z',
      archivedAt: '2026-04-21T14:10:00.000Z',
      lastActiveAt: '2026-04-21T14:10:00.000Z',
      recentEvents: [],
      truthState: 'planning',
      latestJob: null,
      workflowStage: 'llm_planning',
    },
    {
      id: 'capsule_smoke',
      name: 'operator-v4-smoke-demo',
      slug: 'operator-v4-smoke-demo',
      entryKind: 'generate-from-idea',
      status: 'planning',
      headline: 'Smoke',
      summary: 'smoke summary',
      stackLabel: 'Canvas',
      healthScore: 60,
      previewUrl: null,
      productionUrl: null,
      source: {
        repoUrl: null,
        idea: 'smoke demo',
        serverHost: null,
      },
      connector: null,
      createdAt: timestamp,
      updatedAt: '2026-04-21T13:30:00.000Z',
      archivedAt: null,
      lastActiveAt: '2026-04-21T13:31:00.000Z',
      recentEvents: [],
      truthState: 'planning',
      latestJob: null,
      workflowStage: 'llm_planning',
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
            title: 'Continue deploy',
            planningMode: 'off',
            draft: '',
            userIntent: 'continue deploy',
            parsedInput: {
              kind: 'repo',
              rawInput: 'https://github.com/example/app',
              repoUrl: 'https://github.com/example/app',
              notes: null,
              idea: null,
              serverHost: null,
              planningMode: 'off',
              confidence: 0.8,
            },
            currentStage: 'queued',
            timeline: [
              {
                id: 'card_1',
                kind: 'plan',
                stage: 'queued',
                title: 'Queued',
                summary: 'Queued to continue',
                evidence: [],
                nextStep: 'Run the build',
                source: 'system',
                createdAt: timestamp,
                failureCode: null,
              },
            ],
            thread: {
              sessionId: 'session_existing',
              lastUpdatedAt: timestamp,
              messages: [
                {
                  id: 'wf_msg_1',
                  role: 'assistant',
                  content: 'Current workspace is queued.',
                  createdAt: timestamp,
                },
              ],
            },
            evidence: [],
            diagnostics: [],
            artifacts: [],
            deployReadiness: {
              sshStatus: 'ready',
              envStatus: 'ready',
              ready: true,
              summary: 'Ready',
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

function createWorkspaceResponseForStage(
  stage: 'parsing' | 'preflight' | 'llm_planning' | 'queued' | 'running' | 'verifying' | 'blocked' | 'failed' | 'success',
  options?: {
    previewUrl?: string | null;
    runtimeLiveAt?: string | null;
    healthPassedAt?: string | null;
    smokePassedAt?: string | null;
    failureCode?:
      | 'package_manager_unknown'
      | 'build_command_uncertain'
      | 'build_script_missing'
      | 'unsupported_stack'
      | 'compose_recipe_missing'
      | 'env_missing'
      | 'deploy_blocked'
      | 'preview_failed';
  },
) {
  const previewUrl = options?.previewUrl ?? null;
  const taskFailure = stage === 'blocked' || stage === 'failed'
    ? {
      failureCode: options?.failureCode ?? 'deploy_blocked',
      humanSummary: 'blocked',
      probableRootCause: 'blocked',
      recommendedActions: [],
      evidence: [],
      detectedAt: timestamp,
      stage,
    }
    : null;

  return createWorkspaceResponse({
    previewSummary: {
      status: previewUrl ? 'preview_live' : 'building',
      verified: false,
      previewUrl,
      entryFile: 'src/main.tsx',
      assetCount: previewUrl ? 8 : 2,
      verifiedAt: null,
      lastError: taskFailure ? 'blocked' : null,
      evidence: {
        runtimeLiveAt: options?.runtimeLiveAt ?? null,
        healthPassedAt: options?.healthPassedAt ?? null,
        smokePassedAt: options?.smokePassedAt ?? null,
        screenshotPath: null,
      },
    },
    workspaceArtifactLedger: {
      ...createWorkspaceResponse().data.workspaceArtifactLedger,
      previewTarget: {
        ...createWorkspaceResponse().data.workspaceArtifactLedger.previewTarget,
        url: previewUrl,
        verified: Boolean(options?.healthPassedAt && options?.smokePassedAt),
      },
    },
    workflow: {
      ...createWorkspaceResponse().data.workflow,
      tasks: [
        {
          ...createWorkspaceResponse().data.workflow.tasks[0],
          currentStage: stage,
          failure: taskFailure,
          timeline: [
            {
              id: `card_${stage}`,
              kind: taskFailure ? 'failure' : 'plan',
              stage,
              title: stage,
              summary: stage,
              evidence: [],
              nextStep: null,
              source: 'system',
              createdAt: timestamp,
              failureCode: taskFailure?.failureCode ?? null,
            },
          ],
        },
      ],
    },
    latestJob: {
      ...createWorkspaceResponse().data.latestJob,
      status: stage === 'blocked' || stage === 'failed'
        ? 'failed'
        : stage === 'success'
          ? 'success'
          : 'running',
    },
  });
}

function createAssistantSession(input?: {
  sessionId?: string;
  responseMode?: 'llm' | 'fallback';
  primaryProvider?: string;
  configuredProviders?: string[];
}) {
  const responseMode = input?.responseMode ?? 'llm';
  return {
    message: 'Assistant session ready.',
    data: {
      session: {
        sessionId: input?.sessionId ?? 'session_existing',
        createdAt: timestamp,
        updatedAt: timestamp,
        expiresAt: timestamp,
        context: {
          serviceId: null,
          invoiceId: null,
          capsuleId: 'capsule_active',
          path: '/operator-lab/capsule_active',
          locale: 'zh-CN',
        },
        messages: [],
      },
      authenticated: true,
      user: null,
      capabilities: {
        enabled: true,
        primaryProvider: input?.primaryProvider ?? (responseMode === 'llm' ? 'openai' : 'mock'),
        providers: responseMode === 'llm' ? ['openai', 'gemini', 'claude'] : ['mock'],
        configuredProviders: input?.configuredProviders ?? (responseMode === 'llm' ? ['openai'] : []),
        selectableModels: responseMode === 'llm'
          ? [
            {
              id: 'gpt-5.4',
              provider: 'openai',
              model: 'gpt-5.4',
              resolvedModelId: 'gpt-5.4',
              label: 'gpt-5.4',
              isPrimary: true,
              costPoints: 18,
              routingWeight: 2,
              costTier: 'premium',
            },
            {
              id: 'claude-sonnet-4-6',
              provider: 'claude',
              model: 'claude-sonnet-4-6',
              resolvedModelId: 'claude-sonnet-4-6',
              label: 'claude-sonnet-4-6',
              isPrimary: false,
              costPoints: 16,
              routingWeight: 3,
              costTier: 'premium',
            },
          ]
          : [],
        models: responseMode === 'llm'
          ? [
            {
              id: 'gpt-5.4',
              provider: 'openai',
              model: 'gpt-5.4',
              resolvedModelId: 'gpt-5.4',
              label: 'gpt-5.4',
              isPrimary: true,
              costPoints: 18,
              routingWeight: 2,
              costTier: 'premium',
            },
            {
              id: 'claude-sonnet-4-6',
              provider: 'claude',
              model: 'claude-sonnet-4-6',
              resolvedModelId: 'claude-sonnet-4-6',
              label: 'claude-sonnet-4-6',
              isPrimary: false,
              costPoints: 16,
              routingWeight: 3,
              costTier: 'premium',
            },
          ]
          : [],
        defaultModelId: responseMode === 'llm' ? 'gpt-5.4' : null,
        responseMode,
        mode: 'chat',
        quota: {
          tier: 'paid',
          dailyLimit: null,
          dailyTokenLimit: null,
          usedPoints: 0,
          usedTokens: 0,
          remainingPoints: null,
          remainingTokens: null,
          resetAt: timestamp,
          unlimited: true,
        },
        upgradeCta: null,
        policies: {
          lowRiskAuto: true,
          highRiskRequireConfirmation: true,
        },
        tools: {
          readOnly: [],
          lowRisk: [],
          highRisk: [],
        },
      },
      quota: {
        tier: 'paid',
        dailyLimit: null,
        dailyTokenLimit: null,
        usedPoints: 0,
        usedTokens: 0,
        remainingPoints: null,
        remainingTokens: null,
        resetAt: timestamp,
        unlimited: true,
      },
      upgradeCta: null,
    },
  } as const satisfies AssistantSessionResponse;
}

function createAssistantMessagesResponse(input?: {
  sessionId?: string;
  mode?: 'ask' | 'run';
  message?: string;
  workspaceCapsuleId?: string | null;
}) {
  return {
    message: 'Assistant reply generated.',
    data: {
      session: {
        sessionId: input?.sessionId ?? 'session_existing',
        createdAt: timestamp,
        updatedAt: timestamp,
        expiresAt: timestamp,
        context: {
          serviceId: null,
          invoiceId: null,
          capsuleId: input?.workspaceCapsuleId ?? 'capsule_active',
          path: '/operator-lab/capsule_active',
          locale: 'zh-CN',
        },
        messages: [
          {
            id: 'assistant_user',
            role: 'user',
            content: input?.message ?? 'hello',
            createdAt: timestamp,
          },
          {
            id: 'assistant_reply',
            role: 'assistant',
            content: input?.mode === 'ask' ? '这是 Ask 模式回复。' : '这是 Run 模式回复。',
            createdAt: timestamp,
          },
        ],
      },
      authenticated: true,
      reply: {
        id: 'assistant_reply',
        role: 'assistant',
        content: input?.mode === 'ask' ? '这是 Ask 模式回复。' : '这是 Run 模式回复。',
        createdAt: timestamp,
      },
      runState: input?.mode === 'ask' ? 'draft' : 'queued',
      source: 'system',
      proposals: [],
      pendingConfirmation: null,
      actionResult: null,
      workflow: input?.mode === 'run' ? createWorkspaceResponse().data.workflow : null,
      workspace: input?.mode === 'run'
        ? {
          capsuleId: input?.workspaceCapsuleId ?? 'capsule_active',
          capsulePath: '/operator-lab/capsule_active',
          capsuleUrl: 'http://localhost/operator-lab/capsule_active',
          workflowStage: 'queued',
        }
        : null,
      quota: {
        tier: 'paid',
        dailyLimit: null,
        dailyTokenLimit: null,
        usedPoints: 0,
        usedTokens: 0,
        remainingPoints: null,
        remainingTokens: null,
        resetAt: timestamp,
        unlimited: true,
      },
      upgradeCta: null,
      chargedTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      resolvedModelId: 'deterministic-fallback',
      routing: input?.mode === 'run'
        ? {
          route: 'repo_import_deploy',
          lane: 'repository',
          source: 'repository',
          reason: 'repo route',
        }
        : null,
    },
  } as const satisfies AssistantMessagesResponse;
}

function createProviderStatusResponse(input?: {
  canRun?: boolean;
  reason?: string;
}) {
  const canRun = input?.canRun ?? true;
  return {
    message: canRun ? 'Assistant provider is ready.' : 'Assistant provider is limited.',
    data: {
      enabled: true,
      checkedAt: timestamp,
      primaryProvider: 'openai',
      activeProvider: canRun ? 'openai' : null,
      activeModel: canRun ? 'gpt-5.4' : null,
      providerConfigured: true,
      credentialsPresent: true,
      networkReachable: canRun,
      modelReachable: canRun,
      responseMode: canRun ? 'llm' : 'fallback',
      canRun,
      reason: input?.reason ?? (canRun ? 'ready' : 'network unreachable'),
      providerResults: [
        {
          provider: 'openai',
          model: 'gpt-5.4',
          baseUrl: 'http://provider.local/v1',
          providerConfigured: true,
          credentialsPresent: true,
          networkReachable: canRun,
          modelReachable: canRun,
          canRun,
          httpStatus: canRun ? 200 : 503,
          reason: input?.reason ?? (canRun ? 'ready' : 'network unreachable'),
        },
      ],
    },
  } as const satisfies AssistantProviderStatusResponse;
}

function setupApiMocks() {
  apiMocks.useApiData.mockImplementation((path: string | null) => {
    if (path?.startsWith('/api/v1/operator/workspaces?')) {
      return {
        data: workspacesResponse,
        error: null,
        loading: false,
      };
    }
    if (path?.includes('/api/v1/operator/workspaces/capsule_active')) {
      const refresh = (() => {
        try {
          const url = new URL(path, 'http://localhost');
          const raw = url.searchParams.get('refresh');
          const parsed = raw ? Number.parseInt(raw, 10) : 0;
          return Number.isFinite(parsed) ? parsed : 0;
        } catch {
          return 0;
        }
      })();
      const queuedResponse = workspaceResponseQueue.length > 0
        ? workspaceResponseQueue[Math.min(refresh, workspaceResponseQueue.length - 1)]
        : null;
      return {
        data: queuedResponse ?? currentWorkspaceResponse,
        error: null,
        loading: false,
      };
    }
    return {
      data: null,
      error: null,
      loading: false,
    };
  });

  apiMocks.requestJson.mockImplementation(async (path: string, options?: { body?: Record<string, unknown>; method?: string }) => {
    if (path.startsWith('/api/v1/assistant/provider-status')) {
      return currentProviderStatusResponse;
    }
    if (path.startsWith('/api/v1/assistant/capabilities')) {
      return currentCapabilitiesResponse;
    }
    if (path === '/api/v1/assistant/session') {
      return currentSessionResponse;
    }
    if (path === '/api/v1/assistant/messages') {
      const mode = options?.body?.mode === 'run' ? 'run' : 'ask';
      return createAssistantMessagesResponse({
        sessionId: String(options?.body?.sessionId ?? 'session_existing'),
        mode,
        message: String(options?.body?.message ?? ''),
      });
    }
    if (path === '/api/v1/operator/workspaces/capsule_active') {
      return currentWorkspaceResponse;
    }
    if (path === '/api/v1/operator/workspaces/capsule_active/continue') {
      return currentWorkspaceResponse;
    }
    if (path === '/api/v1/operator/workspaces/capsule_active/confirm-active-plan') {
      return currentWorkspaceResponse;
    }
    if (path === '/api/v1/operator/workspaces/capsule_internal' && options?.method === 'PATCH') {
      return currentWorkspaceResponse;
    }
    if (path === '/api/v1/operator/workspaces/capsule_internal' && options?.method === 'DELETE') {
      return { data: { deleted: true } };
    }
    throw new Error(`Unhandled requestJson path: ${path}`);
  });
}

function renderPage(initialPath = '/operator-lab/capsule_active') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<OperatorV4Page />} path="/operator" />
        <Route element={<OperatorV4Page />} path="/operator/:capsuleId" />
        <Route element={<OperatorV4Page />} path="/operator-lab" />
        <Route element={<OperatorV4Page />} path="/operator-lab/:capsuleId" />
      </Routes>
    </MemoryRouter>,
  );
}

function setComposerMode(mode: 'auto' | 'ask' | 'run') {
  fireEvent.change(screen.getByTestId('operator-v4-mode-select'), {
    target: { value: mode },
  });
}

async function waitForLiveProviderReady() {
  await waitFor(() => {
    const requested = apiMocks.requestJson.mock.calls.some(([path]) => (
      typeof path === 'string' && path.startsWith('/api/v1/assistant/provider-status')
    ));
    expect(requested).toBe(true);
  });
  await waitFor(() => {
    expect(screen.queryByTestId('operator-v4-provider-banner')).not.toBeInTheDocument();
  });
}

describe('OperatorV4Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    currentSessionResponse = createAssistantSession();
    currentCapabilitiesResponse = {
      message: 'Assistant capabilities ready.',
      data: currentSessionResponse.data.capabilities,
    };
    currentProviderStatusResponse = createProviderStatusResponse();
    currentWorkspaceResponse = createWorkspaceResponse();
    workspaceResponseQueue = [];
    setupApiMocks();
  });

  it('keeps /operator on the chat-first lobby instead of auto-restoring recent workspace', async () => {
    window.localStorage.setItem('operator-v4:recent-workspace', 'capsule_active');
    renderPage('/operator');

    await waitFor(() => {
      expect(screen.getByTestId('operator-v4-project-capsule_active')).toHaveTextContent('Playable Workspace');
      expect(screen.getByRole('heading', { name: '新的工作台' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('heading', { name: 'Playable Workspace' })).not.toBeInTheDocument();
  });

  it('lands on /operator-lab as a quiet lobby chat without auto-loading a workspace', async () => {
    window.localStorage.setItem('operator-v4:recent-workspace', 'capsule_active');
    renderPage('/operator-lab');

    expect(await screen.findByTestId('operator-v4-empty')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '新的工作台' })).toBeInTheDocument();
    expect(
      apiMocks.useApiData.mock.calls.some(([path]) => (
        typeof path === 'string' && path.includes('/api/v1/operator/workspaces/capsule_active')
      )),
    ).toBe(false);
  });

  it('opens a blank lobby conversation and keeps advanced options collapsed by default', async () => {
    renderPage('/operator-lab');

    expect(await screen.findByTestId('operator-v4-empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '新对话' }));
    fireEvent.focus(screen.getByTestId('operator-v4-composer-input'));

    expect(await screen.findByTestId('operator-v4-composer-expanded')).toBeInTheDocument();
    expect(screen.getByTestId('operator-v4-advanced-toggle')).toHaveTextContent('高级选项');
    expect(screen.queryByTestId('operator-v4-advanced-options')).not.toBeInTheDocument();
  });

  it('can submit lobby advanced repo/server fields without leaving the same conversation', async () => {
    renderPage('/operator-lab');

    fireEvent.focus(await screen.findByTestId('operator-v4-composer-input'));
    setComposerMode('ask');
    fireEvent.click(screen.getByTestId('operator-v4-advanced-toggle'));
    expect(await screen.findByTestId('operator-v4-advanced-options')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('https://github.com/org/repo'), {
      target: { value: 'https://github.com/acme/demo' },
    });
    fireEvent.change(screen.getByPlaceholderText('例如 1.2.3.4'), {
      target: { value: '10.0.0.8' },
    });
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '请先评估部署风险' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalledWith('/api/v1/assistant/messages', expect.objectContaining({
        body: expect.objectContaining({
          mode: 'ask',
          message: expect.stringContaining('https://github.com/acme/demo'),
        }),
      }));
    });
    expect(await within(screen.getByTestId('operator-v4-conversation')).findByText(/请先评估部署风险/)).toBeInTheDocument();
  });

  it('saves normal lobby chat as a recoverable conversation project', async () => {
    const page = renderPage('/operator-lab');

    setComposerMode('ask');
    fireEvent.change(await screen.findByTestId('operator-v4-composer-input'), {
      target: { value: '你是谁' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('这是 Ask 模式回复。')).toBeInTheDocument();
    const rail = screen.getByTestId('operator-v4-project-rail');
    expect(within(rail).getByText('你是谁')).toBeInTheDocument();
    expect(within(rail).getByText('对话')).toBeInTheDocument();

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem('operator-v4:lobby-conversations') ?? '[]') as Array<{
        id: string;
        title: string;
        messages: Array<{ content: string }>;
      }>;
      expect(stored[0]?.title).toBe('你是谁');
      expect(stored[0]?.messages.some((message) => message.content === '这是 Ask 模式回复。')).toBe(true);
    });

    const stored = JSON.parse(window.localStorage.getItem('operator-v4:lobby-conversations') ?? '[]') as Array<{ id: string }>;
    page.unmount();
    renderPage(`/operator-lab?chat=${stored[0]?.id}`);

    expect(await screen.findByText('这是 Ask 模式回复。')).toBeInTheDocument();
    expect(within(screen.getByTestId('operator-v4-project-rail')).getByText('你是谁')).toBeInTheDocument();
  });

  it('keeps lobby chat projects recoverable when backend session messages are empty', async () => {
    apiMocks.requestJson.mockImplementation(async (path: string, options?: { body?: Record<string, unknown>; method?: string }) => {
      if (path.startsWith('/api/v1/assistant/provider-status')) {
        return currentProviderStatusResponse;
      }
      if (path.startsWith('/api/v1/assistant/capabilities')) {
        return currentCapabilitiesResponse;
      }
      if (path === '/api/v1/assistant/session') {
        return currentSessionResponse;
      }
      if (path === '/api/v1/assistant/messages') {
        const response = createAssistantMessagesResponse({
          sessionId: String(options?.body?.sessionId ?? 'session_existing'),
          mode: options?.body?.mode === 'run' ? 'run' : 'ask',
          message: String(options?.body?.message ?? ''),
          workspaceCapsuleId: null,
        });
        return {
          ...response,
          data: {
            ...response.data,
            session: {
              ...response.data.session,
              messages: [],
            },
            reply: {
              ...response.data.reply,
              content: '仅通过 reply 返回。',
            },
            workspace: null,
          },
        };
      }
      if (path === '/api/v1/operator/workspaces/capsule_active') {
        return currentWorkspaceResponse;
      }
      throw new Error(`Unhandled requestJson path: ${path}`);
    });

    const page = renderPage('/operator-lab');

    setComposerMode('ask');
    fireEvent.change(await screen.findByTestId('operator-v4-composer-input'), {
      target: { value: '请记住这条会话' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('仅通过 reply 返回。')).toBeInTheDocument();
    expect(within(screen.getByTestId('operator-v4-project-rail')).getByText('请记住这条会话')).toBeInTheDocument();

    const stored = JSON.parse(window.localStorage.getItem('operator-v4:lobby-conversations') ?? '[]') as Array<{
      id: string;
      title: string;
      messages: Array<{ content: string }>;
    }>;
    expect(stored[0]?.title).toBe('请记住这条会话');
    expect(stored[0]?.messages.some((message) => message.content.includes('请记住这条会话'))).toBe(true);
    expect(stored[0]?.messages.some((message) => message.content.includes('仅通过 reply 返回。'))).toBe(true);

    page.unmount();
    renderPage(`/operator-lab?chat=${stored[0]?.id}`);

    expect(await screen.findByText('仅通过 reply 返回。')).toBeInTheDocument();
    expect(within(screen.getByTestId('operator-v4-project-rail')).getByText('请记住这条会话')).toBeInTheDocument();
  });

  it('does not let delayed lobby session initialization erase a saved chat project', async () => {
    let resolveInitialSession: ((value: AssistantSessionResponse) => void) | null = null;
    let sessionCalls = 0;
    apiMocks.requestJson.mockImplementation(async (path: string, options?: { body?: Record<string, unknown>; method?: string }) => {
      if (path.startsWith('/api/v1/assistant/provider-status')) {
        return currentProviderStatusResponse;
      }
      if (path.startsWith('/api/v1/assistant/capabilities')) {
        return currentCapabilitiesResponse;
      }
      if (path === '/api/v1/assistant/session') {
        sessionCalls += 1;
        if (sessionCalls === 1) {
          return new Promise<AssistantSessionResponse>((resolve) => {
            resolveInitialSession = resolve;
          });
        }
        return currentSessionResponse;
      }
      if (path === '/api/v1/assistant/messages') {
        return createAssistantMessagesResponse({
          sessionId: String(options?.body?.sessionId ?? 'session_existing'),
          mode: 'ask',
          message: String(options?.body?.message ?? ''),
          workspaceCapsuleId: null,
        });
      }
      if (path === '/api/v1/operator/workspaces/capsule_active') {
        return currentWorkspaceResponse;
      }
      throw new Error(`Unhandled requestJson path: ${path}`);
    });

    renderPage('/operator-lab');

    setComposerMode('ask');
    fireEvent.change(await screen.findByTestId('operator-v4-composer-input'), {
      target: { value: '这条不能被初始化覆盖' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('这是 Ask 模式回复。')).toBeInTheDocument();
    expect(within(screen.getByTestId('operator-v4-project-rail')).getByText('这条不能被初始化覆盖')).toBeInTheDocument();

    await act(async () => {
      resolveInitialSession?.(currentSessionResponse);
    });

    expect(screen.getByText('这是 Ask 模式回复。')).toBeInTheDocument();
    expect(within(screen.getByTestId('operator-v4-project-rail')).getByText('这条不能被初始化覆盖')).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem('operator-v4:lobby-conversations') ?? '[]') as Array<{
      title: string;
      messages: Array<{ content: string }>;
    }>;
    expect(stored[0]?.title).toBe('这条不能被初始化覆盖');
    expect(stored[0]?.messages.some((message) => message.content === '这是 Ask 模式回复。')).toBe(true);
  });

  it('resets rail filter back to all when returning to lobby so chat projects stay visible', async () => {
    renderPage('/operator-lab/capsule_internal');

    fireEvent.click(await screen.findByTestId('operator-v4-rail-toggle'));
    fireEvent.click(screen.getByRole('button', { name: '失败' }));
    fireEvent.click(screen.getByRole('button', { name: '新建项目' }));

    setComposerMode('ask');
    fireEvent.change(await screen.findByTestId('operator-v4-composer-input'), {
      target: { value: '这是 lobby 会话项目' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(await screen.findByText('这是 Ask 模式回复。')).toBeInTheDocument();
    const rail = screen.getByTestId('operator-v4-project-rail');
    expect(within(rail).getByText('这是 lobby 会话项目')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部' })).toHaveClass('is-active');
  });

  it('keeps the details drawer hidden by default', async () => {
    renderPage();

    expect(screen.queryByTestId('operator-v4-details-drawer')).not.toBeInTheDocument();
    expect(screen.queryByText('run_state')).not.toBeInTheDocument();
    expect(screen.queryByText('active_task_id')).not.toBeInTheDocument();
    expect(screen.queryByText('failure_code')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('operator-v4-details-toggle'));
    expect(await screen.findByTestId('operator-v4-details-drawer')).toBeInTheDocument();
  });

  it('limits Run honestly when no live provider is available without injecting a stage banner', async () => {
    currentProviderStatusResponse = createProviderStatusResponse({
      canRun: false,
      reason: 'network unreachable',
    });
    setupApiMocks();
    renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId('operator-v4-provider-banner')).not.toBeInTheDocument();
    });
    setComposerMode('run');
    const sendButton = screen.getByRole('button', { name: '发送' });
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute('title', expect.stringContaining('AI 当前未连接'));
    expect(screen.getByText(/AI 当前未连接/)).toBeInTheDocument();
  });

  it('requests provider status with a timeout to avoid endless checking state', async () => {
    renderPage();

    await waitFor(() => {
      const matched = apiMocks.requestJson.mock.calls.some(([path, options]) => (
        typeof path === 'string'
        && path.startsWith('/api/v1/assistant/provider-status')
        && typeof options === 'object'
        && options !== null
        && (options as { timeoutMs?: number }).timeoutMs === 3500
      ));
      expect(matched).toBe(true);
    });
  });

  it('falls back to explicit limited execution state when provider-status request fails', async () => {
    apiMocks.requestJson.mockImplementation(async (path: string, options?: { body?: Record<string, unknown>; method?: string }) => {
      if (path.startsWith('/api/v1/assistant/provider-status')) {
        throw new Error('provider status unavailable');
      }
      if (path.startsWith('/api/v1/assistant/capabilities')) {
        return currentCapabilitiesResponse;
      }
      if (path === '/api/v1/assistant/session') {
        return currentSessionResponse;
      }
      if (path === '/api/v1/operator/workspaces/capsule_active') {
        return currentWorkspaceResponse;
      }
      if (path === '/api/v1/assistant/messages') {
        const mode = options?.body?.mode === 'run' ? 'run' : 'ask';
        return createAssistantMessagesResponse({
          sessionId: String(options?.body?.sessionId ?? 'session_existing'),
          mode,
          message: String(options?.body?.message ?? ''),
        });
      }
      throw new Error(`Unhandled requestJson path: ${path}`);
    });

    renderPage();

    await waitFor(() => {
      expect(screen.queryByTestId('operator-v4-provider-banner')).not.toBeInTheDocument();
    });
    setComposerMode('run');
    const sendButton = screen.getByRole('button', { name: '发送' });
    expect(sendButton).toBeDisabled();
    expect(sendButton).toHaveAttribute('title', expect.stringContaining('AI 当前未连接'));
    expect(screen.getByText(/AI 当前未连接/)).toBeInTheDocument();
  });

  it('shows project names in the left rail instead of internal workflow labels', async () => {
    renderPage();

    expect(screen.getByText('hello-app')).toBeInTheDocument();
    expect(screen.queryByText('failed-preview-workflow')).not.toBeInTheDocument();
    expect(screen.queryByTestId('operator-v4-project-capsule_smoke')).not.toBeInTheDocument();
  });

  it('keeps the stage quiet before the first user message', async () => {
    renderPage();

    expect(await screen.findByTestId('operator-v4-empty')).toBeInTheDocument();
    expect(screen.queryByText('Current workspace is queued.')).not.toBeInTheDocument();
    expect(screen.getByTestId('operator-v4-quiet-status')).toBeInTheDocument();
  });

  it('renders a chat-first layout with an inline mode menu instead of a separate ask/run panel', async () => {
    renderPage();

    expect(await screen.findByTestId('operator-v4-workspace-header')).toBeInTheDocument();
    expect(screen.getByTestId('operator-v4-inline-mode')).toBeInTheDocument();
    expect(screen.queryByTestId('operator-v4-inline-model')).not.toBeInTheDocument();
    fireEvent.focus(screen.getByTestId('operator-v4-composer-input'));
    expect(await screen.findByTestId('operator-v4-inline-model')).toBeInTheDocument();
    expect(document.querySelector('.operator-v4-composer .operator-v4-segmented')).toBeNull();
    expect(screen.queryByTestId('operator-v4-artifact-bar')).not.toBeInTheDocument();
  });

  it('surfaces real model choices and sends the selected model id', async () => {
    renderPage();
    await waitForLiveProviderReady();

    fireEvent.focus(await screen.findByTestId('operator-v4-composer-input'));
    fireEvent.change(await screen.findByTestId('operator-v4-model-select'), {
      target: { value: 'claude-sonnet-4-6' },
    });
    setComposerMode('ask');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '帮我分析当前部署为什么卡住' },
    });
    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalledWith('/api/v1/assistant/messages', expect.objectContaining({
        body: expect.objectContaining({
          mode: 'ask',
          selectedModelId: 'claude-sonnet-4-6',
          autoRoute: false,
        }),
      }));
    });
  });

  it('sends Ask mode without default execution and shows the user message immediately', async () => {
    renderPage();

    setComposerMode('ask');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '帮我解释一下为什么这次失败' },
    });
    fireEvent.click(screen.getByText('发送'));

    expect(await screen.findByText('帮我解释一下为什么这次失败')).toBeInTheDocument();
    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalledWith('/api/v1/assistant/messages', expect.objectContaining({
        body: expect.objectContaining({
          mode: 'ask',
        }),
      }));
    });
  });

  it('Auto / Ask / Run all write into the same conversation stream', async () => {
    renderPage();
    await waitForLiveProviderReady();

    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '解释一下这次失败原因' },
    });
    fireEvent.click(screen.getByText('发送'));
    expect(await screen.findByText('解释一下这次失败原因')).toBeInTheDocument();
    setComposerMode('run');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '继续部署仓库并启动预览' },
    });
    fireEvent.click(screen.getByText('发送'));
    expect(await screen.findByText('已接收任务，正在检查仓库。')).toBeInTheDocument();
    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalledWith('/api/v1/assistant/messages', expect.objectContaining({
        body: expect.objectContaining({
          mode: 'ask',
        }),
      }));
      expect(apiMocks.requestJson).toHaveBeenCalledWith('/api/v1/assistant/messages', expect.objectContaining({
        body: expect.objectContaining({
          mode: 'run',
        }),
      }));
    });
    expect(screen.getByTestId('operator-v4-conversation')).toBeInTheDocument();
  });

  it('clicking Run shows immediate ack message and sends run mode payload', async () => {
    renderPage();
    await waitForLiveProviderReady();

    setComposerMode('run');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '继续部署这个项目' },
    });
    fireEvent.click(screen.getByText('发送'));

    expect(await screen.findByText('已接收任务，正在检查仓库。')).toBeInTheDocument();
    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalledWith('/api/v1/assistant/messages', expect.objectContaining({
        body: expect.objectContaining({
          mode: 'run',
          taskMode: 'continue',
        }),
      }));
    });
  });

  it('updates run progress continuously in the conversation stream', async () => {
    currentWorkspaceResponse = createWorkspaceResponseForStage('parsing');
    workspaceResponseQueue = [
      createWorkspaceResponseForStage('parsing'),
      createWorkspaceResponseForStage('preflight'),
      createWorkspaceResponseForStage('llm_planning'),
      createWorkspaceResponseForStage('running'),
    ];
    setupApiMocks();
    renderPage();
    await waitForLiveProviderReady();

    setComposerMode('run');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '部署这个仓库并给我预览' },
    });
    fireEvent.click(screen.getByText('发送'));

    expect(await screen.findByText('已接收任务，正在检查仓库。')).toBeInTheDocument();
    expect(await screen.findByText('识别技术栈')).toBeInTheDocument();
    expect(await screen.findByText('生成执行计划', {}, { timeout: 6_000 })).toBeInTheDocument();
    expect(screen.getAllByText(/最近心跳：/).length).toBeGreaterThan(0);
  });

  it('composer expands on focus, collapses on scroll, and stays inside the conversation flow', async () => {
    renderPage();

    const thread = await screen.findByTestId('operator-v4-conversation');
    const dock = screen.getByTestId('operator-v4-conversation-dock');
    expect(thread).toHaveClass('has-dock');
    expect(thread).toHaveClass('is-dock-collapsed');
    expect(screen.getByTestId('operator-v4-composer-collapsed')).toBeInTheDocument();
    const input = within(dock).getByTestId('operator-v4-composer-input');
    fireEvent.focus(input);
    expect(await screen.findByTestId('operator-v4-composer-expanded')).toBeInTheDocument();
    expect(thread).toHaveClass('is-dock-expanded');
    Object.defineProperty(thread, 'scrollTop', { configurable: true, value: 40 });
    fireEvent.scroll(thread);
    await waitFor(() => {
      expect(screen.getByTestId('operator-v4-composer-collapsed')).toBeInTheDocument();
      expect(thread).toHaveClass('is-dock-collapsed');
    });
    expect(within(dock).getByTestId('operator-v4-composer-input')).toBeInTheDocument();
  });

  it('collapses legacy workspace history by default and keeps debug content out of the main conversation', async () => {
    const base = createWorkspaceResponse();
    currentWorkspaceResponse = createWorkspaceResponse({
      workflow: {
        ...base.data.workflow,
        tasks: [
          {
            ...base.data.workflow.tasks[0],
            thread: {
              sessionId: 'session_existing',
              lastUpdatedAt: timestamp,
              messages: [
                {
                  id: 'wf_old_user',
                  role: 'user',
                  content: '帮我部署这个仓库',
                  createdAt: '2026-04-19T10:00:00.000Z',
                },
                {
                  id: 'wf_old_assistant',
                  role: 'assistant',
                  content: '好的，我先检查仓库。',
                  createdAt: '2026-04-19T10:01:00.000Z',
                },
                {
                  id: 'wf_old_debug',
                  role: 'assistant',
                  content: 'failure_code=preview_failed current_stage=running',
                  createdAt: '2026-04-19T10:02:00.000Z',
                },
                {
                  id: 'wf_recent_user',
                  role: 'user',
                  content: '现在继续部署',
                  createdAt: '2026-04-20T10:00:00.000Z',
                },
                {
                  id: 'wf_recent_assistant',
                  role: 'assistant',
                  content: '收到，我继续部署。',
                  createdAt: '2026-04-20T10:01:00.000Z',
                },
              ],
            },
          },
        ],
      },
    });
    setupApiMocks();
    renderPage();

    expect(await screen.findByTestId('operator-v4-history-summary')).toBeInTheDocument();
    expect(screen.queryByText('failure_code=preview_failed current_stage=running')).not.toBeInTheDocument();
    expect(screen.queryByText('帮我部署这个仓库')).not.toBeInTheDocument();
    expect(screen.getByText('现在继续部署')).toBeInTheDocument();
    expect(screen.getByText('收到，我继续部署。')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('operator-v4-history-toggle'));
    expect(await screen.findByTestId('operator-v4-history-expanded')).toBeInTheDocument();
    expect(screen.getByText('帮我部署这个仓库')).toBeInTheDocument();
    expect(screen.getByText('好的，我先检查仓库。')).toBeInTheDocument();
    expect(screen.queryByText('failure_code=preview_failed current_stage=running')).not.toBeInTheDocument();
  });

  it('shows preview card automatically once previewUrl becomes available', async () => {
    currentWorkspaceResponse = createWorkspaceResponseForStage('running', {
      previewUrl: null,
    });
    workspaceResponseQueue = [
      createWorkspaceResponseForStage('running', { previewUrl: null }),
      createWorkspaceResponseForStage('verifying', {
        previewUrl: 'http://127.0.0.1:4173',
        runtimeLiveAt: timestamp,
      }),
    ];
    setupApiMocks();
    renderPage();
    await waitForLiveProviderReady();

    expect(screen.queryByTestId('operator-v4-preview-iframe')).not.toBeInTheDocument();
    expect(screen.queryByTestId('operator-v4-preview-reason')).not.toBeInTheDocument();

    setComposerMode('run');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '继续部署并启动预览' },
    });
    fireEvent.click(screen.getByText('发送'));

    const missingCards = await screen.findAllByTestId('operator-v4-preview-reason');
    expect(missingCards.some((node) => node.textContent?.includes('还没准备好'))).toBe(true);
    expect(await screen.findByTestId('operator-v4-preview-iframe', {}, { timeout: 6_000 })).toBeInTheDocument();
    expect(screen.getByText('运行预览')).toBeInTheDocument();
  });

  it('shows an explicit reason when previewUrl is unavailable', async () => {
    currentWorkspaceResponse = createWorkspaceResponseForStage('blocked', {
      previewUrl: null,
      failureCode: 'package_manager_unknown',
    });
    setupApiMocks();
    renderPage();
    await waitForLiveProviderReady();

    setComposerMode('run');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '继续部署这个仓库' },
    });
    fireEvent.click(screen.getByText('发送'));

    const missingCards = await screen.findAllByTestId('operator-v4-preview-reason');
    expect(missingCards.some((node) => node.textContent?.includes('预览还没准备好'))).toBe(true);
    expect(missingCards.some((node) => node.textContent?.includes('缺少入口'))).toBe(true);
  });

  it('turns blocked state into an inline repair flow instead of a terminal dead-end', async () => {
    currentWorkspaceResponse = createWorkspaceResponseForStage('running', { previewUrl: null });
    workspaceResponseQueue = [
      createWorkspaceResponseForStage('running', { previewUrl: null }),
      createWorkspaceResponseForStage('blocked', {
        previewUrl: null,
        failureCode: 'build_script_missing',
      }),
    ];
    setupApiMocks();
    renderPage();
    await waitForLiveProviderReady();

    setComposerMode('run');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '继续部署并修复入口信息' },
    });
    fireEvent.click(screen.getByText('发送'));

    expect(await screen.findByTestId('operator-v4-repair-card', {}, { timeout: 6_000 })).toBeInTheDocument();
    expect(screen.getByText('使用推荐方案')).toBeInTheDocument();
    expect(screen.getByText('重新自动检测')).toBeInTheDocument();
    expect(screen.queryByText('执行已阻塞：请按主按钮补充信息后重试。')).not.toBeInTheDocument();
  }, 10_000);

  it('routes Dockerfile outside golden paths into repair flow with a recommended docker run mode', async () => {
    const blockedStage = createWorkspaceResponseForStage('blocked', {
      previewUrl: null,
      failureCode: 'unsupported_stack',
    });
    const blockedDocker = createWorkspaceResponse({
      ...blockedStage.data,
      techStackSummary: {
        ...blockedStage.data.techStackSummary,
        kind: 'dockerfile',
        label: 'Dockerfile',
        detectionSource: 'docker/Dockerfile',
        dockerfilePath: 'docker/Dockerfile',
        blockReason: 'unsupported_stack',
        startCommand: null,
        runtimePort: 8080,
        healthcheckPath: '/health',
      },
      workspaceArtifactLedger: {
        ...blockedStage.data.workspaceArtifactLedger,
        chosenStack: {
          ...blockedStage.data.workspaceArtifactLedger.chosenStack,
          kind: 'dockerfile',
          label: 'Dockerfile',
          detectionSource: 'docker/Dockerfile',
          dockerfilePath: 'docker/Dockerfile',
          startCommand: null,
          runtimePort: 8080,
          healthcheckPath: '/health',
          composeFilePath: null,
          composeServiceName: null,
        },
      },
    });

    currentWorkspaceResponse = createWorkspaceResponseForStage('running', { previewUrl: null });
    workspaceResponseQueue = [
      createWorkspaceResponseForStage('running', { previewUrl: null }),
      blockedDocker,
    ];
    setupApiMocks();
    renderPage();
    await waitForLiveProviderReady();

    setComposerMode('run');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '继续部署并修复 Dockerfile 运行信息' },
    });
    fireEvent.click(screen.getByText('发送'));

    expect(await screen.findByTestId('operator-v4-repair-card', {}, { timeout: 6_000 })).toBeInTheDocument();
    expect(screen.getByText(/推荐 Docker 运行方式：/)).toBeInTheDocument();
    expect(screen.getAllByText(/docker build -f docker\/Dockerfile/).length).toBeGreaterThan(0);
  }, 10_000);

  it('recommended repair fix continues execution through the real continue endpoint', async () => {
    currentWorkspaceResponse = createWorkspaceResponseForStage('running', { previewUrl: null });
    workspaceResponseQueue = [
      createWorkspaceResponseForStage('running', { previewUrl: null }),
      createWorkspaceResponseForStage('blocked', {
        previewUrl: null,
        failureCode: 'compose_recipe_missing',
      }),
    ];
    setupApiMocks();
    renderPage();
    await waitForLiveProviderReady();

    setComposerMode('run');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '继续部署并自动补救' },
    });
    fireEvent.click(screen.getByText('发送'));
    expect(await screen.findByTestId('operator-v4-repair-card', {}, { timeout: 6_000 })).toBeInTheDocument();

    fireEvent.click(screen.getByText('使用推荐方案'));
    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalledWith('/api/v1/operator/workspaces/capsule_active/continue', expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          repair: expect.objectContaining({
            mode: 'recommended',
          }),
        }),
      }));
    });
  }, 10_000);

  it('manual repair form submission resumes execution', async () => {
    currentWorkspaceResponse = createWorkspaceResponseForStage('running', { previewUrl: null });
    workspaceResponseQueue = [
      createWorkspaceResponseForStage('running', { previewUrl: null }),
      createWorkspaceResponseForStage('blocked', {
        previewUrl: null,
        failureCode: 'env_missing',
      }),
    ];
    setupApiMocks();
    renderPage();
    await waitForLiveProviderReady();

    setComposerMode('run');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '继续部署并手动补齐运行参数' },
    });
    fireEvent.click(screen.getByText('发送'));
    expect(await screen.findByTestId('operator-v4-repair-card', {}, { timeout: 6_000 })).toBeInTheDocument();

    fireEvent.click(screen.getByText('手动填写'));
    expect(await screen.findByText('提交并继续执行')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('启动命令'), { target: { value: 'pnpm preview --host 0.0.0.0' } });
    fireEvent.change(screen.getByLabelText('端口'), { target: { value: '4173' } });
    fireEvent.change(screen.getByLabelText('健康检查路径'), { target: { value: '/healthz' } });
    fireEvent.change(screen.getByLabelText('Docker 服务名（可选）'), { target: { value: 'web' } });
    fireEvent.click(screen.getByText('提交并继续执行'));

    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalledWith('/api/v1/operator/workspaces/capsule_active/continue', expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          repair: expect.objectContaining({
            mode: 'manual',
            startCommand: 'pnpm preview --host 0.0.0.0',
            port: 4173,
            healthcheckPath: '/healthz',
            dockerServiceName: 'web',
          }),
        }),
      }));
    });
  }, 10_000);

  it('renders terminal status using allowed user-facing states only', async () => {
    currentWorkspaceResponse = createWorkspaceResponseForStage('running', { previewUrl: null });
    workspaceResponseQueue = [
      createWorkspaceResponseForStage('running', { previewUrl: null }),
      createWorkspaceResponseForStage('failed', {
        previewUrl: null,
        failureCode: 'deploy_blocked',
      }),
    ];
    setupApiMocks();
    renderPage();
    await waitForLiveProviderReady();

    setComposerMode('run');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '继续部署这个仓库' },
    });
    fireEvent.click(screen.getByText('发送'));

    const terminal = await screen.findByText('执行失败：请查看失败原因并重试。', {}, { timeout: 6_000 });
    expect(terminal).toBeInTheDocument();
    expect(screen.queryByText('current_stage')).not.toBeInTheDocument();
    expect(screen.queryByText('run_state')).not.toBeInTheDocument();
    expect(screen.queryByText('failure_code')).not.toBeInTheDocument();
    expect(screen.queryByText('source')).not.toBeInTheDocument();
    expect(screen.queryByText('active_task_id')).not.toBeInTheDocument();
  });

  it('restores draft and attachments when the API send fails', async () => {
    apiMocks.requestJson.mockImplementation(async (path: string, options?: { body?: Record<string, unknown>; method?: string }) => {
      if (path.startsWith('/api/v1/assistant/provider-status')) {
        return currentProviderStatusResponse;
      }
      if (path.startsWith('/api/v1/assistant/capabilities')) {
        return currentCapabilitiesResponse;
      }
      if (path === '/api/v1/assistant/session') {
        return currentSessionResponse;
      }
      if (path === '/api/v1/assistant/messages') {
        throw new Error('network fail');
      }
      if (path === '/api/v1/operator/workspaces/capsule_active') {
        return currentWorkspaceResponse;
      }
      throw new Error(`Unhandled requestJson path: ${path}`);
    });
    renderPage();
    fireEvent.focus(await screen.findByTestId('operator-v4-composer-input'));

    const file = new File(['hello: world'], 'docker-compose.yml', { type: 'text/plain' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    setComposerMode('ask');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '帮我解释失败原因' },
    });
    fireEvent.click(screen.getByText('发送'));

    fireEvent.focus(await screen.findByTestId('operator-v4-composer-input'));
    expect(await screen.findByText('docker-compose.yml')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByDisplayValue('帮我解释失败原因')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('does not render a preview placeholder before previewUrl exists', async () => {
    currentWorkspaceResponse = createWorkspaceResponseForStage('running', { previewUrl: null });
    setupApiMocks();
    renderPage();

    expect(screen.queryByTestId('operator-v4-preview-iframe')).not.toBeInTheDocument();
    expect(screen.queryByTestId('operator-v4-preview-reason')).not.toBeInTheDocument();
  });

  it('continues the current task with the real continue endpoint', async () => {
    renderPage();

    fireEvent.click(await screen.findByTestId('operator-v4-continue-task'));

    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalledWith('/api/v1/operator/workspaces/capsule_active/continue', expect.objectContaining({
        method: 'POST',
      }));
    });
  });

  it('creates a new conversation and forces the next Run send into new_turn', async () => {
    renderPage();
    await waitForLiveProviderReady();

    fireEvent.focus(await screen.findByTestId('operator-v4-composer-input'));
    fireEvent.click(screen.getByText('新建会话'));
    setComposerMode('run');
    fireEvent.change(screen.getByTestId('operator-v4-composer-input'), {
      target: { value: '重新来一轮部署' },
    });
    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalledWith('/api/v1/assistant/messages', expect.objectContaining({
        body: expect.objectContaining({
          mode: 'run',
          taskMode: 'new_turn',
        }),
      }));
    });
  });

  it('can archive and delete workspaces from the left rail', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Renamed Project');
    renderPage();

    let internalCard = await screen.findByTestId('operator-v4-project-capsule_internal');
    expect(within(internalCard).queryByText('归档')).not.toBeInTheDocument();
    fireEvent.click(within(internalCard).getByLabelText('项目操作'));
    fireEvent.click(await within(internalCard).findByText('归档'));
    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalledWith('/api/v1/operator/workspaces/capsule_internal', expect.objectContaining({
        method: 'PATCH',
        body: expect.objectContaining({
          archived: true,
        }),
      }));
    });
    internalCard = await screen.findByTestId('operator-v4-project-capsule_internal');
    fireEvent.click(within(internalCard).getByLabelText('项目操作'));
    fireEvent.click(await within(internalCard).findByText('删除'));
    fireEvent.click(await within(internalCard).findByText('确认删除'));

    await waitFor(() => {
      expect(apiMocks.requestJson).toHaveBeenCalledWith('/api/v1/operator/workspaces/capsule_internal', expect.objectContaining({
        method: 'DELETE',
      }));
    });
  });
});
