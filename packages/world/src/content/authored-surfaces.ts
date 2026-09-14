import type { SpaceContentDefinition } from '@orchard/sim';

export interface AuthoredSurfacePlan {
  readonly id: bigint;
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly capacity: number;
  readonly spaceId: number;
}

/** Projects every active authored static surface without depending on a space
 * or landmark definition id. Validation guarantees globally unique runtime ids. */
export function authoredSurfacePlans(
  spaces: Iterable<SpaceContentDefinition>,
  chunkTiles: number,
): readonly AuthoredSurfacePlan[] {
  return [...spaces].flatMap((space) => (space.retired === true ? [] : (space.surfaces ?? []).map((surface) => ({
    id: BigInt(surface.id),
    kind: surface.kind,
    tileX: surface.tileX,
    tileY: surface.tileY,
    chunkX: Math.floor(surface.tileX / chunkTiles),
    chunkY: Math.floor(surface.tileY / chunkTiles),
    capacity: surface.capacity,
    spaceId: space.spaceId,
  }))));
}
