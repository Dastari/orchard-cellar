import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'reconcileGeneratedSurvivalResources');
if (!declaration) throw new Error('missing production resource reconciliation');
const code = ts.transpileModule(`${declaration.getText(source)}\nreturn reconcileGeneratedSurvivalResources;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(patch: Record<string, unknown> = {}, placements: sim.MapResourcePlacement[] = []) {
  type Row = { id: bigint; kind: string; tileX: number; tileY: number; chunkX: number; chunkY: number; spaceId: number; [key: string]: unknown };
  const sites: Row[] = sim.HEARTH_RESOURCE_SITES.map(site => ({ id: site.id, kind: site.kind, spaceId: 0,
    tileX: site.tileX, tileY: site.tileY, chunkX: Math.floor(site.tileX / 16), chunkY: Math.floor(site.tileY / 16),
    spawnSiteId: site.id, definitionId: site.definitionId, depleted: true, richness: 0,
    maximumRichness: site.richness, health: 0, activationOrdinal: 7, respawnAtTick: 9000n,
    regrowthProgress: 0, growthStage: 0, yieldsProduced: site.richness,
  }));
  const legacy = { ...sites[0]!, id: 1n, kind: 'tree_oak', tileX: 400, tileY: 400 };
  const desired = { ...legacy, tileX: 401, chunkX: 25, chunkY: 25 };
  const stale = { ...legacy, id: 2n };
  const rows = new Map<bigint, Row>([legacy, stale, ...sites.map((row, i) => i === 0 ? { ...row, ...patch } as Row : row)].map(row => [row.id, row]));
  const claims = new Set([...rows.keys()]), writes: string[] = [];
  const ctx = { db: { world_resource: { iter: () => rows.values(), id: {
    delete: (id: bigint) => { writes.push(`delete:${id}`); rows.delete(id); },
    update: (row: Row) => { writes.push(`update:${row.id}`); rows.set(row.id, row); },
  }, insert: (row: Row) => { writes.push(`insert:${row.id}`); rows.set(row.id, row); } },
  world_resource_mining_claim: { resourceId: { delete: (id: bigint) => { writes.push(`claim:${id}`); claims.delete(id); } } } } };
  const dependencies = { ...sim, TOPSIDE_SPACE_ID: 0, SenderError: Error,
    contentRegistry: () => sim.bootstrapContentRegistry(),
    compiledLiveIslandRuntime: () => ({document:{resourcePlacements:placements}}),
    generateSurvivalResources: () => [desired], generatedWorldResourceRow: (row: Row) => row };
  const reconcile = new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  return { rows, claims, writes, sites, run: () => reconcile(ctx) };
}
describe('manifest-owned resource reconciliation', () => {
  it('preserves every depleted manifest row and claim across repeated world reconciliation while moving/removing legacy rows', () => {
    const f = fixture(); f.run(); f.run();
    for (const row of f.sites) { expect(f.rows.get(row.id)).toEqual(row); expect(f.claims.has(row.id)).toBe(true); }
    expect(f.rows.get(1n)?.tileX).toBe(401); expect(f.rows.has(2n)).toBe(false); expect(f.claims.has(2n)).toBe(false);
    expect(f.writes).toEqual(['update:1', 'claim:2', 'delete:2']);
  });
  it('rejects conflicting reserved identities before any legacy row or claim mutation', () => {
    for (const patch of [{ kind: 'ore_iron' }, { spaceId: 1 }, { tileX: 675 }, { tileY: 208 }, { chunkX: -1 }, { chunkY: -1 }, { spawnSiteId: 0n }]) {
      const f = fixture(patch), before = structuredClone([...f.rows]);
      expect(() => f.run()).toThrow('hearth_resource_site_conflict');
      expect([...f.rows]).toEqual(before); expect(f.writes).toEqual([]); expect(f.claims.size).toBe(8);
    }
  });
});

it('retains authored tree positions and harvest state through repeated generator reconciliation',()=>{
 const placements=[{id:'1',originTileX:400,originTileY:400,tileX:405,tileY:406},{id:'2',originTileX:400,originTileY:400,tileX:407,tileY:408}];
 const f=fixture({},placements),original={...f.rows.get(1n)!};
 f.run();f.run();
 expect(f.rows.get(1n)).toEqual({...original,tileX:405,tileY:406,chunkX:25,chunkY:25});
 expect(f.rows.has(2n)).toBe(true);
 expect(f.claims.has(2n)).toBe(true);
});
