import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  bootstrapContentRegistry,
  FISHING_CAST_TICKS,
  runtimeCharacterCombatBalance,
  resolveStatsWithProfile,
  runtimeResourceDefinition,
  runtimeTaggedLootTotals,
  runtimeToolDefinition,
  runtimeToolSpecialization,
  FISHING_CATCH_FARMING_XP, FISHING_POOL_DEPLETION_FARMING_XP,
  type ContentRegistry,
  type LootDrop,
} from '@orchard/sim';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const implementation = source.statements.find((node): node is ts.FunctionDeclaration => (
  ts.isFunctionDeclaration(node) && node.name?.text === 'applyFishingReelLifecycle'
));
if (implementation === undefined) throw new Error('fishing reel authority implementation missing');
const javascript = ts.transpileModule(implementation.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

/** Execute the actual authority primitive with in-memory custody and reward
 * dependencies, including its non-mutating preflight and subsequent apply. */
function fixture(options: {
  readonly registry?: ContentRegistry;
  readonly drops?: readonly LootDrop[];
  readonly personal?: boolean;
} = {}) {
  const sender = { toHexString: () => 'fishing-player' };
  let cast: { poolId: bigint; startedTick: bigint; targetTileX: number; targetTileY: number } | null = {
    poolId: 7n, startedTick: 1n, targetTileX: 3, targetTileY: 4,
  };
  const pool = { id: 7n, kind: 'fish_pool', spaceId: 0, tileX: 3, tileY: 4, depleted: false, richness: 4, activationOrdinal: 0 };
  const position = { x: 0, y: 0, spaceId: 0 };
  const selected = { itemKind: 'fishing_rod', quantity: 1 };
  const clock = { authorityTick: 1n + FISHING_CAST_TICKS };
  const state = { authorized: true, ready: true, usable: true, occupied: false, mounted: false };
  const writes: string[] = [];
  const experience: Array<{track: string; amount: bigint}> = [];
  const statistics: Array<{ kind: string; delta: bigint; subject?: string }> = [];
  let fish = 0;
  const registry = options.registry ?? bootstrapContentRegistry();
  const ctx = { sender, senderAuth: { jwt: {} }, db: {
    membership: { identity: { find: () => ({}) } },
    fishing_cast: { identity: { find: () => cast, delete: () => { cast = null; writes.push('delete_cast'); } } },
    player_position: { identity: {
      find: () => state.ready ? position : null,
      update: () => { writes.push('position'); },
    } },
    player_survival: { identity: { find: () => ({ selectedSlot: 0 }) } },
    world_clock: { id: { find: () => clock } },
    inventory_slot: { id: { find: () => selected } },
    world_resource: { id: { find: () => pool, update: () => { writes.push('pool'); } } },
    world_seed: { id: { find: () => ({ seed: 123 }) } },
  } };
  const dependencies = {
    SenderError: Error,
    requireAuthorizedSender: () => { if (!state.authorized) throw new Error('unauthorized'); },
    contentRegistry: () => registry,
    activeCharacterCombatBalance: () => runtimeCharacterCombatBalance(registry),
    runtimeResourceDefinition, runtimeToolDefinition, runtimeToolSpecialization, FISHING_CAST_TICKS,
    requireUsableTool: () => { if (!state.usable) throw new Error('tool_broken'); },
    handsOccupiedFor: () => state.occupied,
    mountedNpcFor: () => state.mounted ? {} : null,
    activePersonalQuestResource: () => options.personal ? {resourceKind: 'fish_pool', tileX: 3, tileY: 4, remaining: 3, spaceId: 0, itemKind: 'raw_fish', statisticKind: 'fish_caught', subjectKind: 'raw_fish'} : null,
    insertPlayerCarriedItem: () => { fish += 1; writes.push('loot'); return true; },
    liveMapGeneratedResourceSuppressed: () => false,
    resourceHarvestResult: () => 'ok',
    ensurePlayerStats: () => ({ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }),
    activePlayerModifiers: () => [],
    resolveStats: () => ({ attributes: { dex: 1 } }), resolveStatsWithProfile,
    resolveFishingLoot: () => ({
      drops: options.drops ?? [{ itemKind: 'raw_fish', quantity: 1 }],
    }),
    runtimeTaggedLootTotals,
    applyLootDropsBehaviour: () => { fish += 1; writes.push('loot'); },
    lootAuthorityDependencies: {}, MINING_DROP_RESERVATION_TICKS: 20n,
    recordPlayerStatistic: (
      _ctx: unknown,
      _identity: unknown,
      kind: string,
      delta: bigint,
      _tick: bigint,
      subject?: string,
    ) => {
      statistics.push({ kind, delta, ...(subject === undefined ? {} : { subject }) });
      writes.push('statistic');
    },
    wearInventoryTool: () => { writes.push('wear'); },
    grantSkillExperience: (_ctx: unknown, _identity: unknown, track: string, amount: bigint) => { experience.push({track, amount}); writes.push('experience'); },
    FISHING_CATCH_FARMING_XP, FISHING_POOL_DEPLETION_FARMING_XP, fishingRespawnDelayTicks: () => 3600n,
  };
  const reel = new Function(...Object.keys(dependencies), `${javascript}; return applyFishingReelLifecycle;`)(
    ...Object.values(dependencies),
  ) as (context: typeof ctx, mutate?: boolean) => void;
  return {
    state, selected, writes, clock, statistics, experience, pool,
    fish: () => fish,
    cast: () => cast,
    startNewCast: () => { cast = { poolId: 7n, startedTick: clock.authorityTick, targetTileX: 3, targetTileY: 4 }; },
    complete: () => { reel(ctx, false); reel(ctx); },
  };
}

describe('fishing reel terminal completion', () => {
  it('trains the Farming fishing specialization once on catch and depletion', () => {
    const test = fixture(); test.pool.richness = 1; test.complete();
    expect(test.experience).toEqual([{track: 'farming', amount: 5n}, {track: 'farming', amount: 10n}]);
    test.complete(); expect(test.experience).toHaveLength(2);
  });

  it('trains Farming for personal tutorial catches without a pool-depletion bonus', () => {
    const test = fixture({personal: true}); test.complete(); test.complete();
    expect(test.experience).toEqual([{track: 'farming', amount: 5n}]);
  });

  it('grants a catch once and makes repeated concurrent-client completion effect-free', () => {
    const test = fixture();
    test.complete();
    expect(test.fish()).toBe(1);
    expect(test.cast()).toBeNull();
    expect(test.writes.filter((kind) => kind === 'wear')).toHaveLength(1);
    const committed = [...test.writes];
    test.complete();
    test.complete();
    expect(test.fish()).toBe(1);
    expect(test.writes).toEqual(committed);
  });

  it('still rejects reeling an immature newer cast without any reward or custody change', () => {
    const test = fixture();
    test.complete();
    test.startNewCast();
    const nextCast = test.cast();
    const committed = [...test.writes];
    expect(() => test.complete()).toThrow('fishing_too_soon');
    expect(test.cast()).toEqual(nextCast);
    expect(test.fish()).toBe(1);
    expect(test.writes).toEqual(committed);
  });

  it('records the actual active fish-tagged output kind and quantity', () => {
    const base = bootstrapContentRegistry();
    const rawFish = base.items.get('item:raw_fish')!;
    const moonCarp = { ...rawFish, id: 'item:moon_carp' as const };
    const items = new Map(base.items);
    items.set(moonCarp.id, moonCarp);
    const test = fixture({
      registry: { ...base, items },
      drops: [
        { itemKind: 'moon_carp', quantity: 2 },
        { itemKind: 'wood', quantity: 1 },
      ],
    });

    test.complete();
    expect(test.statistics.filter(({ kind }) => kind === 'fish_caught')).toEqual([
      { kind: 'fish_caught', delta: 2n, subject: 'moon_carp' },
    ]);
  });

  it('fails closed before custody or statistic writes for missing and retired loot items', () => {
    const missing = fixture({ drops: [{ itemKind: 'missing_fish', quantity: 1 }] });
    expect(() => missing.complete()).toThrow('loot_item_definition_missing');
    expect(missing.writes).toEqual([]);
    expect(missing.experience).toEqual([]);
    expect(missing.cast()).not.toBeNull();

    const base = bootstrapContentRegistry();
    const fish = base.items.get('item:raw_fish')!;
    const items = new Map(base.items);
    items.set(fish.id, { ...fish, retired: true });
    const retired = fixture({ registry: { ...base, items } });
    expect(() => retired.complete()).toThrow('loot_item_definition_missing');
    expect(retired.writes).toEqual([]);
    expect(retired.experience).toEqual([]);
    expect(retired.cast()).not.toBeNull();
  });

  it.each([
    ['authorized', 'unauthorized'], ['ready', 'player_not_ready'], ['usable', 'tool_broken'],
  ] as const)('retains %s validation after completion', (field, message) => {
    const test = fixture();
    test.complete();
    test.state[field] = false;
    expect(() => test.complete()).toThrow(message);
    expect(test.fish()).toBe(1);
  });

  it('retains selected-tool, occupied-hand, and mount checks after completion', () => {
    const test = fixture();
    test.complete();
    test.selected.itemKind = 'wood';
    expect(() => test.complete()).toThrow('wrong_tool');
    test.selected.itemKind = 'fishing_rod';
    test.state.occupied = true;
    expect(() => test.complete()).toThrow('hands_occupied');
    test.state.occupied = false;
    test.state.mounted = true;
    expect(() => test.complete()).toThrow('mounted_action_forbidden');
    expect(test.fish()).toBe(1);
  });
});
