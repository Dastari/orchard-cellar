import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { nextActionStartedTick } from './world-rules.js';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const registry = sim.bootstrapContentRegistry();
function load(names: string[], dependencies: Record<string, unknown>) {
  const declarations = names.map(name => source.statements.find(node =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(source) === name)))!.getText(source));
  const code = ts.transpileModule(declarations.join('\n').replaceAll('export const ', 'const ') + `\nreturn {${names.join(',')}};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
}
function fixture(fruit = 'apple', planted = false) {
  const noop = () => {};
  const identity = { toHexString: () => 'owner' };
  const position = { spaceId: planted ? 10 : 0, x: 5.5 * sim.TILE_SIZE_FIXED,
    y: 6.5 * sim.TILE_SIZE_FIXED, actionStartedTick: 0n };
  const resource = { id: planted ? sim.plantedFruitTreeId(10, 5, 5) : 4n, kind: `tree_${fruit}`,
    spaceId: position.spaceId, tileX: 5, tileY: 5, health: 3, depleted: false,
    growthStage: 3, regrowthProgress: 24, activationOrdinal: 0, fruitReadyAtTick: 0n };
  const switches = { authorized: true, modify: true, access: true, suppressed: false, hands: false, mounted: false, alive: true, inventoryLocked: false, protocolValid: true };
  const clock = { authorityTick: 100n };
  const payouts: { drops: sim.LootDrop[]; options: Record<string, unknown> }[] = [];
  const xp: bigint[] = [];
  const ctx = { sender: identity, senderAuth: { jwt: {} }, db: {
    membership: { identity: { find: () => ({}) } },
    player_position: { identity: { find: () => position, update: noop } },
    player_survival: { identity: { find: () => ({ selectedSlot: 0 }) } },
    world_clock: { id: { find: () => clock } },
    world_seed: { id: { find: () => ({ seed: 42 }) } },
    inventory_slot: { id: { find: () => ({ id: 'owner:0', itemKind: 'axe', quantity: 1 }) } },
    world_resource: { id: { find: () => resource, update: (row: typeof resource) => Object.assign(resource, row) } },
  } };
  const actions = load(['MINING_DROP_RESERVATION_TICKS', 'pickOrchardFruit', 'gatherWorldResource', 'applyHarvestResourceLifecycle'], {
    ...sim, SenderError: Error, nextActionStartedTick, contentRegistry: () => registry,
    t: { u64: noop }, spacetimedb: { reducer: (_schema: unknown, reducer: unknown) => reducer },
    requireAuthorizedSender: () => { if (!switches.authorized) throw new Error('unauthorized'); },
    requireWorldModificationAuthorized: () => { if (!switches.modify) throw new Error('homestead_owner_required'); },
    requirePersistentInventoryAvailable: () => {
      if (!switches.protocolValid) throw new Error('inventory_client_update_required');
      if (switches.inventoryLocked) throw new Error('descent_inventory_locked');
    },
    advancePlayerStats: () => ({ healthCenti: switches.alive ? 10000 : 0 }),
    requireHearthResourceHarvestAccess: () => { if (!switches.access) throw new Error('target_not_ready'); },
    liveMapGeneratedResourceSuppressed: () => switches.suppressed,
    handsOccupiedFor: () => switches.hands, mountedNpcFor: () => switches.mounted ? {} : null,
    playerSkillRanks: () => ({ green_thumb: 1, orchard_seed_saver: 3 }),
    requireUsableTool: noop, isVitalsToolKind: () => true,
    resourceHarvestResult: () => resource.depleted ? 'depleted' : 'ok',
    validateToolVigourSpend: noop, spendToolVigour: noop, wearInventoryTool: noop,
    recordPlayerStatistic: noop, recordHearthResourceDepletion: noop,
    registeredLifecycleLoot: () => ({ drops: [{ itemKind: 'wood', quantity: 3 }, { itemKind: fruit, quantity: 2 }] }),
    grantSkillExperience: (_ctx: unknown, _sender: unknown, _track: string, amount: bigint) => xp.push(amount),
    lootAuthorityDependencies: {},
    applyLootDropsBehaviour: (_ctx: unknown, drops: sim.LootDrop[], options: Record<string, unknown>) => payouts.push({ drops, options }),
  });
  return { resource, position, switches, clock, payouts, xp,
    pick: () => actions.gatherWorldResource(ctx, { resourceId: resource.id }),
    fell: () => { for (let i = 0; i < 3; i++) actions.applyHarvestResourceLifecycle(ctx, resource.id); } };
}

describe('renewable orchard authority', () => {
  it('picks all four generated and planted species without damage, then waits exactly one game day', () => {
    for (const fruit of ['apple', 'pear', 'peach', 'cherry']) for (const planted of [false, true]) {
      const f = fixture(fruit, planted); f.pick();
      expect(f.payouts[0]!.drops[0]).toEqual({ itemKind: fruit, quantity: 2 });
      expect(f.resource).toMatchObject({ health: 3, depleted: false, growthStage: 3, regrowthProgress: 24,
        activationOrdinal: 1, fruitReadyAtTick: 100n + BigInt(sim.AUTHORITY_TICKS_PER_DAY) });
      expect(f.xp).toEqual([4n]);
      expect(f.payouts[0]!.options).toMatchObject({ inventoryFirst: true, recordItemsObtained: true,
        spaceId: f.resource.spaceId, reservedUntilTick: 100n + 10n * BigInt(sim.AUTHORITY_HZ) });
      expect(() => f.pick()).toThrow('fruit_ripening');
      f.clock.authorityTick = f.resource.fruitReadyAtTick - 1n;
      expect(() => f.pick()).toThrow('fruit_ripening');
      f.clock.authorityTick++;
      f.pick(); expect(f.payouts).toHaveLength(2); expect(f.resource.activationOrdinal).toBe(2);
    }
  });
  it('rejects permission, space, suppression, mount, hands, maturity and reach failures without payout or ordinal changes', () => {
    const cases: [(f: ReturnType<typeof fixture>) => void, string][] = [
      [f => { f.switches.authorized = false; }, 'unauthorized'],
      [f => { f.switches.alive = false; }, 'player_not_alive'],
      [f => { f.switches.inventoryLocked = true; }, 'descent_inventory_locked'],
      [f => { f.switches.protocolValid = false; }, 'inventory_client_update_required'],
      [f => { f.switches.modify = false; }, 'homestead_owner_required'],
      [f => { f.switches.access = false; }, 'target_not_ready'],
      [f => { f.switches.suppressed = true; }, 'target_not_ready'],
      [f => { f.resource.spaceId++; }, 'target_not_ready'],
      [f => { f.switches.mounted = true; }, 'mounted_action_forbidden'],
      [f => { f.switches.hands = true; }, 'hands_occupied'],
      [f => { f.resource.growthStage = 1; }, 'tree_immature'],
      [f => { f.resource.growthStage = 2; }, 'tree_immature'],
      [f => { f.resource.depleted = true; }, 'depleted'],
      [f => { f.position.x += 10 * sim.TILE_SIZE_FIXED; }, 'out_of_range'],
    ];
    for (const [change, error] of cases) {
      const f = fixture(); change(f);
      expect(() => f.pick()).toThrow(error); expect(f.payouts).toEqual([]);
      expect(f.resource.activationOrdinal).toBe(0); expect(f.resource.fruitReadyAtTick).toBe(0n);
    }
  });
  it('preserves the harvest through rejected dead, custody and stale-protocol retries, then pays once after recovery', () => {
    for (const [key,blocked,error] of [
      ['alive',false,'player_not_alive'],
      ['inventoryLocked',true,'descent_inventory_locked'],
      ['protocolValid',false,'inventory_client_update_required'],
    ] as const) {
      const f=fixture();
      const before={...f.resource};
      f.switches[key]=blocked;
      for(let attempt=0;attempt<2;attempt++)expect(()=>f.pick()).toThrow(error);
      expect(f.resource).toEqual(before);expect(f.payouts).toEqual([]);expect(f.xp).toEqual([]);
      f.switches[key]=!blocked;
      f.pick();
      const after={...f.resource};
      expect(f.payouts).toHaveLength(1);expect(f.xp).toEqual([4n]);
      expect(()=>f.pick()).toThrow('fruit_ripening');
      expect(f.resource).toEqual(after);expect(f.payouts).toHaveLength(1);expect(f.xp).toEqual([4n]);
    }
  });
  it('rolls seeds once per successful picking ordinal and rejects retries without consuming that ordinal', () => {
    const f = fixture(); let seeds = 0;
    for (let ordinal = 0; ordinal < 100; ordinal++) {
      const expected = sim.fruitSeedDrop(registry, f.resource, [{ itemKind: 'apple', quantity: 2 }], 3,
        [42, f.resource.id, ordinal]);
      f.pick();
      expect(f.payouts[ordinal]!.drops).toEqual([{ itemKind: 'apple', quantity: 2 }, ...(expected ? [expected] : [])]);
      if (expected) seeds++;
      expect(() => f.pick()).toThrow('fruit_ripening');
      expect(f.resource.activationOrdinal).toBe(ordinal + 1);
      f.clock.authorityTick = f.resource.fruitReadyAtTick;
    }
    expect(seeds).toBeGreaterThan(0); expect(seeds).toBeLessThan(100);
  });
  it('pays ripe fruit and one seed roll when a planted homestead tree is felled', () => {
    for (const fruit of ['apple', 'pear', 'peach', 'cherry']) {
      const f = fixture(fruit, true);
      const expectedSeed = sim.fruitSeedDrop(registry, f.resource, [{ itemKind: fruit, quantity: 2 }], 3,
        [42, f.resource.id, 0]);
      f.fell();
      expect(f.payouts).toHaveLength(1);
      expect(f.payouts[0]!.drops).toEqual([
        { itemKind: 'wood', quantity: 3 },
        { itemKind: fruit, quantity: 2 },
        ...(expectedSeed ? [expectedSeed] : []),
      ]);
      expect(f.xp).toEqual([4n]);
      expect(f.resource).toMatchObject({
        health: 0, depleted: true, activationOrdinal: 1,
        fruitReadyAtTick: 100n + BigInt(sim.AUTHORITY_TICKS_PER_DAY),
      });
      Object.assign(f.resource, { depleted: false, health: 3, growthStage: 3, regrowthProgress: 24 });
      f.fell();
      expect(f.payouts[1]!.drops).toEqual([{ itemKind: 'wood', quantity: 3 }]);
      expect(f.xp).toEqual([4n]);
      expect(f.resource.fruitReadyAtTick).toBe(100n + BigInt(sim.AUTHORITY_TICKS_PER_DAY));
      expect(f.resource.activationOrdinal).toBe(2);
    }
  });
  it('does not duplicate fruit or seed by picking then felling, and preserves the deadline through regrowth', () => {
    const f = fixture(); f.pick(); const deadline = f.resource.fruitReadyAtTick;
    f.fell(); expect(f.payouts[1]!.drops).toEqual([{ itemKind: 'wood', quantity: 3 }]);
    expect(f.resource.fruitReadyAtTick).toBe(deadline);
    expect(() => f.pick()).toThrow('depleted');
    Object.assign(f.resource, { depleted: false, health: 3, growthStage: 3, regrowthProgress: 24 });
    expect(() => f.pick()).toThrow('fruit_ripening');
    f.clock.authorityTick = deadline; f.pick();
    expect(f.resource.activationOrdinal).toBe(3); expect(f.payouts).toHaveLength(3);
  });
  it('preserves readiness and ordinal when relocating generated trees or reloading planted trees', () => {
    const generated = { ...fixture().resource, chunkX: 0, chunkY: 0,
      fruitReadyAtTick: 19000n, activationOrdinal: 8 };
    const planted = { ...fixture('pear', true).resource, spaceId: 0,
      chunkX: 0, chunkY: 0, fruitReadyAtTick: 20000n, activationOrdinal: 9 };
    const rows = new Map([[generated.id, generated], [planted.id, planted]]);
    const desired = { ...generated, id: Number(generated.id), tileX: 7 };
    const ctx = { db: { world_resource: { iter: () => rows.values(), id: {
      update: (row: typeof generated) => rows.set(row.id, row),
      delete: (id: bigint) => rows.delete(id),
    } }, world_resource_mining_claim: { resourceId: { delete: () => {} } } } };
    const { reconcileGeneratedSurvivalResources } = load(['reconcileGeneratedSurvivalResources'], {
      ...sim, SenderError: Error, TOPSIDE_SPACE_ID: 0,
      contentRegistry: () => registry, generateSurvivalResources: () => [desired],
      compiledLiveIslandRuntime: () => null,
      generatedWorldResourceRow: () => ({ ...desired, id: generated.id, fruitReadyAtTick: 0n, activationOrdinal: 0 }),
    });
    reconcileGeneratedSurvivalResources(ctx); reconcileGeneratedSurvivalResources(ctx);
    expect(rows.get(generated.id)).toMatchObject({ tileX: 7, fruitReadyAtTick: 19000n, activationOrdinal: 8 });
    expect(rows.get(planted.id)).toEqual(planted);
  });
  it('appends a no-delete migration default rather than resetting existing resources', () => {
    const text = source.getFullText();
    const schema = text.slice(text.indexOf('const world_resource = table('), text.indexOf('const hearth_resource_installation'));
    expect(schema.indexOf('fruitReadyAtTick: t.u64().default(0n)')).toBeGreaterThan(schema.indexOf('definitionId:'));
  });
});
