import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as sim from '@orchard/sim';
import { applyBehaviourEffects, createBehaviourEffectWriter, rejectingBehaviourEffectAdapters } from './behaviour/applier.js';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const registry = sim.bootstrapContentRegistry();
const owner = { toHexString: () => 'owner', isEqual: (other: unknown) => other === owner };
const at = { spaceId: '0', x: 1, y: 1 };
const effects: sim.Effect[] = [{ compostCrop: at }, { consumeSelected: 1 }, { statistic: { kind: 'compost_applied' } }];
function fixture() {
  const position = { x: sim.TILE_SIZE_FIXED, y: sim.TILE_SIZE_FIXED, spaceId: 0 };
  const crop = { id: 'crop', owner, cropKind: 'strawberry', tileX: 1, tileY: 1, spaceId: 0,
    plantedAtTick: 1n, growthTicks: 100n, growthUpdatedAtTick: 1n, composted: false };
  const definition = sim.runtimeCropDefinitionForSeed(registry, 'strawberry_seeds')!;
  const state = { crop: { ...crop }, item: { id: 'owner:0', itemKind: 'compost', quantity: 2, slot: 0, durability: 0, lit: true },
    soil: true, watered: true, present: true, authorized: true, mounted: false, hands: false, home: false, writes: 0, statistics: [] as unknown[] };
  const ctx = { sender: owner, db: {
    player_position: { identity: { find: () => position } },
    player_survival: { identity: { find: () => ({ selectedSlot: 0 }) } },
    world_clock: { id: { find: () => ({ authorityTick: 101n }) } },
    world_soil: { id: { find: () => state.soil ? { watered: state.watered, wateredAtTick: 1n } : null } },
    world_crop: { id: { find: () => state.present ? state.crop : null,
      update: (row: typeof crop) => { state.crop = row; state.writes++; } } },
    inventory_slot: { id: { find: () => state.item } },
  } };
  const dependencies = { ...sim, createBehaviourEffectWriter, rejectingBehaviourEffectAdapters, SenderError: Error,
    ANVIL_REPAIR_COST_BRONZE: 20, contentRegistry: () => registry,
    handsOccupiedFor: () => state.hands, mountedNpcFor: () => state.mounted ? {} : null,
    mutableFarmTileAuthorized: () => state.authorized, worldSoilId: () => 'crop',
    homesteadForSpace: () => state.home ? { owner } : null,
    cropDefinitionForHomestead: () => definition, cropAutomaticallyWatered: () => false,
    cropCalendarOffset: () => 0n, cropGreenhouseProtected: () => false,
    writeInventorySlot: (_ctx: unknown, item: typeof state.item) => { state.item = item; state.writes++; },
    updateEquippedForIdentity: () => {}, U64_MAX: (1n << 64n) - 1n,
    authoredReferenceSlug: (value: string) => value.replace(/^statistic:/, ''),
    recordPlayerStatistic: (_ctx: unknown, _identity: unknown, kind: string, delta: bigint) => { state.statistics.push({ kind, delta }); },
  };
  const names = ['compostCropPlan', 'worldBehaviourEffectWriter'];
  const declarations = names.map(name => source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)!.getText(source));
  const code = ts.transpileModule(declarations.join('\n') + '\nreturn worldBehaviourEffectWriter;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const writer = new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  return { state, position, definition, apply: (batch = effects) => applyBehaviourEffects(batch, writer(ctx, undefined, true)) };
}

describe('compost crop authority', () => {
  it('settles elapsed watered growth before one boost and consumes exactly one item', () => {
    const f = fixture(); f.apply();
    expect(f.state.crop.growthTicks).toBe(200n + f.definition.growthTicks / 4n);
    expect(f.state.crop).toMatchObject({ composted: true, growthUpdatedAtTick: 101n });
    expect(f.state.item.quantity).toBe(1);
    expect(() => f.apply()).toThrow('crop_already_composted');
    expect(f.state.item.quantity).toBe(1);
    expect(f.state.writes).toBe(2);
    expect(f.state.statistics).toEqual([{ kind: 'compost_applied', delta: 1n }]);
  });

  it('does not fabricate elapsed growth or water dry soil', () => {
    const f = fixture(); f.state.watered = false; f.apply();
    expect(f.state.crop.growthTicks).toBe(100n + f.definition.growthTicks / 4n);
    expect(f.state.watered).toBe(false);
  });

  it('caps growth at maturity and resets eligibility on a fresh planting', () => {
    const f = fixture(); f.state.crop.growthTicks = f.definition.growthTicks - 101n; f.apply();
    expect(f.state.crop.growthTicks).toBe(f.definition.growthTicks);
    f.state.crop = { ...f.state.crop, composted: false, growthTicks: 0n, plantedAtTick: 101n };
    f.apply(); expect(f.state.item).toMatchObject({ itemKind: 'empty', quantity: 0 });
  });

  it.each([
    ['soil', false, 'not_tilled'], ['present', false, 'crop_not_found'],
    ['authorized', false, 'homestead_owner_required'], ['mounted', true, 'mounted_action_forbidden'],
    ['hands', true, 'hands_occupied'],
  ] as const)('rejects %s failures before any crop or inventory write', (key, value, error) => {
    const f = fixture(); f.state[key] = value;
    expect(() => f.apply()).toThrow(error); expect(f.state.writes).toBe(0); expect(f.state.statistics).toEqual([]);
  });

  it('rejects mature, foreign, distant and wrong-item targets without consumption', () => {
    const mature = fixture(); mature.state.crop.growthTicks = mature.definition.growthTicks;
    expect(() => mature.apply()).toThrow('crop_already_mature'); expect(mature.state.writes).toBe(0);
    const foreign = fixture(); foreign.state.crop.owner = { ...owner, isEqual: () => false };
    expect(() => foreign.apply()).toThrow('owner_only_compost'); expect(foreign.state.writes).toBe(0);
    foreign.state.home = true; foreign.apply(); expect(foreign.state.item.quantity).toBe(1);
    const far = fixture(); far.position.x += 10 * sim.TILE_SIZE_FIXED;
    expect(() => far.apply()).toThrow('farm_tile_out_of_range'); expect(far.state.writes).toBe(0);
    const wrong = fixture(); wrong.state.item.itemKind = 'pomace';
    expect(() => wrong.apply()).toThrow('select_compost'); expect(wrong.state.writes).toBe(0);
  });

  it('preflights malformed, duplicate, cross-space and unpaid batches before writes', () => {
    const cases: readonly sim.Effect[][] = [
      [{ compostCrop: at }],
      [{ statistic: { kind: 'compost_applied' } }],
      [{ compostCrop: at }, { consumeSelected: 1 }],
      [{ compostCrop: at }, { consumeSelected: 1 }, { statistic: { kind: 'compost_applied', delta: 2 } }],
      [{ compostCrop: at }, { consumeSelected: 1 }, { statistic: { kind: 'compost_applied', subject: 'carrot' } }],
      [{ compostCrop: at }, { consumeSelected: 1 }, { statistic: { kind: 'farm_tiles_tilled' } }], [{ compostCrop: at }, { consumeSelected: 2 }],
      [{ compostCrop: at }, { compostCrop: at }, { consumeSelected: 1 }],
      [{ consumeSelected: 1 }, { compostCrop: { ...at, spaceId: '2' } }],
      [{ consumeSelected: 1 }, { compostCrop: { ...at, x: 1.5 } }],
    ];
    for (const batch of cases) {
      const f = fixture(); expect(() => f.apply(batch)).toThrow(); expect(f.state.writes).toBe(0); expect(f.state.statistics).toEqual([]);
    }
    const empty = fixture(); empty.state.item.quantity = 0;
    expect(() => empty.apply()).toThrow('behaviour_selected_item_required'); expect(empty.state.writes).toBe(0);
  });
});
