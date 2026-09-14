import {
  SURVIVAL_CHUNK_TILES,
  bootstrapContentRegistry,
  runtimeResourceDiscoveryKinds,
  type ContentRegistry,
  type ResourcePerception,
} from '@orchard/sim';
import { tables } from '@orchard/world-bindings';

/** Resources beyond the viewport are needed only for enabled minimap markers.
 * Buried terrain sensing is deterministic and does not stream extra entities. */
export function resourceDiscoveryRadii(perception: ResourcePerception): { ore: number; fishing: number } {
  return {
    ore: perception.minimapOre
      ? Math.min(perception.buriedOreRadiusTiles, perception.minimapOreRadiusTiles) : 0,
    fishing: perception.minimapFishing ? perception.minimapFishingRadiusTiles : 0,
  };
}

export function resourceDiscoveryQueries(
  spaceId: number,
  chunkX: number,
  chunkY: number,
  sizeTiles: number,
  radii: ReturnType<typeof resourceDiscoveryRadii>,
  centerDeadbandTiles: number,
  registry: ContentRegistry = bootstrapContentRegistry(),
) {
  const maximumChunk = Math.max(0, Math.ceil(sizeTiles / SURVIVAL_CHUNK_TILES) - 1);
  const policies = [
    { radius: radii.ore, kinds: runtimeResourceDiscoveryKinds(registry, 'ore') },
    { radius: radii.fishing, kinds: runtimeResourceDiscoveryKinds(registry, 'fishing') },
  ];
  return policies.filter(({ radius }) => radius > 0).map(({ radius, kinds }) => {
    const chunks = Math.ceil((radius + centerDeadbandTiles) / SURVIVAL_CHUNK_TILES);
    const [first, ...remaining] = kinds;
    if (first === undefined) throw new Error('resource_discovery_kind_required');
    return tables.worldResource
      .where((row) => row.spaceId.eq(spaceId))
      .where((row) => row.chunkX.gte(Math.max(0, chunkX - chunks)))
      .where((row) => row.chunkX.lte(Math.min(maximumChunk, chunkX + chunks)))
      .where((row) => row.chunkY.gte(Math.max(0, chunkY - chunks)))
      .where((row) => row.chunkY.lte(Math.min(maximumChunk, chunkY + chunks)))
      .where((row) => remaining.reduce((condition, kind) => condition.or(row.kind.eq(kind)), row.kind.eq(first)));
  });
}
