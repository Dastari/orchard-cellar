import { describe, expect, it } from 'vitest';
import {
  ANVIL_REPAIR_COST_BRONZE,
  FENCE_JOIN_EAST,
  FENCE_JOIN_NORTH,
  FENCE_JOIN_SOUTH,
  FENCE_JOIN_WEST,
  placeableKinds,
  runtimePlaceableDefinition,
  runtimePlaceableSlotCapacity,
  craftingStationWithinReach,
  fenceJoinMask,
  fiberDropsFromTilling,
} from './crafting.js';
import { itemDefinition, placeableHasInterface, placeableInterface } from './item-containers.js';
import { bootstrapContentRegistry, bootstrapContentRows } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';
import type { ItemContentDefinition } from './content/definitions.js';
import type { ObjectContentDefinition } from './content/object-definition.js';

describe('28§8 deterministic fiber drops', () => {
  it('returns the same result for the same authority inputs', () => {
    const input = [0x4f434852, 0, 320, 320, 42n] as const;
    expect(fiberDropsFromTilling(...input)).toBe(fiberDropsFromTilling(...input));
  });

  it('holds the documented 30 percent gate across a stable distribution fixture', () => {
    const drops = Array.from({ length: 10_000 }, (_, tick) =>
      fiberDropsFromTilling(0x4f434852, 0, 320, 320, BigInt(tick)));
    expect(drops.filter(Boolean).length).toBeGreaterThanOrEqual(2_800);
    expect(drops.filter(Boolean).length).toBeLessThanOrEqual(3_200);
  });
});

describe('28§7 fence joins', () => {
  it('resolves isolated, straight, corner, tee, and cross masks', () => {
    const mask = (neighbors: readonly string[]) => fenceJoinMask(10, 10, (x, y) => neighbors.includes(`${x},${y}`));
    expect(mask([])).toBe(0);
    expect(mask(['10,9', '10,11'])).toBe(FENCE_JOIN_NORTH | FENCE_JOIN_SOUTH);
    expect(mask(['11,10', '10,11'])).toBe(FENCE_JOIN_EAST | FENCE_JOIN_SOUTH);
    expect(mask(['10,9', '11,10', '9,10'])).toBe(FENCE_JOIN_NORTH | FENCE_JOIN_EAST | FENCE_JOIN_WEST);
    expect(mask(['10,9', '11,10', '10,11', '9,10'])).toBe(15);
  });

  it('keeps gates in the fence connection family and standing torches passable', () => {
    const registry = bootstrapContentRegistry();
    expect(runtimePlaceableDefinition(registry, 'fence_gate')?.connectsFence).toBe(true);
    expect(runtimePlaceableDefinition(registry, 'standing_torch')?.blocksMovement).toBe(false);
  });

  it('registers the one-tile blocking anvil and its copper repair cost', () => {
    expect(runtimePlaceableDefinition(bootstrapContentRegistry(), 'anvil'))
      .toMatchObject({ blocksMovement: true, slotCapacity: 0 });
    expect(itemDefinition('anvil')).toMatchObject({ maxStack: 1, iconKey: 'prop_cf_anvil', iconAnimation: 'animate' });
    expect(ANVIL_REPAIR_COST_BRONZE).toBe(5);
  });

  it('counts a placed anvil as the crafting station its recipes ask for', () => {
    const registry = bootstrapContentRegistry();
    // Every authored station tag must reach recipe availability; an anvil that
    // reported no station left anvil recipes permanently unsatisfiable.
    expect(runtimePlaceableDefinition(registry, 'anvil')?.station).toBe('anvil');
    expect(runtimePlaceableDefinition(registry, 'workbench')?.station).toBe('workbench');
    expect(runtimePlaceableDefinition(registry, 'furnace')?.station).toBe('furnace');
    const anvilRecipes = [...registry.recipes.values()]
      .filter((recipe) => recipe.retired !== true
        && recipe.stationRequirement?.objectTag === 'station.anvil');
    expect(anvilRecipes.length).toBeGreaterThan(0);
    const player = { spaceId: 0, tileX: 10, tileY: 10 };
    expect(craftingStationWithinReach(player, { spaceId: 0, tileX: 10, tileY: 11 }, 2)).toBe(true);
    expect(craftingStationWithinReach(player, { spaceId: 0, tileX: 13, tileY: 10 }, 2)).toBe(false);
  });

  it('derives processor UI contracts and capacities from item tags', () => {
    expect(placeableInterface('cooking_fire')).toBe('cooking');
    expect(placeableInterface('camp_cooking_fire')).toBe('cooking');
    expect(placeableHasInterface('furnace', 'furnace')).toBe(true);
    expect(placeableHasInterface('barrel', 'barrel')).toBe(true);
    expect(placeableHasInterface('fruit_press', 'press')).toBe(true);
    expect(placeableHasInterface('fermentation_cask', 'fermentation')).toBe(true);
    expect(placeableInterface('campfire')).toBeNull();
    const registry = bootstrapContentRegistry();
    expect(runtimePlaceableSlotCapacity(registry, 'cooking_fire')).toBe(2);
    expect(runtimePlaceableSlotCapacity(registry, 'camp_cooking_fire')).toBe(2);
    expect(runtimePlaceableSlotCapacity(registry, 'furnace')).toBe(3);
    expect(runtimePlaceableSlotCapacity(registry, 'barrel')).toBe(8);
    expect(runtimePlaceableSlotCapacity(registry, 'fruit_press')).toBe(3);
    expect(runtimePlaceableSlotCapacity(registry, 'fermentation_cask')).toBe(2);
  });

  it('projects renamed, non-suffix placeables solely from authored object components', () => {
    const item: ItemContentDefinition = {
      id: 'item:portable_beacon', kind: 'item', schemaVersion: 1,
      displayName: 'Portable Beacon', icon: { asset: 'prop_cf_lantern' },
      quality: 'common', maxStack: 1, tags: ['item.placeable'],
      economy: { buy: null, sell: 0 }, onUse: [],
    };
    const object: ObjectContentDefinition = {
      id: 'object:totally_unrelated_machine', kind: 'object', schemaVersion: 1,
      displayName: 'Beacon Machine', components: {
        identity: { tags: ['station.campfire'] },
        collision: { footprint: [[15, 15]], blocksMovement: false },
        placement: {
          item: item.id, layer: 'object', spaces: ['homestead'], facing: false,
          footprint: [[15, 15]],
        },
        container: { slotCount: 5, access: 'private', sortAllowed: true },
      },
    };
    const registry = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: item.id, kind: item.kind, json: item },
      { id: object.id, kind: object.kind, json: object },
    ]).registry;
    expect(runtimePlaceableDefinition(registry, {
      kind: 'portable_beacon', definitionId: object.id,
    })).toEqual({
      blocksMovement: false, slotCapacity: 5, station: 'campfire', light: null, connectsFence: false,
    });
    expect(runtimePlaceableSlotCapacity(registry, 'portable_beacon')).toBe(5);
    expect(placeableKinds(registry)).toContain('portable_beacon');
  });

  it('never grants a different definition to an explicit unknown or retired object reference', () => {
    const registry = bootstrapContentRegistry();
    expect(runtimePlaceableDefinition(registry, { kind: 'furnace', definitionId: 'object:missing' })).toBeNull();
    const furnace = registry.objects.get('object:furnace')!;
    const retiredRegistry = { objects: new Map(registry.objects).set(furnace.id, { ...furnace, retired: true }) };
    expect(runtimePlaceableDefinition(retiredRegistry, { kind: 'campfire', definitionId: furnace.id })).toBeNull();
    expect(runtimePlaceableSlotCapacity(registry, { kind: 'furnace', definitionId: 'object:missing' })).toBe(0);
    expect(runtimePlaceableDefinition(registry, { kind: 'furnace', definitionId: '' })?.station).toBe('furnace');
  });
});

describe('28§14 workbench proximity', () => {
  it('accepts the inclusive two-tile boundary and rejects distance three or another space', () => {
    const player = { spaceId: 0, tileX: 10, tileY: 10 };
    expect(craftingStationWithinReach(player, { spaceId: 0, tileX: 12, tileY: 12 }, 2)).toBe(true);
    expect(craftingStationWithinReach(player, { spaceId: 0, tileX: 13, tileY: 10 }, 2)).toBe(false);
    expect(craftingStationWithinReach(player, { spaceId: 1, tileX: 10, tileY: 10 }, 2)).toBe(false);
  });
});
