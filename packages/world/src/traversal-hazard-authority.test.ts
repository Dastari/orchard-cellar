import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { RULE_MEDIA, advanceHazardDamage, bootstrapContentRows, buildContentRegistry,
  runtimeTraversalPolicy, runtimeTraversalAbilities, TILE_SIZE_FIXED, type RuntimeTraversalActor } from '@orchard/sim';

// Execute the actual reducer helper against an in-memory private table. This
// catches persistence/cadence errors which a pure arithmetic test cannot see.
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('function clearTraversalHazards('), source.indexOf('function stepTraversalHazards('));
const javascript = ts.transpile(helper, { target: ts.ScriptTarget.ES2022 });
type Stored = { id: string; actor: string; policy: string; spaceId: number; numerator: bigint; elapsedTicks: number; lastTick: bigint };
function fixture(mode: 'shadow' | 'active' = 'active') {
  const rows = bootstrapContentRows().map(row => row.kind === 'world_rules'
    ? { ...row, json: { ...JSON.parse(typeof row.json === 'string' ? row.json : JSON.stringify(row.json)), mode } } : row);
  let registry = buildContentRegistry(rows).registry;
  const stored = new Map<string, Stored>();
  const ctx = { db: { traversal_hazard_state: {
    insert: (row: Stored) => stored.set(row.id, row),
    id: { find: (id: string) => stored.get(id) ?? null,
      update: (row: Stored) => stored.set(row.id, row), delete: (id: string) => stored.delete(id) },
    by_actor: { filter: (actor: string) => [...stored.values()].filter(row => row.actor === actor) },
  } } };
  const channels = { width: 1, height: 1, medium: [RULE_MEDIA.indexOf('shroom_water')], solidBlocked: [0] };
  const dependencies = { contentRegistry: () => registry, runtimeTraversalPolicy, runtimeTraversalAbilities,
    collisionForSpace: () => ({ traversalChannels: channels }), RULE_MEDIA, TILE_SIZE_FIXED, advanceHazardDamage, AUTHORITY_HZ: 20 };
  const damage = new Function(...Object.keys(dependencies), `${javascript}; return traversalHazardDamage;`)(...Object.values(dependencies)) as
    (ctx: unknown, key: string, actor: RuntimeTraversalActor, position: {spaceId:number;x:number;y:number}, maximum: number, tick: bigint) => number;
  const position = { spaceId: 1, x: 0, y: 0 };
  const actor: RuntimeTraversalActor = { kind: 'player' };
  return { stored, channels, position, actor, step: (tick: bigint, maximum = 100, suppliedActor: RuntimeTraversalActor = actor) => damage(ctx, 'player:test', suppliedActor, position, maximum, tick),
    replacePolicy: (mode: 'shadow' | 'active') => { registry = buildContentRegistry(rows.map(row => row.kind === 'world_rules'
      ? { ...row, json: { ...JSON.parse(JSON.stringify(row.json)), mode } } : row)).registry; } };
}
describe('authority percentage hazard persistence', () => {
  it('applies exactly once each observed second and is idempotent within a tick', () => {
    const f = fixture();
    for (let tick = 1n; tick < 20n; tick++) expect(f.step(tick)).toBe(0);
    expect(f.step(20n)).toBe(2);
    expect(f.step(20n)).toBe(0);
    expect(f.stored.size).toBe(1);
  });
  it('never catches up offline exposure and resets a space transition', () => {
    const f = fixture();
    for (let tick = 1n; tick < 20n; tick++) f.step(tick);
    expect(f.step(1000n)).toBe(0);
    f.position.spaceId = 2;
    expect(f.step(1001n)).toBe(0);
    expect([...f.stored.values()][0]?.elapsedTicks).toBe(1);
  });
  it('retains fractional NPC-scale damage instead of rounding every pulse to zero', () => {
    const f = fixture();
    let total = 0;
    for (let tick = 1n; tick <= 1000n; tick++) total += f.step(tick, 1);
    expect(total).toBe(1);
  });
  it('shadow mode never mutates hazard state, and missing definitions remain compatible', () => {
    const f = fixture('shadow');
    expect(f.step(20n)).toBe(0);
    expect(f.stored.size).toBe(0);
    f.replacePolicy('active');
    expect(f.step(21n, 100, { kind: 'definition', definitionId: 'npc:missing' })).toBe(0);
    expect(f.stored.size).toBe(0);
  });
  it('does not accrue exposure on land and flushes only previously earned fractional damage', () => {
    const f = fixture();
    for (let tick = 1n; tick <= 10n; tick++) f.step(tick);
    f.channels.medium[0] = RULE_MEDIA.indexOf('land');
    let damage = 0;
    for (let tick = 11n; tick <= 40n; tick++) damage += f.step(tick);
    expect(damage).toBe(1);
    expect(f.stored.size).toBe(0);
  });
});

const sinkSource = source.slice(source.indexOf('function stepTraversalHazards('), source.indexOf('function combatElevationAt('));
const sinkJs = ts.transpile(sinkSource, { target: ts.ScriptTarget.ES2022 });
function sinkFixture(rogue = false, role = 'guard') {
  const identity = { toHexString: () => 'test' };
  const player = { identity, spaceId: 1, x: 0, y: 0 };
  let stats = { healthCenti: 100, healthRemainder: 12, regenTick: 0n };
  const events: string[] = [];
  const run = { id: 1n, phase: 'combat', currency: 0 };
  const npc = { id: 2n, health: 10, x: 0, y: 0, spaceId: 1 };
  let savedNpc = npc;
  let incoming = 25;
  const ctx = { db: {
    traversal_hazard_state: { iter: () => [], id: { delete: () => undefined } },
    player_position: { identity: { find: () => player } },
    player_effect: { by_identity: { filter: () => [] } },
    player_stats: { identity: { update: (value: typeof stats) => { stats = value; } } },
    rogue_run_member: { identity: { find: () => rogue ? { runId: 1n } : null } },
    rogue_run: { id: { find: () => run, update: () => undefined } },
    world_npc: { id: { find: () => savedNpc } },
    world_wildlife_profile: { npcId: { find: () => null } },
    rogue_enemy_profile: { npcId: { find: () => null } },
    outdoor_enemy_profile: { npcId: { find: () => ({ role, encounterId: 'camp', maximumHealth: 10 }),
      update: (value: { summonState: string }) => events.push(`summon_${value.summonState}`) } },
    outdoor_encounter: { id: { find: () => ({ phase: 'completed' }) } },
    enemy_attack: { npcId: { delete: () => events.push('cancel_attack') } },
  } };
  const dependencies = { contentRegistry: () => ({}), runtimeTraversalPolicy: () => ({ mode: 'active' }),
    advancePlayerStats: () => stats, resolvedStatsForRow: () => ({ maxHealthCenti: 100 }),
    traversalHazardDamage: () => incoming, mountedNpcFor: () => null,
    compiledLiveIslandRuntime: () => ({ combatPolicy: {} }), collisionForSpace: () => ({}),
    TOPSIDE_SPACE_ID: 1, outdoorRecoveryPosition: () => ({x:0,y:0}),
    cancelFishingCastFor: () => events.push('cancel_fishing'), clearTraversalHazards: () => events.push('clear_hazards'),
    finishRogueRun: () => events.push('finish_run'), recoverOutdoorKnockout: () => events.push('recover'),
    runtimeNpcMount: () => null,
    npcTraversalActor: () => ({ kind: 'definition', definitionId: 'enemy:test' }),
    persistOutdoorEncounterDamage: (_ctx: unknown, _id: string, contributor: unknown, damage: number) => {
      expect(contributor).toBe(null); events.push('encounter_damage'); return damage;
    },
    updateWorldNpc: (_ctx: unknown, value: typeof npc) => { savedNpc = value; },
    clearOutdoorAdds: () => events.push('clear_adds'),
    ROGUE_ENEMY_DEFEAT_RETENTION_TICKS: 100n,
  };
  const sink = new Function(...Object.keys(dependencies), `${sinkJs}; return stepTraversalHazards;`)(...Object.values(dependencies)) as
    (ctx: unknown, tick: bigint, players: readonly unknown[], npcs: readonly unknown[]) => void;
  return { events, stats: () => stats, npc: () => savedNpc, damage: (value: number) => { incoming = value; },
    players: () => sink(ctx, 20n, [player], []), npcs: () => sink(ctx, 20n, [], [npc]) };
}
describe('hazard health sinks', () => {
  it('marks a defeated summoned add dead without changing base encounter health', () => {
    const f = sinkFixture(false, 'add'); f.damage(10); f.npcs();
    expect(f.npc().health).toBe(0);
    expect(f.events).toEqual(['clear_hazards', 'cancel_attack', 'summon_dead']);
  });
  it('applies player health once, clears regen remainder and cancels interrupted fishing', () => {
    const f = sinkFixture(); f.players();
    expect(f.stats()).toMatchObject({ healthCenti: 75, healthRemainder: 0, regenTick: 20n });
    expect(f.events).toEqual(['cancel_fishing']);
  });
  it('uses existing knockout recovery and clears pending hazard debt on death', () => {
    const f = sinkFixture(); f.damage(100); f.players();
    expect(f.stats().healthCenti).toBe(0);
    expect(f.events).toEqual(['cancel_fishing', 'clear_hazards', 'recover']);
  });
  it('finishes a defeated rogue run through its existing restoration path', () => {
    const f = sinkFixture(true); f.damage(100); f.players();
    expect(f.events).toContain('finish_run');
    expect(f.events).not.toContain('recover');
  });
  it('updates encounter aggregate health without fabricating credit and cancels dead attacks', () => {
    const f = sinkFixture(); f.damage(10); f.npcs();
    expect(f.npc().health).toBe(0);
    expect(f.events).toEqual(['encounter_damage', 'clear_hazards', 'cancel_attack', 'clear_adds']);
  });
});
