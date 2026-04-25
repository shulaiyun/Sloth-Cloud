import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { ApiError, requestJson, useApiData } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import {
  ComposerFooter,
  TimelinePanel,
  TruthPanel,
  WorkspaceRail,
} from '../components/operator/OperatorWorkflowLayout';
import { toFriendlyError } from '../lib/friendly-error';
import {
  normalizeOperatorEnvelope,
  type OperatorActionIntent,
  type OperatorCapsule,
  type OperatorCapsuleListResponse,
  type OperatorEnvelope,
  type OperatorResponse,
} from '../lib/operator-types';
import { normalizeOperatorApiUrl } from '../lib/operator-url';
import { preflightRepoInput } from '../lib/operator-input';
import {
  decodeWorkspaceTitle,
  dedupeMessagesById,
  dedupeProposalsById,
  lobbyThreadKey,
  mergeActionCards,
  resolveActiveTaskTruth,
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

const actionPathMap: Record<Exclude<OperatorActionIntent, 'open_capsule'>, string> = {
  deploy_preview: '/api/v1/operator/deployments/preview',
  publish_release: '/api/v1/operator/deployments/publish',
  diagnose_service: '/api/v1/operator/services/diagnose',
  repair_service: '/api/v1/operator/services/repair',
  rollback_release: '/api/v1/operator/services/rollback',
  takeover_server: '/api/v1/operator/servers/takeover',
  migrate_server: '/api/v1/operator/servers/migrate',
};

type QuickIntent = 'repo' | 'idea' | 'plan' | 'server';
type StageVerdictKind = 'success' | 'partial_success' | 'failed' | 'awaiting_confirmation' | 'running';
type AssistantActionResultPayload = AssistantMessagesResponse['data']['actionResult'];
type AssistantRunState = AssistantMessagesResponse['data']['runState'];
type AssistantResponseSource = AssistantMessagesResponse['data']['source'];
type ComposerAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  textContent: string;
};
type WorkspaceThreadState = {
  sessionId: string | null;
  messages: AssistantMessage[];
  proposals: AssistantActionProposal[];
  pendingConfirmation: AssistantPendingConfirmation | null;
  actionResult: AssistantActionResultPayload | null;
  runState: AssistantRunState;
  lastSource: AssistantResponseSource;
  actionCards: Array<{
    id: string;
    source: AssistantResponseSource;
  }>;
  composer: string;
  attachments: ComposerAttachment[];
  attachmentError: string | null;
  assistantError: string | null;
  busy: boolean;
  planningMode: 'on' | 'off';
  taskMode: 'continue' | 'new_turn';
};
type WorkflowContinueTrace = {
  frontEndEventAt: string;
  apiRequestedAt: string | null;
  apiRespondedAt: string | null;
  backendStage: string | null;
  executorJobId: string | null;
  executorStatus: string | null;
  error: string | null;
};

const maxTextAttachmentBytes = 260 * 1024;
const maxAttachmentCount = 4;

function createEmptyThreadState(): WorkspaceThreadState {
  return {
    sessionId: null,
    messages: [],
    proposals: [],
    pendingConfirmation: null,
    actionResult: null,
    runState: 'draft',
    lastSource: 'system',
    actionCards: [],
    composer: '',
    attachments: [],
    attachmentError: null,
    assistantError: null,
    busy: false,
    planningMode: 'off',
    taskMode: 'continue',
  };
}

function formatTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return '-';
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat(locale.startsWith('zh') ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function capsuleStatusLabel(status: string, locale: string) {
  const zh = locale.startsWith('zh');
  const labels: Record<string, string> = {
    planning: zh ? '计划中' : 'Planning',
    preview_live: zh ? '预览可用' : 'Preview live',
    production_live: zh ? '正式版在线' : 'Production live',
    needs_attention: zh ? '需要处理' : 'Needs attention',
    takeover_ready: zh ? '可接管' : 'Takeover ready',
    migration_ready: zh ? '可迁移' : 'Migration ready',
  };
  return labels[status] ?? status;
}

function truthStateLabel(state: string | null | undefined, locale: string) {
  const zh = locale.startsWith('zh');
  const labels: Record<string, string> = {
    planning: zh ? '规划中' : 'Planning',
    waiting_for_inputs: zh ? '等待补充信息' : 'Waiting for inputs',
    verifying_repo: zh ? '正在验证仓库' : 'Verifying repository',
    job_running: zh ? '正在执行' : 'Job running',
    env_blocked: zh ? '环境项阻塞' : 'Environment blocked',
    preview_ready: zh ? '预览已验证' : 'Preview verified',
    preview_failed: zh ? '预览失败' : 'Preview failed',
    ready_for_production_approval: zh ? '可申请生产发布' : 'Ready for production approval',
    audit_ready: zh ? '体检完成' : 'Audit ready',
    audit_failed: zh ? '体检失败' : 'Audit failed',
    rollback_ready: zh ? '可回滚' : 'Rollback ready',
    needs_attention: zh ? '需要关注' : 'Needs attention',
    production_live: zh ? '正式版在线' : 'Production live',
  };
  return labels[state ?? 'planning'] ?? state ?? '-';
}

function statusClassName(status: string | null | undefined) {
  if (
    status === 'preview_live'
    || status === 'production_live'
    || status === 'preview_ready'
    || status === 'audit_ready'
    || status === 'ready'
    || status === 'ready_for_production_approval'
  ) {
    return 'status-active';
  }
  if (
    status === 'needs_attention'
    || status === 'preview_failed'
    || status === 'audit_failed'
    || status === 'blocked'
    || status === 'env_blocked'
  ) {
    return 'status-overdue';
  }
  if (
    status === 'job_running'
    || status === 'running'
    || status === 'queued'
    || status === 'verifying_repo'
  ) {
    return 'status-running';
  }
  return 'status-pending';
}

function entryKindLabel(entryKind: OperatorCapsule['entryKind'], locale: string) {
  if (locale.startsWith('zh')) {
    if (entryKind === 'upload-project') return '仓库导入';
    if (entryKind === 'generate-from-idea') return '想法生成';
    return '旧服务器体检';
  }

  if (entryKind === 'upload-project') return 'Repo ingest';
  if (entryKind === 'generate-from-idea') return 'Idea build';
  return 'Server audit';
}

function quickIntentPrompt(intent: QuickIntent, locale: string) {
  const zh = locale.startsWith('zh');
  if (intent === 'repo') {
    return zh
      ? '把这个仓库部署到服务器 #19：\n\n要求：自动识别技术栈、先隔离验证，再决定是否进入生产发布。'
      : 'Deploy this repository to server #19.\n\nRequirements: auto-detect the stack, verify it in isolation first, and only then decide whether production can proceed.';
  }
  if (intent === 'idea') {
    return zh
      ? '我现在还没有项目，请先进入规划模式。先帮我输出 GDD / PRD / 部署计划，再等我确认后生成 MVP。'
      : 'I do not have a project yet. Start in planning mode first, produce the GDD / PRD / deployment plan, and only generate the MVP after I confirm.';
  }
  if (intent === 'server') {
    return zh
      ? '先对这台旧服务器做体检，只读采集，不要直接改动服务器：'
      : 'Start with a read-only audit of this existing server. Do not mutate the server yet:';
  }
  return zh
    ? '我不会表达，请先帮我进入规划模式，把需求收束成一个可执行的 MVP 方案。'
    : 'I am not sure how to describe this yet. Start with planning mode and help me turn it into an executable MVP plan.';
}

function extractCapsuleIdFromPath(path: string | null | undefined) {
  const match = path?.match(/\/(?:workspaces|operator)\/([^/?#]+)/);
  return match?.[1] ?? null;
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

function actionResultLinks(actionResult: AssistantActionResultPayload | null) {
  const data = actionResult?.data;
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : null;

  return {
    capsulePath: typeof record?.capsulePath === 'string' ? record.capsulePath : null,
    capsuleUrl: typeof record?.capsuleUrl === 'string' ? record.capsuleUrl : null,
    previewUrl: typeof record?.previewUrl === 'string' ? record.previewUrl : null,
  };
}

function buildActionCards(
  source: AssistantResponseSource,
  input: {
    proposals: AssistantActionProposal[];
    pendingConfirmation: AssistantPendingConfirmation | null;
    actionResult: AssistantActionResultPayload | null;
  },
) {
  const cards: Array<{ id: string; source: AssistantResponseSource }> = [];
  for (const proposal of input.proposals) {
    cards.push({ id: `proposal:${proposal.id}`, source });
  }
  if (input.pendingConfirmation) {
    cards.push({ id: `confirmation:${input.pendingConfirmation.token}`, source });
  }
  if (input.actionResult) {
    const actionId = input.actionResult.operationId ?? input.actionResult.code;
    cards.push({ id: `result:${actionId}`, source });
  }
  return cards;
}

function stageVerdict(envelope: OperatorEnvelope | null): StageVerdictKind {
  if (!envelope) {
    return 'awaiting_confirmation';
  }

  const activeTask = envelope.workflow.activeTaskId
    ? envelope.workflow.tasks.find((task) => task.id === envelope.workflow.activeTaskId) ?? null
    : envelope.workflow.tasks.at(-1) ?? null;
  if (activeTask?.currentStage === 'success') {
    return 'success';
  }
  if (activeTask?.currentStage === 'partial_success') {
    return 'partial_success';
  }
  if (activeTask?.currentStage === 'failed' || activeTask?.currentStage === 'blocked') {
    return 'failed';
  }
  if (activeTask?.currentStage === 'running' || activeTask?.currentStage === 'queued' || activeTask?.currentStage === 'verifying' || activeTask?.currentStage === 'preflight') {
    return 'running';
  }
  if (activeTask?.currentStage === 'awaiting_confirmation') {
    return 'awaiting_confirmation';
  }

  if (envelope.truthState === 'production_live') {
    return 'success';
  }
  if (
    envelope.truthState === 'preview_failed'
    || envelope.truthState === 'audit_failed'
    || envelope.truthState === 'needs_attention'
    || envelope.truthState === 'env_blocked'
  ) {
    return 'failed';
  }
  if (
    envelope.truthState === 'verifying_repo'
    || envelope.truthState === 'job_running'
    || envelope.latestJob?.status === 'running'
    || envelope.latestJob?.status === 'queued'
  ) {
    return 'running';
  }
  if (
    envelope.previewSummary.verified
    || envelope.truthState === 'preview_ready'
    || envelope.truthState === 'ready_for_production_approval'
  ) {
    return 'partial_success';
  }
  return 'awaiting_confirmation';
}

function stageVerdictLabel(verdict: StageVerdictKind, locale: string) {
  const zh = locale.startsWith('zh');
  if (verdict === 'success') return zh ? '成功' : 'Success';
  if (verdict === 'partial_success') return zh ? '部分成功' : 'Partial success';
  if (verdict === 'failed') return zh ? '失败' : 'Failed';
  if (verdict === 'running') return zh ? '执行中' : 'Running';
  return zh ? '等待确认' : 'Awaiting confirmation';
}

function stageVerdictClassName(verdict: StageVerdictKind) {
  if (verdict === 'success' || verdict === 'partial_success') {
    return 'status-active';
  }
  if (verdict === 'failed') {
    return 'status-overdue';
  }
  if (verdict === 'running') {
    return 'status-running';
  }
  return 'status-pending';
}

function assistantRunStateLabel(state: AssistantRunState, locale: string) {
  const zh = locale.startsWith('zh');
  const labels: Record<AssistantRunState, string> = {
    draft: zh ? '草稿' : 'Draft',
    parsing: zh ? '解析中' : 'Parsing',
    preflight: zh ? '预检中' : 'Preflight',
    llm_planning: zh ? '规划中' : 'Planning',
    awaiting_confirmation: zh ? '等待确认' : 'Awaiting confirmation',
    queued: zh ? '已排队' : 'Queued',
    running: zh ? '执行中' : 'Running',
    verifying: zh ? '验证中' : 'Verifying',
    partial_success: zh ? '部分成功' : 'Partial success',
    success: zh ? '成功' : 'Success',
    blocked: zh ? '已阻塞' : 'Blocked',
    failed: zh ? '失败' : 'Failed',
    rolled_back: zh ? '已回滚' : 'Rolled back',
  };
  return labels[state];
}

function assistantRunStateClassName(state: AssistantRunState) {
  if (state === 'success' || state === 'partial_success' || state === 'rolled_back') {
    return 'status-active';
  }
  if (state === 'failed' || state === 'blocked') {
    return 'status-overdue';
  }
  if (state === 'running' || state === 'queued' || state === 'parsing' || state === 'preflight' || state === 'llm_planning' || state === 'verifying') {
    return 'status-running';
  }
  return 'status-pending';
}

function workflowStageLabel(stage: string | null | undefined, locale: string) {
  const zh = locale.startsWith('zh');
  const labels: Record<string, string> = {
    draft: zh ? '草稿' : 'Draft',
    parsing: zh ? '解析中' : 'Parsing',
    preflight: zh ? '预检中' : 'Preflight',
    llm_planning: zh ? '规划中' : 'Planning',
    awaiting_confirmation: zh ? '等待确认' : 'Awaiting confirmation',
    queued: zh ? '已排队' : 'Queued',
    running: zh ? '执行中' : 'Running',
    verifying: zh ? '验证中' : 'Verifying',
    partial_success: zh ? '部分成功' : 'Partial success',
    success: zh ? '成功' : 'Success',
    failed: zh ? '失败' : 'Failed',
    blocked: zh ? '阻塞' : 'Blocked',
    rolled_back: zh ? '已回滚' : 'Rolled back',
  };
  return labels[stage ?? 'draft'] ?? stage ?? '-';
}

function workflowStageClassName(stage: string | null | undefined) {
  if (stage === 'success' || stage === 'partial_success' || stage === 'rolled_back') {
    return 'status-active';
  }
  if (stage === 'failed' || stage === 'blocked') {
    return 'status-overdue';
  }
  if (stage === 'parsing' || stage === 'preflight' || stage === 'llm_planning' || stage === 'queued' || stage === 'running' || stage === 'verifying') {
    return 'status-running';
  }
  return 'status-pending';
}

function workflowSourceLabel(source: AssistantResponseSource | 'executor', locale: string) {
  const zh = locale.startsWith('zh');
  const labels: Record<string, string> = {
    llm: 'LLM',
    executor: zh ? '执行器' : 'Executor',
    preflight: zh ? '预检' : 'Preflight',
    system: zh ? '系统' : 'System',
    mock: 'Mock',
  };
  return labels[source] ?? source;
}

function humanDiagnosticSummary(envelope: OperatorEnvelope | null, locale: string) {
  if (!envelope) {
    return locale.startsWith('zh')
      ? '等待选择工作区并触发任务后，这里会给出结构化诊断结论。'
      : 'Select a workspace and run a task to get a structured diagnostic summary.';
  }

  const activeTask = envelope.workflow.activeTaskId
    ? envelope.workflow.tasks.find((task) => task.id === envelope.workflow.activeTaskId) ?? null
    : envelope.workflow.tasks.at(-1) ?? null;
  if (activeTask?.failure?.humanSummary) {
    return activeTask.failure.humanSummary;
  }

  const primaryError = envelope.previewSummary.lastError
    ?? envelope.auditSummary.lastError
    ?? envelope.latestJob?.error
    ?? envelope.diagnosticsSummary.lastError
    ?? null;

  if (primaryError) {
    return locale.startsWith('zh')
      ? `主要阻塞项：${primaryError}`
      : `Primary blocker: ${primaryError}`;
  }

  return envelope.diagnosticsSummary.detail
    || envelope.diagnosticsSummary.headline
    || (locale.startsWith('zh') ? '当前没有检测到致命错误。' : 'No fatal error has been detected.');
}

function latestRawLogs(envelope: OperatorEnvelope | null) {
  if (!envelope || envelope.jobs.length === 0) {
    return '';
  }

  const latestJobId = envelope.latestJob?.id ?? null;
  const latestJob = envelope.jobs.find((job) => job.id === latestJobId) ?? envelope.jobs[0] ?? null;
  if (!latestJob || latestJob.steps.length === 0) {
    return '';
  }

  return latestJob.steps.map((step) => [
    `# ${step.title}`,
    `status=${step.status}`,
    step.stdout ? `stdout:\n${step.stdout}` : null,
    step.stderr ? `stderr:\n${step.stderr}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');
}

function renderTextWithLinks(value: string, prefix: string): ReactNode[] {
  const pattern = /https?:\/\/[^\s<>"']+/gi;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  let match = pattern.exec(value);

  while (match) {
    if (match.index > cursor) {
      nodes.push(value.slice(cursor, match.index));
    }

    let href = match[0];
    let suffix = '';
    while (/[),.!?;:]+$/.test(href)) {
      suffix = href.slice(-1) + suffix;
      href = href.slice(0, -1);
    }

    nodes.push(
      <a
        className="assistant-message__link"
        href={href}
        key={`${prefix}-link-${index}`}
        rel="noreferrer"
        target="_blank"
      >
        {href}
      </a>,
    );

    if (suffix) {
      nodes.push(suffix);
    }

    cursor = match.index + match[0].length;
    index += 1;
    match = pattern.exec(value);
  }

  if (cursor < value.length) {
    nodes.push(value.slice(cursor));
  }

  return nodes.length > 0 ? nodes : [value];
}

function renderInlineContent(text: string, keyPrefix: string) {
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  const segments: ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  let match = pattern.exec(text);

  while (match) {
    if (match.index > cursor) {
      segments.push(...renderTextWithLinks(text.slice(cursor, match.index), `${keyPrefix}-plain-${index}`));
    }

    const [raw, , boldText, codeText] = match;
    if (boldText) {
      segments.push(<strong key={`${keyPrefix}-strong-${index}`}>{boldText}</strong>);
    } else if (codeText) {
      segments.push(<code key={`${keyPrefix}-code-${index}`}>{codeText}</code>);
    } else {
      segments.push(raw);
    }

    cursor = match.index + raw.length;
    index += 1;
    match = pattern.exec(text);
  }

  if (cursor < text.length) {
    segments.push(...renderTextWithLinks(text.slice(cursor), `${keyPrefix}-tail`));
  }

  return segments.length > 0 ? segments : [text];
}

function renderMessageContent(content: string) {
  const paragraphs = content
    .trim()
    .split(/\n{2,}/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return (
    <div className="assistant-message__content">
      {paragraphs.map((paragraph, index) => {
        if (paragraph.startsWith('```') && paragraph.endsWith('```')) {
          const code = paragraph.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '');
          return (
            <div className="assistant-message__code-block" key={`code-${index}`}>
              <pre className="assistant-message__pre"><code>{code}</code></pre>
            </div>
          );
        }

        const lines = paragraph.split('\n').map((entry) => entry.trim()).filter(Boolean);
        if (lines.length > 0 && lines.every((entry) => /^[-*•]\s+/.test(entry))) {
          return (
            <ul className="assistant-message__list" key={`ul-${index}`}>
              {lines.map((entry, lineIndex) => (
                <li key={`ul-${index}-${lineIndex}`}>
                  {renderInlineContent(entry.replace(/^[-*•]\s+/, ''), `ul-${index}-${lineIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (lines.length > 0 && lines.every((entry) => /^\d+\.\s+/.test(entry))) {
          return (
            <ol className="assistant-message__list assistant-message__list--ordered" key={`ol-${index}`}>
              {lines.map((entry, lineIndex) => (
                <li key={`ol-${index}-${lineIndex}`}>
                  {renderInlineContent(entry.replace(/^\d+\.\s+/, ''), `ol-${index}-${lineIndex}`)}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p className="assistant-message__paragraph" key={`p-${index}`}>
            {lines.map((line, lineIndex) => (
              <Fragment key={`p-${index}-${lineIndex}`}>
                {renderInlineContent(line, `p-${index}-${lineIndex}`)}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function OperatorHubPage() {
  const { capsuleId: routeCapsuleId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { locale, text } = useSite();
  const { isAuthenticated } = useAuth();
  const zh = locale.startsWith('zh');
  const queryCapsuleId = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('capsule');
    const normalized = raw?.trim();
    return normalized && normalized.length > 0 ? normalized : null;
  }, [location.search]);
  const selectedWorkspaceId = resolveSelectedWorkspaceId(routeCapsuleId, queryCapsuleId);
  const activeThreadKey = resolveThreadKey(selectedWorkspaceId);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingTokens, setPendingTokens] = useState<Record<string, string>>({});
  const [busyIntent, setBusyIntent] = useState<OperatorActionIntent | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [continueTrace, setContinueTrace] = useState<WorkflowContinueTrace | null>(null);
  const [threadStates, setThreadStates] = useState<Record<string, WorkspaceThreadState>>({});

  const { data: workspacesResponse, error: workspacesError, loading: workspacesLoading } = useApiData<OperatorCapsuleListResponse>(
    `/api/v1/operator/workspaces?refresh=${refreshTick}`,
    { preserveData: true },
  );
  const workspaces = Array.isArray(workspacesResponse?.data) ? workspacesResponse.data : [];
  const { data: workspaceResponse, error: workspaceError, loading: workspaceLoading } = useApiData<OperatorResponse>(
    selectedWorkspaceId ? `/api/v1/operator/workspaces/${selectedWorkspaceId}?refresh=${refreshTick}` : null,
    { preserveData: true },
  );
  const envelope = useMemo(() => normalizeOperatorEnvelope(workspaceResponse?.data ?? null), [workspaceResponse?.data]);
  const activeWorkflowTask = useMemo(() => selectActiveWorkflowTask(envelope), [envelope]);
  const workflowTimeline = activeWorkflowTask?.timeline ?? [];
  const capsule = envelope?.capsule ?? null;
  const previewUrl = normalizeOperatorApiUrl(envelope?.previewSummary.previewUrl ?? capsule?.previewUrl ?? null)
    ?? envelope?.previewSummary.previewUrl
    ?? capsule?.previewUrl
    ?? null;
  const productionUrl = normalizeOperatorApiUrl(envelope?.productionUrl ?? capsule?.productionUrl ?? null)
    ?? envelope?.productionUrl
    ?? capsule?.productionUrl
    ?? null;

  const actionButtons = useMemo(
    () => (envelope?.nextActions ?? []).filter((action) => action.intent !== 'open_capsule'),
    [envelope?.nextActions],
  );

  const activeThread = threadStates[activeThreadKey] ?? createEmptyThreadState();
  const activeThreadSessionId = threadStates[activeThreadKey]?.sessionId ?? null;
  const truthPanelState = useMemo(
    () => resolveActiveTaskTruth(envelope, activeThread.runState),
    [envelope, activeThread.runState],
  );
  const workspaceTitle = decodeWorkspaceTitle(
    capsule?.name
      ?? selectedWorkspaceId
      ?? (zh ? '未选择工作区' : 'No workspace selected'),
  );
  const safeCredentialReadiness = envelope?.credentialReadiness ?? {
    status: 'missing_credentials' as const,
    headline: zh ? '缺少 SSH 凭据' : 'SSH credentials are missing',
    detail: zh ? '当前运行时没有可用的 SSH 凭据。' : 'No usable SSH credentials are available in the current runtime.',
    nextAction: zh
      ? '先补充服务器 #19 凭据（密码、SSH key 或 agent），再继续发布。'
      : 'Provide server #19 credentials first (password, SSH key, or agent), then continue.',
    checkedAt: null,
    source: 'preflight' as const,
  };
  const footerAssistantError = activeThread.assistantError
    ?? actionError
    ?? (workspaceError && selectedWorkspaceId && !envelope
      ? `${text.common.error}: ${toFriendlyError(new Error(workspaceError), locale)}`
      : null);
  const canContinueCurrentTask = Boolean(selectedWorkspaceId && activeWorkflowTask);

  function setThreadState(key: string, updater: (current: WorkspaceThreadState) => WorkspaceThreadState) {
    setThreadStates((current) => {
      const existing = current[key] ?? createEmptyThreadState();
      const next = updater(existing);
      if (next === existing) {
        return current;
      }
      return {
        ...current,
        [key]: next,
      };
    });
  }

  function setActiveThreadState(updater: (current: WorkspaceThreadState) => WorkspaceThreadState) {
    setThreadState(activeThreadKey, updater);
  }

  function selectWorkspace(id: string) {
    navigate(`/operator/${id}`);
  }

  function syncWorkspaceFromActionResult(actionResult: AssistantActionResultPayload | null) {
    const { capsulePath } = actionResultLinks(actionResult);
    const capsuleId = extractCapsuleIdFromPath(capsulePath);
    if (!capsuleId) {
      return;
    }
    selectWorkspace(capsuleId);
    setRefreshTick((current) => current + 1);
  }

  useEffect(() => {
    setContinueTrace(null);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!activeWorkflowTask) {
      return;
    }

    setActiveThreadState((current) => ({
      ...current,
      planningMode: activeWorkflowTask.planningMode,
      taskMode: current.taskMode === 'new_turn' ? 'new_turn' : 'continue',
    }));
  }, [activeThreadKey, activeWorkflowTask?.id, activeWorkflowTask?.planningMode]);

  useEffect(() => {
    const target = resolveLegacyCapsuleRedirect(routeCapsuleId, queryCapsuleId);
    if (target) {
      navigate(target, { replace: true });
    }
  }, [navigate, queryCapsuleId, routeCapsuleId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [selectedWorkspaceId, workflowTimeline.length]);

  useEffect(() => {
    const shouldPoll = Boolean(
      envelope
      && (
        envelope.truthState === 'verifying_repo'
        || envelope.truthState === 'job_running'
        || envelope.latestJob?.status === 'running'
        || envelope.latestJob?.status === 'queued'
      ),
    );
    if (!shouldPoll) {
      return;
    }

    const timer = window.setInterval(() => {
      setRefreshTick((current) => current + 1);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [envelope?.latestJob?.status, envelope?.truthState]);

  useEffect(() => {
    if (activeThreadSessionId) {
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
  }, [activeThreadKey, activeThreadSessionId, locale, selectedWorkspaceId]);

  async function sendAssistantMessage(
    message: string,
    requestedAction?: AssistantActionProposal['action'],
  ) {
    const threadKey = activeThreadKey;
    const capsuleId = selectedWorkspaceId;
    const thread = threadStates[threadKey] ?? createEmptyThreadState();
    if (!thread.sessionId) {
      return;
    }

    setThreadState(threadKey, (current) => ({
      ...current,
      busy: true,
      runState: 'parsing',
      lastSource: 'system',
      assistantError: null,
      attachmentError: null,
    }));
    setActionError(null);
    setFeedback(null);

    try {
      const response = await requestJson<AssistantMessagesResponse>('/api/v1/assistant/messages', {
        method: 'POST',
        body: {
          sessionId: thread.sessionId,
          message,
          locale,
          planningMode: thread.planningMode,
          taskMode: thread.taskMode,
          autoRoute: true,
          context: {
            path: capsuleId ? `/operator/${capsuleId}` : '/operator',
            locale,
            capsuleId,
          },
          attachments: thread.attachments,
          requestedAction,
        },
      });

      setThreadState(threadKey, (current) => {
        const source = response.data.source ?? 'system';
        return {
          ...current,
          sessionId: response.data.session.sessionId,
          messages: dedupeMessagesById(response.data.session.messages ?? []),
          proposals: dedupeProposalsById(response.data.proposals ?? []),
          pendingConfirmation: response.data.pendingConfirmation ?? null,
          actionResult: response.data.actionResult ?? null,
          runState: response.data.runState ?? (response.data.pendingConfirmation ? 'awaiting_confirmation' : 'running'),
          lastSource: source,
          actionCards: mergeActionCards(current.actionCards, buildActionCards(source, {
            proposals: response.data.proposals ?? [],
            pendingConfirmation: response.data.pendingConfirmation ?? null,
            actionResult: response.data.actionResult ?? null,
          })),
          composer: '',
          attachments: [],
          attachmentError: null,
          assistantError: null,
          busy: false,
          planningMode: response.data.workflow?.planningMode ?? current.planningMode,
          taskMode: 'continue',
        };
      });
      if (response.data.workspace?.capsuleId) {
        selectWorkspace(response.data.workspace.capsuleId);
      }
      syncWorkspaceFromActionResult(response.data.actionResult ?? null);
    } catch (error) {
      setThreadState(threadKey, (current) => ({
        ...current,
        busy: false,
        runState: 'failed',
        lastSource: 'system',
        assistantError: toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale),
      }));
    }
  }

  async function confirmAssistantAction() {
    const threadKey = activeThreadKey;
    const thread = threadStates[threadKey] ?? createEmptyThreadState();
    if (!thread.sessionId || !thread.pendingConfirmation) {
      return;
    }

    setThreadState(threadKey, (current) => ({
      ...current,
      busy: true,
      runState: 'running',
      lastSource: 'system',
      assistantError: null,
    }));

    try {
      const response = await requestJson<AssistantConfirmResponse>('/api/v1/assistant/actions/confirm', {
        method: 'POST',
        body: {
          sessionId: thread.sessionId,
          confirmToken: thread.pendingConfirmation.token,
          locale,
        },
      });
      setThreadState(threadKey, (current) => {
        const source = response.data.source ?? 'system';
        return {
          ...current,
          sessionId: response.data.session.sessionId,
          messages: dedupeMessagesById(response.data.session.messages ?? []),
          proposals: [],
          pendingConfirmation: null,
          actionResult: response.data.actionResult ?? null,
          runState: response.data.runState ?? 'success',
          lastSource: source,
          actionCards: mergeActionCards(current.actionCards, buildActionCards(source, {
            proposals: [],
            pendingConfirmation: null,
            actionResult: response.data.actionResult ?? null,
          })),
          busy: false,
          planningMode: response.data.workflow?.planningMode ?? current.planningMode,
          taskMode: 'continue',
        };
      });
      if (response.data.workspace?.capsuleId) {
        selectWorkspace(response.data.workspace.capsuleId);
      }
      syncWorkspaceFromActionResult(response.data.actionResult ?? null);
    } catch (error) {
      setThreadState(threadKey, (current) => ({
        ...current,
        busy: false,
        runState: 'failed',
        lastSource: 'system',
        assistantError: toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale),
      }));
    }
  }

  async function handleContinueCurrentTask() {
    if (!capsule || !activeWorkflowTask) {
      setActiveThreadState((current) => ({
        ...current,
        assistantError: zh ? '当前没有可继续的活跃任务。' : 'There is no active task to continue right now.',
      }));
      return;
    }

    const frontEndEventAt = new Date().toISOString();
    setContinueTrace({
      frontEndEventAt,
      apiRequestedAt: frontEndEventAt,
      apiRespondedAt: null,
      backendStage: null,
      executorJobId: null,
      executorStatus: null,
      error: null,
    });
    setActiveThreadState((current) => ({
      ...current,
      busy: true,
      runState: activeWorkflowTask.currentStage === 'awaiting_confirmation' ? 'queued' : current.runState,
      lastSource: 'system',
      assistantError: null,
    }));
    setActionError(null);
    setFeedback(null);

    try {
      const response = await requestJson<OperatorResponse>(`/api/v1/operator/workspaces/${capsule.id}/continue`, {
        method: 'POST',
        body: {
          taskId: activeWorkflowTask.id,
          pendingConfirmationId: activeWorkflowTask.pendingConfirmation?.token ?? undefined,
          operation: 'continue',
        },
      });
      const nextEnvelope = normalizeOperatorEnvelope(response.data ?? null);
      const nextTask = nextEnvelope?.workflow.activeTaskId
        ? nextEnvelope.workflow.tasks.find((task) => task.id === nextEnvelope.workflow.activeTaskId) ?? null
        : nextEnvelope?.workflow.tasks.at(-1) ?? null;
      const apiRespondedAt = new Date().toISOString();

      setContinueTrace({
        frontEndEventAt,
        apiRequestedAt: frontEndEventAt,
        apiRespondedAt,
        backendStage: nextTask?.currentStage ?? null,
        executorJobId: nextEnvelope?.latestJob?.id ?? null,
        executorStatus: nextEnvelope?.latestJob?.status ?? null,
        error: null,
      });
      setActiveThreadState((current) => ({
        ...current,
        busy: false,
        pendingConfirmation: null,
        runState: (nextTask?.currentStage as AssistantRunState | undefined) ?? current.runState,
        lastSource: 'system',
        assistantError: null,
        taskMode: 'continue',
      }));
      setFeedback(response.message);
      setRefreshTick((current) => current + 1);
    } catch (error) {
      const friendly = toFriendlyError(error instanceof Error ? error : new Error(String(error)), locale);
      setContinueTrace((current) => ({
        frontEndEventAt: current?.frontEndEventAt ?? frontEndEventAt,
        apiRequestedAt: current?.apiRequestedAt ?? frontEndEventAt,
        apiRespondedAt: new Date().toISOString(),
        backendStage: current?.backendStage ?? null,
        executorJobId: current?.executorJobId ?? null,
        executorStatus: current?.executorStatus ?? null,
        error: friendly,
      }));
      setActiveThreadState((current) => ({
        ...current,
        busy: false,
        runState: 'failed',
        lastSource: 'system',
        assistantError: friendly,
      }));
    }
  }

  async function handleSubmitMessage() {
    const normalized = activeThread.composer.trim();
    if (!normalized && activeThread.attachments.length === 0) {
      return;
    }

    const repoPreflight = preflightRepoInput(normalized);
    if (repoPreflight.invalidRepoUrl) {
      setActiveThreadState((current) => ({
        ...current,
        assistantError: zh
          ? '仓库地址看起来不合法。请只粘贴纯仓库 URL（例如 https://github.com/org/repo 或 https://github.com/org/repo.git）。'
          : 'The repository link looks invalid. Please provide a clean repository URL such as https://github.com/org/repo or https://github.com/org/repo.git.',
      }));
      return;
    }

    if (repoPreflight.hasRepoHostUrl && !repoPreflight.repoUrl) {
      setActiveThreadState((current) => ({
        ...current,
        assistantError: zh
          ? '仓库地址看起来不合法。请只粘贴纯仓库 URL（例如 https://github.com/org/repo 或 https://github.com/org/repo.git）。'
          : 'The repository link looks invalid. Please provide a clean repository URL such as https://github.com/org/repo or https://github.com/org/repo.git.',
      }));
      return;
    }

    const messageForAssistant = (() => {
      if (!repoPreflight.repoUrl) {
        return normalized;
      }
      const description = repoPreflight.taskDescription;
      return description
        ? `${description}\n\n${repoPreflight.repoUrl}`
        : repoPreflight.repoUrl;
    })();

    await sendAssistantMessage(messageForAssistant || (zh ? '请读取我上传的项目文件并进入规划。' : 'Read the uploaded project files and enter planning mode.'));
  }

  async function handleProposal(proposal: AssistantActionProposal) {
    await sendAssistantMessage(proposal.title, proposal.action);
  }

  async function handleAction(intent: OperatorActionIntent) {
    if (!capsule || intent === 'open_capsule') {
      return;
    }
    if (intent === 'publish_release' && safeCredentialReadiness.status !== 'ready') {
        setActiveThreadState((current) => ({
          ...current,
          assistantError: `${safeCredentialReadiness.headline}. ${safeCredentialReadiness.nextAction}`,
        }));
      return;
    }

    const path = actionPathMap[intent];
    if (!path) {
      return;
    }

    setBusyIntent(intent);
    setActionError(null);
    setFeedback(null);

    try {
      const response = await requestJson<OperatorResponse>(path, {
        method: 'POST',
        body: {
          capsuleId: capsule.id,
          ...(pendingTokens[intent] ? { confirmationToken: pendingTokens[intent] } : {}),
        },
      });

      if (response.data.requiredConfirmation) {
        setPendingTokens((current) => ({
          ...current,
          [intent]: response.data.requiredConfirmation?.token ?? '',
        }));
        setFeedback(zh ? `${response.message} 请再次点击确认。` : `${response.message} Click once more to confirm.`);
      } else {
        setPendingTokens((current) => {
          const next = { ...current };
          delete next[intent];
          return next;
        });
        setFeedback(response.message);
        setRefreshTick((current) => current + 1);
      }
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.statusCode === 401 && !isAuthenticated) {
        navigate(`/login?next=${encodeURIComponent(`/operator/${capsule.id}`)}`);
        return;
      }
      setActionError(toFriendlyError(apiError, locale));
    } finally {
      setBusyIntent(null);
    }
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
        } satisfies ComposerAttachment;
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

  const loading = workspacesLoading || (workspaceLoading && Boolean(selectedWorkspaceId) && !envelope);
  if (loading && workspaces.length === 0 && activeThread.messages.length === 0) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (workspacesError && workspaces.length === 0) {
    return <div className="error-card">{text.common.error}: {toFriendlyError(new Error(workspacesError), locale)}</div>;
  }

  return (
    <div className="operator-console-page">
      <section className="operator-console-panel operator-console-panel--debug">
        <strong>{zh ? 'Debug / Reference' : 'Debug / Reference'}</strong>
        <p>{zh ? '这个页面只保留给调试和对照使用，不再作为默认产品入口。' : 'This page remains available for debugging and reference only. It is no longer the default product entry.'}</p>
      </section>
      <section className="operator-console-shell">
        <WorkspaceRail
          locale={locale}
          onSelectWorkspace={selectWorkspace}
          selectedWorkspaceId={selectedWorkspaceId}
          workspaces={workspaces}
        />

        <section className="operator-console-center">
          <div className="operator-console-panel operator-console-chat-surface">
            <TimelinePanel
              cards={workflowTimeline}
              endRef={messagesEndRef}
              locale={locale}
              selectedWorkspaceId={selectedWorkspaceId}
              workspaceTitle={workspaceTitle}
            />
            <ComposerFooter
              assistantError={footerAssistantError}
              attachmentError={activeThread.attachmentError}
              attachments={activeThread.attachments}
              busy={activeThread.busy}
              canContinueCurrentTask={canContinueCurrentTask}
              composer={activeThread.composer}
              feedback={feedback}
              fileInputRef={fileInputRef}
              locale={locale}
              onAttachmentChange={(event) => void handleAttachmentChange(event)}
              onAttachmentRemove={(attachmentId) => setActiveThreadState((current) => ({
                ...current,
                attachments: current.attachments.filter((entry) => entry.id !== attachmentId),
              }))}
              onComposerChange={(value) => setActiveThreadState((current) => ({ ...current, composer: value }))}
              onContinueCurrentTask={() => void handleContinueCurrentTask()}
              onPlanningModeChange={(checked) => setActiveThreadState((current) => ({
                ...current,
                planningMode: checked ? 'on' : 'off',
              }))}
              onSubmit={() => void handleSubmitMessage()}
              onTaskModeChange={(mode) => setActiveThreadState((current) => ({ ...current, taskMode: mode }))}
              planningMode={activeThread.planningMode}
              taskMode={activeThread.taskMode}
            />
          </div>
        </section>

        <TruthPanel
          locale={locale}
          truth={truthPanelState}
          workspaceTitle={workspaceTitle}
        />
      </section>
    </div>
  );
}
