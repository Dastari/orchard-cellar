import { describe, expect, it } from 'vitest';
import { PLACEABLE_LIGHT_EMITTERS, placeablePointLight } from './light-sources.js';

describe('placed crafting light emitters', () => {
  it('27§2 registers campfires and standing torches in the shared point-light shape', () => {
    expect(Object.keys(PLACEABLE_LIGHT_EMITTERS).sort()).toEqual(['campfire', 'standing_torch']);
    const torch = placeablePointLight({ id: 4n, kind: 'standing_torch', tileX: 3, tileY: 5 }, 20n);
    expect(torch).toMatchObject({ worldX: 56, worldY: 76 });
    expect(torch?.radiusTiles).toBeGreaterThan(0);
  });

  it('gives both clients the same deterministic flame flicker for one authority tick', () => {
    const row = { id: 99n, kind: 'campfire', tileX: 8, tileY: 8 };
    expect(placeablePointLight(row, 1_234n)).toEqual(placeablePointLight(row, 1_234n));
    expect(placeablePointLight(row, 1_234n)).not.toEqual(placeablePointLight(row, 1_235n));
  });
});
