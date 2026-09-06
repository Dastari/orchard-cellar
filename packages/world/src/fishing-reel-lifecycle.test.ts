import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  bootstrapContentRegistry,
  FISHING_CAST_TICKS,
  runtimeToolDefinition,
  runtimeToolSpecialization,
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
function fixture() {
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
  let fish = 0;
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
    contentRegistry: bootstrapContentRegistry,
    runtimeToolDefinition, runtimeToolSpecialization, FISHING_CAST_TICKS,
    requireUsableTool: () => { if (!state.usable) throw new Error('tool_broken'); },
    handsOccupiedFor: () => state.occupied,
    mountedNpcFor: () => state.mounted ? {} : null,
    activePersonalQuestResource: () => null,
    liveMapGeneratedResourceSuppressed: () => false,
    resourceHarvestResult: () => 'ok',
    ensurePlayerStats: () => ({ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }),
    activePlayerModifiers: () => [],
    resolveStats: () => ({ attributes: { dex: 1 } }),
    resolveFishingLoot: () => ({ drops: [{ itemKind: 'raw_fish', quantity: 1 }] }),
    applyLootDropsBehaviour: () => { fish += 1; writes.push('loot'); },
    lootAuthorityDependencies: {}, MINING_DROP_RESERVATION_TICKS: 20n,
    recordPlayerStatistic: () => { writes.push('statistic'); },
    wearInventoryTool: () => { writes.push('wear'); },
    grantSkillExperience: () => { writes.push('experience'); },
    FISHING_CATCH_EXPLORER_XP: 1n,
  };
  const reel = new Function(...Object.keys(dependencies), `${javascript}; return applyFishingReelLifecycle;`)(
    ...Object.values(dependencies),
  ) as (context: typeof ctx, mutate?: boolean) => void;
  return {
    state, selected, writes, clock,
    fish: () => fish,
    cast: () => cast,
    startNewCast: () => { cast = { poolId: 7n, startedTick: clock.authorityTick, targetTileX: 3, targetTileY: 4 }; },
    complete: () => { reel(ctx, false); reel(ctx); },
  };
}

describe('fishing reel terminal completion', () => {
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
