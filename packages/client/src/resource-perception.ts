import type { ContentRegistry, SurvivalOreKind, runtimeResourcePerception } from '@orchard/sim';
import { cellarOreKindAt } from '@orchard/sim/cellar-excavation';
import { bootstrapContentRegistry } from '@orchard/sim/content/bootstrap-registry';
import { runtimeResourceDefinition } from '@orchard/sim/content/runtime';
import type { TerrainArray } from '@orchard/engine/terrain';
import { terrainIsWindow, terrainSparseKey, terrainSparseKeyTile } from '@orchard/engine/terrain-index';

export type DetectedOre = {
  readonly tileX: number;
  readonly tileY: number;
} & ({ readonly identified: false } | {
  readonly identified: true;
  readonly oreKind: string;
  readonly distanceTiles: number;
});

interface PerceivedResource {
  readonly id: bigint;
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly spaceId: number;
  readonly depleted: boolean;
}

export interface ResourcePerceptionInput {
  readonly registry?: ContentRegistry;
  readonly seed: number;
  readonly spaceId: number;
  readonly underground: boolean;
  readonly centerTileX: number;
  readonly centerTileY: number;
  readonly terrain: Pick<TerrainArray, 'width' | 'height' | 'originX' | 'originY' | 'blocked'>;
  /** Includes content/ranks, excavation, resource, and live-map revisions. */
  readonly revision: string;
  readonly capabilities: ReturnType<typeof runtimeResourcePerception>;
  readonly resources: Iterable<PerceivedResource>;
  readonly resourceVisible?: (id: bigint) => boolean;
}

export interface ResourcePerceptionProjection {
  readonly buriedOre: readonly DetectedOre[];
  readonly minimapOre: readonly DetectedOre[];
  readonly fishingPools: readonly { readonly tileX: number; readonly tileY: number }[];
}

const EMPTY: ResourcePerceptionProjection = { buriedOre: [], minimapOre: [], fishingPools: [] };

/** Passive presentation only: no resource creation, interaction reach, or tool
 * targeting. Hidden kinds never escape the anonymous branch of this model. */
export class ResourcePerceptionCache {
  private key = '';
  private terrain: ResourcePerceptionInput['terrain'] | null = null;
  private sourceKey = '';
  private readonly oreTiles = new Map<number, SurvivalOreKind | null>();
  private result: ResourcePerceptionProjection = EMPTY;

  constructor(private readonly oreKindAt = cellarOreKindAt) {}

  project(input: ResourcePerceptionInput): ResourcePerceptionProjection {
    const registry = input.registry ?? bootstrapContentRegistry();
    const { capabilities: ability, centerTileX: x, centerTileY: y, terrain } = input;
    // A chunk render window keys by both world coordinates, so its vein cache
    // survives window moves but never mixes with whole-map keys (S4c).
    const sourceKey = `${input.seed}:${input.spaceId}:${terrain.width}:${terrain.height}${terrainIsWindow(terrain) ? ':window' : ''}`;
    if (sourceKey !== this.sourceKey) {
      this.oreTiles.clear();
      this.sourceKey = sourceKey;
    }
    const radius = input.underground ? ability.buriedOreRadiusTiles : 0;
    const oreMapRadius = Math.min(ability.buriedOreRadiusTiles, ability.minimapOreRadiusTiles);
    const fishRadius = ability.minimapFishingRadiusTiles;
    const key = [sourceKey, input.underground, x, y, input.revision, radius,
      ability.identifyBuriedOre, ability.minimapOre, oreMapRadius,
      ability.minimapFishing, fishRadius].join(':');
    if (key === this.key && terrain === this.terrain) return this.result;
    this.key = key;
    this.terrain = terrain;
    if (radius <= 0 && !ability.minimapOre && !ability.minimapFishing) {
      this.oreTiles.clear();
      this.result = EMPTY;
      return this.result;
    }
    const distanceSquared = (tileX: number, tileY: number): number => (tileX - x) ** 2 + (tileY - y) ** 2;
    const projectOre = (tileX: number, tileY: number, oreKind: string): DetectedOre => (
      ability.identifyBuriedOre
        ? { tileX, tileY, identified: true, oreKind, distanceTiles: Math.sqrt(distanceSquared(tileX, tileY)) }
        : { tileX, tileY, identified: false }
    );
    const resources = [...input.resources].filter((resource) => resource.spaceId === input.spaceId
      && input.resourceVisible?.(resource.id) !== false);
    const depletedTiles = new Set(resources.filter(({ depleted }) => depleted)
      .map(({ tileX, tileY }) => terrainSparseKey(terrain, tileX, tileY)));
    const buriedOre: DetectedOre[] = [];
    const minimapOre = new Map<number, DetectedOre>();
    const fishingPools: { tileX: number; tileY: number }[] = [];
    // Sparse keys (depleted resources, the vein cache, minimap de-duplication)
    // go through terrainSparseKey: `tileY * width + tileX` in world tiles for a
    // whole map, so off-map resource coordinates key exactly as before, and a
    // collision-free packing of both coordinates for a chunk render window.
    // Only the dense `blocked` read is window-relative (static world S4b).
    const originX = terrain.originX ?? 0;
    const originY = terrain.originY ?? 0;
    const minimumX = Math.max(originX + 1, x - radius);
    const maximumX = Math.min(originX + terrain.width - 2, x + radius);
    const minimumY = Math.max(originY + 1, y - radius);
    const maximumY = Math.min(originY + terrain.height - 2, y + radius);
    // Keep only the local window. Crossing one tile reuses previous deterministic
    // vein lookups; stationary rendering returns above without scanning any tiles.
    for (const index of this.oreTiles.keys()) {
      const { tileX, tileY } = terrainSparseKeyTile(terrain, index);
      if (tileX < minimumX || tileX > maximumX || tileY < minimumY || tileY > maximumY) this.oreTiles.delete(index);
    }
    if (radius > 0) for (let tileY = minimumY; tileY <= maximumY; tileY += 1) {
      // Hot scan (up to ~15k tiles per step): the window row base of
      // terrainIndexAt is hoisted; the clamps above keep every tile inside.
      const rowBase = (tileY - originY) * terrain.width - originX;
      for (let tileX = minimumX; tileX <= maximumX; tileX += 1) {
        const index = terrainSparseKey(terrain, tileX, tileY);
        if (!terrain.blocked[rowBase + tileX] || depletedTiles.has(index)
          || distanceSquared(tileX, tileY) > radius ** 2) continue;
        let kind = this.oreTiles.get(index);
        if (kind === undefined) {
          kind = this.oreKindAt(input.seed, input.spaceId, tileX, tileY);
          this.oreTiles.set(index, kind);
        }
        if (kind === null) continue;
        const ore = projectOre(tileX, tileY, kind);
        buriedOre.push(ore);
        if (ability.minimapOre && distanceSquared(tileX, tileY) <= oreMapRadius ** 2) minimapOre.set(index, ore);
      }
    }
    for (const resource of resources) {
      if (resource.depleted) continue;
      const { tileX, tileY } = resource;
      const distance = distanceSquared(tileX, tileY);
      const definition = runtimeResourceDefinition(registry, resource);
      if (ability.minimapOre && oreMapRadius > 0 && distance <= oreMapRadius ** 2
        && definition?.discovery.kind === 'ore') {
        minimapOre.set(terrainSparseKey(terrain, tileX, tileY), projectOre(tileX, tileY, resource.kind));
      }
      if (ability.minimapFishing && fishRadius > 0 && distance <= fishRadius ** 2
        && definition?.discovery.kind === 'fishing') {
        fishingPools.push({ tileX, tileY });
      }
    }
    this.result = { buriedOre, minimapOre: [...minimapOre.values()], fishingPools };
    return this.result;
  }
}


/** Presentation picking deliberately does not share tool/placement reach.
 * Only already identified detections can produce a remote hover label. */
export function identifiedOreAtWorldPoint(
  ores: readonly DetectedOre[],
  worldX: number,
  worldY: number,
): Extract<DetectedOre, { readonly identified: true }> | null {
  const tileX = Math.floor(worldX / 16);
  const tileY = Math.floor(worldY / 16);
  return ores.find((ore): ore is Extract<DetectedOre, { readonly identified: true }> => (
    ore.identified && ore.tileX === tileX && ore.tileY === tileY
  )) ?? null;
}
