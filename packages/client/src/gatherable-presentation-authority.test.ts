import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

describe('gatherable presentation authority', () => {
  it('does not restore exact resource-kind prompt or feedback branches', () => {
    expect(main).not.toContain("'loose_stone'");
    expect(main).not.toContain("'fallen_branch'");
    expect(main).not.toContain('PICKED UP STONE');
    expect(main).not.toContain('PICKED UP WOOD');
    expect(main).not.toContain("? 'PEBBLE' : 'FALLEN BRANCH'");
  });

  it('requires the active authored presentation before targeting or activation', () => {
    expect(main.match(/runtimeResourcePickupPresentation\(snapshot\.content\.registry, resource\)/g))
      .toHaveLength(1);
    expect(main.match(/runtimeResourcePickupPresentation\(snapshot\.content\.registry, gatherable\)/g))
      .toHaveLength(1);
    expect(main).toContain('target.presentation.promptLabel.toUpperCase()');
    expect(main).toContain('target.presentation.feedbackLabel.toUpperCase()');
  });
});
