import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as sim from '@orchard/sim';
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'respawnMiningResources');
if (!declaration) throw new Error('missing production respawn controller');
const code = ts.transpileModule(`${declaration.getText(source)}\nreturn respawnMiningResources;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(id: bigint, spaceId = 0) {
  let row = { id, kind: 'ore_iron', spaceId, tileX: 725, tileY: 169, depleted: true,
    respawnAtTick: 100n, activationOrdinal: 2, spawnSiteId: 99n, miningClass: 'pure', richness: 0,
    maximumRichness: 2, health: 0, yieldProgress: 0, yieldsProduced: 2, producedOre: true };
  const updates: typeof row[] = [], replacement = { ...row, tileX: 400, tileY: 400, depleted: false };
  // An authored node may carry a spawn-site value matching a legacy candidate;
  // it must not reserve a slot in the original rotating population.
  const authoredActive = { ...row, id: 8_000_000_001n, spawnSiteId: 200n, depleted: false };
  const deleteClaim = vi.fn();
  const candidates = vi.fn(() => [{ id: 200, tileX: 400, tileY: 400 }]);
  const ctx = { db: {
    world_seed: { id: { find: () => null } },
    world_resource: { by_chunk: { filter: () => [row, authoredActive] }, by_depleted: { filter: () => row.depleted ? [row] : [] },
      id: { update: (next: typeof row) => { updates.push(next); row = next; } } },
    player_position: { iter: () => [] }, world_soil: { by_chunk: { filter: () => [] } },
    world_placeable: { by_chunk: { filter: () => [] } }, world_chest: { by_chunk: { filter: () => [] } },
    world_resource_mining_claim: { resourceId: { delete: deleteClaim } },
  } };
  const dependencies = { ...sim, MINING_RESPAWN_SWEEP_TICKS: 100n, TOPSIDE_SPACE_ID: 0,
    contentRegistry: () => sim.bootstrapContentRegistry(),
    miningClassForResource: () => 'pure', surfaceOreRespawnCandidates: candidates,
    surfaceOreRespawnTileBlocked: () => false, surfaceOreResourceAtSite: () => replacement,
    generatedWorldResourceRow: (value: typeof row) => value,
  };
  const run = new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  return { candidates, deleteClaim, updates, row: () => row, run: () => run(ctx, 100n) };
}
describe('Orchard rotating ore and authored island resource partition', () => {
  it('recognizes only the original 48 same-space legacy-kind slots', () => {
    for (let slot = 0; slot < sim.SURFACE_ACTIVE_ORE_NODES; slot++) {
      expect(sim.legacySurfaceOreSlot({ id: BigInt(sim.ORE_RESOURCE_ID_BASE + slot), kind: 'ore_iron', spaceId: 0 })).toBe(slot);
    }
    for (const value of [
      { id: BigInt(sim.ORE_RESOURCE_ID_BASE - 1), kind: 'ore_iron', spaceId: 0 },
      { id: BigInt(sim.ORE_RESOURCE_ID_BASE + sim.SURFACE_ACTIVE_ORE_NODES), kind: 'ore_iron', spaceId: 0 },
      { id: BigInt(sim.ORE_RESOURCE_ID_BASE), kind: 'ore_cinder', spaceId: 0 },
      { id: BigInt(sim.ORE_RESOURCE_ID_BASE), kind: 'ore_iron', spaceId: 5 },
      { id: (1n << 64n) - 1n, kind: 'ore_iron', spaceId: 0 },
    ]) expect(sim.legacySurfaceOreSlot(value)).toBeNull();
  });
  it('excludes reserved Hearth IDs before legacy refill or claim deletion, even if their kind conflicts', () => {
    for (const site of sim.HEARTH_RESOURCE_SITES) {
      const f = fixture(site.id); f.run(); f.run();
      expect(f.updates).toEqual([]); expect(f.deleteClaim).not.toHaveBeenCalled();
      expect(f.candidates).not.toHaveBeenCalled();
    }
  });
  it('keeps high-ID authored ore at its site through actual respawn instead of moving it to Orchard', () => {
    const f = fixture(8_000_000_000n); f.run();
    expect(f.candidates).not.toHaveBeenCalled();
    expect(f.row()).toMatchObject({ id: 8_000_000_000n, tileX: 725, tileY: 169, kind: 'ore_iron', depleted: false, activationOrdinal: 3 });
    f.run(); expect(f.updates).toHaveLength(1);
  });
  it('preserves rotating legacy behavior while interior veins still replenish in place', () => {
    const legacy = fixture(BigInt(sim.ORE_RESOURCE_ID_BASE)); legacy.run();
    expect(legacy.candidates).toHaveBeenCalledOnce(); expect(legacy.row()).toMatchObject({ tileX: 400, tileY: 400 });
    const interior = fixture(BigInt(sim.ORE_RESOURCE_ID_BASE), 5); interior.run();
    expect(interior.candidates).not.toHaveBeenCalled(); expect(interior.row()).toMatchObject({ tileX: 725, tileY: 169 });
  });
});
