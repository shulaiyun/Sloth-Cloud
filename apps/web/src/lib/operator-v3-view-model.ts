import { normalizeOperatorApiUrl } from './operator-url';
import {
  type OperatorCapsule,
  type OperatorEnvelope,
  type OperatorPreviewSummary,
  type OperatorWorkflowCard,
  type OperatorWorkflowFailureCode,
  type OperatorWorkflowStage,
  type OperatorWorkspaceArtifactLedger,
} from './operator-types';
import { decodeWorkspaceTitle, selectActiveWorkflowTask } from './operator-workbench-state';

export type OperatorV3MainActionKind =
  | 'continue'
  | 'confirm_plan'
  | 'deploy_playable'
  | 'open_preview'
  | 'prefill'
  | 'details'
  | 'retry_send';

export interface OperatorV3MainAction {
  kind: OperatorV3MainActionKind;
  label: string;
  prompt?: string;
  href?: string | null;
}

export interface OperatorV3RailItem {
  id: string;
  title: string;
  typeLabel: string;
  statusLabel: string;
  updatedLabel: string;
  selected: boolean;
}

export interface OperatorV3ProgressStep {
  id: string;
  label: string;
  status: 'complete' | 'current' | 'upcoming' | 'error';
}

export interface OperatorV3ProgressState {
  steps: OperatorV3ProgressStep[];
  currentStepLabel: string;
  summary: string;
  mainAction: OperatorV3MainAction | null;
}

export interface OperatorV3ArtifactState {
  title: string;
  typeLabel: string;
  entryFile: string;
  statusLabel: string;
  summary: string;
  mainAction: OperatorV3MainAction | null;
  verified: boolean;
}

export interface OperatorV3FailureState {
  happened: string;
  why: string;
  nextStep: string;
  mainAction: OperatorV3MainAction | null;
}

export interface OperatorV3DrawerTimelineItem {
  id: string;
  title: string;
  summary: string;
  stage: string;
  source: string;
  nextStep: string | null;
  evidence: Array<{
    id: string;
    label: string;
    detail: string;
    source: string;
  }>;
}

export interface OperatorV3DrawerState {
  taskId: string | null;
  failureCode: string | null;
  runState: string;
  deployReadiness: string;
  evidence: Array<{
    id: string;
    label: string;
    detail: string;
  }>;
  logs: string;
  timeline: OperatorV3DrawerTimelineItem[];
}

export interface OperatorV3ViewModel {
  railItems: OperatorV3RailItem[];
  progress: OperatorV3ProgressState;
  artifact: OperatorV3ArtifactState | null;
  failure: OperatorV3FailureState | null;
  drawer: OperatorV3DrawerState;
}

const progressLabels = ['理解需求', '检查项目', '生成计划', '执行任务', '验证结果'] as const;

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

function capsuleTypeLabel(workspace: OperatorCapsule, locale: string) {
  const zh = isZh(locale);
  if (workspace.entryKind === 'upload-project') {
    return zh ? '仓库' : 'Repository';
  }
  if (workspace.entryKind === 'generate-from-idea') {
    return zh ? '想法' : 'Idea';
  }
  return zh ? '服务器' : 'Server';
}

function workspaceStatusLabel(workspace: OperatorCapsule, locale: string) {
  const zh = isZh(locale);
  const stage = workspace.workflowStage ?? workspace.truthState ?? workspace.status;
  const labels: Record<string, string> = {
    draft: zh ? '草稿' : 'Draft',
    parsing: zh ? '理解需求' : 'Understanding',
    preflight: zh ? '检查项目' : 'Project check',
    llm_planning: zh ? '生成计划' : 'Plan ready',
    awaiting_confirmation: zh ? '等待确认' : 'Awaiting confirmation',
    queued: zh ? '等待执行' : 'Queued',
    running: zh ? '执行中' : 'Running',
    verifying: zh ? '验证中' : 'Verifying',
    partial_success: zh ? '部分完成' : 'Partially done',
    success: zh ? '已完成' : 'Completed',
    failed: zh ? '失败' : 'Failed',
    blocked: zh ? '已阻塞' : 'Blocked',
    rolled_back: zh ? '已回滚' : 'Rolled back',
    planning: zh ? '规划中' : 'Planning',
    verifying_repo: zh ? '检查项目' : 'Project check',
    job_running: zh ? '执行中' : 'Running',
    env_blocked: zh ? '已阻塞' : 'Blocked',
    preview_ready: zh ? '待验证' : 'Needs verification',
    preview_failed: zh ? '失败' : 'Failed',
    ready_for_production_approval: zh ? '待发布' : 'Ready to publish',
    needs_attention: zh ? '需要处理' : 'Needs attention',
    production_live: zh ? '正式版在线' : 'Production live',
  };

  return labels[stage] ?? stage ?? '-';
}

export function hasVerifiedPreviewEvidence(previewSummary: OperatorPreviewSummary | null | undefined) {
  return Boolean(
    previewSummary?.verified === true
    && previewSummary.evidence.runtimeLiveAt
    && previewSummary.evidence.healthPassedAt
    && previewSummary.evidence.smokePassedAt
    && previewSummary.evidence.screenshotPath,
  );
}

function latestArtifactDetail(ledger: OperatorWorkspaceArtifactLedger) {
  return ledger.latestArtifact.archiveUrl
    ?? ledger.latestArtifact.manifestUrl
    ?? ledger.runnableEntry.entryFile
    ?? ledger.previewTarget.url
    ?? ledger.latestArtifact.sourceRef
    ?? null;
}

function inferLedgerGaps(ledger: OperatorWorkspaceArtifactLedger) {
  const gaps = new Set(ledger.gaps);

  if (!latestArtifactDetail(ledger)) {
    gaps.add('missing_latest_artifact');
  }
  if (!ledger.chosenStack.label || ledger.chosenStack.kind === 'unknown') {
    gaps.add('missing_chosen_stack');
  }
  if (!ledger.runnableEntry.entryFile || ledger.runnableEntry.runCommands.length === 0) {
    gaps.add('missing_runnable_entry');
  }
  if (!ledger.previewTarget.url) {
    gaps.add('missing_preview_target');
  }
  if (!ledger.deployReadiness.ready) {
    gaps.add('readiness_blocked');
  }

  return [...gaps];
}

function progressIndexForStage(stage: OperatorWorkflowStage | null | undefined) {
  if (stage === 'draft' || stage === 'parsing') {
    return 0;
  }
  if (stage === 'preflight') {
    return 1;
  }
  if (stage === 'llm_planning' || stage === 'awaiting_confirmation') {
    return 2;
  }
  if (stage === 'queued' || stage === 'running') {
    return 3;
  }
  return 4;
}

function latestTimelineSummary(timeline: OperatorWorkflowCard[]) {
  return timeline.at(-1)?.summary?.trim() || timeline.at(-1)?.title?.trim() || '';
}

function latestLogs(envelope: OperatorEnvelope | null) {
  if (!envelope || envelope.jobs.length === 0) {
    return '';
  }

  const latestJob = envelope.jobs.find((job) => job.id === envelope.latestJob?.id) ?? envelope.jobs.at(0) ?? null;
  if (!latestJob || latestJob.steps.length === 0) {
    return envelope.logsSummary.entries.map((entry) => `[${entry.level}] ${entry.message}`).join('\n');
  }

  return latestJob.steps.map((step) => [
    `# ${step.title}`,
    `status=${step.status}`,
    step.stdout ? `stdout:\n${step.stdout}` : null,
    step.stderr ? `stderr:\n${step.stderr}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');
}

function previewHref(envelope: OperatorEnvelope | null) {
  return normalizeOperatorApiUrl(envelope?.previewSummary.previewUrl ?? envelope?.workspaceArtifactLedger.previewTarget.url ?? envelope?.previewUrl ?? null)
    ?? envelope?.previewSummary.previewUrl
    ?? envelope?.workspaceArtifactLedger.previewTarget.url
    ?? envelope?.previewUrl
    ?? null;
}

function buildPrefillPrompt(code: OperatorWorkflowFailureCode | 'readiness_blocked' | 'details', locale: string) {
  const zh = isZh(locale);
  const prompts: Record<string, string> = {
    repo_url_invalid: zh
      ? '我来重新补充正确的仓库地址，请继续按当前任务检查这个仓库：'
      : 'I am resubmitting the correct repository URL. Continue checking this repository:',
    repo_unreachable: zh
      ? '请继续按当前任务重试仓库检查，并告诉我现在卡在哪里。'
      : 'Retry repository inspection in the current task and tell me where it blocks now.',
    repo_auth_failed: zh
      ? '请继续按当前任务重试仓库检查，并列出需要补充的访问凭据。'
      : 'Retry repository inspection and list the missing access credentials.',
    github_proxy_aborted: zh
      ? '请继续按当前任务重试仓库检查，并在失败时直接给出可执行修复步骤。'
      : 'Retry repository inspection and give me executable recovery steps if it fails again.',
    package_manager_unknown: zh
      ? '补充项目运行信息：包管理器、安装命令、构建命令、启动命令分别是什么？'
      : 'I am adding runtime details: what are the package manager, install command, build command, and start command?',
    workspace_detection_failed: zh
      ? '补充项目运行信息：主入口目录、启动命令、构建命令、健康检查路径分别是什么？'
      : 'I am adding runtime details: what are the app directory, start command, build command, and health check path?',
    build_command_uncertain: zh
      ? '补充项目运行信息：请按当前工作区说明准确的构建命令和启动命令。'
      : 'Please capture the exact build and start commands for the current workspace.',
    build_script_missing: zh
      ? '补充项目运行信息：当前项目应该如何构建和启动？请沿用当前工作区继续。'
      : 'Tell me how this project should build and start, then continue in the current workspace.',
    unsupported_stack: zh
      ? '补充项目运行信息：当前不是标准支持栈，请给出运行方式、端口和健康检查路径。'
      : 'This is not a supported stack. I am adding runtime, port, and health check details.',
    compose_recipe_missing: zh
      ? '补充 Docker 服务信息：主服务名、对外端口、健康检查路径、依赖服务分别是什么？'
      : 'I am adding Docker service details: main service name, exposed port, health check path, and dependencies.',
    env_missing: zh
      ? '补充环境变量：请按当前工作区列出必填环境变量和示例值。'
      : 'I am adding the missing environment variables for the current workspace.',
    preview_failed: zh
      ? '请沿用当前工作区自动修复依赖并重试预览。'
      : 'Please reuse the current workspace, repair dependencies, and retry the preview.',
    ssh_missing_credentials: zh
      ? '请进入 SSH 凭据补齐流程，并在补齐后沿用当前工作区继续部署。'
      : 'Please guide me through adding SSH credentials, then continue deployment in this workspace.',
    ssh_auth_failed: zh
      ? '请重新检查 SSH 鉴权并沿用当前工作区继续部署。'
      : 'Please re-check SSH auth and continue deployment in this workspace.',
    deploy_blocked: zh
      ? '不要丢当前工作区上下文，请切到手动部署向导并列出下一步。'
      : 'Keep the current workspace context and switch to a manual deployment guide.',
    readiness_blocked: zh
      ? '请先补齐部署前置条件，并沿用当前工作区继续部署。'
      : 'Please fill the deployment prerequisites and continue from the current workspace.',
    details: zh
      ? '请基于当前工作区说明详细技术过程和下一步。'
      : 'Please explain the technical details and the next step for the current workspace.',
  };

  return prompts[code];
}

function buildFailureState(envelope: OperatorEnvelope | null, locale: string): OperatorV3FailureState | null {
  if (!envelope) {
    return null;
  }

  const zh = isZh(locale);
  const activeTask = selectActiveWorkflowTask(envelope);
  const failureCode = activeTask?.failure?.failureCode
    ?? envelope.techStackSummary.blockReason
    ?? (envelope.credentialReadiness.status !== 'ready' ? 'readiness_blocked' : null);

  if (!failureCode) {
    return null;
  }

  const rootCause = activeTask?.failure?.probableRootCause
    ?? envelope.previewSummary.lastError
    ?? envelope.diagnosticsSummary.lastError
    ?? envelope.credentialReadiness.detail
    ?? envelope.envChecklistSummary.detail
    ?? envelope.diagnosticsSummary.detail;

  const nextDetail = activeTask?.failure?.recommendedActions[0]
    ?? envelope.credentialReadiness.nextAction
    ?? envelope.envChecklistSummary.detail
    ?? envelope.diagnosticsSummary.headline;

  const baseAction = (label: string, kind: OperatorV3MainActionKind): OperatorV3MainAction => ({
    kind,
    label,
    prompt: buildPrefillPrompt(failureCode, locale),
  });

  const mappings: Record<string, OperatorV3FailureState> = {
    repo_url_invalid: {
      happened: zh ? '仓库地址没有被识别成可用仓库。' : 'The repository URL was not recognized as a usable repository.',
      why: rootCause || (zh ? '当前消息里的链接格式不完整，无法进入仓库预检。' : 'The link format is incomplete, so repository preflight could not start.'),
      nextStep: nextDetail || (zh ? '修正仓库地址后重新检查。' : 'Fix the repository URL and retry the check.'),
      mainAction: baseAction(zh ? '修正仓库地址' : 'Fix repository URL', 'prefill'),
    },
    repo_unreachable: {
      happened: zh ? '仓库当前无法读取。' : 'The repository is currently unreachable.',
      why: rootCause || (zh ? '仓库服务没有返回可读取内容。' : 'The repository host did not return readable content.'),
      nextStep: nextDetail || (zh ? '重试仓库检查。' : 'Retry repository inspection.'),
      mainAction: baseAction(zh ? '重试仓库检查' : 'Retry repository check', 'continue'),
    },
    repo_auth_failed: {
      happened: zh ? '仓库访问被鉴权阻断。' : 'Repository access was blocked by authentication.',
      why: rootCause || (zh ? '当前运行时没有足够权限读取这个仓库。' : 'The current runtime does not have permission to read this repository.'),
      nextStep: nextDetail || (zh ? '补齐仓库访问凭据后重试。' : 'Add repository access credentials and retry.'),
      mainAction: baseAction(zh ? '重试仓库检查' : 'Retry repository check', 'continue'),
    },
    github_proxy_aborted: {
      happened: zh ? '仓库检查在代理链路中断开。' : 'Repository inspection stopped in the proxy chain.',
      why: rootCause || (zh ? '代理链路没有把仓库检查跑完。' : 'The proxy chain did not finish the repository check.'),
      nextStep: nextDetail || (zh ? '重试仓库检查并暴露真实错误。' : 'Retry the repository check and expose the real error.'),
      mainAction: baseAction(zh ? '重试仓库检查' : 'Retry repository check', 'continue'),
    },
    package_manager_unknown: {
      happened: zh ? '项目运行方式还不够明确。' : 'The project runtime is still unclear.',
      why: rootCause || (zh ? '系统还没识别出稳定的包管理器和运行命令。' : 'The system has not identified a stable package manager and runtime recipe yet.'),
      nextStep: nextDetail || (zh ? '补充项目运行信息。' : 'Add project runtime details.'),
      mainAction: baseAction(zh ? '补充项目运行信息' : 'Add runtime details', 'prefill'),
    },
    workspace_detection_failed: {
      happened: zh ? '项目结构还没有被稳定识别出来。' : 'The project structure has not been identified reliably.',
      why: rootCause || (zh ? '主工作目录或运行入口仍不明确。' : 'The main workspace directory or runtime entry is still unclear.'),
      nextStep: nextDetail || (zh ? '补充项目运行信息。' : 'Add project runtime details.'),
      mainAction: baseAction(zh ? '补充项目运行信息' : 'Add runtime details', 'prefill'),
    },
    build_command_uncertain: {
      happened: zh ? '构建命令还不稳定。' : 'The build command is not stable yet.',
      why: rootCause || (zh ? '系统没有拿到可靠的构建命令。' : 'The system does not have a reliable build command yet.'),
      nextStep: nextDetail || (zh ? '补充项目运行信息。' : 'Add project runtime details.'),
      mainAction: baseAction(zh ? '补充项目运行信息' : 'Add runtime details', 'prefill'),
    },
    build_script_missing: {
      happened: zh ? '当前项目没有可直接执行的构建脚本。' : 'The project does not expose a directly runnable build script.',
      why: rootCause || (zh ? '标准构建入口缺失，所以预览链路无法继续。' : 'The standard build entry is missing, so preview execution cannot continue.'),
      nextStep: nextDetail || (zh ? '补充项目运行信息。' : 'Add project runtime details.'),
      mainAction: baseAction(zh ? '补充项目运行信息' : 'Add runtime details', 'prefill'),
    },
    unsupported_stack: {
      happened: zh ? '当前项目不在默认支持矩阵里。' : 'This project is outside the default support matrix.',
      why: rootCause || (zh ? '缺少稳定 runtime recipe，所以系统不会假装已验证。' : 'A reliable runtime recipe is missing, so the system will not pretend it is verified.'),
      nextStep: nextDetail || (zh ? '补充项目运行信息。' : 'Add project runtime details.'),
      mainAction: baseAction(zh ? '补充项目运行信息' : 'Add runtime details', 'prefill'),
    },
    compose_recipe_missing: {
      happened: zh ? 'Docker Compose 还缺少可部署配方。' : 'The Docker Compose deployment recipe is incomplete.',
      why: rootCause || (zh ? '主服务、端口或健康检查信息还不完整。' : 'The main service, port, or health check is incomplete.'),
      nextStep: nextDetail || (zh ? '补充 Docker 服务信息。' : 'Add Docker service details.'),
      mainAction: baseAction(zh ? '补充 Docker 服务信息' : 'Add Docker service details', 'prefill'),
    },
    env_missing: {
      happened: zh ? '运行环境还缺少必填值。' : 'The runtime is still missing required values.',
      why: rootCause || (zh ? '环境变量或外部依赖还没补齐。' : 'Environment variables or external dependencies are still missing.'),
      nextStep: nextDetail || (zh ? '补充环境变量。' : 'Add environment variables.'),
      mainAction: baseAction(zh ? '补充环境变量' : 'Add environment variables', 'prefill'),
    },
    preview_failed: {
      happened: zh ? '当前预览没有通过真实运行验证。' : 'The current preview did not pass live runtime verification.',
      why: rootCause || (zh ? '构建、启动或健康检查阶段出现了失败。' : 'Build, startup, or health verification failed.'),
      nextStep: nextDetail || (zh ? '自动修复依赖并重试。' : 'Repair dependencies and retry.'),
      mainAction: baseAction(zh ? '自动修复依赖并重试' : 'Repair and retry', 'continue'),
    },
    ssh_missing_credentials: {
      happened: zh ? '部署前置条件还没满足。' : 'Deployment prerequisites are not ready yet.',
      why: rootCause || (zh ? '当前运行时没有可用 SSH 凭据。' : 'No usable SSH credentials are available in the current runtime.'),
      nextStep: nextDetail || (zh ? '先绑定 SSH 凭据再继续部署。' : 'Bind SSH credentials before continuing deployment.'),
      mainAction: baseAction(zh ? '去绑定 SSH 凭据' : 'Bind SSH credentials', 'prefill'),
    },
    ssh_auth_failed: {
      happened: zh ? 'SSH 鉴权没有通过。' : 'SSH authentication failed.',
      why: rootCause || (zh ? '当前凭据无法通过目标机器鉴权。' : 'The current credentials did not pass target host authentication.'),
      nextStep: nextDetail || (zh ? '修正 SSH 凭据后重试。' : 'Fix SSH credentials and retry.'),
      mainAction: baseAction(zh ? '去绑定 SSH 凭据' : 'Bind SSH credentials', 'prefill'),
    },
    deploy_blocked: {
      happened: zh ? '正式部署现在被明确挡住了。' : 'Production deployment is explicitly blocked right now.',
      why: rootCause || (zh ? '当前工作区还没满足发布前置条件。' : 'The current workspace does not satisfy the release prerequisites yet.'),
      nextStep: nextDetail || (zh ? '切换到手动部署向导。' : 'Switch to the manual deployment guide.'),
      mainAction: baseAction(zh ? '切换到手动部署向导' : 'Switch to manual deploy', 'prefill'),
    },
    readiness_blocked: {
      happened: zh ? '部署前置条件还没满足。' : 'Deployment prerequisites are not ready yet.',
      why: rootCause || envelope.credentialReadiness.detail,
      nextStep: nextDetail || envelope.credentialReadiness.nextAction,
      mainAction: baseAction(zh ? '去绑定 SSH 凭据' : 'Bind SSH credentials', 'prefill'),
    },
  };

  return mappings[failureCode] ?? null;
}

function buildArtifactState(envelope: OperatorEnvelope | null, locale: string, failure: OperatorV3FailureState | null): OperatorV3ArtifactState | null {
  if (!envelope) {
    return null;
  }

  const zh = isZh(locale);
  const activeTask = selectActiveWorkflowTask(envelope);
  const ledger = envelope.workspaceArtifactLedger;
  const verified = hasVerifiedPreviewEvidence(envelope.previewSummary) || (ledger.previewTarget.verified && Boolean(ledger.previewTarget.url));
  const previewUrl = previewHref(envelope);
  const gaps = inferLedgerGaps(ledger);
  const latestArtifactName = ledger.latestArtifact.archiveName
    ?? ledger.latestArtifact.sourceRef?.split('/').filter(Boolean).at(-1)
    ?? ledger.runnableEntry.entryFile?.split('/').filter(Boolean).at(-1)
    ?? decodeWorkspaceTitle(envelope.capsule.name)
    ?? '-';

  let statusLabel = zh ? '待继续' : 'Ready to continue';
  if (failure) {
    statusLabel = zh ? '失败' : 'Failed';
  } else if (activeTask?.currentStage === 'awaiting_confirmation') {
    statusLabel = zh ? '等待确认' : 'Awaiting confirmation';
  } else if (activeTask && ['queued', 'running', 'verifying', 'preflight', 'parsing', 'llm_planning'].includes(activeTask.currentStage)) {
    statusLabel = zh ? '执行中' : 'Running';
  } else if (verified) {
    statusLabel = zh ? '已验证' : 'Verified';
  } else if (gaps.length > 0 || envelope.techStackSummary.blockReason) {
    statusLabel = zh ? '已阻塞' : 'Blocked';
  } else if (previewUrl) {
    statusLabel = zh ? '待验证' : 'Needs verification';
  }

  let mainAction: OperatorV3MainAction | null = null;
  if (failure?.mainAction) {
    mainAction = failure.mainAction;
  } else if (activeTask?.currentStage === 'awaiting_confirmation') {
    mainAction = {
      kind: 'confirm_plan',
      label: zh ? '继续当前任务' : 'Continue current task',
    };
  } else if (
    activeTask
    && ['parsing', 'preflight', 'llm_planning', 'queued', 'running', 'verifying'].includes(activeTask.currentStage)
  ) {
    mainAction = {
      kind: 'continue',
      label: zh ? '继续当前任务' : 'Continue current task',
    };
  } else if (verified && ledger.deployReadiness.ready && latestArtifactDetail(ledger)) {
    mainAction = {
      kind: 'deploy_playable',
      label: zh ? '继续部署出来可以玩的' : 'Continue to playable deployment',
    };
  } else if (previewUrl) {
    mainAction = {
      kind: 'open_preview',
      label: zh ? '查看当前预览' : 'Open current preview',
      href: previewUrl,
    };
  } else if (activeTask) {
    mainAction = {
      kind: 'continue',
      label: zh ? '继续当前任务' : 'Continue current task',
    };
  }

  return {
    title: latestArtifactName,
    typeLabel: ledger.chosenStack.label,
    entryFile: ledger.runnableEntry.entryFile ?? envelope.artifactSummary.entryFile ?? '-',
    statusLabel,
    summary: failure
      ? failure.nextStep
      : verified
        ? (zh ? '这个产物已经通过真实运行验证。' : 'This artifact already passed live runtime verification.')
        : previewUrl
          ? (zh ? '当前产物已经进入预览链路，可以继续验证或部署。' : 'This artifact has entered the preview lane and can continue to verification or deployment.')
          : (zh ? '系统会沿用当前工作区的产物继续推进。' : 'The system will continue from the current workspace artifact.'),
    mainAction,
    verified,
  };
}

function buildProgressState(
  envelope: OperatorEnvelope | null,
  locale: string,
  failure: OperatorV3FailureState | null,
  artifact: OperatorV3ArtifactState | null,
) {
  const zh = isZh(locale);
  const activeTask = selectActiveWorkflowTask(envelope);
  const currentIndex = progressIndexForStage(activeTask?.currentStage ?? null);
  const isFailure = Boolean(failure);
  const steps = progressLabels.map((label, index) => ({
    id: `step-${index + 1}`,
    label: zh ? label : [
      'Understand request',
      'Inspect project',
      'Plan work',
      'Execute task',
      'Verify result',
    ][index],
    status: ((): OperatorV3ProgressStep['status'] => {
      if (index < currentIndex) {
        return 'complete';
      }
      if (index === currentIndex) {
        return isFailure && index === 4 ? 'error' : 'current';
      }
      return 'upcoming';
    })(),
  }));

  const summary = failure?.happened
    ?? latestTimelineSummary(activeTask?.timeline ?? [])
    ?? activeTask?.userIntent
    ?? envelope?.diagnosticsSummary.detail
    ?? (zh ? '从一句需求开始，系统会继续沿用当前工作区推进。' : 'Start with one request and the system will continue from the current workspace.');

  return {
    steps,
    currentStepLabel: steps[currentIndex]?.label ?? steps[0].label,
    summary,
    mainAction: failure?.mainAction ?? artifact?.mainAction ?? (
      activeTask?.currentStage === 'awaiting_confirmation'
        ? { kind: 'confirm_plan' as const, label: zh ? '继续当前任务' : 'Continue current task' }
        : activeTask
          ? { kind: 'continue' as const, label: zh ? '继续当前任务' : 'Continue current task' }
          : null
    ),
  };
}

function buildDrawerState(envelope: OperatorEnvelope | null, locale: string): OperatorV3DrawerState {
  const zh = isZh(locale);
  const activeTask = selectActiveWorkflowTask(envelope);
  const evidence = [
    ...(activeTask?.failure?.evidence ?? []),
    ...(activeTask?.evidence ?? []),
    ...(envelope?.previewSummary.evidence.runtimeLiveAt ? [{
      id: 'preview-runtime-live',
      label: zh ? '运行态在线' : 'Runtime live',
      detail: envelope.previewSummary.evidence.runtimeLiveAt,
    }] : []),
    ...(envelope?.previewSummary.evidence.healthPassedAt ? [{
      id: 'preview-health',
      label: zh ? '健康检查通过' : 'Health passed',
      detail: envelope.previewSummary.evidence.healthPassedAt,
    }] : []),
    ...(envelope?.previewSummary.evidence.smokePassedAt ? [{
      id: 'preview-smoke',
      label: zh ? '冒烟验证通过' : 'Smoke passed',
      detail: envelope.previewSummary.evidence.smokePassedAt,
    }] : []),
    ...(envelope?.previewSummary.evidence.screenshotPath ? [{
      id: 'preview-screenshot',
      label: zh ? '截图证据' : 'Screenshot evidence',
      detail: envelope.previewSummary.evidence.screenshotPath,
    }] : []),
  ];

  return {
    taskId: activeTask?.id ?? null,
    failureCode: activeTask?.failure?.failureCode ?? null,
    runState: envelope?.latestJob?.status ?? activeTask?.currentStage ?? 'draft',
    deployReadiness: activeTask?.deployReadiness.summary ?? envelope?.workspaceArtifactLedger.deployReadiness.summary ?? '-',
    evidence,
    logs: latestLogs(envelope),
    timeline: (activeTask?.timeline ?? []).map((card) => ({
      id: card.id,
      title: card.title,
      summary: card.summary,
      stage: card.stage,
      source: card.source,
      nextStep: card.nextStep,
      evidence: card.evidence,
    })),
  };
}

export function buildOperatorV3RailItems(
  workspaces: OperatorCapsule[],
  selectedWorkspaceId: string | null,
  locale: string,
): OperatorV3RailItem[] {
  return workspaces.map((workspace) => ({
    id: workspace.id,
    title: decodeWorkspaceTitle(workspace.name),
    typeLabel: capsuleTypeLabel(workspace, locale),
    statusLabel: workspaceStatusLabel(workspace, locale),
    updatedLabel: formatTime(workspace.updatedAt, locale),
    selected: workspace.id === selectedWorkspaceId,
  }));
}

export function buildOperatorV3ViewModel(
  input: {
    envelope: OperatorEnvelope | null;
    workspaces: OperatorCapsule[];
    selectedWorkspaceId: string | null;
    locale: string;
  },
): OperatorV3ViewModel {
  const failure = buildFailureState(input.envelope, input.locale);
  const artifact = buildArtifactState(input.envelope, input.locale, failure);

  return {
    railItems: buildOperatorV3RailItems(input.workspaces, input.selectedWorkspaceId, input.locale),
    progress: buildProgressState(input.envelope, input.locale, failure, artifact),
    artifact,
    failure,
    drawer: buildDrawerState(input.envelope, input.locale),
  };
}

export function buildOperatorV3OptimisticAck(
  input: {
    message: string;
    locale: string;
    hasArtifact: boolean;
  },
) {
  const zh = isZh(input.locale);
  const normalized = input.message.toLowerCase();

  if (
    /github\.com|gitlab\.com|bitbucket\.org|repo|repository|仓库/.test(normalized)
    || /https?:\/\//.test(normalized)
  ) {
    return zh ? '我收到并开始检查仓库。' : 'I received it and started checking the repository.';
  }

  if (/deploy|publish|上线|发布|部署/.test(normalized)) {
    return zh ? '我收到并开始规划部署。' : 'I received it and started planning the deployment.';
  }

  if (input.hasArtifact || /继续|接着|continue|keep going|go on/.test(normalized)) {
    return zh ? '我收到并开始读取当前产物。' : 'I received it and started reading the current artifact.';
  }

  return zh ? '我收到并开始整理当前任务。' : 'I received it and started organizing the current task.';
}
