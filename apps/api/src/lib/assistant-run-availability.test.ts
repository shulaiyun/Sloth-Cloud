import { describe, expect, it } from 'vitest';

import { resolveAssistantRunAvailability } from './assistant-run-availability.js';

describe('resolveAssistantRunAvailability', () => {
  it('allows run when a live provider is available', () => {
    expect(resolveAssistantRunAvailability({
      locale: 'zh-CN',
      canRun: true,
      reason: '',
      allowDevelopmentMock: false,
    })).toBeNull();
  });

  it('blocks run instead of silently falling back when no live provider exists', () => {
    const result = resolveAssistantRunAvailability({
      locale: 'zh-CN',
      canRun: false,
      reason: 'network unreachable',
      allowDevelopmentMock: false,
    });

    expect(result).toMatchObject({
      runAllowed: false,
      source: 'system',
      code: 'ASSISTANT_LIVE_PROVIDER_REQUIRED',
      runState: 'blocked',
    });
    expect(result?.detail).toContain('network unreachable');
  });

  it('keeps fallback explicit as mock in development mode', () => {
    const result = resolveAssistantRunAvailability({
      locale: 'zh-CN',
      canRun: false,
      reason: 'network unreachable',
      allowDevelopmentMock: true,
    });

    expect(result).toMatchObject({
      runAllowed: false,
      source: 'mock',
      code: 'ASSISTANT_RUN_LIMITED_MOCK',
      runState: 'blocked',
    });
    expect(result?.detail).toContain('source=mock');
  });
});
