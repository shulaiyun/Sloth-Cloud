import { extractAssistantRepoUrl, splitAssistantRepoInput } from './assistant-repo-url.js';

export type AssistantRepoDeployOperation =
  | 'deploy'
  | 'preview'
  | 'repair'
  | 'continue_deploy'
  | 'import';

export type AssistantWorkspaceContinuationOperation = 'continue' | 'deploy_playable';

export type AssistantMessageRouteDecision =
  | {
    route: 'repo_import_deploy';
    lane: 'repository';
    source: 'repository';
    reason: string;
    repoUrl: string;
    notes: string | null;
    operation: AssistantRepoDeployOperation;
  }
  | {
    route: 'workspace_continue';
    lane: 'workspace_continuation';
    source: 'workspace';
    reason: string;
    operation: AssistantWorkspaceContinuationOperation;
  }
  | {
    route: 'idea_generate';
    lane: 'generated-project';
    source: 'idea';
    reason: string;
    idea: string;
  }
  | {
    route: 'none';
    lane: null;
    source: null;
    reason: string;
  };

export interface ClassifyAssistantMessageRouteInput {
  message: string;
  locale: string;
  askMode: boolean;
  hasActiveWorkspace: boolean;
  allowIdeaGeneration?: boolean;
}

function normalizeAssistantSearchText(input: string) {
  return input
    .toLowerCase()
    .replace(/[~`!@#$%^&*()+=[\]{}\\|;:'",.<>/?]+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function containsAssistantKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function assistantMessageExplicitlyRequestsLaunchCapsule(message: string) {
  const normalized = normalizeAssistantSearchText(message);
  return containsAny(normalized, [
    '上线胶囊',
    '生成胶囊',
    '工作区胶囊',
    'launch capsule',
    'workspace capsule',
    'preview capsule',
    'start from scratch',
    'from scratch',
    '从零开始',
    '从头开始',
  ]);
}

function detectAssistantIdeaLaunchIntent(message: string) {
  const normalized = message.trim().toLowerCase();
  if (normalized.length < 6) {
    return null;
  }

  if (containsAssistantKeyword(normalized, [
    'restart',
    'reboot',
    'shutdown',
    'power off',
    'sync',
    'cancel',
    'renew',
    'invoice',
    '账单',
    '续费',
    '重启',
    '关机',
    '停机',
    '同步',
    '取消',
  ])) {
    return null;
  }

  if (!containsAssistantKeyword(normalized, [
    'build',
    'create',
    'generate',
    'make',
    'build me',
    'make me',
    'website',
    'web app',
    'app',
    'game',
    'mini game',
    'moba',
    'landing page',
    '项目',
    '应用',
    '网站',
    '游戏',
    '小游戏',
    '训练营',
    '做一个',
    '做个',
    '制作',
    '小程序',
    '帮我做',
    '给我做',
    '搭建',
    '生成',
    '开发',
    '从零开始',
    '从头开始',
  ])) {
    return null;
  }

  return message.trim();
}

function detectAssistantWorkspaceContinuationIntent(message: string): AssistantWorkspaceContinuationOperation | null {
  const normalized = normalizeAssistantSearchText(message);
  if (!normalized) {
    return null;
  }

  const referencesServerExecution = containsAny(normalized, [
    '服务器',
    'server',
    'vps',
    '#19',
    'ssh',
  ]);
  if (referencesServerExecution) {
    return null;
  }

  if (containsAny(normalized, [
    '帮我部署出来可以玩的',
    '部署出来可以玩',
    '部署成可玩的',
    '可玩的',
    '发布上线',
    '上线它',
    '帮我部署',
    '部署',
    '上线',
    'publish it',
    'deploy it',
    'deploy playable',
    'make it playable',
    'ship it',
  ])) {
    return 'deploy_playable';
  }

  if (containsAny(normalized, [
    '继续当前任务',
    '继续任务',
    '继续',
    '接着来',
    '继续执行',
    'continue current task',
    'continue task',
    'continue this',
    'keep going',
    'go on',
  ])) {
    return 'continue';
  }

  return null;
}

function detectAssistantRepoImportDeployIntent(message: string): {
  repoUrl: string;
  notes: string | null;
  operation: AssistantRepoDeployOperation;
} | null {
  const normalized = message.trim();
  if (normalized.length < 8) {
    return null;
  }

  const repoUrl = extractAssistantRepoUrl(normalized);
  if (!repoUrl) {
    return null;
  }

  const lower = normalizeAssistantSearchText(normalized);
  const deployIntent = containsAny(lower, [
    'deploy',
    'deployment',
    'publish',
    'preview',
    'repair',
    'fix',
    'continue deploy',
    'continue deployment',
    'import',
    'repo',
    'repository',
    'git',
    'github',
    'gitlab',
    'bitbucket',
    '部署',
    '上线',
    '发布',
    '预览',
    '修复',
    '继续部署',
    '继续上线',
    '导入',
    '仓库',
  ]);

  if (!deployIntent) {
    return null;
  }

  const splitInput = splitAssistantRepoInput(normalized);
  let operation: AssistantRepoDeployOperation = 'import';
  if (containsAny(lower, ['repair', 'fix', '修复'])) {
    operation = 'repair';
  } else if (containsAny(lower, ['continue deploy', 'continue deployment', '继续部署', '继续上线'])) {
    operation = 'continue_deploy';
  } else if (containsAny(lower, ['preview', '预览'])) {
    operation = 'preview';
  } else if (containsAny(lower, ['deploy', 'deployment', 'publish', '部署', '上线', '发布'])) {
    operation = 'deploy';
  }

  return {
    repoUrl,
    notes: splitInput.notes,
    operation,
  };
}

export function classifyAssistantMessageRoute(
  input: ClassifyAssistantMessageRouteInput,
): AssistantMessageRouteDecision {
  const message = input.message.trim();
  if (!message || input.askMode) {
    return {
      route: 'none',
      lane: null,
      source: null,
      reason: 'Ask mode does not enter an execution lane.',
    };
  }

  const repoIntent = detectAssistantRepoImportDeployIntent(message);
  if (repoIntent) {
    return {
      route: 'repo_import_deploy',
      lane: 'repository',
      source: 'repository',
      reason: 'A valid repository URL with deploy/preview/repair intent must enter the repository import lane.',
      ...repoIntent,
    };
  }

  if (input.hasActiveWorkspace) {
    const workspaceOperation = detectAssistantWorkspaceContinuationIntent(message);
    if (workspaceOperation) {
      return {
        route: 'workspace_continue',
        lane: 'workspace_continuation',
        source: 'workspace',
        reason: 'The request continues the active workspace and does not carry a repository import route.',
        operation: workspaceOperation,
      };
    }
  }

  if ((input.allowIdeaGeneration ?? true) && assistantMessageExplicitlyRequestsLaunchCapsule(message)) {
    const idea = detectAssistantIdeaLaunchIntent(message) ?? message;
    return {
      route: 'idea_generate',
      lane: 'generated-project',
      source: 'idea',
      reason: 'Only idea or start-from-scratch requests can enter the generated-project lane.',
      idea,
    };
  }

  const idea = (input.allowIdeaGeneration ?? true) ? detectAssistantIdeaLaunchIntent(message) : null;
  if (idea) {
    return {
      route: 'idea_generate',
      lane: 'generated-project',
      source: 'idea',
      reason: 'The message is a start-from-scratch idea request without a repository import.',
      idea,
    };
  }

  return {
    route: 'none',
    lane: null,
    source: null,
    reason: 'No execution lane matched this message.',
  };
}
