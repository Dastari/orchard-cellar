import { MANUAL_OBJECT_CONNECTION_TAG, type MapPrefabDocumentV2 } from '@orchard/sim';

/** Source/pixel audit proves these two static banks identical for all 47 masks.
 * Keep this whitelist narrow: preview similarity alone never establishes an alias. */
const PATH_ALIAS = 'tile_path';
const PATH_CANONICAL = 'tile_cf_path';

function generatedPathFrame(prefab: MapPrefabDocumentV2, name: string): number | null {
  const placement = prefab.placements[0];
  if (prefab.placements.length !== 1 || placement?.assetName !== name
    || placement.visual.kind !== 'variant' || placement.visual.name !== 'base'
    || placement.visual.frameIndex < 0 || placement.visual.frameIndex >= 47
    || prefab.id !== `asset-${placement.assetId}-variant-base-${placement.visual.frameIndex}`
    || prefab.title !== `${name === PATH_ALIAS ? 'Tile Path' : 'Path'} · Base · ${placement.visual.frameIndex + 1}`) return null;
  return placement.visual.frameIndex;
}

function equivalentPathAlias(alias: MapPrefabDocumentV2, canonical: MapPrefabDocumentV2): boolean {
  // Retain any changed footprint, collision, behavior, transform, presentation,
  // revision or user metadata. Only the audited identity/search alias differs.
  return JSON.stringify({ ...alias, id: canonical.id, title: canonical.title,
    tags: alias.tags.map(tag => tag === PATH_ALIAS ? PATH_CANONICAL : tag).sort(),
    placements: alias.placements.map(placement => ({ ...placement,
      assetId: canonical.placements[0]!.assetId, assetName: PATH_CANONICAL,
    })),
  }) === JSON.stringify(canonical);
}

/** Filter the visible Exact palette only. The complete catalog and all saved
 * prefab IDs remain available to selection, rendering and document loading. */
export function exactTilePaletteChoices(
  prefabs: readonly MapPrefabDocumentV2[],
  query = '',
): readonly MapPrefabDocumentV2[] {
  const terms = query.toLowerCase().trim().split(/\s+/u).filter(Boolean);
  const eligible = prefabs.filter(prefab => prefab.tags.includes('tiles')
    && !prefab.tags.includes('studio.smart-state') && !prefab.tags.includes(MANUAL_OBJECT_CONNECTION_TAG));
  const canonicalByFrame = new Map(eligible.flatMap(prefab => {
    const frame = generatedPathFrame(prefab, PATH_CANONICAL);
    return frame === null ? [] : [[frame, prefab] as const];
  }));
  const aliases = new Map<string, MapPrefabDocumentV2>();
  const searchAliases = new Map<string, string[]>();
  for (const prefab of eligible) {
    const frame = generatedPathFrame(prefab, PATH_ALIAS);
    const canonical = frame === null ? undefined : canonicalByFrame.get(frame);
    if (canonical === undefined || !equivalentPathAlias(prefab, canonical)) continue;
    aliases.set(prefab.id, canonical);
    searchAliases.set(canonical.id, [prefab.title, ...prefab.tags]);
  }
  return eligible.filter(prefab => !aliases.has(prefab.id) && terms.every(term =>
    [prefab.title, ...prefab.tags, ...searchAliases.get(prefab.id) ?? []].join(' ').toLowerCase().includes(term)));
}
