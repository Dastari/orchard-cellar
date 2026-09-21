import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { createBehaviourEffectWriter, rejectingBehaviourEffectAdapters, applyBehaviourEffects, type BehaviourEffectWriter } from './behaviour/applier.js';
import { tilePlacementResult, nextActionStartedTick } from './world-rules.js';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const registry = sim.bootstrapContentRegistry();
function compile(names: string[], deps: Record<string, unknown>) {
  const code = ts.transpileModule(names.map(name => {
    const node = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (!node) throw new Error(name);
    return node.getText(source);
  }).join('\n') + `\nreturn { ${names.join(', ')} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(deps), code)(...Object.values(deps));
}
function fixture(fruit = 'apple', spaceId = 10) {
  const identity = { toHexString: () => 'owner' };
  let slot = { id: 'owner:0', itemKind: `${fruit}_seed`, quantity: 2, durability: 0, lit: true };
  const position = { identity, spaceId, x: 50.5 * sim.TILE_SIZE_FIXED, y: 52 * sim.TILE_SIZE_FIXED };
  const switches = { authorized: true, occupied: false, mounted: false, hands: false, soil: true, crop: false };
  const resources = new Map<bigint, { id: bigint; kind: string; spaceId: number; growthStage: number; regrowthProgress: number }>();
  const writes: string[] = [];
  const collision = { width: 128, height: 128, blocked: new Array<boolean>(128 * 128).fill(false) } satisfies sim.CollisionMap;
  const ctx = { sender: identity, db: {
    player_position: { identity: { find: () => position } },
    player_survival: { identity: { find: () => ({ selectedSlot: 0 }) } },
    inventory_slot: { id: { find: () => slot } },
    world_clock: { id: { find: () => ({ authorityTick: 100n }) } },
    world_soil: { id: { find: () => switches.soil ? {} : null, delete: () => { writes.push('soil'); switches.soil = false; } } },
    world_crop: { id: { find: () => switches.crop ? {} : null } },
    world_resource: { id: { find: (id: bigint) => resources.get(id) ?? null }, insert: (row: typeof resources extends Map<bigint, infer R> ? R : never) => { resources.set(row.id, row); writes.push('tree'); } },
  } };
  const actions = compile(['worldBehaviourEffectWriter', 'validateFruitSeedPlacement', 'generatedWorldResourceRow', 'mutableFarmTileAuthorized'], {
    ...sim, SenderError: Error, createBehaviourEffectWriter, rejectingBehaviourEffectAdapters, tilePlacementResult,
    ANVIL_REPAIR_COST_BRONZE: 5, TOPSIDE_SPACE_ID: 0,
    contentRegistry: () => registry, worldSoilId: () => 'soil',
    activeWildlifeFeedReservedAt: () => !switches.authorized,
    homesteadForSpace: () => ({ spaceId: 10 }),
    homesteadRoleFor: () => switches.authorized ? 'worker' : null,
    activeSpaceDefinition: () => ({ sizeTiles: 128 }),
    requireWorldModificationAuthorized: () => { if (!switches.authorized) throw new Error('unauthorized'); },
    collisionForSpace: () => collision, tileOverlapsAnyPlayer: () => switches.occupied,
    mountedNpcFor: () => switches.mounted ? {} : null, handsOccupiedFor: () => switches.hands,
    grantSkillExperience: () => writes.push('xp'), updateEquippedForIdentity: () => {},
    writeInventorySlot: (_ctx: unknown, next: typeof slot) => { slot = next; writes.push('inventory'); },
  });
  return { switches, resources, writes, collision, position, get slot() { return slot; },
    plant: (effects: readonly sim.Effect[] = [{ plantSeed: { spaceId: String(spaceId), x: 50, y: 50 } }, { consumeSelected: 1 }]) => {
      const writer: BehaviourEffectWriter = actions.worldBehaviourEffectWriter(ctx, undefined, true);
      applyBehaviourEffects(effects, writer);
    } };
}

it('plants matching saplings on grass or tilled soil in both overworld and homestead spaces', () => {
  for (const fruit of ['apple', 'pear', 'cherry', 'peach']) for (const space of [0, 10]) for (const soil of [false, true]) {
    const f = fixture(fruit, space); f.switches.soil = soil; f.plant();
    expect([...f.resources.values()]).toMatchObject([{ kind: `tree_${fruit}`, spaceId: space, growthStage: 1, health: 1, regrowthProgress: sim.TREE_REGROWTH_SMALL_PROGRESS }]);
    expect(f.slot.quantity).toBe(1); expect(f.switches.soil).toBe(false);
    expect(f.writes).toEqual(['tree', ...(soil ? ['soil'] : []), 'xp', 'inventory']);
  }
});
it('rejects crops, visitors, riding, occupied hands, collision and incomplete batches without writes', () => {
  for (const [change, error] of [
    [{ crop: true }, 'crop_occupies_tile'],
    [{ authorized: false }, 'homestead_owner_required'], [{ mounted: true }, 'mounted_action_forbidden'],
    [{ hands: true }, 'hands_occupied'], [{ occupied: true }, 'tile_blocked'],
  ] as const) {
    const f = fixture(); Object.assign(f.switches, change);
    expect(() => f.plant()).toThrow(error); expect(f.writes).toEqual([]); expect(f.slot.quantity).toBe(2);
  }
  const cropSeed = fixture('strawberry'); cropSeed.slot.itemKind = 'strawberry_seeds'; cropSeed.switches.soil = false;
  expect(() => cropSeed.plant()).toThrow('not_tilled'); expect(cropSeed.writes).toEqual([]);
  const blocked = fixture(); blocked.collision.blocked[50 * 128 + 50] = true;
  expect(() => blocked.plant()).toThrow('tile_blocked'); expect(blocked.writes).toEqual([]);
  for (const effects of [
    [{ plantSeed: { x: 50, y: 50 } }],
    [{ plantSeed: { x: 50, y: 50 } }, { consumeSelected: 2 }],
    [{ plantSeed: { spaceId: '11', x: 50, y: 50 } }, { consumeSelected: 1 }],
    [{ plantSeed: { x: 100, y: 100 } }, { consumeSelected: 1 }],
  ] satisfies sim.Effect[][]) {
    const f = fixture(); expect(() => f.plant(effects)).toThrow(); expect(f.writes).toEqual([]);
  }
});
it('refuses a second tree on the same tile even if its collision or soil changes', () => {
  const f = fixture(); f.plant(); f.switches.soil = true; f.writes.length = 0;
  expect(() => f.plant()).toThrow('tile_blocked'); expect(f.slot.quantity).toBe(1); expect(f.writes).toEqual([]);
});
it('preserves planted outdoor trees during generated resource reconciliation', () => {
  const id = sim.plantedFruitTreeId(0, 4, 4);
  const removed: bigint[] = [];
  const ctx = { db: { world_resource: { iter: () => [{ id, spaceId: 0 }, { id: 42n, spaceId: 0 }], id: { delete: (value: bigint) => removed.push(value) } },
    world_resource_mining_claim: { resourceId: { delete: () => {} } } } };
  const actions = compile(['reconcileGeneratedSurvivalResources'], { ...sim, SenderError: Error,
    TOPSIDE_SPACE_ID: 0, contentRegistry: () => registry, generateSurvivalResources: () => [],
  });
  actions.reconcileGeneratedSurvivalResources(ctx);
  expect(removed).toEqual([42n]);
});

it('pays ripe fruit and a seed roll when a fruit tree is felled, then wood only while it ripens', () => {
  const noop = () => {};
  const identity = { toHexString: () => 'owner' };
  let resource = { id: 4n, kind: 'tree_apple', spaceId: 10, tileX: 5, tileY: 5,
    health: 3, depleted: false, growthStage: 3, regrowthProgress: 24, activationOrdinal: 0,
    fruitReadyAtTick: 0n };
  const ranks = { green_thumb: 1, orchard_seed_saver: 3 };
  const payouts: sim.LootDrop[][] = [];
  const position = { spaceId: 10, x: 5.5 * sim.TILE_SIZE_FIXED, y: 7 * sim.TILE_SIZE_FIXED, actionStartedTick: 0n };
  const ctx = { sender: identity, senderAuth: { jwt: {} }, db: {
    membership: { identity: { find: () => ({}) } },
    player_position: { identity: { find: () => position, update: noop } },
    player_survival: { identity: { find: () => ({ selectedSlot: 0 }) } },
    world_clock: { id: { find: () => ({ authorityTick: 100n }) } },
    world_seed: { id: { find: () => ({ seed: 42 }) } },
    inventory_slot: { id: { find: () => ({ id: 'owner:0', itemKind: 'axe', quantity: 1 }) } },
    world_resource: { id: { find: () => resource, update: (row: typeof resource) => { resource = row; } } },
  } };
  const primary = [{ itemKind: 'wood', quantity: 3 }, { itemKind: 'apple', quantity: 2 }];
  const actions = compile(['applyHarvestResourceLifecycle'], { ...sim, SenderError: Error,
    contentRegistry: () => registry, nextActionStartedTick, requireAuthorizedSender: noop, handsOccupiedFor: () => false,
    mountedNpcFor: () => null, requireWorldModificationAuthorized: noop, requireHearthResourceHarvestAccess: noop,
    liveMapGeneratedResourceSuppressed: () => false, requireUsableTool: noop, isVitalsToolKind: () => true,
    resourceHarvestResult: () => resource.depleted ? 'depleted' : 'ok',
    validateToolVigourSpend: noop, spendToolVigour: noop, wearInventoryTool: noop,
    recordPlayerStatistic: noop, recordHearthResourceDepletion: noop, playerSkillRanks: () => ranks,
    grantSkillExperience: noop, lootAuthorityDependencies: {},
    registeredLifecycleLoot: () => ({ drops: resource.growthStage === 3 ? primary : [{ itemKind: 'stick', quantity: 1 }] }),
    applyLootDropsBehaviour: (_ctx: unknown, drops: sim.LootDrop[]) => payouts.push(drops),
  });
  actions.applyHarvestResourceLifecycle(ctx, 4n, false);
  expect(resource.health).toBe(3); expect(payouts).toEqual([]);
  let seeds = 0;
  for (let ordinal = 0; ordinal < 100; ordinal++) {
    resource = { ...resource, health: 3, depleted: false, growthStage: 3, fruitReadyAtTick: 0n };
    const expectedSeed = sim.fruitSeedDrop(registry, resource, [{ itemKind: 'apple', quantity: 2 }], 3,
      [42, resource.id, ordinal]);
    actions.applyHarvestResourceLifecycle(ctx, 4n);
    actions.applyHarvestResourceLifecycle(ctx, 4n);
    expect(payouts.length).toBe(ordinal);
    actions.applyHarvestResourceLifecycle(ctx, 4n);
    expect(resource.activationOrdinal).toBe(ordinal + 1);
    expect(resource.fruitReadyAtTick).toBe(100n + BigInt(sim.AUTHORITY_TICKS_PER_DAY));
    expect(payouts[ordinal]).toEqual([
      { itemKind: 'wood', quantity: 3 },
      { itemKind: 'apple', quantity: 2 },
      ...(expectedSeed ? [expectedSeed] : []),
    ]);
    if (expectedSeed) seeds++;
    expect(() => actions.applyHarvestResourceLifecycle(ctx, 4n)).toThrow('resource_depleted');
  }
  expect(seeds).toBeGreaterThan(0);
  expect(seeds).toBeLessThan(100);
  const deadline = resource.fruitReadyAtTick;
  resource = { ...resource, health: 3, depleted: false, growthStage: 3 };
  actions.applyHarvestResourceLifecycle(ctx, 4n);
  actions.applyHarvestResourceLifecycle(ctx, 4n);
  actions.applyHarvestResourceLifecycle(ctx, 4n);
  expect(payouts[payouts.length - 1]).toEqual([{ itemKind: 'wood', quantity: 3 }]);
  expect(resource.fruitReadyAtTick).toBe(deadline);
  resource = { ...resource, health: 1, depleted: false, growthStage: 1 };
  actions.applyHarvestResourceLifecycle(ctx, 4n);
  expect(payouts[payouts.length - 1]).toEqual([{ itemKind: 'stick', quantity: 1 }]);
});
