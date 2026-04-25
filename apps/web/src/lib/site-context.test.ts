import { describe, expect, it } from 'vitest';

import { resolveThemeDomain } from './site-context';

describe('resolveThemeDomain', () => {
  it('routes operator pages through the console theme domain', () => {
    expect(resolveThemeDomain('/operator')).toBe('console');
    expect(resolveThemeDomain('/operator/capsule_active')).toBe('console');
    expect(resolveThemeDomain('/operator/debug/v3')).toBe('console');
  });

  it('keeps storefront pages on the commerce theme domain', () => {
    expect(resolveThemeDomain('/')).toBe('commerce');
    expect(resolveThemeDomain('/catalog')).toBe('commerce');
  });
});
