/**
 * Chunk asset dependencies (terrain, decoration and resource atlas ids) from the art loader's
 * inventory. Browser-safe (static world S7b): the inventory is `asset-inventory.ts`, generated from
 * packages/engine/src/overworld-art.ts by `npm run world:chunks:asset-inventory`; a Node test fails
 * when it drifts from the loader source. Deliberately conservative for terrain; per-biome trimming
 * belongs to the asset pack lane.
 */
import type { ContentRegistry, ResourceContentDefinition } from '@orchard/sim';
import { HEARTH_RESOURCE_ASSET_NAMES } from '@orchard/engine/hearth-resource-art';
import { LEGACY_LANDMARK_ASSET_NAMES } from '@orchard/engine/legacy-landmark-assets';
import { CHUNK_ASSET_INVENTORY_DATA } from './asset-inventory.js';

/** What the materializer needs from the art loader source. */
export interface ChunkAssetInventory {
  /** Every `tile_cf_*` literal in the loader, sorted. */
  readonly terrain: readonly string[];
  /** `NATURE_DECORATION_BANKS`: kind to [family, variant count]. */
  readonly natureFamilies: Readonly<Record<string, readonly [string, number]>>;
  /** `authoredResourceAsset` cases resolved through `MAP_EDITOR_ASSET_NAMES`: alias to atlas id. */
  readonly resourceAliases: Readonly<Record<string, string>>;
}

export const CHUNK_ASSET_INVENTORY: ChunkAssetInventory = CHUNK_ASSET_INVENTORY_DATA;
const nature = new Map(Object.entries(CHUNK_ASSET_INVENTORY.natureFamilies));
const aliases = new Map(Object.entries(CHUNK_ASSET_INVENTORY.resourceAliases));

export function chunkTerrainAssetIds(): readonly string[] {
  return CHUNK_ASSET_INVENTORY.terrain;
}

export function chunkDecorationAssetIds(kind: string, variant: number, registry: ContentRegistry): readonly string[] {
  const family = nature.get(kind === 'farm_flowers' ? 'nature_flower' : kind);
  if (family) return [`nature_cf_${family[0]}_${String(variant % family[1] + 1).padStart(2, '0')}`];
  const legacy = (LEGACY_LANDMARK_ASSET_NAMES as Readonly<Record<string, string>>)[kind];
  if (legacy) return [legacy];
  if (kind === 'fisher_fixed_line') return ['prop_cf_camp_fishing_rod'];
  if (kind === 'farm_tree_oak') return ['tree_cf_oak_mature'];
  if (kind.startsWith('farm_crop_')) {
    const crop = registry.crops.get(`crop:${kind.slice('farm_crop_'.length)}`);
    if (crop) return [crop.asset];
  }
  // These renderer branches use a composite actor or connected-object bank.
  if (kind === 'farm_cow') return [`wildlife_cf_cow_${String(variant % 9 + 1).padStart(2, '0')}`];
  if (kind === 'farm_fence') return ['prop_cf_willow_boundary_wood_large_connected'];
  if (kind === 'farm_gate') return ['prop_cf_fence_gate'];
  throw new Error(`Unmapped decoration asset dependency: ${kind}`);
}

const resourceAssetCache = new WeakMap<object, readonly string[]>();

/** Resource content stores renderer aliases (tree_oak, ore_gold), not always
 * atlas IDs. Follow the actual switch and loader naming before pack lookup. */
export function chunkResourceAssetIds(visual: ResourceContentDefinition['visual']): readonly string[] {
  const cached = resourceAssetCache.get(visual);
  if (cached) return cached;
  const resolveAlias = (alias: string): string => {
    const hearth = (HEARTH_RESOURCE_ASSET_NAMES as Readonly<Record<string, string>>)[alias];
    if (hearth) return hearth;
    const mapped = aliases.get(alias);
    if (mapped) return mapped;
    if (nature.has(alias)) return chunkDecorationAssetIds(alias, 0, {} as ContentRegistry)[0]!;
    if (['tree_apple', 'tree_pear', 'tree_peach', 'tree_cherry'].includes(alias)) return `tree_cf_${alias.slice(5)}_fruiting`;
    const legacy = (LEGACY_LANDMARK_ASSET_NAMES as Readonly<Record<string, string>>)[alias];
    if (legacy) return legacy;
    throw new Error(`Unmapped resource visual alias: ${alias}`);
  };
  const result = new Set<string>();
  if (visual.kind === 'ore' && visual.variant !== 'fixed') {
    for (const variant of ['', '_pure_large', '_pure_medium', '_pure_small', '_pristine']) result.add(`resource_cf_${visual.asset}${variant}`);
  } else result.add(resolveAlias(visual.asset));
  for (const state of Object.values(visual.states ?? {})) result.add(resolveAlias(state[0]));
  if (visual.kind === 'tree' && ['tree_apple', 'tree_pear', 'tree_peach', 'tree_cherry'].includes(visual.asset)) result.add('tree_cf_fruit_mature');
  const assets = [...result];
  resourceAssetCache.set(visual, assets);
  return assets;
}
