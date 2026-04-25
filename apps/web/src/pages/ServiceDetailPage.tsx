import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { CountryFlagIcon } from '../components/FlagIcon';
import { VisualIcon } from '../components/VisualIcon';
import { ApiError, requestJson, useApiData } from '../lib/api';
import { toFriendlyError } from '../lib/friendly-error';
import { localizeText } from '../lib/localized-text';
import { normalizeOperatorApiUrl } from '../lib/operator-url';
import { useSite } from '../lib/site-context';
import {
  getUiText,
  operationActionLabel as uiOperationActionLabel,
  operationOutcomeLabel as uiOperationOutcomeLabel,
  productLineFor,
  productLineLabel,
  runtimeStatusLabel as uiRuntimeStatusLabel,
  serviceStatusLabel as uiServiceStatusLabel,
  statusClassName as uiStatusClassName,
} from '../lib/ui-text';
import { getAppVisual, getCountryMeta, getCountryName, getOsVisual, inferCountryCode } from '../lib/visual-metadata';
import type {
  ActionResponse,
  ProductDetailResponse,
  RuntimeMetricsResponse,
  RuntimeOverviewResponse,
  ServiceAppsInstallResponse,
  ServiceAppsResponse,
  ServiceDetail,
  ServiceOperationLogSummary,
  ServiceOperationLogsResponse,
  ServiceProvisioningResponse,
  ServiceProvisioningRetryResponse,
  ServiceRuntimeResponse,
  ServiceResponse,
  VpsAppMarketplaceResponse,
  VpsMarketplaceApp,
} from '../lib/types';

type ConvoyCapabilities = {
  application: {
    read: boolean;
    console: boolean;
    patch: boolean;
    build: boolean;
    firewall: boolean;
    suspend: boolean;
    unsuspend: boolean;
    destroy: boolean;
  };
  actionBridge: {
    power: boolean;
    reinstall: boolean;
    revealPassword: boolean;
  };
};

type ServiceServerResponse = {
  data: {
    service: ServiceDetail;
    mapping: {
      serverRef: string;
      expectedKeys?: string[];
    };
    capabilities: ConvoyCapabilities;
    convoy: Record<string, unknown>;
  };
};

type ManagedRuntimeLogsResponse = {
  data: {
    serviceId: string;
    runtimeKind: string;
    podName: string | null;
    logs: Array<{ line: string }>;
  };
};

type FirewallRuleDirection = 'in' | 'out';
type FirewallRuleAction = 'ACCEPT' | 'DROP' | 'REJECT';
type FirewallRuleProtocol = 'tcp' | 'udp' | 'icmp' | 'icmpv6';

type ServiceFirewallRule = {
  position: number | null;
  enabled: boolean;
  type: string | null;
  action: string | null;
  protocol: string | null;
  source: string | null;
  destination: string | null;
  destinationPort: string | null;
  sourcePort: string | null;
  interface: string | null;
  comment: string | null;
  logLevel: string | null;
};

type ServiceFirewallResponse = {
  data: {
    mapped: boolean;
    serverRef: string | null;
    capabilities: {
      read: boolean;
      update: boolean;
    };
    options: {
      enabled: boolean;
      ipfilter: boolean;
      policyIn: string | null;
      policyOut: string | null;
      logLevelIn: string | null;
      logLevelOut: string | null;
    };
    rules: ServiceFirewallRule[];
  };
};

type UpgradeConfigSelection = Record<string, string | number>;
type RuntimeContractState = RuntimeOverviewResponse['data']['status'];

type ServiceUpgradeOptionChoice = {
  id: string | number;
  name: string;
};

type ServiceUpgradeOption = {
  id: string | number;
  name: string;
  type: string;
  children: ServiceUpgradeOptionChoice[];
};

type ServiceUpgradeProduct = {
  id: string | number;
  name: string;
  slug: string;
  current: boolean;
  config_options: ServiceUpgradeOption[];
  selected_config: UpgradeConfigSelection;
};

type ServiceUpgradeOptionsResponse = {
  data: {
    service_id: string;
    current_product_id: string;
    current_plan_id: string;
    products: ServiceUpgradeProduct[];
  };
};

type ServerAction = 'start' | 'stop' | 'restart' | 'suspend' | 'unsuspend' | 'destroy' | 'reinstall' | 'reveal-password';
type ConsoleSessionType = 'novnc' | 'xtermjs';
type SupportedLocaleLanguage = 'zh' | 'en' | 'ja' | 'ko';
type LocalizedMessage = {
  zh: string;
  en: string;
  ja?: string;
  ko?: string;
};

type ServiceConsoleResponse = {
  message: string;
  data: {
    type: ConsoleSessionType;
    launchUrl: string;
    host: string | null;
    port: number | null;
  };
};

type OperatorServiceOrigin = {
  capsuleId: string | null;
  capsuleName: string;
  entryKind: string | null;
  entryLabel: string;
  stack: string | null;
  businessPath: string | null;
  businessLabel: string;
  source: string | null;
  planSummary: string | null;
  previewUrl: string | null;
  productionUrl: string | null;
  repoUrl: string | null;
  bundleUrl: string | null;
  manifestUrl: string | null;
};

type CompactOperationLog = {
  id: string;
  actionLabel: string;
  outcomeLabel: string;
  outcomeClassName: string;
  timestampLabel: string;
  operationId: string | null;
  message: string | null;
  detail: string | null;
  code: string | null;
  showCode: boolean;
  success: boolean | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function localeLanguage(locale: string): SupportedLocaleLanguage {
  const language = locale.toLowerCase().split('-')[0];
  if (language === 'zh' || language === 'ja' || language === 'ko') {
    return language;
  }
  return 'en';
}

function localizeMessage(locale: string, message: LocalizedMessage) {
  const language = localeLanguage(locale);
  if (language === 'ja' && message.ja) return message.ja;
  if (language === 'ko' && message.ko) return message.ko;
  if (language === 'zh') return message.zh;
  return message.en;
}

function formatUptimeSeconds(seconds: number | null | undefined, locale: string) {
  if (!Number.isFinite(seconds ?? NaN) || (seconds ?? 0) <= 0) {
    return '-';
  }

  const total = Math.max(0, Math.floor(seconds ?? 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) {
    parts.push(locale.startsWith('zh') ? `${days} 天` : `${days}d`);
  }
  if (hours > 0) {
    parts.push(locale.startsWith('zh') ? `${hours} 小时` : `${hours}h`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(locale.startsWith('zh') ? `${minutes} 分钟` : `${minutes}m`);
  }

  return parts.join(' ');
}

function localizeBackendMessage(rawMessage: string | null | undefined, locale: string) {
  if (!rawMessage || rawMessage.trim() === '') {
    return null;
  }

  const normalized = rawMessage.toLowerCase().trim();
  const mappings: Array<{ pattern: RegExp; message: LocalizedMessage }> = [
    {
      pattern: /cancellation requested/,
      message: {
        zh: '已提交取消请求。',
        en: 'Cancellation requested.',
        ja: '解約リクエストを送信しました。',
        ko: '해지 요청이 접수되었습니다.',
      },
    },
    {
      pattern: /cancellation request recorded/,
      message: {
        zh: '已记录取消请求，系统会继续处理运行实例清理。',
        en: 'Cancellation request recorded. Runtime cleanup will continue.',
        ja: '解約リクエストを記録しました。ランタイムのクリーンアップは継続されます。',
        ko: '해지 요청이 기록되었습니다. 런타임 정리는 계속 처리됩니다.',
      },
    },
    {
      pattern: /cancellation (request )?(removed|revoked)/,
      message: {
        zh: '已撤销取消请求。',
        en: 'Cancellation request removed.',
        ja: '解約リクエストを取り消しました。',
        ko: '해지 요청이 취소되었습니다.',
      },
    },
    {
      pattern: /renewal request submitted/,
      message: {
        zh: '续费请求已提交。',
        en: 'Renewal request submitted.',
        ja: '更新リクエストを送信しました。',
        ko: '갱신 요청이 접수되었습니다.',
      },
    },
    {
      pattern: /(application|managed app) restart (submitted|requested)/,
      message: {
        zh: '应用重启指令已提交。',
        en: 'Application restart submitted.',
        ja: 'アプリ再起動リクエストを送信しました。',
        ko: '애플리케이션 재시작 요청이 제출되었습니다.',
      },
    },
    {
      pattern: /(instance|managed app) deletion submitted/,
      message: {
        zh: '实例删除指令已提交。',
        en: 'Instance deletion submitted.',
        ja: 'インスタンス削除リクエストを送信しました。',
        ko: '인스턴스 삭제 요청이 제출되었습니다.',
      },
    },
    {
      pattern: /environment variables? (updated|submitted)/,
      message: {
        zh: '环境变量已更新。',
        en: 'Environment variables updated.',
        ja: '環境変数を更新しました。',
        ko: '환경 변수를 업데이트했습니다.',
      },
    },
    {
      pattern: /domain (binding )?(submitted|updated|saved)/,
      message: {
        zh: '域名绑定已提交。',
        en: 'Domain binding submitted.',
        ja: 'ドメイン紐付けを送信しました。',
        ko: '도메인 연결 요청이 제출되었습니다.',
      },
    },
    {
      pattern: /https (configuration )?(submitted|updated|enabled)/,
      message: {
        zh: 'HTTPS 配置已提交。',
        en: 'HTTPS configuration submitted.',
        ja: 'HTTPS 設定を送信しました。',
        ko: 'HTTPS 설정이 제출되었습니다.',
      },
    },
    {
      pattern: /scal(e|ing) request submitted/,
      message: {
        zh: '扩容请求已提交。',
        en: 'Scaling request submitted.',
        ja: 'スケールリクエストを送信しました。',
        ko: '스케일 요청이 제출되었습니다.',
      },
    },
    {
      pattern: /server power action submitted/,
      message: {
        zh: '电源指令已提交。',
        en: 'Power action submitted.',
        ja: '電源操作リクエストを送信しました。',
        ko: '전원 작업 요청이 제출되었습니다.',
      },
    },
    {
      pattern: /service label updated/,
      message: {
        zh: '服务标签已更新。',
        en: 'Service label updated.',
        ja: 'サービスラベルを更新しました。',
        ko: '서비스 라벨이 업데이트되었습니다.',
      },
    },
    {
      pattern: /runtime mapping already exists/,
      message: {
        zh: '运行时映射已存在。',
        en: 'Runtime mapping already exists.',
        ja: 'ランタイムマッピングは既に存在します。',
        ko: '런타임 매핑이 이미 존재합니다.',
      },
    },
    {
      pattern: /managed app runtime state reconciled/,
      message: {
        zh: '托管应用运行状态已完成同步。',
        en: 'Managed App runtime state reconciled.',
        ja: 'マネージドアプリのランタイム状態を同期しました。',
        ko: '매니지드 앱 런타임 상태 동기화를 완료했습니다.',
      },
    },
  ];

  for (const entry of mappings) {
    if (entry.pattern.test(normalized)) {
      return localizeMessage(locale, entry.message);
    }
  }

  return rawMessage;
}

function shouldHideOperationCodeOnSuccess(code: string | null | undefined, success: boolean | null | undefined) {
  if (success !== true) {
    return false;
  }

  const normalized = (code ?? '').trim().toUpperCase();
  if (normalized === '') {
    return false;
  }

  return normalized === 'SERVICE_POWER_SUBMITTED' || normalized.endsWith('_SUBMITTED');
}

function localizeCancellationReason(reason: string | null | undefined, locale: string) {
  if (!reason) {
    return '';
  }

  const normalized = reason.trim().toLowerCase();
  if (
    normalized === 'requested by customer.'
    || normalized === 'requested by customer'
    || normalized === 'customer requested cancellation'
  ) {
    return localizeMessage(locale, {
      zh: '客户主动取消',
      en: 'Requested by customer.',
      ja: '顧客からの解約依頼',
      ko: '고객 요청으로 취소',
    });
  }

  return reason;
}

function localizeCancellationType(type: string | null | undefined, locale: string, ui: ReturnType<typeof getUiText>) {
  const normalized = (type ?? '').trim().toLowerCase();
  if (normalized === 'immediate') {
    return ui.services.cancelImmediate;
  }
  if (normalized === 'end_of_period') {
    return ui.services.cancelEndPeriod;
  }
  if (normalized === '') {
    return ui.common.unknown;
  }

  return type ?? ui.common.unknown;
}

function readPath(value: unknown, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = value;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function pickString(value: unknown, paths: string[]) {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }

  return null;
}

function normalizeIpAddressCandidate(candidate: unknown): string | null {
  if (typeof candidate === 'string') {
    const normalized = candidate.trim();
    return normalized === '' ? null : normalized;
  }

  if (typeof candidate === 'object' && candidate !== null) {
    const ip = pickString(candidate, ['address', 'ip']);
    return ip ?? null;
  }

  return null;
}

function parseIpListFromText(value: string | null | undefined): string[] {
  const normalized = (value ?? '').trim();
  if (normalized === '') {
    return [];
  }

  return [...new Set(
    normalized
      .split(/[,\n; ]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  )];
}

function collectConvoyAddresses(payload: unknown): string[] {
  const candidates = [
    readPath(payload, 'limits.addresses.ipv4'),
    readPath(payload, 'limits.addresses.ipv6'),
    readPath(payload, 'limits.addresses'),
    readPath(payload, 'allocations'),
    readPath(payload, 'addresses'),
  ];

  const addresses: string[] = [];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        const ip = normalizeIpAddressCandidate(entry);
        if (ip) {
          addresses.push(ip);
        }
      }
      continue;
    }

    const single = normalizeIpAddressCandidate(candidate);
    if (single) {
      addresses.push(single);
    }
  }

  const fallbackPrimary = pickString(payload, [
    'primary_ip',
    'ip',
    'address',
    'attributes.ip',
    'allocations.0.ip',
    'limits.addresses.ipv4.0.address',
    'limits.addresses.ipv6.0.address',
    'limits.addresses.0.address',
  ]);
  if (fallbackPrimary) {
    addresses.unshift(fallbackPrimary);
  }

  return [...new Set(addresses)];
}

function normalizeCredentialValue(value: string | null | undefined) {
  const normalized = (value ?? '').trim();
  if (normalized === '') {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (
    lower === '[redacted]'
    || lower === '************'
    || lower === '********'
    || lower === '******'
  ) {
    return null;
  }

  return normalized;
}

function pickNumber(value: unknown, paths: string[]) {
  for (const path of paths) {
    const candidate = readPath(value, path);
    const numeric = typeof candidate === 'number' ? candidate : Number(candidate);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return null;
}

function pickBoolean(value: unknown, paths: string[]) {
  for (const path of paths) {
    const candidate = readPath(value, path);
    if (typeof candidate === 'boolean') {
      return candidate;
    }
    if (typeof candidate === 'number') {
      return candidate > 0;
    }
    if (typeof candidate === 'string') {
      if (candidate === 'true' || candidate === '1') {
        return true;
      }
      if (candidate === 'false' || candidate === '0') {
        return false;
      }
    }
  }

  return null;
}

function formatPercent(value: number | null) {
  if (value === null) return '-';
  const normalized = value > 1 ? value : value * 100;
  return `${normalized.toFixed(1)}%`;
}

function formatBytes(value: number | null) {
  if (value === null) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let bytes = value;
  let unitIndex = 0;
  while (bytes >= 1024 && unitIndex < units.length - 1) {
    bytes /= 1024;
    unitIndex += 1;
  }
  return `${bytes.toFixed(bytes >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function normalizeUsagePercent(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) {
    return null;
  }

  const normalized = (value ?? 0) > 1 ? (value ?? 0) : (value ?? 0) * 100;
  return Math.max(0, Math.min(100, Number(normalized.toFixed(1))));
}

function calculateUsagePercent(used: number | null | undefined, total: number | null | undefined) {
  if (!Number.isFinite(used ?? NaN) || !Number.isFinite(total ?? NaN) || (total ?? 0) <= 0) {
    return null;
  }

  return Math.max(0, Math.min(100, Number((((used ?? 0) / (total ?? 1)) * 100).toFixed(1))));
}

function serverRuntimeStatusLabel(status: string, locale: string) {
  const normalized = status.trim().toLowerCase();

  if (normalized === 'running' || normalized === 'started') return uiRuntimeStatusLabel('running', locale);
  if (normalized === 'stopped' || normalized === 'shutdown' || normalized === 'offline') {
    return localizeMessage(locale, {
      zh: '已关机',
      en: 'Stopped',
      ja: '停止',
      ko: '중지됨',
    });
  }
  if (normalized === 'installing' || normalized === 'building') return uiRuntimeStatusLabel('building', locale);
  if (normalized === 'provisioning' || normalized === 'pending') return uiRuntimeStatusLabel('pending', locale);
  if (normalized === 'failed') return uiRuntimeStatusLabel('failed', locale);
  if (normalized === 'suspended') {
    return localizeMessage(locale, {
      zh: '已暂停',
      en: 'Suspended',
      ja: '一時停止',
      ko: '일시중지',
    });
  }
  if (normalized === 'unavailable' || normalized === 'upstream_unavailable') {
    return localizeMessage(locale, {
      zh: '状态失联',
      en: 'Unavailable',
      ja: '状態取得不可',
      ko: '상태 확인 불가',
    });
  }
  if (normalized === 'unmapped') {
    return localizeMessage(locale, {
      zh: '未映射',
      en: 'Unmapped',
      ja: '未マッピング',
      ko: '매핑 없음',
    });
  }
  if (!normalized || normalized === '-') return '-';
  return status;
}

function fallbackRuntimeState(
  status: RuntimeContractState | null | undefined,
  telemetryError: string | null | undefined,
) {
  if (telemetryError) {
    return 'unavailable';
  }

  if (status === 'failed') return 'failed';
  if (status === 'upstream_unavailable') return 'unavailable';
  if (status === 'unmapped') return 'unmapped';
  if (status === 'provisioning') return 'provisioning';
  if (status === 'archived') return 'archived';

  return null;
}

function serverRuntimeStatusClassName(status: string | null | undefined) {
  const normalized = (status ?? '').trim().toLowerCase();

  if (normalized === 'running' || normalized === 'started' || normalized === 'ready' || normalized === 'active') {
    return 'status-active';
  }

  if (normalized === 'installing' || normalized === 'building' || normalized === 'provisioning' || normalized === 'pending') {
    return 'status-pending';
  }

  if (normalized === 'failed') {
    return 'status-overdue';
  }

  if (normalized === 'suspended') {
    return 'status-suspended';
  }

  if (
    normalized === 'stopped'
    || normalized === 'shutdown'
    || normalized === 'offline'
    || normalized === 'unavailable'
    || normalized === 'upstream_unavailable'
    || normalized === 'unmapped'
    || normalized === 'archived'
  ) {
    return 'status-unknown';
  }

  return uiStatusClassName(normalized || 'unknown');
}

function firewallDirectionLabel(direction: string | null | undefined, locale: string) {
  if ((direction ?? '').trim().toLowerCase() === 'out') {
    return localizeMessage(locale, {
      zh: '出站',
      en: 'Outbound',
      ja: '送信',
      ko: '출력',
    });
  }

  return localizeMessage(locale, {
    zh: '入站',
    en: 'Inbound',
    ja: '受信',
    ko: '입력',
  });
}

function firewallActionLabel(action: string | null | undefined, locale: string) {
  const normalized = (action ?? '').trim().toUpperCase();

  if (normalized === 'DROP') {
    return localizeMessage(locale, {
      zh: '丢弃',
      en: 'Drop',
      ja: '破棄',
      ko: '드롭',
    });
  }

  if (normalized === 'REJECT') {
    return localizeMessage(locale, {
      zh: '拒绝',
      en: 'Reject',
      ja: '拒否',
      ko: '거부',
    });
  }

  return localizeMessage(locale, {
    zh: '允许',
    en: 'Allow',
    ja: '許可',
    ko: '허용',
  });
}

function firewallPolicyLabel(policy: string | null | undefined, locale: string) {
  const normalized = (policy ?? '').trim().toUpperCase();

  if (normalized === 'DROP') {
    return localizeMessage(locale, {
      zh: '默认丢弃',
      en: 'Default drop',
      ja: '既定で破棄',
      ko: '기본 드롭',
    });
  }

  if (normalized === 'REJECT') {
    return localizeMessage(locale, {
      zh: '默认拒绝',
      en: 'Default reject',
      ja: '既定で拒否',
      ko: '기본 거부',
    });
  }

  return localizeMessage(locale, {
    zh: '默认允许',
    en: 'Default allow',
    ja: '既定で許可',
    ko: '기본 허용',
  });
}

function firewallProtocolLabel(protocol: string | null | undefined) {
  const normalized = (protocol ?? '').trim().toLowerCase();
  if (normalized === '') {
    return '-';
  }

  if (normalized === 'icmpv6') {
    return 'ICMPv6';
  }

  return normalized.toUpperCase();
}

function friendlyRuntimeTelemetryStatus(
  status: RuntimeContractState | null | undefined,
  reason: string | null | undefined,
  telemetryError: string | null | undefined,
  locale: string,
) {
  if (telemetryError) {
    return localizeMessage(locale, {
      zh: '实时监控暂时不可用，页面已停止沿用旧的运行状态。',
      en: 'Live telemetry is temporarily unavailable, so the page stopped reusing the previous runtime state.',
      ja: 'リアルタイム監視は一時的に利用できないため、以前の実行状態の再利用を停止しました。',
      ko: '실시간 텔레메트리를 일시적으로 사용할 수 없어 이전 실행 상태 재사용을 중지했습니다.',
    });
  }

  const normalizedReason = reason?.trim().toLowerCase() ?? '';
  if (normalizedReason.includes('missing backend vm')) {
    return localizeMessage(locale, {
      zh: '当前服务的 Convoy 映射已经失效，页面不会再继续显示旧的运行状态。',
      en: 'This service points to a missing Convoy VM, so the page no longer shows the old runtime state.',
      ja: 'このサービスの Convoy マッピング先 VM が見つからないため、古い稼働状態は表示しません。',
      ko: '이 서비스가 존재하지 않는 Convoy VM을 가리키고 있어 이전 실행 상태를 더 이상 표시하지 않습니다.',
    });
  }

  if (status === 'upstream_unavailable') {
    return localizeMessage(locale, {
      zh: '实时监控链路暂时不可用，页面已停止沿用旧的运行状态。',
      en: 'The live telemetry upstream is unavailable, so the page stopped reusing the previous runtime state.',
      ja: 'リアルタイム監視の上流が利用できないため、以前の実行状態の再利用を停止しました。',
      ko: '실시간 텔레메트리 업스트림을 사용할 수 없어 이전 실행 상태 재사용을 중지했습니다.',
    });
  }

  if (status === 'unmapped') {
    return localizeMessage(locale, {
      zh: '当前服务还没有完成服务器映射，所以无法读取实时状态。',
      en: 'This service has not finished server mapping yet, so live state is unavailable.',
      ja: 'このサービスはサーバーマッピングが未完了のため、リアルタイム状態を取得できません。',
      ko: '이 서비스는 서버 매핑이 아직 완료되지 않아 실시간 상태를 읽을 수 없습니다.',
    });
  }

  if (status === 'failed') {
    return localizeMessage(locale, {
      zh: '实时状态读取失败，页面已停止沿用旧的运行状态。',
      en: 'Live state retrieval failed, so the page stopped reusing the previous runtime state.',
      ja: 'リアルタイム状態の取得に失敗したため、以前の実行状態の再利用を停止しました。',
      ko: '실시간 상태 읽기에 실패해 이전 실행 상태 재사용을 중지했습니다.',
    });
  }

  return reason ?? null;
}

function extractRevealedPassword(payload: unknown) {
  return pickString(payload, [
    'password',
    'root_password',
    'account_password',
    'data.password',
    'data.root_password',
    'data.account_password',
    'data.attributes.password',
  ]);
}

const strongServicePasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,50}$/;

function validateStrongServicePassword(password: string | null | undefined, locale: string) {
  const trimmed = (password ?? '').trim();
  if (trimmed === '') {
    return null;
  }

  if (trimmed.length < 8 || trimmed.length > 50) {
    return localizeMessage(locale, {
      zh: '密码必须为 8-50 位。',
      en: 'Password must be 8-50 characters long.',
      ja: 'パスワードは 8〜50 文字で入力してください。',
      ko: '비밀번호는 8~50자여야 합니다.',
    });
  }

  if (!strongServicePasswordPattern.test(trimmed)) {
    return localizeMessage(locale, {
      zh: '密码必须至少包含 1 个大写字母、1 个小写字母、1 个数字和 1 个特殊字符。',
      en: 'Password must include at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.',
      ja: 'パスワードには大文字・小文字・数字・記号をそれぞれ 1 文字以上含めてください。',
      ko: '비밀번호에는 대문자, 소문자, 숫자, 특수문자가 각각 1개 이상 포함되어야 합니다.',
    });
  }

  return null;
}

function isMeaningfulNodeValue(value: string | null | undefined) {
  const normalized = (value ?? '').trim();
  if (normalized === '') {
    return false;
  }

  if (/^\d+$/.test(normalized)) {
    return false;
  }

  return !['-', 'n/a', 'na', 'null', 'undefined'].includes(normalized.toLowerCase());
}

function deriveNodeLabelFromProductName(productName: string | null | undefined) {
  const normalized = (productName ?? '').trim();
  if (normalized === '') {
    return null;
  }

  const stripped = normalized
    .replace(/\s+(?:BGP\s*)?\d+C\d+G.*$/i, '')
    .replace(/\s+\d+\s*(?:v?cpu|core).*/i, '')
    .trim();

  return stripped !== '' ? stripped : normalized;
}

function findServiceValueFromProperties(service: ServiceDetail | null, keys: string[]) {
  if (!service) return null;

  const normalized = new Set(keys.map((key) => key.toLowerCase()));

  for (const property of service.properties ?? []) {
    const key = property.key?.trim().toLowerCase();
    if (!key || !normalized.has(key)) continue;
    const value = property.value?.trim();
    if (value) return value;
  }

  for (const configEntry of service.configs ?? []) {
    const optionKey = configEntry.option?.envVariable?.trim().toLowerCase();
    if (!optionKey || !normalized.has(optionKey)) continue;

    const value = configEntry.value?.envVariable?.trim() || configEntry.value?.name?.trim();
    if (value) return value;
  }

  return null;
}

function friendlyServerError(rawError: string | null | undefined, locale: string) {
  if (!rawError) return null;

  const lower = rawError.toLowerCase();

  if (lower.includes('409') || lower.includes('service_convoy_mapping_missing')) {
    return localizeMessage(locale, {
      zh: '该服务尚未完成 Convoy 映射，当前不能执行服务器操作。请等待开通完成，或在后台补齐 server_uuid 映射。',
      en: 'This service is not mapped to a Convoy server yet. Wait for provisioning to complete or backfill server_uuid mapping.',
      ja: 'このサービスはまだ Convoy サーバーへ関連付けられていません。開通完了を待つか、server_uuid マッピングを補完してください。',
      ko: '이 서비스는 아직 Convoy 서버에 매핑되지 않았습니다. 개통 완료를 기다리거나 server_uuid 매핑을 보완해 주세요.',
    });
  }

  if (lower.includes('service_provisioning_pending')) {
    return localizeMessage(locale, {
      zh: '服务正在开通中，请稍后重试。',
      en: 'Service provisioning is still in progress. Please try again later.',
      ja: 'サービスは開通中です。しばらくしてから再試行してください。',
      ko: '서비스 개통이 진행 중입니다. 잠시 후 다시 시도해 주세요.',
    });
  }

  if (lower.includes('service_provisioning_failed')) {
    return localizeMessage(locale, {
      zh: '服务开通失败，请在开通状态面板中发起重试。',
      en: 'Service provisioning failed. Retry from the provisioning panel.',
      ja: 'サービス開通に失敗しました。開通ステータスパネルから再試行してください。',
      ko: '서비스 개통에 실패했습니다. 개통 상태 패널에서 재시도해 주세요.',
    });
  }

  if (lower.includes('convoy integration is disabled') || lower.includes('convoy_disabled')) {
    return localizeMessage(locale, {
      zh: 'BFF 未启用 Convoy（CONVOY_ENABLED=false），请联系管理员。',
      en: 'Convoy is disabled in BFF (CONVOY_ENABLED=false).',
      ja: 'BFF で Convoy が無効です（CONVOY_ENABLED=false）。管理者へ連絡してください。',
      ko: 'BFF에서 Convoy가 비활성화되어 있습니다(CONVOY_ENABLED=false). 관리자에게 문의해 주세요.',
    });
  }

  if (lower.includes('missing backend vm')) {
    return localizeMessage(locale, {
      zh: '当前服务指向的 Convoy / PVE 实例已经不存在了，页面不会继续展示旧状态。请重新映射或重新开通。',
      en: 'The Convoy/PVE instance behind this service no longer exists. The page will not keep showing the old state.',
      ja: 'このサービスが参照する Convoy / PVE インスタンスは既に存在しません。古い状態は表示しません。',
      ko: '이 서비스가 가리키는 Convoy / PVE 인스턴스가 더 이상 존재하지 않습니다. 이전 상태는 계속 표시되지 않습니다.',
    });
  }

  return rawError;
}

function friendlyInstallFailureHint(rawError: string | null | undefined, locale: string) {
  if (!rawError) return null;

  const lower = rawError.toLowerCase();
  if (lower.includes('could not get lock') || lower.includes('dpkg frontend lock') || lower.includes('waiting for apt lock')) {
    return localizeMessage(locale, {
      zh: '检测到系统正在执行其他软件安装任务（apt 锁冲突）。系统会自动重试，无需重复点击；若持续超过 15 分钟，请执行一次“重试安装”。',
      en: 'Another package task is holding the apt lock. The installer will retry automatically; if it lasts more than 15 minutes, run one manual retry.',
      ja: '別のパッケージ処理が apt ロックを保持しています。自動再試行されるため連打は不要です。15分以上続く場合は手動で再試行してください。',
      ko: '다른 패키지 작업이 apt 잠금을 점유하고 있습니다. 자동 재시도되므로 반복 클릭은 필요 없고, 15분 이상 지속되면 수동 재시도를 실행하세요.',
    });
  }

  if (lower.includes('network is unreachable') || lower.includes('could not connect to deb.debian.org') || lower.includes('debian.map.fastly.net')) {
    return localizeMessage(locale, {
      zh: '检测到安装时节点网络抖动，系统软件源暂时不可达。通常稍后自动重试即可恢复。',
      en: 'Temporary upstream mirror/network jitter was detected during installation. This usually recovers on automatic retry.',
      ja: 'インストール中に上流ミラー/ネットワークの一時的な不安定が検出されました。多くの場合は自動再試行で回復します。',
      ko: '설치 중 업스트림 미러/네트워크 일시 불안정이 감지되었습니다. 대부분 자동 재시도로 복구됩니다.',
    });
  }

  if (lower.includes('connection refused') && (lower.includes(':22') || lower.includes('ssh'))) {
    return localizeMessage(locale, {
      zh: '检测到 SSH 22 端口不可达。请先确认服务器已开机、模板已启用 SSH（含 root/密码登录策略）并放行安全组后，再点“重试安装”。',
      en: 'SSH on port 22 is unreachable. Ensure the server is powered on, the image enables SSH login, and firewall/security-group rules allow SSH before retrying install.',
      ja: 'SSH 22 番ポートに接続できません。サーバー起動、テンプレートの SSH 有効化、FW/セキュリティグループ開放を確認してから再試行してください。',
      ko: 'SSH 22 포트에 연결할 수 없습니다. 서버 전원, 템플릿 SSH 설정, 방화벽/보안그룹 허용 후 재시도해 주세요.',
    });
  }

  if (lower.includes('permission denied')) {
    return localizeMessage(locale, {
      zh: '检测到 SSH 权限被拒绝。请确认账号/密码、密钥策略和 sudo 权限后再重试安装。',
      en: 'SSH authentication was denied. Verify account/password, key policy, and sudo permissions before retrying.',
      ja: 'SSH 認証が拒否されました。アカウント/パスワード、鍵ポリシー、sudo 権限を確認して再試行してください。',
      ko: 'SSH 인증이 거부되었습니다. 계정/비밀번호, 키 정책, sudo 권한을 확인한 뒤 재시도해 주세요.',
    });
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return localizeMessage(locale, {
      zh: '安装超时，通常是节点网络波动或镜像初始化较慢。可稍后“重试安装”。',
      en: 'The install timed out, usually due to node network jitter or slow image initialization. Retry in a few minutes.',
      ja: 'インストールがタイムアウトしました。ノードネットワーク変動や初期化遅延が原因のことがあります。数分後に再試行してください。',
      ko: '설치가 시간 초과되었습니다. 노드 네트워크 변동 또는 이미지 초기화 지연이 원인일 수 있습니다. 잠시 후 재시도해 주세요.',
    });
  }

  if (lower.includes('runtime is not ready for ssh') || lower.includes('not ready for ssh app installation')) {
    return localizeMessage(locale, {
      zh: '服务器当前未处于可 SSH 安装状态，请先开机并确认运行状态为“运行中”，再重试应用安装。',
      en: 'The server runtime is not ready for SSH install. Start the server first, confirm it is running, then retry app installation.',
      ja: 'サーバーは SSH インストール可能な状態ではありません。先に起動し、稼働状態を確認してから再試行してください。',
      ko: '서버가 SSH 설치 가능한 상태가 아닙니다. 먼저 전원을 켜고 실행 상태를 확인한 뒤 재시도해 주세요.',
    });
  }

  return null;
}

function normalizeServiceUrl(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') {
    return null;
  }

  return normalizeOperatorApiUrl(trimmed);
}

function operatorEntryKindLabel(entryKind: string | null | undefined, locale: string) {
  if (entryKind === 'upload-project') {
    return locale.startsWith('zh') ? '项目文件 / 仓库上线' : 'Project upload';
  }
  if (entryKind === 'generate-from-idea') {
    return locale.startsWith('zh') ? '想法生成项目' : 'Idea to project';
  }
  if (entryKind === 'scan-server') {
    return locale.startsWith('zh') ? '旧服务器迁移' : 'Server migration';
  }

  return locale.startsWith('zh') ? 'AI 上线流程' : 'AI launch flow';
}

function operatorBusinessPathLabel(path: string | null | undefined, locale: string) {
  const normalized = path?.trim().toLowerCase() ?? '';
  if (normalized === 'ai-managed-launch' || normalized === 'ai managed launch' || normalized === 'managed app hosting') {
    return locale.startsWith('zh') ? 'AI 托管上线' : 'AI managed launch';
  }
  if (normalized === 'vps-self-hosted' || normalized === 'vps self hosted') {
    return locale.startsWith('zh') ? '购买 VPS 并迁移' : 'Buy VPS and migrate';
  }
  if (normalized === 'server-migration' || normalized === 'server migration') {
    return locale.startsWith('zh') ? '接管旧服务器' : 'Existing server takeover';
  }

  return locale.startsWith('zh') ? '树懒云服务' : 'Sloth Cloud service';
}

function buildOperatorServiceOrigin(service: ServiceDetail | null, locale: string): OperatorServiceOrigin | null {
  if (!service) {
    return null;
  }

  const capsuleId = findServiceValueFromProperties(service, ['operator_capsule_id']);
  const capsuleName = findServiceValueFromProperties(service, ['operator_capsule_name']);
  const entryKind = findServiceValueFromProperties(service, ['operator_entry_kind']);
  const stack = findServiceValueFromProperties(service, ['operator_stack']);
  const businessPath = findServiceValueFromProperties(service, ['operator_business_path']);
  const source = findServiceValueFromProperties(service, ['operator_source']);
  const planSummary = findServiceValueFromProperties(service, ['operator_plan_summary']);
  const previewUrl = normalizeServiceUrl(findServiceValueFromProperties(service, ['operator_preview_url']));
  const productionUrl = normalizeServiceUrl(findServiceValueFromProperties(service, ['operator_production_url']));
  const repoUrl = normalizeServiceUrl(findServiceValueFromProperties(service, ['git_repo_url']));
  const bundleUrl = normalizeServiceUrl(findServiceValueFromProperties(service, ['operator_project_bundle_url']));
  const manifestUrl = normalizeServiceUrl(findServiceValueFromProperties(service, ['operator_project_manifest_url']));

  if (!capsuleId && !capsuleName && !entryKind && !previewUrl && !productionUrl) {
    return null;
  }

  return {
    capsuleId: capsuleId?.trim() || null,
    capsuleName: capsuleName?.trim() || (locale.startsWith('zh') ? '未命名 AI 项目' : 'AI project'),
    entryKind: entryKind?.trim() || null,
    entryLabel: operatorEntryKindLabel(entryKind, locale),
    stack: stack?.trim() || null,
    businessPath: businessPath?.trim() || null,
    businessLabel: operatorBusinessPathLabel(businessPath, locale),
    source: source?.trim() || null,
    planSummary: planSummary?.trim() || null,
    previewUrl,
    productionUrl,
    repoUrl,
    bundleUrl,
    manifestUrl,
  };
}

function compressInstallLogLine(line: string, limit = 220) {
  const normalized = line.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1)}…`;
}

function summarizeInstallLogs(logs: string[]) {
  const noisyPattern = /^(get:\d+|hit:\d+|reading package lists|building dependency tree|reading state information)/i;
  const normalized = logs
    .map((line) => compressInstallLogLine(line))
    .filter((line) => line.length > 0);
  const cleaned = normalized.filter((line) => !noisyPattern.test(line));
  const source = cleaned.length > 0 ? cleaned : normalized;
  const lines = source.slice(-3);

  return {
    lines,
    hiddenCount: Math.max(0, source.length - lines.length),
  };
}

function isRuntimeReadyForAppInstall(status: string | null | undefined) {
  if (!status) {
    return true;
  }

  const normalized = status.trim().toLowerCase();
  if (normalized === '') {
    return true;
  }

  return ['running', 'ready', 'active', 'started'].includes(normalized);
}

function provisioningTone(status: string | null | undefined) {
  const normalized = (status ?? '').toLowerCase();
  if (normalized === 'success' || normalized === 'completed' || normalized === 'ready') return 'success';
  if (normalized === 'failed' || normalized === 'build_failed') return 'failed';
  return 'pending';
}

function isProvisioningFailedStatus(status: string | null | undefined) {
  const normalized = (status ?? '').trim().toLowerCase();
  return normalized !== '' && (
    normalized === 'failed'
    || normalized === 'build_failed'
    || normalized.includes('fail')
    || normalized.includes('error')
  );
}

function isProvisioningInFlightStatus(status: string | null | undefined) {
  const normalized = (status ?? '').trim().toLowerCase();
  return ['pending', 'provisioning', 'queued', 'building', 'pushing', 'deploying', 'retrying', 'deleting'].includes(normalized);
}

function managedProvisioningStageLabel(status: string, locale: string) {
  return uiRuntimeStatusLabel(status, locale);
}

function managedLogLabel(line: string, locale: string) {
  const lower = line.toLowerCase();

  if (lower.includes('build')) {
    return localizeMessage(locale, {
      zh: '构建',
      en: 'Build',
      ja: 'ビルド',
      ko: '빌드',
    });
  }
  if (lower.includes('deploy')) {
    return localizeMessage(locale, {
      zh: '部署',
      en: 'Deploy',
      ja: 'デプロイ',
      ko: '배포',
    });
  }
  if (lower.includes('push')) {
    return localizeMessage(locale, {
      zh: '推送',
      en: 'Push',
      ja: 'プッシュ',
      ko: '푸시',
    });
  }
  if (lower.includes('restart')) {
    return localizeMessage(locale, {
      zh: '重启',
      en: 'Restart',
      ja: '再起動',
      ko: '재시작',
    });
  }

  return line;
}

function parseManagedEnvDraft(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      valid: typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed),
      value: parsed,
    };
  } catch {
    return { valid: false, value: {} as Record<string, unknown> };
  }
}

function booleanFromString(value: string | null | undefined) {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return null;
}

function trimUnique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function resolveMarketplaceSelection(
  primaryApps: VpsMarketplaceApp[],
  addonApps: VpsMarketplaceApp[],
  requestedPrimarySlug: string | null,
  requestedAddonSlugs: string[],
) {
  const primaryMap = new Map(primaryApps.map((app) => [app.slug, app]));
  const addonMap = new Map(addonApps.map((app) => [app.slug, app]));
  const allMap = new Map([...primaryApps, ...addonApps].map((app) => [app.slug, app]));

  let primarySlug = requestedPrimarySlug?.trim() || null;
  const resolvedAddons: string[] = [];
  const queue = [...trimUnique(requestedAddonSlugs)];

  const primary = primarySlug ? primaryMap.get(primarySlug) ?? null : null;
  if (primarySlug && (!primary || !primary.available)) {
    return {
      primarySlug,
      addonSlugs: resolvedAddons,
      error: primary?.unavailableReason ?? 'Selected primary app is unavailable for this OS.',
    };
  }

  while (queue.length > 0) {
    const slug = queue.shift();
    if (!slug || resolvedAddons.includes(slug)) {
      continue;
    }

    const addon = addonMap.get(slug);
    if (!addon) {
      return {
        primarySlug,
        addonSlugs: resolvedAddons,
        error: `Addon ${slug} is not available for the current OS.`,
      };
    }

    if (!addon.available) {
      return {
        primarySlug,
        addonSlugs: resolvedAddons,
        error: addon.unavailableReason ?? `Addon ${slug} is currently unavailable.`,
      };
    }

    resolvedAddons.push(slug);

    for (const dependencySlug of addon.recipe?.dependencies ?? []) {
      const dependency = allMap.get(dependencySlug);
      if (!dependency) {
        return {
          primarySlug,
          addonSlugs: resolvedAddons,
          error: `Addon ${slug} depends on unavailable app ${dependencySlug}.`,
        };
      }

      if (dependency.type === 'main') {
        if (primarySlug && primarySlug !== dependencySlug) {
          return {
            primarySlug,
            addonSlugs: resolvedAddons,
            error: `Addon ${slug} requires primary app ${dependencySlug}.`,
          };
        }

        primarySlug = dependencySlug;
        continue;
      }

      if (!resolvedAddons.includes(dependencySlug) && !queue.includes(dependencySlug)) {
        queue.push(dependencySlug);
      }
    }
  }

  const universe = new Set<string>([
    ...(primarySlug ? [primarySlug] : []),
    ...resolvedAddons,
  ]);

  if (primarySlug) {
    const primaryApp = primaryMap.get(primarySlug);
    if (!primaryApp) {
      return {
        primarySlug,
        addonSlugs: resolvedAddons,
        error: `Primary app ${primarySlug} is not available.`,
      };
    }

    for (const conflict of primaryApp.recipe?.conflicts ?? []) {
      if (universe.has(conflict)) {
        return {
          primarySlug,
          addonSlugs: resolvedAddons,
          error: `Primary app ${primarySlug} conflicts with ${conflict}.`,
        };
      }
    }
  }

  for (const addonSlug of resolvedAddons) {
    const addon = addonMap.get(addonSlug);
    if (!addon) {
      continue;
    }

    for (const conflict of addon.recipe?.conflicts ?? []) {
      if (universe.has(conflict)) {
        return {
          primarySlug,
          addonSlugs: resolvedAddons,
          error: `Addon ${addonSlug} conflicts with ${conflict}.`,
        };
      }
    }
  }

  return {
    primarySlug,
    addonSlugs: resolvedAddons,
    error: null,
  };
}

const managedAppProductSlugs = new Set([
  'app-starter',
  'app-standard',
  'app-pro',
  'app-team',
]);

const telemetryRefreshStorageKey = 'sloth-service-telemetry-refresh-seconds';
const telemetryRefreshMinSeconds = 1;
const telemetryRefreshMaxSeconds = 15;
const telemetryRefreshDefaultSeconds = 3;

function clampTelemetryRefreshSeconds(value: number) {
  if (!Number.isFinite(value)) {
    return telemetryRefreshDefaultSeconds;
  }

  return Math.min(
    telemetryRefreshMaxSeconds,
    Math.max(telemetryRefreshMinSeconds, Math.round(value)),
  );
}

function readTelemetryRefreshPreference() {
  if (typeof window === 'undefined') {
    return telemetryRefreshDefaultSeconds;
  }

  try {
    return clampTelemetryRefreshSeconds(Number(window.localStorage.getItem(telemetryRefreshStorageKey)));
  } catch {
    return telemetryRefreshDefaultSeconds;
  }
}

export function ServiceDetailPage() {
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const { text, locale, formatDate } = useSite();
  const ui = getUiText(locale);
  const [reinstallOsChoice, setReinstallOsChoice] = useState('');
  const [reinstallPrimaryAppChoice, setReinstallPrimaryAppChoice] = useState('');
  const [reinstallAddonAppChoices, setReinstallAddonAppChoices] = useState<string[]>([]);
  const [reinstallMarketplaceHint, setReinstallMarketplaceHint] = useState<string | null>(null);
  const [reinstallSelectionInitialized, setReinstallSelectionInitialized] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [telemetryRefreshNonce, setTelemetryRefreshNonce] = useState(0);
  const [telemetryRefreshSeconds, setTelemetryRefreshSeconds] = useState(readTelemetryRefreshPreference);
  const { data, error, loading } = useApiData<ServiceResponse>(
    serviceId ? `/api/v1/services/${serviceId}?refresh=${refreshNonce}` : null,
  );
  const serviceSnapshot = data?.data.service ?? null;
  const normalizedServiceStatus = (serviceSnapshot?.status ?? '').toLowerCase();
  const isArchivedService = ['cancelled', 'terminated', 'deleted', 'inactive', 'expired']
    .includes(normalizedServiceStatus);
  const serviceProductSlug = serviceSnapshot?.product?.slug ?? null;
  const { data: productData } = useApiData<ProductDetailResponse>(
    serviceProductSlug ? `/api/v1/catalog/products/${encodeURIComponent(serviceProductSlug)}?refresh=${refreshNonce}` : null,
  );
  const serviceCategoryRaw = serviceSnapshot?.product?.category?.slug
    ?? productData?.data?.category?.slug
    ?? '';
  const serviceProductCategorySlug = typeof serviceCategoryRaw === 'string'
    ? serviceCategoryRaw.toLowerCase()
    : '';
  const normalizedServiceProductSlug = (serviceProductSlug ?? '').toLowerCase();
  const likelyManagedByProduct = serviceProductCategorySlug === 'app-hosting'
    || normalizedServiceProductSlug.includes('app-hosting')
    || managedAppProductSlugs.has(normalizedServiceProductSlug);
  const runtimeKindFallback = serviceSnapshot?.runtimeKind ?? (likelyManagedByProduct ? 'managed-app' : 'vps');
  const shouldFetchRuntime = Boolean(serviceId && serviceSnapshot && !isArchivedService);
  const { data: runtimeData, error: runtimeError, loading: runtimeLoading } = useApiData<ServiceRuntimeResponse>(
    shouldFetchRuntime ? `/api/v1/services/${serviceId}/runtime?refresh=${refreshNonce}` : null,
  );
  const runtimeKind = runtimeData?.data?.runtime?.kind ?? runtimeKindFallback;
  const isManagedRuntime = runtimeKind === 'managed-app';
  const shouldFetchRuntimeTelemetry = Boolean(serviceId && serviceSnapshot && !isManagedRuntime && !isArchivedService);
  const { data: runtimeOverviewData, error: runtimeOverviewError } = useApiData<RuntimeOverviewResponse>(
    shouldFetchRuntimeTelemetry ? `/api/v1/services/${serviceId}/runtime/overview?refresh=${telemetryRefreshNonce}` : null,
    { preserveData: true, preserveDataOnError: false },
  );
  const { data: runtimeMetricsData, error: runtimeMetricsError } = useApiData<RuntimeMetricsResponse>(
    shouldFetchRuntimeTelemetry ? `/api/v1/services/${serviceId}/runtime/metrics?refresh=${telemetryRefreshNonce}` : null,
    { preserveData: true, preserveDataOnError: false },
  );
  const shouldFetchServer = Boolean(serviceId && serviceSnapshot && !isManagedRuntime && !isArchivedService);
  const { data: serverData, error: serverError, loading: serverLoading } = useApiData<ServiceServerResponse>(
    shouldFetchServer ? `/api/v1/services/${serviceId}/server?refresh=${refreshNonce}` : null,
  );
  const { data: firewallData, error: firewallError, loading: firewallLoading } = useApiData<ServiceFirewallResponse>(
    shouldFetchServer ? `/api/v1/services/${serviceId}/server/firewall?refresh=${refreshNonce}` : null,
    { preserveData: true, preserveDataOnError: false },
  );
  const {
    data: provisioningData,
    error: provisioningError,
    loading: provisioningLoading,
  } = useApiData<ServiceProvisioningResponse>(serviceId ? `/api/v1/services/${serviceId}/provisioning?refresh=${refreshNonce}` : null);
  const managedRuntimeLogLimit = 80;
  const { data: managedRuntimeLogs, error: managedRuntimeLogsError, loading: managedRuntimeLogsLoading } = useApiData<ManagedRuntimeLogsResponse>(
    serviceId && isManagedRuntime ? `/api/v1/services/${serviceId}/runtime/logs?limit=${managedRuntimeLogLimit}&refresh=${refreshNonce}` : null,
  );
  const { data: operationLogData } = useApiData<ServiceOperationLogsResponse>(
    serviceId ? `/api/v1/services/${serviceId}/operation-logs?limit=8&refresh=${refreshNonce}` : null,
  );
  const {
    data: serviceAppsData,
    error: serviceAppsError,
    loading: serviceAppsLoading,
  } = useApiData<ServiceAppsResponse>(
    serviceId && serviceSnapshot && !isManagedRuntime ? `/api/v1/services/${serviceId}/apps?refresh=${refreshNonce}` : null,
  );
  const effectiveReinstallOs = reinstallOsChoice.trim()
    || serviceAppsData?.data.selectedOs
    || productData?.data?.vpsAppMarketplace?.supportedOs?.[0]?.value
    || '';
  const {
    data: reinstallMarketData,
    error: reinstallMarketError,
    loading: reinstallMarketLoading,
  } = useApiData<VpsAppMarketplaceResponse>(
    !isManagedRuntime && serviceProductSlug && effectiveReinstallOs
      ? `/api/v1/catalog/products/${encodeURIComponent(serviceProductSlug)}/vps-app-market?os=${encodeURIComponent(effectiveReinstallOs)}&refresh=${refreshNonce}`
      : null,
  );
  const {
    data: upgradeOptionsData,
    error: upgradeOptionsError,
    loading: upgradeOptionsLoading,
  } = useApiData<ServiceUpgradeOptionsResponse>(
    serviceId && serviceSnapshot?.upgradable ? `/api/v1/services/${serviceId}/upgrade-options?refresh=${refreshNonce}` : null,
  );

  const [label, setLabel] = useState('');
  const [reason, setReason] = useState('');
  const [cancelType, setCancelType] = useState<'end_of_period' | 'immediate'>('end_of_period');
  const [cancelPassword, setCancelPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelActionError, setCancelActionError] = useState<string | null>(null);
  const [serverBusy, setServerBusy] = useState<ServerAction | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverActionError, setServerActionError] = useState<string | null>(null);
  const [firewallBusy, setFirewallBusy] = useState<string | null>(null);
  const [firewallMessage, setFirewallMessage] = useState<string | null>(null);
  const [firewallActionError, setFirewallActionError] = useState<string | null>(null);
  const [firewallEnabledDraft, setFirewallEnabledDraft] = useState(false);
  const [firewallIpFilterDraft, setFirewallIpFilterDraft] = useState(false);
  const [firewallPolicyInDraft, setFirewallPolicyInDraft] = useState<'ACCEPT' | 'DROP' | 'REJECT'>('ACCEPT');
  const [firewallPolicyOutDraft, setFirewallPolicyOutDraft] = useState<'ACCEPT' | 'DROP' | 'REJECT'>('ACCEPT');
  const [firewallDirectionDraft, setFirewallDirectionDraft] = useState<FirewallRuleDirection>('in');
  const [firewallRuleActionDraft, setFirewallRuleActionDraft] = useState<FirewallRuleAction>('ACCEPT');
  const [firewallProtocolDraft, setFirewallProtocolDraft] = useState<FirewallRuleProtocol>('tcp');
  const [firewallSourceDraft, setFirewallSourceDraft] = useState('');
  const [firewallDestinationPortDraft, setFirewallDestinationPortDraft] = useState('');
  const [firewallCommentDraft, setFirewallCommentDraft] = useState('');
  const [consoleType, setConsoleType] = useState<ConsoleSessionType>('novnc');
  const [consoleBusy, setConsoleBusy] = useState(false);
  const [consoleMessage, setConsoleMessage] = useState<string | null>(null);
  const [consoleError, setConsoleError] = useState<string | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [passwordRestartSuggested, setPasswordRestartSuggested] = useState(false);
  const [showStoredPassword, setShowStoredPassword] = useState(false);
  const [showPanelPassword, setShowPanelPassword] = useState(false);
  const [visibleInstallPasswords, setVisibleInstallPasswords] = useState<Record<string, boolean>>({});
  const [expandedInstallLogs, setExpandedInstallLogs] = useState<Record<string, boolean>>({});
  const [renewingService, setRenewingService] = useState(false);
  const [revokingCancellation, setRevokingCancellation] = useState(false);
  const [retryingProvisioning, setRetryingProvisioning] = useState(false);
  const [provisioningMessage, setProvisioningMessage] = useState<string | null>(null);
  const [retryProvisioningPassword, setRetryProvisioningPassword] = useState('');
  const [reinstallPassword, setReinstallPassword] = useState('');
  const [serverPasswordDraft, setServerPasswordDraft] = useState('');
  const [serverPasswordAutoRestart, setServerPasswordAutoRestart] = useState(true);
  const [reinstallStartOnCompletion, setReinstallStartOnCompletion] = useState(true);
  const [showReinstallComposer, setShowReinstallComposer] = useState(false);
  const [showAddonInstaller, setShowAddonInstaller] = useState(false);
  const [addonCategoryFilter, setAddonCategoryFilter] = useState('all');
  const [showBillingActions, setShowBillingActions] = useState(false);
  const [selectedUpgradeProductId, setSelectedUpgradeProductId] = useState('');
  const [selectedUpgradeConfig, setSelectedUpgradeConfig] = useState<Record<string, string>>({});
  const [upgradingService, setUpgradingService] = useState(false);
  const [managedBusy, setManagedBusy] = useState<string | null>(null);
  const [managedMessage, setManagedMessage] = useState<string | null>(null);
  const [managedActionError, setManagedActionError] = useState<string | null>(null);
  const [managedEnvDraft, setManagedEnvDraft] = useState('{}');
  const [managedDomainDraft, setManagedDomainDraft] = useState('');
  const [managedScaleDraft, setManagedScaleDraft] = useState('1');
  const [selectedAddonSlugs, setSelectedAddonSlugs] = useState<string[]>([]);
  const [appsBusy, setAppsBusy] = useState<string | null>(null);
  const [appsMessage, setAppsMessage] = useState<string | null>(null);
  const [appsActionError, setAppsActionError] = useState<string | null>(null);

  useEffect(() => {
    setVisibleInstallPasswords({});
    setExpandedInstallLogs({});
  }, [serviceId]);

  useEffect(() => {
    const options = firewallData?.data.options;
    if (!options) {
      return;
    }

    setFirewallEnabledDraft(Boolean(options.enabled));
    setFirewallIpFilterDraft(Boolean(options.ipfilter));
    setFirewallPolicyInDraft((options.policyIn === 'DROP' || options.policyIn === 'REJECT') ? options.policyIn : 'ACCEPT');
    setFirewallPolicyOutDraft((options.policyOut === 'DROP' || options.policyOut === 'REJECT') ? options.policyOut : 'ACCEPT');
  }, [
    firewallData?.data.options.enabled,
    firewallData?.data.options.ipfilter,
    firewallData?.data.options.policyIn,
    firewallData?.data.options.policyOut,
  ]);

  function refreshPageState(delayMs = 0) {
    window.setTimeout(() => {
      setRefreshNonce((current) => current + 1);
      setTelemetryRefreshNonce((current) => current + 1);
    }, delayMs);
  }

  function updateTelemetryRefreshSeconds(value: number) {
    setTelemetryRefreshSeconds(clampTelemetryRefreshSeconds(value));
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(telemetryRefreshStorageKey, String(telemetryRefreshSeconds));
    } catch {
      // Local storage can be disabled in private contexts; the live selector still works.
    }
  }, [telemetryRefreshSeconds]);

  useEffect(() => {
    if (!shouldFetchRuntimeTelemetry) {
      return;
    }

    const timer = window.setInterval(() => {
      setTelemetryRefreshNonce((current) => current + 1);
    }, telemetryRefreshSeconds * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [shouldFetchRuntimeTelemetry, telemetryRefreshSeconds]);

  async function updateLabel() {
    if (!serviceId) return;
    setPending(true);
    setMessage(null);
    setActionError(null);
    try {
      await requestJson(`/api/v1/services/${serviceId}/label`, {
        method: 'PATCH',
        body: { label: label.trim() || null },
      });
      setMessage(ui.services.updateLabelSuccess);
      refreshPageState();
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      setPending(false);
    }
  }

  async function cancelService() {
    if (!serviceId) return;
    const password = cancelPassword.trim();
    if (password.length < 8) {
      setCancelActionError(localizeMessage(locale, {
        zh: '取消服务前，请输入当前账号密码（至少 8 位）进行确认。',
        en: 'Please enter your current account password (at least 8 characters) to confirm cancellation.',
        ja: '解約前に、現在のアカウントパスワード（8文字以上）を入力してください。',
        ko: '해지를 진행하려면 현재 계정 비밀번호(8자 이상)를 입력해 주세요.',
      }));
      return;
    }
    setPending(true);
    setMessage(null);
    setActionError(null);
    setCancelActionError(null);
    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(`/api/v1/services/${serviceId}/cancel`, {
        method: 'POST',
        body: {
          type: cancelType,
          reason: reason || localizeMessage(locale, {
            zh: '客户主动取消',
            en: 'Requested by customer.',
            ja: '顧客からの解約依頼',
            ko: '고객 요청으로 취소',
          }),
          current_password: password,
        },
      });
      const operationHint = response.actionResult?.operationId ? ` ${ui.common.operationId}: ${response.actionResult.operationId}` : '';
      const resolvedMessage = localizeBackendMessage(response.message, locale) || ui.services.cancellationRequested;
      setMessage(`${resolvedMessage}${operationHint}`);
      setCancelPassword('');
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setCancelActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setPending(false);
    }
  }

  async function retryProvisioning() {
    if (!serviceId) return;
    const customPassword = retryProvisioningPassword.trim();
    const passwordError = validateStrongServicePassword(customPassword, locale);
    if (passwordError) {
      setActionError(passwordError);
      return;
    }
    setRetryingProvisioning(true);
    setProvisioningMessage(null);
    setActionError(null);
    try {
      const response = await requestJson<ServiceProvisioningRetryResponse>(`/api/v1/services/${serviceId}/provisioning/retry`, {
        method: 'POST',
        body: {
          force: false,
          ...(customPassword !== '' ? { accountPassword: customPassword } : {}),
        },
      });
      setProvisioningMessage(localizeBackendMessage(response.message, locale) || response.message);
      if (customPassword !== '') {
        setRetryProvisioningPassword('');
      }
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      setRetryingProvisioning(false);
    }
  }

  async function renewService() {
    if (!serviceId) return;

    setRenewingService(true);
    setActionError(null);
    setMessage(null);
    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(
        `/api/v1/services/${serviceId}/renew`,
        {
          method: 'POST',
        },
      );
      const operationHint = response.actionResult?.operationId ? ` ${ui.common.operationId}: ${response.actionResult.operationId}` : '';
      const resolvedMessage = localizeBackendMessage(response.message, locale);
      setMessage(
        resolvedMessage
          ? `${resolvedMessage}${operationHint}`
          : ui.services.renewalRequested,
      );

      const responseData = asRecord(response.data);
      const renewalInvoice = asRecord(responseData.invoice);
      const renewalInvoiceId = (() => {
        const candidate = renewalInvoice.id;
        if (typeof candidate === 'string' && candidate.trim() !== '') {
          return candidate.trim();
        }
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
          return String(Math.trunc(candidate));
        }
        return null;
      })();

      if (renewalInvoiceId) {
        navigate(`/invoices/${renewalInvoiceId}`);
      }

      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setRenewingService(false);
    }
  }

  async function submitUpgrade() {
    if (!serviceId || !selectedUpgradeProductId) return;

    setUpgradingService(true);
    setActionError(null);
    setMessage(null);

    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(`/api/v1/services/${serviceId}/upgrade`, {
        method: 'POST',
        body: {
          productId: selectedUpgradeProductId,
          configOptions: selectedUpgradeConfig,
        },
      });
      const operationHint = response.actionResult?.operationId ? ` ${ui.common.operationId}: ${response.actionResult.operationId}` : '';
      const resolvedMessage = localizeBackendMessage(response.message, locale) || localizeMessage(locale, {
        zh: '配置调整请求已提交。',
        en: 'Upgrade request submitted.',
        ja: '構成変更リクエストを送信しました。',
        ko: '구성 변경 요청이 제출되었습니다.',
      });
      setMessage(`${resolvedMessage}${operationHint}`);

      const responseData = asRecord(response.data);
      const invoice = asRecord(responseData.invoice);
      const invoiceCandidate = invoice.id;
      const invoiceId = typeof invoiceCandidate === 'number'
        ? String(invoiceCandidate)
        : typeof invoiceCandidate === 'string' && invoiceCandidate.trim() !== ''
          ? invoiceCandidate.trim()
          : null;

      if (invoiceId) {
        navigate(`/invoices/${invoiceId}`);
      }

      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setUpgradingService(false);
    }
  }

  async function installAddonApps() {
    if (!serviceId || selectedAddonSlugs.length === 0) return;

    const runtimeStatus = pickString(serverData?.data.convoy, [
      'status',
      'state',
      'power_state',
      'attributes.status',
    ]);
    if (!isRuntimeReadyForAppInstall(runtimeStatus)) {
      setAppsActionError(localizeMessage(locale, {
        zh: '当前服务器未运行，暂时无法安装应用组件。请先开机，再点击“提交安装”。',
        en: 'The server is not running, so addon installation is unavailable. Start the server first, then submit install again.',
        ja: '現在サーバーが稼働していないため、アドオンをインストールできません。先に起動してから再実行してください。',
        ko: '현재 서버가 실행 중이 아니어서 애드온을 설치할 수 없습니다. 먼저 서버를 시작한 뒤 다시 시도해 주세요.',
      }));
      return;
    }

    setAppsBusy('install');
    setAppsMessage(null);
    setAppsActionError(null);

    try {
      const response = await requestJson<ServiceAppsInstallResponse>(`/api/v1/services/${serviceId}/apps/install`, {
        method: 'POST',
        body: {
          addonAppSlugs: selectedAddonSlugs,
        },
      });

      setAppsMessage(response.message);
      setSelectedAddonSlugs([]);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setAppsActionError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      setAppsBusy(null);
    }
  }

  async function retryInstallRecord(installId: string) {
    if (!serviceId) return;

    const runtimeStatus = pickString(serverData?.data.convoy, [
      'status',
      'state',
      'power_state',
      'attributes.status',
    ]);
    if (!isRuntimeReadyForAppInstall(runtimeStatus)) {
      setAppsActionError(localizeMessage(locale, {
        zh: '当前服务器未运行，暂时无法重试安装。请先开机，再重试。',
        en: 'The server is not running, so install retry is unavailable. Start the server first and retry.',
        ja: '現在サーバーが稼働していないため、再インストールを実行できません。先に起動してから再試行してください。',
        ko: '현재 서버가 실행 중이 아니어서 설치 재시도를 할 수 없습니다. 먼저 서버를 시작한 뒤 다시 시도해 주세요.',
      }));
      return;
    }

    setAppsBusy(`retry:${installId}`);
    setAppsMessage(null);
    setAppsActionError(null);

    try {
      const response = await requestJson<ServiceAppsInstallResponse>(`/api/v1/services/${serviceId}/apps/${installId}/retry`, {
        method: 'POST',
      });

      setAppsMessage(response.message);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setAppsActionError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      setAppsBusy(null);
    }
  }

  async function openServerConsole() {
    if (!serviceId) return;

    const popup = window.open('', '_blank');
    if (popup) {
      popup.document.title = locale.startsWith('zh') ? '正在连接控制台...' : 'Connecting console...';
      popup.document.body.innerHTML = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #dce9f3; background: #0b1621;">
          <h2 style="margin: 0 0 12px;">${locale.startsWith('zh') ? '正在打开控制台' : 'Opening console'}</h2>
          <p style="margin: 0; line-height: 1.6;">${locale.startsWith('zh') ? '控制台令牌正在生成，页面会自动跳转。' : 'The console token is being created. This page will redirect automatically.'}</p>
        </div>
      `;
    }

    setConsoleBusy(true);
    setConsoleMessage(null);
    setConsoleError(null);

    try {
      const response = await requestJson<ServiceConsoleResponse>(`/api/v1/services/${serviceId}/server/console`, {
        method: 'POST',
        body: {
          type: consoleType,
        },
      });

      const launchUrl = response.data.launchUrl;
      if (popup) {
        popup.location.replace(launchUrl);
      } else {
        const fallbackPopup = window.open(launchUrl, '_blank');
        if (!fallbackPopup) {
          throw new Error(localizeMessage(locale, {
            zh: '浏览器阻止了控制台窗口，请允许弹窗后重试。',
            en: 'The browser blocked the console window. Please allow pop-ups and try again.',
            ja: 'ブラウザがコンソールウィンドウをブロックしました。ポップアップを許可して再試行してください。',
            ko: '브라우저가 콘솔 창을 차단했습니다. 팝업을 허용한 뒤 다시 시도해 주세요.',
          }));
        }
      }

      setConsoleMessage(localizeBackendMessage(response.message, locale) || localizeMessage(locale, {
        zh: '控制台已在新标签页打开。',
        en: 'Console opened in a new tab.',
        ja: 'コンソールを新しいタブで開きました。',
        ko: '콘솔이 새 탭에서 열렸습니다.',
      }));
    } catch (caughtError) {
      if (popup) {
        popup.close();
      }
      setConsoleError(toFriendlyError(caughtError as ApiError, locale));
    } finally {
      setConsoleBusy(false);
    }
  }

  function resetFirewallRuleComposer() {
    setFirewallDirectionDraft('in');
    setFirewallRuleActionDraft('ACCEPT');
    setFirewallProtocolDraft('tcp');
    setFirewallSourceDraft('');
    setFirewallDestinationPortDraft('');
    setFirewallCommentDraft('');
  }

  async function saveFirewallOptions() {
    if (!serviceId) return;

    setFirewallBusy('options');
    setFirewallMessage(null);
    setFirewallActionError(null);

    try {
      const response = await requestJson<ActionResponse<ServiceFirewallResponse['data']>>(
        `/api/v1/services/${serviceId}/server/firewall/options`,
        {
          method: 'PATCH',
          body: {
            enabled: firewallEnabledDraft,
            ipfilter: firewallIpFilterDraft,
            policyIn: firewallPolicyInDraft,
            policyOut: firewallPolicyOutDraft,
          },
        },
      );

      setFirewallMessage(localizeBackendMessage(response.message, locale) || localizeMessage(locale, {
        zh: '防火墙设置已保存。',
        en: 'Firewall settings saved.',
        ja: 'ファイアウォール設定を保存しました。',
        ko: '방화벽 설정을 저장했습니다.',
      }));
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setFirewallActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setFirewallBusy(null);
    }
  }

  async function createFirewallRule(
    overrides?: Partial<{
      direction: FirewallRuleDirection;
      action: FirewallRuleAction;
      protocol: FirewallRuleProtocol;
      source: string;
      destinationPort: string;
      comment: string;
      enabled: boolean;
    }>,
  ) {
    if (!serviceId) return;

    const direction = overrides?.direction ?? firewallDirectionDraft;
    const action = overrides?.action ?? firewallRuleActionDraft;
    const protocol = overrides?.protocol ?? firewallProtocolDraft;
    const source = (overrides?.source ?? firewallSourceDraft).trim();
    const destinationPort = (overrides?.destinationPort ?? firewallDestinationPortDraft).trim();
    const comment = (overrides?.comment ?? firewallCommentDraft).trim();
    const enabled = overrides?.enabled ?? true;

    if ((protocol === 'tcp' || protocol === 'udp') && destinationPort === '') {
      setFirewallActionError(localizeMessage(locale, {
        zh: 'TCP/UDP 规则需要填写目标端口。',
        en: 'TCP and UDP rules require a destination port.',
        ja: 'TCP/UDP ルールには宛先ポートが必要です。',
        ko: 'TCP/UDP 규칙에는 대상 포트가 필요합니다.',
      }));
      return;
    }

    setFirewallBusy('create-rule');
    setFirewallMessage(null);
    setFirewallActionError(null);

    try {
      const response = await requestJson<ActionResponse<ServiceFirewallResponse['data']>>(
        `/api/v1/services/${serviceId}/server/firewall/rules`,
        {
          method: 'POST',
          body: {
            direction,
            action,
            protocol,
            enabled,
            source: source || null,
            destinationPort: destinationPort || null,
            comment: comment || null,
          },
        },
      );

      setFirewallMessage(localizeBackendMessage(response.message, locale) || localizeMessage(locale, {
        zh: '防火墙规则已新增。',
        en: 'Firewall rule created.',
        ja: 'ファイアウォールルールを追加しました。',
        ko: '방화벽 규칙을 추가했습니다.',
      }));
      if (!overrides) {
        resetFirewallRuleComposer();
      }
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setFirewallActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setFirewallBusy(null);
    }
  }

  async function deleteFirewallRule(position: number | null) {
    if (!serviceId || position === null) return;

    const confirmed = window.confirm(localizeMessage(locale, {
      zh: `确定要删除第 ${position} 条防火墙规则吗？`,
      en: `Delete firewall rule #${position}?`,
      ja: `ファイアウォールルール #${position} を削除しますか？`,
      ko: `방화벽 규칙 #${position} 을 삭제하시겠습니까?`,
    }));
    if (!confirmed) {
      return;
    }

    setFirewallBusy(`delete-rule:${position}`);
    setFirewallMessage(null);
    setFirewallActionError(null);

    try {
      const response = await requestJson<ActionResponse<ServiceFirewallResponse['data']>>(
        `/api/v1/services/${serviceId}/server/firewall/rules/${position}`,
        {
          method: 'DELETE',
        },
      );

      setFirewallMessage(localizeBackendMessage(response.message, locale) || localizeMessage(locale, {
        zh: '防火墙规则已删除。',
        en: 'Firewall rule deleted.',
        ja: 'ファイアウォールルールを削除しました。',
        ko: '방화벽 규칙을 삭제했습니다.',
      }));
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setFirewallActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setFirewallBusy(null);
    }
  }

  async function runServerAction(
    action: ServerAction,
    options?: {
      customPassword?: string;
      autoRestart?: boolean;
    },
  ) {
    if (!serviceId) return;

    setServerBusy(action);
    setServerMessage(null);
    setServerActionError(null);
    if (action !== 'reveal-password') {
      setRevealedPassword(null);
      setPasswordRestartSuggested(false);
    }

    try {
      let path = '';
      let method: 'POST' | 'DELETE' = 'POST';
      let body: Record<string, unknown> = {};

      if (action === 'start' || action === 'stop' || action === 'restart') {
        path = `/api/v1/services/${serviceId}/server/power`;
        body = { state: action };
      } else if (action === 'suspend' || action === 'unsuspend') {
        const confirmed = window.confirm(localizeMessage(locale, {
          zh: action === 'suspend'
            ? '暂停服务器会立即影响业务可用性，但不会自动停止计费。是否继续？'
            : '恢复服务器后，服务将重新上线。是否继续？',
          en: action === 'suspend'
            ? 'Suspending the server affects availability immediately and does not automatically stop billing. Continue?'
            : 'Unsuspending will bring the service back online. Continue?',
          ja: action === 'suspend'
            ? 'サーバー停止は即時に可用性へ影響し、課金は自動停止されません。続行しますか？'
            : '再開後、サービスは再びオンラインになります。続行しますか？',
          ko: action === 'suspend'
            ? '서버 일시중지는 즉시 가용성에 영향을 주며 과금이 자동 중지되지는 않습니다. 계속하시겠습니까?'
            : '다시 활성화하면 서비스가 온라인 상태로 돌아옵니다. 계속하시겠습니까?',
        }));
        if (!confirmed) {
          return;
        }

        path = `/api/v1/services/${serviceId}/server/${action}`;
      } else if (action === 'destroy') {
        const expected = (serviceSnapshot?.label || serviceSnapshot?.baseLabel || serviceId).trim();
        const typed = window.prompt(localizeMessage(locale, {
          zh: `销毁会永久删除当前服务器。请输入“${expected}”确认：`,
          en: `Destroy permanently deletes this server. Type "${expected}" to confirm:`,
          ja: `この操作はサーバーを完全削除します。確認のため「${expected}」と入力してください:`,
          ko: `이 작업은 서버를 영구 삭제합니다. 확인하려면 "${expected}" 를 입력하세요:`,
        }))?.trim() ?? '';

        if (typed !== expected) {
          setServerActionError(localizeMessage(locale, {
            zh: '确认标识不匹配，已取消销毁操作。',
            en: 'Confirmation text did not match. Destroy action was cancelled.',
            ja: '確認テキストが一致しなかったため、削除を中止しました。',
            ko: '확인 문구가 일치하지 않아 삭제가 취소되었습니다.',
          }));
          return;
        }

        path = `/api/v1/services/${serviceId}/server`;
        method = 'DELETE';
      } else if (action === 'reinstall') {
        const reinstallPasswordError = validateStrongServicePassword(reinstallPassword, locale);
        if (reinstallPasswordError) {
          setServerActionError(reinstallPasswordError);
          return;
        }

        if (!reinstallReady) {
          setServerActionError(
            localizeMessage(locale, {
              zh: '请先选择操作系统后再提交重装任务。',
              en: 'Please choose an operating system before submitting reinstall.',
              ja: '再インストール実行前に OS を選択してください。',
              ko: '재설치 작업을 제출하기 전에 운영체제를 먼저 선택해 주세요.',
            }),
          );
          return;
        }

        const market = reinstallMarketData?.data ?? null;
        const resolvedSelection = market
          ? resolveMarketplaceSelection(
            market.primaryApps,
            market.addonApps,
            reinstallPrimaryAppChoice.trim() || null,
            reinstallAddonAppChoices,
          )
          : {
            primarySlug: reinstallPrimaryAppChoice.trim() || null,
            addonSlugs: trimUnique(reinstallAddonAppChoices),
            error: null,
          };

        if (resolvedSelection.error) {
          setServerActionError(resolvedSelection.error);
          return;
        }

        if (market?.rules.primaryRequired && !resolvedSelection.primarySlug) {
          setServerActionError(localizeMessage(locale, {
            zh: '当前配置要求至少选择 1 个主应用后才能重装。',
            en: 'This configuration requires one primary app before reinstall.',
            ja: 'この構成では再インストール前に主アプリを 1 つ選択する必要があります。',
            ko: '현재 구성에서는 재설치 전에 기본 앱을 1개 선택해야 합니다.',
          }));
          return;
        }

        const confirmed = window.confirm(localizeMessage(locale, {
          zh: '重装会重建系统盘并重新部署所选应用，现有系统数据可能丢失。是否继续？',
          en: 'Reinstall rebuilds the system disk and redeploys the selected apps. Existing system data may be lost. Continue?',
          ja: '再インストールではシステムディスクを再構築し、選択したアプリを再展開します。既存データが失われる可能性があります。続行しますか？',
          ko: '재설치는 시스템 디스크를 다시 만들고 선택한 앱을 재배포합니다. 기존 데이터가 손실될 수 있습니다. 계속하시겠습니까?',
        }));
        if (!confirmed) {
          return;
        }

        path = `/api/v1/services/${serviceId}/server/reinstall`;
        body = {
          selectedOs: effectiveReinstallOs,
          primaryAppSlug: resolvedSelection.primarySlug,
          addonAppSlugs: resolvedSelection.addonSlugs,
          ...(reinstallPassword.trim() !== '' ? { accountPassword: reinstallPassword.trim() } : {}),
          startOnCompletion: reinstallStartOnCompletion,
        };
      } else if (action === 'reveal-password') {
        const requestedPassword = options?.customPassword?.trim() ?? '';
        const passwordError = validateStrongServicePassword(requestedPassword, locale);
        if (passwordError) {
          setServerActionError(passwordError);
          return;
        }

        const confirmed = window.confirm(localizeMessage(locale, {
          zh: requestedPassword.length > 0
            ? '将按你输入的新密码重置服务器密码。是否继续？'
            : '该操作会生成并重置服务器密码。是否继续？',
          en: requestedPassword.length > 0
            ? 'This will reset the server password to your custom value. Continue?'
            : 'This will generate a new password and reset the server. Continue?',
          ja: requestedPassword.length > 0
            ? '入力したカスタム値でサーバーパスワードを再設定します。続行しますか？'
            : '新しいパスワードを生成してサーバーを再設定します。続行しますか？',
          ko: requestedPassword.length > 0
            ? '입력한 사용자 지정 값으로 서버 비밀번호를 재설정합니다. 계속하시겠습니까?'
            : '새 비밀번호를 생성하여 서버 비밀번호를 재설정합니다. 계속하시겠습니까?',
        }));
        if (!confirmed) {
          return;
        }

        path = `/api/v1/services/${serviceId}/server/reveal-password`;
        body = {
          reset: true,
          ...(requestedPassword.length > 0 ? { password: requestedPassword } : {}),
          autoRestart: options?.autoRestart ?? serverPasswordAutoRestart,
        };
      } else {
        throw new Error(localizeMessage(locale, {
          zh: '未识别的服务器操作类型。',
          en: 'Unrecognized server action.',
          ja: 'サーバー操作タイプを認識できません。',
          ko: '알 수 없는 서버 작업 유형입니다.',
        }));
      }

      const response = await requestJson<ActionResponse<Record<string, unknown>>>(path, {
        method,
        body,
      });
      const responseRecord = asRecord(response.data);
      const upstreamMessage =
        typeof responseRecord.message === 'string' && responseRecord.message.trim() !== ''
          ? responseRecord.message.trim()
          : null;
      const operationHint = response.actionResult?.operationId ? ` ${ui.common.operationId}: ${response.actionResult.operationId}` : '';
      const passwordReset = responseRecord.passwordReset === true || responseRecord.password_reset === true;
      const restartRequired = pickBoolean(responseRecord, ['restartRequired', 'restart_required']) ?? false;
      const appliedLive = pickBoolean(responseRecord, ['appliedLive', 'applied_live']) ?? false;
      const restartRequested = pickBoolean(responseRecord, ['restartRequested', 'restart_requested']) ?? false;
      const restartAccepted = pickBoolean(responseRecord, ['restartAccepted', 'restart_accepted']) ?? false;
      const restartMessage = pickString(responseRecord, ['restartMessage', 'restart_message']);
      const loginUsername = pickString(responseRecord, ['loginUsername', 'login_username']);
      const passwordNote = pickString(responseRecord, ['note', 'passwordNote', 'password_note']);
      setPasswordRestartSuggested(passwordReset && restartRequired && !restartAccepted);
      const localizedMessage = {
        start: localizeMessage(locale, {
          zh: '开机指令已提交。',
          en: 'Start command submitted.',
          ja: '起動コマンドを送信しました。',
          ko: '시작 명령이 제출되었습니다.',
        }),
        stop: localizeMessage(locale, {
          zh: '关机指令已提交。',
          en: 'Stop command submitted.',
          ja: '停止コマンドを送信しました。',
          ko: '중지 명령이 제출되었습니다.',
        }),
        restart: localizeMessage(locale, {
          zh: '重启指令已提交。',
          en: 'Restart command submitted.',
          ja: '再起動コマンドを送信しました。',
          ko: '재시작 명령이 제출되었습니다.',
        }),
        suspend: localizeMessage(locale, {
          zh: '暂停指令已提交。',
          en: 'Suspend command submitted.',
          ja: '停止指示を送信しました。',
          ko: '일시중지 명령이 제출되었습니다.',
        }),
        unsuspend: localizeMessage(locale, {
          zh: '恢复指令已提交。',
          en: 'Unsuspend command submitted.',
          ja: '再開指示を送信しました。',
          ko: '재개 명령이 제출되었습니다.',
        }),
        destroy: localizeMessage(locale, {
          zh: '销毁任务已提交。',
          en: 'Destroy task submitted.',
          ja: '削除リクエストを送信しました。',
          ko: '삭제 작업이 제출되었습니다.',
        }),
        reinstall: localizeMessage(locale, {
          zh: '重装任务已提交，系统将在后台执行。',
          en: 'Reinstall task submitted. The system will process reinstall in background.',
          ja: '再インストールタスクを送信しました。バックグラウンドで処理されます。',
          ko: '재설치 작업이 제출되었습니다. 백그라운드에서 처리됩니다.',
        }),
        'reveal-password': (() => {
          if (!passwordReset) {
            return localizeMessage(locale, {
              zh: '已读取最近一次保存的密码。',
              en: 'The most recently stored password has been retrieved.',
              ja: '最新で保存されたパスワードを取得しました。',
              ko: '최근 저장된 비밀번호를 조회했습니다.',
            });
          }

          if (restartRequired) {
            return restartAccepted
              ? localizeMessage(locale, {
                zh: '新密码已下发并保存，系统已自动提交重启请求以使密码生效。',
                en: 'A new password has been pushed upstream and stored. An automatic restart request was submitted so the password can take effect.',
                ja: '新しいパスワードを保存し、反映のため再起動リクエストを自動送信しました。',
                ko: '새 비밀번호를 저장했고 적용을 위해 자동 재시작 요청을 제출했습니다.',
              })
              : localizeMessage(locale, {
                zh: '新密码已下发并保存。当前模板未能在虚拟机内实时改密，需要重启服务器后才会生效。',
                en: 'A new password has been pushed upstream and stored. This template could not apply it live inside the VM, so a server restart is required before it takes effect.',
                ja: '新しいパスワードは保存されましたが、テンプレート制限により即時反映できません。サーバー再起動後に有効になります。',
                ko: '새 비밀번호는 저장되었지만 템플릿 제약으로 즉시 적용되지 않았습니다. 서버 재시작 후 적용됩니다.',
              });
          }

          if (appliedLive) {
            return localizeMessage(locale, {
              zh: '新密码已实时下发并保存，不需要重启服务器。',
              en: 'A new password has been applied live and stored. No restart is required.',
              ja: '新しいパスワードは即時適用・保存済みです。再起動は不要です。',
              ko: '새 비밀번호가 실시간으로 적용 및 저장되었습니다. 재시작이 필요하지 않습니다.',
            });
          }

          return localizeMessage(locale, {
            zh: '新密码已下发并保存。',
            en: 'A new password has been pushed upstream and stored.',
            ja: '新しいパスワードを保存しました。',
            ko: '새 비밀번호가 저장되었습니다.',
          });
        })(),
      } as const;

      if (action === 'reveal-password') {
        const password = extractRevealedPassword(responseRecord);
        if (!password) {
          setServerActionError(localizeMessage(locale, {
            zh: '后端未返回可用密码，请稍后重试。',
            en: 'Backend did not return a usable password. Please retry later.',
            ja: 'バックエンドが利用可能なパスワードを返しませんでした。後でもう一度お試しください。',
            ko: '백엔드에서 유효한 비밀번호를 반환하지 않았습니다. 잠시 후 다시 시도해 주세요.',
          }));
        } else {
          setRevealedPassword(password);
          setServerPasswordDraft('');
        }
      }

      const displayMessage = upstreamMessage
        ? `${localizedMessage[action]} ${localizeMessage(locale, {
          zh: `（网关返回：${upstreamMessage}）`,
          en: `(upstream: ${upstreamMessage})`,
          ja: `（上流応答: ${upstreamMessage}）`,
          ko: `(업스트림 응답: ${upstreamMessage})`,
        })}${operationHint}`
        : `${localizedMessage[action]}${operationHint}`;
      const detailParts = [
        loginUsername ? localizeMessage(locale, {
          zh: `建议登录用户名：${loginUsername}`,
          en: `Suggested login username: ${loginUsername}`,
          ja: `推奨ログインユーザー名: ${loginUsername}`,
          ko: `권장 로그인 사용자명: ${loginUsername}`,
        }) : null,
        restartRequested && restartMessage ? restartMessage : null,
        passwordNote,
      ].filter((entry): entry is string => Boolean(entry && entry.trim() !== ''));

      setServerMessage(detailParts.length > 0 ? `${displayMessage} ${detailParts.join(' ')}` : displayMessage);
      refreshPageState();
      if (action !== 'reveal-password') {
        refreshPageState(1200);
      }
    } catch (caughtError) {
      const normalized = toFriendlyError(caughtError as ApiError, locale);
      setServerActionError(friendlyServerError(normalized, locale));
      refreshPageState();
    } finally {
      setServerBusy(null);
    }
  }

  async function revokeCancellation() {
    if (!serviceId) return;
    setRevokingCancellation(true);
    setMessage(null);
    setActionError(null);
    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(`/api/v1/services/${serviceId}/cancel`, {
        method: 'DELETE',
      });
      const operationHint = response.actionResult?.operationId ? ` ${ui.common.operationId}: ${response.actionResult.operationId}` : '';
      const resolvedMessage = localizeBackendMessage(response.message, locale) || ui.services.cancellationRevoked;
      setMessage(`${resolvedMessage}${operationHint}`);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setRevokingCancellation(false);
    }
  }

  const runtimeSnapshot = runtimeData?.data.runtime ?? null;
  const runtimeCapabilities = runtimeData?.data.capabilities ?? null;

  const managedRuntimeDetails = useMemo(() => {
    const runtime = asRecord(runtimeSnapshot);
    const domain = typeof runtime.domain === 'string' ? runtime.domain : '';
    const tlsStatus = typeof runtime.tlsStatus === 'string' ? runtime.tlsStatus : '';
    const envJson = typeof runtime.envJson === 'string' ? runtime.envJson : '{}';
    const replicas = Number(runtime.replicas ?? 1);

    return {
      domain,
      tlsStatus,
      envJson,
      replicas: Number.isFinite(replicas) ? Math.max(1, Math.trunc(replicas)) : 1,
    };
  }, [runtimeSnapshot]);

  useEffect(() => {
    if (!isManagedRuntime) {
      return;
    }

    setManagedEnvDraft(() => {
      try {
        const parsed = JSON.parse(managedRuntimeDetails.envJson) as Record<string, unknown>;
        return JSON.stringify(parsed, null, 2);
      } catch {
        return '{}';
      }
    });
    setManagedDomainDraft(managedRuntimeDetails.domain);
    setManagedScaleDraft(String(managedRuntimeDetails.replicas));
  }, [isManagedRuntime, managedRuntimeDetails.domain, managedRuntimeDetails.envJson, managedRuntimeDetails.replicas]);

  useEffect(() => {
    setSelectedAddonSlugs([]);
    setAppsMessage(null);
    setAppsActionError(null);
    setAddonCategoryFilter('all');
    setServerPasswordDraft('');
    setServerPasswordAutoRestart(true);
    setReinstallOsChoice('');
    setReinstallPrimaryAppChoice('');
    setReinstallAddonAppChoices([]);
    setReinstallMarketplaceHint(null);
    setReinstallSelectionInitialized(false);
    setCancelPassword('');
    setRetryProvisioningPassword('');
    setSelectedUpgradeProductId('');
    setSelectedUpgradeConfig({});
    setShowReinstallComposer(false);
    setShowAddonInstaller(false);
    setShowBillingActions(false);
  }, [serviceId]);

  useEffect(() => {
    const availableSlugs = new Set(
      (serviceAppsData?.data.catalog?.addonApps ?? [])
        .filter((app) => app.allowOnExistingService)
        .map((app) => app.slug),
    );

    setSelectedAddonSlugs((current) => current.filter((slug) => availableSlugs.has(slug)));
  }, [serviceAppsData]);

  useEffect(() => {
    if (isManagedRuntime || reinstallSelectionInitialized) {
      return;
    }

    const supportedOs = productData?.data?.vpsAppMarketplace?.supportedOs ?? [];
    const fallbackOs = serviceAppsData?.data.selectedOs?.trim() || supportedOs[0]?.value || '';
    if (!fallbackOs) {
      return;
    }

    setReinstallOsChoice(fallbackOs);
    setReinstallPrimaryAppChoice(serviceAppsData?.data.primaryAppSlug ?? '');
    setReinstallAddonAppChoices(trimUnique(serviceAppsData?.data.addonAppSlugs ?? []));
    setReinstallSelectionInitialized(true);
  }, [
    isManagedRuntime,
    productData?.data.vpsAppMarketplace?.supportedOs,
    reinstallSelectionInitialized,
    serviceAppsData?.data.addonAppSlugs,
    serviceAppsData?.data.primaryAppSlug,
    serviceAppsData?.data.selectedOs,
  ]);

  useEffect(() => {
    const market = reinstallMarketData?.data;
    if (isManagedRuntime || !market) {
      return;
    }

    const resolved = resolveMarketplaceSelection(
      market.primaryApps,
      market.addonApps,
      reinstallPrimaryAppChoice.trim() || null,
      reinstallAddonAppChoices,
    );

    if (resolved.error) {
      setReinstallMarketplaceHint(resolved.error);
      return;
    }

    const autoAdded = resolved.addonSlugs.filter((slug) => !reinstallAddonAppChoices.includes(slug));
    const autoPrimary = resolved.primarySlug && resolved.primarySlug !== (reinstallPrimaryAppChoice.trim() || null)
      ? resolved.primarySlug
      : null;

    if (autoPrimary || autoAdded.length > 0) {
      const hints = [
        autoPrimary
          ? localizeMessage(locale, {
            zh: `已自动选择主应用 ${autoPrimary}`,
            en: `Primary app ${autoPrimary} was selected automatically.`,
            ja: `主アプリ ${autoPrimary} を自動選択しました。`,
            ko: `기본 앱 ${autoPrimary} 이(가) 자동 선택되었습니다.`,
          })
          : null,
        autoAdded.length > 0
          ? localizeMessage(locale, {
            zh: `已自动补齐依赖：${autoAdded.join(', ')}`,
            en: `Dependencies were added automatically: ${autoAdded.join(', ')}`,
            ja: `依存関係を自動追加しました: ${autoAdded.join(', ')}`,
            ko: `의존성이 자동 추가되었습니다: ${autoAdded.join(', ')}`,
          })
          : null,
      ].filter((entry): entry is string => Boolean(entry));

      setReinstallMarketplaceHint(hints.join(' '));
    } else {
      setReinstallMarketplaceHint(null);
    }

    const normalizedPrimary = resolved.primarySlug ?? '';
    const normalizedAddons = resolved.addonSlugs;

    if (normalizedPrimary !== reinstallPrimaryAppChoice) {
      setReinstallPrimaryAppChoice(normalizedPrimary);
    }

    if (normalizedAddons.join('|') !== reinstallAddonAppChoices.join('|')) {
      setReinstallAddonAppChoices(normalizedAddons);
    }
  }, [
    isManagedRuntime,
    locale,
    reinstallAddonAppChoices,
    reinstallMarketData,
    reinstallPrimaryAppChoice,
  ]);

  useEffect(() => {
    if (reinstallMarketplaceHint || reinstallMarketError) {
      setShowReinstallComposer(true);
    }
  }, [reinstallMarketError, reinstallMarketplaceHint]);

  useEffect(() => {
    if (selectedAddonSlugs.length > 0 || appsActionError) {
      setShowAddonInstaller(true);
    }
  }, [appsActionError, selectedAddonSlugs.length]);

  async function runManagedAction(action: 'restart' | 'delete') {
    if (!serviceId) return;

    setManagedBusy(action);
    setManagedActionError(null);
    setManagedMessage(null);

    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(
        `/api/v1/services/${serviceId}/runtime/actions/${encodeURIComponent(action)}`,
        {
          method: 'POST',
          body: {
            payload: {},
          },
        },
      );

      const operationHint = response.actionResult?.operationId ? ` ${ui.common.operationId}: ${response.actionResult.operationId}` : '';
      const fallback = action === 'restart'
        ? localizeMessage(locale, {
          zh: '应用重启指令已提交。',
          en: 'Application restart submitted.',
          ja: 'アプリ再起動リクエストを送信しました。',
          ko: '애플리케이션 재시작 요청이 제출되었습니다.',
        })
        : localizeMessage(locale, {
          zh: '实例删除指令已提交。',
          en: 'Instance deletion submitted.',
          ja: 'インスタンス削除リクエストを送信しました。',
          ko: '인스턴스 삭제 요청이 제출되었습니다.',
        });

      setManagedMessage(`${localizeBackendMessage(response.message, locale) || fallback}${operationHint}`);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setManagedActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setManagedBusy(null);
    }
  }

  async function saveManagedEnv() {
    if (!serviceId) return;

    const parsedDraft = parseManagedEnvDraft(managedEnvDraft);
    if (!parsedDraft.valid) {
      setManagedActionError(localizeMessage(locale, {
        zh: '环境变量 JSON 格式不正确。',
        en: 'Environment variables JSON is invalid.',
        ja: '環境変数 JSON の形式が正しくありません。',
        ko: '환경 변수 JSON 형식이 올바르지 않습니다.',
      }));
      return;
    }

    const parsed = Object.fromEntries(
      Object.entries(parsedDraft.value).map(([key, value]) => [key, String(value ?? '')]),
    );

    setManagedBusy('env');
    setManagedActionError(null);
    setManagedMessage(null);

    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(
        `/api/v1/services/${serviceId}/runtime/env`,
        {
          method: 'PATCH',
          body: {
            env: parsed,
          },
        },
      );
      const operationHint = response.actionResult?.operationId ? ` ${ui.common.operationId}: ${response.actionResult.operationId}` : '';
      setManagedMessage(`${localizeBackendMessage(response.message, locale) || localizeMessage(locale, {
        zh: '环境变量已更新。',
        en: 'Environment variables updated.',
        ja: '環境変数を更新しました。',
        ko: '환경 변수를 업데이트했습니다.',
      })}${operationHint}`);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setManagedActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setManagedBusy(null);
    }
  }

  async function saveManagedDomain() {
    if (!serviceId) return;

    const domain = managedDomainDraft.trim();
    if (!domain) {
      setManagedActionError(localizeMessage(locale, {
        zh: '请输入域名。',
        en: 'Please enter a domain name.',
        ja: 'ドメイン名を入力してください。',
        ko: '도메인명을 입력해 주세요.',
      }));
      return;
    }

    setManagedBusy('domain');
    setManagedActionError(null);
    setManagedMessage(null);

    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(
        `/api/v1/services/${serviceId}/runtime/domain`,
        {
          method: 'POST',
          body: {
            domain,
          },
        },
      );
      const operationHint = response.actionResult?.operationId ? ` ${ui.common.operationId}: ${response.actionResult.operationId}` : '';
      setManagedMessage(`${localizeBackendMessage(response.message, locale) || localizeMessage(locale, {
        zh: '域名绑定已提交。',
        en: 'Domain binding submitted.',
        ja: 'ドメイン紐付けを送信しました。',
        ko: '도메인 연결 요청이 제출되었습니다.',
      })}${operationHint}`);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setManagedActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setManagedBusy(null);
    }
  }

  async function enableManagedTls() {
    if (!serviceId) return;

    const domain = managedDomainDraft.trim() || managedRuntimeDetails.domain;
    if (!domain) {
      setManagedActionError(localizeMessage(locale, {
        zh: '请先绑定域名再开启 HTTPS。',
        en: 'Bind a domain before enabling HTTPS.',
        ja: 'HTTPS を有効化する前にドメインを紐付けてください。',
        ko: 'HTTPS를 활성화하기 전에 도메인을 먼저 연결해 주세요.',
      }));
      return;
    }

    setManagedBusy('tls');
    setManagedActionError(null);
    setManagedMessage(null);

    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(
        `/api/v1/services/${serviceId}/runtime/tls`,
        {
          method: 'POST',
          body: {
            domain,
          },
        },
      );
      const operationHint = response.actionResult?.operationId ? ` ${ui.common.operationId}: ${response.actionResult.operationId}` : '';
      setManagedMessage(`${localizeBackendMessage(response.message, locale) || localizeMessage(locale, {
        zh: 'HTTPS 配置已提交。',
        en: 'HTTPS configuration submitted.',
        ja: 'HTTPS 設定を送信しました。',
        ko: 'HTTPS 설정이 제출되었습니다.',
      })}${operationHint}`);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setManagedActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setManagedBusy(null);
    }
  }

  async function scaleManagedRuntime() {
    if (!serviceId) return;

    const replicas = Number(managedScaleDraft);
    if (!Number.isFinite(replicas) || replicas < 1) {
      setManagedActionError(localizeMessage(locale, {
        zh: '扩容副本数必须是大于 0 的整数。',
        en: 'Replica count must be an integer greater than 0.',
        ja: 'レプリカ数は 0 より大きい整数である必要があります。',
        ko: '레플리카 수는 0보다 큰 정수여야 합니다.',
      }));
      return;
    }

    setManagedBusy('scale');
    setManagedActionError(null);
    setManagedMessage(null);

    try {
      const response = await requestJson<ActionResponse<Record<string, unknown>>>(
        `/api/v1/services/${serviceId}/runtime/scale`,
        {
          method: 'POST',
          body: {
            replicas: Math.trunc(replicas),
          },
        },
      );
      const operationHint = response.actionResult?.operationId ? ` ${ui.common.operationId}: ${response.actionResult.operationId}` : '';
      setManagedMessage(`${localizeBackendMessage(response.message, locale) || localizeMessage(locale, {
        zh: '扩容请求已提交。',
        en: 'Scaling request submitted.',
        ja: 'スケールリクエストを送信しました。',
        ko: '스케일 요청이 제출되었습니다.',
      })}${operationHint}`);
      refreshPageState();
      refreshPageState(1200);
    } catch (caughtError) {
      setManagedActionError(toFriendlyError(caughtError as ApiError, locale));
      refreshPageState();
    } finally {
      setManagedBusy(null);
    }
  }

  const serverCapabilities: ConvoyCapabilities = useMemo(() => {
    if (!serverData?.data.capabilities) {
      return {
        application: {
          read: false,
          console: false,
          patch: false,
          build: false,
          firewall: false,
          suspend: false,
          unsuspend: false,
          destroy: false,
        },
        actionBridge: {
          power: false,
          reinstall: false,
          revealPassword: false,
        },
      };
    }

    return serverData.data.capabilities;
  }, [serverData]);
  const firewallOptions = firewallData?.data.options ?? null;
  const firewallRules = firewallData?.data.rules ?? [];
  const firewallRuleCount = firewallRules.length;
  const canManageFirewall = Boolean(serverCapabilities.application.firewall && (firewallData?.data.capabilities.update ?? true));
  const runtimeOverview = runtimeOverviewData?.data.overview ?? null;
  const runtimeMetrics = runtimeMetricsData?.data.metrics ?? null;
  const runtimeOverviewStatus = runtimeOverviewData?.data.status ?? null;
  const runtimeOverviewReason = runtimeOverviewData?.data.reason ?? null;
  const runtimeMetricsStatus = runtimeMetricsData?.data.status ?? null;
  const runtimeMetricsReason = runtimeMetricsData?.data.reason ?? null;
  const runtimeStateFallback = fallbackRuntimeState(runtimeOverviewStatus, runtimeOverviewError);
  const runtimeTelemetryMessage = useMemo(() => {
    const overviewMessage = friendlyRuntimeTelemetryStatus(
      runtimeOverviewStatus,
      runtimeOverviewReason,
      runtimeOverviewError,
      locale,
    );
    if (overviewMessage) {
      return overviewMessage;
    }

    return friendlyRuntimeTelemetryStatus(
      runtimeMetricsStatus,
      runtimeMetricsReason,
      runtimeMetricsError,
      locale,
    );
  }, [
    locale,
    runtimeMetricsError,
    runtimeMetricsReason,
    runtimeMetricsStatus,
    runtimeOverviewError,
    runtimeOverviewReason,
    runtimeOverviewStatus,
  ]);
  const runtimeTelemetryUnavailable = runtimeTelemetryMessage !== null;

  const convoyState = useMemo(() => {
    const convoy = asRecord(serverData?.data.convoy);
    const canUseSnapshotTelemetry = !runtimeTelemetryUnavailable;
    const resolvedAddresses = collectConvoyAddresses(convoy);
    const inboundBytes = pickNumber(convoy, [
      'resource_usage.network_rx_bytes',
      'usage.network_rx_bytes',
      'stats.network_rx_bytes',
      'attributes.metrics.network_rx_bytes',
      'usages.bandwidth.inbound_bytes',
      'usages.bandwidth.rx_bytes',
      'usages.bandwidth.in',
      'network.inbound_bytes',
      'network.rx_bytes',
    ]);
    const outboundBytes = pickNumber(convoy, [
      'resource_usage.network_tx_bytes',
      'usage.network_tx_bytes',
      'stats.network_tx_bytes',
      'attributes.metrics.network_tx_bytes',
      'usages.bandwidth.outbound_bytes',
      'usages.bandwidth.tx_bytes',
      'usages.bandwidth.out',
      'network.outbound_bytes',
      'network.tx_bytes',
    ]);
    const totalBandwidthBytes = pickNumber(convoy, [
      'usages.bandwidth.total_bytes',
      'usages.bandwidth.total',
      'limits.bandwidth',
      'bandwidth_limit',
    ]);

    return {
      serverRef: serverData?.data?.mapping?.serverRef ?? '-',
      state: runtimeOverview?.powerState
        ?? runtimeStateFallback
        ?? (canUseSnapshotTelemetry ? pickString(convoy, ['status', 'state', 'power_state', 'attributes.status']) : null)
        ?? '-',
      ip: runtimeOverview?.primaryIp ?? resolvedAddresses[0] ?? '-',
      ips: resolvedAddresses,
      cpu: formatPercent(runtimeOverview?.cpuUsed ?? (
        canUseSnapshotTelemetry
          ? pickNumber(convoy, [
            'resource_usage.cpu',
            'usage.cpu',
            'stats.cpu',
            'attributes.metrics.cpu',
            'limits.cpu',
          ])
          : null
      )),
      memory: runtimeOverview?.memoryUsed !== null && runtimeOverview?.memoryUsed !== undefined && runtimeOverview?.memoryTotal
        ? `${formatBytes(runtimeOverview.memoryUsed)} / ${formatBytes(runtimeOverview.memoryTotal)}`
        : formatBytes(
          canUseSnapshotTelemetry
            ? pickNumber(convoy, ['resource_usage.memory_bytes', 'usage.memory_bytes', 'stats.memory_bytes', 'attributes.metrics.memory_bytes', 'limits.memory'])
            : null,
        ),
      disk: runtimeMetrics?.diskUsed !== null && runtimeMetrics?.diskUsed !== undefined && runtimeMetrics?.diskTotal
        ? `${formatBytes(runtimeMetrics.diskUsed)} / ${formatBytes(runtimeMetrics.diskTotal)}`
        : formatBytes(
          canUseSnapshotTelemetry
            ? pickNumber(convoy, ['resource_usage.disk_bytes', 'usage.disk_bytes', 'stats.disk_bytes', 'attributes.metrics.disk_bytes', 'limits.disk'])
            : null,
        ),
      bandwidth: formatBytes(runtimeMetrics?.rxBytes ?? (canUseSnapshotTelemetry ? (inboundBytes ?? totalBandwidthBytes) : null)),
      traffic: formatBytes(runtimeMetrics?.txBytes ?? (canUseSnapshotTelemetry ? (outboundBytes ?? totalBandwidthBytes) : null)),
      locked: pickBoolean(convoy, ['locked', 'attributes.locked']),
      uptime: runtimeOverview?.uptime ?? null,
      node: runtimeOverview?.node ?? null,
      hostname: runtimeOverview?.hostname ?? null,
      operatingSystem: runtimeOverview?.operatingSystem ?? null,
      txBytes: runtimeMetrics?.txBytes ?? (canUseSnapshotTelemetry ? outboundBytes : null) ?? null,
      bandwidthLimit: runtimeMetrics?.bandwidthLimit ?? (canUseSnapshotTelemetry ? totalBandwidthBytes : null) ?? null,
    };
  }, [runtimeMetrics, runtimeOverview, runtimeStateFallback, runtimeTelemetryUnavailable, serverData]);

  const serviceApps = serviceAppsData?.data ?? null;
  const installRecords = asArray<ServiceAppsResponse['data']['installs'][number]>(serviceApps?.installs);
  const currentPrimaryInstall = installRecords.find((install) => install.isPrimary) ?? null;
  const currentAddonInstalls = installRecords.filter((install) => !install.isPrimary);
  const installedAddonSlugs = new Set(
    currentAddonInstalls
      .map((install) => install.app?.slug ?? '')
      .filter((slug) => slug.length > 0),
  );
  const availableAddonCatalog = asArray<NonNullable<ServiceAppsResponse['data']['catalog']>['addonApps'][number]>(serviceApps?.catalog?.addonApps)
    .filter((app) => app.allowOnExistingService && !installedAddonSlugs.has(app.slug));
  const addonCategoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const app of availableAddonCatalog) {
      const slug = app.category?.slug?.trim() || 'uncategorized';
      const name = app.category?.name?.trim()
        || (locale.startsWith('zh') ? '未分类' : 'Uncategorized');
      map.set(slug, name);
    }
    return [
      { slug: 'all', name: locale.startsWith('zh') ? '全部组件' : 'All components' },
      ...[...map.entries()].map(([slug, name]) => ({ slug, name })),
    ];
  }, [availableAddonCatalog, locale]);
  const visibleAddonCatalog = useMemo(() => {
    if (addonCategoryFilter === 'all') {
      return availableAddonCatalog;
    }
    return availableAddonCatalog.filter((app) => (app.category?.slug ?? 'uncategorized') === addonCategoryFilter);
  }, [addonCategoryFilter, availableAddonCatalog]);
  useEffect(() => {
    if (addonCategoryFilter === 'all') {
      return;
    }
    if (!addonCategoryOptions.some((item) => item.slug === addonCategoryFilter)) {
      setAddonCategoryFilter('all');
    }
  }, [addonCategoryFilter, addonCategoryOptions]);

  useEffect(() => {
    const products = asArray<ServiceUpgradeProduct>(upgradeOptionsData?.data.products);
    if (products.length === 0) {
      setSelectedUpgradeProductId('');
      setSelectedUpgradeConfig({});
      return;
    }

    const defaultProduct = products.find((product) => product.current) ?? products[0];
    setSelectedUpgradeProductId((current) => (current && products.some((product) => String(product.id) === current)
      ? current
      : String(defaultProduct.id)));
  }, [upgradeOptionsData?.data.products]);

  useEffect(() => {
    if (!selectedUpgradeProductId) {
      return;
    }

    const products = asArray<ServiceUpgradeProduct>(upgradeOptionsData?.data.products);
    const product = products.find((entry) => String(entry.id) === selectedUpgradeProductId);
    if (!product) {
      setSelectedUpgradeConfig({});
      return;
    }

    const defaults: Record<string, string> = {};
    for (const option of asArray<ServiceUpgradeOption>(product.config_options)) {
      const optionId = String(option.id);
      const selectedValue = product.selected_config?.[optionId] ?? product.selected_config?.[Number(option.id)] ?? null;
      if (selectedValue !== null && selectedValue !== undefined && String(selectedValue).trim() !== '') {
        defaults[optionId] = String(selectedValue);
        continue;
      }

      const firstChoice = asArray<ServiceUpgradeOptionChoice>(option.children)[0];
      if (firstChoice) {
        defaults[optionId] = String(firstChoice.id);
      }
    }
    setSelectedUpgradeConfig(defaults);
  }, [selectedUpgradeProductId, upgradeOptionsData?.data.products]);

  const recentOperationLogs = asArray<ServiceOperationLogSummary>(operationLogData?.data.logs);
  const compactOperationLogs = useMemo<CompactOperationLog[]>(() => recentOperationLogs.map((log) => {
    const localizedMessage = localizeBackendMessage(log.message, locale) || log.message || null;
    const localizedDetail = log.detail && log.detail !== log.message
      ? (localizeBackendMessage(log.detail, locale) || log.detail)
      : null;
    const showCode = Boolean(log.code) && !shouldHideOperationCodeOnSuccess(log.code, log.success ?? null);
    const message = localizedMessage
      ?? (showCode
        ? null
        : localizeMessage(locale, {
          zh: '命令已提交，系统正在执行。',
          en: 'Command submitted and queued for execution.',
          ja: 'コマンドを送信し、実行待ちになっています。',
          ko: '명령이 제출되어 실행 대기 중입니다.',
        }));

    return {
      id: log.operationId || log.id,
      actionLabel: uiOperationActionLabel(log.action, locale),
      outcomeLabel: uiOperationOutcomeLabel(log.success ?? null, locale),
      outcomeClassName: log.success === true ? 'status-active' : log.success === false ? 'status-cancelled' : 'status-pending',
      timestampLabel: formatDate(log.createdAt),
      operationId: log.operationId ?? null,
      message,
      detail: localizedDetail,
      code: log.code ?? null,
      showCode,
      success: log.success ?? null,
    };
  }), [formatDate, locale, recentOperationLogs]);
  const highlightedOperationLogs = useMemo<CompactOperationLog[]>(() => {
    const failed = compactOperationLogs.filter((log) => log.success === false);
    const others = compactOperationLogs.filter((log) => log.success !== false);
    return [...failed, ...others].slice(0, 3);
  }, [compactOperationLogs]);

  if (loading) {
    return <div className="loading-card">{text.common.loading}</div>;
  }

  if (!serviceId) {
    return <div className="error-card">{locale.startsWith('zh') ? '缺少服务编号。' : 'Missing service id.'}</div>;
  }

  if (error || !data) {
    return <div className="error-card">{text.common.error}: {toFriendlyError(new Error(error ?? ''), locale)}</div>;
  }

  const service = data.data.service;
  const invoices = asArray<ServiceResponse['data']['invoices'][number]>(data.data.invoices);
  const serviceProductLine = productLineFor(service.product?.category?.slug, service.product?.slug);
  const provisioning = provisioningData?.data.latest ?? service.provisioning ?? null;
  const provisioningStatus = (provisioning?.status ?? '').toLowerCase();
  const provisioningSucceeded = ['success', 'completed', 'ready'].includes(provisioningStatus);
  const provisioningFailed = isProvisioningFailedStatus(provisioningStatus);
  const showProvisioningErrorDetails = !provisioningSucceeded;
  const provisioningCanRetry = provisioningFailed;
  const provisioningCanStart = provisioningStatus === '' || provisioning === null;
  const provisioningInFlight = isProvisioningInFlightStatus(provisioningStatus);
  const serviceStatus = (service.status ?? '').toLowerCase();
  const serviceCancellation = service.cancellation ?? null;
  const serviceDisplayStatus = serviceCancellation
    ? 'cancelled'
    : provisioningFailed
      ? 'failed'
      : provisioningInFlight
        ? 'pending'
        : service.status;
  const serviceDisplayStatusLabel = serviceCancellation
    ? localizeMessage(locale, {
      zh: '已申请取消',
      en: 'Cancellation scheduled',
      ja: '解約予定',
      ko: '해지 예약됨',
    })
    : provisioningFailed
      ? uiRuntimeStatusLabel('failed', locale)
      : provisioningInFlight
        ? uiRuntimeStatusLabel(provisioningStatus || 'pending', locale)
        : uiServiceStatusLabel(service.status, locale);
  const serviceLifecycleStatusLabel = serviceDisplayStatus === 'active'
    ? localizeMessage(locale, {
      zh: '服务有效',
      en: 'Service active',
      ja: 'サービス有効',
      ko: '서비스 활성',
    })
    : serviceDisplayStatusLabel;
  const hasPendingInvoice = invoices.some((invoice) => (invoice.status ?? '').toLowerCase() === 'pending');
  const canRenewByPlanType = !['free', 'one-time'].includes((service.plan?.type ?? '').toLowerCase());
  const canRenewByStatus = serviceStatus !== 'cancelled';
  const canRenewService = !provisioningInFlight && canRenewByPlanType && canRenewByStatus && !hasPendingInvoice && !serviceCancellation;
  const canCancelService = service.cancellable && !provisioningInFlight && !serviceCancellation;
  const upgradeProducts = asArray<ServiceUpgradeProduct>(upgradeOptionsData?.data.products);
  const selectedUpgradeProduct = upgradeProducts.find((product) => String(product.id) === selectedUpgradeProductId) ?? null;
  const selectedUpgradeDefaults = selectedUpgradeProduct?.selected_config ?? {};
  const selectedUpgradeOptions = asArray<ServiceUpgradeOption>(selectedUpgradeProduct?.config_options);
  const hasUpgradeConfigChanges = selectedUpgradeOptions.some((option) => {
    const optionId = String(option.id);
    const currentValue = selectedUpgradeConfig[optionId] ?? '';
    const baselineRaw = selectedUpgradeDefaults[optionId] ?? selectedUpgradeDefaults[Number(option.id)] ?? '';
    const baseline = baselineRaw === null || baselineRaw === undefined ? '' : String(baselineRaw);
    return currentValue !== baseline;
  });
  const hasUpgradeTargetChange = Boolean(selectedUpgradeProduct && !selectedUpgradeProduct.current);
  const canUpgradeService = service.upgradable
    && !provisioningInFlight
    && !serviceCancellation
    && selectedUpgradeProduct !== null
    && (hasUpgradeTargetChange || hasUpgradeConfigChanges);
  const hasServerMapping = Boolean(serverData?.data.mapping?.serverRef);
  const canRunServerActions = !isManagedRuntime
    && hasServerMapping
    && !serverLoading
    && !serverError
    && !runtimeTelemetryUnavailable
    && !provisioningInFlight
    && !provisioningCanRetry;
  const canOpenServerConsole = !isManagedRuntime
    && hasServerMapping
    && !serverLoading
    && !serverError
    && !runtimeTelemetryUnavailable
    && serverCapabilities.application.console;

  const reinstallMarket = reinstallMarketData?.data ?? null;
  const reinstallReady = effectiveReinstallOs !== '';
  const reinstallOsOptions = productData?.data?.vpsAppMarketplace?.supportedOs
    ?? reinstallMarket?.supportedOs
    ?? serviceApps?.catalog?.supportedOs
    ?? [];
  const reinstallPrimaryApps = reinstallMarket?.primaryApps ?? [];
  const reinstallAddonApps = reinstallMarket?.addonApps ?? [];
  const reinstallSelectedPrimaryDescriptor = reinstallPrimaryApps
    .find((app) => app.slug === (reinstallPrimaryAppChoice.trim() || null)) ?? null;
  const reinstallSelectedAddonDescriptors = reinstallAddonApps
    .filter((app) => reinstallAddonAppChoices.includes(app.slug));
  const retryProvisioningPasswordError = validateStrongServicePassword(retryProvisioningPassword, locale);
  const reinstallPasswordError = validateStrongServicePassword(reinstallPassword, locale);
  const serverPasswordDraftError = validateStrongServicePassword(serverPasswordDraft, locale);
  const reinstallSelectionError = reinstallMarket
    ? resolveMarketplaceSelection(
      reinstallPrimaryApps,
      reinstallAddonApps,
      reinstallPrimaryAppChoice.trim() || null,
      reinstallAddonAppChoices,
    ).error
    : null;

  const fallbackIp = findServiceValueFromProperties(service, ['ip', 'ip_address', 'public_ip', 'address', 'primary_ip']);
  const fallbackCpu = findServiceValueFromProperties(service, ['cpu', 'vcpu', 'cores']);
  const fallbackMemory = findServiceValueFromProperties(service, ['memory', 'ram']);
  const fallbackDisk = findServiceValueFromProperties(service, ['disk', 'storage']);
  const fallbackBandwidth = findServiceValueFromProperties(service, ['bandwidth', 'network_in', 'inbound_bandwidth']);
  const fallbackTraffic = findServiceValueFromProperties(service, ['traffic', 'network_out', 'outbound_traffic']);
  const storedPassword = findServiceValueFromProperties(service, ['password', 'root_password', 'account_password', 'server_password']);
  const storedPasswordLoginUsername = findServiceValueFromProperties(service, ['password_login_username', 'server_username', 'username']);
  const storedPasswordApplyMode = findServiceValueFromProperties(service, ['password_apply_mode']);
  const storedPasswordRestartRequired = booleanFromString(findServiceValueFromProperties(service, ['password_restart_required']));
  const storedPasswordAppliedLive = booleanFromString(findServiceValueFromProperties(service, ['password_applied_live']));
  const storedPasswordNote = findServiceValueFromProperties(service, ['password_note']);
  const serverStateLabel = serverRuntimeStatusLabel(convoyState.state, locale);
  const effectiveServerStateLabel = isArchivedService
    ? serviceLifecycleStatusLabel
    : serverStateLabel;
  const effectiveServerStateClassName = isArchivedService
    ? uiStatusClassName(serviceDisplayStatus)
    : serverRuntimeStatusClassName(convoyState.state);
  const fallbackIpList = parseIpListFromText(fallbackIp);
  const displayIpList = convoyState.ips.length > 0
    ? convoyState.ips
    : (convoyState.ip !== '-' ? [convoyState.ip] : fallbackIpList);
  const displayIp = displayIpList[0] ?? '-';
  const additionalIps = displayIpList.slice(1);
  const displayCpu = convoyState.cpu !== '-' ? convoyState.cpu : (fallbackCpu ?? '-');
  const displayMemory = convoyState.memory !== '-' ? convoyState.memory : (fallbackMemory ?? '-');
  const displayDisk = convoyState.disk !== '-' ? convoyState.disk : (fallbackDisk ?? '-');
  const displayBandwidth = convoyState.bandwidth !== '-' ? convoyState.bandwidth : (fallbackBandwidth ?? '-');
  const displayTraffic = convoyState.traffic !== '-' ? convoyState.traffic : (fallbackTraffic ?? '-');
  const telemetryDisplayCpu = runtimeTelemetryUnavailable ? '-' : displayCpu;
  const telemetryDisplayMemory = runtimeTelemetryUnavailable ? '-' : displayMemory;
  const telemetryDisplayDisk = runtimeTelemetryUnavailable ? '-' : displayDisk;
  const telemetryDisplayBandwidth = runtimeTelemetryUnavailable ? '-' : displayBandwidth;
  const telemetryDisplayTraffic = runtimeTelemetryUnavailable ? '-' : displayTraffic;
  const displayUptime = formatUptimeSeconds(convoyState.uptime, locale);
  const cpuUsagePercent = normalizeUsagePercent(runtimeOverview?.cpuUsed ?? null);
  const memoryUsagePercent = calculateUsagePercent(runtimeOverview?.memoryUsed ?? null, runtimeOverview?.memoryTotal ?? null);
  const diskUsagePercent = calculateUsagePercent(runtimeMetrics?.diskUsed ?? null, runtimeMetrics?.diskTotal ?? null);
  const trafficUsagePercent = calculateUsagePercent(runtimeMetrics?.bandwidthUsage ?? null, runtimeMetrics?.bandwidthLimit ?? null);
  const telemetryUpdatedAt = runtimeMetrics?.sampledAt ? formatDate(runtimeMetrics.sampledAt) : null;
  const telemetrySampleLabel = runtimeTelemetryUnavailable
    ? serverRuntimeStatusLabel(convoyState.state, locale)
    : (telemetryUpdatedAt ?? (locale.startsWith('zh') ? '等待中' : 'Pending'));
  const lockingStateLabel = convoyState.locked === null
    ? '-'
    : localizeMessage(locale, convoyState.locked
      ? {
        zh: '已锁定',
        en: 'Locked',
        ja: 'ロック中',
        ko: '잠김',
      }
      : {
        zh: '未锁定',
        en: 'Unlocked',
        ja: 'ロックなし',
        ko: '잠금 해제',
      });
  const storedPasswordStatusHint = storedPasswordRestartRequired
    ? localizeMessage(locale, {
      zh: '该密码需要重启服务器后才会在系统里生效。',
      en: 'This password needs a server restart before it becomes active inside the guest OS.',
      ja: 'このパスワードはゲスト OS に反映するために再起動が必要です。',
      ko: '이 비밀번호는 게스트 OS에 적용하려면 서버 재시작이 필요합니다.',
    })
    : storedPasswordAppliedLive
      ? localizeMessage(locale, {
        zh: '该密码已经在系统里实时生效，无需额外重启。',
        en: 'This password has already been applied live inside the guest OS.',
        ja: 'このパスワードはゲスト OS に即時反映済みです。',
        ko: '이 비밀번호는 이미 게스트 OS에 실시간 적용되었습니다.',
      })
      : storedPasswordNote
        ?? localizeMessage(locale, {
          zh: '系统已保存最近一次下发的密码，可用于后续 SSH 或接管登录。',
          en: 'The most recently pushed password has been saved for SSH or takeover access later.',
          ja: '直近で配布したパスワードを保存しており、SSH や引き継ぎログインに使えます。',
          ko: '가장 최근 발급한 비밀번호를 저장해 두었으며, 이후 SSH 또는 인계 접속에 사용할 수 있습니다.',
        });
  const trafficUsageValue = runtimeMetrics?.bandwidthUsage !== null && runtimeMetrics?.bandwidthUsage !== undefined
    ? (
      runtimeMetrics.bandwidthLimit !== null && runtimeMetrics.bandwidthLimit !== undefined
        ? `${formatBytes(runtimeMetrics.bandwidthUsage)} / ${formatBytes(runtimeMetrics.bandwidthLimit)}`
        : formatBytes(runtimeMetrics.bandwidthUsage)
    )
    : '-';
  const telemetryHighlights = [
    {
      key: 'cpu',
      title: 'CPU',
      value: telemetryDisplayCpu,
      percent: cpuUsagePercent,
      detail: cpuUsagePercent !== null
        ? localizeMessage(locale, {
          zh: `当前占用 ${formatPercent(cpuUsagePercent)}`,
          en: `Current load ${formatPercent(cpuUsagePercent)}`,
          ja: `現在の負荷 ${formatPercent(cpuUsagePercent)}`,
          ko: `현재 사용률 ${formatPercent(cpuUsagePercent)}`,
        })
        : localizeMessage(locale, {
          zh: '等待上游遥测数据',
          en: 'Waiting for upstream telemetry',
          ja: '上流テレメトリ待機中',
          ko: '상위 텔레메트리 대기 중',
        }),
      tone: 'cpu',
    },
    {
      key: 'memory',
      title: locale.startsWith('zh') ? '内存' : 'Memory',
      value: telemetryDisplayMemory,
      percent: memoryUsagePercent,
      detail: runtimeOverview?.memoryUsed !== null && runtimeOverview?.memoryUsed !== undefined && runtimeOverview?.memoryTotal
        ? localizeMessage(locale, {
          zh: `已用 ${formatBytes(runtimeOverview.memoryUsed)} / 总量 ${formatBytes(runtimeOverview.memoryTotal)}`,
          en: `Used ${formatBytes(runtimeOverview.memoryUsed)} of ${formatBytes(runtimeOverview.memoryTotal)}`,
          ja: `${formatBytes(runtimeOverview.memoryUsed)} / ${formatBytes(runtimeOverview.memoryTotal)} 使用中`,
          ko: `${formatBytes(runtimeOverview.memoryUsed)} / ${formatBytes(runtimeOverview.memoryTotal)} 사용 중`,
        })
        : localizeMessage(locale, {
          zh: '等待上游遥测数据',
          en: 'Waiting for upstream telemetry',
          ja: '上流テレメトリ待機中',
          ko: '상위 텔레메트리 대기 중',
        }),
      tone: 'memory',
    },
    {
      key: 'disk',
      title: locale.startsWith('zh') ? '磁盘' : 'Disk',
      value: telemetryDisplayDisk,
      percent: diskUsagePercent,
      detail: runtimeMetrics?.diskUsed !== null && runtimeMetrics?.diskUsed !== undefined && runtimeMetrics?.diskTotal
        ? localizeMessage(locale, {
          zh: `已用 ${formatBytes(runtimeMetrics.diskUsed)} / 总量 ${formatBytes(runtimeMetrics.diskTotal)}`,
          en: `Used ${formatBytes(runtimeMetrics.diskUsed)} of ${formatBytes(runtimeMetrics.diskTotal)}`,
          ja: `${formatBytes(runtimeMetrics.diskUsed)} / ${formatBytes(runtimeMetrics.diskTotal)} 使用中`,
          ko: `${formatBytes(runtimeMetrics.diskUsed)} / ${formatBytes(runtimeMetrics.diskTotal)} 사용 중`,
        })
        : localizeMessage(locale, {
          zh: '等待上游遥测数据',
          en: 'Waiting for upstream telemetry',
          ja: '上流テレメトリ待機中',
          ko: '상위 텔레메트리 대기 중',
        }),
      tone: 'disk',
    },
    {
      key: 'traffic',
      title: locale.startsWith('zh') ? '本月流量' : 'Traffic this month',
      value: trafficUsageValue,
      percent: trafficUsagePercent,
      detail: localizeMessage(locale, {
        zh: `入站 ${telemetryDisplayBandwidth} / 出站 ${telemetryDisplayTraffic}`,
        en: `RX ${telemetryDisplayBandwidth} / TX ${telemetryDisplayTraffic}`,
        ja: `受信 ${telemetryDisplayBandwidth} / 送信 ${telemetryDisplayTraffic}`,
        ko: `수신 ${telemetryDisplayBandwidth} / 송신 ${telemetryDisplayTraffic}`,
      }),
      tone: 'traffic',
    },
  ];
  const supportSummaryItems = [
    {
      key: 'serverRef',
      label: ui.runtime.serverRef,
      value: convoyState.serverRef,
      tone: 'default',
    },
    {
      key: 'hostname',
      label: locale.startsWith('zh') ? '主机名' : 'Hostname',
      value: convoyState.hostname ?? '-',
      tone: 'network',
    },
    {
      key: 'lock',
      label: locale.startsWith('zh') ? '锁定状态' : 'Lock state',
      value: lockingStateLabel,
      tone: 'secure',
    },
    {
      key: 'extraIps',
      label: locale.startsWith('zh') ? '附加 IP' : 'Extra IPs',
      value: additionalIps.length > 0
        ? String(additionalIps.length)
        : localizeMessage(locale, {
          zh: '无',
          en: 'None',
          ja: 'なし',
          ko: '없음',
        }),
      tone: 'network',
    },
  ];
  const primaryInstallPanelUrl = pickString(currentPrimaryInstall?.responsePayload, ['panel_url', 'panelUrl']);
  const primaryInstallPanelLabel = pickString(currentPrimaryInstall?.responsePayload, ['panel_label', 'panelLabel'])
    ?? currentPrimaryInstall?.recipe?.panelLabel
    ?? currentPrimaryInstall?.app?.name
    ?? null;
  const primaryInstallPanelHost = pickString(currentPrimaryInstall?.responsePayload, ['panel_host', 'panelHost']);
  const primaryInstallPanelPort = pickNumber(currentPrimaryInstall?.responsePayload, ['panel_port', 'panelPort']);
  const primaryInstallPanelPath = pickString(currentPrimaryInstall?.responsePayload, ['panel_path', 'panelPath']);
  const servicePanelUrl = serviceApps?.panelUrl ?? primaryInstallPanelUrl ?? null;
  const servicePanelLabel = serviceApps?.panelLabel ?? primaryInstallPanelLabel ?? null;
  const servicePanelHost = serviceApps?.panelHost ?? primaryInstallPanelHost ?? null;
  const servicePanelPort = serviceApps?.panelPort ?? primaryInstallPanelPort ?? null;
  const servicePanelPath = serviceApps?.panelPath ?? primaryInstallPanelPath ?? null;
  const servicePanelUsername = serviceApps?.panelUsername
    ?? pickString(currentPrimaryInstall?.responsePayload, ['panel_username', 'panelUsername'])
    ?? null;
  const servicePanelPassword = serviceApps?.panelPassword
    ?? pickString(currentPrimaryInstall?.responsePayload, ['panel_password', 'panelPassword'])
    ?? null;
  const visibleInstallRecords = installRecords.filter((install) => !(install.isPrimary && servicePanelUrl && install.status === 'ready'));
  const currentPrimaryInstallErrorSnippet = currentPrimaryInstall?.lastError
    ? compressInstallLogLine(currentPrimaryInstall.lastError, 260)
    : null;
  const localizedProductName = service.product?.name
    ? localizeText(service.product.name, locale, ui.common.unnamedProduct)
    : '';
  const propertyNodeLabelCandidate = findServiceValueFromProperties(service, ['location', 'country', 'region', 'datacenter']);
  const propertyRegionLabelCandidate = findServiceValueFromProperties(service, ['node']);
  const derivedNodeLabel = deriveNodeLabelFromProductName(localizedProductName);
  const serviceNodeLabel = isMeaningfulNodeValue(propertyNodeLabelCandidate)
    ? propertyNodeLabelCandidate
    : isMeaningfulNodeValue(propertyRegionLabelCandidate)
      ? propertyRegionLabelCandidate
      : derivedNodeLabel
        ?? getCountryName(service.countryCode, locale)
        ?? localizeText(service.label || service.baseLabel, locale, ui.common.unnamedService);
  const runtimeNodeLabel = convoyState.node && convoyState.node.trim() !== '' ? convoyState.node : null;
  const serviceCountryCode = service.countryCode
    ?? service.product?.countryCode
    ?? inferCountryCode(
    runtimeNodeLabel ?? serviceNodeLabel,
    localizedProductName,
  );
  const displayNodeLabel = runtimeNodeLabel ?? serviceNodeLabel;
  const serviceOsLabel = convoyState.operatingSystem
    ?? service.selectedOs
    ?? findServiceValueFromProperties(service, ['selected_os', 'os', 'template', 'image'])
    ?? serviceApps?.selectedOs
    ?? effectiveReinstallOs
    ?? '-';
  const topSummaryItems = [
    {
      key: 'node',
      label: locale.startsWith('zh') ? '节点' : 'Node',
      value: displayNodeLabel,
    },
    {
      key: 'os',
      label: 'OS',
      value: serviceOsLabel,
    },
    {
      key: 'expires',
      label: locale.startsWith('zh') ? '到期时间' : 'Expires',
      value: service.expiresAt ? formatDate(service.expiresAt) : '-',
    },
  ];
  const serviceOsVisual = getOsVisual(serviceOsLabel);
  const primaryPanelVisual = getAppVisual(currentPrimaryInstall?.app ?? (servicePanelLabel
    ? {
      name: servicePanelLabel,
      slug: service.primaryAppSlug ?? servicePanelLabel,
      icon: null,
      category: null,
    }
    : null));
  const managedRuntimeLogsLines = asArray<ManagedRuntimeLogsResponse['data']['logs'][number]>(managedRuntimeLogs?.data.logs);
  const managedRuntimeRef = runtimeSnapshot?.runtimeRef ?? '-';
  const managedRuntimeStatus = uiRuntimeStatusLabel(runtimeSnapshot?.status ?? service.status, locale);
  const managedEndpoint = runtimeSnapshot?.endpoint ?? '-';
  const managedTlsStatus = managedRuntimeDetails.tlsStatus || '-';
  const managedReplicaLimit = Number(findServiceValueFromProperties(service, ['replica_limit']) ?? '1');
  const managedCanRestart = Boolean(runtimeCapabilities?.actions.restart);
  const managedCanDelete = Boolean(runtimeCapabilities?.actions.delete);
  const managedCanEnv = Boolean(runtimeCapabilities?.env);
  const managedCanDomain = Boolean(runtimeCapabilities?.domain);
  const managedCanTls = Boolean(runtimeCapabilities?.tls);
  const managedCanScale = Boolean(runtimeCapabilities?.scale);
  const operatorOrigin = buildOperatorServiceOrigin(service, locale);
  const provisioningTimestamp = provisioning?.lastAttemptAt ?? provisioning?.completedAt ?? null;
  const provisioningAttemptLabel = provisioningTimestamp
    ? formatDate(provisioningTimestamp)
    : provisioningInFlight
      ? ui.common.pending
      : provisioningSucceeded
        ? ui.common.completed
        : ui.common.noAttempts;

  const provisioningLabel = isManagedRuntime
    ? managedProvisioningStageLabel(provisioningStatus, locale)
    : (
      provisioningFailed
        ? uiRuntimeStatusLabel('failed', locale)
        : provisioningSucceeded
          ? uiRuntimeStatusLabel('ready', locale)
          : uiRuntimeStatusLabel('pending', locale)
    );
  const primaryAppName = currentPrimaryInstall?.app?.name
    ?? servicePanelLabel
    ?? (locale.startsWith('zh') ? '未选择' : 'None');
  const pendingInvoiceCount = invoices.filter((invoice) => (invoice.status ?? '').toLowerCase() === 'pending').length;
  const deliverySummaryItems = [
    {
      key: 'provisioning',
      label: locale.startsWith('zh') ? '开通状态' : 'Provisioning',
      value: provisioningLabel,
    },
    {
      key: 'os',
      label: locale.startsWith('zh') ? '当前系统' : 'Current OS',
      value: serviceApps?.selectedOs ?? serviceOsLabel,
    },
    {
      key: 'primaryApp',
      label: locale.startsWith('zh') ? '主应用' : 'Primary app',
      value: primaryAppName,
    },
    {
      key: 'addons',
      label: locale.startsWith('zh') ? '附加组件' : 'Addon installs',
      value: String(currentAddonInstalls.length),
    },
  ];
  const billingSummaryItems = [
    {
      key: 'price',
      label: text.common.total,
      value: service.formattedPrice,
    },
    {
      key: 'expires',
      label: locale.startsWith('zh') ? '到期时间' : 'Expires',
      value: service.expiresAt ? formatDate(service.expiresAt) : '-',
    },
    {
      key: 'pendingInvoices',
      label: locale.startsWith('zh') ? '待处理账单' : 'Pending invoices',
      value: pendingInvoiceCount > 0
        ? String(pendingInvoiceCount)
        : localizeMessage(locale, {
          zh: '无',
          en: 'None',
          ja: 'なし',
          ko: '없음',
        }),
    },
  ];
  const firewallSummaryLabel = locale.startsWith('zh')
    ? `防火墙 · ${firewallOptions ? (firewallOptions.enabled ? '已启用' : '已关闭') : (firewallLoading ? '同步中' : (firewallError ? '暂不可用' : '等待映射'))} · ${firewallRuleCount} 条规则`
    : `Firewall · ${firewallOptions ? (firewallOptions.enabled ? 'Enabled' : 'Disabled') : (firewallLoading ? 'Syncing' : (firewallError ? 'Unavailable' : 'Waiting for mapping'))} · ${firewallRuleCount} rules`;
  const advancedControlsSummaryLabel = locale.startsWith('zh')
    ? '深度操作（重装 / 密码 / 暂停 / 销毁）'
    : 'Deep controls (reinstall / password / suspend / destroy)';
  const firewallDetailsDefaultOpen = Boolean(firewallMessage || firewallActionError || firewallError);

  return (
    <div className="stack-24">
      <section className="section-heading">
        <div>
          <p className="eyebrow">{text.nav.services}</p>
          <h1>{localizeText(service.label || service.baseLabel, locale, ui.common.unnamedService)}</h1>
          <p className="muted">{service.product?.name ? localizeText(service.product.name, locale, ui.common.unnamedProduct) : '-'}</p>
          <div className="chip-row">
            <span className="chip">{productLineLabel(serviceProductLine, locale)}</span>
            <span className={`status-pill ${uiStatusClassName(serviceDisplayStatus)}`}>{serviceLifecycleStatusLabel}</span>
            {!isManagedRuntime ? (
              <span className={`status-pill ${effectiveServerStateClassName}`}>{effectiveServerStateLabel}</span>
            ) : null}
            {operatorOrigin ? (
              <span className="chip">{locale.startsWith('zh') ? 'AI 商业闭环' : 'AI operator linked'}</span>
            ) : null}
          </div>
        </div>
        <Link className="button ghost" to="/services">{text.nav.services}</Link>
      </section>

      {operatorOrigin ? (
        <section className="panel stack-16 service-origin-panel">
          <div className="stack-8">
            <p className="eyebrow">{locale.startsWith('zh') ? 'AI 来源与回路' : 'AI source and loop'}</p>
            <h2>{locale.startsWith('zh') ? '这个正式服务来自你的 AI 工作区' : 'This live service came from your AI workspace'}</h2>
            <p className="muted">
              {locale.startsWith('zh')
                ? '现在不是普通商品订单页了。你可以从服务继续回到 AI 项目、预览、正式版和后续运维链路。'
                : 'This service stays connected to the AI project context, so you can move between service operations, preview, production, and the original workspace.'}
            </p>
          </div>
          <div className="capsule-stat-grid">
            <div>
              <span>{locale.startsWith('zh') ? 'AI 项目' : 'AI project'}</span>
              <strong>{operatorOrigin.capsuleName}</strong>
            </div>
            <div>
              <span>{locale.startsWith('zh') ? '上线来源' : 'Launch source'}</span>
              <strong>{operatorOrigin.entryLabel}</strong>
            </div>
            <div>
              <span>{locale.startsWith('zh') ? '技术栈' : 'Stack'}</span>
              <strong>{operatorOrigin.stack ?? '-'}</strong>
            </div>
            <div>
              <span>{locale.startsWith('zh') ? '开通路径' : 'Business path'}</span>
              <strong>{operatorOrigin.businessLabel}</strong>
            </div>
          </div>
          {operatorOrigin.planSummary ? (
            <div className="callout compact">
              <p>{operatorOrigin.planSummary}</p>
            </div>
          ) : null}
          <div className="summary-list">
            {operatorOrigin.source ? (
              <div className="summary-line">
                <span className="summary-line__marker" />
                <div>
                  <span>{locale.startsWith('zh') ? '项目来源' : 'Source'}</span>
                  <strong>{operatorOrigin.source}</strong>
                </div>
              </div>
            ) : null}
            {operatorOrigin.repoUrl ? (
              <div className="summary-line">
                <span className="summary-line__marker" />
                <div>
                  <span>{locale.startsWith('zh') ? '代码仓库' : 'Git repo'}</span>
                  <strong>{operatorOrigin.repoUrl}</strong>
                </div>
              </div>
            ) : null}
            {operatorOrigin.bundleUrl ? (
              <div className="summary-line">
                <span className="summary-line__marker" />
                <div>
                  <span>{locale.startsWith('zh') ? 'AI 源码包' : 'AI source bundle'}</span>
                  <strong>{operatorOrigin.bundleUrl}</strong>
                </div>
              </div>
            ) : null}
            {operatorOrigin.previewUrl ? (
              <div className="summary-line">
                <span className="summary-line__marker" />
                <div>
                  <span>{locale.startsWith('zh') ? '预览地址' : 'Preview URL'}</span>
                  <strong>{operatorOrigin.previewUrl}</strong>
                </div>
              </div>
            ) : null}
            {operatorOrigin.productionUrl ? (
              <div className="summary-line">
                <span className="summary-line__marker" />
                <div>
                  <span>{locale.startsWith('zh') ? '正式地址' : 'Production URL'}</span>
                  <strong>{operatorOrigin.productionUrl}</strong>
                </div>
              </div>
            ) : null}
          </div>
          <div className="action-row">
            {operatorOrigin.capsuleId ? (
              <Link className="button primary" to={`/operator/${encodeURIComponent(operatorOrigin.capsuleId)}`}>
                {locale.startsWith('zh') ? '打开 AI 工作区' : 'Open AI workspace'}
              </Link>
            ) : null}
            {operatorOrigin.previewUrl ? (
              <a className="button secondary" href={operatorOrigin.previewUrl} rel="noreferrer" target="_blank">
                {locale.startsWith('zh') ? '打开预览' : 'Open preview'}
              </a>
            ) : null}
            {operatorOrigin.bundleUrl ? (
              <a className="button secondary" href={operatorOrigin.bundleUrl} rel="noreferrer" target="_blank">
                {locale.startsWith('zh') ? '下载源码包' : 'Download source bundle'}
              </a>
            ) : null}
            {operatorOrigin.productionUrl ? (
              <a className="button secondary" href={operatorOrigin.productionUrl} rel="noreferrer" target="_blank">
                {locale.startsWith('zh') ? '打开正式版' : 'Open production'}
              </a>
            ) : null}
            {operatorOrigin.manifestUrl ? (
              <a className="button ghost" href={operatorOrigin.manifestUrl} rel="noreferrer" target="_blank">
                {locale.startsWith('zh') ? '查看物料清单' : 'Open package manifest'}
              </a>
            ) : null}
            <Link className="button ghost" to="/operator">
              {locale.startsWith('zh') ? '进入 AI 工作台' : 'Open AI workspace hub'}
            </Link>
          </div>
        </section>
      ) : null}

      {!isManagedRuntime ? (
        <section className="service-command-deck">
          <article className="panel stack-16 service-summary-panel">
            <div className="service-section-intro">
              <div className="stack-8">
                <p className="eyebrow">{locale.startsWith('zh') ? '状态摘要' : 'Status summary'}</p>
                <h3>{locale.startsWith('zh') ? '一眼看懂服务状态和接管信息' : 'Understand service state and takeover info at a glance'}</h3>
                <p className="muted">
                  {localizeMessage(locale, {
                    zh: '这里只保留最关键的状态、接管信息和入口，避免和监控面板重复。',
                    en: 'Only the most important state and takeover details stay here, without repeating the monitoring panel.',
                    ja: 'ここでは重要な状態と引き継ぎ情報だけを表示し、監視パネルとの重複を避けます。',
                    ko: '이 영역에는 핵심 상태와 인수 정보만 남겨 모니터링 패널과의 중복을 줄였습니다.',
                  })}
                </p>
              </div>
            </div>
            <div className="service-meta-grid service-summary-panel__grid">
              {topSummaryItems.map((item) => (
                <div className="service-meta-card" key={item.key}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className="summary-glance service-summary-panel__glance">
              {supportSummaryItems.map((item) => (
                <div className="summary-glance__item" key={item.key}>
                  <span className={`summary-glance__dot${item.tone === 'network' ? ' summary-glance__dot--network' : item.tone === 'secure' ? ' summary-glance__dot--secure' : ''}`} />
                  <div>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                </div>
              ))}
            </div>
            <div className="callout compact service-summary-panel__network">
              <div className="stack-8">
                <strong>{ui.runtime.ipAddress}</strong>
                <div className="chip-row">
                  {displayIpList.map((address) => (
                    <span className="chip" key={address}>{address}</span>
                  ))}
                </div>
                <p className="muted">
                  {localizeMessage(locale, {
                    zh: `本月流量 ${trafficUsageValue}，入站 ${telemetryDisplayBandwidth} / 出站 ${telemetryDisplayTraffic}`,
                    en: `Traffic this month ${trafficUsageValue}, RX ${telemetryDisplayBandwidth} / TX ${telemetryDisplayTraffic}`,
                    ja: `今月の転送量 ${trafficUsageValue}、受信 ${telemetryDisplayBandwidth} / 送信 ${telemetryDisplayTraffic}`,
                    ko: `이번 달 트래픽 ${trafficUsageValue}, 수신 ${telemetryDisplayBandwidth} / 송신 ${telemetryDisplayTraffic}`,
                  })}
                </p>
              </div>
            </div>
          </article>

          <article className="panel stack-16 service-command-center">
            <div className="service-section-intro">
              <div className="stack-8">
                <p className="eyebrow">{ui.runtime.serverOperations}</p>
                <h3>{locale.startsWith('zh') ? '操作中心' : 'Control center'}</h3>
              </div>
            </div>
            <div className="service-command-group">
              <div className="service-command-group__head">
                <div className="stack-8">
                  <strong>{ui.services.runtimeConsole}</strong>
                  <p className="muted">
                    {localizeMessage(locale, {
                      zh: '控制台适合处理开机异常、网络配置错误和忘记放行端口时的紧急登录。',
                      en: 'Use the runtime console for boot issues, bad network settings, or emergency access when SSH is blocked.',
                      ja: 'ランタイムコンソールは、起動障害やネットワーク設定ミス、SSH が塞がれた緊急時の復旧に適しています。',
                      ko: '런타임 콘솔은 부팅 오류, 네트워크 설정 문제, SSH 차단 시 긴급 복구에 적합합니다.',
                    })}
                  </p>
                </div>
              </div>
              <div className="action-grid action-grid--premium">
                  <select
                    className="text-input select-input service-command-select"
                    disabled={consoleBusy || !canOpenServerConsole}
                    value={consoleType}
                    onChange={(event) => setConsoleType(event.target.value as ConsoleSessionType)}
                  >
                    <option value="novnc">{locale.startsWith('zh') ? '网页控制台（noVNC）' : 'Web console (noVNC)'}</option>
                    <option value="xtermjs">{locale.startsWith('zh') ? '终端控制台（xtermjs）' : 'Terminal console (xtermjs)'}</option>
                  </select>
                  <button
                    className="button secondary"
                    disabled={consoleBusy || !canOpenServerConsole}
                    type="button"
                    onClick={() => void openServerConsole()}
                  >
                    {consoleBusy ? `${text.common.pending}...` : localizeMessage(locale, {
                      zh: '打开控制台',
                      en: 'Open console',
                      ja: 'コンソールを開く',
                      ko: '콘솔 열기',
                      })}
                  </button>
              </div>
              {consoleMessage ? <div className="callout compact">{consoleMessage}</div> : null}
              {consoleError ? <div className="error-card">{consoleError}</div> : null}
              {!canOpenServerConsole ? (
                <div className="callout compact">
                  {isArchivedService
                    ? localizeMessage(locale, {
                      zh: '该服务已归档，控制台入口不再开放。',
                      en: 'This service is archived, so console access is no longer available.',
                      ja: 'このサービスはアーカイブ済みのため、コンソールは利用できません。',
                      ko: '이 서비스는 보관 상태라 콘솔 접근이 제공되지 않습니다.',
                    })
                    : runtimeTelemetryMessage
                      ? runtimeTelemetryMessage
                      : localizeMessage(locale, {
                        zh: '当前服务还没有可用的控制台映射。等服务器映射完成后，这里会开放浏览器控制台。',
                        en: 'Console access is not ready for this service yet. The browser console will become available once the server mapping is ready.',
                        ja: 'このサービスではまだコンソールを利用できません。サーバーマッピング完了後にブラウザコンソールが有効になります。',
                        ko: '이 서비스는 아직 콘솔에 접근할 수 없습니다. 서버 매핑이 완료되면 브라우저 콘솔을 사용할 수 있습니다.',
                      })}
                </div>
              ) : null}
            </div>
            <div className="service-command-group">
              <div className="service-command-group__head">
                <div className="stack-8">
                  <strong>{locale.startsWith('zh') ? '电源操作' : 'Power actions'}</strong>
                  <p className="muted">
                    {localizeMessage(locale, {
                      zh: '开机、关机和重启保持在最显眼的位置，方便客户直接操作。',
                      en: 'Start, stop, and restart stay in the most visible spot for quick self-service control.',
                      ja: '起動・停止・再起動は、すぐ操作できるよう一番見つけやすい位置に残します。',
                      ko: '시작, 종료, 재시작은 고객이 바로 찾을 수 있게 가장 눈에 띄는 위치에 둡니다.',
                    })}
                  </p>
                </div>
              </div>
              <div className="action-grid action-grid--premium">
                <button
                  className="button secondary"
                  disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.power}
                  type="button"
                  onClick={() => void runServerAction('start')}
                >
                  {serverBusy === 'start' ? `${text.common.pending}...` : ui.runtime.start}
                </button>
                <button
                  className="button secondary"
                  disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.power}
                  type="button"
                  onClick={() => void runServerAction('stop')}
                >
                  {serverBusy === 'stop' ? `${text.common.pending}...` : ui.runtime.stop}
                </button>
                <button
                  className="button secondary"
                  disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.power}
                  type="button"
                  onClick={() => void runServerAction('restart')}
                >
                  {serverBusy === 'restart' ? `${text.common.pending}...` : ui.runtime.restart}
                </button>
              </div>
              {serverMessage ? <div className="callout compact">{serverMessage}</div> : null}
              {serverActionError ? <div className="error-card">{serverActionError}</div> : null}
            </div>
            <details className="service-command-group service-command-group--firewall service-inline-drawer" open={firewallDetailsDefaultOpen || undefined}>
              <summary>
                <div className="service-command-group__head">
                  <div className="stack-8">
                    <strong>{firewallSummaryLabel}</strong>
                    <p className="muted">
                      {locale.startsWith('zh')
                        ? '直接在这里放行常用端口、调整默认策略和维护规则，不再跳到下面单独设置。'
                        : 'Open ports, tune default policies, and maintain rules directly here without jumping to another section.'}
                    </p>
                  </div>
                </div>
              </summary>
              <div className="service-drawer__body">
                <div className="firewall-quick-actions firewall-quick-actions--premium">
                  <button
                    className="button ghost"
                    disabled={firewallBusy !== null || !canManageFirewall}
                    type="button"
                    onClick={() => void createFirewallRule({
                      direction: 'in',
                      action: 'ACCEPT',
                      protocol: 'tcp',
                      destinationPort: '22',
                      comment: 'Allow SSH',
                    })}
                  >
                    {locale.startsWith('zh') ? '放行 SSH 22' : 'Allow SSH 22'}
                  </button>
                  <button
                    className="button ghost"
                    disabled={firewallBusy !== null || !canManageFirewall}
                    type="button"
                    onClick={() => void createFirewallRule({
                      direction: 'in',
                      action: 'ACCEPT',
                      protocol: 'tcp',
                      destinationPort: '80',
                      comment: 'Allow HTTP',
                    })}
                  >
                    {locale.startsWith('zh') ? '放行 HTTP 80' : 'Allow HTTP 80'}
                  </button>
                  <button
                    className="button ghost"
                    disabled={firewallBusy !== null || !canManageFirewall}
                    type="button"
                    onClick={() => void createFirewallRule({
                      direction: 'in',
                      action: 'ACCEPT',
                      protocol: 'tcp',
                      destinationPort: '443',
                      comment: 'Allow HTTPS',
                    })}
                  >
                    {locale.startsWith('zh') ? '放行 HTTPS 443' : 'Allow HTTPS 443'}
                  </button>
                  <button
                    className="button ghost"
                    disabled={firewallBusy !== null || !canManageFirewall}
                    type="button"
                    onClick={() => void createFirewallRule({
                      direction: 'in',
                      action: 'ACCEPT',
                      protocol: 'icmp',
                      comment: 'Allow ICMP ping',
                    })}
                  >
                    {locale.startsWith('zh') ? '放行 Ping' : 'Allow Ping'}
                  </button>
                </div>
                {firewallLoading && !firewallOptions ? <div className="loading-card">{text.common.loading}</div> : null}
                {firewallError ? <div className="error-card compact">{toFriendlyError(new Error(firewallError), locale)}</div> : null}
                {firewallMessage ? <div className="callout compact">{firewallMessage}</div> : null}
                {firewallActionError ? <div className="error-card compact">{firewallActionError}</div> : null}
                {firewallOptions ? (
                  <>
                    <div className="firewall-grid">
                      <div className="summary-line">
                        <span className={`summary-line__marker ${firewallOptions.enabled ? 'status-active' : 'status-unknown'}`} />
                        <div>
                          <span>{locale.startsWith('zh') ? '状态' : 'Status'}</span>
                          <strong>{firewallOptions.enabled
                            ? (locale.startsWith('zh') ? '防火墙已启用' : 'Firewall enabled')
                            : (locale.startsWith('zh') ? '防火墙已关闭' : 'Firewall disabled')}</strong>
                        </div>
                      </div>
                      <div className="summary-line">
                        <span className="summary-line__marker summary-line__marker--secure" />
                        <div>
                          <span>{locale.startsWith('zh') ? '入站策略' : 'Inbound policy'}</span>
                          <strong>{firewallPolicyLabel(firewallOptions.policyIn, locale)}</strong>
                        </div>
                      </div>
                      <div className="summary-line">
                        <span className="summary-line__marker summary-line__marker--secure" />
                        <div>
                          <span>{locale.startsWith('zh') ? '出站策略' : 'Outbound policy'}</span>
                          <strong>{firewallPolicyLabel(firewallOptions.policyOut, locale)}</strong>
                        </div>
                      </div>
                      <div className="summary-line">
                        <span className="summary-line__marker summary-line__marker--secure" />
                        <div>
                          <span>{locale.startsWith('zh') ? 'IP 过滤' : 'IP filter'}</span>
                          <strong>{firewallOptions.ipfilter
                            ? (locale.startsWith('zh') ? '已开启' : 'Enabled')
                            : (locale.startsWith('zh') ? '已关闭' : 'Disabled')}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="firewall-form-grid">
                      <label className="checkbox-row">
                        <input
                          checked={firewallEnabledDraft}
                          type="checkbox"
                          onChange={(event) => setFirewallEnabledDraft(event.target.checked)}
                        />
                        <span>{locale.startsWith('zh') ? '启用 PVE 防火墙' : 'Enable PVE firewall'}</span>
                      </label>
                      <label className="checkbox-row">
                        <input
                          checked={firewallIpFilterDraft}
                          type="checkbox"
                          onChange={(event) => setFirewallIpFilterDraft(event.target.checked)}
                        />
                        <span>{locale.startsWith('zh') ? '启用 IP Filter' : 'Enable IP filter'}</span>
                      </label>
                      <label className="field">
                        <span>{locale.startsWith('zh') ? '默认入站策略' : 'Default inbound policy'}</span>
                        <select
                          className="text-input select-input"
                          value={firewallPolicyInDraft}
                          onChange={(event) => setFirewallPolicyInDraft(event.target.value as 'ACCEPT' | 'DROP' | 'REJECT')}
                        >
                          <option value="ACCEPT">{locale.startsWith('zh') ? '允许' : 'Allow'}</option>
                          <option value="DROP">{locale.startsWith('zh') ? '丢弃' : 'Drop'}</option>
                          <option value="REJECT">{locale.startsWith('zh') ? '拒绝' : 'Reject'}</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>{locale.startsWith('zh') ? '默认出站策略' : 'Default outbound policy'}</span>
                        <select
                          className="text-input select-input"
                          value={firewallPolicyOutDraft}
                          onChange={(event) => setFirewallPolicyOutDraft(event.target.value as 'ACCEPT' | 'DROP' | 'REJECT')}
                        >
                          <option value="ACCEPT">{locale.startsWith('zh') ? '允许' : 'Allow'}</option>
                          <option value="DROP">{locale.startsWith('zh') ? '丢弃' : 'Drop'}</option>
                          <option value="REJECT">{locale.startsWith('zh') ? '拒绝' : 'Reject'}</option>
                        </select>
                      </label>
                    </div>

                    <div className="firewall-form-grid">
                      <label className="field">
                        <span>{locale.startsWith('zh') ? '方向' : 'Direction'}</span>
                        <select
                          className="text-input select-input"
                          value={firewallDirectionDraft}
                          onChange={(event) => setFirewallDirectionDraft(event.target.value as FirewallRuleDirection)}
                        >
                          <option value="in">{locale.startsWith('zh') ? '入站' : 'Inbound'}</option>
                          <option value="out">{locale.startsWith('zh') ? '出站' : 'Outbound'}</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>{locale.startsWith('zh') ? '动作' : 'Action'}</span>
                        <select
                          className="text-input select-input"
                          value={firewallRuleActionDraft}
                          onChange={(event) => setFirewallRuleActionDraft(event.target.value as FirewallRuleAction)}
                        >
                          <option value="ACCEPT">{locale.startsWith('zh') ? '允许' : 'Allow'}</option>
                          <option value="DROP">{locale.startsWith('zh') ? '丢弃' : 'Drop'}</option>
                          <option value="REJECT">{locale.startsWith('zh') ? '拒绝' : 'Reject'}</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>{locale.startsWith('zh') ? '协议' : 'Protocol'}</span>
                        <select
                          className="text-input select-input"
                          value={firewallProtocolDraft}
                          onChange={(event) => setFirewallProtocolDraft(event.target.value as FirewallRuleProtocol)}
                        >
                          <option value="tcp">TCP</option>
                          <option value="udp">UDP</option>
                          <option value="icmp">ICMP</option>
                          <option value="icmpv6">ICMPv6</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>{locale.startsWith('zh') ? '目标端口' : 'Destination port'}</span>
                        <input
                          className="text-input"
                          placeholder={locale.startsWith('zh') ? '例如 22, 80, 443 或 10000:10100' : '22, 80, 443, or 10000:10100'}
                          value={firewallDestinationPortDraft}
                          onChange={(event) => setFirewallDestinationPortDraft(event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>{locale.startsWith('zh') ? '来源 CIDR（可选）' : 'Source CIDR (optional)'}</span>
                        <input
                          className="text-input"
                          placeholder={locale.startsWith('zh') ? '留空表示任意来源，例如 1.2.3.4/32' : 'Leave blank for any source, e.g. 1.2.3.4/32'}
                          value={firewallSourceDraft}
                          onChange={(event) => setFirewallSourceDraft(event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>{locale.startsWith('zh') ? '备注（可选）' : 'Comment (optional)'}</span>
                        <input
                          className="text-input"
                          placeholder={locale.startsWith('zh') ? '例如 放行 SSH 管理' : 'For example: allow SSH admin'}
                          value={firewallCommentDraft}
                          onChange={(event) => setFirewallCommentDraft(event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="action-grid action-grid--tight action-grid--premium">
                      <button
                        className="button secondary"
                        disabled={firewallBusy !== null || !canManageFirewall}
                        type="button"
                        onClick={() => void saveFirewallOptions()}
                      >
                        {firewallBusy === 'options'
                          ? `${text.common.pending}...`
                          : (locale.startsWith('zh') ? '保存防火墙设置' : 'Save firewall settings')}
                      </button>
                      <button
                        className="button primary"
                        disabled={firewallBusy !== null || !canManageFirewall}
                        type="button"
                        onClick={() => void createFirewallRule()}
                      >
                        {firewallBusy === 'create-rule'
                          ? `${text.common.pending}...`
                          : (locale.startsWith('zh') ? '新增规则' : 'Add rule')}
                      </button>
                    </div>

                    <div className="stack-10">
                      <strong>{locale.startsWith('zh') ? '当前规则' : 'Current rules'}</strong>
                      {firewallRules.length === 0 ? (
                        <div className="callout compact">
                          {locale.startsWith('zh')
                            ? '当前还没有自定义规则，系统会按默认入站/出站策略处理流量。'
                            : 'No custom firewall rules are defined yet. Traffic currently follows the default inbound and outbound policies.'}
                        </div>
                      ) : (
                        <div className="firewall-rule-list">
                          {firewallRules.map((rule) => {
                            const ruleStatusClass = !rule.enabled
                              ? 'status-unknown'
                              : ((rule.action ?? '').toUpperCase() === 'ACCEPT' ? 'status-active' : 'status-overdue');

                            return (
                              <div className="firewall-rule-card" key={`${rule.position ?? 'rule'}-${rule.comment ?? ''}-${rule.destinationPort ?? ''}`}>
                                <div className="firewall-rule-card__header">
                                  <div className="stack-8">
                                    <div className="chip-row">
                                      <span className={`status-pill ${ruleStatusClass}`}>
                                        {rule.enabled
                                          ? (locale.startsWith('zh') ? '已启用' : 'Enabled')
                                          : (locale.startsWith('zh') ? '已停用' : 'Disabled')}
                                      </span>
                                      <span className="chip">{firewallDirectionLabel(rule.type, locale)}</span>
                                      <span className="chip">{firewallActionLabel(rule.action, locale)}</span>
                                      <span className="chip">{firewallProtocolLabel(rule.protocol)}</span>
                                      {rule.destinationPort ? <span className="chip">{locale.startsWith('zh') ? '端口' : 'Port'} {rule.destinationPort}</span> : null}
                                    </div>
                                    <strong>
                                      {locale.startsWith('zh') ? '规则' : 'Rule'} #{rule.position ?? '-'}
                                      {rule.comment ? ` · ${rule.comment}` : ''}
                                    </strong>
                                  </div>
                                  <button
                                    className="button ghost"
                                    disabled={firewallBusy !== null || !canManageFirewall || rule.position === null}
                                    type="button"
                                    onClick={() => void deleteFirewallRule(rule.position)}
                                  >
                                    {firewallBusy === `delete-rule:${rule.position}`
                                      ? `${text.common.pending}...`
                                      : (locale.startsWith('zh') ? '删除' : 'Delete')}
                                  </button>
                                </div>
                                <div className="chip-row">
                                  <span className="chip">
                                    {locale.startsWith('zh') ? '来源' : 'Source'}: {rule.source ?? (locale.startsWith('zh') ? '任意' : 'Any')}
                                  </span>
                                  {rule.destination ? (
                                    <span className="chip">
                                      {locale.startsWith('zh') ? '目标' : 'Destination'}: {rule.destination}
                                    </span>
                                  ) : null}
                                  {rule.sourcePort ? (
                                    <span className="chip">
                                      {locale.startsWith('zh') ? '源端口' : 'Source port'}: {rule.sourcePort}
                                    </span>
                                  ) : null}
                                  {rule.interface ? (
                                    <span className="chip">
                                      IFACE: {rule.interface}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
                {!canManageFirewall ? (
                  <div className="callout compact">
                    {serverCapabilities.application.firewall
                      ? (locale.startsWith('zh')
                        ? '当前防火墙为只读状态，暂不允许在前台直接修改规则。'
                        : 'Firewall is currently read-only for this service, so rule changes are disabled in the client panel.')
                      : (locale.startsWith('zh')
                        ? '当前服务还没有可用的防火墙映射，等服务器映射完成后才能在这里管理规则。'
                        : 'Firewall management is not available until this service has an active server mapping.')}
                  </div>
                ) : null}
              </div>
            </details>
          </article>
        </section>
      ) : null}

      {!isManagedRuntime ? (
        <section className="panel stack-16 runtime-overview-panel">
          <div className="runtime-overview-panel__header">
            <div className="stack-8">
              <p className="eyebrow">{locale.startsWith('zh') ? '实时资源总览' : 'Live resource overview'}</p>
              <h2>{locale.startsWith('zh') ? 'PVE 资源状态面板' : 'PVE resource status'}</h2>
              <p className="muted">
                {localizeMessage(locale, {
                  zh: '这里只做监控数据静默更新，不会再整页跟着一起刷新。CPU、内存、磁盘和流量会独立轮询。',
                  en: 'Only the telemetry updates quietly here now. CPU, memory, disk, and traffic refresh independently without reloading the whole page.',
                  ja: 'ここでは監視データだけを静かに更新し、ページ全体は再描画しません。CPU・メモリ・ディスク・トラフィックだけを個別更新します。',
                  ko: '이 영역은 모니터링 데이터만 조용히 갱신하고, 페이지 전체는 다시 깜빡이지 않습니다. CPU, 메모리, 디스크, 트래픽만 개별 갱신됩니다.',
                })}
              </p>
            </div>
            <div className="runtime-overview-panel__meta">
              <span className={`status-pill ${effectiveServerStateClassName}`}>{effectiveServerStateLabel}</span>
              <div className="runtime-overview-panel__meta-card runtime-refresh-control">
                <span>{locale.startsWith('zh') ? '刷新节奏' : 'Refresh cadence'}</span>
                <strong>
                  {locale.startsWith('zh')
                    ? `监控每 ${telemetryRefreshSeconds} 秒更新`
                    : `Telemetry updates every ${telemetryRefreshSeconds}s`}
                </strong>
                <div className="runtime-refresh-control__row">
                  <input
                    aria-label={locale.startsWith('zh') ? '监控刷新秒数' : 'Telemetry refresh seconds'}
                    max={telemetryRefreshMaxSeconds}
                    min={telemetryRefreshMinSeconds}
                    onChange={(event) => updateTelemetryRefreshSeconds(Number(event.target.value))}
                    type="range"
                    value={telemetryRefreshSeconds}
                  />
                  <label className="runtime-refresh-control__number">
                    <input
                      aria-label={locale.startsWith('zh') ? '输入监控刷新秒数' : 'Enter telemetry refresh seconds'}
                      max={telemetryRefreshMaxSeconds}
                      min={telemetryRefreshMinSeconds}
                      onChange={(event) => updateTelemetryRefreshSeconds(Number(event.target.value))}
                      type="number"
                      value={telemetryRefreshSeconds}
                    />
                    <small>{locale.startsWith('zh') ? '秒' : 's'}</small>
                  </label>
                </div>
                <div className="runtime-refresh-control__presets" aria-label={locale.startsWith('zh') ? '监控刷新快捷选项' : 'Telemetry refresh presets'}>
                  {[1, 3, 5, 15].map((seconds) => (
                    <button
                      className={`runtime-refresh-control__preset${telemetryRefreshSeconds === seconds ? ' active' : ''}`}
                      key={seconds}
                      onClick={() => updateTelemetryRefreshSeconds(seconds)}
                      type="button"
                    >
                      {locale.startsWith('zh') ? `${seconds} 秒` : `${seconds}s`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="runtime-overview-panel__meta-card">
                <span>{locale.startsWith('zh') ? '最近采样' : 'Latest sample'}</span>
                <strong>{telemetrySampleLabel}</strong>
              </div>
            </div>
          </div>

          {isArchivedService ? (
            <div className="callout compact">
              {localizeMessage(locale, {
                zh: '该服务已取消或已归档，实时监控和控制能力会自动收起。',
                en: 'This service is cancelled or archived, so live monitoring and controls are automatically reduced.',
                ja: 'このサービスは解約済みまたはアーカイブ済みのため、リアルタイム監視と操作は自動的に縮退表示されます。',
                ko: '이 서비스는 해지/보관 상태이므로 실시간 모니터링과 제어가 자동으로 축소됩니다.',
              })}
            </div>
          ) : serverLoading ? (
            <div className="loading-card">{text.common.loading}</div>
          ) : serverError ? (
            <div className="callout">{friendlyServerError(serverError, locale)}</div>
          ) : (
            <>
              {runtimeTelemetryMessage ? (
                <div className="callout compact">
                  {runtimeTelemetryMessage}
                </div>
              ) : null}
              <div className="metrics-grid runtime-overview-panel__grid">
                {telemetryHighlights.map((item) => (
                  <article className={`metric-card runtime-metric-card runtime-metric-card--${item.tone}`} key={item.key}>
                    <span>{item.title}</span>
                    <strong>{item.value}</strong>
                    <div className="runtime-meter" aria-hidden="true">
                      <span style={{ width: item.percent === null ? '0%' : `${item.percent}%` }} />
                    </div>
                    <p className="muted">
                      {item.percent !== null ? `${formatPercent(item.percent)} · ${item.detail}` : item.detail}
                    </p>
                  </article>
                ))}
              </div>
              <div className="callout compact">
                <strong>Uptime</strong>
                <p className="muted">{displayUptime}</p>
              </div>
            </>
          )}
        </section>
      ) : null}

      {!isManagedRuntime ? (
        null
      ) : null}

      {isManagedRuntime ? (
        <section className="two-column">
          <article className="panel stack-16">
            <p className="eyebrow">{ui.runtime.applicationInfo}</p>
            {runtimeLoading ? (
              <div className="loading-card">{text.common.loading}</div>
            ) : runtimeError ? (
              <div className="error-card">{runtimeError}</div>
            ) : (
              <div className="detail-grid">
                <div><span>{ui.runtime.instanceRef}</span><strong>{managedRuntimeRef}</strong></div>
                <div><span>{ui.runtime.runtimeStatus}</span><strong>{managedRuntimeStatus}</strong></div>
                <div><span>{ui.common.endpoint}</span><strong>{managedEndpoint}</strong></div>
                <div><span>{ui.runtime.domain}</span><strong>{managedRuntimeDetails.domain || '-'}</strong></div>
                <div><span>HTTPS</span><strong>{managedTlsStatus}</strong></div>
                <div><span>{ui.runtime.replicas}</span><strong>{managedRuntimeDetails.replicas}</strong></div>
                <div><span>{ui.runtime.lastDeploy}</span><strong>{formatDate(runtimeSnapshot?.lastDeployAt ?? null)}</strong></div>
              </div>
            )}
          </article>

          <article className="panel stack-12">
            <p className="eyebrow">{ui.runtime.applicationControls}</p>
            <div className="action-grid">
              <button
                className="button secondary"
                disabled={managedBusy !== null || !managedCanRestart || provisioningInFlight}
                type="button"
                onClick={() => void runManagedAction('restart')}
              >
                {managedBusy === 'restart' ? `${text.common.pending}...` : ui.runtime.restartApp}
              </button>
              <button
                className="button danger"
                disabled={managedBusy !== null || !managedCanDelete || provisioningInFlight}
                type="button"
                onClick={() => void runManagedAction('delete')}
              >
                {managedBusy === 'delete' ? `${text.common.pending}...` : ui.runtime.deleteInstance}
              </button>
            </div>

            <label className="field">
              <span>{ui.runtime.envJson}</span>
              <textarea
                className="text-input"
                rows={8}
                value={managedEnvDraft}
                onChange={(event) => setManagedEnvDraft(event.target.value)}
              />
            </label>
            <button
              className="button secondary"
              disabled={managedBusy !== null || !managedCanEnv || provisioningInFlight}
              type="button"
              onClick={() => void saveManagedEnv()}
            >
                {managedBusy === 'env' ? `${text.common.pending}...` : ui.runtime.updateEnv}
            </button>

            <label className="field">
              <span>{ui.runtime.bindDomain}</span>
              <input
                className="text-input"
                value={managedDomainDraft}
                onChange={(event) => setManagedDomainDraft(event.target.value)}
              />
            </label>
            <div className="action-grid">
              <button
                className="button secondary"
                disabled={managedBusy !== null || !managedCanDomain || provisioningInFlight}
                type="button"
                onClick={() => void saveManagedDomain()}
              >
                {managedBusy === 'domain' ? `${text.common.pending}...` : ui.runtime.saveDomain}
              </button>
              <button
                className="button ghost"
                disabled={managedBusy !== null || !managedCanTls || provisioningInFlight}
                type="button"
                onClick={() => void enableManagedTls()}
              >
                {managedBusy === 'tls' ? `${text.common.pending}...` : ui.runtime.enableHttps}
              </button>
            </div>

            <label className="field">
              <span>{ui.runtime.scaleReplicas}</span>
              <input
                className="text-input"
                type="number"
                min={1}
                max={Number.isFinite(managedReplicaLimit) && managedReplicaLimit > 0 ? managedReplicaLimit : undefined}
                value={managedScaleDraft}
                onChange={(event) => setManagedScaleDraft(event.target.value)}
              />
            </label>
            <button
              className="button secondary"
              disabled={managedBusy !== null || !managedCanScale || provisioningInFlight}
              type="button"
              onClick={() => void scaleManagedRuntime()}
            >
              {managedBusy === 'scale' ? `${text.common.pending}...` : ui.runtime.applyScale}
            </button>
            <p className="muted">
              {ui.runtime.replicaLimit}: {Number.isFinite(managedReplicaLimit) ? managedReplicaLimit : 1}
            </p>

            {managedMessage ? <div className="callout compact">{managedMessage}</div> : null}
            {managedActionError ? <div className="error-card">{managedActionError}</div> : null}
          </article>
        </section>
      ) : (
        <section className="service-secondary-zone">
          <details className="service-drawer service-drawer--panel" open>
            <summary>{locale.startsWith('zh') ? '交付与应用' : 'Delivery and apps'}</summary>
            <div className="service-drawer__body">
              <section className="panel stack-16 service-delivery-panel">
              <div className="service-section-intro">
                <div className="stack-8">
                  <p className="eyebrow">{locale.startsWith('zh') ? '交付与应用' : 'Delivery and apps'}</p>
                  <h3>{locale.startsWith('zh') ? '把开通、主面板和组件安装收成一块' : 'Keep provisioning, primary panel, and add-on installs in one area'}</h3>
                  <p className="muted">
                    {localizeMessage(locale, {
                      zh: '这里专门负责交付状态和应用安装。默认只看摘要，失败细节和原始日志放进抽屉里按需展开。',
                      en: 'This section focuses on delivery status and app installs. You get a clean summary first, while failure details and raw logs stay tucked into drawers.',
                      ja: 'このセクションでは提供状況とアプリ導入だけをまとめます。まず概要だけを見せ、障害詳細や生ログは必要なときだけ展開します。',
                      ko: '이 영역은 개통 상태와 앱 설치만 모아 보여줍니다. 먼저 요약만 보여 주고, 장애 세부 정보와 원본 로그는 필요할 때만 펼칩니다.',
                    })}
                  </p>
                </div>
              </div>

              {provisioningLoading ? (
                <div className="loading-card">{text.common.loading}</div>
              ) : provisioningError ? (
                <div className="error-card">{provisioningError}</div>
              ) : (
                <>
                  <div className="service-meta-grid">
                    {deliverySummaryItems.map((item) => (
                      <div className="service-meta-card" key={item.key}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className={`callout compact service-provisioning-banner ${provisioningTone(provisioningStatus) === 'failed' ? 'error-card' : ''}`}>
                    <strong>{provisioningLabel}</strong>
                    {showProvisioningErrorDetails && provisioning?.errorMessage ? <p className="muted">{provisioning.errorMessage}</p> : null}
                    {showProvisioningErrorDetails && provisioning?.errorCode ? <p className="muted">{ui.runtime.errorCode}: {provisioning.errorCode}</p> : null}
                    <p className="muted">
                      {ui.common.lastAttempt}: {provisioningAttemptLabel}
                      {' | '}
                      {ui.runtime.attempts}: {provisioning?.attemptCount ?? 0}
                    </p>
                  </div>
                  {provisioningCanRetry ? (
                    <div className="stack-12 service-provisioning-actions">
                      <label className="field">
                        <span>{locale.startsWith('zh') ? '重试开通前可改新密码（可选）' : 'Optional new password before retry'}</span>
                        <input
                          className="text-input"
                          placeholder={locale.startsWith('zh')
                            ? '8-50 位，需含大写/小写/数字/特殊字符'
                            : '8-50 chars with upper/lowercase, number, special char'}
                          type="password"
                          value={retryProvisioningPassword}
                          onChange={(event) => {
                            setRetryProvisioningPassword(event.target.value);
                            setActionError(null);
                          }}
                        />
                      </label>
                      <p className="muted">
                        {locale.startsWith('zh')
                          ? '如果上次开通是因为密码策略不合规失败，这里直接填新密码后再点“重试开通”即可。'
                          : 'If the last provisioning failed because of password policy, enter a new password here before retrying.'}
                      </p>
                      {retryProvisioningPasswordError ? <div className="error-card compact">{retryProvisioningPasswordError}</div> : null}
                      <button
                        className="button ghost service-action-button"
                        disabled={retryingProvisioning || Boolean(retryProvisioningPasswordError)}
                        type="button"
                        onClick={() => void retryProvisioning()}
                      >
                        {retryingProvisioning
                          ? ui.common.retrying
                          : ui.runtime.retryProvisioning}
                      </button>
                    </div>
                  ) : null}
                  {provisioningMessage ? <div className="callout compact">{provisioningMessage}</div> : null}
                </>
              )}

              {serviceAppsLoading ? (
                <div className="loading-card">{text.common.loading}</div>
              ) : serviceAppsError ? (
                <div className="error-card">{serviceAppsError}</div>
              ) : serviceApps ? (
                <>
                  {servicePanelUrl ? (
                    <div className="callout compact service-panel-access">
                      <div className="stack-8">
                        <div className="choice-card__headline">
                          <VisualIcon
                            glyph={primaryPanelVisual.glyph}
                            label={servicePanelLabel ?? (locale.startsWith('zh') ? '主面板入口' : 'Primary panel access')}
                            size="sm"
                            src={primaryPanelVisual.src}
                            tone={primaryPanelVisual.tone}
                          />
                          <strong>
                            {servicePanelLabel
                              ?? (locale.startsWith('zh') ? '主面板入口' : 'Primary panel access')}
                          </strong>
                        </div>
                        <code>{servicePanelUrl}</code>
                        {(servicePanelHost || servicePanelPort || servicePanelPath) ? (
                          <p className="muted">
                            {(locale.startsWith('zh') ? '位置' : 'Location')}: {servicePanelHost ?? '-'}
                            {servicePanelPort ? `:${servicePanelPort}` : ''}
                            {servicePanelPath ? ` ${servicePanelPath}` : ''}
                          </p>
                        ) : null}
                        {servicePanelUsername ? (
                          <p className="muted">
                            {(locale.startsWith('zh') ? '面板账号' : 'Panel username')}: <code>{servicePanelUsername}</code>
                          </p>
                        ) : null}
                        {servicePanelPassword ? (
                          <div className="stack-8">
                            <p className="muted">
                              {(locale.startsWith('zh') ? '面板密码' : 'Panel password')}: <code>{showPanelPassword ? servicePanelPassword : '************'}</code>
                            </p>
                            <button
                              className="button ghost"
                              type="button"
                              onClick={() => setShowPanelPassword((current) => !current)}
                            >
                              {showPanelPassword
                                ? (locale.startsWith('zh') ? '隐藏面板密码' : 'Hide panel password')
                                : (locale.startsWith('zh') ? '显示面板密码' : 'Show panel password')}
                            </button>
                          </div>
                        ) : null}
                        <div className="action-grid action-grid--tight">
                          <a className="button secondary" href={servicePanelUrl} rel="noreferrer" target="_blank">
                            {locale.startsWith('zh') ? '打开面板' : 'Open panel'}
                          </a>
                          <span className="muted">
                            {locale.startsWith('zh')
                              ? '安装完成后，面板入口会持续保留在这里。'
                              : 'Once the install finishes, the panel entry stays pinned here.'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : currentPrimaryInstall ? (
                    <div className={`callout compact service-panel-access ${currentPrimaryInstall.status === 'failed' ? 'error-card' : ''}`}>
                      <strong>
                        {currentPrimaryInstall.status === 'failed'
                          ? (locale.startsWith('zh')
                            ? '主面板安装失败，还没有可用访问地址。'
                            : 'The primary panel install failed, so there is no access URL yet.')
                          : currentPrimaryInstall.status === 'ready'
                            ? (locale.startsWith('zh')
                              ? '主面板已经安装完成，但当前还没有回传访问地址。'
                              : 'The primary panel is ready, but no access URL has been reported yet.')
                            : (locale.startsWith('zh')
                              ? '主面板正在安装中，安装完成后这里会显示访问地址。'
                              : 'The primary panel is still installing. Its access URL will appear here when ready.')}
                      </strong>
                      {currentPrimaryInstall.lastError ? (
                        <>
                          <p className="muted">{currentPrimaryInstallErrorSnippet}</p>
                          {friendlyInstallFailureHint(currentPrimaryInstall.lastError, locale) ? (
                            <p className="muted">{friendlyInstallFailureHint(currentPrimaryInstall.lastError, locale)}</p>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <div className="callout compact service-panel-access">
                      {locale.startsWith('zh')
                        ? '当前还没有主应用入口。后续选择并安装主应用后，这里会固定显示可访问地址。'
                        : 'There is no primary app entry yet. Once you install a primary app, its access URL will be pinned here.'}
                    </div>
                  )}

                  {visibleInstallRecords.length === 0 ? (
                    <div className="callout compact">
                      {locale.startsWith('zh')
                        ? '当前没有额外的应用安装记录。'
                        : 'There are no additional app install records to display.'}
                    </div>
                  ) : (
                    <div className="service-install-grid">
                      {visibleInstallRecords.map((install) => {
                        const installPanelUrl = pickString(install.responsePayload, ['panel_url', 'panelUrl']);
                        const installPanelLabel = pickString(install.responsePayload, ['panel_label', 'panelLabel'])
                          ?? install.recipe?.panelLabel
                          ?? install.app?.name
                          ?? null;
                        const installPanelUsername = normalizeCredentialValue(pickString(install.responsePayload, [
                          'panel_username',
                          'panelUsername',
                        ]));
                        const installPanelPassword = normalizeCredentialValue(pickString(install.responsePayload, [
                          'panel_password',
                          'panelPassword',
                        ]));
                        const installRuntimeUsername = normalizeCredentialValue(pickString(install.responsePayload, [
                          'username',
                          'ssh_username',
                          'sshUsername',
                          'account_username',
                          'accountUsername',
                          'login_username',
                          'loginUsername',
                          'root_username',
                          'rootUsername',
                        ]));
                        const installRuntimePassword = normalizeCredentialValue(pickString(install.responsePayload, [
                          'password',
                          'account_password',
                          'accountPassword',
                          'root_password',
                          'rootPassword',
                          'login_password',
                          'loginPassword',
                        ]));
                        const installCredentialUsername = installPanelUsername ?? installRuntimeUsername;
                        const installCredentialPassword = installPanelPassword ?? installRuntimePassword;
                        const hasIndependentCredentials = Boolean(installCredentialUsername || installCredentialPassword);
                        const showInstallPassword = Boolean(visibleInstallPasswords[install.id]);
                        const installLastErrorSnippet = install.lastError
                          ? compressInstallLogLine(install.lastError, 320)
                          : null;
                        const installLogSummary = summarizeInstallLogs(install.logs);
                        const showRawInstallLogs = Boolean(expandedInstallLogs[install.id]);
                        const rawInstallLogLines = install.logs
                          .map((line) => compressInstallLogLine(line))
                          .filter((line) => line.length > 0)
                          .slice(-12);

                        return (
                          <article
                            className={`install-record-card${install.status === 'failed' ? ' install-record-card--failed' : install.status === 'ready' ? ' install-record-card--ready' : ''}`}
                            key={install.id}
                          >
                            <div className="install-record-card__header">
                              <div className="choice-card__headline">
                                <VisualIcon
                                  glyph={getAppVisual(install.app ?? null).glyph}
                                  label={install.app?.name ?? install.app?.slug ?? install.id}
                                  size="sm"
                                  src={getAppVisual(install.app ?? null).src}
                                  tone={getAppVisual(install.app ?? null).tone}
                                />
                                <strong>
                                  {install.app?.name ?? install.app?.slug ?? install.id}
                                  {install.isPrimary ? ` · ${locale.startsWith('zh') ? '主应用' : 'Primary'}` : ''}
                                </strong>
                              </div>
                              <span className={`status-pill ${install.status === 'ready' ? 'status-active' : install.status === 'failed' ? 'status-cancelled' : 'status-pending'}`}>
                                {uiRuntimeStatusLabel(install.status, locale)}
                              </span>
                            </div>
                            <p className="install-record-card__meta">
                              {(locale.startsWith('zh') ? '策略' : 'Strategy')}: {install.installStrategy ?? '-'}
                              {' · '}
                              {(locale.startsWith('zh') ? '来源' : 'Source')}: {install.source}
                              {' · '}
                              {(locale.startsWith('zh') ? '尝试次数' : 'Attempts')}: {install.attemptCount}
                            </p>
                            <p className="install-record-card__summary">
                              {installLastErrorSnippet
                                ?? installLogSummary.lines[0]
                                ?? localizeMessage(locale, {
                                  zh: '当前没有需要展开的详细日志，组件状态会在这里持续更新。',
                                  en: 'There are no extra details to expand right now. This card will keep reflecting the latest install state.',
                                  ja: '現在すぐに展開すべき追加ログはありません。このカードに最新状態を保ちます。',
                                  ko: '지금 바로 펼쳐 볼 추가 로그는 없습니다. 이 카드가 최신 설치 상태를 계속 반영합니다.',
                                })}
                            </p>
                            <div className="action-grid action-grid--tight">
                              {installPanelUrl ? (
                                <a className="button ghost" href={installPanelUrl} rel="noreferrer" target="_blank">
                                  {locale.startsWith('zh') ? '打开入口' : 'Open access'}
                                </a>
                              ) : null}
                              {install.status === 'failed' ? (
                                <button
                                  className="button ghost"
                                  disabled={appsBusy !== null}
                                  type="button"
                                  onClick={() => void retryInstallRecord(install.id)}
                                >
                                  {appsBusy === `retry:${install.id}`
                                    ? `${text.common.pending}...`
                                    : (locale.startsWith('zh') ? '重试安装' : 'Retry install')}
                                </button>
                              ) : null}
                            </div>
                            <details className="service-drawer">
                              <summary>{locale.startsWith('zh') ? '展开详情、凭据与日志' : 'Expand details, credentials, and logs'}</summary>
                              <div className="service-drawer__body">
                                {installPanelUrl ? (
                                  <div className="stack-8">
                                    <strong>{installPanelLabel ?? (locale.startsWith('zh') ? '访问地址' : 'Access URL')}</strong>
                                    <code>{installPanelUrl}</code>
                                  </div>
                                ) : null}
                                {hasIndependentCredentials ? (
                                  <div className="stack-8">
                                    <strong>{locale.startsWith('zh') ? '登录凭据' : 'Login credentials'}</strong>
                                    {installCredentialUsername ? (
                                      <p className="muted">
                                        {locale.startsWith('zh') ? '登录账号' : 'Username'}: <code>{installCredentialUsername}</code>
                                      </p>
                                    ) : null}
                                    {installCredentialPassword ? (
                                      <div className="stack-8">
                                        <p className="muted">
                                          {locale.startsWith('zh') ? '登录密码' : 'Password'}: <code>{showInstallPassword ? installCredentialPassword : '************'}</code>
                                        </p>
                                        <button
                                          className="button ghost"
                                          type="button"
                                          onClick={() => setVisibleInstallPasswords((current) => ({
                                            ...current,
                                            [install.id]: !current[install.id],
                                          }))}
                                        >
                                          {showInstallPassword
                                            ? (locale.startsWith('zh') ? '隐藏密码' : 'Hide password')
                                            : (locale.startsWith('zh') ? '显示密码' : 'Show password')}
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : (
                                  <p className="muted">
                                    {locale.startsWith('zh')
                                      ? '该组件未返回独立登录凭据。请按组件文档或主面板管理方式访问。'
                                      : 'This component did not return independent login credentials. Access it through the docs or your primary panel workflow.'}
                                  </p>
                                )}
                                {friendlyInstallFailureHint(install.lastError, locale) ? (
                                  <p className="muted">{friendlyInstallFailureHint(install.lastError, locale)}</p>
                                ) : null}
                                {installLogSummary.lines.length > 0 ? (
                                  <div className="stack-8">
                                    {installLogSummary.lines.map((line, index) => (
                                      <code key={`${install.id}-${index}`}>{line}</code>
                                    ))}
                                    {installLogSummary.hiddenCount > 0 ? (
                                      <p className="muted">
                                        {locale.startsWith('zh')
                                          ? `还有 ${installLogSummary.hiddenCount} 条日志已收进原始日志。`
                                          : `${installLogSummary.hiddenCount} more lines are kept in the raw log view.`}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                                {rawInstallLogLines.length > installLogSummary.lines.length ? (
                                  <>
                                    <button
                                      className="button ghost"
                                      type="button"
                                      onClick={() => setExpandedInstallLogs((current) => ({
                                        ...current,
                                        [install.id]: !current[install.id],
                                      }))}
                                    >
                                      {showRawInstallLogs
                                        ? (locale.startsWith('zh') ? '收起原始日志' : 'Hide raw logs')
                                        : (locale.startsWith('zh') ? '展开原始日志' : 'Show raw logs')}
                                    </button>
                                    {showRawInstallLogs ? (
                                      <div className="stack-8">
                                        {rawInstallLogLines.map((line, index) => (
                                          <code key={`${install.id}-raw-${index}`}>{line}</code>
                                        ))}
                                      </div>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            </details>
                          </article>
                        );
                      })}
                    </div>
                  )}

                  <div className="stack-12 service-addon-panel">
                    <div className="service-section-intro">
                      <div className="stack-8">
                        <p className="eyebrow">{locale.startsWith('zh') ? '应用组件增装' : 'Install addon components'}</p>
                        <h3>{locale.startsWith('zh') ? '需要时再展开组件安装' : 'Open the add-on installer only when you need it'}</h3>
                      </div>
                    </div>
                    {availableAddonCatalog.length === 0 ? (
                      <div className="callout compact">
                        {locale.startsWith('zh')
                          ? '当前没有可追加的附加组件，或者已经全部装上。'
                          : 'No additional addon apps are available for this service right now.'}
                      </div>
                    ) : (
                      <>
                        <button
                          className="button secondary service-action-button"
                          type="button"
                          onClick={() => setShowAddonInstaller((current) => !current)}
                        >
                          {showAddonInstaller
                            ? (locale.startsWith('zh') ? '收起组件选择' : 'Hide addon selector')
                            : (locale.startsWith('zh') ? '添加应用组件' : 'Add app components')}
                        </button>
                        {showAddonInstaller ? (
                          <div className="stack-12 danger-action-panel">
                            {addonCategoryOptions.length > 1 ? (
                              <div className="chip-row">
                                {addonCategoryOptions.map((item) => (
                                  <button
                                    className={`chip chip-button ${addonCategoryFilter === item.slug ? 'chip-button--active' : ''}`}
                                    key={item.slug}
                                    type="button"
                                    onClick={() => setAddonCategoryFilter(item.slug)}
                                  >
                                    {item.name}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                            <div className="choice-grid">
                              {visibleAddonCatalog.map((app) => (
                                <button
                                  className={`choice-card compact vps-app-card ${selectedAddonSlugs.includes(app.slug) ? 'selected' : ''}`}
                                  disabled={!app.available}
                                  key={app.slug}
                                  type="button"
                                  onClick={() => {
                                    setAppsMessage(null);
                                    setAppsActionError(null);
                                    setSelectedAddonSlugs((current) => current.includes(app.slug)
                                      ? current.filter((slug) => slug !== app.slug)
                                      : [...current, app.slug]);
                                  }}
                                >
                                  <div className="choice-card__headline">
                                    <VisualIcon
                                      glyph={getAppVisual(app).glyph}
                                      label={app.name}
                                      size="sm"
                                      src={getAppVisual(app).src}
                                      tone={getAppVisual(app).tone}
                                    />
                                    <div className="stack-8">
                                      <strong>{app.name}</strong>
                                      {app.category?.name ? <small>{app.category.name}</small> : null}
                                    </div>
                                  </div>
                                  {app.tagline ? <span>{app.tagline}</span> : null}
                                  {(app.recipe?.dependencies ?? []).length > 0 ? (
                                    <small>{locale.startsWith('zh') ? '依赖' : 'Depends on'}: {app.recipe?.dependencies.join(', ')}</small>
                                  ) : null}
                                  {(app.recipe?.conflicts ?? []).length > 0 ? (
                                    <small>{locale.startsWith('zh') ? '冲突' : 'Conflicts'}: {app.recipe?.conflicts.join(', ')}</small>
                                  ) : null}
                                  {!app.available && app.unavailableReason ? <small>{app.unavailableReason}</small> : null}
                                </button>
                              ))}
                            </div>
                            {visibleAddonCatalog.length === 0 ? (
                              <div className="callout compact">
                                {locale.startsWith('zh')
                                  ? '当前分类下没有可安装组件，请切换分类。'
                                  : 'No installable addons in this category. Try another filter.'}
                              </div>
                            ) : null}
                            <button
                              className="button primary"
                              disabled={appsBusy !== null || selectedAddonSlugs.length === 0}
                              type="button"
                              onClick={() => void installAddonApps()}
                            >
                              {appsBusy === 'install'
                                ? `${text.common.pending}...`
                                : (locale.startsWith('zh') ? '提交安装' : 'Install selected addons')}
                            </button>
                          </div>
                        ) : (
                          <div className="callout compact">
                            {locale.startsWith('zh')
                              ? '先点击“添加应用组件”，再选择要安装的组件并提交。'
                              : 'Click "Add app components" first, then choose the addons and submit.'}
                          </div>
                        )}
                      </>
                    )}
                    {appsMessage ? <div className="callout compact">{appsMessage}</div> : null}
                    {appsActionError ? <div className="error-card compact">{appsActionError}</div> : null}
                  </div>
                </>
              ) : (
                <div className="callout compact">
                  {locale.startsWith('zh')
                    ? '当前还没有可展示的应用安装目录。'
                    : 'There is no app installation catalog available for this service yet.'}
                </div>
              )}
              </section>
            </div>
          </details>

          <details className="service-drawer service-drawer--panel">
            <summary>{locale.startsWith('zh') ? `最近操作记录 · ${compactOperationLogs.length} 条` : `Recent operation logs · ${compactOperationLogs.length}`}</summary>
            <div className="service-drawer__body">
              <section className="panel stack-12 service-history-panel">
              <div className="service-section-intro">
                <div className="stack-8">
                  <p className="eyebrow">{ui.runtime.recentLogs}</p>
                  <h3>{locale.startsWith('zh') ? '最近操作记录' : 'Recent operation history'}</h3>
                </div>
              </div>
              {compactOperationLogs.length === 0 ? (
                <div className="callout compact">
                  {ui.runtime.noOperationLogs}
                </div>
              ) : (
                <div className="service-history-list">
                  {highlightedOperationLogs.map((log) => (
                    <div className="operation-log" key={log.id}>
                      <div className="operation-log__header">
                        <strong>{log.actionLabel}</strong>
                        <span className={`status-pill ${log.outcomeClassName}`}>
                          {log.outcomeLabel}
                        </span>
                      </div>
                      <p className="muted">
                        {log.timestampLabel}
                        {log.operationId ? ` | ${ui.common.operationId}: ${log.operationId}` : ''}
                      </p>
                      {log.message ? <p>{log.message}</p> : null}
                      {log.showCode && log.code ? <p className="muted">{ui.runtime.errorCode}: {log.code}</p> : null}
                      {log.detail ? <p className="muted">{log.detail}</p> : null}
                    </div>
                  ))}
                  {compactOperationLogs.length > highlightedOperationLogs.length ? (
                    <details className="service-drawer">
                      <summary>
                        {locale.startsWith('zh')
                          ? `展开全部 ${compactOperationLogs.length} 条记录`
                          : `Show all ${compactOperationLogs.length} logs`}
                      </summary>
                      <div className="service-drawer__body">
                        <div className="service-history-list">
                          {compactOperationLogs.map((log) => (
                            <div className="operation-log" key={`all-${log.id}`}>
                              <div className="operation-log__header">
                                <strong>{log.actionLabel}</strong>
                                <span className={`status-pill ${log.outcomeClassName}`}>
                                  {log.outcomeLabel}
                                </span>
                              </div>
                              <p className="muted">
                                {log.timestampLabel}
                                {log.operationId ? ` | ${ui.common.operationId}: ${log.operationId}` : ''}
                              </p>
                              {log.message ? <p>{log.message}</p> : null}
                              {log.showCode && log.code ? <p className="muted">{ui.runtime.errorCode}: {log.code}</p> : null}
                              {log.detail ? <p className="muted">{log.detail}</p> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  ) : null}
                </div>
              )}
              </section>
            </div>
          </details>

          <details className="service-drawer service-drawer--panel">
            <summary>{advancedControlsSummaryLabel}</summary>
            <div className="service-drawer__body">
              <article className="panel stack-16 service-ops-panel">
                <div className="service-section-intro">
                  <div className="stack-8">
                    <p className="eyebrow">{locale.startsWith('zh') ? '高风险与深度操作' : 'Deep and high-risk controls'}</p>
                    <h3>{locale.startsWith('zh') ? '把重装、密码和不可逆操作收在这里' : 'Keep reinstall, password, and irreversible actions here'}</h3>
                    <p className="muted">
                      {localizeMessage(locale, {
                        zh: '这里只保留真正需要二次确认或深度配置的操作，避免和上方操作中心重复。',
                        en: 'Only the actions that require deeper configuration or stronger confirmation stay here, so the main control center does not repeat itself.',
                        ja: 'ここには、詳細設定や強い確認が必要な操作だけを残し、上部コントロールセンターとの重複を避けます。',
                        ko: '여기에는 심화 설정이나 강한 확인이 필요한 작업만 남겨 상단 제어 센터와의 중복을 줄였습니다.',
                      })}
                    </p>
                  </div>
                </div>

                {!canRunServerActions ? (
                  <div className="callout compact">
                    {isArchivedService
                      ? localizeMessage(locale, {
                        zh: '该服务当前处于已取消/归档状态，服务器操作已关闭。',
                        en: 'This service is cancelled/archived, so server actions are disabled.',
                        ja: 'このサービスは解約/アーカイブ状態のため、サーバー操作は無効です。',
                        ko: '이 서비스는 해지/보관 상태이므로 서버 작업이 비활성化되었습니다.',
                      })
                      : provisioningInFlight
                        ? localizeMessage(locale, {
                          zh: '服务正在开通中，暂不可执行服务器操作。',
                          en: 'Server actions are disabled while provisioning is in progress.',
                          ja: '開通処理中はサーバー操作を実行できません。',
                          ko: '개통 진행 중에는 서버 작업을 실행할 수 없습니다.',
                        })
                        : provisioningCanRetry
                          ? localizeMessage(locale, {
                            zh: '服务开通失败，请先在“交付与应用”抽屉里重试开通。',
                            en: 'Provisioning failed. Retry provisioning from the delivery drawer before running server actions.',
                            ja: '開通に失敗しました。サーバー操作の前に「提供とアプリ」ドロワーで再試行してください。',
                            ko: '개통에 실패했습니다. 서버 작업 전 "개통 및 앱" 드로어에서 다시 시도해 주세요.',
                          })
                          : runtimeTelemetryMessage
                            ? runtimeTelemetryMessage
                            : localizeMessage(locale, {
                              zh: '服务器映射尚未完成，暂不可执行服务器操作。',
                              en: 'Server mapping is not ready yet, so actions are currently unavailable.',
                              ja: 'サーバーマッピングが未完了のため、現在サーバー操作は利用できません。',
                              ko: '서버 매핑이 아직 완료되지 않아 현재 서버 작업을 사용할 수 없습니다.',
                            })}
                  </div>
                ) : null}

                <div className="service-subpanel-grid">
                  {(serverCapabilities.application.suspend || serverCapabilities.application.unsuspend || serverCapabilities.application.destroy) ? (
                    <section className="service-subpanel service-subpanel--danger">
                      <div className="service-subpanel__header">
                        <div className="stack-8">
                          <strong>{locale.startsWith('zh') ? '暂停 / 恢复 / 销毁' : 'Suspend / Unsuspend / Destroy'}</strong>
                          <p className="muted">
                            {localizeMessage(locale, {
                              zh: '这些操作会直接影响服务可用性，其中销毁是不可逆操作，请务必确认后再执行。',
                              en: 'These operations directly affect availability, and destroy is irreversible. Please confirm carefully before continuing.',
                              ja: 'これらの操作は可用性へ直接影響し、削除は元に戻せません。十分確認の上で実行してください。',
                              ko: '이 작업들은 가용성에 직접 영향을 주며, 삭제는 되돌릴 수 없습니다. 충분히 확인 후 진행해 주세요.',
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="action-grid action-grid--tight">
                        <button
                          className="button ghost"
                          disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.application.suspend}
                          type="button"
                          onClick={() => void runServerAction('suspend')}
                        >
                          {serverBusy === 'suspend'
                            ? `${text.common.pending}...`
                            : (locale.startsWith('zh') ? '暂停服务器' : 'Suspend server')}
                        </button>
                        <button
                          className="button ghost"
                          disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.application.unsuspend}
                          type="button"
                          onClick={() => void runServerAction('unsuspend')}
                        >
                          {serverBusy === 'unsuspend'
                            ? `${text.common.pending}...`
                            : (locale.startsWith('zh') ? '恢复服务器' : 'Unsuspend server')}
                        </button>
                        <button
                          className="button danger"
                          disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.application.destroy}
                          type="button"
                          onClick={() => void runServerAction('destroy')}
                        >
                          {serverBusy === 'destroy'
                            ? `${text.common.pending}...`
                            : (locale.startsWith('zh') ? '销毁服务器' : 'Destroy server')}
                        </button>
                      </div>
                    </section>
                  ) : null}

                  <section className="service-subpanel">
                    <div className="service-subpanel__header">
                      <div className="stack-8">
                        <strong>{locale.startsWith('zh') ? '密码与访问' : 'Password and access'}</strong>
                        <p className="muted">
                          {locale.startsWith('zh')
                            ? '把最近一次保存密码、登录账号和密码重置收在一起，避免你来回找入口。'
                            : 'Keep the latest password, login hint, and password reset workflow together in one place.'}
                        </p>
                      </div>
                    </div>

                    <div className="service-info-strip">
                      <div className="service-info-pill">
                        <span>{locale.startsWith('zh') ? '登录账号' : 'Login user'}</span>
                        <strong>{storedPasswordLoginUsername ?? '-'}</strong>
                      </div>
                      <div className="service-info-pill">
                        <span>{locale.startsWith('zh') ? '密码状态' : 'Password status'}</span>
                        <strong>
                          {storedPasswordRestartRequired
                            ? (locale.startsWith('zh') ? '需重启生效' : 'Restart required')
                            : storedPasswordAppliedLive
                              ? (locale.startsWith('zh') ? '已实时生效' : 'Applied live')
                              : (locale.startsWith('zh') ? '已保存' : 'Stored')}
                        </strong>
                      </div>
                    </div>

                    {storedPassword ? (
                      <div className="callout compact service-password-card service-password-card--embedded">
                        <div className="stack-8">
                          <strong>{locale.startsWith('zh') ? '最近保存的系统密码' : 'Most recently saved system password'}</strong>
                          <code className="service-password-card__code">{showStoredPassword ? storedPassword : '************'}</code>
                          <p className="muted">{storedPasswordStatusHint}</p>
                          <button
                            className="button ghost service-action-button"
                            type="button"
                            onClick={() => setShowStoredPassword((current) => !current)}
                          >
                            {showStoredPassword
                              ? localizeMessage(locale, {
                                zh: '隐藏密码',
                                en: 'Hide password',
                                ja: 'パスワードを隠す',
                                ko: '비밀번호 숨기기',
                              })
                              : localizeMessage(locale, {
                                zh: '显示密码',
                                en: 'Show password',
                                ja: 'パスワードを表示',
                                ko: '비밀번호 표시',
                              })}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="callout compact service-password-card service-password-card--embedded">
                        {localizeMessage(locale, {
                          zh: '当前没有可直接展示的保存密码。需要时请在这里重置并生成新密码。',
                          en: 'There is no saved password to display right now. Generate a new one here whenever you need it.',
                          ja: '現在表示できる保存済みパスワードはありません。必要なときはここで新しいパスワードを生成してください。',
                          ko: '지금 바로 보여 줄 저장 비밀번호는 없습니다. 필요할 때 여기에서 새 비밀번호를 생성하세요.',
                        })}
                      </div>
                    )}

                    <label className="field">
                      <span>{locale.startsWith('zh') ? '自定义新密码（可选）' : 'Custom new password (optional)'}</span>
                      <input
                        className="text-input"
                        minLength={8}
                        placeholder={locale.startsWith('zh')
                          ? '留空则系统自动生成；8-50 位且含大写/小写/数字/特殊字符'
                          : 'Leave empty to auto-generate; 8-50 chars with upper/lowercase, number, special'}
                        type="password"
                        value={serverPasswordDraft}
                        onChange={(event) => {
                          setServerPasswordDraft(event.target.value);
                          setServerActionError(null);
                        }}
                      />
                    </label>
                    <p className="muted">
                      {locale.startsWith('zh')
                        ? '密码规则：8-50 位，至少包含 1 个大写字母、1 个小写字母、1 个数字和 1 个特殊字符。'
                        : 'Password policy: 8-50 characters with at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.'}
                    </p>
                    {serverPasswordDraftError ? <div className="error-card compact">{serverPasswordDraftError}</div> : null}
                    <label className="checkbox-row">
                      <input
                        checked={serverPasswordAutoRestart}
                        type="checkbox"
                        onChange={(event) => setServerPasswordAutoRestart(event.target.checked)}
                      />
                      <span>{locale.startsWith('zh') ? '若模板要求重启，自动重启服务器' : 'Auto-restart if template requires reboot'}</span>
                    </label>
                    <button
                      className="button secondary service-action-button"
                      disabled={serverBusy !== null || !canRunServerActions || !(runtimeCapabilities?.actions.revealPassword ?? false) || Boolean(serverPasswordDraftError)}
                      type="button"
                      onClick={() => void runServerAction('reveal-password', {
                        customPassword: serverPasswordDraft,
                        autoRestart: serverPasswordAutoRestart,
                      })}
                    >
                      {serverBusy === 'reveal-password'
                        ? `${text.common.pending}...`
                        : (serverPasswordDraft.trim().length > 0
                          ? (locale.startsWith('zh') ? '按自定义密码重置' : 'Reset with custom password')
                          : ui.runtime.resetPassword)}
                    </button>

                    {revealedPassword ? (
                      <div className="callout compact service-password-card service-password-card--embedded">
                        <strong>{localizeMessage(locale, {
                          zh: '新密码（已保存）：',
                          en: 'New password (saved): ',
                          ja: '新しいパスワード（保存済み）: ',
                          ko: '새 비밀번호(저장됨): ',
                        })}</strong>
                        <code>{revealedPassword}</code>
                        {passwordRestartSuggested ? (
                          <div className="stack-8">
                            <p className="muted">
                              {localizeMessage(locale, {
                                zh: '该密码需要重启服务器后才会生效。',
                                en: 'This password requires a server restart before it takes effect.',
                                ja: 'このパスワードはサーバー再起動後に有効になります。',
                                ko: '이 비밀번호는 서버 재시작 후 적용됩니다.',
                              })}
                            </p>
                            <button
                              className="button ghost"
                              disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.power}
                              type="button"
                              onClick={() => void runServerAction('restart')}
                            >
                              {serverBusy === 'restart'
                                ? `${text.common.pending}...`
                                : localizeMessage(locale, {
                                  zh: '立即重启使密码生效',
                                  en: 'Restart now to apply password',
                                  ja: '今すぐ再起動して反映',
                                  ko: '지금 재시작하여 적용',
                                })}
                            </button>
                            {!serverCapabilities.actionBridge.power ? (
                              <p className="muted">
                                {localizeMessage(locale, {
                                  zh: '当前服务未暴露重启控制能力，请在上游面板或联系客服手动重启后再使用新密码登录。',
                                  en: 'This service does not expose restart control in the current mapping. Restart from upstream panel or ask support to restart before using the new password.',
                                  ja: '現在のマッピングでは再起動操作が公開されていません。上流パネルまたはサポート経由で再起動後に新パスワードをご利用ください。',
                                  ko: '현재 매핑에서는 재시작 제어가 노출되지 않습니다. 업스트림 패널 또는 고객센터를 통해 재시작 후 새 비밀번호를 사용해 주세요.',
                                })}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

                  <section className="service-subpanel service-subpanel--full">
                    <div className="service-subpanel__header">
                      <div className="stack-8">
                        <strong>{locale.startsWith('zh') ? '系统重装' : 'System reinstall'}</strong>
                        <p className="muted">
                          {locale.startsWith('zh')
                            ? '先选操作系统和组件，再执行重装。展开后才显示完整配置，默认只保留概要。'
                            : 'Choose the operating system and apps first, then run reinstall. The full composer appears only when expanded.'}
                        </p>
                      </div>
                      <button
                        className="button secondary service-action-button"
                        disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.reinstall}
                        type="button"
                        onClick={() => setShowReinstallComposer((current) => !current)}
                      >
                        {showReinstallComposer
                          ? (locale.startsWith('zh') ? '收起重装配置' : 'Hide reinstall config')
                          : (locale.startsWith('zh') ? '配置重装方案' : 'Configure reinstall')}
                      </button>
                    </div>

                    {canRunServerActions && !isArchivedService && !reinstallReady ? (
                      <div className="callout compact">
                        {localizeMessage(locale, {
                          zh: '当前服务还没有可用的系统模板映射，重装功能暂时不可用。',
                          en: 'No operating system mapping is available for this service yet, so reinstall is currently unavailable.',
                          ja: 'このサービスに利用可能な OS マッピングがまだないため、再インストールは現在利用できません。',
                          ko: '이 서비스에 사용 가능한 운영체제 매핑이 아직 없어 재설치를 현재 사용할 수 없습니다.',
                        })}
                      </div>
                    ) : null}

                    <div className="service-info-strip">
                      <div className="service-info-pill">
                        <span>{locale.startsWith('zh') ? '当前 OS' : 'Current OS'}</span>
                        <strong>{effectiveReinstallOs || '-'}</strong>
                      </div>
                      <div className="service-info-pill">
                        <span>{locale.startsWith('zh') ? '主应用' : 'Primary app'}</span>
                        <strong>{reinstallSelectedPrimaryDescriptor?.name ?? (locale.startsWith('zh') ? '未选择' : 'None')}</strong>
                      </div>
                      <div className="service-info-pill">
                        <span>{locale.startsWith('zh') ? '附加组件' : 'Addons'}</span>
                        <strong>{reinstallSelectedAddonDescriptors.length}</strong>
                      </div>
                    </div>

                    {!showReinstallComposer ? (
                      <div className="callout compact">
                        {locale.startsWith('zh')
                          ? '这里只显示当前重装方案概要。需要改系统、主应用或附加组件时，再展开完整配置。'
                          : 'This keeps only the current reinstall summary visible. Expand it when you need to change the OS, primary app, or addons.'}
                      </div>
                    ) : (
                      <div className="stack-12 danger-action-panel service-subpanel__composer">
                        <label className="field">
                          <span>{locale.startsWith('zh') ? '重装系统' : 'Reinstall OS'}</span>
                          <select
                            className="text-input select-input"
                            value={effectiveReinstallOs}
                            onChange={(event) => {
                              setReinstallMarketplaceHint(null);
                              setReinstallOsChoice(event.target.value);
                              setReinstallPrimaryAppChoice('');
                              setReinstallAddonAppChoices([]);
                            }}
                          >
                            <option value="">{locale.startsWith('zh') ? '请选择操作系统' : 'Choose an operating system'}</option>
                            {reinstallOsOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="callout compact">
                          <div className="chip-row">
                            <span className="chip">{locale.startsWith('zh') ? 'OS' : 'OS'}: {effectiveReinstallOs || '-'}</span>
                            <span className="chip">
                              {locale.startsWith('zh') ? '主应用' : 'Primary'}: {reinstallSelectedPrimaryDescriptor?.name ?? (locale.startsWith('zh') ? '未选择' : 'None')}
                            </span>
                            <span className="chip">
                              {locale.startsWith('zh') ? '附加组件' : 'Addons'}: {reinstallSelectedAddonDescriptors.length}
                            </span>
                          </div>
                          <p className="muted">
                            {locale.startsWith('zh')
                              ? '重装会先按所选 OS 重新装系统，再重新执行主应用与附加组件安装。'
                              : 'Reinstall rebuilds the VPS with the selected OS, then replays the selected primary app and addon installs.'}
                          </p>
                        </div>
                        {effectiveReinstallOs ? (
                          <div className="stack-12">
                            <div className="field">
                              <span>{locale.startsWith('zh') ? '主应用' : 'Primary app'}</span>
                              {reinstallMarketLoading ? (
                                <div className="loading-card">{text.common.loading}</div>
                              ) : reinstallPrimaryApps.length === 0 ? (
                                <div className="callout compact">
                                  {locale.startsWith('zh')
                                    ? '当前 OS 还没有可选主应用。你仍然可以只重装系统。'
                                    : 'No primary apps are currently available for this OS. You can still reinstall the base OS only.'}
                                </div>
                              ) : (
                                <div className="choice-grid">
                                  {reinstallPrimaryApps.map((app) => (
                                    <button
                                      className={`choice-card compact vps-app-card ${reinstallPrimaryAppChoice === app.slug ? 'selected' : ''}`}
                                      disabled={!app.available}
                                      key={app.slug}
                                      type="button"
                                      onClick={() => {
                                        setReinstallMarketplaceHint(null);
                                        setReinstallPrimaryAppChoice(reinstallPrimaryAppChoice === app.slug ? '' : app.slug);
                                      }}
                                    >
                                      <strong>{app.name}</strong>
                                      {app.tagline ? <span>{app.tagline}</span> : null}
                                      <small>{app.recipe?.effectiveInstallStrategy ?? app.recipe?.installStrategy ?? '-'}</small>
                                      {!app.available && app.unavailableReason ? <small>{app.unavailableReason}</small> : null}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="field">
                              <span>{locale.startsWith('zh') ? '附加组件' : 'Addon apps'}</span>
                              {reinstallMarketLoading ? (
                                <div className="loading-card">{text.common.loading}</div>
                              ) : reinstallAddonApps.length === 0 ? (
                                <div className="callout compact">
                                  {locale.startsWith('zh')
                                    ? '当前 OS 没有可用附加组件。'
                                    : 'No addon apps are currently available for this OS.'}
                                </div>
                              ) : (
                                <div className="choice-grid">
                                  {reinstallAddonApps.map((app) => (
                                    <button
                                      className={`choice-card compact vps-app-card ${reinstallAddonAppChoices.includes(app.slug) ? 'selected' : ''}`}
                                      disabled={!app.available}
                                      key={app.slug}
                                      type="button"
                                      onClick={() => {
                                        setReinstallMarketplaceHint(null);
                                        setReinstallAddonAppChoices((current) => current.includes(app.slug)
                                          ? current.filter((slug) => slug !== app.slug)
                                          : [...current, app.slug]);
                                      }}
                                    >
                                      <strong>{app.name}</strong>
                                      {app.tagline ? <span>{app.tagline}</span> : null}
                                      <small>{app.recipe?.effectiveInstallStrategy ?? app.recipe?.installStrategy ?? '-'}</small>
                                      {(app.recipe?.dependencies ?? []).length > 0 ? (
                                        <small>{locale.startsWith('zh') ? '依赖' : 'Depends on'}: {app.recipe?.dependencies.join(', ')}</small>
                                      ) : null}
                                      {(app.recipe?.conflicts ?? []).length > 0 ? (
                                        <small>{locale.startsWith('zh') ? '冲突' : 'Conflicts'}: {app.recipe?.conflicts.join(', ')}</small>
                                      ) : null}
                                      {!app.available && app.unavailableReason ? <small>{app.unavailableReason}</small> : null}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                        {reinstallMarketplaceHint ? <div className="callout compact">{reinstallMarketplaceHint}</div> : null}
                        {reinstallMarketError ? <div className="error-card compact">{reinstallMarketError}</div> : null}
                        {reinstallSelectionError ? <div className="error-card compact">{reinstallSelectionError}</div> : null}
                        <label className="field">
                          <span>{ui.runtime.reinstallPassword}</span>
                          <input
                            className="text-input"
                            placeholder={locale.startsWith('zh')
                              ? '留空则系统自动生成；8-50 位且含大写/小写/数字/特殊字符'
                              : 'Leave empty to auto-generate; 8-50 chars with upper/lowercase, number, special'}
                            type="password"
                            value={reinstallPassword}
                            onChange={(event) => {
                              setReinstallPassword(event.target.value);
                              setServerActionError(null);
                            }}
                          />
                        </label>
                        <p className="muted">
                          {locale.startsWith('zh')
                            ? '如果你想在重装后保留固定密码，这里填写符合策略的新密码。'
                            : 'If you want a fixed password after reinstall, enter a password here that matches the policy.'}
                        </p>
                        {reinstallPasswordError ? <div className="error-card compact">{reinstallPasswordError}</div> : null}
                        <label className="checkbox-row">
                          <input
                            checked={reinstallStartOnCompletion}
                            onChange={(event) => setReinstallStartOnCompletion(event.target.checked)}
                            type="checkbox"
                          />
                          <span>{ui.runtime.startOnCompletion}</span>
                        </label>
                        <button
                          className="button danger service-action-button--danger"
                          disabled={serverBusy !== null || !canRunServerActions || !serverCapabilities.actionBridge.reinstall || !reinstallReady || Boolean(reinstallSelectionError) || Boolean(reinstallPasswordError)}
                          type="button"
                          onClick={() => void runServerAction('reinstall')}
                        >
                          {serverBusy === 'reinstall' ? `${text.common.pending}...` : ui.runtime.reinstall}
                        </button>
                      </div>
                    )}
                  </section>
                </div>
              </article>
            </div>
          </details>

          <details className="service-drawer service-drawer--panel">
            <summary>{locale.startsWith('zh') ? '账务与配置' : 'Billing and configuration'}</summary>
            <div className="service-drawer__body">
              <article className="panel stack-16 service-billing-panel">
                <div className="service-section-intro">
                  <div className="stack-8">
                    <p className="eyebrow">{locale.startsWith('zh') ? '账务与配置' : 'Billing and configuration'}</p>
                    <h3>{locale.startsWith('zh') ? '把续费、取消、标签和账单收进一个侧栏' : 'Keep renewal, cancellation, labels, and invoices in one sidebar'}</h3>
                  </div>
                </div>

                <div className="service-meta-grid service-meta-grid--compact service-billing-panel__summary">
                  {billingSummaryItems.map((item) => (
                    <div className="service-meta-card" key={item.key}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>

                <div className="service-subpanel-grid">
                  <section className="service-subpanel">
                    <div className="service-subpanel__header">
                      <div className="stack-8">
                        <strong>{locale.startsWith('zh') ? '续费与取消' : 'Renewal and cancellation'}</strong>
                        <p className="muted">
                          {locale.startsWith('zh')
                            ? '把续费和取消服务放到一组，避免账务动作散落在页面各处。'
                            : 'Keep renewal and cancellation together so billing actions do not feel scattered.'}
                        </p>
                      </div>
                    </div>
                    <div className="action-grid action-grid--tight">
                      <button
                        className="button ghost service-action-button"
                        disabled={renewingService || !canRenewService}
                        type="button"
                        onClick={() => void renewService()}
                      >
                        {renewingService
                          ? ui.services.renewing
                          : ui.services.renewService}
                      </button>
                      <button
                        className="button ghost service-action-button service-action-button--muted"
                        type="button"
                        onClick={() => setShowBillingActions((current) => !current)}
                      >
                        {showBillingActions
                          ? (locale.startsWith('zh') ? '收起取消服务' : 'Hide cancellation')
                          : (locale.startsWith('zh') ? '取消服务（需密码确认）' : 'Cancel service (password required)')}
                      </button>
                    </div>
                    {!canRenewService ? (
                      <p className="muted">
                        {provisioningInFlight
                          ? ui.services.renewAfterProvisioning
                          : (serviceCancellation
                            ? ui.services.cancelUnavailableState
                            : (hasPendingInvoice
                              ? ui.services.pendingInvoiceHint
                              : ui.services.cancelUnavailableState))}
                      </p>
                    ) : null}
                    {showBillingActions ? (
                      <div className="stack-12">
                        <label className="field">
                          <span>{ui.services.cancelType}</span>
                          <select
                            className="text-input select-input"
                            disabled={!canCancelService}
                            value={cancelType}
                            onChange={(event) => setCancelType(event.target.value as 'end_of_period' | 'immediate')}
                          >
                            <option value="end_of_period">{ui.services.cancelEndPeriod}</option>
                            <option value="immediate">{ui.services.cancelImmediate}</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>{text.services.cancel}</span>
                          <input
                            className="text-input"
                            disabled={!canCancelService}
                            placeholder={canCancelService ? ui.services.cancelReason : ''}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span>{locale.startsWith('zh') ? '账号当前密码（必填）' : 'Current account password (required)'}</span>
                          <input
                            className="text-input"
                            disabled={!canCancelService}
                            minLength={8}
                            type="password"
                            value={cancelPassword}
                            onChange={(event) => {
                              setCancelPassword(event.target.value);
                              setCancelActionError(null);
                            }}
                          />
                        </label>
                        {cancelActionError ? <div className="error-card compact">{cancelActionError}</div> : null}
                        <button
                          className="button danger service-action-button service-action-button--danger"
                          disabled={pending || !canCancelService}
                          type="button"
                          onClick={() => void cancelService()}
                        >
                          {text.services.cancel}
                        </button>
                        {serviceCancellation ? (
                          <div className="stack-8">
                            <p className="muted">
                              {ui.services.cancelType}: {localizeCancellationType(serviceCancellation.type, locale, ui)}
                              {serviceCancellation.reason
                                ? ` | ${ui.services.cancelReason}: ${localizeCancellationReason(serviceCancellation.reason, locale)}`
                                : ''}
                            </p>
                            <button
                              className="button ghost service-action-button"
                              disabled={revokingCancellation || provisioningInFlight}
                              type="button"
                              onClick={() => void revokeCancellation()}
                            >
                              {revokingCancellation
                                ? ui.common.pending
                                : ui.services.revokeCancellation}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

                  <section className="service-subpanel">
                    <div className="service-subpanel__header">
                      <div className="stack-8">
                        <strong>{locale.startsWith('zh') ? '标签与展示信息' : 'Label and display info'}</strong>
                        <p className="muted">
                          {locale.startsWith('zh')
                            ? '这里只负责你在前台看到的服务名称，不影响机器本身运行。'
                            : 'This only changes how the service is labeled in the client area. It does not affect the machine runtime.'}
                        </p>
                      </div>
                    </div>
                    <label className="field">
                      <span>{text.services.updateLabel}</span>
                      <input className="text-input" value={label} onChange={(event) => setLabel(event.target.value)} />
                    </label>
                    <button className="button ghost service-action-button" disabled={pending} type="button" onClick={() => void updateLabel()}>
                      {text.services.updateLabel}
                    </button>
                  </section>

                  <section className="service-subpanel service-subpanel--full">
                    <div className="service-subpanel__header">
                      <div className="stack-8">
                        <strong>{locale.startsWith('zh') ? '同节点续费升降配' : 'Same-node resize on renewal'}</strong>
                        <p className="muted">
                          {locale.startsWith('zh')
                            ? '升降配和续费账单放在一块，避免配置变更和付款入口分散。'
                            : 'Keep resize and invoice creation in one place so configuration changes and billing stay connected.'}
                        </p>
                      </div>
                    </div>
                    {service.upgradable ? (
                      <>
                        {upgradeOptionsLoading ? (
                          <div className="loading-card">{text.common.loading}</div>
                        ) : upgradeOptionsError ? (
                          <div className="error-card compact">{upgradeOptionsError}</div>
                        ) : upgradeProducts.length === 0 ? (
                          <div className="callout compact">
                            {locale.startsWith('zh')
                              ? '当前账期没有可用的升降配选项。'
                              : 'No upgrade options are available for the current billing cycle.'}
                          </div>
                        ) : (
                          <div className="stack-12">
                            {upgradeProducts.length > 1 ? (
                              <label className="field">
                                <span>{locale.startsWith('zh') ? '套餐规格' : 'Plan target'}</span>
                                <select
                                  className="text-input select-input"
                                  value={selectedUpgradeProductId}
                                  onChange={(event) => setSelectedUpgradeProductId(event.target.value)}
                                >
                                  {upgradeProducts.map((product) => (
                                    <option key={String(product.id)} value={String(product.id)}>
                                      {localizeText(product.name, locale, String(product.slug ?? product.id))}
                                      {product.current ? ` (${locale.startsWith('zh') ? '当前' : 'Current'})` : ''}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : null}
                            {selectedUpgradeOptions.map((option) => (
                              <label className="field" key={String(option.id)}>
                                <span>{localizeText(option.name, locale, String(option.id))}</span>
                                <select
                                  className="text-input select-input"
                                  value={selectedUpgradeConfig[String(option.id)] ?? ''}
                                  onChange={(event) => setSelectedUpgradeConfig((current) => ({
                                    ...current,
                                    [String(option.id)]: event.target.value,
                                  }))}
                                >
                                  {asArray<ServiceUpgradeOptionChoice>(option.children).map((choice) => (
                                    <option key={String(choice.id)} value={String(choice.id)}>
                                      {localizeText(choice.name, locale, String(choice.id))}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ))}
                            <button
                              className="button ghost service-action-button"
                              disabled={upgradingService || !canUpgradeService}
                              type="button"
                              onClick={() => void submitUpgrade()}
                            >
                              {upgradingService
                                ? `${text.common.pending}...`
                                : (locale.startsWith('zh') ? '提交升降配并生成账单' : 'Submit resize and create invoice')}
                            </button>
                            {!canUpgradeService ? (
                              <p className="muted">
                                {locale.startsWith('zh')
                                  ? '请选择与当前不同的规格或配置后再提交。'
                                  : 'Choose a different plan/configuration before submitting.'}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="callout compact">
                        {locale.startsWith('zh')
                          ? '当前服务不支持在线升降配。'
                          : 'This service does not support online resize.'}
                      </div>
                    )}
                  </section>

                  <section className="service-subpanel service-subpanel--full">
                    <div className="service-subpanel__header">
                      <div className="stack-8">
                        <strong>{locale.startsWith('zh') ? '账单记录' : 'Invoice records'}</strong>
                        <p className="muted">
                          {locale.startsWith('zh')
                            ? '账单入口收在这里，默认只展示简洁列表。'
                            : 'Invoice access stays here as a compact list instead of taking over the whole page.'}
                        </p>
                      </div>
                    </div>
                    {invoices.length === 0 ? (
                      <div className="callout compact">{text.invoices.noInvoices}</div>
                    ) : (
                      <div className="service-link-stack">
                        {invoices.map((invoice) => (
                          <Link className="service-link-card" key={invoice.id} to={`/invoices/${invoice.id}`}>
                            <strong>#{invoice.number ?? invoice.id}</strong>
                            <span>{invoice.formattedTotal}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                {message ? <div className="callout compact">{message}</div> : null}
                {actionError ? <div className="error-card compact">{actionError}</div> : null}
              </article>
            </div>
          </details>
        </section>
      )}

      {isManagedRuntime ? (
        <section className="panel stack-16">
          <p className="eyebrow">{ui.services.provisioning}</p>
          {provisioningLoading ? (
            <div className="loading-card">{text.common.loading}</div>
          ) : provisioningError ? (
            <div className="error-card">{provisioningError}</div>
          ) : (
            <>
              <div className={`callout ${provisioningTone(provisioningStatus) === 'failed' ? 'error-card compact' : 'compact'}`}>
                <strong>{provisioningLabel}</strong>
                {showProvisioningErrorDetails && provisioning?.errorMessage ? <p className="muted">{provisioning.errorMessage}</p> : null}
                {showProvisioningErrorDetails && provisioning?.errorCode ? <p className="muted">{ui.runtime.errorCode}: {provisioning.errorCode}</p> : null}
                <p className="muted">
                  {ui.common.lastAttempt}: {provisioningAttemptLabel}
                  {' | '}
                  {ui.runtime.attempts}: {provisioning?.attemptCount ?? 0}
                </p>
              </div>
              {provisioningCanRetry ? (
                <div className="stack-12">
                  <button
                    className="button ghost service-action-button"
                    disabled={retryingProvisioning}
                    type="button"
                    onClick={() => void retryProvisioning()}
                  >
                    {retryingProvisioning
                      ? ui.common.retrying
                      : ui.runtime.retryProvisioning}
                  </button>
                </div>
              ) : null}
              {provisioningMessage ? <div className="callout compact">{provisioningMessage}</div> : null}
            </>
          )}
        </section>
      ) : null}

      {isManagedRuntime ? (
        <section className="two-column">
          <article className="panel stack-16 service-billing-panel">
            <p className="eyebrow">{locale.startsWith('zh') ? '账单、标签与配置调整（次要操作）' : 'Billing, labels, and configuration changes'}</p>
            <div className="detail-grid">
              <div>
                <span>{text.common.status}</span>
                <strong>
                  <span className={`status-pill ${uiStatusClassName(serviceDisplayStatus)}`}>
                    {serviceLifecycleStatusLabel}
                  </span>
                </strong>
              </div>
              <div><span>{text.common.total}</span><strong>{service.formattedPrice}</strong></div>
            </div>

            <label className="field">
              <span>{text.services.updateLabel}</span>
              <input className="text-input" value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <button className="button ghost service-action-button" disabled={pending} type="button" onClick={() => void updateLabel()}>
              {text.services.updateLabel}
            </button>

            {service.upgradable ? (
              <div className="stack-12">
                <p className="eyebrow">{locale.startsWith('zh') ? '同节点续费升降配' : 'Same-node resize on renewal'}</p>
                {upgradeOptionsLoading ? (
                  <div className="loading-card">{text.common.loading}</div>
                ) : upgradeOptionsError ? (
                  <div className="error-card compact">{upgradeOptionsError}</div>
                ) : upgradeProducts.length === 0 ? (
                  <div className="callout compact">
                    {locale.startsWith('zh')
                      ? '当前账期没有可用的升降配选项。'
                      : 'No upgrade options are available for the current billing cycle.'}
                  </div>
                ) : (
                  <div className="stack-12">
                    {upgradeProducts.length > 1 ? (
                      <label className="field">
                        <span>{locale.startsWith('zh') ? '套餐规格' : 'Plan target'}</span>
                        <select
                          className="text-input select-input"
                          value={selectedUpgradeProductId}
                          onChange={(event) => setSelectedUpgradeProductId(event.target.value)}
                        >
                          {upgradeProducts.map((product) => (
                            <option key={String(product.id)} value={String(product.id)}>
                              {localizeText(product.name, locale, String(product.slug ?? product.id))}
                              {product.current ? ` (${locale.startsWith('zh') ? '当前' : 'Current'})` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {selectedUpgradeOptions.map((option) => (
                      <label className="field" key={String(option.id)}>
                        <span>{localizeText(option.name, locale, String(option.id))}</span>
                        <select
                          className="text-input select-input"
                          value={selectedUpgradeConfig[String(option.id)] ?? ''}
                          onChange={(event) => setSelectedUpgradeConfig((current) => ({
                            ...current,
                            [String(option.id)]: event.target.value,
                          }))}
                        >
                          {asArray<ServiceUpgradeOptionChoice>(option.children).map((choice) => (
                            <option key={String(choice.id)} value={String(choice.id)}>
                              {localizeText(choice.name, locale, String(choice.id))}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    <button
                      className="button ghost service-action-button"
                      disabled={upgradingService || !canUpgradeService}
                      type="button"
                      onClick={() => void submitUpgrade()}
                    >
                      {upgradingService
                        ? `${text.common.pending}...`
                        : (locale.startsWith('zh') ? '提交升降配并生成账单' : 'Submit resize and create invoice')}
                    </button>
                    {!canUpgradeService ? (
                      <p className="muted">
                        {locale.startsWith('zh')
                          ? '请选择与当前不同的规格或配置后再提交。'
                          : 'Choose a different plan/configuration before submitting.'}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <div className="callout compact">
                {locale.startsWith('zh')
                  ? '当前服务不支持在线升降配。'
                  : 'This service does not support online resize.'}
              </div>
            )}
          </article>

          <article className="panel stack-12">
            <p className="eyebrow">{text.nav.invoices}</p>
            {invoices.length === 0 ? (
              <div className="callout compact">{text.invoices.noInvoices}</div>
            ) : invoices.map((invoice) => (
              <Link className="callout compact" key={invoice.id} to={`/invoices/${invoice.id}`}>
                #{invoice.number ?? invoice.id} - {invoice.formattedTotal}
              </Link>
            ))}
          </article>
        </section>
      ) : null}

      {isManagedRuntime ? (
        <section className="panel stack-12">
          <p className="eyebrow">{ui.runtime.applicationLogs}</p>
          {managedRuntimeLogsLoading ? (
            <div className="loading-card">{text.common.loading}</div>
          ) : managedRuntimeLogsError ? (
            <div className="error-card">{managedRuntimeLogsError}</div>
          ) : managedRuntimeLogsLines.length === 0 ? (
            <div className="callout compact">
              {ui.runtime.applicationLogsEmpty}
            </div>
          ) : (
            <div className="stack-8">
              {managedRuntimeLogsLines.map((entry, index) => (
                <code key={`${index}-${entry.line}`}>{managedLogLabel(entry.line, locale)}</code>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {isManagedRuntime ? (
        <section className="panel stack-12">
          <p className="eyebrow">{ui.runtime.recentLogs}</p>
          {recentOperationLogs.length === 0 ? (
            <div className="callout compact">
              {ui.runtime.noOperationLogs}
            </div>
          ) : recentOperationLogs.map((log) => (
            <div className="operation-log" key={log.operationId || log.id}>
              <div className="operation-log__header">
                <strong>{uiOperationActionLabel(log.action, locale)}</strong>
                <span className={`status-pill ${log.success === true ? 'status-active' : log.success === false ? 'status-cancelled' : 'status-pending'}`}>
                  {uiOperationOutcomeLabel(log.success ?? null, locale)}
                </span>
              </div>
              <p className="muted">
                {formatDate(log.createdAt)}
                {log.operationId ? ` | ${ui.common.operationId}: ${log.operationId}` : ''}
              </p>
              {log.message ? <p>{localizeBackendMessage(log.message, locale) || log.message}</p> : null}
              {log.code ? <p className="muted">{ui.runtime.errorCode}: {log.code}</p> : null}
              {log.detail && log.detail !== log.message ? (
                <p className="muted">{localizeBackendMessage(log.detail, locale) || log.detail}</p>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

