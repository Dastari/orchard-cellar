import type { MapStampLayer, MapStampVisual } from '@orchard/sim';
import type {
  BuiltAssetRecord,
  GeneratedAssetCatalog,
} from '../render/assets.js';
import type { AtlasFrame } from '../render/sprite.js';

export const AUTHORING_ASSET_CATEGORIES = [
  'tiles', 'props', 'buildings', 'trees', 'crops',
] as const;
export type AuthoringAssetCategory = typeof AUTHORING_ASSET_CATEGORIES[number];

export interface AssetPaletteItem {
  readonly key: string;
  readonly assetId: number;
  readonly assetName: string;
  readonly category: AuthoringAssetCategory;
  readonly tags: readonly string[];
  readonly layer: MapStampLayer;
  readonly footprint: readonly [number, number];
  readonly blocksMovement: boolean;
  readonly builderAvailable: boolean;
  readonly visual: MapStampVisual;
  readonly frame: AtlasFrame;
  readonly animated: boolean;
}

function authoringCategory(category: string): category is AuthoringAssetCategory {
  return (AUTHORING_ASSET_CATEGORIES as readonly string[]).includes(category);
}

function layerForRecord(record: BuiltAssetRecord): MapStampLayer {
  return record.placement.layer === 'ui' ? 'object' : record.placement.layer;
}

function item(
  assetName: string,
  record: BuiltAssetRecord,
  visual: MapStampVisual,
  frame: AtlasFrame,
  animated: boolean,
): AssetPaletteItem {
  return {
    key: `${record.assetId}:${visual.kind}:${visual.name}:${visual.frameIndex}`,
    assetId: record.assetId,
    assetName,
    category: record.category as AuthoringAssetCategory,
    tags: record.tags,
    layer: layerForRecord(record),
    footprint: record.placement.footprint,
    blocksMovement: record.placement.blocksMovement,
    builderAvailable: record.placement.builderAvailable,
    visual,
    frame,
    animated,
  };
}

/** Flatten the generated manifest into a Godot-style visual palette. Timed
 * animations remain one semantic choice; static variants expose every frame. */
export function buildAssetPalette(catalog: GeneratedAssetCatalog): readonly AssetPaletteItem[] {
  const result: AssetPaletteItem[] = [];
  for (const [assetName, record] of Object.entries(catalog.assets)) {
    if (!authoringCategory(record.category)) continue;
    for (const [name, frame] of Object.entries(record.states)) {
      result.push(item(assetName, record, { kind: 'state', name, frameIndex: 0 }, frame, false));
    }
    for (const [name, frames] of Object.entries(record.variants)) {
      frames.forEach((frame, frameIndex) => {
        result.push(item(assetName, record, { kind: 'variant', name, frameIndex }, frame, false));
      });
    }
    for (const [name, frames] of Object.entries(record.animations)) {
      const frame = frames[0];
      if (frame !== undefined) {
        result.push(item(assetName, record, { kind: 'animation', name, frameIndex: 0 }, frame, true));
      }
    }
  }
  return result.sort((left, right) => left.category.localeCompare(right.category)
    || left.assetName.localeCompare(right.assetName)
    || left.visual.kind.localeCompare(right.visual.kind)
    || left.visual.name.localeCompare(right.visual.name)
    || left.visual.frameIndex - right.visual.frameIndex);
}

export interface AssetPaletteFilter {
  readonly search?: string;
  readonly category?: AuthoringAssetCategory | 'all';
  readonly builderAvailableOnly?: boolean;
}

function searchableText(entry: AssetPaletteItem): string {
  return [entry.assetName, entry.category, entry.visual.name, ...entry.tags]
    .join(' ')
    .replaceAll('_', ' ')
    .replaceAll('.', ' ')
    .toLocaleLowerCase();
}

export function filterAssetPalette(
  entries: readonly AssetPaletteItem[],
  filter: AssetPaletteFilter,
): readonly AssetPaletteItem[] {
  const category = filter.category ?? 'all';
  const terms = (filter.search ?? '').trim().toLocaleLowerCase()
    .split(/\s+/u).filter(Boolean);
  return entries.filter((entry) =>
    (category === 'all' || entry.category === category)
    && (!filter.builderAvailableOnly || entry.builderAvailable)
    && terms.every((term) => searchableText(entry).includes(term)));
}

export function displayAssetName(assetName: string): string {
  return assetName
    .replace(/^(?:tile|prop|building|tree|crop)_cf_/u, '')
    .replaceAll('_', ' ')
    .replace(/\b\w/gu, (character) => character.toLocaleUpperCase());
}
