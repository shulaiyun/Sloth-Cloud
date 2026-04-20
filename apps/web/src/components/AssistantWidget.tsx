import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../lib/auth-context';
import { ApiError, requestJson } from '../lib/api';
import { useSite } from '../lib/site-context';
import type {
  AssistantActionProposal,
  AssistantCapabilitiesResponse,
  AssistantConfirmResponse,
  AssistantMessage,
  AssistantMessagesResponse,
  AssistantPendingConfirmation,
  AssistantQuotaSnapshot,
  AssistantSessionResponse,
  AssistantUpgradeCta,
} from '../lib/types';

type LanguageBucket = 'zh' | 'en' | 'ja' | 'ko';

type AssistantCopy = {
  title: string;
  subtitle: string;
  fallbackMode: string;
  model: string;
  pointsUnit: string;
  open: string;
  close: string;
  launcherTitle: string;
  launcherSubtitle: string;
  placeholder: string;
  send: string;
  sending: string;
  thinking: string;
  working: string;
  confirmingWork: string;
  slowReply: string;
  empty: string;
  unavailable: string;
  execute: string;
  highRisk: string;
  confirmationRequired: string;
  confirm: string;
  dismiss: string;
  actionResult: string;
  viewCapsule: string;
  viewPreview: string;
  viewService: string;
  openPanel: string;
  contextService: string;
  contextInvoice: string;
  greetingGuest: string;
  greetingUser: string;
  quotaTitle: string;
  quotaRemaining: string;
  quotaUsed: string;
  quotaReset: string;
  quotaUnlimited: string;
  quotaTierGuest: string;
  quotaTierFree: string;
  quotaTierPaid: string;
  quotaTierUnlimited: string;
  quotaHintGuest: string;
  quotaHintFree: string;
  quotaHintPaid: string;
  quotaHintUnlimited: string;
  modelCosts: string;
  usageLabel: string;
  fullscreen: string;
  windowed: string;
  autoRoute: string;
  manualRoute: string;
  autoRouteHint: string;
  manualRouteHint: string;
  settings: string;
  hideSettings: string;
  upgradeQuota: string;
  codeBlockLabel: string;
  copyCode: string;
  copiedCode: string;
  copyFailed: string;
  attachFile: string;
  attachments: string;
  removeAttachment: string;
  attachmentReadFailed: string;
  attachmentTooLarge: string;
  authRecoveryTitle: string;
  authRecoveryHintGuest: string;
  authRecoveryHintMember: string;
  authRecoveryActionGuest: string;
  authRecoveryActionMember: string;
  authRecoveryRecovered: string;
};

const storageKeys = {
  identity: 'sloth-assistant-identity-v1',
  sessionId: 'sloth-assistant-session-v1',
  history: 'sloth-assistant-history-v1',
  modelSelection: 'sloth-assistant-model-v1',
  routingMode: 'sloth-assistant-routing-v1',
};

function safeLocalStorageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures for degraded environments.
  }
}

function safeLocalStorageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures for degraded environments.
  }
}

type ComposerAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  textContent: string | null;
  dataUrl: string | null;
};

const assistantMaxAttachmentCount = 4;
const assistantMaxTextAttachmentBytes = 260 * 1024;
const assistantMaxImageAttachmentBytes = 450 * 1024;
const assistantMaxTextContentChars = 80_000;

function isLikelyTextAttachment(file: File) {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith('text/')) {
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
    || name.includes('docker-compose');
}

function readFileAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  });
}

const copy: Record<LanguageBucket, AssistantCopy> = {
  zh: {
    title: '智能运营助手',
    subtitle: '可规划应用、生成预览并执行运维动作',
    fallbackMode: '当前未配置大模型密钥，先使用规则诊断与真实业务动作。',
    model: '模型',
    pointsUnit: 'tokens',
    open: '打开助手',
    close: '收起',
    launcherTitle: 'AI 智能机器人',
    launcherSubtitle: '点击生成应用方案、咨询产品或处理服务问题',
    placeholder: '输入问题，例如：帮我做一个预约小程序',
    send: '发送',
    sending: '发送中...',
    thinking: '机器人正在思考并整理回复...',
    working: '机器人正在查询业务状态并准备结果...',
    confirmingWork: '机器人正在执行确认后的操作...',
    slowReply: '这次响应稍慢，通常是正在查询服务、账单或执行动作。',
    empty: '开始对话吧，我可以先帮你规划一个应用或诊断当前状态。',
    unavailable: '智能助手暂时不可用。',
    execute: '执行',
    highRisk: '该动作需确认',
    confirmationRequired: '确认后继续',
    confirm: '确认执行',
    dismiss: '稍后再说',
    actionResult: '执行结果',
    viewCapsule: '查看工作区',
    viewPreview: '打开预览',
    viewService: '查看服务',
    openPanel: '打开面板',
    contextService: '服务上下文',
    contextInvoice: '账单上下文',
    greetingGuest: '你好，我可以先帮你规划应用方案、生成上线计划。登录后还能直接执行服务动作。',
    greetingUser: '你好，我已接入你的业务上下文，可以直接帮你规划应用、查状态并执行动作。',
    quotaTitle: '今日 Tokens',
    quotaRemaining: '剩余 Tokens',
    quotaUsed: '已用 Tokens',
    quotaReset: '刷新时间',
    quotaUnlimited: '无限 Tokens',
    quotaTierGuest: '游客试用',
    quotaTierFree: '登录免费',
    quotaTierPaid: '付费高额',
    quotaTierUnlimited: '无限包',
    quotaHintGuest: '游客仅可少量试用，登录后可解锁正式 Token 配额。',
    quotaHintFree: '购买任意活跃付费服务后，机器人每日 Token 配额会明显提升。',
    quotaHintPaid: '你已拥有高 Token 配额，如需免日限额可升级无限助手包。',
    quotaHintUnlimited: '当前账户在有效期内不受每日 Token 限制。',
    modelCosts: '模型计费',
    usageLabel: '本次消耗',
    fullscreen: '全屏',
    windowed: '窗口',
    autoRoute: '智能路由',
    manualRoute: '手动选择',
    autoRouteHint: '系统会根据问题类型和剩余 Token 自动选择模型。',
    manualRouteHint: '手动固定模型后，将按真实 token 用量计费。',
    settings: '设置',
    hideSettings: '收起设置',
    upgradeQuota: '提额',
    codeBlockLabel: '命令',
    copyCode: '复制',
    copiedCode: '已复制',
    copyFailed: '复制失败',
    attachFile: '上传',
    attachments: '附件',
    removeAttachment: '移除',
    attachmentReadFailed: '读取附件失败',
    attachmentTooLarge: '附件过大，请压缩后重试',
    authRecoveryTitle: '代执行需要恢复登录态',
    authRecoveryHintGuest: '当前服务已经识别，但助手还没拿到你的登录态。点一下后会跳转登录，登录完成自动回到本页。',
    authRecoveryHintMember: '当前页面像是已登录，但助手会话还没恢复。点一下先自动重连；如果仍失败，再带你重新登录。',
    authRecoveryActionGuest: '登录后恢复代执行',
    authRecoveryActionMember: '恢复代执行',
    authRecoveryRecovered: '登录态已恢复。刚才那句我已经帮你放回输入框，直接发送即可继续代执行。',
  },
  en: {
    title: 'AI Operations Assistant',
    subtitle: 'Plan apps, generate previews, and execute operational actions',
    fallbackMode: 'No LLM API key is configured yet. The assistant is using rule-based diagnostics and real actions.',
    model: 'Model',
    pointsUnit: 'tokens',
    open: 'Open assistant',
    close: 'Collapse',
    launcherTitle: 'AI Assistant',
    launcherSubtitle: 'Create app plans, ask about products, or handle services',
    placeholder: 'Ask something like: build me a simple booking app',
    send: 'Send',
    sending: 'Sending...',
    thinking: 'The assistant is thinking and preparing a reply...',
    working: 'The assistant is checking business state and preparing the result...',
    confirmingWork: 'The assistant is executing the confirmed action...',
    slowReply: 'This reply is taking a little longer because it may be checking services, invoices, or actions.',
    empty: 'Start a conversation. I can help plan an app or diagnose your current state first.',
    unavailable: 'Assistant is temporarily unavailable.',
    execute: 'Execute',
    highRisk: 'This action requires confirmation',
    confirmationRequired: 'Confirm to continue',
    confirm: 'Confirm',
    dismiss: 'Dismiss',
    actionResult: 'Action result',
    viewCapsule: 'Open workspace',
    viewPreview: 'Open preview',
    viewService: 'View service',
    openPanel: 'Open panel',
    contextService: 'Service context',
    contextInvoice: 'Invoice context',
    greetingGuest: 'Hi, I can help plan an app and provide guidance now. Sign in to execute service actions later.',
    greetingUser: 'Hi, I have your account context and can plan apps, check status, or execute actions.',
    quotaTitle: 'Today\'s tokens',
    quotaRemaining: 'Remaining tokens',
    quotaUsed: 'Used tokens',
    quotaReset: 'Refreshes at',
    quotaUnlimited: 'Unlimited',
    quotaTierGuest: 'Guest trial',
    quotaTierFree: 'Signed-in free',
    quotaTierPaid: 'Paid high quota',
    quotaTierUnlimited: 'Unlimited pass',
    quotaHintGuest: 'Guests only get a small trial. Sign in to unlock account-level token allowance.',
    quotaHintFree: 'Buy an active paid service to unlock a much larger daily assistant token allowance.',
    quotaHintPaid: 'You already have a high token allowance. Upgrade to the unlimited assistant package to remove the daily cap.',
    quotaHintUnlimited: 'This account currently has no daily assistant token cap while the package stays active.',
    modelCosts: 'Model costs',
    usageLabel: 'Charged',
    fullscreen: 'Fullscreen',
    windowed: 'Windowed',
    autoRoute: 'Smart routing',
    manualRoute: 'Manual model',
    autoRouteHint: 'The assistant will choose a model automatically based on the task and remaining tokens.',
    manualRouteHint: 'When manual mode is enabled, usage is charged by real token consumption.',
    settings: 'Settings',
    hideSettings: 'Hide settings',
    upgradeQuota: 'Upgrade',
    codeBlockLabel: 'Command',
    copyCode: 'Copy',
    copiedCode: 'Copied',
    copyFailed: 'Copy failed',
    attachFile: 'Upload',
    attachments: 'Attachments',
    removeAttachment: 'Remove',
    attachmentReadFailed: 'Failed to read attachment',
    attachmentTooLarge: 'Attachment is too large',
    authRecoveryTitle: 'Execution access needs to be restored',
    authRecoveryHintGuest: 'The target service is already detected, but the assistant does not have your signed-in session yet. Continue to sign in and return here automatically.',
    authRecoveryHintMember: 'This page looks signed in, but the assistant session is still out of sync. Try restoring it first; if that fails, you will be redirected to sign in again.',
    authRecoveryActionGuest: 'Sign in to restore execution',
    authRecoveryActionMember: 'Restore execution access',
    authRecoveryRecovered: 'Execution access was restored. I placed your last request back into the input so you can send it again immediately.',
  },
  ja: {
    title: 'AI運用アシスタント',
    subtitle: 'サービス/請求確認と運用アクション実行',
    fallbackMode: '現在はLLMキー未設定のため、ルールベース診断と実際の運用アクションで動作しています。',
    model: 'モデル',
    pointsUnit: 'tokens',
    open: 'アシスタントを開く',
    close: '閉じる',
    launcherTitle: 'AIアシスタント',
    launcherSubtitle: '商品・請求・サービスの相談はこちら',
    placeholder: '例: サービス #46 のプロビジョニング再試行',
    send: '送信',
    sending: '送信中...',
    thinking: 'アシスタントが回答を整理しています...',
    working: '業務状態を確認して結果を準備しています...',
    confirmingWork: '確認済みの操作を実行しています...',
    slowReply: 'サービス・請求・操作確認のため、少し時間がかかっています。',
    empty: '会話を始めましょう。まず状態を診断できます。',
    unavailable: 'アシスタントは一時的に利用できません。',
    execute: '実行',
    highRisk: '高リスク操作は確認が必要です',
    confirmationRequired: '確認して続行',
    confirm: '確認して実行',
    dismiss: '後で',
    actionResult: '実行結果',
    viewCapsule: 'ワークスペースを開く',
    viewPreview: 'プレビューを開く',
    viewService: 'サービスを開く',
    openPanel: 'パネルを開く',
    contextService: 'サービス文脈',
    contextInvoice: '請求文脈',
    greetingGuest: 'こんにちは。一般案内が可能です。ログイン後は操作実行も可能です。',
    greetingUser: 'こんにちは。アカウント文脈を読み込み済みで、状態確認や操作実行が可能です。',
    quotaTitle: '本日の Tokens',
    quotaRemaining: '残り',
    quotaUsed: '使用済み Tokens',
    quotaReset: '更新時刻',
    quotaUnlimited: '無制限',
    quotaTierGuest: 'ゲスト試用',
    quotaTierFree: 'ログイン無料枠',
    quotaTierPaid: '有料高枠',
    quotaTierUnlimited: '無制限パス',
    quotaHintGuest: 'ゲストは少量の試用のみです。ログインすると正式な token 枠が有効になります。',
    quotaHintFree: '有効な有料サービスを持つと、日次アシスタント token 枠が大きく増えます。',
    quotaHintPaid: 'すでに高い token 枠です。日次上限をなくすには無制限アシスタント商品へアップグレードしてください。',
    quotaHintUnlimited: 'このアカウントは有効期間中、日次 token 上限がありません。',
    modelCosts: 'モデルコスト',
    usageLabel: '今回の消費',
    fullscreen: '全画面',
    windowed: 'ウィンドウ',
    autoRoute: '自動ルーティング',
    manualRoute: '手動選択',
    autoRouteHint: '質問内容と残り token に応じて自動的に最適なモデルを選択します。',
    manualRouteHint: '手動モードでは、実際の token 使用量で課金されます。',
    settings: '設定',
    hideSettings: '設定を閉じる',
    upgradeQuota: 'アップグレード',
    codeBlockLabel: 'コマンド',
    copyCode: 'コピー',
    copiedCode: 'コピー済み',
    copyFailed: 'コピー失敗',
    attachFile: 'アップロード',
    attachments: '添付',
    removeAttachment: '削除',
    attachmentReadFailed: '添付の読み取りに失敗しました',
    attachmentTooLarge: '添付ファイルが大きすぎます',
    authRecoveryTitle: '実行権限の復旧が必要です',
    authRecoveryHintGuest: '対象サービスは認識済みですが、アシスタントはまだログイン状態を取得できていません。続行するとログイン後にこのページへ戻ります。',
    authRecoveryHintMember: 'このページはログイン済みに見えますが、アシスタントのセッションがずれています。まず復旧を試し、必要なら再ログインへ案内します。',
    authRecoveryActionGuest: 'ログインして実行を復旧',
    authRecoveryActionMember: '実行権限を復旧',
    authRecoveryRecovered: 'ログイン状態が復旧しました。直前の依頼を入力欄へ戻したので、そのまま送信してください。',
  },
  ko: {
    title: 'AI 운영 도우미',
    subtitle: '서비스/청구 조회 및 운영 작업 실행',
    fallbackMode: '현재 LLM API 키가 없어 규칙 기반 진단과 실제 작업 실행 모드로 동작합니다.',
    model: '모델',
    pointsUnit: 'tokens',
    open: '도우미 열기',
    close: '접기',
    launcherTitle: 'AI 도우미',
    launcherSubtitle: '상품, 청구, 서비스 문의',
    placeholder: '예: 서비스 #46 프로비저닝 재시도',
    send: '전송',
    sending: '전송 중...',
    thinking: '도우미가 답변을 정리하고 있어요...',
    working: '업무 상태를 조회하고 결과를 준비하고 있어요...',
    confirmingWork: '확인된 작업을 실행하고 있어요...',
    slowReply: '서비스, 청구, 작업 조회 때문에 응답이 조금 더 걸리고 있어요.',
    empty: '대화를 시작해 주세요. 현재 상태를 먼저 진단할 수 있습니다.',
    unavailable: '도우미를 일시적으로 사용할 수 없습니다.',
    execute: '실행',
    highRisk: '고위험 작업은 확인이 필요합니다',
    confirmationRequired: '확인 후 계속',
    confirm: '확인 후 실행',
    dismiss: '나중에',
    actionResult: '실행 결과',
    viewCapsule: '작업공간 열기',
    viewPreview: '미리보기 열기',
    viewService: '서비스 보기',
    openPanel: '패널 열기',
    contextService: '서비스 컨텍스트',
    contextInvoice: '청구 컨텍스트',
    greetingGuest: '안녕하세요. 일반 안내를 제공할 수 있습니다. 로그인 후 작업 실행이 가능합니다.',
    greetingUser: '안녕하세요. 계정 컨텍스트를 읽어 상태 조회와 작업 실행이 가능합니다.',
    quotaTitle: '오늘의 Tokens',
    quotaRemaining: '남은 Tokens',
    quotaUsed: '사용 Tokens',
    quotaReset: '초기화 시각',
    quotaUnlimited: '무제한',
    quotaTierGuest: '게스트 체험',
    quotaTierFree: '로그인 무료',
    quotaTierPaid: '유료 고한도',
    quotaTierUnlimited: '무제한 패스',
    quotaHintGuest: '게스트는 소량 체험만 가능합니다. 로그인하면 정식 token 한도를 사용할 수 있습니다.',
    quotaHintFree: '활성 유료 서비스를 보유하면 일일 도우미 token 한도가 크게 늘어납니다.',
    quotaHintPaid: '이미 높은 token 한도를 사용 중입니다. 일일 제한을 없애려면 무제한 도우미 상품으로 업그레이드하세요.',
    quotaHintUnlimited: '현재 계정은 활성 기간 동안 일일 token 제한이 없습니다.',
    modelCosts: '모델 비용',
    usageLabel: '이번 사용량',
    fullscreen: '전체화면',
    windowed: '창 모드',
    autoRoute: '스마트 라우팅',
    manualRoute: '수동 선택',
    autoRouteHint: '질문 유형과 남은 token에 맞춰 모델을 자동 선택합니다.',
    manualRouteHint: '수동 모드에서는 실제 token 사용량으로 차감됩니다.',
    settings: '설정',
    hideSettings: '설정 닫기',
    upgradeQuota: '업그레이드',
    codeBlockLabel: '명령어',
    copyCode: '복사',
    copiedCode: '복사됨',
    copyFailed: '복사 실패',
    attachFile: '업로드',
    attachments: '첨부',
    removeAttachment: '제거',
    attachmentReadFailed: '첨부 파일을 읽지 못했습니다',
    attachmentTooLarge: '첨부 파일이 너무 큽니다',
    authRecoveryTitle: '대행 실행 권한 복구가 필요합니다',
    authRecoveryHintGuest: '대상 서비스는 이미 인식되었지만, 도우미가 아직 로그인 세션을 받지 못했습니다. 계속하면 로그인 후 이 페이지로 돌아옵니다.',
    authRecoveryHintMember: '페이지는 로그인된 것처럼 보이지만 도우미 세션이 아직 맞지 않습니다. 먼저 복구를 시도하고, 필요하면 다시 로그인으로 안내합니다.',
    authRecoveryActionGuest: '로그인 후 실행 복구',
    authRecoveryActionMember: '실행 권한 복구',
    authRecoveryRecovered: '로그인 상태가 복구되었습니다. 방금 요청을 입력창에 다시 넣어 두었으니 바로 전송하면 됩니다.',
  },
};

function looksLikeDirectExecutionIntent(
  message: string,
  attachments: ComposerAttachment[],
  requestedAction?: AssistantActionProposal['action'],
) {
  if (requestedAction) {
    return requestedAction.kind !== 'create-launch-capsule';
  }

  if (attachments.length > 0) {
    return true;
  }

  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    '直接执行',
    '直接安装',
    '直接给我执行',
    '直接给我装',
    '代执行',
    '帮我安装',
    '帮我部署',
    '安装一个',
    '部署一个',
    'execute',
    'install',
    'deploy',
    'docker',
    'compose',
    'ssh',
    'nginx proxy manager',
  ].some((keyword) => normalized.includes(keyword));
}

type AssistantActionResultPayload = NonNullable<AssistantMessagesResponse['data']['actionResult']>;
type AssistantGenerationTaskStep = {
  id: string;
  title: string;
  status: string;
  detail: string;
};
type AssistantGenerationTaskSnapshot = {
  taskId: string;
  title: string;
  status: string;
  progress: number;
  summary: string;
  detail: string | null;
  error: string | null;
  previewUrl: string | null;
  capsulePath: string | null;
  capsuleUrl: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  steps: AssistantGenerationTaskStep[];
};
type AssistantRemoteExecTraceStep = {
  id: string;
  label: string;
  status: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number | null;
  stdout: string | null;
  stderr: string | null;
};
type AssistantOperatorTaskResponse = {
  message: string;
  data: {
    id: string;
    title: string;
    status: string;
    progress: number;
    summary: string;
    detail: string;
    capsulePath: string | null;
    previewUrl: string | null;
    updatedAt: string;
    completedAt: string | null;
    error: string | null;
    steps: Array<{
      id: string;
      title: string;
      status: string;
      detail: string;
    }>;
  };
};

function actionFooterLabel(proposal: AssistantActionProposal, i18n: AssistantCopy) {
  if (proposal.risk === 'high') {
    return i18n.highRisk;
  }

  return proposal.requiresConfirmation ? i18n.confirmationRequired : i18n.execute;
}

function actionResultLinks(actionResult: AssistantActionResultPayload | null) {
  const data = actionResult?.data;
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : null;

  return {
    capsulePath: typeof record?.capsulePath === 'string' ? record.capsulePath : null,
    capsuleUrl: typeof record?.capsuleUrl === 'string' ? record.capsuleUrl : null,
    previewUrl: typeof record?.previewUrl === 'string' ? record.previewUrl : null,
    servicePath: typeof record?.servicePath === 'string' ? record.servicePath : null,
    panelUrl: typeof record?.panelUrl === 'string' ? record.panelUrl : null,
  };
}

function actionResultRecord(actionResult: AssistantActionResultPayload | null) {
  const data = actionResult?.data;
  return data && typeof data === 'object' ? data as Record<string, unknown> : null;
}

function parseGenerationTaskSnapshot(value: unknown): AssistantGenerationTaskSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const taskId = typeof record.taskId === 'string'
    ? record.taskId
    : typeof record.id === 'string'
      ? record.id
      : null;
  const title = typeof record.title === 'string' ? record.title : null;
  const status = typeof record.status === 'string' ? record.status : null;
  const summary = typeof record.summary === 'string' ? record.summary : null;
  const progress = typeof record.progress === 'number' ? record.progress : null;

  if (!taskId || !title || !status || summary === null || progress === null) {
    return null;
  }

  const rawSteps = Array.isArray(record.steps) ? record.steps : [];
  const steps = rawSteps
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const step = entry as Record<string, unknown>;
      if (typeof step.id !== 'string' || typeof step.title !== 'string' || typeof step.status !== 'string') {
        return null;
      }

      return {
        id: step.id,
        title: step.title,
        status: step.status,
        detail: typeof step.detail === 'string' ? step.detail : '',
      } satisfies AssistantGenerationTaskStep;
    })
    .filter((entry): entry is AssistantGenerationTaskStep => Boolean(entry));

  return {
    taskId,
    title,
    status,
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    summary,
    detail: typeof record.detail === 'string' ? record.detail : null,
    error: typeof record.error === 'string' ? record.error : null,
    previewUrl: typeof record.previewUrl === 'string' ? record.previewUrl : null,
    capsulePath: typeof record.capsulePath === 'string' ? record.capsulePath : null,
    capsuleUrl: typeof record.capsuleUrl === 'string' ? record.capsuleUrl : null,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
    completedAt: typeof record.completedAt === 'string' ? record.completedAt : null,
    steps,
  };
}

function taskSnapshotFromActionResult(actionResult: AssistantActionResultPayload | null) {
  const record = actionResultRecord(actionResult);
  return parseGenerationTaskSnapshot(record?.task ?? record?.generationTask ?? null);
}

function parseLatestTaskIdFromMessages(messages: AssistantMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const content = messages[index]?.content ?? '';
    const match = content.match(/\btask_[a-z0-9]+\b/i);
    if (match?.[0]) {
      return match[0];
    }
  }

  return null;
}

function parseRemoteExecTrace(actionResult: AssistantActionResultPayload | null) {
  const record = actionResultRecord(actionResult);
  const rawSteps = Array.isArray(record?.steps) ? record.steps : [];

  return rawSteps
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const step = entry as Record<string, unknown>;
      if (typeof step.id !== 'string' || typeof step.label !== 'string' || typeof step.status !== 'string') {
        return null;
      }

      return {
        id: step.id,
        label: step.label,
        status: step.status,
        exitCode: typeof step.exitCode === 'number' ? step.exitCode : null,
        signal: typeof step.signal === 'string' ? step.signal : null,
        durationMs: typeof step.durationMs === 'number' ? step.durationMs : null,
        stdout: typeof step.stdout === 'string' ? step.stdout : null,
        stderr: typeof step.stderr === 'string' ? step.stderr : null,
      } satisfies AssistantRemoteExecTraceStep;
    })
    .filter((entry): entry is AssistantRemoteExecTraceStep => Boolean(entry));
}

function normalizeTaskResponseSnapshot(data: AssistantOperatorTaskResponse['data']): AssistantGenerationTaskSnapshot {
  return {
    taskId: data.id,
    title: data.title,
    status: data.status,
    progress: Math.max(0, Math.min(100, Math.round(data.progress))),
    summary: data.summary,
    detail: data.detail,
    error: data.error,
    previewUrl: data.previewUrl ?? null,
    capsulePath: data.capsulePath ?? null,
    capsuleUrl: data.capsulePath ?? null,
    updatedAt: data.updatedAt,
    completedAt: data.completedAt ?? null,
    steps: Array.isArray(data.steps)
      ? data.steps.map((step) => ({
        id: step.id,
        title: step.title,
        status: step.status,
        detail: step.detail,
      }))
      : [],
  };
}

function isTaskRunning(status: string | null | undefined) {
  return status === 'queued' || status === 'planning' || status === 'coding' || status === 'building_preview';
}

function taskStageLabel(status: string, locale: string) {
  const isZh = locale.toLowerCase().startsWith('zh');
  switch (status) {
    case 'queued':
      return isZh ? '排队中' : 'Queued';
    case 'planning':
      return isZh ? '规划中' : 'Planning';
    case 'coding':
      return isZh ? '编码中' : 'Coding';
    case 'building_preview':
      return isZh ? '构建预览中' : 'Building preview';
    case 'completed':
      return isZh ? '已完成' : 'Completed';
    case 'failed':
      return isZh ? '失败' : 'Failed';
    case 'missing':
      return isZh ? '记录丢失' : 'Record missing';
    default:
      return status;
  }
}

function taskStepLabel(status: string, locale: string) {
  const isZh = locale.toLowerCase().startsWith('zh');
  switch (status) {
    case 'completed':
      return isZh ? '已完成' : 'Completed';
    case 'in_progress':
      return isZh ? '进行中' : 'In progress';
    case 'attention':
      return isZh ? '需处理' : 'Needs attention';
    case 'planned':
      return isZh ? '待执行' : 'Planned';
    default:
      return status;
  }
}

function execStepLabel(status: string, locale: string) {
  const isZh = locale.toLowerCase().startsWith('zh');
  switch (status) {
    case 'completed':
      return isZh ? '成功' : 'Completed';
    case 'failed':
      return isZh ? '失败' : 'Failed';
    default:
      return status;
  }
}

function formatTaskTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return '-';
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatStepDuration(value: number | null | undefined, locale: string) {
  if (!value || value <= 0) {
    return null;
  }

  const seconds = Math.max(1, Math.round(value / 1000));
  return locale.toLowerCase().startsWith('zh') ? `${seconds} 秒` : `${seconds}s`;
}

function languageBucket(locale: string): LanguageBucket {
  const normalized = locale.toLowerCase();
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('ko')) return 'ko';
  if (normalized.startsWith('zh')) return 'zh';
  return 'en';
}

function parseRouteContext(pathname: string) {
  const serviceMatch = pathname.match(/^\/services\/([^/]+)$/);
  const invoiceMatch = pathname.match(/^\/invoices\/([^/]+)$/);

  return {
    serviceId: serviceMatch?.[1] ?? null,
    invoiceId: invoiceMatch?.[1] ?? null,
    path: pathname,
  };
}

function buildRequestContext(
  context: ReturnType<typeof parseRouteContext>,
  locale: string,
) {
  return {
    ...(context.serviceId ? { serviceId: context.serviceId } : {}),
    ...(context.invoiceId ? { invoiceId: context.invoiceId } : {}),
    ...(context.path ? { path: context.path } : {}),
    locale,
  };
}

function quotaTierLabel(quota: AssistantQuotaSnapshot | null, i18n: AssistantCopy) {
  switch (quota?.tier) {
    case 'free':
      return i18n.quotaTierFree;
    case 'paid':
      return i18n.quotaTierPaid;
    case 'unlimited':
      return i18n.quotaTierUnlimited;
    case 'guest':
    default:
      return i18n.quotaTierGuest;
  }
}

function quotaTierHint(quota: AssistantQuotaSnapshot | null, i18n: AssistantCopy) {
  switch (quota?.tier) {
    case 'free':
      return i18n.quotaHintFree;
    case 'paid':
      return i18n.quotaHintPaid;
    case 'unlimited':
      return i18n.quotaHintUnlimited;
    case 'guest':
    default:
      return i18n.quotaHintGuest;
  }
}

function formatQuotaReset(resetAt: string | null | undefined, locale: string) {
  if (!resetAt) {
    return '-';
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(resetAt));
  } catch {
    return resetAt;
  }
}

function formatTokenCount(value: number | null | undefined, locale: string, compact = false) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  try {
    return new Intl.NumberFormat(locale, compact ? {
      notation: 'compact',
      maximumFractionDigits: 1,
    } : {
      maximumFractionDigits: 0,
    }).format(value ?? 0);
  } catch {
    return String(value ?? 0);
  }
}

function quotaDailyTokens(quota: AssistantQuotaSnapshot | null) {
  return quota?.dailyTokenLimit ?? quota?.dailyLimit ?? null;
}

function quotaUsedTokens(quota: AssistantQuotaSnapshot | null) {
  return quota?.usedTokens ?? quota?.usedPoints ?? 0;
}

function quotaRemainingTokens(quota: AssistantQuotaSnapshot | null) {
  return quota?.remainingTokens ?? quota?.remainingPoints ?? null;
}

function buildUsageNote(
  locale: string,
  i18n: AssistantCopy,
  resolvedModelId: string | null | undefined,
  chargedTokens: number | null | undefined,
) {
  if (!resolvedModelId || !Number.isFinite(chargedTokens) || (chargedTokens ?? 0) <= 0) {
    return null;
  }

  return `${i18n.usageLabel}: ${resolvedModelId} · ${formatTokenCount(chargedTokens, locale)} ${i18n.pointsUnit}`;
}

function quotaRemainingPercent(quota: AssistantQuotaSnapshot | null) {
  if (!quota) {
    return 0;
  }

  if (quota.unlimited) {
    return 100;
  }

  const dailyLimit = quota.dailyTokenLimit ?? quota.dailyLimit ?? 0;
  if (dailyLimit <= 0) {
    return 0;
  }

  const remainingTokens = quota.remainingTokens ?? quota.remainingPoints ?? 0;
  return Math.max(0, Math.min(100, Math.round((remainingTokens / dailyLimit) * 100)));
}

function readAssistantErrorPayload(error: ApiError) {
  if (typeof error.payload !== 'object' || error.payload === null) {
    return null;
  }

  const record = error.payload as Record<string, unknown>;
  const quota = typeof record.quota === 'object' && record.quota !== null
    ? record.quota as AssistantQuotaSnapshot
    : null;
  const upgradeCta = typeof record.upgradeCta === 'object' && record.upgradeCta !== null
    ? record.upgradeCta as AssistantUpgradeCta
    : null;
  const detail = typeof record.detail === 'string' ? record.detail : null;
  const retryAfterSeconds = typeof record.retryAfterSeconds === 'number' ? record.retryAfterSeconds : null;

  return {
    code: typeof record.code === 'string' ? record.code : null,
    detail,
    quota,
    upgradeCta,
    retryAfterSeconds,
  };
}

type MessageBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'unordered-list'; items: string[] }
  | { kind: 'ordered-list'; items: string[] }
  | { kind: 'code-block'; code: string; language: string | null };

async function writeClipboardText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard is not available.');
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('Copy command was rejected.');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

function AssistantCodeBlock(props: {
  code: string;
  language: string | null;
  i18n: AssistantCopy;
}) {
  const { code, language, i18n } = props;
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle');

  useEffect(() => {
    if (copyState === 'idle') {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopyState('idle');
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [copyState]);

  const buttonLabel = copyState === 'done'
    ? i18n.copiedCode
    : copyState === 'failed'
      ? i18n.copyFailed
      : i18n.copyCode;

  return (
    <div className="assistant-message__code-block">
      <div className="assistant-message__code-head">
        <span>{language || i18n.codeBlockLabel}</span>
        <button
          className={`assistant-message__copy-button ${copyState !== 'idle' ? 'is-active' : ''}`}
          onClick={() => {
            void writeClipboardText(code)
              .then(() => setCopyState('done'))
              .catch(() => setCopyState('failed'));
          }}
          type="button"
        >
          {buttonLabel}
        </button>
      </div>
      <pre className="assistant-message__pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function normalizeMessageContent(content: string) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/([^\n])\s+(?=(?:[-*•]|\d+\.)\s)/g, '$1\n')
    .replace(/\n{3,}/g, '\n\n');
}

function joinSentenceChunk(left: string, right: string) {
  if (!left) {
    return right;
  }

  const needsSpace = /[A-Za-z0-9`)]$/.test(left) && /^[A-Za-z0-9(`]/.test(right);
  return needsSpace ? `${left} ${right}` : `${left}${right}`;
}

function isLikelyShellCommandLine(input: string) {
  const line = input.trim();
  if (!line) {
    return false;
  }

  if (
    line.startsWith('```')
    || /^[-*•]\s+/.test(line)
    || /^\d+\.\s+/.test(line)
    || /^#{2,}\s+/.test(line)
  ) {
    return false;
  }

  if (/^(sudo\s+)?(apt(?:-get)?|yum|dnf|apk|brew|curl|wget|git|docker(?:-compose)?|docker compose|kubectl|systemctl|service|chmod|chown|mkdir|cd|cp|mv|rm|cat|echo|export|node|npm|pnpm|yarn|python3?|pip3?|go|composer|php|bash|sh|ssh)\b/i.test(line)) {
    return true;
  }

  if (/^[A-Z_][A-Z0-9_]*=.+$/.test(line)) {
    return true;
  }

  if (/(^|\s)(&&|\|\||\|)\s/.test(line)) {
    return true;
  }

  return false;
}

function splitParagraphText(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      if (line.length <= 54 || isLikelyShellCommandLine(line)) {
        return [line];
      }

      const sentences = line.match(/[^。！？；.!?]+[。！？；.!?]?/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [line];
      const chunks: string[] = [];
      let current = '';

      for (const sentence of sentences) {
        if (!current) {
          current = sentence;
          continue;
        }

        if (/[:：]$/.test(current)) {
          chunks.push(current);
          current = sentence;
          continue;
        }

        const next = joinSentenceChunk(current, sentence);
        if (next.length > 54) {
          chunks.push(current);
          current = sentence;
          continue;
        }

        current = next;
      }

      if (current) {
        chunks.push(current);
      }

      return chunks;
    });
}

function renderInlineContent(text: string, keyPrefix: string): ReactNode[] {
  function renderTextWithLinks(value: string, prefix: string): ReactNode[] {
    if (!value) {
      return [];
    }

    const nodes: ReactNode[] = [];
    const pattern = /(https?:\/\/[^\s<>"'`]+)/gi;
    let cursor = 0;
    let match: RegExpExecArray | null = pattern.exec(value);
    let index = 0;

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

  const segments: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null = pattern.exec(text);
  let index = 0;

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

function buildMessageBlocks(content: string): MessageBlock[] {
  const lines = normalizeMessageContent(content).split('\n');
  const blocks: MessageBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index] ?? '';
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const language = line.slice(3).trim() || null;
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length) {
        const candidate = lines[index] ?? '';
        if (candidate.trim().startsWith('```')) {
          index += 1;
          break;
        }
        codeLines.push(candidate);
        index += 1;
      }

      blocks.push({
        kind: 'code-block',
        code: codeLines.join('\n').replace(/\n+$/g, ''),
        language,
      });
      continue;
    }

    if (isLikelyShellCommandLine(rawLine)) {
      const codeLines: string[] = [];
      while (index < lines.length) {
        const candidateRaw = lines[index] ?? '';
        const candidate = candidateRaw.trim();
        if (!candidate || candidate.startsWith('```') || /^[-*•]\s+/.test(candidate) || /^\d+\.\s+/.test(candidate)) {
          break;
        }

        if (isLikelyShellCommandLine(candidateRaw)) {
          codeLines.push(candidateRaw);
          index += 1;
          continue;
        }

        // Keep inline comment lines together once command collection has started.
        if (codeLines.length > 0 && /^#\s+/.test(candidate)) {
          codeLines.push(candidateRaw);
          index += 1;
          continue;
        }

        break;
      }

      if (codeLines.length > 0) {
        blocks.push({
          kind: 'code-block',
          code: codeLines.join('\n').replace(/\n+$/g, ''),
          language: 'bash',
        });
        continue;
      }
    }

    if (/^[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = (lines[index] ?? '').trim();
        if (!candidate || candidate.startsWith('```') || !/^[-*•]\s+/.test(candidate)) {
          break;
        }
        items.push(candidate.replace(/^[-*•]\s+/, '').trim());
        index += 1;
      }
      blocks.push({ kind: 'unordered-list', items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const candidate = (lines[index] ?? '').trim();
        if (!candidate || candidate.startsWith('```') || !/^\d+\.\s+/.test(candidate)) {
          break;
        }
        items.push(candidate.replace(/^\d+\.\s+/, '').trim());
        index += 1;
      }
      blocks.push({ kind: 'ordered-list', items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const candidate = (lines[index] ?? '').trim();
      if (!candidate || candidate.startsWith('```') || /^[-*•]\s+/.test(candidate) || /^\d+\.\s+/.test(candidate)) {
        break;
      }
      paragraphLines.push(candidate);
      index += 1;
    }

    const paragraphText = paragraphLines.join('\n');
    const paragraphChunks = splitParagraphText(paragraphText);

    paragraphChunks.forEach((chunk) => {
      blocks.push({
        kind: 'paragraph',
        text: chunk,
      });
    });
  }

  return blocks;
}

function renderMessageContent(content: string, i18n: AssistantCopy) {
  const blocks = buildMessageBlocks(content);

  return (
    <div className="assistant-message__content">
      {blocks.map((block, blockIndex) => {
        if (block.kind === 'unordered-list') {
          return (
            <ul className="assistant-message__list" key={`ul-${blockIndex}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`ul-${blockIndex}-${itemIndex}`}>
                  {renderInlineContent(item, `ul-${blockIndex}-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.kind === 'ordered-list') {
          return (
            <ol className="assistant-message__list assistant-message__list--ordered" key={`ol-${blockIndex}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`ol-${blockIndex}-${itemIndex}`}>
                  {renderInlineContent(item, `ol-${blockIndex}-${itemIndex}`)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.kind === 'code-block') {
          return (
            <AssistantCodeBlock
              code={block.code}
              i18n={i18n}
              key={`code-${blockIndex}`}
              language={block.language}
            />
          );
        }

        return (
          <p className="assistant-message__paragraph" key={`p-${blockIndex}`}>
            {block.text.split('\n').map((line, lineIndex, entries) => (
              <Fragment key={`p-${blockIndex}-line-${lineIndex}`}>
                {renderInlineContent(line, `p-${blockIndex}-line-${lineIndex}`)}
                {lineIndex < entries.length - 1 ? <br /> : null}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function trimMessages(messages: AssistantMessage[]) {
  if (messages.length <= 40) {
    return messages;
  }
  return messages.slice(messages.length - 40);
}

function buildAssistantIdentityKey(isAuthenticated: boolean, userId: string | null | undefined) {
  if (!isAuthenticated) {
    return 'guest';
  }

  return userId ? `user:${userId}` : 'user:current';
}

function clearPersistedAssistantSession() {
  if (typeof window === 'undefined') {
    return;
  }

  safeLocalStorageRemove(storageKeys.sessionId);
  safeLocalStorageRemove(storageKeys.history);
}

export function AssistantWidget() {
  const location = useLocation();
  const navigate = useNavigate();
  const { locale } = useSite();
  const { isAuthenticated, loading: authLoading, user, refresh: refreshAuth } = useAuth();
  const i18n = copy[languageBucket(locale)];
  const context = useMemo(() => parseRouteContext(location.pathname), [location.pathname]);
  const nextPath = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.hash, location.pathname, location.search],
  );
  const identityKey = useMemo(
    () => buildAssistantIdentityKey(isAuthenticated, user?.id),
    [isAuthenticated, user?.id],
  );

  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [proposals, setProposals] = useState<AssistantActionProposal[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<AssistantPendingConfirmation | null>(null);
  const [actionResult, setActionResult] = useState<AssistantActionResultPayload | null>(null);
  const [trackedTask, setTrackedTask] = useState<AssistantGenerationTaskSnapshot | null>(null);
  const [capabilities, setCapabilities] = useState<AssistantCapabilitiesResponse['data'] | null>(null);
  const [quota, setQuota] = useState<AssistantQuotaSnapshot | null>(null);
  const [upgradeCta, setUpgradeCta] = useState<AssistantUpgradeCta | null>(null);
  const [usageNote, setUsageNote] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [pendingReplyKind, setPendingReplyKind] = useState<'reply' | 'action' | 'confirm' | null>(null);
  const [showSlowReply, setShowSlowReply] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [autoRoute, setAutoRoute] = useState(() => safeLocalStorageGet(storageKeys.routingMode) !== 'manual');
  const [showSettings, setShowSettings] = useState(false);
  const [assistantAuthenticated, setAssistantAuthenticated] = useState<boolean | null>(null);
  const [authRecoveryNeeded, setAuthRecoveryNeeded] = useState(false);
  const [recoveringExecution, setRecoveringExecution] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragState, setDragState] = useState<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const lastDirectExecutionMessageRef = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    const savedIdentity = safeLocalStorageGet(storageKeys.identity);
    const sameIdentity = savedIdentity === identityKey;
    const savedSessionId = sameIdentity ? safeLocalStorageGet(storageKeys.sessionId) : null;
    const savedRaw = sameIdentity ? safeLocalStorageGet(storageKeys.history) : null;

    if (!sameIdentity) {
      clearPersistedAssistantSession();
      setSessionId(null);
      setMessages([]);
      setProposals([]);
      setPendingConfirmation(null);
      setActionResult(null);
      setTrackedTask(null);
      setQuota(null);
      setUpgradeCta(null);
      setUsageNote(null);
      setAssistantAuthenticated(null);
      setAuthRecoveryNeeded(false);
    } else if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw) as AssistantMessage[];
        if (Array.isArray(parsed)) {
          setMessages(trimMessages(parsed));
        }
      } catch {
        setMessages([]);
      }
    }

    setLoading(true);
    setError(null);
    requestJson<AssistantSessionResponse>('/api/v1/assistant/session', {
      method: 'POST',
      body: {
        sessionId: sameIdentity ? (savedSessionId ?? undefined) : undefined,
        locale,
        context: buildRequestContext(context, locale),
      },
    })
      .then((response) => {
        if (isAuthenticated && !response.data.authenticated) {
          void refreshAuth();
        }

        const nextSessionId = response.data.session.sessionId;
        setSessionId(nextSessionId);
        setAssistantAuthenticated(response.data.authenticated);
        setCapabilities(response.data.capabilities);
        setEnabled(response.data.capabilities.enabled);
        setProposals([]);
        setPendingConfirmation(null);
        setActionResult(null);
        setQuota(response.data.quota ?? response.data.capabilities.quota ?? null);
        setUpgradeCta(response.data.upgradeCta ?? response.data.capabilities.upgradeCta ?? null);
        setUsageNote(null);
        if (response.data.authenticated) {
          setAuthRecoveryNeeded(false);
        }

        if (response.data.session.messages.length > 0) {
          setMessages(trimMessages(response.data.session.messages));
        } else if (!savedRaw || !sameIdentity) {
          setMessages([{
            id: 'hello',
            role: 'assistant',
            content: response.data.authenticated ? i18n.greetingUser : i18n.greetingGuest,
            createdAt: new Date().toISOString(),
          }]);
        }

        safeLocalStorageSet(storageKeys.identity, identityKey);
        safeLocalStorageSet(storageKeys.sessionId, nextSessionId);
      })
      .catch((caughtError) => {
        if (caughtError instanceof ApiError && (caughtError.statusCode === 503 || caughtError.statusCode === 404)) {
          setEnabled(false);
          return;
        }
        setError(caughtError instanceof Error ? caughtError.message : i18n.unavailable);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [authLoading, context, i18n.greetingGuest, i18n.greetingUser, identityKey, isAuthenticated, locale, refreshAuth]);

  useEffect(() => {
    safeLocalStorageSet(storageKeys.history, JSON.stringify(trimMessages(messages)));
  }, [messages]);

  useEffect(() => {
    const immediateTask = taskSnapshotFromActionResult(actionResult);
    if (immediateTask) {
      setTrackedTask(immediateTask);
    }
  }, [actionResult]);

  useEffect(() => {
    if (!pendingReplyKind) {
      setShowSlowReply(false);
      return;
    }

    setShowSlowReply(false);
    const timer = window.setTimeout(() => {
      setShowSlowReply(true);
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [pendingReplyKind]);

  useEffect(() => {
    if (!sessionId || !enabled) {
      return;
    }

    requestJson<AssistantSessionResponse>('/api/v1/assistant/session', {
      method: 'POST',
      body: {
        sessionId,
        locale,
        context: buildRequestContext(context, locale),
      },
    })
      .then((response) => {
        setAssistantAuthenticated(response.data.authenticated);
        setCapabilities(response.data.capabilities);
        setQuota(response.data.quota ?? response.data.capabilities.quota ?? null);
        setUpgradeCta(response.data.upgradeCta ?? response.data.capabilities.upgradeCta ?? null);
        if (response.data.authenticated) {
          setAuthRecoveryNeeded(false);
        }
      })
      .catch(() => undefined);
  }, [context, enabled, locale, sessionId]);

  useEffect(() => {
    const selectableModels = capabilities?.models ?? capabilities?.selectableModels ?? [];
    if (selectableModels.length === 0) {
      setSelectedModelId(null);
      safeLocalStorageRemove(storageKeys.modelSelection);
      return;
    }

    setSelectedModelId((previous) => {
      if (previous && selectableModels.some((entry) => entry.id === previous)) {
        return previous;
      }

      const saved = safeLocalStorageGet(storageKeys.modelSelection);
      if (saved && selectableModels.some((entry) => entry.id === saved)) {
        return saved;
      }

      return capabilities?.defaultModelId ?? selectableModels[0]?.id ?? null;
    });
  }, [capabilities]);

  useEffect(() => {
    if (selectedModelId) {
      safeLocalStorageSet(storageKeys.modelSelection, selectedModelId);
    }
  }, [selectedModelId]);

  useEffect(() => {
    safeLocalStorageSet(storageKeys.routingMode, autoRoute ? 'auto' : 'manual');
  }, [autoRoute]);

  useEffect(() => {
    if (!open || !fullscreen) {
      return;
    }

    setDragState(null);

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [fullscreen, open]);

  useEffect(() => {
    if (!open || fullscreen || !dragState) {
      return;
    }

    const margin = 12;
    const clampPosition = (x: number, y: number) => ({
      x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - dragState.width - margin)),
      y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - dragState.height - margin)),
    });

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      const next = clampPosition(
        event.clientX - dragState.offsetX,
        event.clientY - dragState.offsetY,
      );
      setPanelPosition(next);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }
      setDragState(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragState, fullscreen, open]);

  useEffect(() => {
    if (!open || fullscreen || !panelPosition) {
      return;
    }

    const onResize = () => {
      const rect = panelRef.current?.getBoundingClientRect();
      const width = rect?.width ?? 410;
      const height = rect?.height ?? 760;
      const margin = 12;
      setPanelPosition((current) => {
        if (!current) {
          return current;
        }

        return {
          x: Math.min(Math.max(margin, current.x), Math.max(margin, window.innerWidth - width - margin)),
          y: Math.min(Math.max(margin, current.y), Math.max(margin, window.innerHeight - height - margin)),
        };
      });
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fullscreen, open, panelPosition]);

  useEffect(() => {
    if (!open) {
      setFullscreen(false);
      setShowSettings(false);
      setDragState(null);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (fullscreen) {
        setFullscreen(false);
        return;
      }

      setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: messages.length > 0 ? 'smooth' : 'auto',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, open, pendingConfirmation, pendingReplyKind, proposals.length]);

  const latestTaskId = useMemo(() => {
    const directTask = taskSnapshotFromActionResult(actionResult)?.taskId ?? null;
    return directTask ?? parseLatestTaskIdFromMessages(messages);
  }, [actionResult, messages]);

  useEffect(() => {
    if (!latestTaskId) {
      setTrackedTask(null);
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const fetchTask = async () => {
      try {
        const response = await requestJson<AssistantOperatorTaskResponse>(`/api/v1/operator/tasks/${encodeURIComponent(latestTaskId)}`);
        if (cancelled) {
          return;
        }

        const nextTask = normalizeTaskResponseSnapshot(response.data);
        setTrackedTask(nextTask);

        if (isTaskRunning(nextTask.status)) {
          timer = window.setTimeout(() => {
            void fetchTask();
          }, 2500);
        }
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        if (caughtError instanceof ApiError && caughtError.statusCode === 404) {
          setTrackedTask({
            taskId: latestTaskId,
            title: latestTaskId,
            status: 'missing',
            progress: 0,
            summary: locale.toLowerCase().startsWith('zh')
              ? '没有找到这个任务记录，可能已经被服务重启打断。'
              : 'This task record was not found. It may have been interrupted by a service restart.',
            detail: locale.toLowerCase().startsWith('zh')
              ? '如果你想继续，请重新发起一次真实生成任务。'
              : 'Start a new real build task if you want to continue.',
            error: null,
            previewUrl: null,
            capsulePath: null,
            capsuleUrl: null,
            updatedAt: null,
            completedAt: null,
            steps: [],
          });
        }
      }
    };

    void fetchTask();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [latestTaskId, locale]);

  const selectableModels = capabilities?.models ?? capabilities?.selectableModels ?? [];
  const activeManualModel = selectableModels.find((option) => option.id === selectedModelId)
    ?? selectableModels.find((option) => option.id === capabilities?.defaultModelId)
    ?? selectableModels[0]
    ?? null;

  function handleHeaderPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (fullscreen) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, label')) {
      return;
    }

    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setPanelPosition({
      x: rect.left,
      y: rect.top,
    });
    setDragState({
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    });
  }

  async function addAttachmentFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const nextEntries = Array.from(fileList).slice(0, assistantMaxAttachmentCount);
    const parsed: ComposerAttachment[] = [];

    for (const file of nextEntries) {
      const mimeType = file.type || 'application/octet-stream';
      const name = file.name || 'attachment';
      const sizeBytes = file.size || 0;

      if (file.type.startsWith('image/')) {
        if (sizeBytes > assistantMaxImageAttachmentBytes) {
          setError(`${i18n.attachmentTooLarge}: ${name}`);
          continue;
        }

        try {
          const dataUrl = await readFileAsDataUrl(file);
          parsed.push({
            id: `att-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            name,
            mimeType,
            sizeBytes,
            textContent: null,
            dataUrl,
          });
        } catch {
          setError(`${i18n.attachmentReadFailed}: ${name}`);
        }
        continue;
      }

      if (isLikelyTextAttachment(file)) {
        if (sizeBytes > assistantMaxTextAttachmentBytes) {
          setError(`${i18n.attachmentTooLarge}: ${name}`);
          continue;
        }
        try {
          const textContent = (await readFileAsText(file)).slice(0, assistantMaxTextContentChars);
          parsed.push({
            id: `att-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            name,
            mimeType,
            sizeBytes,
            textContent,
            dataUrl: null,
          });
        } catch {
          setError(`${i18n.attachmentReadFailed}: ${name}`);
        }
        continue;
      }

      setError(`${i18n.attachmentReadFailed}: ${name}`);
    }

    if (parsed.length === 0) {
      return;
    }

    setAttachments((previous) => {
      const merged = [...previous, ...parsed];
      return merged.slice(0, assistantMaxAttachmentCount);
    });
  }

  function removeAttachment(attachmentId: string) {
    setAttachments((previous) => previous.filter((entry) => entry.id !== attachmentId));
  }

  async function sendMessage(
    content: string,
    requestedAction?: AssistantActionProposal['action'],
  ) {
    if (!sessionId || !enabled) {
      return;
    }

    const normalized = content.trim();
    const outgoingAttachments = attachments;
    const directExecutionAttempt = looksLikeDirectExecutionIntent(normalized, outgoingAttachments, requestedAction);
    if (!normalized && !requestedAction && outgoingAttachments.length === 0) {
      return;
    }

    const attachmentNote = outgoingAttachments.length > 0
      ? `${i18n.attachments}: ${outgoingAttachments.map((attachment) => attachment.name).join(', ')}`
      : null;
    const userDisplayContent = [normalized, attachmentNote].filter((entry): entry is string => Boolean(entry)).join('\n\n');

    setLoading(true);
    setError(null);
    setActionResult(null);
    setPendingReplyKind(requestedAction ? 'action' : 'reply');
    setShowSettings(false);
    if (directExecutionAttempt && normalized) {
      lastDirectExecutionMessageRef.current = normalized;
    }
    if (userDisplayContent) {
      setMessages((previous) => trimMessages([
        ...previous,
        {
          id: `u-${Date.now()}`,
          role: 'user',
          content: userDisplayContent,
          createdAt: new Date().toISOString(),
        },
      ]));
    }
    setInput('');
    setAttachments([]);

    try {
      let activeSessionId = sessionId;
      const requestBody = {
        message: normalized || (requestedAction ? requestedAction.kind : '.'),
        selectedModelId: autoRoute ? undefined : (selectedModelId ?? undefined),
        autoRoute,
        locale,
        context: buildRequestContext(context, locale),
        attachments: outgoingAttachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          textContent: attachment.textContent,
          dataUrl: attachment.dataUrl,
        })),
        requestedAction: requestedAction ? {
          ...requestedAction,
          execute: true,
        } : undefined,
      };

      let response: AssistantMessagesResponse;
      try {
        response = await requestJson<AssistantMessagesResponse>('/api/v1/assistant/messages', {
          method: 'POST',
          body: {
            sessionId: activeSessionId,
            ...requestBody,
          },
        });
      } catch (caughtError) {
        if (!(caughtError instanceof ApiError) || (caughtError.statusCode !== 403 && caughtError.statusCode !== 404)) {
          throw caughtError;
        }

        clearPersistedAssistantSession();
        const sessionResponse = await requestJson<AssistantSessionResponse>('/api/v1/assistant/session', {
          method: 'POST',
          body: {
            locale,
            context: buildRequestContext(context, locale),
          },
        });
        activeSessionId = sessionResponse.data.session.sessionId;
        setSessionId(activeSessionId);
        setAssistantAuthenticated(sessionResponse.data.authenticated);
        setCapabilities(sessionResponse.data.capabilities);
        setQuota(sessionResponse.data.quota ?? sessionResponse.data.capabilities.quota ?? null);
        setUpgradeCta(sessionResponse.data.upgradeCta ?? sessionResponse.data.capabilities.upgradeCta ?? null);
        safeLocalStorageSet(storageKeys.identity, identityKey);
        safeLocalStorageSet(storageKeys.sessionId, activeSessionId);

        response = await requestJson<AssistantMessagesResponse>('/api/v1/assistant/messages', {
          method: 'POST',
          body: {
            sessionId: activeSessionId,
            ...requestBody,
          },
        });
      }

      setAssistantAuthenticated(response.data.authenticated);
      if (response.data.authenticated) {
        setAuthRecoveryNeeded(false);
      } else if (context.serviceId && directExecutionAttempt) {
        setAuthRecoveryNeeded(true);
      }
      setMessages((previous) => trimMessages([...previous, response.data.reply]));
      setProposals(response.data.proposals ?? []);
      setPendingConfirmation(response.data.pendingConfirmation ?? null);
      setQuota(response.data.quota ?? null);
      setUpgradeCta(response.data.upgradeCta ?? null);
      setUsageNote(buildUsageNote(locale, i18n, response.data.resolvedModelId, response.data.chargedTokens));
      setActionResult(response.data.actionResult ?? null);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        const payload = readAssistantErrorPayload(caughtError);
        if (payload?.quota) {
          setQuota(payload.quota);
        }
        if (payload?.upgradeCta) {
          setUpgradeCta(payload.upgradeCta);
        }
        setUsageNote(null);
        setError(payload?.detail ?? caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : i18n.unavailable);
      }
    } finally {
      setPendingReplyKind(null);
      setLoading(false);
    }
  }

  async function confirmAction() {
    if (!sessionId || !pendingConfirmation) {
      return;
    }

    setLoading(true);
    setError(null);
    setPendingReplyKind('confirm');
    try {
      const response = await requestJson<AssistantConfirmResponse>('/api/v1/assistant/actions/confirm', {
        method: 'POST',
        body: {
          sessionId,
          confirmToken: pendingConfirmation.token,
          locale,
        },
      });

      setAssistantAuthenticated(response.data.authenticated);
      if (response.data.authenticated) {
        setAuthRecoveryNeeded(false);
      }
      setMessages((previous) => trimMessages([...previous, response.data.reply]));
      setPendingConfirmation(null);
      setProposals([]);
      setQuota(response.data.quota ?? null);
      setUpgradeCta(response.data.upgradeCta ?? null);
      setUsageNote(null);
      setActionResult(response.data.actionResult ?? null);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        const payload = readAssistantErrorPayload(caughtError);
        if (payload?.quota) {
          setQuota(payload.quota);
        }
        if (payload?.upgradeCta) {
          setUpgradeCta(payload.upgradeCta);
        }
        setError(payload?.detail ?? caughtError.message);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : i18n.unavailable);
      }
    } finally {
      setPendingReplyKind(null);
      setLoading(false);
    }
  }

  const quotaPercent = quotaRemainingPercent(quota);
  const remainingTokens = quotaRemainingTokens(quota);
  const dailyTokens = quotaDailyTokens(quota);
  const usedTokens = quotaUsedTokens(quota);
  const sessionMismatch = isAuthenticated && assistantAuthenticated === false;
  const quotaPrimaryValue = !quota
    ? '-'
    : quota.unlimited
      ? i18n.quotaUnlimited
      : `${formatTokenCount(remainingTokens, locale, true)} ${i18n.pointsUnit}`;
  const quotaSecondaryValue = !quota
    ? '-'
    : quota.unlimited
      ? i18n.quotaHintUnlimited
      : `${i18n.quotaUsed}: ${formatTokenCount(usedTokens, locale)} · ${i18n.quotaRemaining}: ${formatTokenCount(remainingTokens, locale)} / ${formatTokenCount(dailyTokens, locale)} ${i18n.pointsUnit}`;
  const routingSummary = autoRoute
    ? i18n.autoRoute
    : activeManualModel
      ? activeManualModel.label
      : i18n.manualRoute;
  const actionLinks = actionResultLinks(actionResult);
  const remoteExecTrace = useMemo(() => parseRemoteExecTrace(actionResult), [actionResult]);
  const showTaskDetailInResult = Boolean(actionResult?.detail) && !trackedTask;
  const rootStyle = open && !fullscreen && panelPosition
    ? {
      left: `${panelPosition.x}px`,
      top: `${panelPosition.y}px`,
      right: 'auto',
      bottom: 'auto',
    } as const
    : undefined;
  const showAuthRecoveryCard = Boolean(context.serviceId) && authRecoveryNeeded && !pendingReplyKind;

  async function handleRecoverExecution() {
    if (!context.serviceId || recoveringExecution) {
      return;
    }

    setRecoveringExecution(true);
    setError(null);

    try {
      await refreshAuth();
      const sessionResponse = await requestJson<AssistantSessionResponse>('/api/v1/assistant/session', {
        method: 'POST',
        body: {
          sessionId: sessionId ?? undefined,
          locale,
          context: buildRequestContext(context, locale),
        },
      });

      const nextSessionId = sessionResponse.data.session.sessionId;
      setSessionId(nextSessionId);
      setAssistantAuthenticated(sessionResponse.data.authenticated);
      setCapabilities(sessionResponse.data.capabilities);
      setQuota(sessionResponse.data.quota ?? sessionResponse.data.capabilities.quota ?? null);
      setUpgradeCta(sessionResponse.data.upgradeCta ?? sessionResponse.data.capabilities.upgradeCta ?? null);
      safeLocalStorageSet(
        storageKeys.identity,
        buildAssistantIdentityKey(sessionResponse.data.authenticated, sessionResponse.data.user?.id),
      );
      safeLocalStorageSet(storageKeys.sessionId, nextSessionId);

      if (!sessionResponse.data.authenticated) {
        navigate(`/login?next=${encodeURIComponent(nextPath || '/catalog')}`);
        return;
      }

      setAuthRecoveryNeeded(false);
      if (!input.trim() && lastDirectExecutionMessageRef.current) {
        setInput(lastDirectExecutionMessageRef.current);
      }
      setMessages((previous) => trimMessages([
        ...previous,
        {
          id: `assistant-auth-recovered-${Date.now()}`,
          role: 'assistant',
          content: i18n.authRecoveryRecovered,
          createdAt: new Date().toISOString(),
        },
      ]));
    } catch {
      navigate(`/login?next=${encodeURIComponent(nextPath || '/catalog')}`);
    } finally {
      setRecoveringExecution(false);
    }
  }

  function closeAssistant() {
    setOpen(false);
    setFullscreen(false);
    setShowSettings(false);
  }

  if (!enabled) {
    return null;
  }

  return (
    <div className={`assistant-root ${open ? 'open' : ''} ${fullscreen ? 'assistant-root--fullscreen' : ''}`} style={rootStyle}>
      {open && fullscreen ? (
        <button
          aria-hidden="true"
          className="assistant-backdrop"
          onClick={() => setFullscreen(false)}
          tabIndex={-1}
          type="button"
        />
      ) : null}

      {open ? (
        <section className={`assistant-panel ${fullscreen ? 'assistant-panel--fullscreen' : ''}`} aria-label={i18n.title} ref={panelRef}>
          <header
            className={`assistant-header ${fullscreen ? '' : 'assistant-header--draggable'} ${dragState ? 'dragging' : ''}`}
            onPointerDown={handleHeaderPointerDown}
          >
            <div className="assistant-header__copy">
              <strong>{i18n.title}</strong>
              <p>{i18n.subtitle}</p>
            </div>
            <div className="assistant-header__actions">
              <button
                aria-label={fullscreen ? i18n.windowed : i18n.fullscreen}
                className="assistant-header__button"
                onClick={() => setFullscreen((current) => !current)}
                type="button"
              >
                <span aria-hidden="true">{fullscreen ? '▣' : '□'}</span>
                <span>{fullscreen ? i18n.windowed : i18n.fullscreen}</span>
              </button>
              <button
                className="assistant-close"
                onClick={closeAssistant}
                aria-label={i18n.close}
                type="button"
              >
                <span aria-hidden="true">×</span>
                <span>{i18n.close}</span>
              </button>
            </div>
          </header>

          <div className="assistant-status">
            <div className="assistant-status__top">
              <div className="assistant-status__summary assistant-status__summary--compact">
                <small>{i18n.quotaTitle}</small>
                <strong>{quotaPrimaryValue}</strong>
                <span>{quotaSecondaryValue}</span>
              </div>
              <div className="assistant-status__actions">
                <span className="assistant-status__badge">{quotaTierLabel(quota, i18n)}</span>
                {upgradeCta ? (
                  <a
                    className="assistant-status__link"
                    href={upgradeCta.href}
                    title={upgradeCta.label}
                  >
                    {i18n.upgradeQuota}
                  </a>
                ) : null}
                {selectableModels.length > 0 ? (
                  <button
                    className="assistant-status__toggle"
                    onClick={() => setShowSettings((current) => !current)}
                    type="button"
                  >
                    {showSettings ? i18n.hideSettings : i18n.settings}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="assistant-status__meter" aria-hidden="true">
              <span style={{ width: `${quotaPercent}%` }} />
            </div>
            <div className="assistant-status__details">
              <span>{routingSummary}</span>
              <span>{i18n.quotaReset}: {formatQuotaReset(quota?.resetAt, locale)}</span>
              {usageNote ? <span className="assistant-status__usage">{usageNote}</span> : null}
            </div>
          </div>

          {selectableModels.length > 0 && showSettings ? (
            <div className="assistant-controls">
              <div className="assistant-mode-switch" role="tablist" aria-label={i18n.model}>
                <button
                  className={`assistant-mode-button ${autoRoute ? 'active' : ''}`}
                  onClick={() => setAutoRoute(true)}
                  type="button"
                >
                  {i18n.autoRoute}
                </button>
                <button
                  className={`assistant-mode-button ${!autoRoute ? 'active' : ''}`}
                  onClick={() => setAutoRoute(false)}
                  type="button"
                >
                  {i18n.manualRoute}
                </button>
              </div>
              {!autoRoute ? (
                <label className="assistant-model-picker">
                  <span>{i18n.model}</span>
                  <select
                    disabled={loading}
                    onChange={(event) => setSelectedModelId(event.target.value)}
                    value={selectedModelId ?? capabilities?.defaultModelId ?? selectableModels[0]?.id ?? ''}
                  >
                    {selectableModels.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <small className="assistant-route-hint">
                {autoRoute
                  ? (usageNote ?? i18n.autoRouteHint)
                  : activeManualModel
                    ? activeManualModel.label
                    : i18n.manualRouteHint}
              </small>
              <div className="assistant-context">
                <span>{quotaTierHint(quota, i18n)}</span>
                {context.serviceId ? <span>{i18n.contextService}: #{context.serviceId}</span> : null}
                {context.invoiceId ? <span>{i18n.contextInvoice}: #{context.invoiceId}</span> : null}
                {capabilities?.responseMode === 'fallback' ? <span>{i18n.fallbackMode}</span> : null}
              </div>
            </div>
          ) : null}

          <div className="assistant-messages" ref={messagesViewportRef}>
            {messages.length === 0 ? (
              <p className="assistant-empty">{i18n.empty}</p>
            ) : (
              messages.map((message) => (
                <article
                  className={`assistant-message ${message.role === 'user' ? 'user' : 'assistant'}`}
                  key={message.id}
                >
                  {renderMessageContent(message.content, i18n)}
                </article>
              ))
            )}

            {pendingReplyKind ? (
              <article className="assistant-message assistant-message--pending">
                <div className="assistant-typing" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <p>
                  {pendingReplyKind === 'confirm'
                    ? i18n.confirmingWork
                    : pendingReplyKind === 'action'
                      ? i18n.working
                      : i18n.thinking}
                </p>
                {showSlowReply ? <small>{i18n.slowReply}</small> : null}
              </article>
            ) : null}
          </div>

          {showAuthRecoveryCard || pendingConfirmation || (!pendingReplyKind && proposals.length > 0) || actionResult || trackedTask || remoteExecTrace.length > 0 || error ? (
            <div className="assistant-footer-stack">
              {showAuthRecoveryCard ? (
                <div className="assistant-recovery">
                  <strong>{i18n.authRecoveryTitle}</strong>
                  <p>{sessionMismatch ? i18n.authRecoveryHintMember : i18n.authRecoveryHintGuest}</p>
                  <div className="assistant-confirm-actions">
                    <button
                      className="button primary"
                      disabled={loading || recoveringExecution}
                      onClick={() => void handleRecoverExecution()}
                      type="button"
                    >
                      {recoveringExecution
                        ? i18n.working
                        : (sessionMismatch ? i18n.authRecoveryActionMember : i18n.authRecoveryActionGuest)}
                    </button>
                  </div>
                </div>
              ) : null}

              {pendingConfirmation ? (
                <div className="assistant-confirm">
                  <strong>{pendingConfirmation.proposal.risk === 'high' ? i18n.highRisk : i18n.confirmationRequired}</strong>
                  <p>{pendingConfirmation.proposal.title}</p>
                  <p className="muted">{pendingConfirmation.proposal.description}</p>
                  <div className="assistant-confirm-actions">
                    <button className="button primary" disabled={loading} onClick={() => void confirmAction()} type="button">
                      {i18n.confirm}
                    </button>
                    <button className="button ghost" disabled={loading} onClick={() => setPendingConfirmation(null)} type="button">
                      {i18n.dismiss}
                    </button>
                  </div>
                </div>
              ) : null}

              {!pendingReplyKind && proposals.length > 0 ? (
                <div className="assistant-proposals">
                  {proposals.slice(0, 4).map((proposal) => (
                    <button
                      className="assistant-proposal"
                      key={proposal.id}
                      onClick={() => void sendMessage(proposal.title, proposal.action)}
                      type="button"
                    >
                      <strong>{proposal.title}</strong>
                      <span>{proposal.description}</span>
                      <em>{actionFooterLabel(proposal, i18n)}</em>
                    </button>
                  ))}
                </div>
              ) : null}

              {actionResult ? (
                <div className="assistant-result">
                  <strong>{i18n.actionResult}</strong>
                  <p>{actionResult.message}</p>
                  {showTaskDetailInResult && actionResult.detail ? <p className="muted">{actionResult.detail}</p> : null}
                  {actionLinks.capsulePath || actionLinks.capsuleUrl || actionLinks.previewUrl || actionLinks.servicePath || actionLinks.panelUrl ? (
                    <div className="assistant-confirm-actions">
                      {actionLinks.capsulePath ? (
                        <a className="button primary" href={actionLinks.capsulePath}>
                          {i18n.viewCapsule}
                        </a>
                      ) : actionLinks.capsuleUrl ? (
                        <a className="button primary" href={actionLinks.capsuleUrl} rel="noreferrer" target="_blank">
                          {i18n.viewCapsule}
                        </a>
                      ) : null}
                      {actionLinks.previewUrl ? (
                        <a className="button secondary" href={actionLinks.previewUrl} rel="noreferrer" target="_blank">
                          {i18n.viewPreview}
                        </a>
                      ) : null}
                      {actionLinks.servicePath ? (
                        <a className="button secondary" href={actionLinks.servicePath}>
                          {i18n.viewService}
                        </a>
                      ) : null}
                      {actionLinks.panelUrl ? (
                        <a className="button secondary" href={actionLinks.panelUrl} rel="noreferrer" target="_blank">
                          {i18n.openPanel}
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {trackedTask ? (
                <div className="assistant-task-card">
                  <div className="assistant-task-card__head">
                    <div>
                      <strong>{locale.toLowerCase().startsWith('zh') ? '真实任务追踪' : 'Live task tracking'}</strong>
                      <p>{trackedTask.title}</p>
                    </div>
                    <span className={`assistant-task-card__badge assistant-task-card__badge--${trackedTask.status}`}>
                      {taskStageLabel(trackedTask.status, locale)}
                    </span>
                  </div>
                  <div className="assistant-task-card__meter" aria-hidden="true">
                    <span style={{ width: `${trackedTask.progress}%` }} />
                  </div>
                  <div className="assistant-task-card__meta">
                    <span>{locale.toLowerCase().startsWith('zh') ? '任务编号' : 'Task'}: {trackedTask.taskId}</span>
                    <span>{locale.toLowerCase().startsWith('zh') ? '进度' : 'Progress'}: {trackedTask.progress}%</span>
                    <span>{locale.toLowerCase().startsWith('zh') ? '最近更新' : 'Updated'}: {formatTaskTime(trackedTask.updatedAt, locale)}</span>
                  </div>
                  <p className="assistant-task-card__summary">{trackedTask.summary}</p>
                  {trackedTask.detail ? <p className="assistant-task-card__detail">{trackedTask.detail}</p> : null}
                  {trackedTask.error ? <p className="assistant-task-card__error">{trackedTask.error}</p> : null}
                  {trackedTask.steps.length > 0 ? (
                    <div className="assistant-task-card__steps">
                      {trackedTask.steps.map((step) => (
                        <div className="assistant-task-card__step" key={step.id}>
                          <div className="assistant-task-card__step-head">
                            <strong>{step.title}</strong>
                            <span>{taskStepLabel(step.status, locale)}</span>
                          </div>
                          {step.detail ? <p>{step.detail}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {trackedTask.capsulePath || trackedTask.capsuleUrl || trackedTask.previewUrl ? (
                    <div className="assistant-confirm-actions">
                      {trackedTask.capsulePath ? (
                        <a className="button primary" href={trackedTask.capsulePath}>
                          {i18n.viewCapsule}
                        </a>
                      ) : trackedTask.capsuleUrl ? (
                        <a className="button primary" href={trackedTask.capsuleUrl} rel="noreferrer" target="_blank">
                          {i18n.viewCapsule}
                        </a>
                      ) : null}
                      {trackedTask.previewUrl ? (
                        <a className="button secondary" href={trackedTask.previewUrl} rel="noreferrer" target="_blank">
                          {i18n.viewPreview}
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {remoteExecTrace.length > 0 ? (
                <div className="assistant-trace-card">
                  <div className="assistant-trace-card__head">
                    <strong>{locale.toLowerCase().startsWith('zh') ? '服务器执行步骤' : 'Server execution trace'}</strong>
                    <span>{remoteExecTrace.length} {locale.toLowerCase().startsWith('zh') ? '步' : 'steps'}</span>
                  </div>
                  <div className="assistant-trace-card__steps">
                    {remoteExecTrace.map((step) => (
                      <div className="assistant-trace-card__step" key={step.id}>
                        <div className="assistant-trace-card__step-head">
                          <strong>{step.label}</strong>
                          <span>{execStepLabel(step.status, locale)}</span>
                        </div>
                        <div className="assistant-trace-card__meta">
                          {step.exitCode !== null ? <span>exit {step.exitCode}</span> : null}
                          {step.signal ? <span>{step.signal}</span> : null}
                          {formatStepDuration(step.durationMs, locale) ? <span>{formatStepDuration(step.durationMs, locale)}</span> : null}
                        </div>
                        {step.stdout ? (
                          <details>
                            <summary>{locale.toLowerCase().startsWith('zh') ? '标准输出' : 'stdout'}</summary>
                            <AssistantCodeBlock code={step.stdout} i18n={i18n} language="text" />
                          </details>
                        ) : null}
                        {step.stderr ? (
                          <details>
                            <summary>{locale.toLowerCase().startsWith('zh') ? '错误输出' : 'stderr'}</summary>
                            <AssistantCodeBlock code={step.stderr} i18n={i18n} language="text" />
                          </details>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {error ? <div className="assistant-error">{error}</div> : null}
            </div>
          ) : null}

          <form
            className="assistant-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(input);
            }}
          >
            <input
              accept="image/*,.txt,.md,.json,.yaml,.yml,.toml,.ini,.conf,.env,.log,.sh,.js,.ts,.tsx,.jsx,.py,.php,.java,.go,.rs,.sql,.xml,.html,.css"
              className="assistant-attachment-input"
              multiple
              onChange={(event) => {
                void addAttachmentFiles(event.target.files);
                event.currentTarget.value = '';
              }}
              ref={attachmentInputRef}
              type="file"
            />
            {attachments.length > 0 ? (
              <div className="assistant-attachments">
                {attachments.map((attachment) => (
                  <span className="assistant-attachment-chip" key={attachment.id}>
                    <strong>{attachment.name}</strong>
                    <button
                      aria-label={i18n.removeAttachment}
                      onClick={() => removeAttachment(attachment.id)}
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="assistant-composer__row">
              <button
                className="button secondary assistant-attach-button"
                disabled={loading}
                onClick={() => attachmentInputRef.current?.click()}
                type="button"
              >
                {i18n.attachFile}
              </button>
              <input
                disabled={loading}
                onChange={(event) => setInput(event.target.value)}
                placeholder={i18n.placeholder}
                value={input}
              />
              <button className="button primary" disabled={loading || (input.trim() === '' && attachments.length === 0)} type="submit">
                {loading ? i18n.sending : i18n.send}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {!open ? (
        <button
          aria-label={i18n.open}
          className="assistant-toggle"
          onClick={() => setOpen(true)}
          type="button"
        >
          <span className="assistant-toggle__mark notranslate" aria-hidden="true" lang="en" translate="no">
            <span className="assistant-toggle__mark-inner" translate="no">AI</span>
          </span>
          <span className="assistant-toggle__copy">
            <strong>{i18n.launcherTitle}</strong>
            <small>{i18n.launcherSubtitle}</small>
          </span>
        </button>
      ) : null}
    </div>
  );
}
