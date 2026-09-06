import {
  MAP_PREFAB_COLLISION_MASK_EMPTY,
  createMapPrefabDocument,
  normalizeMapPrefab,
  parseContentDefinition,
  type MapObjectLayer,
  type MapPrefabBehavior,
  type MapPrefabDocumentV2,
  type MapStampLayer,
  type ObjectContentDefinition,
} from '@orchard/sim';
import type { AssetPaletteItem } from '../object/asset-palette.js';
import {
  mapObjectCatalogEntries,
  type MapObjectCatalogEntry,
} from './map-object-catalog.js';

export interface MapContentDefinitionRow {
  readonly kind: string;
  readonly json: string;
}

export interface MapContentObjectCatalogEntry extends MapObjectCatalogEntry {
  /** Present only when this palette entry came from an authoritative gameplay
   * object definition. Generated-art fallbacks remain authored scenery. */
  readonly contentDefinitionId?: ObjectContentDefinition['id'];
}

const CONTENT_OBJECT_COLLECTION = Object.freeze({
  id: 'content-objects',
  label: 'Game Objects',
  color: '#b96f50',
});

function normalizedId(value: string): string {
  return value.replace(/[^a-z0-9-]+/giu, '-').replace(/^-+|-+$/gu, '').toLocaleLowerCase();
}

export function mapPrefabIdForObjectDefinition(definition: ObjectContentDefinition): string {
  return `content-${normalizedId(definition.id.replace(/^object:/u, ''))}`.slice(0, 64).replace(/-+$/u, '');
}

/** Reads the public content table defensively. A malformed or newer object row
 * cannot take the offline generated-art palette down with it. */
export function mapObjectDefinitionsFromContentRows(
  rows: readonly MapContentDefinitionRow[] | undefined,
): readonly ObjectContentDefinition[] {
  return Object.freeze((rows ?? []).flatMap((row) => {
    if (row.kind !== 'object') return [];
    try {
      const definition = parseContentDefinition(row.kind, row.json);
      return definition.kind === 'object' ? [definition] : [];
    } catch {
      return [];
    }
  }).sort((left, right) => left.id.localeCompare(right.id)));
}

function layerForDefinition(
  definition: ObjectContentDefinition,
  item: AssetPaletteItem,
): MapStampLayer {
  const layer = definition.components.placement?.layer;
  if (layer === 'ground') return 'ground';
  if (layer === 'overlay') return 'canopy';
  if (layer === 'object') return 'object';
  return item.layer;
}

function behaviorForDefinition(
  definition: ObjectContentDefinition,
  layer: MapStampLayer,
): MapPrefabBehavior {
  const tags = definition.components.identity?.tags ?? [];
  const semantic = `${definition.id} ${tags.join(' ')}`.toLocaleLowerCase();
  if (/\bgate\b/u.test(semantic)) return { kind: 'gate', archetype: 'world.gate' };
  if (/\bfarm|farmland|soil\.plot\b/u.test(semantic)) {
    return { kind: 'farm_zone', archetype: 'world.farm-zone' };
  }
  if (/\bresource\.tree\b/u.test(semantic)) return { kind: 'resource', archetype: 'resource.tree' };
  if (/\bresource\.crop\b/u.test(semantic)) return { kind: 'resource', archetype: 'resource.crop' };
  if (definition.components.placement !== undefined
    || definition.components.container !== undefined
    || definition.components.processor !== undefined
    || definition.components.interactions !== undefined
    || definition.components.frame !== undefined) {
    return { kind: 'placeable', archetype: 'world.placeable' };
  }
  if (layer === 'ground') return { kind: 'surface', archetype: 'world.surface' };
  return { kind: 'static' };
}

function mapLayerForDefinition(
  definition: ObjectContentDefinition,
  item: AssetPaletteItem,
): MapObjectLayer {
  const layer = layerForDefinition(definition, item);
  if (layer === 'ground') return 'ground';
  if (layer === 'canopy') return 'canopy';
  return behaviorForDefinition(definition, layer).kind === 'static' ? 'objects' : 'gameplay';
}

function defaultAnimation(definition: ObjectContentDefinition): string | null {
  return definition.components.sprite?.animationByState?.default ?? null;
}

function visualPreference(
  definition: ObjectContentDefinition,
  item: AssetPaletteItem,
): number {
  const requestedAnimation = defaultAnimation(definition);
  if (requestedAnimation !== null
    && item.visual.kind === 'animation'
    && item.visual.name === requestedAnimation) return 0;
  const variants = definition.components.sprite?.variants ?? [];
  if (item.visual.kind === 'variant' && variants.includes(item.visual.name)) return 1;
  if (item.visual.name === 'base' && item.visual.kind === 'state') return 2;
  if (item.visual.name === 'idle' && item.visual.kind === 'animation') return 3;
  if (item.visual.name === 'default') return 4;
  return 5;
}

function itemForDefinition(
  definition: ObjectContentDefinition,
  palette: readonly AssetPaletteItem[],
): AssetPaletteItem | null {
  const assetName = definition.components.sprite?.asset;
  if (assetName === undefined) return null;
  return palette.filter((item) => item.assetName === assetName).sort((left, right) => (
    visualPreference(definition, left) - visualPreference(definition, right)
    || left.key.localeCompare(right.key)
  ))[0] ?? null;
}

function footprintSize(
  footprint: readonly (readonly number[])[] | undefined,
): readonly [number, number] {
  return [footprint?.[0]?.length ?? 0, footprint?.length ?? 0];
}

/** Object definitions store one four-bit horizontal occupancy row per tile.
 * Prefabs store a complete row-major 4x4 sub-tile mask, so repeat the authored
 * horizontal row across all four sub-rows. */
export function mapPrefabCollisionMaskForObjectCell(mask: number): number {
  const horizontal = mask & 0x000f;
  return horizontal | (horizontal << 4) | (horizontal << 8) | (horizontal << 12);
}

function definitionTags(definition: ObjectContentDefinition): readonly string[] {
  const components = definition.components;
  return [
    'content.object',
    definition.id,
    ...(components.identity?.tags ?? []),
    ...(components.placement === undefined ? [] : [components.placement.item]),
    ...(components.container === undefined ? [] : ['component.container']),
    ...(components.processor === undefined ? [] : ['component.processor']),
    ...(components.frame === undefined ? [] : [components.frame.ref]),
  ];
}

export function mapPrefabForObjectDefinition(
  definition: ObjectContentDefinition,
  item: AssetPaletteItem,
  assetRegistryRevision: string,
): MapPrefabDocumentV2 {
  const collisionFootprint = definition.components.collision?.footprint;
  const placementFootprint = definition.components.placement?.footprint;
  const [collisionWidth, collisionHeight] = footprintSize(collisionFootprint);
  const [placementWidth, placementHeight] = footprintSize(placementFootprint);
  const width = Math.max(1, item.footprint[0], collisionWidth, placementWidth);
  const height = Math.max(1, item.footprint[1], collisionHeight, placementHeight);
  const layer = layerForDefinition(definition, item);
  const blocksMovement = definition.components.collision?.blocksMovement === true;
  const base = createMapPrefabDocument({
    id: mapPrefabIdForObjectDefinition(definition),
    title: definition.displayName,
    width,
    height,
    assetRegistryRevision,
    tags: definitionTags(definition),
    collection: CONTENT_OBJECT_COLLECTION,
  });
  return normalizeMapPrefab({
    ...base,
    pivot: { tileX: 0, tileY: height - 1 },
    behaviors: [behaviorForDefinition(definition, layer)],
    placements: [{
      id: 'visual-1',
      assetId: item.assetId,
      assetName: item.assetName,
      visual: item.visual,
      tileX: 0,
      tileY: height - 1,
      elevation: 0,
      layer,
      quarterTurns: 0,
      flipX: false,
    }],
    cells: Array.from({ length: width * height }, (_, index) => {
      const tileX = index % width;
      const tileY = Math.floor(index / width);
      const authoredMask = collisionFootprint?.[tileY]?.[tileX] ?? 0;
      return {
        id: `cell-${index.toString(36)}`,
        tileX,
        tileY,
        elevation: 0,
        collisionMask: blocksMovement
          ? mapPrefabCollisionMaskForObjectCell(authoredMask)
          : MAP_PREFAB_COLLISION_MASK_EMPTY,
      };
    }),
  });
}

function contentEntry(
  definition: ObjectContentDefinition,
  item: AssetPaletteItem,
  assetRegistryRevision: string,
): MapContentObjectCatalogEntry {
  return Object.freeze({
    item,
    prefab: mapPrefabForObjectDefinition(definition, item, assetRegistryRevision),
    layer: mapLayerForDefinition(definition, item),
    contentDefinitionId: definition.id,
  });
}

/** Merges authoritative gameplay definitions into the generated-art palette.
 * Definitions only replace heuristic art entries when their sprite exists in
 * the loaded registry. With no live definitions this is exactly the generated
 * catalogue used by anonymous/offline Studio sessions. */
export function mapObjectCatalogEntriesWithContent(
  palette: readonly AssetPaletteItem[],
  assetRegistryRevision: string,
  definitions: readonly ObjectContentDefinition[],
): readonly MapContentObjectCatalogEntry[] {
  const semanticEntries = definitions
    .filter((definition) => definition.retired !== true)
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((definition) => {
      const item = itemForDefinition(definition, palette);
      return item === null ? [] : [contentEntry(definition, item, assetRegistryRevision)];
    });
  if (semanticEntries.length === 0) {
    return mapObjectCatalogEntries(palette, assetRegistryRevision);
  }
  const claimedAssets = new Set(semanticEntries.map(({ item }) => item.assetName));
  return Object.freeze([
    ...semanticEntries,
    ...mapObjectCatalogEntries(palette, assetRegistryRevision)
      .filter(({ item }) => !claimedAssets.has(item.assetName)),
  ]);
}
