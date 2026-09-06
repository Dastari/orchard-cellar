import { describe, expect, it, vi } from 'vitest';
import { ResourcePerceptionCache, identifiedOreAtWorldPoint, type ResourcePerceptionInput } from './resource-perception.js';
import { interactionTileAtWorldPoint } from './survival-ui.js';

function fixture(overrides: Partial<ResourcePerceptionInput> = {}): ResourcePerceptionInput {
  return {
    seed: 1, spaceId: 10_001, underground: true, centerTileX: 70, centerTileY: 70,
    terrain: { width: 150, height: 150, blocked: Array<boolean>(150 * 150).fill(true) },
    revision: 'registry:ranks:excavations:resources', resources: [],
    capabilities: {
      buriedOreRadiusTiles: 15, identifyBuriedOre: false,
      minimapOre: false, minimapFishing: false,
      minimapOreRadiusTiles: 0, minimapFishingRadiusTiles: 0,
    },
    ...overrides,
  };
}

function resource(id: number, tileX: number, tileY: number, kind = 'ore_gold', spaceId = 10_001, depleted = false) {
  return { id: BigInt(id), kind, tileX, tileY, spaceId, depleted };
}

describe('passive resource perception', () => {
  it.each([15, 60])('detects only the %s-tile Euclidean circle without leaking unidentified materials', (radius) => {
    const input = fixture();
    const cache = new ResourcePerceptionCache(() => 'ore_gold');
    const result = cache.project({ ...input, capabilities: { ...input.capabilities, buriedOreRadiusTiles: radius } });
    expect(result.buriedOre).toContainEqual({ tileX: 70 + radius, tileY: 70, identified: false });
    expect(result.buriedOre).not.toContainEqual({ tileX: 70 + radius, tileY: 71, identified: false });
    expect(result.buriedOre.every((ore) => Object.keys(ore).sort().join(',') === 'identified,tileX,tileY')).toBe(true);
    expect(result.buriedOre.every((ore) => (ore.tileX - 70) ** 2 + (ore.tileY - 70) ** 2 <= radius ** 2)).toBe(true);
    expect(result.minimapOre).toEqual([]);
  });

  it('identifies materials and distance only after the authored capability is active', () => {
    const cache = new ResourcePerceptionCache((_seed, _space, x, y) => x === 73 && y === 74 ? 'ore_ruby' : null);
    const input = fixture();
    expect(cache.project(input).buriedOre).toEqual([{ tileX: 73, tileY: 74, identified: false }]);
    expect(cache.project({ ...input, capabilities: { ...input.capabilities, identifyBuriedOre: true } }).buriedOre)
      .toEqual([{ tileX: 73, tileY: 74, identified: true, oreKind: 'ore_ruby', distanceTiles: 5 }]);
  });

  it('allows remote identified hover without extending authoritative interaction reach', () => {
    const input = fixture();
    const cache = new ResourcePerceptionCache((_seed, _space, x, y) => x === 120 && y === 70 ? 'ore_copper' : null);
    const sensed = cache.project({ ...input, capabilities: { ...input.capabilities, buriedOreRadiusTiles: 60 } });
    expect(identifiedOreAtWorldPoint(sensed.buriedOre, 120 * 16 + 8, 70 * 16 + 8)).toBeNull();
    const identified = cache.project({ ...input, capabilities: { ...input.capabilities, buriedOreRadiusTiles: 60, identifyBuriedOre: true } });
    expect(identifiedOreAtWorldPoint(identified.buriedOre, 120 * 16 + 8, 70 * 16 + 8))
      .toEqual({ tileX: 120, tileY: 70, identified: true, oreKind: 'ore_copper', distanceTiles: 50 });
    expect(interactionTileAtWorldPoint(70 * 256, 70 * 256, 120 * 16 + 8, 70 * 16 + 8, 150)).toBeNull();
  });

  it('invalidates excavation, depletion, respec, and terrain changes without revealing another space', () => {
    const cache = new ResourcePerceptionCache((_seed, _space, x, y) => x === 70 && y === 70 ? 'ore_iron' : null);
    const input = fixture();
    expect(cache.project(input).buriedOre).toHaveLength(1);
    const depleted = resource(1, 70, 70, 'ore_iron', input.spaceId, true);
    expect(cache.project({ ...input, revision: 'depleted', resources: [depleted] }).buriedOre).toEqual([]);
    expect(cache.project({ ...input, revision: 'other-space', resources: [{ ...depleted, spaceId: 20_001 }] }).buriedOre).toHaveLength(1);
    const blocked = [...input.terrain.blocked];
    blocked[70 * 150 + 70] = false;
    expect(cache.project({ ...input, revision: 'excavated', terrain: { ...input.terrain, blocked } }).buriedOre).toEqual([]);
    expect(cache.project({ ...input, underground: false }).buriedOre).toEqual([]);
    expect(cache.project({ ...input, capabilities: { ...input.capabilities, buriedOreRadiusTiles: 0 } }).buriedOre).toEqual([]);
  });

  it('marks active exposed ores and fishing pools only within authored range and space', () => {
    const input = fixture({ underground: false, resources: [
      resource(1, 85, 70), resource(2, 86, 70), resource(3, 71, 70, 'ore_gold', 20_001),
      resource(4, 72, 70, 'ore_gold', 10_001, true), resource(5, 73, 70),
      resource(6, 74, 70, 'fish_pool'), resource(7, 75, 70, 'fish_pool'),
      resource(8, 74, 70, 'fish_pool', 20_001), resource(9, 70, 70, 'fish_pool', 10_001, true),
    ], resourceVisible: (id) => id !== 5n });
    const result = new ResourcePerceptionCache().project({ ...input, capabilities: {
      ...input.capabilities, minimapOre: true, minimapFishing: true,
      minimapOreRadiusTiles: 60, minimapFishingRadiusTiles: 4,
    } });
    expect(result.buriedOre).toEqual([]);
    expect(result.minimapOre).toEqual([{ tileX: 85, tileY: 70, identified: false }]);
    expect(result.fishingPools).toEqual([{ tileX: 74, tileY: 70 }]);
  });

  it('does no repeated scan for unchanged frames and reuses vein lookups after moving one tile', () => {
    const lookup = vi.fn(() => null);
    const cache = new ResourcePerceptionCache(lookup);
    const fixtureInput = fixture();
    const input = { ...fixtureInput, capabilities: { ...fixtureInput.capabilities, buriedOreRadiusTiles: 60 } };
    const first = cache.project(input);
    const initialLookups = lookup.mock.calls.length;
    expect(initialLookups).toBeGreaterThan(11_000);
    for (let frame = 0; frame < 100; frame += 1) expect(cache.project(input)).toBe(first);
    expect(lookup).toHaveBeenCalledTimes(initialLookups);
    cache.project({ ...input, centerTileX: 71 });
    expect(lookup.mock.calls.length - initialLookups).toBeLessThanOrEqual(121);
    const beforeContentChange = lookup.mock.calls.length;
    cache.project({ ...input, centerTileX: 71, revision: 'new-content-or-ranks' });
    expect(lookup).toHaveBeenCalledTimes(beforeContentChange);
    cache.project({ ...input, seed: 2 });
    expect(lookup.mock.calls.length - beforeContentChange).toBe(initialLookups);
    cache.project({ ...input, spaceId: 20_001 });
    expect(lookup.mock.calls.length - beforeContentChange).toBe(initialLookups * 2);
  });
});
