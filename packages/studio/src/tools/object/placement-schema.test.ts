import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const studio = readFileSync(new URL('./canvas.ts', import.meta.url), 'utf8');

describe('Object Studio placement mode', () => {
  it('always opens in cursor mode without an implicit catalog asset', () => {
    expect(studio).toContain("mode: 'prefab'");
    expect(studio).toContain("'prefab-stamp'");
    expect(studio).not.toContain("assetName === 'prop_cf_camp_tent'");
    expect(studio).not.toContain('entirePalette[0]?.key');
  });

  it('requires an explicit semantic action for every stamp', () => {
    expect(studio).toContain("'Place asset'");
    expect(studio).toContain('model.stamp({');
    expect(studio).toContain("ui.list({id:'object-prefab-pieces'");
  });
});
