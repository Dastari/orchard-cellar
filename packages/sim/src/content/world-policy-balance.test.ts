import { describe, expect, it } from 'vitest';
import { runtimeWorldPolicyBalance } from '../world-policy-balance.js';
import type { WorldPolicyBalanceContentDefinition } from './balance-definition.js';
import { bootstrapContentDefinitions } from './bootstrap-registry.js';
import { parseContentDefinition } from './definitions.js';
import { buildContentRegistry } from './registry.js';
import { validateContentDefinitions } from './validate.js';

function bootstrapWorldPolicy(): WorldPolicyBalanceContentDefinition {
  return bootstrapContentDefinitions().find(
    (definition): definition is WorldPolicyBalanceContentDefinition => (
      definition.kind === 'balance' && 'profile' in definition
      && definition.profile === 'world_policy'
    ),
  )!;
}

describe('world policy balance content', () => {
  it('resolves an arbitrarily renamed unique active profile', () => {
    const original = bootstrapWorldPolicy();
    const renamed = { ...original, id: 'balance:renamed_world_runtime_policy' as const };
    const rows = bootstrapContentDefinitions()
      .filter(({ id }) => id !== original.id)
      .map((definition) => ({ id: definition.id, kind: definition.kind, json: definition }));
    const built = buildContentRegistry([
      ...rows, { id: renamed.id, kind: renamed.kind, json: renamed },
    ]);
    expect(built.report.errors).toEqual([]);
    expect(runtimeWorldPolicyBalance(built.registry)).toEqual({
      fiberTillDropPercent: 30,
      craftingStationReachTiles: 2,
      itemDespawnTicks: 24_000,
      survivalSpawnSearchRadiusTiles: 60,
      proceduralWorldChunkTiles: 16,
      proceduralWorldExtentTiles: 32_000,
      proceduralSpawnPregenRadiusChunks: 12,
      proceduralGenerationLookaheadChunks: 3,
      survivalTerrainMaxElevation: 3,
      survivalTerrainContourInsetTiles: 4,
      survivalTerrainMinimumSummitTiles: 24,
    });
  });

  it('fails closed for retired or ambiguous profiles and rejects malformed tuples', () => {
    const original = bootstrapWorldPolicy();
    const retired = { ...original, retired: true as const };
    const built = buildContentRegistry([{ id: retired.id, kind: retired.kind, json: retired }]);
    expect(runtimeWorldPolicyBalance(built.registry)).toBeNull();
    expect(validateContentDefinitions([
      original, { ...original, id: 'balance:duplicate_world_policy' },
    ]).errors).toContainEqual(expect.objectContaining({
      code: 'ambiguous_interaction', path: 'profile',
    }));
    expect(() => parseContentDefinition('balance', {
      ...original, values: original.values.slice(0, -1),
    })).toThrow('world_policy profile requires 11 positive integers');
    expect(() => parseContentDefinition('balance', {
      ...original, values: [101, ...original.values.slice(1)],
    })).toThrow('world policy value exceeds its supported bound');
  });
});
