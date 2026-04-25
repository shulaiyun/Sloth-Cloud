import { createHash, randomBytes } from 'node:crypto';

import {
  resolveAssistantModelCost,
  type AssistantModelCostTier,
} from './assistant-quota.js';

export type AssistantProviderName = 'openai' | 'gemini' | 'claude';

export type AssistantRole = 'system' | 'user' | 'assistant';

export type AssistantActionKind =
  | 'create-launch-capsule'
  | 'create-repo-workspace'
  | 'retry-provisioning'
  | 'restart-runtime'
  | 'stop-runtime'
  | 'sync-runtime'
  | 'check-service-app-status'
  | 'execute-service-playbook'
  | 'install-service-app'
  | 'reveal-server-access'
  | 'cancel-service'
  | 'renew-service'
  | 'delete-runtime'
  | 'handoff-support';

export type AssistantActionRisk = 'low' | 'high';

export interface AssistantContext {
  serviceId: string | null;
  invoiceId: string | null;
  capsuleId: string | null;
  path: string | null;
  locale: string | null;
}

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  createdAt: string;
}

export interface AssistantInputAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  textContent: string | null;
  dataUrl: string | null;
}

export interface AssistantActionRequest {
  kind: AssistantActionKind;
  serviceId: string | null;
  invoiceId: string | null;
  capsuleId?: string | null;
  projectName?: string | null;
  repoUrl?: string | null;
  notes?: string | null;
  idea?: string | null;
  audience?: string | null;
  businessGoal?: string | null;
  planningMode?: 'on' | 'off';
  taskMode?: 'continue' | 'new_turn';
  playbookId?: string | null;
  playbookName?: string | null;
  playbookScript?: string | null;
  appSlug?: string | null;
  appName?: string | null;
  cancellationType?: 'end_of_period' | 'immediate';
  reason?: string | null;
}

export interface AssistantActionProposal {
  id: string;
  title: string;
  description: string;
  risk: AssistantActionRisk;
  requiresConfirmation: boolean;
  action: AssistantActionRequest;
}

export interface AssistantPendingConfirmation {
  token: string;
  expiresAt: string;
  proposal: AssistantActionProposal;
}

type SessionRecord = {
  id: string;
  userKey: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  context: AssistantContext;
  messages: AssistantMessage[];
};

type ConfirmationRecord = {
  token: string;
  sessionId: string;
  userKey: string;
  proposal: AssistantActionProposal;
  expiresAt: number;
};

type AssistantDiscoveredModel = {
  id: string;
  ownedBy: string | null;
};

export interface AssistantLlmProviderConfig {
  name: AssistantProviderName;
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
}

export interface AssistantSelectableModel {
  id: string;
  provider: AssistantProviderName;
  model: string;
  resolvedModelId: string;
  label: string;
  isPrimary: boolean;
  costPoints: number;
  routingWeight: number;
  costTier: AssistantModelCostTier;
}

export interface AssistantOrchestratorOptions {
  enabled: boolean;
  providers: AssistantLlmProviderConfig[];
  primaryProvider: AssistantProviderName;
  confirmTtlMs: number;
  sessionTtlMs: number;
  maxContextMessages: number;
  logger?: {
    info: (payload: unknown, message?: string) => void;
    warn: (payload: unknown, message?: string) => void;
    error: (payload: unknown, message?: string) => void;
  };
}

export interface AssistantSessionResult {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  context: AssistantContext;
  messages: AssistantMessage[];
}

export interface AssistantAnswerInput {
  locale: string;
  userMessage: string;
  attachments?: AssistantInputAttachment[];
  context: AssistantContext;
  authenticated: boolean;
  userLabel?: string | null;
  accountSummary: string[];
  actionSummary: string[];
  proposals: AssistantActionProposal[];
}

export type AssistantResponseMode = 'llm' | 'fallback';

export interface AssistantBuiltReply {
  text: string;
  responseMode: AssistantResponseMode;
  resolvedModelId: string;
  resolvedProvider: AssistantProviderName | null;
  chargedTokens: number;
  inputTokens: number;
  outputTokens: number;
}

type AssistantLlmUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type AssistantLlmResult = {
  text: string;
  usage: AssistantLlmUsage | null;
};

const defaultLogger = {
  info: (_payload: unknown, _message?: string) => undefined,
  warn: (_payload: unknown, _message?: string) => undefined,
  error: (_payload: unknown, _message?: string) => undefined,
};

const lowRiskActions = new Set<AssistantActionKind>([
  'create-launch-capsule',
  'create-repo-workspace',
  'retry-provisioning',
  'restart-runtime',
  'sync-runtime',
  'check-service-app-status',
  'reveal-server-access',
  'handoff-support',
]);

const highRiskActions = new Set<AssistantActionKind>([
  'execute-service-playbook',
  'install-service-app',
  'stop-runtime',
  'cancel-service',
  'renew-service',
  'delete-runtime',
]);

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, ' ').trim();
}

function normalizeAssistantContent(input: string) {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function normalizeServiceId(input: string) {
  const compact = normalizeWhitespace(input);
  if (!compact) {
    return null;
  }

  const hit = compact.match(/(?:service|srv|服务|#)\s*[:#-]?\s*(\d{1,12})/i);
  if (hit?.[1]) {
    return hit[1];
  }

  if (/^\d{1,12}$/.test(compact)) {
    return compact;
  }

  return null;
}

function extractServiceId(text: string, fallback: string | null) {
  const fromText = normalizeServiceId(text);
  return fromText ?? fallback;
}

function containsAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function languageBucket(locale: string) {
  const normalized = locale.toLowerCase();
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('ko')) return 'ko';
  return 'en';
}

function localize(locale: string, copy: { zh: string; en: string; ja?: string; ko?: string }) {
  const bucket = languageBucket(locale);
  if (bucket === 'ja' && copy.ja) return copy.ja;
  if (bucket === 'ko' && copy.ko) return copy.ko;
  if (bucket === 'zh') return copy.zh;
  return copy.en;
}

function buildProposalText(
  locale: string,
  kind: AssistantActionKind,
  serviceId: string | null,
): Pick<AssistantActionProposal, 'title' | 'description'> {
  const sid = serviceId ?? '-';
  switch (kind) {
    case 'create-repo-workspace':
      return {
        title: localize(locale, {
          zh: '启动真实仓库部署工作区',
          en: 'Start real repository deployment workspace',
          ja: '実リポジトリ配備ワークスペースを開始',
          ko: '실제 저장소 배포 작업 공간 시작',
        }),
        description: localize(locale, {
          zh: '创建真实仓库工作区，自动识别技术栈、环境清单和预览链路；任何失败都会停在根因，不会伪造成功。',
          en: 'Create a real repository workspace, infer the stack, render the environment checklist, and stop on the root cause if any step fails.',
          ja: '実際のリポジトリ用ワークスペースを作成し、技術スタックと環境チェックリストを推論します。失敗時は根本原因で停止し、成功を偽装しません。',
          ko: '실제 저장소 작업 공간을 만들고 기술 스택과 환경 체크리스트를 추론합니다. 실패 시 근본 원인에서 멈추며 가짜 성공을 보고하지 않습니다.',
        }),
      };
    case 'create-launch-capsule':
      return {
        title: localize(locale, {
          zh: '启动真实生成任务',
          en: 'Start real build task',
          ja: '実生成タスクを開始',
          ko: '실제 생성 작업 시작',
        }),
        description: localize(locale, {
          zh: '由模型真实产出源码、预览和后续工作区；如果没有产出真实代码，这次会直接失败，不再返回占位模板。',
          en: 'The model must produce real source files, a preview, and a follow-up workspace. If no real code is produced, the task fails instead of returning a placeholder template.',
          ja: 'モデルが実際のソース、プレビュー、後続ワークスペースを生成します。実コードが出ない場合はプレースホルダーではなく失敗として返します。',
          ko: '모델이 실제 소스, 미리보기, 후속 작업 공간을 생성합니다. 실코드가 없으면 자리 채우기 템플릿 대신 실패로 처리됩니다.',
        }),
      };
    case 'retry-provisioning':
      return {
        title: localize(locale, {
          zh: '重试开通',
          en: 'Retry provisioning',
          ja: 'プロビジョニング再試行',
          ko: '프로비저닝 재시도',
        }),
        description: localize(locale, {
          zh: `为服务 #${sid} 重新触发开通队列。`,
          en: `Trigger provisioning retry for service #${sid}.`,
          ja: `サービス #${sid} のプロビジョニングを再試行します。`,
          ko: `서비스 #${sid}의 프로비저닝을 다시 시도합니다.`,
        }),
      };
    case 'restart-runtime':
      return {
        title: localize(locale, {
          zh: '重启实例',
          en: 'Restart instance',
          ja: 'インスタンス再起動',
          ko: '인스턴스 재시작',
        }),
        description: localize(locale, {
          zh: `重启服务 #${sid} 的运行实例。`,
          en: `Restart runtime instance for service #${sid}.`,
          ja: `サービス #${sid} のランタイムを再起動します。`,
          ko: `서비스 #${sid} 런타임 인스턴스를 재시작합니다.`,
        }),
      };
    case 'stop-runtime':
      return {
        title: localize(locale, {
          zh: '关机停机（高风险）',
          en: 'Power off runtime (high risk)',
          ja: 'シャットダウン（高リスク）',
          ko: '런타임 종료(고위험)',
        }),
        description: localize(locale, {
          zh: `关闭服务 #${sid} 的运行实例，业务会临时不可用。`,
          en: `Power off runtime for service #${sid}. Service will be unavailable until restarted.`,
          ja: `サービス #${sid} のランタイムを停止します。再起動まで利用できません。`,
          ko: `서비스 #${sid} 런타임을 종료합니다. 재시작 전까지 이용할 수 없습니다.`,
        }),
      };
    case 'sync-runtime':
      return {
        title: localize(locale, {
          zh: '同步运行状态',
          en: 'Sync runtime state',
          ja: 'ランタイム状態同期',
          ko: '런타임 상태 동기화',
        }),
        description: localize(locale, {
          zh: `同步服务 #${sid} 的运行时状态。`,
          en: `Reconcile runtime state for service #${sid}.`,
          ja: `サービス #${sid} のランタイム状態を同期します。`,
          ko: `서비스 #${sid} 런타임 상태를 동기화합니다.`,
        }),
      };
    case 'check-service-app-status':
      return {
        title: localize(locale, {
          zh: '查看应用安装状态',
          en: 'Check app install status',
          ja: 'アプリのインストール状態を確認',
          ko: '앱 설치 상태 확인',
        }),
        description: localize(locale, {
          zh: `读取服务 #${sid} 最近的应用安装记录、日志和面板地址。`,
          en: `Read the latest app install records, logs, and panel details for service #${sid}.`,
          ja: `サービス #${sid} の最新インストール記録、ログ、パネル情報を確認します。`,
          ko: `서비스 #${sid}의 최신 설치 기록, 로그, 패널 정보를 확인합니다.`,
        }),
      };
    case 'execute-service-playbook':
      return {
        title: localize(locale, {
          zh: '直接在服务器执行部署（需确认）',
          en: 'Run deployment directly on the server (requires confirmation)',
          ja: 'サーバーへ直接デプロイ（要確認）',
          ko: '서버에서 직접 배포 실행(확인 필요)',
        }),
        description: localize(locale, {
          zh: `机器人会通过 SSH 直接连接服务 #${sid}，执行审计过的部署脚本，并把结果回写到聊天中。`,
          en: `The assistant will connect to service #${sid} over SSH, execute an audited deployment script, and write the result back into the chat.`,
          ja: `アシスタントが SSH でサービス #${sid} に直接接続し、監査済みのデプロイスクリプトを実行して結果を返します。`,
          ko: `어시스턴트가 SSH로 서비스 #${sid}에 직접 접속해 감사된 배포 스크립트를 실행하고 결과를 채팅에 기록합니다.`,
        }),
      };
    case 'install-service-app':
      return {
        title: localize(locale, {
          zh: '安装应用组件（需确认）',
          en: 'Install app component (requires confirmation)',
          ja: 'アプリをインストール（要確認）',
          ko: '앱 구성요소 설치(확인 필요)',
        }),
        description: localize(locale, {
          zh: `为服务 #${sid} 安装新的应用组件，并在完成后回写访问资料。`,
          en: `Install a new app component on service #${sid} and write back access details when it finishes.`,
          ja: `サービス #${sid} に新しいアプリをインストールし、完了後にアクセス情報を保存します。`,
          ko: `서비스 #${sid}에 새 앱 구성요소를 설치하고 완료 후 접속 정보를 기록합니다.`,
        }),
      };
    case 'reveal-server-access':
      return {
        title: localize(locale, {
          zh: '获取服务器登录信息',
          en: 'Get server login access',
          ja: 'サーバーログイン情報を取得',
          ko: '서버 로그인 정보 가져오기',
        }),
        description: localize(locale, {
          zh: `读取服务 #${sid} 的 SSH 登录信息，并生成可复制命令。`,
          en: `Read SSH access details for service #${sid} and generate a copy-ready command.`,
          ja: `サービス #${sid} の SSH 接続情報を読み取り、コピーしやすいコマンドを返します。`,
          ko: `서비스 #${sid}의 SSH 접속 정보를 읽고 바로 복사할 수 있는 명령을 제공합니다.`,
        }),
      };
    case 'cancel-service':
      return {
        title: localize(locale, {
          zh: '取消服务（高风险）',
          en: 'Cancel service (high risk)',
          ja: 'サービス解約（高リスク）',
          ko: '서비스 해지(고위험)',
        }),
        description: localize(locale, {
          zh: `取消服务 #${sid}，该动作会影响计费状态。`,
          en: `Cancel service #${sid}. This action affects billing.`,
          ja: `サービス #${sid} を解約します。課金に影響します。`,
          ko: `서비스 #${sid}를 해지합니다. 과금에 영향을 줍니다.`,
        }),
      };
    case 'renew-service':
      return {
        title: localize(locale, {
          zh: '续费服务（高风险）',
          en: 'Renew service (high risk)',
          ja: 'サービス更新（高リスク）',
          ko: '서비스 갱신(고위험)',
        }),
        description: localize(locale, {
          zh: `为服务 #${sid} 创建续费账单。`,
          en: `Create a renewal invoice for service #${sid}.`,
          ja: `サービス #${sid} の更新請求を作成します。`,
          ko: `서비스 #${sid} 갱신 청구서를 생성합니다.`,
        }),
      };
    case 'delete-runtime':
      return {
        title: localize(locale, {
          zh: '删除运行实例（高风险）',
          en: 'Delete runtime instance (high risk)',
          ja: 'ランタイム削除（高リスク）',
          ko: '런타임 삭제(고위험)',
        }),
        description: localize(locale, {
          zh: `删除服务 #${sid} 的运行实例（非财务动作）。`,
          en: `Delete runtime instance for service #${sid} (operational action).`,
          ja: `サービス #${sid} のランタイムを削除します（運用アクション）。`,
          ko: `서비스 #${sid}의 런타임 인스턴스를 삭제합니다(운영 액션).`,
        }),
      };
    case 'handoff-support':
      return {
        title: localize(locale, {
          zh: '转人工支持',
          en: 'Handoff to support',
          ja: 'サポートへ引き継ぎ',
          ko: '지원팀 인계',
        }),
        description: localize(locale, {
          zh: '将当前问题整理后转给人工支持团队。',
          en: 'Escalate this conversation to human support with context.',
          ja: '会話コンテキスト付きで人間サポートに引き継ぎます。',
          ko: '현재 대화를 요약해 상담원에게 이관합니다.',
        }),
      };
  }
}

function buildFallbackReply(input: AssistantAnswerInput) {
  const intro = input.authenticated
    ? localize(input.locale, {
      zh: '我是树懒云 AI 上线与运维助手，已读取你当前的账户上下文，可以继续规划应用、预览上线和诊断服务账单。',
      en: 'I am the Sloth Cloud AI launch and operations assistant. I have your account context and can continue with app planning, preview launches, and service or billing diagnosis.',
      ja: '私は Sloth Cloud の AI ローンチ兼運用アシスタントです。アカウント文脈を確認し、アプリ計画、プレビュー公開、サービスと請求の診断を続けられます。',
      ko: '저는 Sloth Cloud AI 출시 및 운영 어시스턴트입니다. 계정 컨텍스트를 확인했고 앱 기획, 프리뷰 출시, 서비스 및 청구 진단을 이어갈 수 있습니다.',
    })
    : localize(input.locale, {
      zh: '我是树懒云 AI 上线与运维助手。你当前未登录，我先帮你做应用方案和通用建议；登录后再处理服务、账单和正式开通动作。',
      en: 'I am the Sloth Cloud AI launch and operations assistant. You are not logged in, so I will help with app planning and general guidance first, then handle services, billing, and production actions after login.',
      ja: '私は Sloth Cloud の AI ローンチ兼運用アシスタントです。未ログインのため、まずアプリ計画と一般案内を行い、ログイン後にサービス、請求、正式公開を処理します。',
      ko: '저는 Sloth Cloud AI 출시 및 운영 어시스턴트입니다. 현재 미로그인 상태이므로 먼저 앱 기획과 일반 안내를 제공하고 로그인 후 서비스, 청구, 정식 출시 작업을 처리합니다.',
    });

  const actionLine = input.proposals.length > 0
    ? localize(input.locale, {
      zh: `我为你准备了 ${input.proposals.length} 个可执行动作，选择即可继续。`,
      en: `I prepared ${input.proposals.length} executable actions for you. Select one to continue.`,
      ja: `${input.proposals.length} 件の実行可能アクションを提案しました。選択して続行できます。`,
      ko: `${input.proposals.length}개의 실행 가능한 액션을 준비했습니다. 선택해서 진행할 수 있습니다.`,
    })
    : localize(input.locale, {
      zh: '我先给出诊断结论和下一步建议。',
      en: 'I will provide diagnosis and next-step recommendations first.',
      ja: 'まず診断結果と次の手順を案内します。',
      ko: '우선 진단 결과와 다음 단계를 안내합니다.',
    });

  const details = [
    ...input.accountSummary.slice(0, 4),
    ...input.actionSummary.slice(0, 3),
  ];

  return [intro, actionLine, ...details].filter((line) => line.trim() !== '').join('\n');
}

function normalizeProviderBaseUrl(provider: AssistantLlmProviderConfig) {
  const explicit = normalizeWhitespace(provider.baseUrl ?? '');
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }

  if (provider.name === 'openai') {
    return 'https://api.openai.com/v1';
  }

  return '';
}

function normalizeSelectedProvider(value: string | null | undefined): AssistantProviderName | null {
  const normalized = normalizeWhitespace(value ?? '').toLowerCase();
  if (normalized === 'openai' || normalized === 'gemini' || normalized === 'claude') {
    return normalized;
  }
  return null;
}

function isProviderConfigured(provider: AssistantLlmProviderConfig) {
  const apiKey = normalizeWhitespace(provider.apiKey ?? '');
  const model = normalizeWhitespace(provider.model ?? '');
  const baseUrl = normalizeProviderBaseUrl(provider);
  return apiKey !== '' && model !== '' && baseUrl !== '';
}

function inferModelProvider(
  modelId: string,
  fallbackProvider: AssistantProviderName,
): AssistantProviderName {
  const normalized = modelId.toLowerCase();
  if (normalized.startsWith('gemini') || normalized.startsWith('models/gemini') || normalized.startsWith('imagen')) {
    return 'gemini';
  }
  if (normalized.startsWith('claude')) {
    return 'claude';
  }
  if (normalized.startsWith('gpt') || normalized.startsWith('o1') || normalized.startsWith('o3') || normalized.startsWith('o4')) {
    return 'openai';
  }
  return fallbackProvider;
}

function extractLlmText(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return '';
  }

  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0];
  if (!first || typeof first !== 'object') {
    return '';
  }

  const firstRecord = first as Record<string, unknown>;
  const message = firstRecord.message;
  if (typeof message === 'object' && message !== null) {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === 'string') {
      return normalizeAssistantContent(content);
    }

    if (Array.isArray(content)) {
      const text = content
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (typeof entry !== 'object' || entry === null) return '';
          const item = entry as Record<string, unknown>;
          return typeof item.text === 'string' ? item.text : '';
        })
        .join('\n\n');
      return normalizeAssistantContent(text);
    }
  }

  return '';
}

function extractLlmUsage(payload: unknown): AssistantLlmUsage | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const usage = typeof record.usage === 'object' && record.usage !== null
    ? record.usage as Record<string, unknown>
    : null;
  if (!usage) {
    return null;
  }

  const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
  const completionTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;
  const totalTokens = typeof usage.total_tokens === 'number'
    ? usage.total_tokens
    : (promptTokens + completionTokens);

  if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
    return null;
  }

  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    totalTokens,
  };
}

async function requestLlm(
  provider: AssistantLlmProviderConfig,
  input: AssistantAnswerInput & {
    sessionId?: string;
    userKey?: string;
    userId?: string | null;
  },
  transcript: AssistantMessage[],
) {
  const apiKey = normalizeWhitespace(provider.apiKey ?? '');
  const model = normalizeWhitespace(provider.model ?? '');
  const baseUrl = normalizeProviderBaseUrl(provider);
  if (!apiKey || !model || !baseUrl) {
    return null;
  }

  const systemPrompt = [
    'You are Sloth Cloud Assistant, the customer operations assistant for Sloth Cloud.',
    'You are not a generic GPT, local desktop helper, or coding copilot.',
    'Your business scope is presales consultation, service and invoice explanation, provisioning diagnosis, runtime operations, and support handoff for VPS and managed application hosting.',
    'Guests can only receive general guidance. Logged-in users can discuss their own services, invoices, and operations using the provided accountSummary, actionSummary, proposals, and page context.',
    'Use the provided conversation, authenticated flag, page path, serviceId, invoiceId, accountSummary, actionSummary, and proposals as source-of-truth context.',
    'Never invent service status, provisioning success, Kubernetes capacity, VPS availability, billing outcomes, or completed actions.',
    'Low-risk actions may be described as completed only when the execution result confirms success.',
    'High-risk or billing-impact actions require an explicit confirmation token before execution and must never be claimed as complete earlier.',
    'If a required service or invoice identifier is missing, ask for the number or guide the user to the relevant Sloth Cloud page.',
    'Never output JSON proposals or tool payloads in user replies.',
    'When you provide shell, Docker, SSH, or terminal commands, always put commands in standalone fenced bash blocks. Never interleave command fragments into prose. Keep commands copy-ready.',
    'Always reply in the user locale language when possible, prefer Simplified Chinese for zh locales, and keep answers concise and operational.',
  ].join(' ');

  const contextLines = [
    'assistantScope=customer_operations',
    `authenticated=${input.authenticated ? 'true' : 'false'}`,
    `path=${input.context.path ?? '-'}`,
    `serviceId=${input.context.serviceId ?? '-'}`,
    `invoiceId=${input.context.invoiceId ?? '-'}`,
    `capsuleId=${input.context.capsuleId ?? '-'}`,
    ...input.accountSummary.slice(0, 8),
    ...input.actionSummary.slice(0, 6),
    `proposals=${JSON.stringify(input.proposals.map((proposal) => ({
      title: proposal.title,
      description: proposal.description,
      risk: proposal.risk,
      requiresConfirmation: proposal.requiresConfirmation,
    })))}`,
  ];

  const attachments = Array.isArray(input.attachments) ? input.attachments.slice(0, 4) : [];
  const attachmentSummaryLines = attachments.map((attachment, index) => {
    const name = normalizeWhitespace(attachment.name || `attachment-${index + 1}`) || `attachment-${index + 1}`;
    const mimeType = normalizeWhitespace(attachment.mimeType || 'application/octet-stream') || 'application/octet-stream';
    const sizeBytes = Number.isFinite(attachment.sizeBytes) && attachment.sizeBytes > 0
      ? Math.round(attachment.sizeBytes)
      : 0;
    const hasText = typeof attachment.textContent === 'string' && attachment.textContent.trim() !== '';
    const hasImage = typeof attachment.dataUrl === 'string' && attachment.dataUrl.startsWith('data:image/');
    return `attachment[${index + 1}] name=${name} mime=${mimeType} sizeBytes=${sizeBytes} text=${hasText ? 'yes' : 'no'} image=${hasImage ? 'yes' : 'no'}`;
  });

  if (attachmentSummaryLines.length > 0) {
    contextLines.push(...attachmentSummaryLines);
  }

  const userPromptText = [
    `locale=${input.locale}`,
    `message=${input.userMessage}`,
    ...contextLines,
  ].join('\n');

  const canSendImageParts = provider.name === 'openai';
  const multimodalParts: Array<Record<string, unknown>> = [];
  if (attachments.length > 0) {
    multimodalParts.push({
      type: 'text',
      text: userPromptText,
    });

    for (const attachment of attachments) {
      const name = normalizeWhitespace(attachment.name || 'attachment') || 'attachment';
      const textContent = normalizeAssistantContent(String(attachment.textContent ?? ''));
      if (textContent) {
        multimodalParts.push({
          type: 'text',
          text: `Attachment ${name} content:\n${textContent.slice(0, 12_000)}`,
        });
      }

      if (canSendImageParts && typeof attachment.dataUrl === 'string' && attachment.dataUrl.startsWith('data:image/')) {
        multimodalParts.push({
          type: 'image_url',
          image_url: {
            url: attachment.dataUrl,
          },
        });
      }
    }
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...transcript.slice(-12).map((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
    {
      role: 'user',
      content: multimodalParts.length > 0 ? multimodalParts : userPromptText,
    },
  ];

  const providerHeaders: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
  };

  if (model.startsWith('openclaw') && input.sessionId) {
    const normalizedUserSegment = normalizeWhitespace(input.authenticated
      ? [
          'user',
          input.userId ?? 'current',
          normalizeWhitespace(input.userLabel ?? ''),
        ]
        .filter((segment) => segment && segment !== '')
        .join('-')
      : 'guest')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72)
      || 'guest';
    providerHeaders['x-openclaw-session-key'] = `agent:sloth-cloud:site:${normalizedUserSegment}`;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: providerHeaders,
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`provider=${provider.name} status=${response.status} detail=${detail.slice(0, 240)}`);
  }

  const payload = await response.json().catch(() => ({}));
  const text = extractLlmText(payload);
  if (!text) {
    return null;
  }

  return {
    text: sanitizeAssistantReplyText(text),
    usage: extractLlmUsage(payload),
  } satisfies AssistantLlmResult;
}

function sanitizeAssistantReplyText(text: string) {
  const stripped = text
    .replace(/```json[\s\S]*?"proposals"[\s\S]*?```/gi, '')
    .replace(/```[\s\S]*?"proposals"[\s\S]*?```/gi, '')
    .replace(/`?\s*json\s*\{[\s\S]*?"proposals"[\s\S]*?\}\s*`?/gi, '');

  const normalized = normalizeAssistantContent(stripped);
  return wrapLooseShellCommands(normalized || text);
}

function wrapLooseShellCommands(text: string) {
  if (text.includes('```')) {
    return text;
  }

  const commandLinePattern = /^(?:\$|#)?\s*(?:sudo\s+)?(?:apt(?:-get)?|yum|dnf|apk|pacman|curl|wget|docker(?:\s+compose|-compose)?|kubectl|helm|npm|pnpm|yarn|git|ssh|scp|rsync|chmod|chown|systemctl|service|ufw|iptables|mkdir|cd|cat\s+>|tee\s+|echo\s+["']?deb\b|gpg\b|install\s+-m|export\s+[A-Za-z_][A-Za-z0-9_]*=|\. \/etc\/os-release)\b/i;
  const lines = text.split('\n');
  const output: string[] = [];
  let commandBuffer: string[] = [];

  const flushCommandBuffer = () => {
    if (commandBuffer.length >= 2) {
      output.push('```bash', ...commandBuffer, '```');
    } else {
      output.push(...commandBuffer);
    }
    commandBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const normalized = trimmed.replace(/^[-*]\s+/, '');
    if (commandLinePattern.test(normalized)) {
      commandBuffer.push(normalized);
      continue;
    }

    if (commandBuffer.length > 0) {
      flushCommandBuffer();
    }
    output.push(line);
  }

  if (commandBuffer.length > 0) {
    flushCommandBuffer();
  }

  return normalizeAssistantContent(output.join('\n'));
}

function hashUserKey(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export class AssistantOrchestrator {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly confirmations = new Map<string, ConfirmationRecord>();
  private readonly options: AssistantOrchestratorOptions;
  private readonly logger: NonNullable<AssistantOrchestratorOptions['logger']>;
  private modelCatalogCache:
    | {
        expiresAt: number;
        models: AssistantSelectableModel[];
      }
    | null = null;
  private modelCatalogInflight: Promise<AssistantSelectableModel[]> | null = null;

  constructor(options: AssistantOrchestratorOptions) {
    this.options = options;
    this.logger = options.logger ?? defaultLogger;
  }

  isEnabled() {
    return this.options.enabled;
  }

  async capabilities(locale: string) {
    const configuredProviders = this.options.providers
      .filter((provider) => isProviderConfigured(provider))
      .map((provider) => provider.name);
    const selectableModels = await this.getSelectableModels();
    const defaultModelId = this.resolveDefaultModelId(selectableModels);
    const models = selectableModels.map((entry) => ({
      ...entry,
      isPrimary: entry.id === defaultModelId,
    }));
    const responseMode: AssistantResponseMode = configuredProviders.length > 0 ? 'llm' : 'fallback';

    return {
      enabled: this.options.enabled,
      primaryProvider: this.options.primaryProvider,
      providers: this.options.providers.map((provider) => provider.name),
      configuredProviders,
      selectableModels: models,
      models,
      defaultModelId,
      responseMode,
      mode: localize(locale, {
        zh: 'AI 上线与运维助手',
        en: 'AI launch and operations assistant',
        ja: 'AI ローンチ兼運用アシスタント',
        ko: 'AI 출시 및 운영 어시스턴트',
      }),
      policies: {
        lowRiskAuto: true,
        highRiskRequireConfirmation: true,
      },
      tools: {
        readOnly: ['service-status', 'provisioning-status', 'runtime-status', 'invoice-status'],
        lowRisk: ['create-launch-capsule', 'retry-provisioning', 'restart-runtime', 'sync-runtime', 'check-service-app-status', 'reveal-server-access', 'handoff-support'],
        highRisk: ['execute-service-playbook', 'install-service-app', 'stop-runtime', 'cancel-service', 'renew-service', 'delete-runtime'],
      },
    };
  }

  cleanup() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (new Date(session.expiresAt).getTime() <= now) {
        this.sessions.delete(sessionId);
      }
    }

    for (const [token, record] of this.confirmations.entries()) {
      if (record.expiresAt <= now) {
        this.confirmations.delete(token);
      }
    }
  }

  resolveUserKey(userId: string | null) {
    return userId ? `user:${hashUserKey(userId)}` : 'guest';
  }

  openSession(input: {
    userKey: string;
    sessionId?: string | null;
    context?: Partial<AssistantContext> | null;
  }) {
    this.cleanup();
    const now = Date.now();
    const ttl = this.options.sessionTtlMs;
    const existingId = normalizeWhitespace(input.sessionId ?? '');

    let session = existingId ? this.sessions.get(existingId) : null;
    if (session && session.userKey !== input.userKey) {
      session = null;
    }

    if (!session) {
      const createdAt = nowIso();
      session = {
        id: createId('as'),
        userKey: input.userKey,
        createdAt,
        updatedAt: createdAt,
        expiresAt: new Date(now + ttl).toISOString(),
        context: {
          serviceId: null,
          invoiceId: null,
          capsuleId: null,
          path: null,
          locale: null,
        },
        messages: [],
      };
      this.sessions.set(session.id, session);
    }

    const mergedContext = this.mergeContext(session.context, input.context ?? null);
    session.context = mergedContext;
    session.updatedAt = nowIso();
    session.expiresAt = new Date(now + ttl).toISOString();

    return this.toSessionResult(session);
  }

  updateContext(sessionId: string, userKey: string, context: Partial<AssistantContext> | null) {
    const session = this.mustGetSession(sessionId, userKey);
    session.context = this.mergeContext(session.context, context);
    session.updatedAt = nowIso();
    return this.toSessionResult(session);
  }

  recordUserMessage(sessionId: string, userKey: string, content: string) {
    const session = this.mustGetSession(sessionId, userKey);
    const message: AssistantMessage = {
      id: createId('msg'),
      role: 'user',
      content: normalizeWhitespace(content),
      createdAt: nowIso(),
    };
    session.messages.push(message);
    this.trimMessages(session);
    session.updatedAt = message.createdAt;
    session.expiresAt = new Date(Date.now() + this.options.sessionTtlMs).toISOString();
    return message;
  }

  recordAssistantMessage(sessionId: string, userKey: string, content: string) {
    const session = this.mustGetSession(sessionId, userKey);
    const message: AssistantMessage = {
      id: createId('msg'),
      role: 'assistant',
      content: normalizeAssistantContent(content),
      createdAt: nowIso(),
    };
    session.messages.push(message);
    this.trimMessages(session);
    session.updatedAt = message.createdAt;
    session.expiresAt = new Date(Date.now() + this.options.sessionTtlMs).toISOString();
    return message;
  }

  listMessages(sessionId: string, userKey: string) {
    return [...this.mustGetSession(sessionId, userKey).messages];
  }

  planProposals(input: {
    message: string;
    locale: string;
    context: AssistantContext;
    authenticated: boolean;
  }) {
    const message = normalizeWhitespace(input.message).toLowerCase();
    if (!message) {
      return [];
    }

    const serviceId = extractServiceId(message, input.context.serviceId);
    const invoiceId = input.context.invoiceId;
    const proposals: AssistantActionProposal[] = [];

    const pushProposal = (kind: AssistantActionKind, override?: Partial<AssistantActionRequest>) => {
      const text = buildProposalText(input.locale, kind, serviceId);
      const action: AssistantActionRequest = {
        kind,
        serviceId,
        invoiceId,
        ...override,
      };
      proposals.push({
        id: createId('proposal'),
        title: text.title,
        description: text.description,
        risk: highRiskActions.has(kind) ? 'high' : 'low',
        requiresConfirmation: highRiskActions.has(kind),
        action,
      });
    };

    if (!input.authenticated) {
      return proposals;
    }

    if (containsAny(message, ['retry', '重试', '重新开通', '再开通'])) {
      pushProposal('retry-provisioning');
    }

    if (containsAny(message, ['restart', 'reboot', '重启', '重开'])) {
      pushProposal('restart-runtime');
    }

    if (containsAny(message, ['shutdown', 'power off', 'stop instance', 'stop service', '关机', '停机', '停止服务', '停止实例'])) {
      pushProposal('stop-runtime');
    }

    if (containsAny(message, ['sync', 'reconcile', '同步', '校准'])) {
      pushProposal('sync-runtime');
    }

    if (containsAny(message, [
      '安装进度',
      '安装状态',
      '安装日志',
      '部署日志',
      '最近操作',
      '组件日志',
      '面板地址',
      'panel url',
      'panel address',
      'install status',
      'install log',
      'deploy log',
    ])) {
      pushProposal('check-service-app-status');
    }

    if (containsAny(message, [
      'ssh',
      '登录服务器',
      '登陆服务器',
      '连接服务器',
      '服务器登录',
      '连接命令',
      '登录命令',
      'root密码',
      'root 密码',
      'server login',
      'server access',
      'login command',
    ])) {
      pushProposal('reveal-server-access');
    }

    if (containsAny(message, ['cancel', 'terminate', '取消', '终止'])) {
      const cancellationType = containsAny(message, ['immediate', '立即']) ? 'immediate' : 'end_of_period';
      pushProposal('cancel-service', { cancellationType });
    }

    if (containsAny(message, ['renew', '续费', '续订'])) {
      pushProposal('renew-service');
    }

    if (containsAny(message, ['delete instance', 'delete runtime', '删除实例', '删除容器', '删除应用'])) {
      pushProposal('delete-runtime');
    }

    if (containsAny(message, ['人工', 'support', '工单', 'ticket', '客服'])) {
      pushProposal('handoff-support');
    }

    return proposals;
  }

  isExecutionIntent(message: string) {
    const normalized = normalizeWhitespace(message).toLowerCase();
    return containsAny(normalized, [
      'execute',
      'run it',
      'do it',
      '立即',
      '执行',
      '马上',
      '现在就',
      '确认执行',
    ]);
  }

  shouldAutoExecute(proposal: AssistantActionProposal | null, message: string) {
    if (!proposal) {
      return false;
    }

    if (!lowRiskActions.has(proposal.action.kind)) {
      return false;
    }

    if (proposal.action.kind === 'reveal-server-access') {
      return containsAny(normalizeWhitespace(message).toLowerCase(), [
        'ssh',
        '登录服务器',
        '登陆服务器',
        '连接服务器',
        '服务器登录',
        '复制命令',
        '连接命令',
        '登录命令',
        'server login',
        'server access',
        'login command',
      ]);
    }

    if (proposal.action.kind === 'check-service-app-status') {
      return containsAny(normalizeWhitespace(message).toLowerCase(), [
        '安装进度',
        '安装状态',
        '安装日志',
        '部署日志',
        '最近操作',
        '组件日志',
        '面板地址',
        'panel url',
        'panel address',
        'install status',
        'install log',
        'deploy log',
      ]);
    }

    return this.isExecutionIntent(message);
  }

  issueConfirmation(sessionId: string, userKey: string, proposal: AssistantActionProposal) {
    const token = `cf_${randomBytes(12).toString('hex')}`;
    const expiresAt = Date.now() + this.options.confirmTtlMs;
    this.confirmations.set(token, {
      token,
      sessionId,
      userKey,
      proposal,
      expiresAt,
    });
    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      proposal,
    } satisfies AssistantPendingConfirmation;
  }

  consumeConfirmation(token: string, sessionId: string, userKey: string) {
    const normalized = normalizeWhitespace(token);
    const record = this.confirmations.get(normalized);
    if (!record) {
      return null;
    }

    if (record.sessionId !== sessionId || record.userKey !== userKey) {
      return null;
    }

    if (record.expiresAt <= Date.now()) {
      this.confirmations.delete(normalized);
      return null;
    }

    this.confirmations.delete(normalized);
    return record.proposal;
  }

  async buildAssistantReply(input: AssistantAnswerInput & {
    sessionId: string;
    userKey: string;
    userId?: string | null;
    selectedModelId?: string | null;
  }): Promise<AssistantBuiltReply | null> {
    const session = this.mustGetSession(input.sessionId, input.userKey);

    const chain = await this.orderProviders(input.selectedModelId ?? null);
    if (chain.length === 0) {
      return {
        text: buildFallbackReply(input),
        responseMode: 'fallback',
        resolvedModelId: 'fallback-lite',
        resolvedProvider: null,
        chargedTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    for (const provider of chain) {
      try {
        const response = await requestLlm(provider, input, session.messages.slice(-this.options.maxContextMessages));
        if (response && response.text.trim() !== '') {
          const model = normalizeWhitespace(provider.model ?? '') || provider.name;
          const resolved = resolveAssistantModelCost({
            id: model,
            label: model,
          });
          return {
            text: response.text,
            responseMode: 'llm',
            resolvedModelId: model,
            resolvedProvider: provider.name,
            chargedTokens: response.usage?.totalTokens ?? resolved.costPoints,
            inputTokens: response.usage?.promptTokens ?? 0,
            outputTokens: response.usage?.completionTokens ?? 0,
          };
        }
      } catch (error) {
        this.logger.warn({
          provider: provider.name,
          error,
        }, 'Assistant provider failed. Falling back to next provider.');
      }
    }

    return {
      text: buildFallbackReply(input),
      responseMode: 'fallback',
      resolvedModelId: 'fallback-lite',
      resolvedProvider: null,
      chargedTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  private async orderProviders(selectedModelId: string | null) {
    const ordered: AssistantLlmProviderConfig[] = [];
    const normalizedSelection = normalizeWhitespace(selectedModelId ?? '').toLowerCase();
    const selectableModels = await this.getSelectableModels();
    const selectedModel = normalizedSelection
      ? selectableModels.find((model) => model.id.toLowerCase() === normalizedSelection
        || model.model.toLowerCase() === normalizedSelection
        || model.resolvedModelId.toLowerCase() === normalizedSelection)
      : null;
    const preferredProvider = this.options.providers.find((provider) => {
      const model = normalizeWhitespace(provider.model ?? '').toLowerCase();
      return provider.name === normalizeSelectedProvider(selectedModelId)
        || model === normalizedSelection
        || provider.name === selectedModel?.provider;
    });
    if (preferredProvider) {
      ordered.push(preferredProvider);
    }

    const primary = this.options.providers.find((provider) => provider.name === this.options.primaryProvider);
    if (primary && isProviderConfigured(primary) && !ordered.some((entry) => entry.name === primary.name)) {
      ordered.push(primary);
    }

    for (const provider of this.options.providers) {
      if (!isProviderConfigured(provider)) {
        continue;
      }
      if (ordered.some((entry) => entry.name === provider.name)) {
        continue;
      }
      ordered.push(provider);
    }

    const selectedProvider = normalizeSelectedProvider(selectedModelId);
    const resolvedModel = selectedModel?.resolvedModelId ?? normalizeWhitespace(selectedModelId ?? '');
    if (!resolvedModel || (selectedProvider && resolvedModel === selectedProvider)) {
      return ordered;
    }

    return ordered.map((provider) => ({
      ...provider,
      model: selectedModel && provider.name === selectedModel.provider
        ? resolvedModel
        : provider.model,
    }));
  }

  private buildConfiguredSelectableModels() {
    const configuredProviders = this.options.providers.filter((provider) => isProviderConfigured(provider));
    const models = configuredProviders.map((provider) => {
      const model = normalizeWhitespace(provider.model ?? '');
      const id = model || provider.name;
      const cost = resolveAssistantModelCost({
        id,
        label: id,
      });

      return {
        id,
        provider: provider.name,
        model,
        resolvedModelId: model,
        label: id,
        isPrimary: false,
        costPoints: cost.costPoints,
        routingWeight: cost.routingWeight,
        costTier: cost.costTier,
      } satisfies AssistantSelectableModel;
    });

    const defaultModelId = this.resolveDefaultModelId(models);
    return models.map((model) => ({
      ...model,
      isPrimary: model.id === defaultModelId,
    }));
  }

  private resolveDefaultModelId(models: Array<Pick<AssistantSelectableModel, 'id' | 'resolvedModelId'>>) {
    const primaryConfiguredModel = normalizeWhitespace(
      this.options.providers.find((provider) => provider.name === this.options.primaryProvider)?.model ?? '',
    ).toLowerCase();

    if (primaryConfiguredModel) {
      const matched = models.find((model) => model.resolvedModelId.toLowerCase() === primaryConfiguredModel);
      if (matched) {
        return matched.id;
      }
    }

    return models[0]?.id ?? null;
  }

  private async getSelectableModels() {
    const now = Date.now();
    if (this.modelCatalogCache && this.modelCatalogCache.expiresAt > now) {
      return this.modelCatalogCache.models;
    }

    if (this.modelCatalogInflight) {
      return await this.modelCatalogInflight;
    }

    this.modelCatalogInflight = this.loadSelectableModels()
      .finally(() => {
        this.modelCatalogInflight = null;
      });

    return await this.modelCatalogInflight;
  }

  private async loadSelectableModels() {
    const configuredProviders = this.options.providers.filter((provider) => isProviderConfigured(provider));
    if (configuredProviders.length === 0) {
      const models = this.buildConfiguredSelectableModels();
      this.modelCatalogCache = {
        expiresAt: Date.now() + 60_000,
        models,
      };
      return models;
    }

    const discovered = new Map<string, AssistantSelectableModel>();
    for (const provider of configuredProviders) {
      try {
        const models = await this.fetchDiscoveredModels(provider);
        for (const model of models) {
          const normalizedId = normalizeWhitespace(model.id);
          const key = normalizedId.toLowerCase();
          if (!normalizedId || discovered.has(key)) {
            continue;
          }

          const inferredProvider = inferModelProvider(normalizedId, provider.name);
          const cost = resolveAssistantModelCost({
            id: normalizedId,
            label: normalizedId,
          });

          discovered.set(key, {
            id: normalizedId,
            provider: inferredProvider,
            model: normalizedId,
            resolvedModelId: normalizedId,
            label: normalizedId,
            isPrimary: false,
            costPoints: cost.costPoints,
            routingWeight: cost.routingWeight,
            costTier: cost.costTier,
          });
        }
      } catch (error) {
        this.logger.warn({
          provider: provider.name,
          error,
        }, 'Assistant model discovery failed. Using configured fallback models.');
      }
    }

    const models = discovered.size > 0
      ? [...discovered.values()]
      : this.buildConfiguredSelectableModels();
    const defaultModelId = this.resolveDefaultModelId(models);
    const normalizedModels = models.map((model) => ({
      ...model,
      isPrimary: model.id === defaultModelId,
    }));

    this.modelCatalogCache = {
      expiresAt: Date.now() + 60_000,
      models: normalizedModels,
    };

    return normalizedModels;
  }

  private async fetchDiscoveredModels(provider: AssistantLlmProviderConfig) {
    const apiKey = normalizeWhitespace(provider.apiKey ?? '');
    const baseUrl = normalizeProviderBaseUrl(provider);
    if (!apiKey || !baseUrl) {
      return [] as AssistantDiscoveredModel[];
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`provider=${provider.name} status=${response.status} detail=${detail.slice(0, 240)}`);
    }

    const payload = await response.json().catch(() => ({}));
    const items = Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : [];

    return items
      .map((entry) => {
        if (typeof entry !== 'object' || entry === null) {
          return null;
        }

        const record = entry as Record<string, unknown>;
        const id = normalizeWhitespace(String(record.id ?? ''));
        if (!id) {
          return null;
        }

        return {
          id,
          ownedBy: normalizeWhitespace(String(record.owned_by ?? '')) || null,
        } satisfies AssistantDiscoveredModel;
      })
      .filter((entry): entry is AssistantDiscoveredModel => Boolean(entry));
  }

  private mustGetSession(sessionId: string, userKey: string) {
    this.cleanup();
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('ASSISTANT_SESSION_NOT_FOUND');
    }
    if (session.userKey !== userKey) {
      throw new Error('ASSISTANT_SESSION_FORBIDDEN');
    }
    return session;
  }

  private mergeContext(
    current: AssistantContext,
    incoming: Partial<AssistantContext> | null,
  ) {
    if (!incoming) {
      return current;
    }

    const merged: AssistantContext = {
      serviceId: incoming.serviceId !== undefined ? normalizeServiceId(String(incoming.serviceId ?? '')) : current.serviceId,
      invoiceId: incoming.invoiceId !== undefined ? normalizeWhitespace(String(incoming.invoiceId ?? '')) || null : current.invoiceId,
      capsuleId: incoming.capsuleId !== undefined ? normalizeWhitespace(String(incoming.capsuleId ?? '')) || null : current.capsuleId,
      path: incoming.path !== undefined ? normalizeWhitespace(String(incoming.path ?? '')) || null : current.path,
      locale: incoming.locale !== undefined ? normalizeWhitespace(String(incoming.locale ?? '')) || null : current.locale,
    };
    return merged;
  }

  private trimMessages(session: SessionRecord) {
    const cap = Math.max(8, this.options.maxContextMessages);
    if (session.messages.length <= cap) {
      return;
    }
    session.messages.splice(0, session.messages.length - cap);
  }

  private toSessionResult(session: SessionRecord): AssistantSessionResult {
    return {
      sessionId: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
      context: session.context,
      messages: [...session.messages],
    };
  }
}
