import { randomBytes } from 'node:crypto';

import type {
  OperatorWorkflowArtifact,
  OperatorWorkflowCard,
  OperatorWorkflowCardKind,
  OperatorWorkflowEvidenceItem,
  OperatorWorkflowFailure,
  OperatorWorkflowFailureCode,
  OperatorWorkflowMessage,
  OperatorWorkflowParsedInput,
  OperatorWorkflowPendingConfirmation,
  OperatorWorkflowPublishEntry,
  OperatorWorkflowSource,
  OperatorWorkflowStage,
  OperatorWorkflowState,
  OperatorWorkflowTask,
  OperatorWorkflowThread,
} from './operator.js';

const validWorkflowCardKinds = new Set<OperatorWorkflowCardKind>([
  'user_message',
  'understanding',
  'preflight',
  'plan',
  'confirmation',
  'execution',
  'verification',
  'failure_diagnosis',
  'next_step',
]);

const validWorkflowStages = new Set<OperatorWorkflowStage>([
  'draft',
  'parsing',
  'preflight',
  'llm_planning',
  'awaiting_confirmation',
  'queued',
  'running',
  'verifying',
  'partial_success',
  'success',
  'failed',
  'blocked',
  'rolled_back',
]);

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

function trimText(value: string | null | undefined) {
  return (value ?? '').trim();
}

function normalizeWorkflowStage(value: unknown): OperatorWorkflowStage {
  return validWorkflowStages.has(value as OperatorWorkflowStage) ? value as OperatorWorkflowStage : 'draft';
}

export function defaultWorkflowThread(): OperatorWorkflowThread {
  return {
    sessionId: null,
    messages: [],
    lastUpdatedAt: null,
  };
}

export function defaultWorkflowParsedInput(): OperatorWorkflowParsedInput {
  return {
    kind: 'unknown',
    rawInput: '',
    repoUrl: null,
    notes: null,
    idea: null,
    serverHost: null,
    planningMode: 'off',
    confidence: null,
  };
}

export function defaultWorkflowTask(): OperatorWorkflowTask {
  const createdAt = nowIso();
  return {
    id: createId('workflow-task'),
    title: 'Visible agent task',
    planningMode: 'off',
    thread: defaultWorkflowThread(),
    draft: '',
    userIntent: '',
    parsedInput: defaultWorkflowParsedInput(),
    currentStage: 'draft',
    timeline: [],
    evidence: [],
    diagnostics: [],
    artifacts: [],
    deployReadiness: {
      sshStatus: null,
      envStatus: null,
      ready: false,
      summary: 'Readiness has not been evaluated yet.',
    },
    publishHistory: [],
    failure: null,
    pendingConfirmation: null,
    createdAt,
    updatedAt: createdAt,
  };
}

export function defaultWorkflowState(): OperatorWorkflowState {
  return {
    planningMode: 'off',
    activeTaskId: null,
    tasks: [],
  };
}

export function normalizeWorkflowEvidenceItem(value: unknown): OperatorWorkflowEvidenceItem | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Partial<OperatorWorkflowEvidenceItem>;
  if (typeof record.label !== 'string' || !record.label.trim() || typeof record.detail !== 'string') {
    return null;
  }

  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id : createId('workflow-evidence'),
    label: record.label.trim(),
    detail: record.detail.trim(),
    source: record.source === 'llm'
      || record.source === 'executor'
      || record.source === 'preflight'
      || record.source === 'mock'
      ? record.source
      : 'system',
  };
}

export function normalizeWorkflowCard(value: unknown): OperatorWorkflowCard | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Partial<OperatorWorkflowCard>;
  if (typeof record.title !== 'string' || typeof record.summary !== 'string') {
    return null;
  }

  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id : createId('workflow-card'),
    kind: validWorkflowCardKinds.has(record.kind as OperatorWorkflowCardKind) ? record.kind as OperatorWorkflowCardKind : 'plan',
    stage: normalizeWorkflowStage(record.stage),
    title: record.title.trim(),
    summary: record.summary.trim(),
    evidence: Array.isArray(record.evidence)
      ? record.evidence.map((entry) => normalizeWorkflowEvidenceItem(entry)).filter((entry): entry is OperatorWorkflowEvidenceItem => Boolean(entry))
      : [],
    nextStep: typeof record.nextStep === 'string' && record.nextStep.trim() ? record.nextStep.trim() : null,
    source: record.source === 'llm'
      || record.source === 'executor'
      || record.source === 'preflight'
      || record.source === 'mock'
      ? record.source
      : 'system',
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : nowIso(),
    failureCode: typeof record.failureCode === 'string' ? record.failureCode as OperatorWorkflowFailureCode : null,
  };
}

export function normalizeWorkflowFailure(value: unknown): OperatorWorkflowFailure | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Partial<OperatorWorkflowFailure>;
  if (typeof record.failureCode !== 'string' || typeof record.humanSummary !== 'string' || typeof record.probableRootCause !== 'string') {
    return null;
  }

  return {
    failureCode: record.failureCode as OperatorWorkflowFailureCode,
    humanSummary: record.humanSummary,
    probableRootCause: record.probableRootCause,
    recommendedActions: Array.isArray(record.recommendedActions)
      ? record.recommendedActions.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    evidence: Array.isArray(record.evidence)
      ? record.evidence.map((entry) => normalizeWorkflowEvidenceItem(entry)).filter((entry): entry is OperatorWorkflowEvidenceItem => Boolean(entry))
      : [],
    detectedAt: typeof record.detectedAt === 'string' ? record.detectedAt : nowIso(),
    stage: normalizeWorkflowStage(record.stage),
  };
}

export function normalizeWorkflowTask(value: unknown): OperatorWorkflowTask | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Partial<OperatorWorkflowTask>;
  const fallback = defaultWorkflowTask();
  const thread = typeof record.thread === 'object' && record.thread !== null ? record.thread as Partial<OperatorWorkflowThread> : null;
  const parsedInput = typeof record.parsedInput === 'object' && record.parsedInput !== null
    ? record.parsedInput as Partial<OperatorWorkflowParsedInput>
    : null;

  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id : fallback.id,
    title: typeof record.title === 'string' && record.title.trim() ? record.title : fallback.title,
    planningMode: record.planningMode === 'on' ? 'on' : 'off',
    thread: {
      sessionId: typeof thread?.sessionId === 'string' ? thread.sessionId : null,
      messages: Array.isArray(thread?.messages)
        ? thread.messages
          .map((message) => {
            if (typeof message !== 'object' || message === null) {
              return null;
            }
            const candidate = message as Partial<OperatorWorkflowMessage>;
            if (typeof candidate.content !== 'string' || typeof candidate.createdAt !== 'string') {
              return null;
            }
            return {
              id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createId('workflow-message'),
              role: candidate.role === 'system' || candidate.role === 'assistant' ? candidate.role : 'user',
              content: candidate.content,
              createdAt: candidate.createdAt,
            } satisfies OperatorWorkflowMessage;
          })
          .filter((entry): entry is OperatorWorkflowMessage => Boolean(entry))
        : [],
      lastUpdatedAt: typeof thread?.lastUpdatedAt === 'string' ? thread.lastUpdatedAt : null,
    },
    draft: typeof record.draft === 'string' ? record.draft : '',
    userIntent: typeof record.userIntent === 'string' ? record.userIntent : '',
    parsedInput: {
      kind: parsedInput?.kind === 'repo' || parsedInput?.kind === 'idea' || parsedInput?.kind === 'server'
        ? parsedInput.kind
        : 'unknown',
      rawInput: typeof parsedInput?.rawInput === 'string' ? parsedInput.rawInput : '',
      repoUrl: typeof parsedInput?.repoUrl === 'string' ? parsedInput.repoUrl : null,
      notes: typeof parsedInput?.notes === 'string' ? parsedInput.notes : null,
      idea: typeof parsedInput?.idea === 'string' ? parsedInput.idea : null,
      serverHost: typeof parsedInput?.serverHost === 'string' ? parsedInput.serverHost : null,
      planningMode: parsedInput?.planningMode === 'on' ? 'on' : 'off',
      confidence: typeof parsedInput?.confidence === 'number' && Number.isFinite(parsedInput.confidence) ? parsedInput.confidence : null,
    },
    currentStage: normalizeWorkflowStage(record.currentStage),
    timeline: Array.isArray(record.timeline)
      ? record.timeline.map((entry) => normalizeWorkflowCard(entry)).filter((entry): entry is OperatorWorkflowCard => Boolean(entry))
      : [],
    evidence: Array.isArray(record.evidence)
      ? record.evidence.map((entry) => normalizeWorkflowEvidenceItem(entry)).filter((entry): entry is OperatorWorkflowEvidenceItem => Boolean(entry))
      : [],
    diagnostics: Array.isArray(record.diagnostics)
      ? record.diagnostics.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    artifacts: Array.isArray(record.artifacts)
      ? record.artifacts
        .map((entry) => {
          if (typeof entry !== 'object' || entry === null) {
            return null;
          }
          const candidate = entry as Partial<OperatorWorkflowArtifact>;
          if (typeof candidate.label !== 'string' || typeof candidate.detail !== 'string') {
            return null;
          }
          return {
            id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createId('workflow-artifact'),
            label: candidate.label,
            detail: candidate.detail,
            url: typeof candidate.url === 'string' ? candidate.url : null,
          } satisfies OperatorWorkflowArtifact;
        })
        .filter((entry): entry is OperatorWorkflowArtifact => Boolean(entry))
      : [],
    deployReadiness: {
      sshStatus: typeof record.deployReadiness?.sshStatus === 'string' ? record.deployReadiness.sshStatus : null,
      envStatus: typeof record.deployReadiness?.envStatus === 'string' ? record.deployReadiness.envStatus : null,
      ready: record.deployReadiness?.ready === true,
      summary: typeof record.deployReadiness?.summary === 'string' ? record.deployReadiness.summary : fallback.deployReadiness.summary,
    },
    publishHistory: Array.isArray(record.publishHistory)
      ? record.publishHistory
        .map((entry) => {
          if (typeof entry !== 'object' || entry === null) {
            return null;
          }
          const candidate = entry as Partial<OperatorWorkflowPublishEntry>;
          if (typeof candidate.summary !== 'string' || typeof candidate.createdAt !== 'string') {
            return null;
          }
          return {
            id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createId('workflow-publish'),
            status: candidate.status === 'success' || candidate.status === 'failed' || candidate.status === 'rolled_back' ? candidate.status : 'queued',
            summary: candidate.summary,
            createdAt: candidate.createdAt,
          } satisfies OperatorWorkflowPublishEntry;
        })
        .filter((entry): entry is OperatorWorkflowPublishEntry => Boolean(entry))
      : [],
    failure: normalizeWorkflowFailure(record.failure),
    pendingConfirmation: typeof record.pendingConfirmation === 'object' && record.pendingConfirmation !== null
      ? {
        token: typeof record.pendingConfirmation.token === 'string' ? record.pendingConfirmation.token : null,
        label: typeof record.pendingConfirmation.label === 'string' ? record.pendingConfirmation.label : '',
        summary: typeof record.pendingConfirmation.summary === 'string' ? record.pendingConfirmation.summary : null,
        expiresAt: typeof record.pendingConfirmation.expiresAt === 'string' ? record.pendingConfirmation.expiresAt : null,
      }
      : null,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : fallback.createdAt,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : fallback.updatedAt,
  };
}

export function normalizeWorkflowState(value: unknown): OperatorWorkflowState {
  if (typeof value !== 'object' || value === null) {
    return defaultWorkflowState();
  }

  const record = value as Partial<OperatorWorkflowState>;
  const tasks = Array.isArray(record.tasks)
    ? record.tasks.map((entry) => normalizeWorkflowTask(entry)).filter((entry): entry is OperatorWorkflowTask => Boolean(entry))
    : [];
  const activeTaskId = typeof record.activeTaskId === 'string' && tasks.some((task) => task.id === record.activeTaskId)
    ? record.activeTaskId
    : tasks.at(-1)?.id ?? null;

  return {
    planningMode: record.planningMode === 'on' ? 'on' : 'off',
    activeTaskId,
    tasks,
  };
}

export function getWorkflowTaskById(workflow: OperatorWorkflowState, taskId: string | null | undefined) {
  if (!taskId) {
    return null;
  }
  return workflow.tasks.find((task) => task.id === taskId) ?? null;
}

export function resolveWorkflowPendingConfirmation(
  task: OperatorWorkflowTask,
  requestedPendingConfirmationId?: string | null,
) {
  const expectedPendingConfirmationId = trimText(task.pendingConfirmation?.token) || null;
  const requestedConfirmationId = trimText(requestedPendingConfirmationId) || null;
  const resolvedPendingConfirmationId = requestedConfirmationId || expectedPendingConfirmationId;

  return {
    expectedPendingConfirmationId,
    requestedPendingConfirmationId: requestedConfirmationId,
    resolvedPendingConfirmationId,
    awaitingPendingConfirmation: task.currentStage === 'awaiting_confirmation' && Boolean(expectedPendingConfirmationId),
    mismatch: Boolean(
      task.currentStage === 'awaiting_confirmation'
      && expectedPendingConfirmationId
      && requestedConfirmationId
      && requestedConfirmationId !== expectedPendingConfirmationId,
    ),
  };
}

export function appendWorkflowCard(task: OperatorWorkflowTask, card: OperatorWorkflowCard) {
  const existingIndex = task.timeline.findIndex((entry) => entry.id === card.id);
  if (existingIndex >= 0) {
    task.timeline[existingIndex] = card;
  } else {
    task.timeline.push(card);
  }
  task.currentStage = card.stage;
  task.updatedAt = card.createdAt;
}

export function appendWorkflowMessage(task: OperatorWorkflowTask, message: OperatorWorkflowMessage) {
  const existingIndex = task.thread.messages.findIndex((entry) => entry.id === message.id);
  if (existingIndex >= 0) {
    task.thread.messages[existingIndex] = message;
  } else {
    task.thread.messages.push(message);
  }
  task.thread.lastUpdatedAt = message.createdAt;
  task.updatedAt = message.createdAt;
}

export function setWorkflowFailure(task: OperatorWorkflowTask, failure: OperatorWorkflowFailure | null) {
  task.failure = failure;
  task.updatedAt = nowIso();
}

export function workflowCardStableId(task: OperatorWorkflowTask, kind: OperatorWorkflowCardKind, stage: OperatorWorkflowStage) {
  return `${task.id}:${kind}:${stage}`;
}

export function createWorkflowEvidenceItem(
  label: string,
  detail: string,
  source: OperatorWorkflowSource,
  id?: string,
): OperatorWorkflowEvidenceItem {
  return {
    id: id && id.trim() ? id : createId('workflow-evidence'),
    label: label.trim(),
    detail: detail.trim(),
    source,
  };
}

export function createWorkflowCard(
  task: OperatorWorkflowTask,
  input: {
    kind: OperatorWorkflowCardKind;
    stage: OperatorWorkflowStage;
    title: string;
    summary: string;
    evidence?: OperatorWorkflowEvidenceItem[];
    nextStep?: string | null;
    source: OperatorWorkflowSource;
    failureCode?: OperatorWorkflowFailureCode | null;
    id?: string | null;
  },
): OperatorWorkflowCard {
  return {
    id: trimText(input.id) || workflowCardStableId(task, input.kind, input.stage),
    kind: input.kind,
    stage: input.stage,
    title: trimText(input.title) || 'Workflow stage',
    summary: trimText(input.summary) || 'No summary yet.',
    evidence: input.evidence ?? [],
    nextStep: trimText(input.nextStep) || null,
    source: input.source,
    createdAt: nowIso(),
    failureCode: input.failureCode ?? null,
  };
}

export function setWorkflowPendingConfirmation(task: OperatorWorkflowTask, pending: OperatorWorkflowPendingConfirmation | null) {
  task.pendingConfirmation = pending;
  task.updatedAt = nowIso();
}

export function appendWorkflowUserTurn(task: OperatorWorkflowTask, content: string) {
  const normalized = trimText(content);
  if (!normalized) {
    return;
  }
  task.draft = normalized;
  appendWorkflowMessage(task, {
    id: `${task.id}:thread:user:${task.thread.messages.filter((entry) => entry.role === 'user').length + 1}`,
    role: 'user',
    content: normalized,
    createdAt: nowIso(),
  });
  appendWorkflowCard(task, createWorkflowCard(task, {
    kind: 'user_message',
    stage: 'draft',
    title: 'User goal received',
    summary: normalized,
    evidence: [],
    nextStep: 'Parse the request into a grounded task before any execution starts.',
    source: 'system',
  }));
}

export function mapWorkflowErrorToFailureCode(message: string): OperatorWorkflowFailureCode {
  const normalized = message.toLowerCase();
  if (normalized.includes('proxy connect aborted')) return 'github_proxy_aborted';
  if (normalized.includes('permission denied') || normalized.includes('authentication failed') || normalized.includes('could not read username')) return 'repo_auth_failed';
  if (normalized.includes('repository url is invalid') || normalized.includes('repo_url_invalid')) return 'repo_url_invalid';
  if (normalized.includes('repository_source_missing') || normalized.includes('repo unreachable') || normalized.includes('not found') || normalized.includes('could not resolve host') || normalized.includes('failed to connect') || normalized.includes('operation timed out')) return 'repo_unreachable';
  if (normalized.includes('package_manager_unknown')) return 'package_manager_unknown';
  if (normalized.includes('workspace_detection_failed')) return 'workspace_detection_failed';
  if (normalized.includes('build_command_uncertain') || normalized.includes('unsupported preview execution') || normalized.includes('preview execution is not ready')) return 'build_command_uncertain';
  if (normalized.includes('build_script_missing')) return 'build_script_missing';
  if (normalized.includes('unsupported_stack')) return 'unsupported_stack';
  if (normalized.includes('compose_recipe_missing') || normalized.includes('compose execution recipe') || normalized.includes('compose preview/deploy handoff')) return 'compose_recipe_missing';
  if (normalized.includes('env_missing') || normalized.includes('required deployment input')) return 'env_missing';
  if (normalized.includes('static_preview_only') || normalized.includes('verified static preview lane')) return 'static_preview_only';
  if (
    normalized.includes('preview_failed')
    || normalized.includes('preview build failed')
    || normalized.includes('preview verification')
    || normalized.includes('preview_evidence_incomplete')
    || normalized.includes('preview_health_failed')
    || normalized.includes('preview_runtime_navigation_failed')
    || normalized.includes('preview_runtime_missing')
    || normalized.includes('preview_screenshot_path_missing')
    || normalized.includes('preview_static_poster_detected')
    || normalized.includes('vite_cli_not_found_after_install')
    || normalized.includes('vite build failed')
    || normalized.includes('next build failed')
    || normalized.includes('tsc: not found')
  ) return 'preview_failed';
  if (normalized.includes('missing_credentials') || normalized.includes('ssh_preflight_missing_credentials')) return 'ssh_missing_credentials';
  if (normalized.includes('auth_failed') || normalized.includes('ssh_preflight_auth_failed')) return 'ssh_auth_failed';
  if (normalized.includes('deploy_blocked') || normalized.includes('unsupported_deploy_path') || normalized.includes('production publish was blocked')) return 'deploy_blocked';
  return 'deploy_blocked';
}

export function buildWorkflowFailure(
  code: OperatorWorkflowFailureCode,
  input: {
    stage: OperatorWorkflowStage;
    summary: string;
    probableRootCause: string;
    recommendedActions: string[];
    evidence?: OperatorWorkflowEvidenceItem[];
  },
): OperatorWorkflowFailure {
  return {
    failureCode: code,
    humanSummary: trimText(input.summary) || code,
    probableRootCause: trimText(input.probableRootCause) || trimText(input.summary) || code,
    recommendedActions: input.recommendedActions.map((entry) => trimText(entry)).filter(Boolean),
    evidence: input.evidence ?? [],
    detectedAt: nowIso(),
    stage: input.stage,
  };
}

export function applyWorkflowFailure(task: OperatorWorkflowTask, failure: OperatorWorkflowFailure, source: OperatorWorkflowSource) {
  setWorkflowFailure(task, failure);
  appendWorkflowCard(task, createWorkflowCard(task, {
    kind: 'failure_diagnosis',
    stage: failure.stage,
    title: 'Failure diagnosis',
    summary: failure.humanSummary,
    evidence: failure.evidence,
    nextStep: failure.recommendedActions[0] ?? null,
    source,
    failureCode: failure.failureCode,
  }));
}
