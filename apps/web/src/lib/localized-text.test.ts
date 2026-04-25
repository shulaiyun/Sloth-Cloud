import { describe, expect, it } from 'vitest';

import { localizeText } from './localized-text';

describe('localizeText', () => {
  it('returns plain string input as-is', () => {
    expect(localizeText('hello world', 'en-US')).toBe('hello world');
  });

  it('parses JSON-like localized string payloads', () => {
    const payload = JSON.stringify({
      'zh-CN': '中文标题',
      'en-US': 'English title',
      default: 'Default title',
    });

    expect(localizeText(payload, 'zh-CN')).toBe('中文标题');
    expect(localizeText(payload, 'en-US')).toBe('English title');
    expect(localizeText(payload, 'fr-FR')).toBe('Default title');
  });

  it('keeps malformed JSON-like string as plain text', () => {
    const malformed = '{"zh-CN":"中文标题",}';
    expect(localizeText(malformed, 'zh-CN')).toBe(malformed);
  });
});
