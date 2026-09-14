import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { resourceHarvestResult, toolSpendResult } from './world-rules.js';

// Exercise the real transaction bodies and spending/wear helpers with an in-memory DB.
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['applyDigCellarTileLifecycle', 'applyHarvestResourceLifecycle', 'validateToolVigourSpend',
  'spendToolVigour', 'requireUsableTool', 'wearInventoryTool'];
const code = ts.transpileModule(names.map(name => {
  const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(name);
  return node.getText(source);
}).join('\n') + '\n' + source.statements.filter(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(declaration =>
    ['MINING_CLAIM_TICKS', 'MINING_DROP_RESERVATION_TICKS'].includes(declaration.name.getText(source))))
  .map(node => node.getText(source)).join('\n')
  + '\nreturn { applyDigCellarTileLifecycle, applyHarvestResourceLifecycle };', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const registry = sim.bootstrapContentRegistry();
const pickaxes = ['pickaxe', 'stone_pickaxe', 'copper_pickaxe', 'gold_pickaxe', 'silver_pickaxe', 'iron_pickaxe'];

function fixture(itemKind = 'pickaxe') {
  const identity = { toHexString: () => 'miner', isEqual: (other: unknown) => other === identity };
  let selected = { id: 'miner:0', identity, itemKind, quantity: 1, durability: sim.runtimeNormalizeDurability(registry, itemKind) };
  let stats = { vigourCenti: 100_000, lastSwingTick: 0n };
  const clock = { authorityTick: 100n };
  const position = { spaceId: 10002, x: 501 * sim.TILE_SIZE_FIXED, y: 501 * sim.TILE_SIZE_FIXED,
    facing: 'down', actionStartedTick: 0n };
  const ranks: Record<string, number> = {};
  const writes: string[] = [];
  let progress: { id: string; hits: number; work: number } | null = null;
  let claim: { claimedBy: typeof identity; claimUntilTick: bigint; partyId?: bigint } | null = null;
  let resource = { id: 5n, kind: 'ore_iron', spaceId: position.spaceId, tileX: 500, tileY: 500,
    health: 6, richness: 6, maximumRichness: 6, yieldProgress: 0, yieldsProduced: 0,
    activationOrdinal: 0, producedOre: false, depleted: false, miningClass: 'pure' };
  const drops: sim.LootDrop[] = [];
  let activeRegistry = registry;
  let opened = false;
  let allowed = true;
  const ctx = { sender: identity, senderAuth: { jwt: {} }, db: {
    membership: { identity: { find: () => ({}) } },
    player_position: { identity: { find: () => position, update: () => writes.push('position') } },
    player_survival: { identity: { find: () => ({ selectedSlot: 0 }) } },
    player_stats: { identity: { update: (row: typeof stats) => { stats = row; writes.push('vigour'); } } },
    world_clock: { id: { find: () => clock } }, world_seed: { id: { find: () => ({ seed: 42 }) } },
    inventory_slot: { id: { find: () => selected } },
    cellar_dig_progress: { id: {
      find: () => progress,
      update: (row: NonNullable<typeof progress>) => { progress = row; writes.push('progress'); },
      delete: () => { progress = null; writes.push('delete'); },
    }, insert: (row: NonNullable<typeof progress>) => { progress = row; writes.push('progress'); } },
    cellar_excavation: { insert: () => { opened = true; writes.push('excavation'); } },
    world_resource: { id: { find: (id: bigint) => id === 5n ? resource : null,
      update: (row: typeof resource) => { resource = row; writes.push('resource'); } },
      insert: () => writes.push('reveal') },
    world_resource_mining_claim: { resourceId: { find: () => claim,
      update: (row: NonNullable<typeof claim>) => { claim = row; writes.push('claim'); },
      delete: () => { claim = null; writes.push('claim'); } },
      insert: (row: NonNullable<typeof claim>) => { claim = row; writes.push('claim'); } },
  } };
  const noop = () => {};
  const deps = { ...sim, SenderError: Error, contentRegistry: () => activeRegistry,
    requireAuthorizedSender: noop, handsOccupiedFor: () => false, mountedNpcFor: () => null,
    instanceForSpace: () => null, activeSpaceDefinition: () => ({ generator: 'cellar' }),
    requireWorldModificationAuthorized: () => { if (!allowed) throw new Error('not_authorized'); },
    cellarTileIsDug: (_ctx: unknown, _space: number, x: number, y: number) => (x === 500 && y === 500 ? opened : true),
    cellarExcavationId: () => 'wall', playerSkillRanks: () => ranks,
    requireCombatActionReady: noop, previewPlayerStats: () => stats, advancePlayerStats: () => stats,
    activeCharacterCombatBalance: () => sim.BOOTSTRAP_CHARACTER_COMBAT_BALANCE,
    activePlayerModifiers: () => sim.compileEquipmentLoadout({ registry: activeRegistry,
      inventory: [{ ...selected, slot: 0 }], selectedSlot: 0, trainedRanks: ranks, skillPriority: [], bowDrawn: false }).modifiers,
    spendPlayerHunger: () => writes.push('hunger'),
    writeInventorySlot: (_ctx: unknown, row: typeof selected) => { selected = row; writes.push('wear'); },
    recordPlayerStatistic: noop, nextActionStartedTick: (_old: bigint, tick: bigint) => tick,
    dropWorldItemStack: (_ctx: unknown, drop: sim.LootDrop) => { drops.push(drop); writes.push('drop'); },
    applyLootDropsBehaviour: (_ctx: unknown, loot: sim.LootDrop[]) => { drops.push(...loot); writes.push('loot'); },
    lootAuthorityDependencies: {}, isVitalsToolKind: () => true,
    liveMapGeneratedResourceSuppressed: () => false, requireHearthResourceHarvestAccess: noop,
    resourceHarvestResult, toolSpendResult, miningClassForResource: () => resource.miningClass,
    playerPartyId: () => undefined, grantSkillExperience: noop, recordHearthResourceDepletion: noop,
  };
  const actions = new Function(...Object.keys(deps), code)(...Object.values(deps));
  return {
    ranks, writes, drops, clock,
    get progress() { return progress; }, get opened() { return opened; },
    get resource() { return resource; }, get durability() { return selected.durability; }, get vigour() { return stats.vigourCenti; },
    setLegacy: (hits: number) => { progress = { id: 'wall', hits, work: 0 }; },
    setDurability: (durability: number) => { selected = { ...selected, durability }; },
    setVigour: (vigourCenti: number) => { stats = { ...stats, vigourCenti }; },
    setAllowed: (value: boolean) => { allowed = value; },
    setRegistry: (value: typeof registry) => { activeRegistry = value; },
    dig: (mutate = true) => actions.applyDigCellarTileLifecycle(ctx, 500, 500, mutate),
    mine: (mutate = true) => actions.applyHarvestResourceLifecycle(ctx, 5n, mutate),
  };
}

describe('mining skills in authority transactions', () => {
  it('applies every Efficient Strikes rank to every pickaxe for wall completion and ore payouts', () => {
    const base = sim.cellarWallHitsRequired(42, 10002, 500, 500);
    for (const kind of pickaxes) for (const rank of [0, 1, 2]) {
      const wall = fixture(kind), node = fixture(kind);
      wall.ranks.efficient_strikes = rank; node.ranks.efficient_strikes = rank;
      const maximum = wall.durability;
      let hits = 0;
      while (!wall.opened) { wall.dig(); hits++; wall.clock.authorityTick += 10n; }
      expect(hits).toBe(Math.ceil(base * 3 / [3, 4, 6][rank]!));
      expect(wall.durability).toBe(maximum - hits * 2);
      expect(wall.writes.filter(write => write === 'excavation')).toHaveLength(1);
      expect(wall.drops[0]).toMatchObject({ itemKind: 'pebble', quantity: sim.cellarWallStoneQuantity(42, 10002, 500, 500) });
      hits = 0;
      while (node.resource.yieldsProduced === 0) { node.mine(); hits++; node.clock.authorityTick += 10n; }
      expect(hits).toBe([4, 3, 2][rank]);
      expect(node.durability).toBe(maximum - hits);
    }
  });

  it('applies Mining Endurance on both paths while preflight spends nothing', () => {
    for (const kind of pickaxes) for (const rank of [0, 1, 2, 3]) {
      for (const action of ['dig', 'mine'] as const) {
        const f = fixture(kind); f.ranks.mining_endurance = rank;
        f[action](false); expect(f.writes).toEqual([]);
        f[action](); expect(f.vigour).toBe(100_000 - 5000 * (1 - rank * .05));
        expect(f.writes.filter(write => write === 'wear')).toHaveLength(1);
      }
    }
  });

  it('converts old progress once and retains each contributor’s work after rank changes', () => {
    const f = fixture(); f.setLegacy(1); f.ranks.efficient_strikes = 2;
    f.dig(); expect(f.progress).toMatchObject({ hits: 2, work: 9 });
    f.clock.authorityTick += 10n; f.ranks.efficient_strikes = 0;
    f.dig(); expect(f.progress).toMatchObject({ hits: 3, work: 12 });
    f.clock.authorityTick += 10n; f.ranks.efficient_strikes = 2;
    f.dig(); expect(f.opened).toBe(true); expect(f.progress).toBeNull();
  });

  it('rejects broken tools, exhaustion, cooldowns and denied access without extra writes', () => {
    for (const action of ['dig', 'mine'] as const) {
      for (const failure of ['broken', 'exhausted', 'permission', 'cooldown']) {
        const f = fixture();
        if (failure === 'broken') f.setDurability(0);
        if (failure === 'exhausted') f.setVigour(0);
        if (failure === 'permission') f.setAllowed(false);
        if (failure === 'cooldown') { f[action](); f.writes.length = 0; }
        expect(() => f[action]()).toThrow(); expect(f.writes).toEqual([]);
      }
    }
  });

  it('uses authored Rockhound bonuses only on completion, including the final one-durability strike', () => {
    const f = fixture(); f.ranks.rockhound = 2;
    const loots = new Map(registry.loots), bonus = loots.get('loot:mining_rock_bonus')!;
    loots.set(bonus.id, { ...bonus, groups: [{ id: 'bonus', entries: [{ id: 'proof', weight: 1,
      conditions: [{ skillRank: { skill: 'rockhound', minimum: 2 } }],
      target: { item: 'item:gold_piece', min: 1, max: 1 } }] }] });
    f.setRegistry({ ...registry, loots });
    f.dig(); expect(f.drops).toEqual([]);
    f.clock.authorityTick += 10n;
    f.setLegacy(sim.cellarWallHitsRequired(42, 10002, 500, 500) - 1); f.setDurability(1);
    f.dig(false); expect(f.drops).toEqual([]);
    f.dig(); expect(f.durability).toBe(0);
    expect(f.drops[f.drops.length - 1]).toEqual({ itemKind: 'gold_piece', quantity: 1 });
    const count = f.drops.length;
    expect(() => f.dig()).toThrow('cellar_tile_already_dug'); expect(f.drops).toHaveLength(count);
  });

  it('rejects missing or retired wall bonus content before spending or opening terrain', () => {
    for (const retired of [false, true]) {
      const f = fixture(), loots = new Map(registry.loots), bonus = loots.get('loot:mining_rock_bonus')!;
      if (retired) loots.set(bonus.id, { ...bonus, retired: true });
      else loots.delete(bonus.id);
      f.setRegistry({ ...registry, loots });
      f.setLegacy(sim.cellarWallHitsRequired(42, 10002, 500, 500) - 1);
      for (const mutate of [false, true]) {
        expect(() => f.dig(mutate)).toThrow('loot_definition_missing');
        expect(f.writes).toEqual([]); expect(f.opened).toBe(false);
      }
    }
  });
});
