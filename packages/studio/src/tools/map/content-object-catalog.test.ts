import { describe, expect, it } from 'vitest';
import type { ObjectContentDefinition } from '@orchard/sim';
import type { AssetPaletteItem } from '../object/asset-palette.js';
import {
  mapObjectCatalogEntriesWithContent,
  mapObjectDefinitionsFromContentRows,
  mapPrefabCollisionMaskForObjectCell,
  mapPrefabForObjectDefinition,
} from './content-object-catalog.js';

function paletteItem(
  assetId: number,
  assetName: string,
  visual: AssetPaletteItem['visual'] = { kind: 'state', name: 'base', frameIndex: 0 },
  footprint: readonly [number, number] = [1, 1],
): AssetPaletteItem {
  return {
    key: `${assetId}:${visual.kind}:${visual.name}:${visual.frameIndex}`,
    assetId,
    assetName,
    category: 'props',
    tags: ['review.approved'],
    layer: 'object',
    footprint,
    blocksMovement: true,
    builderAvailable: false,
    visual,
    frame: { x: assetId * 16, y: 0, width: 16, height: 16, durationTicks: 0 },
    animated: visual.kind === 'animation',
  };
}

function objectDefinition(
  id: ObjectContentDefinition['id'],
  displayName: string,
  asset: string,
  item: `item:${string}`,
  extras: Partial<ObjectContentDefinition['components']> = {},
): ObjectContentDefinition {
  return {
    id,
    kind: 'object',
    schemaVersion: 1,
    displayName,
    components: {
      identity: { tags: ['item.placeable'] },
      sprite: { asset },
      collision: { footprint: [[15]], blocksMovement: true },
      placement: { item, layer: 'object', spaces: ['homestead'], facing: false },
      ...extras,
    },
  };
}

const chest = objectDefinition(
  'object:chest', 'Chest', 'prop_cf_chest', 'item:chest',
  {
    sprite: { asset: 'prop_cf_chest', animationByState: { default: 'chest' } },
    container: { slotCount: 24, access: 'private', sortAllowed: true },
  },
);
const fruitPress = objectDefinition(
  'object:fruit_press', 'Fruit Press', 'prop_basket_press', 'item:fruit_press',
  {
    collision: { footprint: [[3, 12], [15, 0]], blocksMovement: true },
    processor: {
      processTag: 'press', slotRoles: { input: [0], output: [1] },
      ticksPerUnit: 20, catchUpCap: 10, autoStart: false,
    },
  },
);
const fermentationCask = objectDefinition(
  'object:fermentation_cask', 'Fermentation Cask', 'prop_oak_barrel',
  'item:fermentation_cask',
);

describe('map content object catalog', () => {
  it('reads valid object rows without letting unrelated or invalid content break the palette', () => {
    expect(mapObjectDefinitionsFromContentRows([
      { kind: 'item', json: '{}' },
      { kind: 'object', json: '{broken' },
      { kind: 'object', json: JSON.stringify(chest) },
    ])).toEqual([chest]);
    expect(mapObjectDefinitionsFromContentRows(undefined)).toEqual([]);
  });

  it('surfaces chest, fruit press, and fermentation cask as semantic gameplay prefabs', () => {
    const palette = [
      paletteItem(11, 'prop_cf_chest', { kind: 'animation', name: 'chest', frameIndex: 0 }),
      paletteItem(12, 'prop_basket_press', undefined, [2, 2]),
      paletteItem(13, 'prop_oak_barrel', undefined, [1, 2]),
    ];
    const entries = mapObjectCatalogEntriesWithContent(
      palette, 'assets-r7', [fruitPress, fermentationCask, chest],
    );

    expect(entries.map(({ prefab }) => prefab.title)).toEqual([
      'Chest', 'Fermentation Cask', 'Fruit Press',
    ]);
    expect(entries.map(({ contentDefinitionId }) => contentDefinitionId)).toEqual([
      'object:chest', 'object:fermentation_cask', 'object:fruit_press',
    ]);
    expect(entries.every(({ layer }) => layer === 'gameplay')).toBe(true);
    expect(entries.map(({ prefab }) => prefab.behaviors)).toEqual([
      [{ kind: 'placeable', archetype: 'world.placeable' }],
      [{ kind: 'placeable', archetype: 'world.placeable' }],
      [{ kind: 'placeable', archetype: 'world.placeable' }],
    ]);
    expect(entries[0]?.prefab).toMatchObject({
      id: 'content-chest',
      tags: expect.arrayContaining(['object:chest', 'item:chest', 'component.container']),
      placements: [expect.objectContaining({
        assetName: 'prop_cf_chest',
        visual: { kind: 'animation', name: 'chest', frameIndex: 0 },
      })],
    });
    expect(entries[2]?.prefab).toMatchObject({
      id: 'content-fruit-press', width: 2, height: 2,
      tags: expect.arrayContaining(['object:fruit_press', 'component.processor']),
    });
  });

  it('preserves authored collision masks and non-blocking footprints', () => {
    const pressItem = paletteItem(12, 'prop_basket_press', undefined, [2, 2]);
    const prefab = mapPrefabForObjectDefinition(fruitPress, pressItem, 'assets-r7');
    expect(mapPrefabCollisionMaskForObjectCell(3)).toBe(0x3333);
    expect(prefab.cells.map(({ collisionMask }) => collisionMask)).toEqual([
      0x3333, 0xcccc, 0xffff, 0x0000,
    ]);
    const nonBlocking = mapPrefabForObjectDefinition({
      ...fruitPress,
      components: {
        ...fruitPress.components,
        collision: { footprint: [[15, 15]], blocksMovement: false },
      },
    }, pressItem, 'assets-r7');
    expect(nonBlocking.cells.every(({ collisionMask }) => collisionMask === 0)).toBe(true);
  });

  it('uses generated entries unchanged when live definitions are unavailable', () => {
    const item = paletteItem(11, 'prop_cf_chest');
    const entries = mapObjectCatalogEntriesWithContent([item], 'assets-r7', []);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      item,
      prefab: { id: 'asset-11-state-base-0', title: 'Chest' },
    });
    expect(entries[0]).not.toHaveProperty('contentDefinitionId');
  });

  it('replaces heuristic duplicates only when a non-retired definition has matching art', () => {
    const chestItem = paletteItem(11, 'prop_cf_chest', { kind: 'animation', name: 'chest', frameIndex: 0 });
    const looseProp = paletteItem(22, 'prop_sign');
    const missing = objectDefinition('object:missing', 'Missing', 'prop_missing', 'item:missing');
    const retired = { ...fermentationCask, retired: true };
    const entries = mapObjectCatalogEntriesWithContent(
      [chestItem, looseProp], 'assets-r7', [missing, retired, chest],
    );
    expect(entries.map(({ prefab }) => prefab.id)).toEqual([
      'content-chest', 'asset-22-state-base-0',
    ]);
  });
});
