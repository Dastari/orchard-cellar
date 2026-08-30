import {
  HOMESTEAD_TENT_TILE,
  TOPSIDE_SPACE_ID,
  type SpaceDefinition,
} from '@orchard/sim';

export interface HomesteadPresentationRow {
  readonly spaceId: number;
  readonly overworldTileX: number;
  readonly overworldTileY: number;
}

export interface HomesteadTentPresentationTarget {
  readonly spaceId: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly interior: boolean;
}

/** An active homestead always owns one interior tent. Its presentation must
 * not disappear when overlapping self/region subscriptions temporarily remove
 * the backing homestead row from the client's shared cache. */
export function homesteadTentPresentationTargets(
  activeSpace: Pick<SpaceDefinition, 'spaceId' | 'generator'>,
  homesteads: Iterable<HomesteadPresentationRow>,
): readonly HomesteadTentPresentationTarget[] {
  if (activeSpace.generator === 'homestead') {
    return [{
      spaceId: activeSpace.spaceId,
      tileX: HOMESTEAD_TENT_TILE.tileX,
      tileY: HOMESTEAD_TENT_TILE.tileY,
      interior: true,
    }];
  }
  if (activeSpace.spaceId !== TOPSIDE_SPACE_ID) return [];
  return [...homesteads].map((home) => ({
    spaceId: home.spaceId,
    tileX: home.overworldTileX,
    tileY: home.overworldTileY,
    interior: false,
  }));
}
