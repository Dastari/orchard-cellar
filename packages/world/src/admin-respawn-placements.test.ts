import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { TOPSIDE_SPACE_ID, type GeneratedSurvivalResource } from '@orchard/sim';

/**
 * BUG-052 regression: admin resource respawn selects and inserts each generated resource at the tile
 * reconcile uses (its map placement's tile when one exists, else its generated tile), through the one
 * helper they share (`placedLiveIslandResources`). Runs the real index.ts functions.
 */
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const NAMES = ['writeAdminObjectPlan', 'adminResourceCandidates', 'reconcileGeneratedSurvivalResources', 'placedLiveIslandResources',
  'liveIslandGeneratedResources', 'generatedSurvivalResources', 'adminObjectSpaceId'];
const javascript = ts.transpileModule(`${NAMES.map(name => {
  const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (fn === undefined) throw new Error(`missing production ${name}`);
  return fn.getText(source);
}).join('\n')}\nreturn { ${NAMES.join(', ')} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

type Row = { readonly id: bigint; readonly kind: string; readonly tileX: number; readonly tileY: number; readonly spaceId: number };
const GENERATED: readonly GeneratedSurvivalResource[] = [
  { id: 11, kind: 'tree_oak', tileX: 100, tileY: 100 },
  { id: 12, kind: 'tree_oak', tileX: 110, tileY: 100 },
  { id: 13, kind: 'ore_copper', tileX: 300, tileY: 300, nodeClass: 'mixed', richness: 2, spawnSiteId: 7, activationOrdinal: 0 },
];
/** Resource 12 is moved by the map from (110,100) to (140,100). */
const PLACEMENTS = [{ id: '12', originTileX: 110, originTileY: 100, tileX: 140, tileY: 100 }];

function world(placements = PLACEMENTS, existing: readonly Row[] = []) {
  const table = new Map(existing.map(row => [row.id, row]));
  const inserted: Row[] = [];
  const runtime = { staticView: { resourcePlacements: placements }, generatedResources: () => GENERATED };
  const dependencies = {
    TOPSIDE_SPACE_ID, SURVIVAL_WORLD_SEED: 1, SenderError: Error,
    generateSurvivalResources: () => { throw new Error('the runtime supplies the resources'); },
    contentRegistry: () => ({ contentHash: 'content' }),
    liveIslandCollisionRuntime: () => runtime,
    runtimeHearthResourceSite: () => null, runtimeHearthResourceRowMatchesSite: () => true,
    isPlantedFruitTreeId: () => false, isAuthoredHearthResourceSiteId: () => false,
    isMineableOreKind: () => false, isBreakableRockKind: () => false,
    // Row construction is out of scope: record the tile each caller passes.
    generatedWorldResourceRow: (resource: GeneratedSurvivalResource) => ({ id: BigInt(resource.id), kind: resource.kind,
      tileX: resource.tileX, tileY: resource.tileY, spaceId: TOPSIDE_SPACE_ID, chunkX: Math.floor(resource.tileX / 16), chunkY: Math.floor(resource.tileY / 16) }),
  };
  const functions = new Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies)) as {
    writeAdminObjectPlan(ctx: unknown, mutation: unknown, plan: unknown): void;
    adminResourceCandidates(ctx: unknown, mutation: unknown): readonly { entityId: string; tileX: number; tileY: number }[];
    reconcileGeneratedSurvivalResources(ctx: unknown): void;
  };
  const ctx = { db: {
    world_clock: { id: { find: () => ({ authorityTick: 5n }) } },
    world_resource: {
      iter: () => table.values(),
      id: { find: (id: bigint) => table.get(id) ?? null, update: (row: Row) => { table.set(row.id, row); }, delete: (id: bigint) => { table.delete(id); } },
      insert: (row: Row) => { inserted.push(row); table.set(row.id, row); },
    },
    world_resource_mining_claim: { resourceId: { delete: () => {} } },
  } };
  const respawn = (rectangle: { x0: number; y0: number; x1: number; y1: number }) => {
    const mutation = { operation: 'respawn_resources', spaceId: String(TOPSIDE_SPACE_ID), ...rectangle };
    const candidates = functions.adminResourceCandidates(ctx, mutation);
    functions.writeAdminObjectPlan(ctx, mutation, { before: { entities: [], resources: [] }, after: { entities: [], resources: candidates } });
    return candidates;
  };
  return { ctx, functions, inserted, table, respawn };
}

describe('BUG-052: admin respawn uses the placement tile, like reconcile', () => {
  it('selects a moved resource by its placement tile and inserts it there', () => {
    const w = world();
    const candidates = w.respawn({ x0: 130, y0: 90, x1: 150, y1: 110 });
    expect(candidates.map(({ entityId, tileX, tileY }) => [entityId, tileX, tileY])).toEqual([['12', 140, 100]]);
    expect(w.inserted.map(({ id, tileX, tileY }) => [id, tileX, tileY])).toEqual([[12n, 140, 100]]);
  });

  it('no longer selects a moved resource by its generated tile, and keeps unmoved resources at their generated tile', () => {
    const w = world();
    const candidates = w.respawn({ x0: 90, y0: 90, x1: 115, y1: 110 });
    expect(candidates.map(({ entityId }) => entityId)).toEqual(['11']);
    expect(w.inserted.map(({ id, tileX, tileY }) => [id, tileX, tileY])).toEqual([[11n, 100, 100]]);
  });

  it('never re-inserts an existing row, and without placements behaves exactly as before (generated tiles)', () => {
    const existing: Row = { id: 11n, kind: 'tree_oak', tileX: 100, tileY: 100, spaceId: TOPSIDE_SPACE_ID };
    const w = world([], [existing]);
    const candidates = w.respawn({ x0: 0, y0: 0, x1: 400, y1: 400 });
    expect(candidates.map(({ entityId, tileX, tileY }) => [entityId, tileX, tileY])).toEqual([['11', 100, 100], ['12', 110, 100], ['13', 300, 300]]);
    expect(w.inserted.map(({ id, tileX, tileY }) => [id, tileX, tileY])).toEqual([[12n, 110, 100], [13n, 300, 300]]);
    expect(w.table.get(11n)).toBe(existing);
  });

  it('inserts every resource exactly where reconcile inserts it (the shared helper)', () => {
    const admin = world();
    admin.respawn({ x0: 0, y0: 0, x1: 400, y1: 400 });
    const reconciled = world();
    reconciled.functions.reconcileGeneratedSurvivalResources(reconciled.ctx);
    expect(admin.inserted).toEqual(reconciled.inserted);
    expect(admin.inserted.find(({ id }) => id === 12n)).toMatchObject({ tileX: 140, tileY: 100 });
  });

  it('ignores a non-numeric candidate id instead of throwing', () => {
    const w = world();
    w.functions.writeAdminObjectPlan(w.ctx, { operation: 'respawn_resources', spaceId: String(TOPSIDE_SPACE_ID), x0: 0, y0: 0, x1: 1, y1: 1 },
      { before: { entities: [], resources: [] }, after: { entities: [], resources: [{ entityId: 'not-a-number', tileX: 0, tileY: 0 }] } });
    expect(w.inserted).toEqual([]);
  });
});
