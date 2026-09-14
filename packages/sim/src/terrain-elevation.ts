export const TERRAIN_TRANSITION_KINDS = ['slope', 'stairs', 'ladder', 'rope'] as const;
export type TerrainTransitionKind = typeof TERRAIN_TRANSITION_KINDS[number];

export const TERRAIN_TRANSITION_DIRECTIONS = ['up', 'right', 'down', 'left'] as const;
export type TerrainTransitionDirection = typeof TERRAIN_TRANSITION_DIRECTIONS[number];

/** Shared supported authoring range. Generators may intentionally use a
 * smaller band, but every compiler/editor path accepts this signed range. */
export const TERRAIN_ELEVATION_LIMIT = 8;

/** A wide multi-course crossing. The compiler expands this compact source
 * record into ordinary single-contour transitions consumed by movement. */
export interface StairRun {
  readonly x: number;
  readonly y: number;
  readonly direction: TerrainTransitionDirection;
  readonly fromLevel: number;
  readonly toLevel: number;
  /** Defaults to two for documents authored before wide ramp banks. */
  readonly width?: number;
}

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

export interface TerrainTransitionLane {
  readonly transition: TerrainTransition;
  readonly endpoint: 'lower' | 'upper';
  readonly laneIndex: number;
  readonly width: number;
  readonly position: 'left' | 'middle' | 'right';
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

export function stairRunValid(run: StairRun): boolean {
  return Number.isInteger(run.x) && Number.isInteger(run.y)
    && Number.isInteger(run.fromLevel) && Number.isInteger(run.toLevel)
    && run.toLevel > run.fromLevel
    && run.fromLevel >= -TERRAIN_ELEVATION_LIMIT
    && run.toLevel <= TERRAIN_ELEVATION_LIMIT
    && (run.width === undefined || (Number.isInteger(run.width) && run.width >= 2))
    && TRANSITION_DIRECTION_DELTA[run.direction] !== undefined;
}

/** Expands both lanes and every crossed contour. Intermediate course tiles
 * carry their matching integer elevations, so the existing movement guard and
 * continuous transition interpolation need no stair-specific branch. */
export function expandStairRun(run: StairRun): readonly TerrainTransition[] {
  if (!stairRunValid(run)) throw new RangeError('Invalid stair run');
  const [deltaX, deltaY] = TRANSITION_DIRECTION_DELTA[run.direction];
  const lateralX = deltaY === 0 ? 0 : 1;
  const lateralY = deltaX === 0 ? 0 : 1;
  const transitions: TerrainTransition[] = [];
  const width = run.width ?? 2;
  for (let course = 0; course < run.toLevel - run.fromLevel; course += 1) {
    for (let lane = 0; lane < width; lane += 1) {
      const lowerTileX = run.x + course * deltaX + lane * lateralX;
      const lowerTileY = run.y + course * deltaY + lane * lateralY;
      transitions.push({
        contourLevel: run.fromLevel + course + 1,
        kind: 'stairs',
        direction: run.direction,
        lowerTileX,
        lowerTileY,
        upperTileX: lowerTileX + deltaX,
        upperTileY: lowerTileY + deltaY,
      });
    }
  }
  return transitions;
}

/** Editor/generator validation: one transition always crosses one adjacent
 * contour edge, directed from its lower anchor to its upper anchor. */
export function terrainTransitionValid(transition: TerrainTransition): boolean {
  if (!Number.isInteger(transition.contourLevel)) return false;
  const delta = TRANSITION_DIRECTION_DELTA[transition.direction];
  if (delta === undefined) return false;
  return Number.isInteger(transition.lowerTileX)
    && Number.isInteger(transition.lowerTileY)
    && Number.isInteger(transition.upperTileX)
    && Number.isInteger(transition.upperTileY)
    && transition.upperTileX - transition.lowerTileX === delta[0]
    && transition.upperTileY - transition.lowerTileY === delta[1];
}

/** Resolves one endpoint inside a contiguous north-facing crossing course.
 * Separate banks on the same row never merge across a missing lane. */
export function terrainTransitionLaneAt(
  transitions: readonly TerrainTransition[],
  contourLevel: number,
  tileX: number,
  tileY: number,
): TerrainTransitionLane | null {
  const transition = transitions.find((candidate) => candidate.contourLevel === contourLevel
    && candidate.direction === 'up'
    && (candidate.kind === 'slope' || candidate.kind === 'stairs')
    && ((candidate.lowerTileX === tileX && candidate.lowerTileY === tileY)
      || (candidate.upperTileX === tileX && candidate.upperTileY === tileY)));
  if (transition === undefined) return null;
  const endpoint = transition.lowerTileX === tileX && transition.lowerTileY === tileY
    ? 'lower' : 'upper';
  const lanes = new Set(transitions.filter((candidate) => (
    candidate.contourLevel === transition.contourLevel
    && candidate.kind === transition.kind
    && candidate.direction === transition.direction
    && candidate.lowerTileY === transition.lowerTileY
    && candidate.upperTileY === transition.upperTileY
  )).map((candidate) => candidate.lowerTileX));
  let minimumX = transition.lowerTileX;
  let maximumX = transition.lowerTileX;
  while (lanes.has(minimumX - 1)) minimumX -= 1;
  while (lanes.has(maximumX + 1)) maximumX += 1;
  const width = maximumX - minimumX + 1;
  if (width < 2) return null;
  const laneIndex = transition.lowerTileX - minimumX;
  return {
    transition,
    endpoint,
    laneIndex,
    width,
    position: laneIndex === 0 ? 'left' : laneIndex === width - 1 ? 'right' : 'middle',
  };
}

export function terrainElevationAt(
  elevations: Int16Array | Uint8Array,
  width: number,
  height: number,
  tileX: number,
  tileY: number,
): number {
  if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) return 0;
  return elevations[tileY * width + tileX] ?? 0;
}

export function maximumTerrainElevation(elevations: Int16Array | Uint8Array): number {
  let maximum = Number.NEGATIVE_INFINITY;
  for (const elevation of elevations) maximum = Math.max(maximum, elevation);
  return maximum === Number.NEGATIVE_INFINITY ? 0 : maximum;
}

export function minimumTerrainElevation(elevations: Int16Array | Uint8Array): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const elevation of elevations) minimum = Math.min(minimum, elevation);
  return minimum === Number.POSITIVE_INFINITY ? 0 : minimum;
}

/** Returns the union of every fully occupied 2x2 block in a contour mask.
 * Every retained cell therefore has both a horizontal and vertical peer. */
export function retainMinimumTerrainFootprint(
  source: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (source.length !== width * height) {
    throw new RangeError('Terrain footprint mask dimensions do not match');
  }
  const retained = new Uint8Array(source.length);
  for (let tileY = 0; tileY < height - 1; tileY += 1) {
    for (let tileX = 0; tileX < width - 1; tileX += 1) {
      const topLeft = tileY * width + tileX;
      if (source[topLeft] !== 1 || source[topLeft + 1] !== 1
        || source[topLeft + width] !== 1 || source[topLeft + width + 1] !== 1) continue;
      retained[topLeft] = 1;
      retained[topLeft + 1] = 1;
      retained[topLeft + width] = 1;
      retained[topLeft + width + 1] = 1;
    }
  }
  return retained;
}

/** The scalar painter offset is independent of collision thickness. Outdoor
 * cliffs project one structural tile per logical level; cosmetic foot rows do
 * not add displacement. Interior families may select a different count. */
export function terrainProjectedDepthOffset(
  elevation: number,
  projectedRowsPerLevel: number,
  tilePixels: number,
  baseDatum = 0,
): number {
  if (!Number.isFinite(elevation)) throw new Error('Terrain elevation must be finite');
  if (!Number.isFinite(baseDatum)) throw new Error('Terrain base datum must be finite');
  if (!Number.isInteger(projectedRowsPerLevel) || projectedRowsPerLevel < 0) {
    throw new Error('Projected terrain rows must be non-negative');
  }
  const offset = (elevation - baseDatum) * projectedRowsPerLevel * tilePixels;
  return offset === 0 ? 0 : offset;
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
  elevations: Int16Array | Uint8Array,
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
  if (fromElevation === toElevation) {
    return terrainTransitionLaneStepAllowed(
      transitions,
      fromTileX,
      fromTileY,
      toTileX,
      toTileY,
    );
  }
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

function walkingTransitionEndpointsAt(
  transitions: readonly TerrainTransition[],
  tileX: number,
  tileY: number,
): readonly { readonly transition: TerrainTransition; readonly endpoint: 'lower' | 'upper' }[] {
  return transitions.flatMap<{ readonly transition: TerrainTransition; readonly endpoint: 'lower' | 'upper' }>((transition) => {
    if (transition.kind !== 'slope' && transition.kind !== 'stairs') return [];
    if (transition.lowerTileX === tileX && transition.lowerTileY === tileY) {
      return [{ transition, endpoint: 'lower' as const }];
    }
    if (transition.upperTileX === tileX && transition.upperTileY === tileY) {
      return [{ transition, endpoint: 'upper' as const }];
    }
    return [];
  });
}

/** A slope/stair endpoint is a one-way lane through a contour, rather than a
 * magic tile that may be entered from either side. This keeps presentation
 * interpolation and authority in lockstep: actors approach at the low/high
 * end, cross the named contour, and may move between parallel ramp lanes. */
function terrainTransitionLaneStepAllowed(
  transitions: readonly TerrainTransition[],
  fromTileX: number,
  fromTileY: number,
  toTileX: number,
  toTileY: number,
): boolean {
  const fromEndpoints = walkingTransitionEndpointsAt(transitions, fromTileX, fromTileY);
  const toEndpoints = walkingTransitionEndpointsAt(transitions, toTileX, toTileY);
  if (fromEndpoints.length === 0 && toEndpoints.length === 0) return true;

  const endpointAllowsNeighbor = (
    endpoint: typeof fromEndpoints[number],
    neighborX: number,
    neighborY: number,
    neighborEndpoints: typeof toEndpoints,
  ): boolean => {
    const transition = endpoint.transition;
    const delta = TRANSITION_DIRECTION_DELTA[transition.direction];
    const anchorX = endpoint.endpoint === 'lower' ? transition.lowerTileX : transition.upperTileX;
    const anchorY = endpoint.endpoint === 'lower' ? transition.lowerTileY : transition.upperTileY;
    const outsideX = anchorX + (endpoint.endpoint === 'lower' ? -delta[0] : delta[0]);
    const outsideY = anchorY + (endpoint.endpoint === 'lower' ? -delta[1] : delta[1]);
    if (neighborX === outsideX && neighborY === outsideY) return true;
    return neighborEndpoints.some((neighbor) => (
      neighbor.endpoint === endpoint.endpoint
      && neighbor.transition.contourLevel === transition.contourLevel
      && neighbor.transition.direction === transition.direction
    ));
  };

  return fromEndpoints.every((endpoint) => endpointAllowsNeighbor(
    endpoint,
    toTileX,
    toTileY,
    toEndpoints,
  )) && toEndpoints.every((endpoint) => endpointAllowsNeighbor(
    endpoint,
    fromTileX,
    fromTileY,
    fromEndpoints,
  ));
}
