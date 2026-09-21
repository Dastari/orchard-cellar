import { describe, expect, it } from 'vitest';
import {
  HOMESTEAD_BUILD_UNDO_TICKS,
  homesteadBuildDefinitions,
  homesteadBuildFootprintTiles,
  homesteadBuildRemovalRefund,
  runtimeHomesteadBuildDefinition,
} from './homestead-build.js';
import { placeableKinds } from './crafting.js';
import { bootstrapContentRegistry, bootstrapContentRows } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';
import type { ItemContentDefinition } from './content/definitions.js';
import type { ObjectContentDefinition } from './content/object-definition.js';

describe('homestead build registry', () => {
  it('includes every ordinary placeable in the data palette', () => {
    const registry = bootstrapContentRegistry();
    const outdoors = [...placeableKinds(registry)].filter(kind =>
      registry.objects.get(`object:${kind}`)?.components.placement?.spaces.includes('homestead'));
    expect([...homesteadBuildDefinitions(registry).keys()].sort()).toEqual(outdoors.sort());
    const residenceOnly = [...placeableKinds(registry)].filter(kind =>
      registry.objects.get(`object:${kind}`)?.components.placement?.spaces.every(space => space === 'residence'));
    expect(residenceOnly).toHaveLength(33);
    expect(residenceOnly).toContain('delver_memorial_planter');
    expect(residenceOnly.filter(kind => kind !== 'delver_memorial_planter')).toHaveLength(32);
    for (const kind of residenceOnly) expect(runtimeHomesteadBuildDefinition(registry, kind)).toBeNull();
  });

  it('projects a renamed prefab whose item and object ids share no suffix', () => {
    const item: ItemContentDefinition = {
      id: 'item:estate_kit_alpha', kind: 'item', schemaVersion: 1,
      displayName: 'Grand Orchard House', icon: { asset: 'prop_cf_shed' },
      quality: 'rare', maxStack: 1, tags: ['item.placeable'],
      economy: { buy: null, sell: 0 }, onUse: [],
    };
    const object: ObjectContentDefinition = {
      id: 'object:grand_orchard_house', kind: 'object', schemaVersion: 1,
      displayName: 'Grand Orchard House', components: {
        identity: { tags: ['build.prefab'] },
        collision: {
          footprint: Array.from({ length: 4 }, () => Array<number>(7).fill(15)),
          blocksMovement: true,
        },
        placement: {
          item: item.id, layer: 'object', spaces: ['homestead'], facing: false,
          footprint: Array.from({ length: 4 }, () => Array<number>(7).fill(15)),
        },
      },
    };
    const registry = buildContentRegistry([
      ...bootstrapContentRows(),
      { id: item.id, kind: item.kind, json: item },
      { id: object.id, kind: object.kind, json: object },
    ]).registry;
    expect(runtimeHomesteadBuildDefinition(registry, {
      kind: 'estate_kit_alpha', definitionId: object.id,
    })).toMatchObject({
      itemKind: 'estate_kit_alpha', layer: 'prefab',
      footprint: { width: 7, height: 4 }, minimumSizeTier: 1,
    });
  });

  it('expands bottom-centre footprints deterministically', () => {
    expect(homesteadBuildFootprintTiles({ footprint: { width: 3, height: 2 } }, 10, 12)).toEqual([
      { tileX: 9, tileY: 11 }, { tileX: 10, tileY: 11 }, { tileX: 11, tileY: 11 },
      { tileX: 9, tileY: 12 }, { tileX: 10, tileY: 12 }, { tileX: 11, tileY: 12 },
    ]);
    expect(homesteadBuildFootprintTiles({ footprint: { width: 2, height: 2 } }, 20, 20)).toEqual([
      { tileX: 20, tileY: 19 }, { tileX: 21, tileY: 19 },
      { tileX: 20, tileY: 20 }, { tileX: 21, tileY: 20 },
    ]);
  });

  it('returns the intact build during undo grace and material salvage later', () => {
    const registry = bootstrapContentRegistry();
    expect(homesteadBuildRemovalRefund('furnace', 10n, 10n + HOMESTEAD_BUILD_UNDO_TICKS, registry))
      .toEqual([{ itemKind: 'furnace', quantity: 1 }]);
    expect(homesteadBuildRemovalRefund('furnace', 10n, 11n + HOMESTEAD_BUILD_UNDO_TICKS, registry))
      .toEqual([{ itemKind: 'stone', quantity: 4 }]);
    expect(homesteadBuildRemovalRefund('fence', 10n, 11n + HOMESTEAD_BUILD_UNDO_TICKS, registry))
      .toEqual([{ itemKind: 'plank', quantity: 1 }]);
  });
});
