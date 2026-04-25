export type OperatorCredentialReadinessStatus =
  | 'missing_credentials'
  | 'auth_failed'
  | 'host_unreachable'
  | 'host_key_untrusted'
  | 'ready';

export type OperatorCredentialReadinessSource = 'preflight' | 'system' | 'mock';

export interface OperatorCredentialReadiness {
  status: OperatorCredentialReadinessStatus;
  headline: string;
  detail: string;
  nextAction: string;
  checkedAt: string | null;
  source: OperatorCredentialReadinessSource;
}

export function isCredentialReadinessBlocked(status: OperatorCredentialReadinessStatus) {
  return status !== 'ready';
}

export function mapRemoteErrorToCredentialReadinessStatus(message: string): OperatorCredentialReadinessStatus {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return 'auth_failed';
  }

  if (
    normalized.includes('no ssh credentials')
    || normalized.includes('connector_credentials_missing')
    || normalized.includes('missing ssh')
    || normalized.includes('missing credential')
    || normalized.includes('当前运行时里没有可用的 ssh 凭据')
  ) {
    return 'missing_credentials';
  }

  if (
    normalized.includes('all configured authentication methods failed')
    || normalized.includes('permission denied')
    || normalized.includes('authentication failed')
    || normalized.includes('unable to authenticate')
  ) {
    return 'auth_failed';
  }

  if (
    normalized.includes('host key verification failed')
    || normalized.includes('host fingerprint')
    || normalized.includes('unknown host key')
    || normalized.includes('host key is not trusted')
  ) {
    return 'host_key_untrusted';
  }

  if (
    normalized.includes('timed out')
    || normalized.includes('etimedout')
    || normalized.includes('enotfound')
    || normalized.includes('ehostunreach')
    || normalized.includes('econnrefused')
    || normalized.includes('no route to host')
    || normalized.includes('network is unreachable')
    || normalized.includes('failed to connect')
    || normalized.includes('getaddrinfo')
  ) {
    return 'host_unreachable';
  }

  return 'auth_failed';
}

export function buildCredentialReadinessSummary(input: {
  status: OperatorCredentialReadinessStatus;
  zh: boolean;
  detail?: string | null;
  hostLabel?: string | null;
  checkedAt?: string | null;
  source?: OperatorCredentialReadinessSource;
}): OperatorCredentialReadiness {
  const status = input.status;
  const zh = input.zh;
  const detail = (input.detail ?? '').trim();
  const host = (input.hostLabel ?? '').trim();
  const checkedAt = (input.checkedAt ?? '').trim() || null;

  if (status === 'ready') {
    return {
      status,
      headline: zh ? 'SSH 凭据已就绪' : 'SSH credentials are ready',
      detail: detail || (host
        ? (zh ? `已通过预检：${host}` : `Preflight passed: ${host}`)
        : (zh ? '已通过 SSH 预检，可以进入部署阶段。' : 'SSH preflight passed and deployment can continue.')),
      nextAction: zh ? '可继续部署到服务器 #19。' : 'You can continue deploying to server #19.',
      checkedAt,
      source: input.source ?? 'preflight',
    };
  }

  if (status === 'missing_credentials') {
    return {
      status,
      headline: zh ? '缺少 SSH 凭据' : 'SSH credentials are missing',
      detail: detail || (zh
        ? '当前运行时没有可用的 SSH 凭据，无法进入生产部署。'
        : 'No usable SSH credentials are available in the current runtime, so production deployment is blocked.'),
      nextAction: zh
        ? '先在服务器体检里补充可用凭据（密码、SSH key 或 agent），再重试预检。'
        : 'Provide credentials from server audit first (password, SSH key, or agent), then retry preflight.',
      checkedAt,
      source: input.source ?? 'preflight',
    };
  }

  if (status === 'auth_failed') {
    return {
      status,
      headline: zh ? 'SSH 认证失败' : 'SSH authentication failed',
      detail: detail || (host
        ? (zh ? `无法通过凭据登录 ${host}` : `Unable to authenticate on ${host}`)
        : (zh ? 'SSH 认证失败，无法执行部署。' : 'SSH authentication failed and deployment cannot proceed.')),
      nextAction: zh
        ? '检查用户名、密钥或密码是否正确，并重新执行服务器体检。'
        : 'Verify username/password/key and re-run server audit.',
      checkedAt,
      source: input.source ?? 'preflight',
    };
  }

  if (status === 'host_key_untrusted') {
    return {
      status,
      headline: zh ? '主机指纹未信任' : 'Host key is not trusted',
      detail: detail || (host
        ? (zh ? `${host} 的主机指纹校验失败。` : `Host key verification failed for ${host}.`)
        : (zh ? '主机指纹校验失败。' : 'Host key verification failed.')),
      nextAction: zh
        ? '先确认并信任目标主机指纹，再重新体检。'
        : 'Trust the host fingerprint first, then run preflight again.',
      checkedAt,
      source: input.source ?? 'preflight',
    };
  }

  return {
    status,
    headline: zh ? '主机不可达' : 'Host is unreachable',
    detail: detail || (host
      ? (zh ? `无法连接到 ${host}` : `Unable to reach ${host}`)
      : (zh ? '无法连接到目标主机。' : 'Unable to reach the target host.')),
    nextAction: zh
      ? '检查主机地址、端口、安全组或网络连通性，再重试。'
      : 'Check host, port, firewall/security group, and network reachability, then retry.',
    checkedAt,
    source: input.source ?? 'preflight',
  };
}

export function createMissingCredentialReadiness(zh: boolean) {
  return buildCredentialReadinessSummary({
    status: 'missing_credentials',
    zh,
    checkedAt: null,
    source: 'preflight',
  });
}
