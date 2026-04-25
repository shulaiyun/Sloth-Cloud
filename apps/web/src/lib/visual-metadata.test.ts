import { describe, expect, it } from 'vitest';

import { getAppVisual, getCountryName, getOsVisual, parseNodeOption } from './visual-metadata';

describe('visual metadata', () => {
  it('localizes country names for visible commerce surfaces', () => {
    expect(getCountryName('DE', 'zh-CN')).toBe('德国');
    expect(getCountryName('DE', 'en-US')).toBe('Germany');
    expect(parseNodeOption({ name: 'US Los Angeles BGP', countryCode: 'US' }, 'zh-CN').countryName).toBe('美国');
  });

  it('maps operating systems to stable families and glyphs', () => {
    expect(getOsVisual({ label: 'Ubuntu 22.04' })).toMatchObject({ family: 'Ubuntu', glyph: 'UB' });
    expect(getOsVisual({ label: 'RockyLinux 9' })).toMatchObject({ family: 'RockyLinux', glyph: 'RL' });
    expect(getOsVisual({ label: 'AlmaLinux 9' })).toMatchObject({ family: 'AlmaLinux', glyph: 'AL' });
  });

  it('maps common app panels to recognizable abbreviations', () => {
    expect(getAppVisual({ name: '1Panel' })).toMatchObject({ family: '1Panel', glyph: '1P' });
    expect(getAppVisual({ name: 'aaPanel / 宝塔' })).toMatchObject({ family: 'aaPanel', glyph: 'AA' });
    expect(getAppVisual({ name: 'Portainer' })).toMatchObject({ family: 'Portainer', glyph: 'PT' });
  });
});
