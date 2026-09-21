import {
  MAP_PREFAB_COLLISION_MASK_EMPTY,
  MAP_PREFAB_COLLISION_MASK_FULL,
  createMapPrefabDocument,
  normalizeMapPrefab,
  type MapObjectLayer,
  type MapPrefabBehavior,
  type MapPrefabDocumentV2,
} from '@orchard/sim';
import type { AssetPaletteItem, AuthoringAssetCategory } from '../object/asset-palette.js';
import { displayAssetName } from '../object/asset-palette.js';

const COLLECTION_COLORS: Readonly<Record<AuthoringAssetCategory, string>> = {
  tiles: '#6689c3',
  props: '#d5a84b',
  buildings: '#d66a4a',
  trees: '#5f9f62',
  crops: '#8baa55',
};

export function mapPrefabIdForPaletteItem(item: AssetPaletteItem): string {
  const visual = item.visual.name.replace(/[^a-z0-9-]+/giu, '-').replace(/^-+|-+$/gu, '').toLocaleLowerCase();
  return `asset-${item.assetId}-${item.visual.kind}-${visual}-${item.visual.frameIndex}`.slice(0, 64).replace(/-+$/u, '');
}

function behaviorFor(item: AssetPaletteItem): MapPrefabBehavior {
  const semantic = `${item.assetName} ${item.tags.join(' ')}`.toLocaleLowerCase();
  if (/\bgate\b/u.test(semantic)) return { kind: 'gate', archetype: 'world.gate' };
  if (/\bfarm|farmland|soil.plot\b/u.test(semantic)) return { kind: 'farm_zone', archetype: 'world.farm-zone' };
  if (item.category === 'trees') return { kind: 'resource', archetype: 'resource.tree' };
  if (item.category === 'crops') return { kind: 'resource', archetype: 'resource.crop' };
  if (/\bplaceable|furniture\b/u.test(semantic)) return { kind: 'placeable', archetype: 'world.placeable' };
  if (item.layer === 'ground') return { kind: 'surface', archetype: 'world.surface' };
  return { kind: 'static' };
}

export function mapLayerForPaletteItem(item: AssetPaletteItem): MapObjectLayer {
  if (item.layer === 'ground') return 'ground';
  if (item.category === 'trees' || item.layer === 'canopy') return 'canopy';
  return behaviorFor(item).kind === 'static' ? 'objects' : 'gameplay';
}

/** The generated registry predates per-tool builder flags for most of the
 * reviewed library. A reviewed asset is safe to expose to owner tooling even
 * when it was not opted into the player-facing construction catalogue. */
export function mapPaletteItemAvailable(item: AssetPaletteItem): boolean {
  return !item.tags.includes('review.pending');
}

/** Adapts one generated authoring visual into the same persisted prefab
 * contract used by Object Studio imports. The map never stores a bare sprite. */
export function mapPrefabForPaletteItem(
  item: AssetPaletteItem,
  assetRegistryRevision: string,
): MapPrefabDocumentV2 {
  const [width, height] = item.footprint;
  const base = createMapPrefabDocument({
    id: mapPrefabIdForPaletteItem(item),
    title: displayAssetName(item.assetName),
    width,
    height,
    assetRegistryRevision,
    tags: [...item.tags, item.category, item.assetName],
    collection: {
      id: item.category,
      label: item.category.replace(/^./u, (character) => character.toLocaleUpperCase()),
      color: COLLECTION_COLORS[item.category],
    },
  });
  return normalizeMapPrefab({
    ...base,
    pivot: { tileX: 0, tileY: height - 1 },
    behaviors: [behaviorFor(item)],
    placements: [{
      id: 'visual-1',
      assetId: item.assetId,
      assetName: item.assetName,
      visual: item.visual,
      tileX: 0,
      tileY: height - 1,
      elevation: 0,
      layer: item.layer,
      quarterTurns: 0,
      flipX: false,
    }],
    cells: Array.from({ length: width * height }, (_, index) => ({
      id: `cell-${index.toString(36)}`,
      tileX: index % width,
      tileY: Math.floor(index / width),
      elevation: 0,
      collisionMask: item.blocksMovement
        ? MAP_PREFAB_COLLISION_MASK_FULL
        : MAP_PREFAB_COLLISION_MASK_EMPTY,
    })),
  });
}

export function mapObjectCatalog(
  palette: readonly AssetPaletteItem[],
  assetRegistryRevision: string,
): readonly MapPrefabDocumentV2[] {
  return mapObjectCatalogEntries(palette, assetRegistryRevision).map(({ prefab }) => prefab);
}

export interface MapObjectCatalogEntry {
  readonly item: AssetPaletteItem;
  readonly prefab: MapPrefabDocumentV2;
  readonly layer: MapObjectLayer;
}

/** Keeps authoring-only atlas metadata beside each prefab so canvas palettes
 * can render the exact chosen frame without persisting renderer data into the
 * map document. */
export function mapObjectCatalogEntries(
  palette: readonly AssetPaletteItem[],
  assetRegistryRevision: string,
): readonly MapObjectCatalogEntry[] {
  return palette.filter(mapPaletteItemAvailable).map((item) => Object.freeze({
    item,
    prefab: mapPrefabForPaletteItem(item, assetRegistryRevision),
    layer: mapLayerForPaletteItem(item),
  }));
}
