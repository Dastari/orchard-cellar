/** Shared elevation-contour topology used by generation, rendering, collision,
 * and future terrain-editing tools. */
export const RAISED_TERRAIN_EDGE_ROLES = [
  'top_left', 'top', 'top_right',
  'left', 'right',
  'bottom_left', 'bottom', 'bottom_right',
] as const;
export type RaisedTerrainEdgeRole = typeof RAISED_TERRAIN_EDGE_ROLES[number];

export const RAISED_TERRAIN_INSET_ROLES = [
  'inner_top_left', 'inner_top_right', 'inner_bottom_left', 'inner_bottom_right',
] as const;
export type RaisedTerrainInsetRole = typeof RAISED_TERRAIN_INSET_ROLES[number];

export const RAISED_TERRAIN_RAMP_ROLES = [
  'ramp_top_left', 'ramp_top_right', 'ramp_bottom_left', 'ramp_bottom_right',
] as const;
export type RaisedTerrainRampRole = typeof RAISED_TERRAIN_RAMP_ROLES[number];

export type RaisedTerrainFaceJoin = 'left' | 'middle' | 'right';

/** One visual row in a vertical face profile, ordered from top to bottom. */
export interface RaisedTerrainFaceRow {
  readonly id: string;
  readonly frames: readonly [left: number, middle: number, right: number];
  readonly blocksMovement: boolean;
  readonly blocksLight: boolean;
}

/** A tileset can expose multiple profiles (for example `short` and `tall`).
 * Changing profile length changes the projected face height without changing
 * the occupancy mask or any autotile rules. */
export interface RaisedTerrainFaceProfile {
  readonly rows: readonly RaisedTerrainFaceRow[];
}

export interface RaisedTerrainTileSet {
  readonly edgeFrames: Readonly<Partial<Record<RaisedTerrainEdgeRole, number>>>;
  readonly insetFrames: Readonly<Partial<Record<RaisedTerrainInsetRole, number>>>;
  readonly rampFrames: Readonly<Partial<Record<RaisedTerrainRampRole, number>>>;
  readonly faceProfiles: Readonly<Record<string, RaisedTerrainFaceProfile>>;
  readonly edgeBlocksMovement?: boolean;
  readonly edgeBlocksLight?: boolean;
}

/** An editor can implement this interface directly from an integer elevation
 * grid by returning `elevationAt(x, y) >= contourLevel` from `raisedAt`. */
export interface RaisedTerrainGrid {
  readonly raisedAt: (tileX: number, tileY: number) => boolean;
  readonly rampRoleAt?: (tileX: number, tileY: number) => RaisedTerrainRampRole | null;
}

/** Adapts an integer elevation field into one contour. An editor resolves each
 * level independently, allowing the same rules to stack multi-level terrain. */
export function raisedTerrainContourGrid(
  elevationAt: (tileX: number, tileY: number) => number,
  contourLevel: number,
  rampRoleAt?: (tileX: number, tileY: number) => RaisedTerrainRampRole | null,
): RaisedTerrainGrid {
  if (!Number.isInteger(contourLevel) || contourLevel < 1) {
    throw new Error(`Raised-terrain contour level must be a positive integer: ${contourLevel}`);
  }
  return {
    raisedAt: (tileX, tileY) => elevationAt(tileX, tileY) >= contourLevel,
    ...(rampRoleAt ? { rampRoleAt } : {}),
  };
}

export interface RaisedTerrainFaceLayer {
  readonly depth: number;
  readonly rowId: string;
  readonly join: RaisedTerrainFaceJoin;
  readonly frame: number;
  readonly blocksMovement: boolean;
  readonly blocksLight: boolean;
  /** False for a rear wall drawn only to preserve a layered step overlap. */
  readonly direct: boolean;
}

export interface RaisedTerrainTilePlan {
  readonly edgeRole: RaisedTerrainEdgeRole | null;
  readonly edgeFrame: number | null;
  readonly faceLayers: readonly RaisedTerrainFaceLayer[];
  readonly insetRoles: readonly RaisedTerrainInsetRole[];
  readonly insetFrames: readonly number[];
  readonly rampRole: RaisedTerrainRampRole | null;
  readonly rampFrame: number | null;
  readonly blocksMovement: boolean;
  readonly blocksLight: boolean;
}

export interface RaisedTerrainContourPlan {
  readonly contourLevel: number;
  readonly plan: RaisedTerrainTilePlan;
}

export type RaisedTerrainRampRoleAtLevel = (
  contourLevel: number,
  tileX: number,
  tileY: number,
) => RaisedTerrainRampRole | null;

function horizontalRole(
  left: boolean,
  right: boolean,
  roles: readonly [RaisedTerrainEdgeRole, RaisedTerrainEdgeRole, RaisedTerrainEdgeRole],
): RaisedTerrainEdgeRole {
  return !left ? roles[0] : !right ? roles[2] : roles[1];
}

export function raisedTerrainEdgeRoleAt(
  grid: RaisedTerrainGrid,
  tileX: number,
  tileY: number,
): RaisedTerrainEdgeRole | null {
  if (!grid.raisedAt(tileX, tileY) || grid.rampRoleAt?.(tileX, tileY)) return null;
  const north = grid.raisedAt(tileX, tileY - 1);
  const east = grid.raisedAt(tileX + 1, tileY);
  const south = grid.raisedAt(tileX, tileY + 1);
  const west = grid.raisedAt(tileX - 1, tileY);
  if (!north) return horizontalRole(west, east, ['top_left', 'top', 'top_right']);
  if (!south) return horizontalRole(west, east, ['bottom_left', 'bottom', 'bottom_right']);
  if (!west) return 'left';
  if (!east) return 'right';
  return null;
}

/** Standard four-diagonal inner-corner rule. All cases are independent so a
 * pinched cell can receive more than one transparent overlay. */
export function raisedTerrainInsetRolesAt(
  grid: RaisedTerrainGrid,
  tileX: number,
  tileY: number,
): readonly RaisedTerrainInsetRole[] {
  if (!grid.raisedAt(tileX, tileY)) return [];
  const north = grid.raisedAt(tileX, tileY - 1);
  const east = grid.raisedAt(tileX + 1, tileY);
  const south = grid.raisedAt(tileX, tileY + 1);
  const west = grid.raisedAt(tileX - 1, tileY);
  const roles: RaisedTerrainInsetRole[] = [];
  if (north && west && !grid.raisedAt(tileX - 1, tileY - 1)) roles.push('inner_top_left');
  if (north && east && !grid.raisedAt(tileX + 1, tileY - 1)) roles.push('inner_top_right');
  if (south && west && !grid.raisedAt(tileX - 1, tileY + 1)) roles.push('inner_bottom_left');
  if (south && east && !grid.raisedAt(tileX + 1, tileY + 1)) roles.push('inner_bottom_right');
  return roles;
}

function southFaceAt(grid: RaisedTerrainGrid, tileX: number, tileY: number): boolean {
  return grid.raisedAt(tileX, tileY)
    && !grid.raisedAt(tileX, tileY + 1)
    && !grid.rampRoleAt?.(tileX, tileY)
    && raisedTerrainInsetRolesAt(grid, tileX, tileY).length === 0;
}

/** Includes indirect rear coverage beside a continuing plateau. That coverage
 * is what lets a higher wall remain visible behind a nearer stepped wall. */
function faceCoverageAt(
  grid: RaisedTerrainGrid,
  tileX: number,
  tileY: number,
  depth: number,
): boolean {
  const sourceY = tileY - depth;
  if (southFaceAt(grid, tileX, sourceY)) return true;
  const continuingRaised = grid.raisedAt(tileX, sourceY) && grid.raisedAt(tileX, sourceY + 1);
  return continuingRaised && (
    southFaceAt(grid, tileX - 1, sourceY)
    || southFaceAt(grid, tileX + 1, sourceY)
  );
}

function projectionInterruptedByInset(
  grid: RaisedTerrainGrid,
  tileX: number,
  tileY: number,
  depth: number,
): boolean {
  for (let offset = depth - 1; offset >= 0; offset -= 1) {
    if (raisedTerrainInsetRolesAt(grid, tileX, tileY - offset).length > 0) return true;
  }
  return false;
}

function faceJoinAt(
  grid: RaisedTerrainGrid,
  tileX: number,
  tileY: number,
  depth: number,
): RaisedTerrainFaceJoin {
  if (!faceCoverageAt(grid, tileX - 1, tileY, depth)) return 'left';
  if (!faceCoverageAt(grid, tileX + 1, tileY, depth)) return 'right';
  return 'middle';
}

function frameForJoin(row: RaisedTerrainFaceRow, join: RaisedTerrainFaceJoin): number {
  if (join === 'left') return row.frames[0];
  if (join === 'right') return row.frames[2];
  return row.frames[1];
}

/** Resolves every layer and collision semantic for one contour cell. Face
 * layers are returned deepest-to-nearest and must be drawn in that order. */
export function resolveRaisedTerrainTile(
  grid: RaisedTerrainGrid,
  tileSet: RaisedTerrainTileSet,
  faceProfile: string,
  tileX: number,
  tileY: number,
): RaisedTerrainTilePlan {
  const profile = tileSet.faceProfiles[faceProfile];
  if (!profile) throw new Error(`Unknown raised-terrain face profile: ${faceProfile}`);
  const rampRole = grid.rampRoleAt?.(tileX, tileY) ?? null;
  const edgeRole = raisedTerrainEdgeRoleAt(grid, tileX, tileY);
  const insetRoles = raisedTerrainInsetRolesAt(grid, tileX, tileY);
  const faceLayers: RaisedTerrainFaceLayer[] = [];

  for (let depth = profile.rows.length; depth >= 1; depth -= 1) {
    if (projectionInterruptedByInset(grid, tileX, tileY, depth)) continue;
    if (!faceCoverageAt(grid, tileX, tileY, depth)) continue;
    const row = profile.rows[depth - 1];
    if (!row) continue;
    const join = faceJoinAt(grid, tileX, tileY, depth);
    faceLayers.push({
      depth,
      rowId: row.id,
      join,
      frame: frameForJoin(row, join),
      blocksMovement: row.blocksMovement,
      blocksLight: row.blocksLight,
      direct: southFaceAt(grid, tileX, tileY - depth),
    });
  }

  return {
    edgeRole,
    edgeFrame: edgeRole === null ? null : tileSet.edgeFrames[edgeRole] ?? null,
    faceLayers,
    insetRoles,
    insetFrames: insetRoles.flatMap((role) => {
      const frame = tileSet.insetFrames[role];
      return frame === undefined ? [] : [frame];
    }),
    rampRole,
    rampFrame: rampRole === null ? null : tileSet.rampFrames[rampRole] ?? null,
    blocksMovement: rampRole === null && (
      (edgeRole !== null && (tileSet.edgeBlocksMovement ?? true))
      || faceLayers.some((layer) => layer.direct && layer.blocksMovement)
    ),
    blocksLight: rampRole === null && (
      (edgeRole !== null && (tileSet.edgeBlocksLight ?? false))
      || faceLayers.some((layer) => layer.direct && layer.blocksLight)
    ),
  };
}

/** Resolves every integer contour independently. This is the shared operation
 * used by generated mountains and a future raise/lower editor brush. */
export function resolveRaisedTerrainContoursAt(
  elevationAt: (tileX: number, tileY: number) => number,
  maximumElevation: number,
  tileSet: RaisedTerrainTileSet,
  faceProfile: string,
  tileX: number,
  tileY: number,
  rampRoleAtLevel?: RaisedTerrainRampRoleAtLevel,
): readonly RaisedTerrainContourPlan[] {
  const contours: RaisedTerrainContourPlan[] = [];
  for (let contourLevel = 1; contourLevel <= maximumElevation; contourLevel += 1) {
    const grid = raisedTerrainContourGrid(
      elevationAt,
      contourLevel,
      rampRoleAtLevel === undefined
        ? undefined
        : (x, y) => rampRoleAtLevel(contourLevel, x, y),
    );
    const plan = resolveRaisedTerrainTile(grid, tileSet, faceProfile, tileX, tileY);
    if (plan.edgeFrame === null && plan.faceLayers.length === 0
      && plan.insetFrames.length === 0 && plan.rampFrame === null) continue;
    contours.push({ contourLevel, plan });
  }
  return contours;
}
