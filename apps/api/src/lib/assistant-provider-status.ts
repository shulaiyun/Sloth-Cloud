import type {
  AssistantLlmProviderConfig,
  AssistantProviderName,
  AssistantResponseMode,
} from './assistant.js';

export interface AssistantProviderProbeResult {
  provider: AssistantProviderName;
  model: string | null;
  baseUrl: string | null;
  providerConfigured: boolean;
  credentialsPresent: boolean;
  networkReachable: boolean;
  modelReachable: boolean;
  canRun: boolean;
  httpStatus: number | null;
  reason: string;
}

export interface AssistantProviderStatus {
  enabled: boolean;
  checkedAt: string;
  primaryProvider: AssistantProviderName;
  activeProvider: AssistantProviderName | null;
  activeModel: string | null;
  providerConfigured: boolean;
  credentialsPresent: boolean;
  networkReachable: boolean;
  modelReachable: boolean;
  responseMode: AssistantResponseMode;
  canRun: boolean;
  reason: string;
  providerResults: AssistantProviderProbeResult[];
}

export interface ProbeAssistantProviderStatusInput {
  enabled: boolean;
  primaryProvider: AssistantProviderName;
  providers: AssistantLlmProviderConfig[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function normalizeWhitespace(value: string | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
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

function credentialsPresent(provider: AssistantLlmProviderConfig) {
  return normalizeWhitespace(provider.apiKey).length > 0;
}

function providerConfigured(provider: AssistantLlmProviderConfig) {
  return credentialsPresent(provider)
    && normalizeWhitespace(provider.model).length > 0
    && normalizeProviderBaseUrl(provider).length > 0;
}

function createDisabledResult(input: ProbeAssistantProviderStatusInput): AssistantProviderStatus {
  return {
    enabled: false,
    checkedAt: new Date().toISOString(),
    primaryProvider: input.primaryProvider,
    activeProvider: null,
    activeModel: null,
    providerConfigured: false,
    credentialsPresent: false,
    networkReachable: false,
    modelReachable: false,
    responseMode: 'fallback',
    canRun: false,
    reason: 'Assistant is disabled.',
    providerResults: input.providers.map((provider) => ({
      provider: provider.name,
      model: normalizeWhitespace(provider.model) || null,
      baseUrl: normalizeProviderBaseUrl(provider) || null,
      providerConfigured: false,
      credentialsPresent: credentialsPresent(provider),
      networkReachable: false,
      modelReachable: false,
      canRun: false,
      httpStatus: null,
      reason: 'Assistant is disabled.',
    })),
  };
}

async function probeHttpResponse(input: {
  fetchImpl: typeof fetch;
  url: string;
  headers: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    return await input.fetchImpl(input.url, {
      method: input.method ?? 'GET',
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function extractListedModelIds(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return [] as string[];
  }

  const data = Array.isArray((payload as { data?: unknown }).data)
    ? ((payload as { data: unknown[] }).data)
    : [];

  return data
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return '';
      }
      return normalizeWhitespace(String((entry as { id?: unknown }).id ?? ''));
    })
    .filter((entry) => entry.length > 0);
}

function buildMissingReason(provider: AssistantLlmProviderConfig) {
  if (!credentialsPresent(provider)) {
    return 'Missing provider credentials.';
  }
  if (!normalizeWhitespace(provider.model)) {
    return 'Missing model configuration.';
  }
  if (!normalizeProviderBaseUrl(provider)) {
    return 'Missing provider base URL.';
  }
  return 'Provider is not configured.';
}

function isLikelyNetworkProbeError(reason: string) {
  const normalized = normalizeWhitespace(reason).toLowerCase();
  if (!normalized) {
    return false;
  }

  return normalized.includes('aborted')
    || normalized.includes('timeout')
    || normalized.includes('timed out')
    || normalized.includes('failed to fetch')
    || normalized.includes('network')
    || normalized.includes('enotfound')
    || normalized.includes('econnrefused')
    || normalized.includes('ehostunreach')
    || normalized.includes('socket hang up');
}

export async function probeAssistantProviderStatus(
  input: ProbeAssistantProviderStatusInput,
): Promise<AssistantProviderStatus> {
  if (!input.enabled) {
    return createDisabledResult(input);
  }

  const timeoutMs = Number.isFinite(input.timeoutMs) && Number(input.timeoutMs) > 0
    ? Math.round(Number(input.timeoutMs))
    : 5000;
  const fetchImpl = input.fetchImpl ?? fetch;
  const checkedAt = new Date().toISOString();
  const results: AssistantProviderProbeResult[] = await Promise.all(input.providers.map(async (provider) => {
    const apiKey = normalizeWhitespace(provider.apiKey);
    const model = normalizeWhitespace(provider.model) || null;
    const baseUrl = normalizeProviderBaseUrl(provider) || null;
    const configured = providerConfigured(provider);
    const hasCredentials = credentialsPresent(provider);

    if (!configured || !apiKey || !model || !baseUrl) {
      return {
        provider: provider.name,
        model,
        baseUrl,
        providerConfigured: configured,
        credentialsPresent: hasCredentials,
        networkReachable: false,
        modelReachable: false,
        canRun: false,
        httpStatus: null,
        reason: buildMissingReason(provider),
      };
    }

    const headers = {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    };

    let networkReachable = false;
    let modelReachable = false;
    let httpStatus: number | null = null;
    let reason = 'Provider probe did not complete.';
    let modelListed = false;

    try {
      const modelsResponse = await probeHttpResponse({
        fetchImpl,
        url: `${baseUrl}/models`,
        headers,
        timeoutMs,
      });
      httpStatus = modelsResponse.status;
      networkReachable = true;
      if (modelsResponse.ok) {
        const payload = await modelsResponse.json().catch(() => ({}));
        const ids = extractListedModelIds(payload).map((entry) => entry.toLowerCase());
        if (ids.includes(model.toLowerCase())) {
          modelListed = true;
          reason = 'Provider listed the configured model; checking chat completion.';
        } else {
          reason = 'Provider responded, but the configured model was not listed.';
        }
      } else {
        reason = `Provider returned status ${modelsResponse.status} for /models.`;
      }
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }

    const shouldSkipChatProbe = !networkReachable
      && isLikelyNetworkProbeError(reason);

    if (!shouldSkipChatProbe) {
      try {
        const completionResponse = await probeHttpResponse({
          fetchImpl,
          url: `${baseUrl}/chat/completions`,
          headers,
          method: 'POST',
          body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: 1,
            messages: [
              {
                role: 'user',
                content: 'ping',
              },
            ],
          }),
          timeoutMs,
        });
        httpStatus = completionResponse.status;
        networkReachable = true;
        if (completionResponse.ok) {
          modelReachable = true;
          reason = 'Chat completion probe succeeded.';
        } else {
          const detail = await completionResponse.text().catch(() => '');
          const suffix = detail ? ` Detail: ${detail.slice(0, 240)}` : '';
          reason = `Provider returned status ${completionResponse.status} for /chat/completions.${suffix}`;
        }
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
      }
    } else if (modelListed) {
      reason = 'Provider listed the configured model, but chat completion was not verified.';
    }

    return {
      provider: provider.name,
      model,
      baseUrl,
      providerConfigured: configured,
      credentialsPresent: hasCredentials,
      networkReachable,
      modelReachable,
      canRun: networkReachable && modelReachable,
      httpStatus,
      reason,
    };
  }));

  const active = results.find((entry) => entry.canRun) ?? null;
  const anyConfigured = results.some((entry) => entry.providerConfigured);
  const anyCredentials = results.some((entry) => entry.credentialsPresent);
  const anyNetwork = results.some((entry) => entry.networkReachable);
  const anyModel = results.some((entry) => entry.modelReachable);
  const canRun = Boolean(active);

  let reason = 'No configured provider can run.';
  if (canRun && active) {
    reason = `${active.provider}:${active.model ?? 'unknown'} is reachable and ready to run.`;
  } else if (!anyCredentials) {
    reason = 'No provider credentials are present.';
  } else if (!anyConfigured) {
    reason = 'No provider has a complete configuration.';
  } else if (!anyNetwork) {
    reason = results.find((entry) => entry.providerConfigured)?.reason ?? 'Provider network is unreachable.';
  } else if (!anyModel) {
    reason = results.find((entry) => entry.providerConfigured && !entry.modelReachable)?.reason ?? 'No configured model is reachable.';
  }

  return {
    enabled: input.enabled,
    checkedAt,
    primaryProvider: input.primaryProvider,
    activeProvider: active?.provider ?? null,
    activeModel: active?.model ?? null,
    providerConfigured: anyConfigured,
    credentialsPresent: anyCredentials,
    networkReachable: anyNetwork,
    modelReachable: anyModel,
    responseMode: canRun ? 'llm' : 'fallback',
    canRun,
    reason,
    providerResults: results,
  };
}
