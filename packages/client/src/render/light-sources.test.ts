import { describe, expect, it } from 'vitest';
import {
  deterministicFlameFlicker,
  isLightEmitterKind,
  PLACEABLE_LIGHT_EMITTERS,
  placeablePointLight,
} from './light-sources.js';

describe('placed crafting light emitters', () => {
  it('keeps luminous bodies out of their own occluder registry', () => {
    expect(isLightEmitterKind('camp_campfire')).toBe(true);
    expect(isLightEmitterKind('campfire')).toBe(true);
    expect(isLightEmitterKind('standing_torch')).toBe(true);
    expect(isLightEmitterKind('barrel')).toBe(false);
  });

  it('27§2 registers campfires and standing torches in the shared point-light shape', () => {
    expect(Object.keys(PLACEABLE_LIGHT_EMITTERS).sort()).toEqual(['camp_cooking_fire', 'campfire', 'cooking_fire', 'standing_torch']);
    const torch = placeablePointLight({ id: 4n, kind: 'standing_torch', tileX: 3, tileY: 5 }, 20n);
    expect(torch).toMatchObject({ worldX: 56, worldY: 76, profile: 'flame' });
    expect(torch?.radiusTiles).toBeGreaterThan(0);
    expect(torch?.strengthPerMille).toBeGreaterThanOrEqual(970);
    expect(torch?.strengthPerMille).toBeLessThanOrEqual(1030);
  });

  it('keeps adjacent flame samples subtle instead of snapping between extremes', () => {
    const samples = Array.from({ length: 20 }, (_, tick) => (
      placeablePointLight({ id: 9n, kind: 'campfire', tileX: 1, tileY: 1 }, BigInt(tick))
    ));
    for (let index = 1; index < samples.length; index += 1) {
      expect(Math.abs((samples[index]?.strengthPerMille ?? 1000) - (samples[index - 1]?.strengthPerMille ?? 1000)))
        .toBeLessThanOrEqual(12);
      expect(Math.abs((samples[index]?.radiusTiles ?? 12) - (samples[index - 1]?.radiusTiles ?? 12)))
        .toBeLessThanOrEqual(0.08);
    }
  });

  it('does not emit light while a placeable fire is extinguished', () => {
    expect(placeablePointLight({ id: 8n, kind: 'campfire', tileX: 2, tileY: 2, lit: false }, 10n)).toBeNull();
    expect(placeablePointLight({ id: 8n, kind: 'campfire', tileX: 2, tileY: 2, lit: true }, 10n)).not.toBeNull();
  });

  it('gives both clients the same deterministic flame flicker for one authority tick', () => {
    const row = { id: 99n, kind: 'campfire', tileX: 8, tileY: 8 };
    expect(placeablePointLight(row, 1_234n)).toEqual(placeablePointLight(row, 1_234n));
    expect(placeablePointLight(row, 1_234n)).not.toEqual(placeablePointLight(row, 1_235n));
  });

  it('27§2 keeps held-flame phase continuous between authority observations', () => {
    const id = 17n;
    const before = deterministicFlameFlicker(id, 100.25);
    const after = deterministicFlameFlicker(id, 100.5);
    expect(Math.abs(after.strengthPerMille - before.strengthPerMille)).toBeLessThanOrEqual(3);
    expect(Math.abs(after.radiusOffset - before.radiusOffset)).toBeLessThanOrEqual(0.02);
    expect(deterministicFlameFlicker(id, 100)).toEqual(deterministicFlameFlicker(id, 100n));
  });
});
