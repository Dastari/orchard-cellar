import type {
  MapContentLayerId,
  MapGameplayAnchor,
  MapGameplayAnchorKind,
  MapObjectLayer,
  MapPrefabDocumentV2,
} from '@orchard/sim';
import type { MapEditorTerrainTool } from './editor-controller.js';

export type MapContextPaletteKind = 'terrain' | 'objects' | 'readonly' | 'anchors';

export interface MapTerrainPaletteEntry {
  readonly tool: MapEditorTerrainTool;
  readonly title: string;
  readonly assetName: string | null;
  readonly keywords: readonly string[];
}

export type MapAnchorToolPaletteEntry =
  | { readonly kind: 'poi' | 'label'; readonly title: string; readonly authorable: true }
  | {
      readonly kind: Exclude<MapGameplayAnchorKind, 'poi' | 'label'>;
      readonly title: string;
      readonly authorable: false;
    };

export const MAP_ANCHOR_TOOL_PALETTE: readonly MapAnchorToolPaletteEntry[] = Object.freeze([
  { kind: 'poi', title: 'Point of interest', authorable: true },
  { kind: 'label', title: 'Map label', authorable: true },
  { kind: 'spawn', title: 'Spawn reference', authorable: false },
  { kind: 'portal', title: 'Portal reference', authorable: false },
  { kind: 'npc', title: 'NPC reference', authorable: false },
  { kind: 'resource', title: 'Resource reference', authorable: false },
]);

/** Terrain choices stay semantic; atlas names only provide an exact visual
 * thumbnail and are never written into the map command. */
export const MAP_TERRAIN_PALETTE: readonly MapTerrainPaletteEntry[] = Object.freeze([
  { tool: 'inspect', title: 'Inspect', assetName: null, keywords: ['select', 'pick'] },
  { tool: 'grass', title: 'Grass', assetName: 'tile_cf_grass', keywords: ['surface', 'family', 'meadow'] },
  { tool: 'dirt', title: 'Dirt', assetName: 'tile_cf_path', keywords: ['surface', 'soil', 'family'] },
  { tool: 'sand', title: 'Sand', assetName: 'tile_cf_desert', keywords: ['surface', 'desert', 'family'] },
  { tool: 'stone', title: 'Stone', assetName: 'tile_cf_stone_cliff_variants', keywords: ['surface', 'cliff', 'family'] },
  { tool: 'cave_floor', title: 'Cave Floor', assetName: 'tile_cf_cave_floor', keywords: ['surface', 'underground', 'family'] },
  { tool: 'water', title: 'Water', assetName: 'tile_cf_freshwater', keywords: ['surface', 'river', 'family'] },
  { tool: 'path', title: 'Path', assetName: 'tile_cf_path', keywords: ['feature', 'road', 'family'] },
  { tool: 'raise', title: 'Raise', assetName: 'tile_cf_stone_cliff_variants', keywords: ['elevation', 'height'] },
  { tool: 'lower', title: 'Lower', assetName: 'tile_cf_stone_cliff_inverse_overlay', keywords: ['elevation', 'height'] },
  { tool: 'set_elevation', title: 'Set Elevation', assetName: 'tile_cf_stone_cliff_variants', keywords: ['height', 'level'] },
  { tool: 'flatten', title: 'Flatten', assetName: 'tile_cf_grass_1_middle', keywords: ['elevation', 'level'] },
  { tool: 'transition', title: 'Crossing', assetName: 'tile_cf_grass_1_ramp_bank_stone',
    keywords: ['slope', 'stairs', 'ladder', 'ramp', 'crossing', 'elevation'] },
  { tool: 'ledge', title: 'Ledge', assetName: 'tile_cf_grass_1_ledge', keywords: ['edge', 'cliff'] },
  { tool: 'erase_ledge', title: 'Erase Ledge', assetName: null, keywords: ['edge', 'cliff', 'remove'] },
  { tool: 'block', title: 'Block', assetName: null, keywords: ['collision', 'closed'] },
  { tool: 'walk', title: 'Walkable', assetName: null, keywords: ['collision', 'open'] },
  { tool: 'inherit', title: 'Inherit', assetName: null, keywords: ['collision', 'restore'] },
]);

export function mapContextPaletteKind(layer: MapContentLayerId): MapContextPaletteKind {
  if (layer === 'generated_base' || layer === 'terrain') return 'terrain';
  if (layer === 'player_owned') return 'readonly';
  if (layer === 'anchors') return 'anchors';
  return 'objects';
}

/** Read-only Anchors-layer listing. IDs remain first-class even when labels
 * are absent, and filtering never mutates or normalizes the map document. */
export function mapAnchorPalette(
  anchors: readonly MapGameplayAnchor[],
  query = '',
): readonly MapGameplayAnchor[] {
  const requested = terms(query);
  if (requested.length === 0) return anchors;
  return anchors.filter((anchor) => {
    const searchable = `${anchor.id} ${anchor.kind} ${anchor.label ?? ''}`.toLocaleLowerCase();
    return requested.every((term) => searchable.includes(term));
  });
}

export function mapAnchorToolPalette(query = ''): readonly MapAnchorToolPaletteEntry[] {
  const requested = terms(query);
  if (requested.length === 0) return MAP_ANCHOR_TOOL_PALETTE;
  return MAP_ANCHOR_TOOL_PALETTE.filter((entry) => {
    const searchable = `${entry.kind} ${entry.title}`.toLocaleLowerCase();
    return requested.every((term) => searchable.includes(term));
  });
}

function terms(query: string): readonly string[] {
  return query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
}

export function mapTerrainPalette(query = ''): readonly MapTerrainPaletteEntry[] {
  const requested = terms(query);
  if (requested.length === 0) return MAP_TERRAIN_PALETTE;
  return MAP_TERRAIN_PALETTE.filter((entry) => {
    const searchable = [entry.tool, entry.title, entry.assetName ?? '', ...entry.keywords]
      .join(' ').replaceAll('_', ' ').toLocaleLowerCase();
    return requested.every((term) => searchable.includes(term));
  });
}

export function mapPrefabSuggestedLayer(prefab: MapPrefabDocumentV2): MapObjectLayer {
  if (prefab.behaviors.some(behavior=>behavior.archetype==='resource.tree') || prefab.tags.includes('trees') || prefab.placements.some(({ layer }) => layer === 'canopy')) return 'canopy';
  if (prefab.behaviors.some(({ kind }) => kind === 'surface')) return 'ground';
  if (prefab.behaviors.some(({ kind }) => kind !== 'static')) return 'gameplay';
  return 'objects';
}

export function mapContextPrefabPalette(
  prefabs: readonly MapPrefabDocumentV2[],
  layer: MapContentLayerId,
  query = '',
): readonly MapPrefabDocumentV2[] {
  if (mapContextPaletteKind(layer) !== 'objects') return [];
  const requested = terms(query);
  return prefabs.filter((prefab) => {
    if (mapPrefabSuggestedLayer(prefab) !== layer) return false;
    if (requested.length === 0) return true;
    const searchable = [
      prefab.id, prefab.title, prefab.collection?.id ?? '', prefab.collection?.label ?? '', ...prefab.tags,
    ].join(' ').replaceAll('_', ' ').replaceAll('.', ' ').toLocaleLowerCase();
    return requested.every((term) => searchable.includes(term));
  });
}
