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
  'ramp_top_left', 'ramp_top_middle', 'ramp_top_right',
  'ramp_bottom_left', 'ramp_bottom_middle', 'ramp_bottom_right',
] as const;
export type RaisedTerrainRampRole = typeof RAISED_TERRAIN_RAMP_ROLES[number];

export type RaisedTerrainFaceJoin = 'left' | 'middle' | 'right';
export type RaisedTerrainRole = RaisedTerrainEdgeRole | RaisedTerrainInsetRole
  | RaisedTerrainRampRole | `face.${string}.${RaisedTerrainFaceJoin}`;

/** One visual row in a vertical face profile, ordered from top to bottom. */
export interface RaisedTerrainFaceRow {
  readonly id: string;
  readonly frames: readonly [left: number, middle: number, right: number];
  readonly blocksMovement: boolean;
  readonly blocksLight: boolean;
  /** False for an authored ground-contact shadow/trim row which extends the
   * sprite but does not increase the projected elevation of the surface. */
  readonly contributesHeight?: boolean;
  /** Optional authored alternates for the seamless middle join (for example a
   * protruding stone column). Selection is deterministic per face column and
   * shared by every course of that column. */
  readonly middleVariants?: readonly number[];
}

/** A tileset can expose multiple profiles (for example `short` and `tall`).
 * Changing profile length changes the projected face height without changing
 * the occupancy mask or any autotile rules. */
export interface RaisedTerrainFaceProfile {
  readonly rows: readonly RaisedTerrainFaceRow[];
  /** Optional repeatable course used by raised terrain above the terminal
   * lower-wall course. When present, one contour contributes one structural
   * row: the lowest exposed contour uses the profile's structural row and
   * cosmetic foot, while every contour above it uses this repeat row and no
   * foot. Interior profiles omit this and retain their authored fixed bank. */
  readonly repeatRow?: RaisedTerrainFaceRow;
  /** Optional authored variants for stacked courses. When present these take
   * precedence over repeatRow and rotate deterministically by contour. */
  readonly repeatRows?: readonly RaisedTerrainFaceRow[];
}

export interface RaisedTerrainStairFrames {
  readonly top: readonly [left: number, right: number];
  readonly middle: readonly [left: number, right: number];
  readonly bottom: readonly [left: number, right: number];
}

export interface RaisedTerrainRampBankCourse {
  readonly left: number;
  /** One or more authored middle variants, repeated deterministically when a
   * crossing is wider than the source bank. */
  readonly middle: readonly number[];
  readonly right: number;
}

/** A north-facing crossing bank. Crest and base are terminal horizontal
 * courses; tread courses repeat to cover any positive elevation delta. */
export interface RaisedTerrainRampBank {
  readonly assetId: string;
  readonly crest: RaisedTerrainRampBankCourse;
  readonly treads: readonly RaisedTerrainRampBankCourse[];
  readonly base: RaisedTerrainRampBankCourse;
  /** Exact source frames whose duplicate pixels are intentional (for example,
   * a uniform ground-contact trim extracted from distinct authored lanes). */
  readonly intentionalRoleFrameReuse?: readonly number[];
}

/** A flat, zero-projection lip bank. It deliberately shares the contour
 * edge/inset grammar without inheriting any face rows or collision planes. */
export interface RaisedTerrainLedgeBank {
  readonly assetId: string;
  readonly edgeFrames: Readonly<Record<RaisedTerrainEdgeRole, number>>;
  readonly insetFrames: Readonly<Record<RaisedTerrainInsetRole, number>>;
  /** Exact ledge-sheet frames intentionally copied from another registered
   * terrain family. Cross-family content validation requires both sides of a
   * reuse to declare their concrete source-frame numbers. */
  readonly intentionalRoleFrameReuse?: readonly number[];
}

export interface RaisedTerrainTileSet {
  /** Stable atlas asset containing the edge and face frames. Renderer and
   * editor consumers resolve this id instead of branching on space names. */
  readonly assetId: string;
  /** Insets and one-level crossings may live in companion sheets. Omission
   * means the primary asset owns those frames. */
  readonly insetAssetId?: string;
  readonly rampAssetId?: string;
  readonly waterfallAssetId?: string;
  readonly stairAssetId?: string;
  readonly ladderAssetId?: string;
  /** Both styles displace the source surface north by its face height so a
   * lower actor can walk behind it. `raised` is an outdoor landform standing
   * on open ground; `interior` is solid mass around an excavation: the array
   * boundary is solid, its rims are opaque on the solid side, and a face that
   * meets solid rock ends in an authored cap. */
  readonly projectionStyle: 'raised' | 'interior';
  /** Interior spaces can pin actors to one physical plane even though the
   * surrounding wall field occupies a different logical elevation. */
  readonly fixedPlane?: number;
  /** Elevation which has zero visual displacement. Defaults to zero. */
  readonly baseDatum?: number;
  /** Physical wall rows belonging to one contour. Omission derives the value
   * from the tall profile; explicit data is useful for rim-only families. */
  readonly projectionRowsPerLevel?: number;
  readonly edgeFrames: Readonly<Partial<Record<RaisedTerrainEdgeRole, number>>>;
  readonly insetFrames: Readonly<Partial<Record<RaisedTerrainInsetRole, number>>>;
  readonly rampFrames: Readonly<Partial<Record<RaisedTerrainRampRole, number>>>;
  /** Wide authored crossing art. Outdoor families require this; interior
   * families deliberately keep null and use ladders instead. */
  readonly rampBank: RaisedTerrainRampBank | null;
  /** Optional biome/family-specific half-height lip. Interior families use
   * null; omission falls back to the selected surface family's grass bank. */
  readonly ledgeBank?: RaisedTerrainLedgeBank | null;
  /** Null is an explicit declaration that the source family has no authored
   * multi-course stair strip. */
  readonly stairFrames: RaisedTerrainStairFrames | null;
  readonly ladderFrames: readonly number[] | null;
  /** Explicit primary-sheet exceptions to the validator's cross-role frame
   * uniqueness rule (for example, a bottom rim reused as a non-solid foot). */
  readonly intentionalRoleFrameReuse?: readonly number[];
  readonly faceProfiles: Readonly<Record<string, RaisedTerrainFaceProfile>>;
  readonly edgeBlocksMovement?: boolean;
  readonly edgeBlocksLight?: boolean;
  /** Some interior banks encode edges and diagonal insets as mutually
   * exclusive alternatives: a solid cell that already owns a rim never stacks
   * an inset arc, and its rounded turns stay on solid cells rather than being
   * projected into the open floor. */
  readonly edgeInsetMode?: 'stacked' | 'exclusive';
  /** Optional number of open rows required in front of a south-facing source
   * before its vertical face may project. Raised outdoor cliffs leave this at
   * zero. Inverse cave walls use their authored face height so a one-cell
   * lateral tunnel remains a real opening instead of being filled by a wall
   * projected from the solid cell immediately north of it. */
  readonly faceClearanceRows?: number;
}

export function raisedTerrainProjectionRowsPerLevel(
  tileSet: RaisedTerrainTileSet,
): number {
  const declared = tileSet.projectionRowsPerLevel;
  if (declared !== undefined) return Math.max(0, Math.trunc(declared));
  return tileSet.faceProfiles.tall?.rows.filter(
    (row) => row.contributesHeight !== false,
  ).length ?? 0;
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
  if (!Number.isInteger(contourLevel)) {
    throw new Error(`Raised-terrain contour level must be an integer: ${contourLevel}`);
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
  /** Opaque middle-row frame drawn below an exposed side frame when the wall
   * continues diagonally. This hides the source atlas's translucent shadow
   * gutter without replacing the authored outer silhouette. */
  readonly seamUnderlayFrame?: number;
  readonly blocksMovement: boolean;
  readonly blocksLight: boolean;
  /** False for a rear wall drawn only to preserve a layered step overlap. */
  readonly direct: boolean;
}

export interface RaisedTerrainTilePlan {
  readonly edgeRole: RaisedTerrainEdgeRole | null;
  readonly edgeFrame: number | null;
  /** Opaque wall frame drawn beneath a left/right cap edge when that edge is
   * only an internal staircase join, rather than the outside silhouette. */
  readonly edgeSeamUnderlayFrame?: number;
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
 * tileset with stackable insets can receive more than one overlay. */
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

function resolvedInsetRolesAt(
  grid: RaisedTerrainGrid,
  tileX: number,
  tileY: number,
  edgeInsetMode: RaisedTerrainTileSet['edgeInsetMode'],
): readonly RaisedTerrainInsetRole[] {
  const roles = raisedTerrainInsetRolesAt(grid, tileX, tileY);
  return edgeInsetMode !== 'stacked'
    && raisedTerrainEdgeRoleAt(grid, tileX, tileY) !== null ? [] : roles;
}

/** Per-family topology settings threaded through face resolution. */
interface FaceRules {
  readonly clearanceRows: number;
  readonly edgeInsetMode: NonNullable<RaisedTerrainTileSet['edgeInsetMode']>;
  /** Interior banks draw an opaque rim over every solid cell, so a face beside
   * solid rock has no visible rear wall and must end in an authored cap. */
  readonly interior: boolean;
}

function faceRulesFor(tileSet: RaisedTerrainTileSet): FaceRules {
  return {
    clearanceRows: Math.max(0, Math.trunc(tileSet.faceClearanceRows ?? 0)),
    edgeInsetMode: tileSet.edgeInsetMode ?? 'stacked',
    interior: tileSet.projectionStyle === 'interior',
  };
}

function southFaceAt(
  grid: RaisedTerrainGrid,
  tileX: number,
  tileY: number,
  rules: FaceRules,
): boolean {
  if (!(grid.raisedAt(tileX, tileY)
    && !grid.raisedAt(tileX, tileY + 1)
    && !grid.rampRoleAt?.(tileX, tileY)
    && resolvedInsetRolesAt(grid, tileX, tileY, rules.edgeInsetMode).length === 0)) return false;
  for (let depth = 1; depth <= rules.clearanceRows; depth += 1) {
    if (grid.raisedAt(tileX, tileY + depth)) return false;
  }
  return true;
}

function directFaceAt(
  grid: RaisedTerrainGrid,
  tileX: number,
  tileY: number,
  depth: number,
  rules: FaceRules,
): boolean {
  return southFaceAt(grid, tileX, tileY - depth, rules);
}

/** Outdoor coverage includes indirect rear coverage beside a continuing
 * plateau. That coverage is what lets a higher wall remain visible behind a
 * nearer stepped wall. Interior banks have no such rear wall: the solid cell
 * beside a face is covered by its opaque rim, so only a direct face counts. */
function faceCoverageAt(
  grid: RaisedTerrainGrid,
  tileX: number,
  tileY: number,
  depth: number,
  rules: FaceRules,
): boolean {
  if (directFaceAt(grid, tileX, tileY, depth, rules)) return true;
  if (rules.interior) return false;
  const sourceY = tileY - depth;
  const continuingRaised = grid.raisedAt(tileX, sourceY) && grid.raisedAt(tileX, sourceY + 1);
  return continuingRaised && (
    southFaceAt(grid, tileX - 1, sourceY, rules)
    || southFaceAt(grid, tileX + 1, sourceY, rules)
  );
}

function projectionInterruptedByInset(
  grid: RaisedTerrainGrid,
  tileX: number,
  tileY: number,
  depth: number,
  edgeInsetMode: RaisedTerrainTileSet['edgeInsetMode'],
): boolean {
  for (let offset = depth - 1; offset >= 0; offset -= 1) {
    if (resolvedInsetRolesAt(grid, tileX, tileY - offset, edgeInsetMode).length > 0) return true;
  }
  return false;
}

function faceJoinAt(
  grid: RaisedTerrainGrid,
  tileX: number,
  tileY: number,
  depth: number,
  rules: FaceRules,
): RaisedTerrainFaceJoin {
  const leftCovered = faceCoverageAt(grid, tileX - 1, tileY, depth, rules);
  const rightCovered = faceCoverageAt(grid, tileX + 1, tileY, depth, rules);
  if (leftCovered && rightCovered) return 'middle';
  if (leftCovered) return 'right';
  if (rightCovered) return 'left';
  // No bank has a double-capped one-cell frame. Interior banks cap the side
  // that faces open floor; the neighbouring rim's outline closes the other.
  if (rules.interior && grid.raisedAt(tileX - 1, tileY) && !grid.raisedAt(tileX + 1, tileY)) {
    return 'right';
  }
  return 'left';
}

/** Authored seamless-middle alternates are chosen per face column from the
 * source cell, so every course of one column agrees on the variant. */
const FACE_MIDDLE_VARIANT_PERIOD = 6;

function frameForJoin(row: RaisedTerrainFaceRow, join: RaisedTerrainFaceJoin): number {
  if (join === 'left') return row.frames[0];
  if (join === 'right') return row.frames[2];
  return row.frames[1];
}

function frameForJoinAt(
  row: RaisedTerrainFaceRow,
  join: RaisedTerrainFaceJoin,
  tileX: number,
  sourceY: number,
): number {
  const variants = row.middleVariants;
  if (join !== 'middle' || variants === undefined || variants.length === 0) {
    return frameForJoin(row, join);
  }
  let hash = Math.imul(tileX, 0x85ebca6b) ^ Math.imul(sourceY, 0xc2b2ae35) ^ 0x27d4eb2f;
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
  hash = (hash ^ (hash >>> 13)) >>> 0;
  if (hash % FACE_MIDDLE_VARIANT_PERIOD !== 0) return row.frames[1];
  return variants[(hash >>> 8) % variants.length] ?? row.frames[1];
}

function structuralFaceContinuesAtOpenSide(
  grid: RaisedTerrainGrid,
  profile: RaisedTerrainFaceProfile,
  tileX: number,
  tileY: number,
  depth: number,
  join: RaisedTerrainFaceJoin,
  rules: FaceRules,
): boolean {
  if (join === 'middle') return false;
  const side = join === 'left' ? -1 : 1;
  // A side frame's translucent gutter only needs an opaque fill when the
  // exposed side meets another structural wall course. Looking on both sides
  // can pull an underlay from the already-connected side, while counting the
  // authored foot row turns a terminal corner into a solid square.
  for (const adjacentDepth of [depth - 1, depth + 1]) {
    const adjacentRow = profile.rows[adjacentDepth - 1];
    if (adjacentRow === undefined || adjacentRow.contributesHeight === false) continue;
    if (projectionInterruptedByInset(grid, tileX + side, tileY, adjacentDepth, rules.edgeInsetMode)) continue;
    if (faceCoverageAt(grid, tileX + side, tileY, adjacentDepth, rules)) return true;
  }
  return false;
}

function structuralFaceAtOpenSide(
  grid: RaisedTerrainGrid,
  profile: RaisedTerrainFaceProfile,
  tileX: number,
  tileY: number,
  edgeRole: RaisedTerrainEdgeRole | null,
  rules: FaceRules,
): boolean {
  const side = edgeRole === 'left' || edgeRole === 'top_left' || edgeRole === 'bottom_left'
    ? -1
    : edgeRole === 'right' || edgeRole === 'top_right' || edgeRole === 'bottom_right'
      ? 1
      : 0;
  if (side === 0) return false;
  return profile.rows.some((row, index) => {
    if (row.contributesHeight === false) return false;
    const depth = index + 1;
    return !projectionInterruptedByInset(grid, tileX + side, tileY, depth, rules.edgeInsetMode)
      && faceCoverageAt(grid, tileX + side, tileY, depth, rules);
  });
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
  const rules = faceRulesFor(tileSet);
  const edgeRole = raisedTerrainEdgeRoleAt(grid, tileX, tileY);
  const insetRoles = resolvedInsetRolesAt(grid, tileX, tileY, rules.edgeInsetMode);
  const faceLayers: RaisedTerrainFaceLayer[] = [];

  for (let depth = profile.rows.length; depth >= 1; depth -= 1) {
    if (projectionInterruptedByInset(grid, tileX, tileY, depth, rules.edgeInsetMode)) continue;
    if (!faceCoverageAt(grid, tileX, tileY, depth, rules)) continue;
    const row = profile.rows[depth - 1];
    if (!row) continue;
    const join = faceJoinAt(grid, tileX, tileY, depth, rules);
    faceLayers.push({
      depth,
      rowId: row.id,
      join,
      frame: frameForJoinAt(row, join, tileX, tileY - depth),
      ...(row.contributesHeight !== false
        && southFaceAt(grid, tileX, tileY - depth, rules)
        && structuralFaceContinuesAtOpenSide(grid, profile, tileX, tileY, depth, join, rules)
        ? { seamUnderlayFrame: row.frames[1] }
        : {}),
      blocksMovement: row.blocksMovement,
      blocksLight: row.blocksLight,
      direct: directFaceAt(grid, tileX, tileY, depth, rules),
    });
  }

  // A translucent side cap can land over a projected wall row supplied by a
  // neighbouring contour cell. Fill that internal seam with the matching
  // opaque middle wall frame. Rear-facing top corners are the plateau's outer
  // silhouette, however: putting a wall frame beneath them produces a pale
  // stone square on staircase-shaped back edges. Ground must remain visible
  // through those caps. The cosmetic non-height foot row likewise never
  // becomes an underlay.
  const sideEdge = edgeRole === 'left' || edgeRole === 'right'
    || edgeRole === 'top_left' || edgeRole === 'top_right'
    || edgeRole === 'bottom_left' || edgeRole === 'bottom_right';
  const rearCorner = edgeRole === 'top_left' || edgeRole === 'top_right';
  const supportingFace = sideEdge
    ? [...faceLayers].reverse().find((face) => (
      profile.rows[face.depth - 1]?.contributesHeight !== false
    ))
    : undefined;
  const edgeSeamUnderlayFrame = rearCorner
    ? undefined
    : supportingFace === undefined
      ? structuralFaceAtOpenSide(grid, profile, tileX, tileY, edgeRole, rules)
        ? profile.rows.find((row) => row.contributesHeight !== false)?.frames[1]
        : undefined
      : profile.rows[supportingFace.depth - 1]?.frames[1];

  return {
    edgeRole,
    edgeFrame: edgeRole === null ? null : tileSet.edgeFrames[edgeRole] ?? null,
    ...(edgeSeamUnderlayFrame === undefined ? {} : { edgeSeamUnderlayFrame }),
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
  minimumContourLevel = 1,
): readonly RaisedTerrainContourPlan[] {
  if (!Number.isInteger(minimumContourLevel)) {
    throw new Error(`Minimum terrain contour level must be an integer: ${minimumContourLevel}`);
  }
  const contours: RaisedTerrainContourPlan[] = [];
  const profile = tileSet.faceProfiles[faceProfile];
  if (!profile) throw new Error(`Unknown raised-terrain face profile: ${faceProfile}`);
  const southFaceSourceXs = (
    contourLevel: number,
    targetX: number,
    targetY: number,
    depth: number,
  ): readonly number[] => {
    const sourceY = targetY - depth;
    const isSouthFace = (sourceX: number): boolean => elevationAt(sourceX, sourceY) >= contourLevel
      && elevationAt(sourceX, sourceY + 1) < contourLevel;
    if (isSouthFace(targetX)) return [targetX];
    return [targetX - 1, targetX + 1].filter(isSouthFace);
  };
  const isTerminalFaceCourse = (
    contourLevel: number,
    targetX: number,
    targetY: number,
    depth: number,
  ): boolean => {
    const sourceY = targetY - depth;
    const sources = southFaceSourceXs(contourLevel, targetX, targetY, depth);
    return sources.length === 0 || sources.some(
      (sourceX) => elevationAt(sourceX, sourceY + 1) >= contourLevel - 1,
    );
  };
  for (let contourLevel = minimumContourLevel; contourLevel <= maximumElevation; contourLevel += 1) {
    const grid = raisedTerrainContourGrid(
      elevationAt,
      contourLevel,
      rampRoleAtLevel === undefined
        ? undefined
        : (x, y) => rampRoleAtLevel(contourLevel, x, y),
    );
    const resolvedPlan = resolveRaisedTerrainTile(grid, tileSet, faceProfile, tileX, tileY);
    const repeatRows = profile.repeatRows
      ?? (profile.repeatRow === undefined ? [] : [profile.repeatRow]);
    const faceLayers = repeatRows.length === 0
      ? resolvedPlan.faceLayers
      : resolvedPlan.faceLayers.flatMap((layer) => {
          const row = profile.rows[layer.depth - 1];
          if (row === undefined) return [];
          const terminal = isTerminalFaceCourse(
            contourLevel,
            tileX,
            tileY,
            layer.depth,
          );
          if (row.contributesHeight === false && !terminal) return [];
          if (row.contributesHeight === false || terminal) return [layer];
          const repeatRow = repeatRows[Math.abs(contourLevel) % repeatRows.length]!;
          return [{
            ...layer,
            rowId: repeatRow.id,
            frame: frameForJoinAt(repeatRow, layer.join, tileX, tileY - layer.depth),
            ...(layer.seamUnderlayFrame === undefined
              ? {}
              : { seamUnderlayFrame: repeatRow.frames[1] }),
            blocksMovement: repeatRow.blocksMovement,
            blocksLight: repeatRow.blocksLight,
          }];
        });
    const plan = faceLayers === resolvedPlan.faceLayers
      ? resolvedPlan
      : {
          ...resolvedPlan,
          faceLayers,
          blocksMovement: resolvedPlan.rampRole === null && (
            (resolvedPlan.edgeRole !== null && (tileSet.edgeBlocksMovement ?? true))
            || faceLayers.some((layer) => layer.direct && layer.blocksMovement)
          ),
          blocksLight: resolvedPlan.rampRole === null && (
            (resolvedPlan.edgeRole !== null && (tileSet.edgeBlocksLight ?? false))
            || faceLayers.some((layer) => layer.direct && layer.blocksLight)
          ),
        };
    if (plan.edgeFrame === null && plan.faceLayers.length === 0
      && plan.insetFrames.length === 0 && plan.rampRole === null) continue;
    contours.push({ contourLevel, plan });
  }
  return contours;
}
