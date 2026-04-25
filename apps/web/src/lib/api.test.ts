import { describe, expect, it } from 'vitest';

import { buildApiUrl, resolveApiBaseUrl } from './api';

describe('api helpers', () => {
  it('defaults to same-origin requests when no api base url is configured', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('');
    expect(buildApiUrl('/api/v1/auth/me', '')).toBe('/api/v1/auth/me');
  });

  it('normalizes explicit api base urls before building request paths', () => {
    expect(resolveApiBaseUrl('http://127.0.0.1:14000/')).toBe('http://127.0.0.1:14000');
    expect(buildApiUrl('/api/v1/health', 'http://127.0.0.1:14000/')).toBe('http://127.0.0.1:14000/api/v1/health');
  });

  it('preserves absolute request urls unchanged', () => {
    expect(buildApiUrl('https://example.com/api/v1/health', '')).toBe('https://example.com/api/v1/health');
  });
});
