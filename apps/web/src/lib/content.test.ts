import { describe, expect, it } from 'vitest';

import { localeMeta, supportedFrontendLocales } from './content';

describe('frontend locales', () => {
  it('only exposes locales with complete commerce copy', () => {
    expect(supportedFrontendLocales).toEqual(['zh-CN', 'en-US']);
  });

  it('uses country codes for shared flag rendering', () => {
    expect(localeMeta['zh-CN'].countryCode).toBe('CN');
    expect(localeMeta['en-US'].countryCode).toBe('US');
  });
});
