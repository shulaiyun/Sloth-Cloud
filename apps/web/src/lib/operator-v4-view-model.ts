import {
  buildOperatorV3ViewModel,
  hasVerifiedPreviewEvidence,
  type OperatorV3MainAction,
  type OperatorV3ViewModel,
} from './operator-v3-view-model';
import { decodeWorkspaceTitle, selectActiveWorkflowTask } from './operator-workbench-state';
import type { OperatorCapsule, OperatorEnvelope, OperatorWorkflowTask } from './operator-types';

export type OperatorV4ProjectFilter = 'all' | 'active' | 'failed' | 'archived';

export interface OperatorV4ProjectRailItem {
  id: string;
  itemKind?: 'workspace' | 'chat';
  title: string;
  typeLabel: string;
  statusLabel: string;
  updatedLabel: string;
  archived: boolean;
  failed: boolean;
  selected: boolean;
}

export interface OperatorV4CurrentStepCard {
  title: string;
  what: string;
  why: string;
  mainAction: OperatorV3MainAction | null;
}

export type OperatorV4PreviewLevel = 'draft_preview' | 'live_preview' | 'verified_preview';

export interface OperatorV4PreviewState {
  level: OperatorV4PreviewLevel;
  label: string;
  summary: string;
}

export interface OperatorV4ArtifactStage {
  title: string;
  summary: string;
  preview: OperatorV4PreviewState;
  mainAction: OperatorV3MainAction | null;
}

function isZh(locale: string) {
  return locale.toLowerCase().startsWith('zh');
}

function formatTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return '-';
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat(isZh(locale) ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function titleFromRepoUrl(repoUrl: string | null | undefined) {
  const normalized = (repoUrl ?? '').trim();
  if (!normalized) {
    return null;
  }

  const segment = normalized
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .at(-1)
    ?.replace(/\.git$/i, '')
    .trim();

  return segment ? decodeWorkspaceTitle(segment) : null;
}

function titleFromIdea(idea: string | null | undefined) {
  const normalized = (idea ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  return decodeWorkspaceTitle(normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized);
}

function titleFromServer(host: string | null | undefined, locale: string) {
  const normalized = (host ?? '').trim();
  if (!normalized) {
    return null;
  }

  return isZh(locale) ? `部署 ${normalized}` : `Deploy ${normalized}`;
}

function looksInternalWorkspaceName(name: string | null | undefined) {
  const normalized = (name ?? '').trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return normalized.startsWith('capsule_')
    || normalized.includes('workflow')
    || normalized.includes('continue-confirmation')
    || normalized.includes('failed-preview')
    || normalized.includes('artifact-handoff');
}

export function resolveWorkspaceDisplayName(workspace: OperatorCapsule, locale: string) {
  const fallback = decodeWorkspaceTitle(workspace.name);
  if (!looksInternalWorkspaceName(workspace.name)) {
    return fallback;
  }

  return titleFromRepoUrl(workspace.source.repoUrl)
    ?? titleFromIdea(workspace.source.idea)
    ?? titleFromServer(workspace.source.serverHost, locale)
    ?? fallback;
}

export function resolveProjectTypeLabel(workspace: OperatorCapsule, locale: string) {
  const zh = isZh(locale);
  if (workspace.entryKind === 'upload-project') {
    return zh ? '仓库' : 'Repository';
  }
  if (workspace.entryKind === 'generate-from-idea') {
    return zh ? '想法' : 'Idea';
  }
  return zh ? '部署' : 'Deployment';
}

function resolveProjectStage(workspace: OperatorCapsule) {
  return workspace.workflowStage ?? workspace.truthState ?? workspace.status;
}

export function isDisposableWorkspaceCandidate(workspace: OperatorCapsule) {
  if (workspace.archivedAt) {
    return false;
  }

  const haystack = [
    workspace.name,
    workspace.slug,
    workspace.source.repoUrl,
    workspace.source.idea,
  ].filter(Boolean).join(' ').toLowerCase();

  return /(?:^|[\s_-])(smoke|demo|playwright|operator-v4-smoke|operator-v4-demo|test-project|sample)(?:$|[\s_-])/.test(haystack);
}

export function resolveProjectStatusLabel(workspace: OperatorCapsule, locale: string) {
  const zh = isZh(locale);
  const stage = resolveProjectStage(workspace);
  const labels: Record<string, string> = {
    draft: zh ? '草稿' : 'Draft',
    parsing: zh ? '理解中' : 'Understanding',
    preflight: zh ? '检查中' : 'Inspecting',
    llm_planning: zh ? '计划中' : 'Planning',
    awaiting_confirmation: zh ? '待确认' : 'Awaiting confirmation',
    queued: zh ? '待执行' : 'Queued',
    running: zh ? '执行中' : 'Running',
    verifying: zh ? '验证中' : 'Verifying',
    partial_success: zh ? '部分完成' : 'Partially done',
    success: zh ? '已完成' : 'Completed',
    failed: zh ? '失败' : 'Failed',
    blocked: zh ? '阻塞' : 'Blocked',
    rolled_back: zh ? '已回滚' : 'Rolled back',
    planning: zh ? '规划中' : 'Planning',
    verifying_repo: zh ? '检查项目' : 'Inspecting project',
    job_running: zh ? '执行中' : 'Running',
    env_blocked: zh ? '等待补充' : 'Needs input',
    preview_ready: zh ? '预览就绪' : 'Preview ready',
    preview_failed: zh ? '预览失败' : 'Preview failed',
    ready_for_production_approval: zh ? '待发布' : 'Ready to publish',
    needs_attention: zh ? '需要处理' : 'Needs attention',
    production_live: zh ? '正式版在线' : 'Production live',
    preview_live: zh ? '预览在线' : 'Preview live',
    takeover_ready: zh ? '可接管' : 'Ready for takeover',
    migration_ready: zh ? '可迁移' : 'Ready to migrate',
  };

  if (workspace.archivedAt) {
    return zh ? '已归档' : 'Archived';
  }

  return labels[stage] ?? decodeWorkspaceTitle(stage ?? '-');
}

export function isWorkspaceFailed(workspace: OperatorCapsule) {
  const stage = resolveProjectStage(workspace);
  return stage === 'failed'
    || stage === 'blocked'
    || stage === 'preview_failed'
    || workspace.status === 'needs_attention'
    || workspace.latestJob?.status === 'failed';
}

export function matchesProjectFilter(workspace: OperatorCapsule, filter: OperatorV4ProjectFilter) {
  if (filter === 'all') {
    return !workspace.archivedAt;
  }
  if (filter === 'archived') {
    return Boolean(workspace.archivedAt);
  }

  if (workspace.archivedAt) {
    return false;
  }

  const failed = isWorkspaceFailed(workspace);
  if (filter === 'failed') {
    return failed;
  }

  return !failed;
}

export function buildProjectRailItems(input: {
  workspaces: OperatorCapsule[];
  selectedWorkspaceId: string | null;
  locale: string;
  filter: OperatorV4ProjectFilter;
  search: string;
}) {
  const search = input.search.trim().toLowerCase();
  return input.workspaces
    .filter((workspace) => matchesProjectFilter(workspace, input.filter))
    .filter((workspace) => {
      if (workspace.id === input.selectedWorkspaceId) {
        return true;
      }
      if (search.length > 0) {
        return true;
      }
      return !isDisposableWorkspaceCandidate(workspace);
    })
    .filter((workspace) => {
      if (!search) {
        return true;
      }

      return [
        resolveWorkspaceDisplayName(workspace, input.locale),
        workspace.source.repoUrl,
        workspace.source.idea,
        workspace.source.serverHost,
      ].filter(Boolean).some((entry) => String(entry).toLowerCase().includes(search));
    })
    .map((workspace): OperatorV4ProjectRailItem => ({
      id: workspace.id,
      itemKind: 'workspace',
      title: resolveWorkspaceDisplayName(workspace, input.locale),
      typeLabel: resolveProjectTypeLabel(workspace, input.locale),
      statusLabel: resolveProjectStatusLabel(workspace, input.locale),
      updatedLabel: formatTime(workspace.lastActiveAt ?? workspace.updatedAt, input.locale),
      archived: Boolean(workspace.archivedAt),
      failed: isWorkspaceFailed(workspace),
      selected: workspace.id === input.selectedWorkspaceId,
    }));
}

function resolveCurrentTaskWhy(task: OperatorWorkflowTask | null, locale: string) {
  const zh = isZh(locale);
  switch (task?.currentStage) {
    case 'parsing':
      return zh ? '先把这句话和当前工作区上下文对齐，再决定后面的路径。' : 'The request is being aligned with the current workspace before any next step runs.';
    case 'preflight':
      return zh ? '先确认项目结构、凭据和产物是真的可继续。' : 'The system is confirming the project shape, credentials, and artifact continuity first.';
    case 'llm_planning':
    case 'awaiting_confirmation':
      return zh ? '先把执行计划收敛清楚，避免直接乱跑。' : 'The execution plan is being narrowed before anything runs blindly.';
    case 'queued':
    case 'running':
      return zh ? '现在已经进入真实执行路径，后续状态会继续沿用同一 workspace。' : 'The workflow is now on the real execution path and will continue in the same workspace.';
    case 'verifying':
      return zh ? '只有真实验证通过后，系统才会把结果往后推进。' : 'The result only moves forward after live verification passes.';
    case 'failed':
    case 'blocked':
      return zh ? '系统停在真实失败点，而不是伪造完成。' : 'The system stopped at the real failure point instead of pretending the work completed.';
    case 'success':
      return zh ? '当前这一步已经完成，可以继续下一步主动作。' : 'This step is complete and ready for the next primary action.';
    default:
      return zh ? '主舞台会持续围绕当前项目、当前产物和下一步动作推进。' : 'The stage stays focused on the current project, artifact, and next action.';
  }
}

export function buildOperatorV4WorkspaceSummary(
  envelope: OperatorEnvelope | null,
  locale: string,
  activeTask: OperatorWorkflowTask | null,
) {
  if (!envelope) {
    return isZh(locale)
      ? '从一句需求开始，系统会在同一个工作区里持续推进。'
      : 'Start with one request and the system will keep moving inside the same workspace.';
  }

  return activeTask?.timeline.at(-1)?.summary
    ?? activeTask?.failure?.humanSummary
    ?? envelope.capsule.summary
    ?? envelope.diagnosticsSummary.headline
    ?? (isZh(locale)
      ? '当前项目已经恢复，可以继续下一步。'
      : 'The current project is ready for the next step.');
}

function resolvePreviewUrl(envelope: OperatorEnvelope | null) {
  return envelope?.previewSummary.previewUrl
    ?? envelope?.workspaceArtifactLedger.previewTarget.url
    ?? envelope?.previewUrl
    ?? null;
}

export function classifyPreviewState(
  envelope: OperatorEnvelope | null,
  locale: string,
): OperatorV4PreviewState {
  const zh = isZh(locale);
  const previewUrl = resolvePreviewUrl(envelope);
  const runtimeLive = Boolean(envelope?.previewSummary.evidence.runtimeLiveAt);
  const verified = hasVerifiedPreviewEvidence(envelope?.previewSummary);

  if (verified) {
    return {
      level: 'verified_preview',
      label: zh ? '已验证预览' : 'Verified preview',
      summary: zh
        ? '真实运行、health、smoke 和 live screenshot 都已通过。'
        : 'Real runtime, health, smoke, and live screenshot evidence all passed.',
    };
  }

  if (previewUrl && runtimeLive) {
    return {
      level: 'live_preview',
      label: zh ? '运行预览' : 'Live preview',
      summary: zh
        ? '服务已经启动且可访问，但还没有通过完整证据门。'
        : 'The service is running and reachable, but it has not passed the full evidence gate yet.',
    };
  }

  return {
    level: 'draft_preview',
    label: zh ? '草稿预览' : 'Draft preview',
    summary: zh
      ? '当前仍是静态产物、生成页面或未完成真实运行验证的预览。'
      : 'This is still a static artifact, generated page, or an unverified preview that has not passed live runtime checks.',
  };
}

export function buildOperatorV4ArtifactStage(input: {
  envelope: OperatorEnvelope | null;
  locale: string;
  v3ViewModel: OperatorV3ViewModel;
}): OperatorV4ArtifactStage {
  const zh = isZh(input.locale);
  const artifact = input.v3ViewModel.artifact;
  const preview = classifyPreviewState(input.envelope, input.locale);
  const title = artifact?.title
    ?? input.envelope?.workspaceArtifactLedger.latestArtifact.archiveName
    ?? input.envelope?.workspaceArtifactLedger.runnableEntry.entryFile
    ?? (zh ? '等待产物' : 'Waiting for artifact');

  let summary = artifact?.summary
    ?? (zh
      ? '同一个 workspace 会继续沿用当前产物，不会把你带回演示流程。'
      : 'The same workspace keeps reusing the current artifact instead of sending you back to a demo flow.');
  if (preview.level === 'verified_preview') {
    summary = zh
      ? '这个产物已经经过完整验证，可以继续进入下一步主动作。'
      : 'This artifact has passed full verification and is ready for the next primary action.';
  } else if (preview.level === 'live_preview') {
    summary = zh
      ? '当前预览已经真实运行，但还需要补齐验证证据。'
      : 'The current preview is running for real, but it still needs full verification evidence.';
  } else if (input.envelope?.previewSummary.lastError) {
    summary = zh
      ? '当前只有草稿预览，系统不会把占位页或诊断页误标成已验证。'
      : 'Only a draft preview is available, and placeholder or diagnostic pages will not be mislabeled as verified.';
  }

  return {
    title,
    summary,
    preview,
    mainAction: artifact?.mainAction ?? null,
  };
}

export function buildOperatorV4CurrentStepCard(input: {
  locale: string;
  envelope: OperatorEnvelope | null;
  activeTask: OperatorWorkflowTask | null;
  v3ViewModel: OperatorV3ViewModel;
}): OperatorV4CurrentStepCard {
  const zh = isZh(input.locale);
  const failure = input.v3ViewModel.failure;

  if (failure) {
    return {
      title: zh ? '当前步骤' : 'Current step',
      what: failure.happened,
      why: failure.why,
      mainAction: failure.mainAction,
    };
  }

  return {
    title: input.v3ViewModel.progress.currentStepLabel,
    what: input.v3ViewModel.progress.summary,
    why: resolveCurrentTaskWhy(input.activeTask, input.locale),
    mainAction: input.v3ViewModel.progress.mainAction,
  };
}

export function buildOperatorV4ViewModel(input: {
  envelope: OperatorEnvelope | null;
  workspaces: OperatorCapsule[];
  selectedWorkspaceId: string | null;
  locale: string;
  filter: OperatorV4ProjectFilter;
  search: string;
}) {
  const v3ViewModel = buildOperatorV3ViewModel({
    envelope: input.envelope,
    workspaces: input.workspaces,
    selectedWorkspaceId: input.selectedWorkspaceId,
    locale: input.locale,
  });
  const activeTask = selectActiveWorkflowTask(input.envelope);

  return {
    railItems: buildProjectRailItems(input),
    v3ViewModel,
    workspaceSummary: buildOperatorV4WorkspaceSummary(input.envelope, input.locale, activeTask),
    artifactStage: buildOperatorV4ArtifactStage({
      envelope: input.envelope,
      locale: input.locale,
      v3ViewModel,
    }),
    currentStepCard: buildOperatorV4CurrentStepCard({
      locale: input.locale,
      envelope: input.envelope,
      activeTask,
      v3ViewModel,
    }),
  };
}
