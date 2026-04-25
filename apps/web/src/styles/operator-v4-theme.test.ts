import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('./console.css', import.meta.url),
  'utf8',
);

const operatorV4Section = css.slice(css.indexOf('.operator-v4-page'));

describe('operator-v4 theme tokens', () => {
  it('applies shared theme tokens instead of hardcoded pale cards', () => {
    expect(operatorV4Section).toContain('var(--bg-panel)');
    expect(operatorV4Section).toContain('var(--bg-soft)');
    expect(operatorV4Section).toContain('var(--text)');
    expect(operatorV4Section).toContain('var(--border)');
    expect(operatorV4Section).not.toContain('rgba(255, 255, 255');
  });
});
