import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';
import * as sim from '@orchard/sim';
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const registry = sim.bootstrapContentRegistry();
const names = ['hearthResourceSiteEnabled', 'recordHearthResourceDepletion', 'stepHearthResourceRespawns'];
const code = ts.transpileModule(names.map(name => {
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(`Missing production ${name}`);
  return node.getText(source);
}).join('\n') + '\nreturn stepHearthResourceRespawns;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(siteIndex = 0) {
  let currentRegistry = registry;
  const site = sim.HEARTH_RESOURCE_SITES[siteIndex]!;
  let resource = { id: site.id, kind: site.kind, spawnSiteId: BigInt(site.id), tileX: Number(site.tileX), tileY: Number(site.tileY),
    chunkX: Math.floor(site.tileX / 16), chunkY: Math.floor(site.tileY / 16), spaceId: 0,
    definitionId: site.definitionId,
    health: 0, depleted: true, activationOrdinal: 7, yieldsProduced: 2, richness: 0, maximumRichness: 2,
    growthStage: 3, regrowthProgress: 24, miningClaimedBy: 'old', miningPartyId: 9n, miningClaimUntilTick: 99n };
  type Tracker = { resourceId: bigint; activationOrdinal: number; depletedAtTick: bigint;
    lastObservedTick: bigint; quietSinceTick: bigint | undefined; lastObservedMicros: bigint };
  let tracker: Tracker | null = null, writes = 0, claimDeletes = 0;
  const switches = { visible: false, engaged: false, returning: false, completed: false, unknownPhase: false, enabled: true, blocked: false, npc: false };
  const ctx = { timestamp: { microsSinceUnixEpoch: 0n }, db: {
    world_resource: { id: { find: (id: bigint) => id === resource.id ? resource : null,
      update: (row: typeof resource) => { resource = row; writes++; } } },
    hearth_resource_depletion: { insert: (row: Tracker) => { tracker = row; }, resourceId: {
      find: () => tracker, update: (row: Tracker) => { tracker = row; }, delete: () => { tracker = null; },
    } },
    outdoor_encounter: { id: { find: () => ({ conflict: '', activated: switches.engaged, phase: switches.unknownPhase ? 'unexpected' : switches.returning ? 'returning' : switches.completed ? 'completed' : 'active' }) } },
    world_npc: { by_chunk: { filter: () => switches.npc ? [{ health: 3, x: (site.tileX + .5) * sim.TILE_SIZE_FIXED, y: (site.tileY + .5) * sim.TILE_SIZE_FIXED }] : [] } },
    world_resource_mining_claim: { resourceId: { delete: () => { claimDeletes++; } } },
  } };
  const deps = { ...sim, contentRegistry: () => currentRegistry, TOPSIDE_SPACE_ID: 0,
    compiledLiveIslandRuntime: () => ({ combatPolicy: { allowsHostileDamage: () => switches.enabled } }),
    liveMapGeneratedResourceSuppressed: () => false, outdoorInsideCamp: () => switches.visible,
    outdoorCollisionMap: () => ({}), positionCollides: () => switches.blocked, combatElevationAt: () => site.elevation };
  const run = new Function(...Object.keys(deps), code)(...Object.values(deps));
  const step = (tick: bigint, wallMicros = tick * 50_000n) => {
    ctx.timestamp.microsSinceUnixEpoch = wallMicros;
    run(ctx, tick, [{ spaceId: 0 }]);
  };
  const advance = (start: bigint, end: bigint) => { for (let tick = start; tick <= end; tick += 20n) step(tick); };
  return { switches, step, advance, setRegistry: (next: typeof registry) => { currentRegistry = next; }, resource: () => resource, tracker: () => tracker, writes: () => writes,
    claimDeletes: () => claimDeletes, changeResource: (changes: Partial<typeof resource>) => { resource = { ...resource, ...changes }; } };
}
it('persists depletion and atomically plans one refill without any drop or reward dependency', () => {
  const f = fixture(); f.step(0n); f.advance(20n, 11980n);
  expect(f.resource().depleted).toBe(true); expect(f.tracker()?.depletedAtTick).toBe(0n);
  f.step(12000n);
  expect(f.resource()).toMatchObject({ depleted: false, activationOrdinal: 8, health: 2, richness: 2,
    yieldsProduced: 0, miningClaimedBy: undefined, miningPartyId: undefined, miningClaimUntilTick: 0n });
  expect(f.tracker()).toBeNull(); expect(f.claimDeletes()).toBe(1);
  f.step(12000n); f.step(12020n); expect(f.writes()).toBe(1);
});
it('observes a passing player between one-second samples and requires a fresh quiet interval', () => {
  const f = fixture(); f.step(0n); f.advance(20n, 11980n);
  f.switches.visible = true; f.step(11981n); expect(f.tracker()?.quietSinceTick).toBeUndefined();
  f.switches.visible = false; f.advance(12000n, 12580n); expect(f.writes()).toBe(0);
  f.step(12600n); expect(f.writes()).toBe(1);
});
it('resets quiet after a wall-clock interruption even when authority ticks remain consecutive', () => {
  const f = fixture(); f.step(0n); f.advance(20n, 11980n);
  const offset = 60_000_000n;
  f.step(12000n, 12000n * 50_000n + offset); expect(f.writes()).toBe(0);
  expect(f.tracker()?.quietSinceTick).toBe(12000n);
  for (let tick = 12020n; tick <= 12580n; tick += 20n) f.step(tick, tick * 50_000n + offset);
  expect(f.writes()).toBe(0); f.step(12600n, 12600n * 50_000n + offset); expect(f.writes()).toBe(1);
});
it('holds depleted nodes for an engaged or returning encounter, policy removal, collision or an occupying NPC', () => {
  for (const flag of ['engaged', 'returning', 'enabled', 'blocked', 'npc'] as const) {
    const f = fixture(); f.step(0n); f.advance(20n, 11980n);
    f.switches[flag] = flag !== 'enabled'; f.step(12000n);
    expect(f.writes()).toBe(0); expect(f.claimDeletes()).toBe(0); expect(f.tracker()?.quietSinceTick).toBeUndefined();
    f.switches[flag] = flag === 'enabled'; f.advance(12020n, 12600n); expect(f.writes()).toBe(0);
    f.step(12620n); expect(f.writes()).toBe(1);
  }
});
it('does not repair or refill an identity conflict or stale generation', () => {
  for (const changes of [{ activationOrdinal: 8 }, { tileX: 0 }, { spawnSiteId: 0n }]) {
    const f = fixture(); f.step(0n); const original = structuredClone(f.tracker());
    f.changeResource(changes); f.advance(20n, 13000n);
    expect(f.tracker()).toEqual(original); expect(f.writes()).toBe(0); expect(f.claimDeletes()).toBe(0);
  }
});

it('allows quiet after a completed encounter whose production completion keeps activated true', () => {
  const f = fixture(); f.step(0n); f.advance(20n, 11980n);
  f.switches.engaged = true; f.step(12000n);
  f.switches.completed = true;
  f.advance(12020n, 12600n); expect(f.writes()).toBe(0);
  f.step(12620n); expect(f.writes()).toBe(1);
});

it('fails closed for an unknown encounter phase even when activated is false', () => {
  const f = fixture(); f.step(0n); f.advance(20n, 11980n);
  f.switches.unknownPhase = true; f.step(12000n);
  expect(f.writes()).toBe(0); expect(f.claimDeletes()).toBe(0);
  expect(f.tracker()?.quietSinceTick).toBeUndefined();
});

it('restores all six fixed site identities at full growth with material yields separate from tree health', () => {
  for (const [index, site] of sim.HEARTH_RESOURCE_SITES.entries()) {
    const f = fixture(index); f.step(0n); f.advance(20n, 12000n);
    expect(f.writes()).toBe(1);
    expect(f.resource()).toMatchObject({ id: site.id, kind: site.kind, tileX: site.tileX, tileY: site.tileY,
      growthStage: site.maturityGrowthStage ?? 3, regrowthProgress: site.regrowthProgress,
      health: site.health, richness: site.richness, maximumRichness: site.richness,
      miningClass: site.nodeClass,
      activationOrdinal: 8, depleted: false });
  }
});

it('requires a fresh quiet interval after invalid gathering content is restored without resetting resource or claim state', () => {
  const retiredItems = new Map(registry.items);
  retiredItems.set('item:basalt', { ...retiredItems.get('item:basalt')!, retired: true });
  const missingLoot = new Map(registry.loots); missingLoot.delete('loot:mining_ore_cinder');
  const changedTools = new Map(registry.items);
  for (const [id, item] of changedTools) if (item.quality === 'common'
    && item.tool?.specialization === 'mining') changedTools.set(id, {
      ...item, tool: { ...item.tool, mineableResources: [] },
    });
  for (const invalid of [{ ...registry, items: retiredItems }, { ...registry, loots: missingLoot }, { ...registry, items: changedTools }]) {
    const f = fixture(); f.step(0n); f.advance(20n, 11980n);
    const before = structuredClone(f.resource());
    f.setRegistry(invalid); f.step(12000n);
    expect(f.resource()).toEqual(before); expect(f.writes()).toBe(0); expect(f.claimDeletes()).toBe(0);
    expect(f.tracker()?.quietSinceTick).toBeUndefined();
    f.setRegistry(registry); f.advance(12020n, 12600n);
    expect(f.writes()).toBe(0); expect(f.claimDeletes()).toBe(0);
    f.step(12620n); expect(f.writes()).toBe(1); expect(f.claimDeletes()).toBe(1);
    expect(f.resource().activationOrdinal).toBe(before.activationOrdinal + 1);
    f.step(12640n); expect(f.writes()).toBe(1);
  }
});
