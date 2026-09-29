import { artSlot, defineLazySlot } from './lazy-art.js';
import { loadGeneratedAsset, loadGeneratedAssetRegistry, type LoadedAsset } from '@orchard/ui';
export const HEARTH_RESOURCE_ASSET_NAMES = {
  rock_basalt: 'resource_cf_hearth_basalt', ore_cinder: 'resource_cf_hearth_cinder',
  ore_emberglass: 'resource_cf_hearth_emberglass', tree_ashwood: 'resource_cf_hearth_ashwood',
  tree_ashwood_stump: 'prop_cf_poi_stump',
} as const;
/** Older atlases remain usable before the expedition asset release. Installation
 * must require the complete node bank; never substitute an ordinary tree/ore. */
export async function loadHearthResourceArt(): Promise<Readonly<Record<string, LoadedAsset>>> {
  const registry = await loadGeneratedAssetRegistry();
  const names = new Set(Object.values(registry.assetsById));
  const entries = await Promise.all(Object.entries(HEARTH_RESOURCE_ASSET_NAMES)
    .filter(([, name]) => names.has(name)).map(async ([kind, name]) => {
      const asset = await loadGeneratedAsset(name);
      return [kind, kind === 'tree_ashwood_stump' ? { ...asset, anchor: [8,13] as const } : asset] as const;
    }));
  return Object.fromEntries(entries);
}

/** Static world S6: the hearth resource sprites as lazy assets, loaded when first drawn (the
 * ashwood stump keeps its authored anchor). */
export function lazyHearthResourceArt(): Readonly<Record<string, LoadedAsset>> {
  const record: Record<string, LoadedAsset> = {};
  for (const [kind, name] of Object.entries(HEARTH_RESOURCE_ASSET_NAMES)) {
    const slot = kind === 'tree_ashwood_stump'
      ? artSlot(name, 'summer', { key: 'ashwood-stump-anchor', transform: asset => ({ ...asset, anchor: [8, 13] as const }) })
      : artSlot(name);
    defineLazySlot(record, kind, slot);
  }
  return Object.freeze(record);
}

/** Shared by visible rendering and optical geometry; a missing cohort stays conspicuous. */
export function hearthResourceVisualAsset(art: { readonly hearthResources?: Readonly<Record<string, LoadedAsset>>;
  readonly missingItem: LoadedAsset }, kind: string, depleted = false): LoadedAsset | undefined {
  const key = kind === 'tree_ashwood' && depleted ? 'tree_ashwood_stump' : kind;
  return Object.prototype.hasOwnProperty.call(HEARTH_RESOURCE_ASSET_NAMES, key)
    ? art.hearthResources?.[key] ?? art.missingItem : undefined;
}
