import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { toFriendlyError } from '../lib/friendly-error';
import { preflightRepoInput } from '../lib/operator-input';
import {
  buildOperatorV3OptimisticAck,
  buildOperatorV3ViewModel,
  type OperatorV3MainAction,
} from '../lib/operator-v3-view-model';
import {
  normalizeOperatorEnvelope,
  type OperatorCapsule,
  type OperatorCapsuleListResponse,
  type OperatorEnvelope,
  type OperatorResponse,
} from '../lib/operator-types';
import {
  decodeWorkspaceTitle,
  dedupeMessagesById,
  dedupeProposalsById,
  resolveLegacyCapsuleRedirect,
  resolveSelectedWorkspaceId,
  resolveThreadKey,
  selectActiveWorkflowTask,
} from '../lib/operator-workbench-state';
import { useSite } from '../lib/site-context';
import type {
  AssistantActionProposal,
  AssistantConfirmResponse,
  AssistantMessage,
  AssistantMessagesResponse,
  AssistantPendingConfirmation,
  AssistantSessionResponse,
} from '../lib/types';
import { OperatorV3ArtifactBar } from '../components/operator-v3/OperatorV3ArtifactBar';
import {
  OperatorV3Composer,
  type OperatorV3ComposerAttachment,
} from '../components/operator-v3/OperatorV3Composer';
import {
  OperatorV3Conversation,
  type OperatorV3ConversationEntry,
} from '../components/operator-v3/OperatorV3Conversation';
import { OperatorV3DetailsDrawer } from '../components/operator-v3/OperatorV3DetailsDrawer';
import { OperatorV3Progress } from '../components/operator-v3/OperatorV3Progress';
import { OperatorV3Rail } from '../components/operator-v3/OperatorV3Rail';
import { OperatorV3Shell } from '../components/operator-v3/OperatorV3Shell';

type AssistantActionResultPayload = AssistantMessagesResponse['data']['actionResult'];
type AssistantRunState = AssistantMessagesResponse['data']['runState'];
type AssistantResponseSource = AssistantMessagesResponse['data']['source'];

type RetrySnapshot = {
  message: string;
  attachments: OperatorV3ComposerAttachment[];
  requestedAction?: AssistantActionProposal['action'];
};

type PersistedThreadState = {
  composer?: string;
  attachments?: OperatorV3ComposerAttachment[];
  planningMode?: 'on' | 'off';
  taskMode?: 'continue' | 'new_turn';
  retrySnapshot?: RetrySnapshot | null;
};

type WorkspaceThreadState = {
  sessionId: string | null;
  messages: AssistantMessage[];
  proposals: AssistantActionProposal[];
  pendingConfirmation: AssistantPendingConfirmation | null;
  actionResult: AssistantActionResultPayload | null;
  runState: AssistantRunState;
  lastSource: AssistantResponseSource;
  composer: string;
  attachments: OperatorV3ComposerAttachment[];
  attachmentError: string | null;
  assistantError: string | null;
  busy: boolean;
  planningMode: 'on' | 'off';
  taskMode: 'continue' | 'new_turn';
  optimisticEntries: OperatorV3ConversationEntry[];
  retrySnapshot: RetrySnapshot | null;
};

const recentWorkspaceStorageKey = 'operator-v3:recent-workspace';
const persistedThreadStatePrefix = 'operator-v3:thread:';
const maxTextAttachmentBytes = 260 * 1024;
const maxAttachmentCount = 4;

function actionResultLinks(actionResult: AssistantActionResultPayload | null) {
  const record = actionResult?.data && typeof actionResult.data === 'object'
    ? actionResult.data as Record<string, unknown>
    : null;

  return {
    capsulePath: typeof record?.capsulePath === 'string' ? record.capsulePath : null,
  };
}

function extractCapsuleIdFromPath(path: string | null | undefined) {
  const match = path?.match(/\/(?:workspaces|operator)\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function createEmptyThreadState(persisted?: PersistedThreadState): WorkspaceThreadState {
  return {
    sessionId: null,
    messages: [],
    proposals: [],
    pendingConfirmation: null,
    actionResult: null,
    runState: 'draft',
    lastSource: 'system',
    composer: persisted?.composer ?? '',
    attachments: Array.isArray(persisted?.attachments) ? persisted!.attachments! : [],
    attachmentError: null,
    assistantError: null,
    busy: false,
    planningMode: persisted?.planningMode === 'on' ? 'on' : 'off',
    taskMode: persisted?.taskMode === 'new_turn' ? 'new_turn' : 'continue',
    optimisticEntries: [],
    retrySnapshot: persisted?.retrySnapshot ?? null,
  };
}

function readPersistedThreadState(threadKey: string): PersistedThreadState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(`${persistedThreadStatePrefix}${threadKey}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedThreadState;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function persistThreadState(threadKey: string, state: WorkspaceThreadState) {
  if (typeof window === 'undefined') {
    return;
  }

  const payload: PersistedThreadState = {
    composer: state.composer,
    attachments: state.attachments,
    planningMode: state.planningMode,
    taskMode: state.taskMode,
    retrySnapshot: state.retrySnapshot,
  };

  try {
    window.sessionStorage.setItem(`${persistedThreadStatePrefix}${threadKey}`, JSON.stringify(payload));
  } catch {
    // Ignore storage failures in the browser.
  }
}

function isLikelyTextAttachment(file: File) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) {
    return true;
  }

  return [
    '.txt',
    '.md',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.conf',
    '.env',
    '.log',
    '.sh',
    '.js',
    '.ts',
    '.tsx',
    '.jsx',
    '.py',
    '.php',
    '.java',
    '.go',
    '.rs',
    '.sql',
    '.xml',
    '.html',
    '.css',
  ].some((ext) => name.endsWith(ext))
    || name === 'dockerfile'
    || name.includes('docker-compose')
    || name.includes('compose.');
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
  });
}

function sortWorkspacesByUpdatedAt(workspaces: OperatorCapsule[]) {
  return [...workspaces].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt ?? '');
    const rightTime = Date.parse(right.updatedAt ?? '');
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
}

function mergeConversationEntries(
  selectedWorkspaceId: string | null,
  envelope: OperatorEnvelope | null,
  threadState: WorkspaceThreadState,
): OperatorV3ConversationEntry[] {
  const workflowMessages = selectedWorkspaceId
    ? (selectActiveWorkflowTask(envelope)?.thread.messages ?? [])
    : [];
  const merged = new Map<string, OperatorV3ConversationEntry>();

  for (const message of [...workflowMessages, ...threadState.messages]) {
    merged.set(message.id, {
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      status: 'done',
    });
  }

  for (const entry of threadState.optimisticEntries) {
    merged.set(entry.id, entry);
  }

  return [...merged.values()].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

export function OperatorV3Page() {
  const { capsuleId: routeCapsuleId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { locale, text } = useSite();
  const { isAuthenticated } = useAuth();
  const zh = locale.toLowerCase().startsWith('zh');
  const queryCapsuleId = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('capsule');
    const normalized = raw?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
  }, [location.search]);
  const selectedWorkspaceId = resolveSelectedWorkspaceId(routeCapsuleId, queryCapsuleId);
  const activeThreadKey = resolveThreadKey(selectedWorkspaceId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [threadStates, setThreadStates] = useState<Record<string, WorkspaceThreadState>>({});

  const { data: workspacesResponse, error: workspacesError, loading: workspacesLoading } = useApiData<OperatorCapsuleListResponse>(
    `/api/v1/operator/workspaces?refresh=${refreshTick}`,
    { preserveData: true },
  );
  const workspaces = useMemo(
    () => sortWorkspacesByUpdatedAt(Array.isArray(workspacesResponse?.data) ? workspacesResponse.data : []),
    [workspacesResponse?.data],
  );
  const { data: workspaceResponse, error: workspaceError, loading: workspaceLoading } = useApiData<OperatorResponse>(
    selectedWorkspaceId ? `/api/v1/operator/workspaces/${selectedWorkspaceId}?refresh=${refreshTick}` : null,
    { preserveData: true },
  );
  const envelope = useMemo(() => normalizeOperatorEnvelope(workspaceResponse?.data ?? null), [workspaceResponse?.data]);
  const activeWorkflowTask = useMemo(() => selectActiveWorkflowTask(envelope), [envelope]);
  const activeThread = threadStates[activeThreadKey] ?? createEmptyThreadState(readPersistedThreadState(activeThreadKey) ?? undefined);
  const conversationEntries = useMemo(
    () => mergeConversationEntries(selectedWorkspaceId, envelope, activeThread),
    [activeThread, envelope, selectedWorkspaceId],
  );
  const viewModel = useMemo(
    () => buildOperatorV3ViewModel({
      envelope,
      workspaces,
      selectedWorkspaceId,
      locale,
    }),
    [envelope, locale, selectedWorkspaceId, workspaces],
  );

  const workspaceTitle = decodeWorkspaceTitle(
    envelope?.capsule.name
      ?? selectedWorkspaceId
      ?? (zh ? '新的工作台' : 'New workspace'),
  );
  const assistantError = activeThread.assistantError
    ?? (workspaceError && selectedWorkspaceId && !envelope
      ? `${text.common.error}: ${toFriendlyError(new Error(workspaceError), locale)}`
      : null);
  const pageMainAction = activeThread.pendingConfirmation && !selectedWorkspaceId
    ? {
      kind: 'confirm_plan' as const,
      label: zh ? '确认继续' : 'Confirm and continue',
    }
    : viewModel.progress.mainAction;
  const canContinueCurrentTask = Boolean(selectedWorkspaceId && activeWorkflowTask);

  function setThreadState(
    threadKey: string,
    updater: (current: WorkspaceThreadState) => WorkspaceThreadState,
  ) {
    setThreadStates((current) => {
      const existing = current[threadKey] ?? createEmptyThreadState(readPersistedThreadState(threadKey) ?? undefined);
      const next = updater(existing);
      if (next === existing) {
        return current;
      }
      persistThreadState(threadKey, next);
      return {
        ...current,
        [threadKey]: next,
      };
    });
  }

  function setActiveThreadState(updater: (current: WorkspaceThreadState) => WorkspaceThreadState) {
    setThreadState(activeThreadKey, updater);
  }

  function selectWorkspace(id: string) {
    try {
      window.localStorage.setItem(recentWorkspaceStorageKey, id);
    } catch {
      // Ignore storage failures.
    }
    navigate(`/operator/${id}`);
  }

  function pushOptimisticEntries(entries: OperatorV3ConversationEntry[]) {
    setActiveThreadState((current) => ({
      ...current,
      optimisticEntries: entries,
    }));
  }

  function syncWorkspaceFromActionResult(actionResult: AssistantActionResultPayload | null) {
    const capsuleId = extractCapsuleIdFromPath(actionResultLinks(actionResult).capsulePath);
    if (capsuleId) {
      selectWorkspace(capsuleId);
    }
  }

  useEffect(() => {
    const target = resolveLegacyCapsuleRedirect(routeCapsuleId, queryCapsuleId);
    if (target) {
      navigate(target, { replace: true });
    }
  }, [navigate, queryCapsuleId, routeCapsuleId]);

  useEffect(() => {
    if (selectedWorkspaceId || workspacesLoading || workspaces.length === 0) {
      return;
    }

    let target = workspaces[0]?.id ?? null;
    try {
      const stored = window.localStorage.getItem(recentWorkspaceStorageKey);
      if (stored && workspaces.some((workspace) => workspace.id === stored)) {
        target = stored;
      }
    } catch {
      // Ignore storage failures.
    }

    if (target) {
      navigate(`/operator/${target}`, { replace: true });
    }
  }, [navigate, selectedWorkspaceId, workspaces, workspacesLoading]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    try {
      window.localStorage.setItem(recentWorkspaceStorageKey, selectedWorkspaceId);
    } catch {
      // Ignore storage failures.
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    setActiveThreadState((current) => ({
      ...current,
      planningMode: activeWorkflowTask?.planningMode ?? current.planningMode,
      taskMode: current.taskMode === 'new_turn' ? 'new_turn' : 'continue',
    }));
  }, [activeThreadKey, activeWorkflowTask?.id, activeWorkflowTask?.planningMode, selectedWorkspaceId]);

  useEffect(() => {
    const shouldPoll = Boolean(
      envelope
      && (
        envelope.latestJob?.status === 'running'
        || envelope.latestJob?.status === 'queued'
        || ['parsing', 'preflight', 'llm_planning', 'queued', 'running', 'verifying'].includes(activeWorkflowTask?.currentStage ?? '')
      ),
    );
    if (!shouldPoll) {
      return;
    }

    const timer = window.setInterval(() => {
      setRefreshTick((current) => current + 1);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [activeWorkflowTask?.currentStage, envelope, envelope?.latestJob?.status]);

  useEffect(() => {
    const current = threadStates[activeThreadKey];
    if (current) {
      persistThreadState(activeThreadKey, current);
    }
  }, [activeThreadKey, threadStates]);

  useEffect(() => {
    if (activeThread.sessionId) {
      return;
    }

    let cancelled = false;
    async function openSession() {
      try {
        const response = await requestJson<AssistantSessionResponse>('/api/v1/assistant/session', {
          method: 'POST',
          body: {
            locale,
            context: {
              path: selectedWorkspaceId ? `/operator/${selectedWorkspaceId}` : '/operator',
              locale,
              capsuleId: selectedWorkspaceId,
            },
          },
        });
        if (cancelled) {
          return;
        }
        setThreadState(activeThreadKey, (current) => ({
          ...current,
          sessionId: response.data.session.sessionId,
          messages: dedupeMessagesById(response.data.session.messages ?? []),
          assistantError: null,
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setThreadState(activeThreadKey, (current) => ({
          ...current,
          assistantError: toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale),
        }));
      }
    }

    void openSession();
    return () => {
      cancelled = true;
    };
  }, [activeThread.sessionId, activeThreadKey, locale, selectedWorkspaceId, threadStates]);

  async function ensureSession(threadKey: string) {
    const existing = threadStates[threadKey] ?? createEmptyThreadState(readPersistedThreadState(threadKey) ?? undefined);
    if (existing.sessionId) {
      return existing.sessionId;
    }

    const response = await requestJson<AssistantSessionResponse>('/api/v1/assistant/session', {
      method: 'POST',
      body: {
        locale,
        context: {
          path: selectedWorkspaceId ? `/operator/${selectedWorkspaceId}` : '/operator',
          locale,
          capsuleId: selectedWorkspaceId,
        },
      },
    });

    setThreadState(threadKey, (current) => ({
      ...current,
      sessionId: response.data.session.sessionId,
      messages: dedupeMessagesById(response.data.session.messages ?? []),
      assistantError: null,
    }));
    return response.data.session.sessionId;
  }

  async function sendAssistantMessage(
    message: string,
    options?: {
      requestedAction?: AssistantActionProposal['action'];
      retrySnapshot?: RetrySnapshot;
    },
  ) {
    const sessionId = await ensureSession(activeThreadKey);
    const thread = threadStates[activeThreadKey] ?? activeThread;
    const outgoingAttachments = options?.retrySnapshot?.attachments ?? thread.attachments;
    const retrySnapshot = options?.retrySnapshot ?? {
      message,
      attachments: outgoingAttachments,
      requestedAction: options?.requestedAction,
    };
    const optimisticAck = buildOperatorV3OptimisticAck({
      message,
      locale,
      hasArtifact: Boolean(viewModel.artifact),
    });
    const createdAt = new Date().toISOString();
    const optimisticEntries: OperatorV3ConversationEntry[] = [
      {
        id: `optimistic-user-${createdAt}`,
        role: 'user',
        content: message,
        createdAt,
        status: 'sending',
      },
      {
        id: `optimistic-system-${createdAt}`,
        role: 'system',
        content: optimisticAck,
        createdAt,
        status: 'sending',
      },
    ];

    pushOptimisticEntries(optimisticEntries);
    setActiveThreadState((current) => ({
      ...current,
      busy: true,
      runState: 'parsing',
      lastSource: 'system',
      assistantError: null,
      attachmentError: null,
      composer: '',
      attachments: [],
      retrySnapshot,
    }));

    try {
      const response = await requestJson<AssistantMessagesResponse>('/api/v1/assistant/messages', {
        method: 'POST',
        body: {
          sessionId,
          message,
          locale,
          planningMode: thread.planningMode,
          taskMode: thread.taskMode,
          autoRoute: true,
          context: {
            path: selectedWorkspaceId ? `/operator/${selectedWorkspaceId}` : '/operator',
            locale,
            capsuleId: selectedWorkspaceId,
          },
          attachments: outgoingAttachments,
          requestedAction: options?.requestedAction,
        },
      });

      setActiveThreadState((current) => ({
        ...current,
        sessionId: response.data.session.sessionId,
        messages: dedupeMessagesById(response.data.session.messages ?? []),
        proposals: dedupeProposalsById(response.data.proposals ?? []),
        pendingConfirmation: response.data.pendingConfirmation ?? null,
        actionResult: response.data.actionResult ?? null,
        runState: response.data.runState ?? 'running',
        lastSource: response.data.source ?? 'system',
        assistantError: null,
        busy: false,
        planningMode: response.data.workflow?.planningMode ?? current.planningMode,
        taskMode: 'continue',
        optimisticEntries: [],
        retrySnapshot: null,
      }));
      if (response.data.workspace?.capsuleId) {
        selectWorkspace(response.data.workspace.capsuleId);
      } else {
        syncWorkspaceFromActionResult(response.data.actionResult ?? null);
      }
      setRefreshTick((current) => current + 1);
    } catch (error) {
      const friendly = toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale);
      setActiveThreadState((current) => ({
        ...current,
        busy: false,
        runState: 'failed',
        lastSource: 'system',
        assistantError: friendly,
        composer: retrySnapshot.message,
        attachments: retrySnapshot.attachments,
        optimisticEntries: [
          {
            ...optimisticEntries[0],
            status: 'done',
          },
          {
            ...optimisticEntries[1],
            content: `${optimisticAck}\n\n${friendly}`,
            status: 'failed',
            retryable: true,
          },
        ],
        retrySnapshot,
      }));
    }
  }

  async function confirmAssistantAction() {
    if (!activeThread.pendingConfirmation) {
      return;
    }

    const sessionId = await ensureSession(activeThreadKey);
    setActiveThreadState((current) => ({
      ...current,
      busy: true,
      assistantError: null,
    }));

    try {
      const response = await requestJson<AssistantConfirmResponse>('/api/v1/assistant/actions/confirm', {
        method: 'POST',
        body: {
          sessionId,
          confirmToken: activeThread.pendingConfirmation.token,
          locale,
        },
      });
      setActiveThreadState((current) => ({
        ...current,
        sessionId: response.data.session.sessionId,
        messages: dedupeMessagesById(response.data.session.messages ?? []),
        pendingConfirmation: null,
        actionResult: response.data.actionResult ?? null,
        runState: response.data.runState ?? 'success',
        lastSource: response.data.source ?? 'system',
        assistantError: null,
        busy: false,
        optimisticEntries: [],
      }));
      if (response.data.workspace?.capsuleId) {
        selectWorkspace(response.data.workspace.capsuleId);
      } else {
        syncWorkspaceFromActionResult(response.data.actionResult ?? null);
      }
      setRefreshTick((current) => current + 1);
    } catch (error) {
      setActiveThreadState((current) => ({
        ...current,
        busy: false,
        assistantError: toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale),
      }));
    }
  }

  async function queueWorkspaceAction(
    path: string,
    body: Record<string, unknown>,
    fallbackBusyState: AssistantRunState,
  ) {
    if (!envelope?.capsule.id) {
      return;
    }

    const ack = buildOperatorV3OptimisticAck({
      message: body.operation === 'deploy_playable' ? 'deploy playable' : 'continue current task',
      locale,
      hasArtifact: true,
    });
    pushOptimisticEntries([
      {
        id: `workspace-action-${Date.now()}`,
        role: 'system',
        content: ack,
        createdAt: new Date().toISOString(),
        status: 'sending',
      },
    ]);
    setActiveThreadState((current) => ({
      ...current,
      busy: true,
      runState: fallbackBusyState,
      assistantError: null,
    }));

    try {
      await requestJson<OperatorResponse>(path, {
        method: 'POST',
        body,
      });
      setActiveThreadState((current) => ({
        ...current,
        busy: false,
        optimisticEntries: [],
      }));
      setRefreshTick((current) => current + 1);
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.statusCode === 401 && !isAuthenticated) {
        navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
        return;
      }
      setActiveThreadState((current) => ({
        ...current,
        busy: false,
        assistantError: toFriendlyError(apiError, locale),
        optimisticEntries: current.optimisticEntries.map((entry) => ({
          ...entry,
          status: 'failed',
        })),
      }));
    }
  }

  async function handleContinueCurrentTask(operation: 'continue' | 'deploy_playable' = 'continue') {
    if (!envelope?.capsule.id || !activeWorkflowTask) {
      setActiveThreadState((current) => ({
        ...current,
        assistantError: zh ? '当前没有可继续的活跃任务。' : 'There is no active task to continue right now.',
      }));
      return;
    }

    await queueWorkspaceAction(
      `/api/v1/operator/workspaces/${envelope.capsule.id}/continue`,
      {
        taskId: activeWorkflowTask.id,
        pendingConfirmationId: activeWorkflowTask.pendingConfirmation?.token ?? undefined,
        operation,
      },
      operation === 'deploy_playable' ? 'queued' : activeWorkflowTask.currentStage === 'awaiting_confirmation' ? 'queued' : activeThread.runState,
    );
  }

  async function handleConfirmActivePlan() {
    if (!envelope?.capsule.id || !activeWorkflowTask) {
      return;
    }

    await queueWorkspaceAction(
      `/api/v1/operator/workspaces/${envelope.capsule.id}/confirm-active-plan`,
      {
        taskId: activeWorkflowTask.id,
        pendingConfirmationId: activeWorkflowTask.pendingConfirmation?.token ?? undefined,
      },
      'queued',
    );
  }

  async function handleSubmitMessage() {
    const normalized = activeThread.composer.trim();
    if (!normalized && activeThread.attachments.length === 0) {
      return;
    }

    const repoPreflight = preflightRepoInput(normalized);
    if (repoPreflight.invalidRepoUrl || (repoPreflight.hasRepoHostUrl && !repoPreflight.repoUrl)) {
      setActiveThreadState((current) => ({
        ...current,
        assistantError: zh
          ? '仓库地址看起来不合法。请只粘贴纯仓库 URL，例如 https://github.com/org/repo。'
          : 'The repository link looks invalid. Please provide a clean repository URL such as https://github.com/org/repo.',
      }));
      return;
    }

    const messageForAssistant = repoPreflight.repoUrl
      ? (repoPreflight.taskDescription
        ? `${repoPreflight.taskDescription}\n\n${repoPreflight.repoUrl}`
        : repoPreflight.repoUrl)
      : normalized;

    await sendAssistantMessage(
      messageForAssistant || (zh ? '请读取我上传的项目文件并进入规划。' : 'Read the uploaded project files and enter planning mode.'),
    );
  }

  async function handleRetrySend() {
    if (!activeThread.retrySnapshot) {
      return;
    }
    await sendAssistantMessage(activeThread.retrySnapshot.message, {
      requestedAction: activeThread.retrySnapshot.requestedAction,
      retrySnapshot: activeThread.retrySnapshot,
    });
  }

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) {
      return;
    }

    if (activeThread.attachments.length + files.length > maxAttachmentCount) {
      setActiveThreadState((current) => ({
        ...current,
        attachmentError: zh ? `最多上传 ${maxAttachmentCount} 个文件。` : `You can upload up to ${maxAttachmentCount} files.`,
      }));
      return;
    }

    try {
      const parsed = await Promise.all(files.map(async (file, index) => {
        if (!isLikelyTextAttachment(file)) {
          throw new Error(zh ? '目前只支持上传文本项目文件，例如 Dockerfile、compose、package.json、配置文件或源码。' : 'Only text project files are supported right now, such as Dockerfile, compose files, package.json, config files, or source code.');
        }
        if (file.size > maxTextAttachmentBytes) {
          throw new Error(zh ? `${file.name} 过大，请控制在 ${Math.round(maxTextAttachmentBytes / 1024)}KB 以内。` : `${file.name} is too large. Keep it under ${Math.round(maxTextAttachmentBytes / 1024)}KB.`);
        }

        const textContent = await readFileAsText(file);
        return {
          id: `${file.name}-${file.lastModified}-${index}`,
          name: file.name,
          mimeType: file.type || 'text/plain',
          sizeBytes: file.size,
          textContent,
        } satisfies OperatorV3ComposerAttachment;
      }));

      setActiveThreadState((current) => ({
        ...current,
        attachments: [...current.attachments, ...parsed],
        attachmentError: null,
      }));
    } catch (error) {
      setActiveThreadState((current) => ({
        ...current,
        attachmentError: toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale),
      }));
    }
  }

  function handleMainAction(action: OperatorV3MainAction | null) {
    if (!action) {
      return;
    }

    if (action.kind === 'continue') {
      void handleContinueCurrentTask('continue');
      return;
    }
    if (action.kind === 'confirm_plan') {
      if (selectedWorkspaceId && activeWorkflowTask?.currentStage === 'awaiting_confirmation') {
        void handleConfirmActivePlan();
        return;
      }
      void confirmAssistantAction();
      return;
    }
    if (action.kind === 'deploy_playable') {
      void handleContinueCurrentTask('deploy_playable');
      return;
    }
    if (action.kind === 'open_preview' && action.href) {
      window.open(action.href, '_blank', 'noopener,noreferrer');
      return;
    }
    if (action.kind === 'prefill') {
      setActiveThreadState((current) => ({
        ...current,
        composer: action.prompt ?? current.composer,
      }));
      setDrawerOpen(false);
      return;
    }
    if (action.kind === 'details') {
      setDrawerOpen(true);
      return;
    }
    if (action.kind === 'retry_send') {
      void handleRetrySend();
    }
  }

  const loading = workspacesLoading || (workspaceLoading && Boolean(selectedWorkspaceId) && !envelope);
  if (loading && workspaces.length === 0 && conversationEntries.length === 0) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (workspacesError && workspaces.length === 0) {
    return <div className="error-card">{text.common.error}: {toFriendlyError(new Error(workspacesError), locale)}</div>;
  }

  const overviewCanDo = canContinueCurrentTask
    ? (zh ? '继续当前任务、发起新回合或补充文件。' : 'Continue the current task, start a new turn, or upload files.')
    : (zh ? '直接输入目标、仓库地址，或上传项目文件。' : 'Type a goal, paste a repository, or upload project files.');
  const overviewDoing = activeThread.busy
    ? (zh ? '系统正在处理你刚刚的输入。' : 'The system is processing your latest input.')
    : viewModel.progress.summary;
  const overviewNext = pageMainAction?.label
    ?? viewModel.artifact?.mainAction?.label
    ?? (zh ? '先发送一句明确的目标。' : 'Send one clear instruction to begin.');

  return (
    <OperatorV3Shell
      drawer={(
        <OperatorV3DetailsDrawer
          drawer={viewModel.drawer}
          locale={locale}
          onToggle={() => setDrawerOpen((current) => !current)}
          open={drawerOpen}
        />
      )}
      rail={(
        <OperatorV3Rail
          items={viewModel.railItems}
          locale={locale}
          onSelectWorkspace={selectWorkspace}
        />
      )}
      stage={(
        <div className="operator-v3-stage">
          <section className="operator-v3-panel operator-v3-overview">
            <div className="operator-v3-overview__grid">
              <div>
                <span className="operator-v3-eyebrow">{zh ? '当前项目' : 'Current project'}</span>
                <strong>{workspaceTitle}</strong>
              </div>
              <div>
                <span className="operator-v3-eyebrow">{zh ? '我现在能做什么' : 'What you can do now'}</span>
                <strong>{overviewCanDo}</strong>
              </div>
              <div>
                <span className="operator-v3-eyebrow">{zh ? '系统正在做什么' : 'What the system is doing'}</span>
                <strong>{overviewDoing}</strong>
              </div>
              <div>
                <span className="operator-v3-eyebrow">{zh ? '下一步按哪里' : 'Next button'}</span>
                <strong>{overviewNext}</strong>
              </div>
            </div>
          </section>

          <OperatorV3Progress
            locale={locale}
            onMainAction={() => handleMainAction(pageMainAction)}
            progress={{
              ...viewModel.progress,
              mainAction: pageMainAction,
            }}
          />

          <OperatorV3ArtifactBar
            artifact={viewModel.artifact}
            locale={locale}
            onMainAction={() => handleMainAction(viewModel.artifact?.mainAction ?? null)}
          />

          {viewModel.failure ? (
            <section className="operator-v3-panel operator-v3-failure" data-testid="operator-v3-failure-card">
              <div className="operator-v3-failure__grid">
                <div>
                  <span className="operator-v3-eyebrow">{zh ? '发生了什么' : 'What happened'}</span>
                  <strong>{viewModel.failure.happened}</strong>
                </div>
                <div>
                  <span className="operator-v3-eyebrow">{zh ? '为什么' : 'Why'}</span>
                  <strong>{viewModel.failure.why}</strong>
                </div>
                <div>
                  <span className="operator-v3-eyebrow">{zh ? '推荐下一步' : 'Recommended next step'}</span>
                  <strong>{viewModel.failure.nextStep}</strong>
                </div>
              </div>

              {viewModel.failure.mainAction ? (
                <div className="operator-v3-failure__actions">
                  <button
                    className="button secondary"
                    onClick={() => handleMainAction(viewModel.failure?.mainAction ?? null)}
                    type="button"
                  >
                    {viewModel.failure.mainAction.label}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          <OperatorV3Conversation
            emptyLabel={zh ? '从一句需求开始，系统会把会话、产物和下一步收拢在这里。' : 'Start with one request and the system will keep the conversation, artifact, and next step here.'}
            entries={conversationEntries}
            locale={locale}
            onRetry={() => void handleRetrySend()}
            subtitle={selectedWorkspaceId
              ? (zh ? '同一 workspace 会持续沿用当前产物，不会回退到欢迎语。' : 'The same workspace keeps reusing the current artifact instead of falling back to a welcome state.')
              : (zh ? '默认界面只保留当前会话、当前产物和下一步动作。' : 'The default surface keeps only the current conversation, artifact, and next action.')}
            title={workspaceTitle}
          />

          <OperatorV3Composer
            assistantError={assistantError}
            attachmentError={activeThread.attachmentError}
            attachments={activeThread.attachments}
            busy={activeThread.busy}
            canContinueCurrentTask={canContinueCurrentTask}
            composer={activeThread.composer}
            fileInputRef={fileInputRef}
            locale={locale}
            onAttachmentChange={(event) => void handleAttachmentChange(event)}
            onAttachmentRemove={(attachmentId) => setActiveThreadState((current) => ({
              ...current,
              attachments: current.attachments.filter((entry) => entry.id !== attachmentId),
            }))}
            onComposerChange={(value) => setActiveThreadState((current) => ({
              ...current,
              composer: value,
            }))}
            onContinueCurrentTask={() => void handleContinueCurrentTask('continue')}
            onPlanningModeChange={(checked) => setActiveThreadState((current) => ({
              ...current,
              planningMode: checked ? 'on' : 'off',
            }))}
            onSubmit={() => void handleSubmitMessage()}
            onTaskModeChange={(mode) => setActiveThreadState((current) => ({
              ...current,
              taskMode: mode,
            }))}
            planningMode={activeThread.planningMode}
            taskMode={activeThread.taskMode}
          />
        </div>
      )}
    />
  );
}
