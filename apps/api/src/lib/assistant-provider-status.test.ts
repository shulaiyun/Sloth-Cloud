import { describe, expect, it, vi } from 'vitest';

import { probeAssistantProviderStatus } from './assistant-provider-status.js';

describe('probeAssistantProviderStatus', () => {
  it('marks the provider healthy when the configured model is reachable', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { id: 'gpt-5.4' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [
          {
            message: {
              content: 'pong',
            },
          },
        ],
      }), { status: 200 }));

    const status = await probeAssistantProviderStatus({
      enabled: true,
      primaryProvider: 'openai',
      providers: [
        {
          name: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-5.4',
          baseUrl: 'http://provider.local/v1',
        },
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(status.canRun).toBe(true);
    expect(status.responseMode).toBe('llm');
    expect(status.modelReachable).toBe(true);
    expect(status.activeProvider).toBe('openai');
  });

  it('returns fallback when no live provider is configured', async () => {
    const status = await probeAssistantProviderStatus({
      enabled: true,
      primaryProvider: 'openai',
      providers: [
        {
          name: 'openai',
          apiKey: '',
          model: '',
          baseUrl: '',
        },
      ],
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    expect(status.providerConfigured).toBe(false);
    expect(status.credentialsPresent).toBe(false);
    expect(status.canRun).toBe(false);
    expect(status.responseMode).toBe('fallback');
  });

  it('reports network and model failure when the provider cannot serve requests', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:9999'));

    const status = await probeAssistantProviderStatus({
      enabled: true,
      primaryProvider: 'openai',
      providers: [
        {
          name: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-5.4',
          baseUrl: 'http://127.0.0.1:9999/v1',
        },
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(status.providerConfigured).toBe(true);
    expect(status.credentialsPresent).toBe(true);
    expect(status.networkReachable).toBe(false);
    expect(status.modelReachable).toBe(false);
    expect(status.canRun).toBe(false);
    expect(status.reason).toContain('ECONNREFUSED');
  });

  it('does not mark a provider runnable when the model list works but chat completion fails', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [
          { id: 'gpt-5.4' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          message: 'auth unavailable',
        },
      }), { status: 503 }));

    const status = await probeAssistantProviderStatus({
      enabled: true,
      primaryProvider: 'openai',
      providers: [
        {
          name: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-5.4',
          baseUrl: 'http://provider.local/v1',
        },
      ],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(status.networkReachable).toBe(true);
    expect(status.modelReachable).toBe(false);
    expect(status.canRun).toBe(false);
    expect(status.responseMode).toBe('fallback');
    expect(status.reason).toContain('/chat/completions');
  });
});
