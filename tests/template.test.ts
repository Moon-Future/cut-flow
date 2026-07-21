import {describe, expect, it} from 'vitest';
import {getTemplate, listTemplates} from '../src/templates/registry';

describe('template registry', () => {
  it('resolves game-dev-log tokens', () => {
    const template = getTemplate('game-dev-log');
    expect(template.brandLabel).toContain('DEV LOG');
    expect(template.captionActiveColor).toMatch(/^#/);
  });

  it('falls back for unknown templates', () => {
    expect(getTemplate('missing').id).toBe('default');
    expect(listTemplates().map((template) => template.id)).toContain('game-dev-log');
  });
});
