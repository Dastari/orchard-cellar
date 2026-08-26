export const TERRAIN_TRANSITION_KINDS = ['slope', 'stairs', 'ladder', 'rope'] as const;
export type TerrainTransitionKind = typeof TERRAIN_TRANSITION_KINDS[number];

export const TERRAIN_TRANSITION_DIRECTIONS = ['up', 'right', 'down', 'left'] as const;
export type TerrainTransitionDirection = typeof TERRAIN_TRANSITION_DIRECTIONS[number];

/** Semantic connection across exactly one integer contour. Tilesets choose
 * its art; movement and editor tooling consume these endpoints directly. */
export interface TerrainTransition {
  readonly contourLevel: number;
  readonly kind: TerrainTransitionKind;
  readonly direction: TerrainTransitionDirection;
  readonly lowerTileX: number;
  readonly lowerTileY: number;
  readonly upperTileX: number;
  readonly upperTileY: number;
}

const TRANSITION_DIRECTION_DELTA: Readonly<Record<
  TerrainTransitionDirection,
  readonly [deltaX: number, deltaY: number]
>> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};

/** Editor/generator validation: one transition always crosses one adjacent
 * contour edge, directed from its lower anchor to its upper anchor. */
export function terrainTransitionValid(transition: TerrainTransition): boolean {
  if (!Number.isInteger(transition.contourLevel) || transition.contourLevel < 1) return false;
  const delta = TRANSITION_DIRECTION_DELTA[transition.direction];
  if (delta === undefined) return false;
  return Number.isInteger(transition.lowerTileX)
    && Number.isInteger(transition.lowerTileY)
    && Number.isInteger(transition.upperTileX)
    && Number.isInteger(transition.upperTileY)
    && transition.upperTileX - transition.lowerTileX === delta[0]
    && transition.upperTileY - transition.lowerTileY === delta[1];
}

export function terrainElevationAt(
  elevations: Uint8Array,
  width: number,
  height: number,
  tileX: number,
  tileY: number,
): number {
  if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) return 0;
  return elevations[tileY * width + tileX] ?? 0;
}

export function maximumTerrainElevation(elevations: Uint8Array): number {
  let maximum = 0;
  for (const elevation of elevations) maximum = Math.max(maximum, elevation);
  return maximum;
}

/** The scalar painter offset is independent of collision thickness. A tall
 * three-row face projects each logical level by three screen tiles even when
 * its final foot row is walkable. */
export function terrainProjectedDepthOffset(
  elevation: number,
  projectedRowsPerLevel: number,
  tilePixels: number,
): number {
  if (!Number.isInteger(elevation) || elevation < 0) throw new Error('Terrain elevation must be non-negative');
  if (!Number.isInteger(projectedRowsPerLevel) || projectedRowsPerLevel < 0) {
    throw new Error('Projected terrain rows must be non-negative');
  }
  return elevation * projectedRowsPerLevel * tilePixels;
}

export function terrainTransitionConnects(
  transition: TerrainTransition,
  fromTileX: number,
  fromTileY: number,
  fromElevation: number,
  toTileX: number,
  toTileY: number,
  toElevation: number,
): boolean {
  if (!terrainTransitionValid(transition)) return false;
  const lowerToUpper = fromTileX === transition.lowerTileX
    && fromTileY === transition.lowerTileY
    && fromElevation === transition.contourLevel - 1
    && toTileX === transition.upperTileX
    && toTileY === transition.upperTileY
    && toElevation === transition.contourLevel;
  const upperToLower = fromTileX === transition.upperTileX
    && fromTileY === transition.upperTileY
    && fromElevation === transition.contourLevel
    && toTileX === transition.lowerTileX
    && toTileY === transition.lowerTileY
    && toElevation === transition.contourLevel - 1;
  return lowerToUpper || upperToLower;
}

export function terrainWalkingStepAllowed(
  elevations: Uint8Array,
  width: number,
  height: number,
  transitions: readonly TerrainTransition[],
  fromTileX: number,
  fromTileY: number,
  toTileX: number,
  toTileY: number,
): boolean {
  const fromElevation = terrainElevationAt(elevations, width, height, fromTileX, fromTileY);
  const toElevation = terrainElevationAt(elevations, width, height, toTileX, toTileY);
  if (fromElevation === toElevation) return true;
  return transitions.some((transition) => (
    (transition.kind === 'slope' || transition.kind === 'stairs')
    && terrainTransitionConnects(
      transition,
      fromTileX,
      fromTileY,
      fromElevation,
      toTileX,
      toTileY,
      toElevation,
    )
  ));
}
