import { describe, expect, it } from 'vitest';

import { resolveAssistantDevelopmentMockAllowance } from './assistant-runtime-mode.js';

describe('resolveAssistantDevelopmentMockAllowance', () => {
  it('keeps production runtime off the mock path', () => {
    expect(resolveAssistantDevelopmentMockAllowance({
      nodeEnv: 'production',
      explicitFlag: true,
    })).toBe(false);
  });

  it('keeps development runtime off the mock path unless explicitly enabled', () => {
    expect(resolveAssistantDevelopmentMockAllowance({
      nodeEnv: 'development',
      explicitFlag: false,
    })).toBe(false);
  });

  it('allows development mock only when explicitly requested', () => {
    expect(resolveAssistantDevelopmentMockAllowance({
      nodeEnv: 'development',
      explicitFlag: true,
    })).toBe(true);
  });
});
