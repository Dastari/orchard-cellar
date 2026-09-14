import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import {composeHearthArchipelago} from './hearth-archipelago-authoring.js';
const source = ts.createSourceFile('index.ts', readFileSync(new URL('../../world/src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const code = ts.transpileModule(['hearthResourceSiteEnabled', 'installHearthResourceSites'].map(name => {
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`Missing production ${name}`);
  return declaration.getText(source);
}).join('\n') + '\nreturn installHearthResourceSites;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const registry = sim.bootstrapContentRegistry();
const document = composeHearthArchipelago(sim.createLiveIslandMapDocument()).document;
const map = sim.collisionMapForCompiledMapDocument(sim.compileMapDocument(sim.terrainDocumentForMapV3(
  document)));
function fixture() {
  type Row = Omit<NonNullable<ReturnType<typeof sim.initialHearthResourceState>>, 'id' | 'tileX'> & { id: bigint; tileX: number };
  const rows = new Map<bigint, Row>(), claims = new Set<bigint>(), depletion = new Set<bigint>(), writes: string[] = [];
  let receipt: { version: number } | null = null;
  const switches = { policy: true, phase: 'completed', activated: true, conflict: '', suppressed: false,
    online: false, visible: false, npc: false, soil: false, crop: false, recovery: true, home: true, item: true };
  const players: { spaceId: number; x: number; y: number; identity: string }[] = [];
  let collision = map;
  const atSite = sim.HEARTH_RESOURCE_SITES[5]!;
  const ctx = { sender: 'owner', timestamp: 10, db: {
    live_map_document: { mapId: { find: () => ({ revision: 7, contentHash: 'map' }) } },
    hearth_resource_installation: { id: { find: () => receipt }, insert: (row: { version: number }) => { writes.push('receipt'); receipt = row; } },
    world_resource: { id: { find: (id: bigint) => rows.get(id) ?? null }, insert: (row: Row) => { writes.push(`resource:${row.id}`); rows.set(row.id, row); } },
    world_resource_mining_claim: { resourceId: { find: (id: bigint) => claims.has(id) ? {} : null } },
    hearth_resource_depletion: { resourceId: { find: (id: bigint) => depletion.has(id) ? {} : null } },
    outdoor_encounter: { id: { find: () => ({ phase: switches.phase, activated: switches.activated, conflict: switches.conflict }) } },
    player_position: { iter: () => players }, player_public: { identity: { find: () => ({ online: switches.online }) } },
    world_npc: { by_chunk: { filter: () => switches.npc ? [{ health: 1, x: (atSite.tileX + .5) * sim.TILE_SIZE_FIXED, y: (atSite.tileY + .5) * sim.TILE_SIZE_FIXED }] : [] } },
    world_soil: { by_chunk: { filter: () => switches.soil ? [atSite] : [] } },
    crop_patch: { by_chunk: { filter: () => switches.crop ? [atSite] : [] } },
  } };
  const deps = { ...sim, SenderError: Error, LIVE_ISLAND_MAP_ID: 'island', TOPSIDE_SPACE_ID: 0,
    contentRegistry: () => ({ ...registry, contentHash: 'content', items: switches.item ? registry.items : new Map() }),
    compiledLiveIslandRuntime: () => ({ combatPolicy: { allowsHostileDamage: () => switches.policy }, document }),
    liveMapGeneratedResourceSuppressed: () => switches.suppressed, outdoorInsideCamp: () => switches.visible,
    collisionForSpace: () => collision, outdoorRecoveryPosition: () => switches.recovery ? { x: (652 + .5) * sim.TILE_SIZE_FIXED, y: (211 + .5) * sim.TILE_SIZE_FIXED } : null,
    outdoorMovementAllowed: () => switches.home };
  const install = new Function(...Object.keys(deps), code)(...Object.values(deps));
  return { rows, claims, depletion, writes, switches, players, setCollision: (next: typeof map) => { collision = next; },
    setReceipt: (next: { version: number }) => { receipt = next; },
    run: (revision = 7, mapHash = 'map', contentHash = 'content') => install(ctx, revision, mapHash, contentHash) };
}
it('installs six explicit rows and receipt once; retries preserve changed harvest state and custody', () => {
  const f = fixture(); f.run(); expect(f.writes).toHaveLength(7);
  const id = sim.HEARTH_RESOURCE_SITES[0]!.id;
  const changed = { ...f.rows.get(id)!, depleted: true, activationOrdinal: 8, health: 0, richness: 0 };
  f.rows.set(id, changed); f.claims.add(id); f.depletion.add(id); f.run();
  expect(f.writes).toHaveLength(7); expect(f.rows.get(id)).toBe(changed);
  expect(f.claims.has(id)).toBe(true); expect(f.depletion.has(id)).toBe(true);
  f.rows.delete(id); expect(() => f.run()).toThrow('custody_conflict'); expect(f.writes).toHaveLength(7);
});
it('preflights the last reserved ID and all orphan custody before the first write', () => {
  const site = sim.HEARTH_RESOURCE_SITES[5]!;
  for (const conflict of ['identity', 'claim', 'depletion', 'receipt']) {
    const f = fixture();
    if (conflict === 'identity') f.rows.set(site.id, { ...sim.initialHearthResourceState(site.id)!, tileX: 0 });
    if (conflict === 'claim') f.claims.add(site.id);
    if (conflict === 'depletion') f.depletion.add(site.id);
    if (conflict === 'receipt') f.setReceipt({ version: 1 });
    expect(() => f.run()).toThrow(/conflict/); expect(f.writes).toEqual([]);
  }
});
it('rejects stale snapshots and failed policy, content, encounter, occupancy and escape prerequisites without writes', () => {
  for (const args of [[8, 'map', 'content'], [7, 'old', 'content'], [7, 'map', 'old']] as const) {
    const f = fixture(); expect(() => f.run(args[0], args[1], args[2])).toThrow('snapshot_changed'); expect(f.writes).toEqual([]);
  }
  for (const patch of [{ policy: false }, { suppressed: true }, { phase: 'returning' }, { phase: 'unknown' },
    { phase: 'active', activated: true }, { conflict: 'blocked' }, { npc: true }, { soil: true }, { crop: true },
    { recovery: false }, { home: false }, { item: false }]) {
    const f = fixture(); Object.assign(f.switches, patch); expect(() => f.run()).toThrow(); expect(f.writes).toEqual([]);
  }
  const f = fixture(), site = sim.HEARTH_RESOURCE_SITES[5]!;
  f.players.push({ identity: 'offline', spaceId: 0, x: (site.tileX + .5) * sim.TILE_SIZE_FIXED, y: (site.tileY + .75) * sim.TILE_SIZE_FIXED + sim.PLAYER_HITBOX_FOOT_OFFSET });
  expect(() => f.run()).toThrow('player_occupied'); expect(f.writes).toEqual([]);
  f.players[0]!.x = 0; f.switches.online = true; f.switches.visible = true;
  expect(() => f.run()).toThrow('in_sight'); expect(f.writes).toEqual([]);
});
it('preserves matching pre-existing rows and unrelated resources instead of invoking generator reconciliation', () => {
  const f = fixture(), site = sim.HEARTH_RESOURCE_SITES[0]!;
  const existing = { ...sim.initialHearthResourceState(site.id)!, depleted: true, health: 0, richness: 0, activationOrdinal: 9 };
  f.rows.set(site.id, existing); f.claims.add(site.id); f.depletion.add(site.id);
  const unrelated = { ...existing, id: 12n }; f.rows.set(12n, unrelated);
  f.run(); expect(f.rows.get(site.id)).toBe(existing); expect(f.rows.get(12n)).toBe(unrelated);
  expect(f.writes).toHaveLength(6); expect(f.claims.has(site.id)).toBe(true); expect(f.depletion.has(site.id)).toBe(true);
});
