import type { OperatorEnvelope, OperatorWorkflowFailureCode, OperatorWorkflowTask } from './operator-types';
import type { OperatorV4PreviewLevel } from './operator-v4-view-model';

export type OperatorV4TerminalState =
  | 'preview_ready'
  | 'verified_preview'
  | 'blocked'
  | 'failed'
  | 'published';

function isZh(locale: string) {
  return locale.toLowerCase().startsWith('zh');
}

function hasPreviewUrl(envelope: OperatorEnvelope | null) {
  return Boolean(
    envelope?.previewSummary.previewUrl
    || envelope?.workspaceArtifactLedger.previewTarget.url
    || envelope?.previewUrl,
  );
}

function failureReasonFromCode(code: OperatorWorkflowFailureCode | null, locale: string) {
  const zh = isZh(locale);
  switch (code) {
    case 'build_script_missing':
    case 'package_manager_unknown':
    case 'workspace_detection_failed':
      return zh ? '缺少入口' : 'Missing entrypoint';
    case 'env_missing':
      return zh ? '缺少端口' : 'Missing runtime port';
    case 'build_command_uncertain':
    case 'compose_recipe_missing':
      return zh ? '运行 recipe 不确定' : 'Runtime recipe is uncertain';
    case 'unsupported_stack':
      return zh ? '技术栈暂不支持，需修复 recipe' : 'Stack unsupported. Repair recipe is required';
    case 'deploy_blocked':
    case 'preview_failed':
    case 'ssh_missing_credentials':
    case 'ssh_auth_failed':
      return zh ? '预览被阻塞' : 'Preview is blocked';
    default:
      return null;
  }
}

export function resolveNoPreviewReason(input: {
  envelope: OperatorEnvelope | null;
  activeTask: OperatorWorkflowTask | null;
  locale: string;
}) {
  const zh = isZh(input.locale);
  const task = input.activeTask;
  if (!task) {
    return zh ? '还在构建' : 'Still building';
  }

  if (task.currentStage === 'failed') {
    return zh ? '构建失败' : 'Build failed';
  }
  if (task.currentStage === 'blocked') {
    return failureReasonFromCode(task.failure?.failureCode ?? null, input.locale)
      ?? (zh ? '预览被阻塞' : 'Preview is blocked');
  }
  if (task.currentStage === 'queued' || task.currentStage === 'running' || task.currentStage === 'verifying') {
    return zh ? '还在构建' : 'Still building';
  }

  return failureReasonFromCode(task.failure?.failureCode ?? null, input.locale)
    ?? (zh ? '还在构建' : 'Still building');
}

export function resolveRunStepLabel(input: {
  envelope: OperatorEnvelope | null;
  activeTask: OperatorWorkflowTask | null;
  locale: string;
}) {
  const zh = isZh(input.locale);
  const task = input.activeTask;
  if (!task) {
    return zh ? '已接收任务，正在检查仓库' : 'Task received. Checking repository.';
  }

  if (task.currentStage === 'parsing') {
    return zh ? '检查仓库' : 'Checking repository';
  }
  if (task.currentStage === 'preflight') {
    return zh ? '识别技术栈' : 'Detecting stack';
  }
  if (task.currentStage === 'llm_planning' || task.currentStage === 'awaiting_confirmation') {
    return zh ? '生成执行计划' : 'Generating execution plan';
  }
  if (task.currentStage === 'queued' || task.currentStage === 'running') {
    return zh ? '安装依赖 / 构建' : 'Installing dependencies / building';
  }
  if (task.currentStage === 'verifying') {
    if (!input.envelope?.previewSummary.evidence.runtimeLiveAt) {
      return zh ? '启动预览' : 'Starting preview';
    }
    return zh ? '验证结果' : 'Verifying results';
  }
  if (task.currentStage === 'partial_success' || task.currentStage === 'success') {
    return zh ? '验证结果' : 'Verifying results';
  }
  if (task.currentStage === 'blocked' || task.currentStage === 'failed') {
    return zh ? '执行已阻塞' : 'Execution blocked';
  }

  return zh ? '执行中' : 'Running';
}

export function resolveOperatorTerminalState(input: {
  envelope: OperatorEnvelope | null;
  activeTask: OperatorWorkflowTask | null;
  previewLevel: OperatorV4PreviewLevel;
}): OperatorV4TerminalState | null {
  if (input.envelope?.truthState === 'production_live' || input.envelope?.productionUrl) {
    return 'published';
  }
  if (input.activeTask?.currentStage === 'blocked') {
    return 'blocked';
  }
  if (input.activeTask?.currentStage === 'failed') {
    return 'failed';
  }
  if (input.previewLevel === 'verified_preview') {
    return 'verified_preview';
  }
  if (hasPreviewUrl(input.envelope)) {
    return 'preview_ready';
  }
  return null;
}

export function isOperatorRunningStage(stage: OperatorWorkflowTask['currentStage'] | null | undefined) {
  return stage === 'parsing'
    || stage === 'preflight'
    || stage === 'llm_planning'
    || stage === 'awaiting_confirmation'
    || stage === 'queued'
    || stage === 'running'
    || stage === 'verifying';
}
