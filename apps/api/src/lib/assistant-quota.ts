import { createHash, createHmac, randomBytes } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';
import Redis from 'ioredis';

import type { ServiceSummary } from './types.js';

export type AssistantQuotaTier = 'guest' | 'free' | 'paid' | 'unlimited';

export type AssistantModelCostTier = 'lite' | 'standard' | 'premium' | 'ultra';

export interface AssistantQuotaSnapshot {
  tier: AssistantQuotaTier;
  dailyLimit: number | null;
  dailyTokenLimit: number | null;
  usedPoints: number;
  usedTokens: number;
  remainingPoints: number | null;
  remainingTokens: number | null;
  resetAt: string;
  unlimited: boolean;
}

export interface AssistantUpgradeCta {
  kind: 'login' | 'catalog' | 'unlimited';
  href: string;
  label: string;
  description: string;
}

export interface AssistantQuotaContext {
  actorKey: string;
  snapshot: AssistantQuotaSnapshot;
  upgradeCta: AssistantUpgradeCta | null;
}

export interface AssistantResolvedModelCost {
  id: string;
  label: string;
  costPoints: number;
  routingWeight: number;
  costTier: AssistantModelCostTier;
}

export interface AssistantQuotaServiceOptions {
  redisUrl?: string | null;
  guestDailyPoints: number;
  freeDailyPoints: number;
  paidDailyPoints: number;
  guestBurstPerMinute: number;
  userBurstPerMinute: number;
  unlimitedProductSlug: string;
  guestCookieName?: string;
  guestCookieSecret?: string | null;
  siteTimeZone?: string | null;
  logger?: {
    info: (payload: unknown, message?: string) => void;
    warn: (payload: unknown, message?: string) => void;
    error: (payload: unknown, message?: string) => void;
  };
}

export interface AssistantQuotaContextInput {
  request: FastifyRequest;
  reply: FastifyReply;
  locale: string;
  authenticated: boolean;
  userId: string | null;
  token: string | null;
  listServices: (token: string, status?: string, perPage?: number) => Promise<{ data: ServiceSummary[] }>;
}

export interface AssistantQuotaCheckInput {
  actorKey: string;
  locale: string;
  authenticated: boolean;
  snapshot: AssistantQuotaSnapshot;
  model: AssistantResolvedModelCost;
  upgradeCta: AssistantUpgradeCta | null;
}

type Logger = NonNullable<AssistantQuotaServiceOptions['logger']>;

type CachedEntitlement = {
  tier: AssistantQuotaTier;
  cachedAt: string;
};

type MemoryRecord = {
  value: string;
  expiresAt: number;
};

const defaultLogger: Logger = {
  info: (_payload: unknown, _message?: string) => undefined,
  warn: (_payload: unknown, _message?: string) => undefined,
  error: (_payload: unknown, _message?: string) => undefined,
};

function normalizeWhitespace(input: string) {
  return input.replace(/\s+/g, ' ').trim();
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

function parseNumber(value: string | null) {
  if (value === null) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUserAgent(value: string | null | undefined) {
  return normalizeWhitespace(String(value ?? ''))
    .toLowerCase()
    .replace(/\d+(?:\.\d+)+/g, 'x')
    .slice(0, 140) || 'unknown-agent';
}

function normalizeIpv4(value: string) {
  const matched = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (!matched) {
    return value;
  }

  return `${matched[1]}.${matched[2]}.${matched[3]}.0`;
}

function normalizeIpv6(value: string) {
  const parts = value.split(':').filter((part) => part !== '');
  if (parts.length === 0) {
    return value;
  }

  return `${parts.slice(0, 4).join(':')}::`;
}

function pickForwardedIp(header: string | string[] | undefined) {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) {
    return null;
  }

  return normalizeWhitespace(raw.split(',')[0] ?? '') || null;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function parseShortOffset(value: string) {
  if (value === 'GMT' || value === 'UTC') {
    return 0;
  }

  const matched = value.match(/^GMT([+-]\d{1,2})(?::?(\d{2}))?$/i);
  if (!matched) {
    return 0;
  }

  const sign = matched[1]?.startsWith('-') ? -1 : 1;
  const hours = Math.abs(Number(matched[1] ?? '0'));
  const minutes = Number(matched[2] ?? '0');
  return sign * ((hours * 60) + minutes);
}

function inferCostTier(modelLabel: string) {
  const normalized = modelLabel.toLowerCase();

  if (/(?:ultra|opus|max|4\.5|maxi)/.test(normalized)) {
    return 'ultra' as const;
  }

  if (/(?:pro|sonnet|high|gpt-5|claude-4|3\.1-pro|reasoning)/.test(normalized)) {
    return 'premium' as const;
  }

  if (/(?:flash-lite|lite|mini|nano|haiku|small)/.test(normalized)) {
    return 'lite' as const;
  }

  return 'standard' as const;
}

function costPointsForTier(tier: AssistantModelCostTier) {
  switch (tier) {
    case 'lite':
      return 4_000;
    case 'premium':
      return 32_000;
    case 'ultra':
      return 80_000;
    default:
      return 12_000;
  }
}

function routingWeightForTier(tier: AssistantModelCostTier) {
  switch (tier) {
    case 'lite':
      return 1;
    case 'premium':
      return 8;
    case 'ultra':
      return 20;
    default:
      return 3;
  }
}

export function resolveAssistantModelCost(input: {
  id: string;
  label: string;
  overrideCostPoints?: number | null;
  overrideCostTier?: AssistantModelCostTier | null;
}): AssistantResolvedModelCost {
  const costTier = input.overrideCostTier ?? inferCostTier(input.label);
  const costPoints = input.overrideCostPoints ?? costPointsForTier(costTier);

  return {
    id: input.id,
    label: input.label,
    costPoints,
    routingWeight: routingWeightForTier(costTier),
    costTier,
  };
}

export class AssistantQuotaError extends Error {
  statusCode: number;
  payload: Record<string, unknown>;

  constructor(message: string, statusCode: number, payload: Record<string, unknown>) {
    super(message);
    this.name = 'AssistantQuotaError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

export class AssistantQuotaService {
  private redis: Redis | null;
  private redisReady = false;
  private readonly memory = new Map<string, MemoryRecord>();
  private readonly guestCookieName: string;
  private readonly guestCookieSecret: string;
  private readonly timeZone: string;
  private readonly logger: Logger;
  private readonly options: AssistantQuotaServiceOptions;

  constructor(options: AssistantQuotaServiceOptions) {
    this.options = options;
    this.logger = options.logger ?? defaultLogger;
    this.guestCookieName = options.guestCookieName ?? 'sloth_assistant_guest';
    this.guestCookieSecret = normalizeWhitespace(options.guestCookieSecret ?? '') || randomBytes(32).toString('hex');
    this.timeZone = normalizeWhitespace(options.siteTimeZone ?? '')
      || normalizeWhitespace(process.env.TZ ?? '')
      || Intl.DateTimeFormat().resolvedOptions().timeZone
      || 'UTC';
    const redisUrl = normalizeWhitespace(options.redisUrl ?? '');
    this.redis = redisUrl
      ? new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
      })
      : null;
  }

  async close() {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.quit();
    } catch {
      // Ignore shutdown errors while the process is exiting.
    }
  }

  async getQuotaContext(input: AssistantQuotaContextInput): Promise<AssistantQuotaContext> {
    const actorKey = input.authenticated && input.userId
      ? `user:${input.userId}`
      : this.resolveGuestActor(input.request, input.reply);
    const snapshot = await this.getSnapshot({
      actorKey,
      authenticated: input.authenticated,
      userId: input.userId,
      token: input.token,
      listServices: input.listServices,
    });

    return {
      actorKey,
      snapshot,
      upgradeCta: this.buildUpgradeCta(snapshot, input.locale, input.authenticated),
    };
  }

  async assertCanUse(input: AssistantQuotaCheckInput) {
    const rate = await this.bumpBurstCounter(input.actorKey, input.authenticated);
    if (rate.count > rate.limit) {
      throw new AssistantQuotaError(
        localize(input.locale, {
          zh: '请求过于频繁，请稍后再试。',
          en: 'Too many assistant requests. Please wait a moment and try again.',
          ja: 'リクエストが多すぎます。少し待ってから再試行してください。',
          ko: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        }),
        429,
        {
          code: 'ASSISTANT_RATE_LIMITED',
          detail: localize(input.locale, {
            zh: `你在一分钟内发送了过多请求，请在 ${rate.retryAfterSeconds} 秒后重试。`,
            en: `You sent too many requests in one minute. Retry in ${rate.retryAfterSeconds} seconds.`,
            ja: `1 分間のリクエストが多すぎます。${rate.retryAfterSeconds} 秒後に再試行してください。`,
            ko: `1분 내 요청이 너무 많습니다. ${rate.retryAfterSeconds}초 후 다시 시도해 주세요.`,
          }),
          retryAfterSeconds: rate.retryAfterSeconds,
          quota: input.snapshot,
          upgradeCta: input.upgradeCta,
        },
      );
    }

    if (input.snapshot.unlimited) {
      return;
    }

    const remainingTokens = input.snapshot.remainingTokens ?? input.snapshot.remainingPoints ?? 0;
    if (remainingTokens < input.model.costPoints) {
      throw new AssistantQuotaError(
        localize(input.locale, {
          zh: '今日可用 Token 已不足。',
          en: 'Your available assistant tokens for today are too low.',
          ja: '本日利用できるトークンが不足しています。',
          ko: '오늘 사용할 수 있는 토큰이 부족합니다.',
        }),
        429,
        {
          code: 'ASSISTANT_QUOTA_EXCEEDED',
          detail: localize(input.locale, {
            zh: `当前模型 ${input.model.label} 预计至少需要 ${input.model.costPoints} tokens，你今天还剩 ${remainingTokens} tokens。`,
            en: `The selected model ${input.model.label} needs at least ${input.model.costPoints} tokens, and you have ${remainingTokens} tokens left today.`,
            ja: `選択中のモデル ${input.model.label} には少なくとも ${input.model.costPoints} tokens が必要ですが、本日の残りは ${remainingTokens} tokens です。`,
            ko: `선택한 모델 ${input.model.label}에는 최소 ${input.model.costPoints} tokens가 필요하지만 오늘 남은 양은 ${remainingTokens} tokens입니다.`,
          }),
          requiredTokens: input.model.costPoints,
          quota: input.snapshot,
          upgradeCta: input.upgradeCta,
        },
      );
    }
  }

  async recordUsage(input: {
    actorKey: string;
    snapshot: AssistantQuotaSnapshot;
    chargedTokens: number;
  }) {
    if (input.snapshot.unlimited || input.chargedTokens <= 0) {
      return input.snapshot;
    }

    const window = this.getQuotaWindow();
    const nextUsedPoints = await this.incrementBy(
      this.dayKey(input.actorKey, window.dayKey),
      input.chargedTokens,
      window.expiresInSeconds,
    );
    const dailyLimit = input.snapshot.dailyLimit ?? 0;

    return {
      ...input.snapshot,
      dailyTokenLimit: dailyLimit,
      usedPoints: nextUsedPoints,
      usedTokens: nextUsedPoints,
      remainingPoints: Math.max(dailyLimit - nextUsedPoints, 0),
      remainingTokens: Math.max(dailyLimit - nextUsedPoints, 0),
      resetAt: window.resetAtIso,
    } satisfies AssistantQuotaSnapshot;
  }

  private async getSnapshot(input: {
    actorKey: string;
    authenticated: boolean;
    userId: string | null;
    token: string | null;
    listServices: AssistantQuotaContextInput['listServices'];
  }) {
    const tier = await this.resolveTier(input);
    const window = this.getQuotaWindow();
    const dailyLimit = this.dailyLimitForTier(tier);
    const usedPoints = dailyLimit === null
      ? 0
      : await this.getCounter(this.dayKey(input.actorKey, window.dayKey));
    const usedTokens = usedPoints;

    return {
      tier,
      dailyLimit,
      dailyTokenLimit: dailyLimit,
      usedPoints,
      usedTokens,
      remainingPoints: dailyLimit === null ? null : Math.max(dailyLimit - usedPoints, 0),
      remainingTokens: dailyLimit === null ? null : Math.max(dailyLimit - usedPoints, 0),
      resetAt: window.resetAtIso,
      unlimited: tier === 'unlimited',
    } satisfies AssistantQuotaSnapshot;
  }

  private async resolveTier(input: {
    authenticated: boolean;
    userId: string | null;
    token: string | null;
    listServices: AssistantQuotaContextInput['listServices'];
  }) {
    if (!input.authenticated || !input.userId || !input.token) {
      return 'guest' as const;
    }

    const cacheKey = `assistant:quota:entitlement:${input.userId}`;
    const cached = await this.readJson<CachedEntitlement>(cacheKey);
    if (cached?.tier) {
      return cached.tier;
    }

    const [active, suspended] = await Promise.all([
      input.listServices(input.token, 'active', 200).catch(() => ({ data: [] })),
      input.listServices(input.token, 'suspended', 200).catch(() => ({ data: [] })),
    ]);

    const seen = new Map<string, ServiceSummary>();
    for (const service of [...active.data, ...suspended.data]) {
      if (service?.id) {
        seen.set(service.id, service);
      }
    }

    const services = [...seen.values()];
    const tier = services.some((service) => this.isUnlimitedService(service))
      ? 'unlimited'
      : services.some((service) => this.isPaidEntitledService(service))
        ? 'paid'
        : 'free';

    await this.writeJson(cacheKey, {
      tier,
      cachedAt: new Date().toISOString(),
    } satisfies CachedEntitlement, 60);

    return tier;
  }

  private isUnlimitedService(service: ServiceSummary) {
    const status = normalizeWhitespace(service.status).toLowerCase();
    const slug = normalizeWhitespace(service.product?.slug ?? '').toLowerCase();
    return (status === 'active' || status === 'suspended')
      && slug === this.options.unlimitedProductSlug.toLowerCase();
  }

  private isPaidEntitledService(service: ServiceSummary) {
    const status = normalizeWhitespace(service.status).toLowerCase();
    const planType = normalizeWhitespace(service.plan?.type ?? '').toLowerCase();
    return (status === 'active' || status === 'suspended')
      && !this.isUnlimitedService(service)
      && planType !== 'free'
      && service.price > 0;
  }

  private dailyLimitForTier(tier: AssistantQuotaTier) {
    switch (tier) {
      case 'guest':
        return this.options.guestDailyPoints;
      case 'free':
        return this.options.freeDailyPoints;
      case 'paid':
        return this.options.paidDailyPoints;
      default:
        return null;
    }
  }

  private buildUpgradeCta(snapshot: AssistantQuotaSnapshot, locale: string, authenticated: boolean) {
    if (snapshot.unlimited) {
      return null;
    }

    if (!authenticated || snapshot.tier === 'guest') {
      return {
        kind: 'login',
        href: '/login',
        label: localize(locale, {
          zh: '登录后解锁更高 Token',
          en: 'Log in for more tokens',
          ja: 'ログインしてより多くの Tokens を解放',
          ko: '로그인 후 더 높은 Token 사용',
        }),
        description: localize(locale, {
          zh: '游客仅可少量试用，登录后可获得正式账户 Token 配额。',
          en: 'Guests only get a small trial. Sign in to unlock account-level token allowance.',
          ja: 'ゲストは少量の試用のみです。ログインすると正式な token 枠が有効になります。',
          ko: '게스트는 소량 체험만 가능합니다. 로그인하면 계정 단위 token 한도를 사용할 수 있습니다.',
        }),
      } satisfies AssistantUpgradeCta;
    }

    if (snapshot.tier === 'free') {
      return {
        kind: 'catalog',
        href: '/catalog',
        label: localize(locale, {
          zh: '购买商品后提升 Token',
          en: 'Buy a service for more tokens',
          ja: 'サービス購入で token 枠を拡大',
          ko: '서비스 구매 후 token 확장',
        }),
        description: localize(locale, {
          zh: '拥有活跃付费服务后，机器人每日 Token 配额会明显提升。',
          en: 'An active paid service automatically unlocks a much larger daily assistant token allowance.',
          ja: '有効な有料サービスがあると、日次アシスタント token 枠が大きく増えます。',
          ko: '활성 유료 서비스를 보유하면 일일 도우미 token 한도가 크게 늘어납니다.',
        }),
      } satisfies AssistantUpgradeCta;
    }

    return {
      kind: 'unlimited',
      href: `/product/${encodeURIComponent(this.options.unlimitedProductSlug)}`,
      label: localize(locale, {
        zh: '开通无限 Token 包',
        en: 'Upgrade to unlimited assistant',
        ja: '無制限 Tokens にアップグレード',
        ko: '무제한 Tokens 로 업그레이드',
      }),
      description: localize(locale, {
        zh: '购买月付无限助手包后，该账户在有效期内不再受每日 Token 限制。',
        en: 'The monthly unlimited assistant package removes the daily token cap while it stays active.',
        ja: '月額の無制限アシスタント商品を購入すると、有効期間中は日次 token 上限が解除されます。',
        ko: '월간 무제한 도우미 상품을 구매하면 활성 기간 동안 일일 token 제한이 사라집니다.',
      }),
    } satisfies AssistantUpgradeCta;
  }

  private resolveGuestActor(request: FastifyRequest, reply: FastifyReply) {
    const existingCookie = request.cookies[this.guestCookieName];
    const guestId = this.verifyGuestCookie(existingCookie) ?? randomBytes(16).toString('hex');
    if (!existingCookie || !this.verifyGuestCookie(existingCookie)) {
      this.writeGuestCookie(request, reply, guestId);
    }

    const ip = this.normalizeIp(request);
    const ua = normalizeUserAgent(request.headers['user-agent']);
    const actorHash = createHash('sha256').update(`${guestId}|${ip}|${ua}`).digest('hex');
    return `guest:${actorHash}`;
  }

  private normalizeIp(request: FastifyRequest) {
    const raw = pickForwardedIp(request.headers['x-forwarded-for'])
      || normalizeWhitespace(String(request.ip ?? ''))
      || 'unknown-ip';
    const ipv4 = normalizeIpv4(raw);
    if (ipv4 !== raw) {
      return ipv4;
    }

    if (raw.includes(':')) {
      return normalizeIpv6(raw.toLowerCase());
    }

    return raw.toLowerCase();
  }

  private signGuestId(guestId: string) {
    return createHmac('sha256', this.guestCookieSecret).update(guestId).digest('base64url');
  }

  private verifyGuestCookie(value: string | undefined) {
    const normalized = normalizeWhitespace(value ?? '');
    if (!normalized) {
      return null;
    }

    const [guestId, signature] = normalized.split('.', 2);
    if (!guestId || !signature || !/^[a-f0-9]{32}$/i.test(guestId)) {
      return null;
    }

    return this.signGuestId(guestId) === signature ? guestId : null;
  }

  private writeGuestCookie(request: FastifyRequest, reply: FastifyReply, guestId: string) {
    reply.setCookie(this.guestCookieName, `${guestId}.${this.signGuestId(guestId)}`, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: request.protocol === 'https',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  private async bumpBurstCounter(actorKey: string, authenticated: boolean) {
    const now = Date.now();
    const minuteBucket = Math.floor(now / 60_000);
    const key = `assistant:quota:burst:${minuteBucket}:${actorKey}`;
    const retryAfterSeconds = Math.max(1, Math.ceil(((minuteBucket + 1) * 60_000 - now) / 1000));
    const limit = authenticated ? this.options.userBurstPerMinute : this.options.guestBurstPerMinute;
    const count = await this.incrementBy(key, 1, Math.max(retryAfterSeconds + 2, 10));

    return {
      count,
      limit,
      retryAfterSeconds,
    };
  }

  private getQuotaWindow(now = new Date()) {
    const parts = this.getZonedDateParts(now);
    const dayKey = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
    const nextDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const resetAt = this.zonedTimeToUtc(
      nextDate.getUTCFullYear(),
      nextDate.getUTCMonth() + 1,
      nextDate.getUTCDate(),
      0,
      0,
      0,
    );
    const expiresInSeconds = Math.max(60, Math.ceil((resetAt - now.getTime()) / 1000) + (60 * 60));

    return {
      dayKey,
      resetAtIso: new Date(resetAt).toISOString(),
      expiresInSeconds,
    };
  }

  private getZonedDateParts(date: Date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const parts = formatter.formatToParts(date);
    return {
      year: Number(parts.find((part) => part.type === 'year')?.value ?? '1970'),
      month: Number(parts.find((part) => part.type === 'month')?.value ?? '01'),
      day: Number(parts.find((part) => part.type === 'day')?.value ?? '01'),
    };
  }

  private getTimeZoneOffsetMinutes(date: Date) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
    });
    const offsetLabel = formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
    return parseShortOffset(offsetLabel);
  }

  private zonedTimeToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
  ) {
    let timestamp = Date.UTC(year, month - 1, day, hour, minute, second);
    for (let index = 0; index < 3; index += 1) {
      const offsetMinutes = this.getTimeZoneOffsetMinutes(new Date(timestamp));
      const candidate = Date.UTC(year, month - 1, day, hour, minute, second) - (offsetMinutes * 60_000);
      if (candidate === timestamp) {
        break;
      }
      timestamp = candidate;
    }
    return timestamp;
  }

  private dayKey(actorKey: string, dayKey: string) {
    return `assistant:quota:tokens:v2:day:${dayKey}:${actorKey}`;
  }

  private async getCounter(key: string) {
    return parseNumber(await this.readString(key));
  }

  private async incrementBy(key: string, delta: number, ttlSeconds: number) {
    const redis = await this.ensureRedis();
    if (redis) {
      const nextValue = await redis.incrby(key, delta);
      await redis.expire(key, ttlSeconds);
      return nextValue;
    }

    this.cleanupMemory();
    const current = parseNumber(this.memory.get(key)?.value ?? null);
    const nextValue = current + delta;
    this.memory.set(key, {
      value: String(nextValue),
      expiresAt: Date.now() + (ttlSeconds * 1000),
    });
    return nextValue;
  }

  private async readJson<T>(key: string) {
    const raw = await this.readString(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async writeJson(key: string, value: unknown, ttlSeconds: number) {
    await this.writeString(key, JSON.stringify(value), ttlSeconds);
  }

  private async readString(key: string) {
    const redis = await this.ensureRedis();
    if (redis) {
      return await redis.get(key);
    }

    this.cleanupMemory();
    return this.memory.get(key)?.value ?? null;
  }

  private async writeString(key: string, value: string, ttlSeconds: number) {
    const redis = await this.ensureRedis();
    if (redis) {
      await redis.set(key, value, 'EX', ttlSeconds);
      return;
    }

    this.cleanupMemory();
    this.memory.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000),
    });
  }

  private cleanupMemory() {
    const now = Date.now();
    for (const [key, record] of this.memory.entries()) {
      if (record.expiresAt <= now) {
        this.memory.delete(key);
      }
    }
  }

  private async ensureRedis() {
    if (!this.redis) {
      return null;
    }

    if (this.redisReady) {
      return this.redis;
    }

    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }
      this.redisReady = true;
      return this.redis;
    } catch (error) {
      this.logger.warn({ error }, 'Assistant quota Redis unavailable. Falling back to in-memory storage.');
      this.redis = null;
      this.redisReady = false;
      return null;
    }
  }
}
