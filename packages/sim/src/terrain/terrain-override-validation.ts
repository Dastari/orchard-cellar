import type { TerrainOverride } from '../map-document.js';
import type {
  RaisedTerrainFaceJoin,
  RaisedTerrainRole,
  RaisedTerrainTileSet,
} from '../raised-terrain-autotile.js';
import { TERRAIN_CLIFF_FAMILIES } from '../terrain-tilesets.js';

export type ExactTerrainOverrideFindingCode =
  | 'terrain_override_empty'
  | 'terrain_override_role_invalid'
  | 'terrain_override_frame_invalid'
  | 'terrain_override_frame_incompatible'
  | 'terrain_override_family_unavailable';

export interface ExactTerrainOverrideFinding {
  readonly code: ExactTerrainOverrideFindingCode;
  readonly message: string;
}

const FACE_ROLE = /^face\.([a-z0-9_]+)\.(left|middle|right)$/u;

function uniqueFrames(frames: readonly number[]): readonly number[] {
  return Object.freeze([...new Set(frames)].sort((left, right) => left - right));
}

/** Exact source frames which the renderer can substitute for one semantic
 * terrain role. Returning null is intentionally fail-closed: an arbitrary
 * atlas index is not evidence that the selected family authored that role. */
export function exactTerrainOverrideFramesForRole(
  tileSet: RaisedTerrainTileSet,
  role: RaisedTerrainRole,
): readonly number[] | null {
  if (role in tileSet.edgeFrames) {
    const frame = tileSet.edgeFrames[role as keyof typeof tileSet.edgeFrames];
    return frame === undefined ? null : [frame];
  }
  if (role in tileSet.insetFrames) {
    const frame = tileSet.insetFrames[role as keyof typeof tileSet.insetFrames];
    return frame === undefined ? null : [frame];
  }
  if (role in tileSet.rampFrames) {
    const frame = tileSet.rampFrames[role as keyof typeof tileSet.rampFrames];
    return frame === undefined ? null : [frame];
  }
  const match = FACE_ROLE.exec(role);
  if (match === null) return null;
  const [, rowId, rawJoin] = match;
  const join = rawJoin as RaisedTerrainFaceJoin;
  const profile = tileSet.faceProfiles.tall;
  if (profile === undefined) return null;
  const rows = [
    ...profile.rows,
    ...(profile.repeatRow === undefined ? [] : [profile.repeatRow]),
    ...(profile.repeatRows ?? []),
  ].filter((row) => row.id === rowId);
  if (rows.length === 0) return null;
  const joinIndex = join === 'left' ? 0 : join === 'middle' ? 1 : 2;
  return uniqueFrames(rows.flatMap((row) => [
    row.frames[joinIndex],
    ...(join === 'middle' ? row.middleVariants ?? [] : []),
  ]));
}

export function validateExactTerrainOverride(
  override: TerrainOverride,
  family: string,
  tileSet: RaisedTerrainTileSet | null,
  targetRole: RaisedTerrainRole | null,
): readonly ExactTerrainOverrideFinding[] {
  const findings: ExactTerrainOverrideFinding[] = [];
  const rawRole: unknown = override.role;
  const rawFrame: unknown = override.frameIndex;
  const knownFamily = (TERRAIN_CLIFF_FAMILIES as Readonly<Record<string, {
    readonly available: boolean;
  }>>)[family];
  if (family === 'snow' || knownFamily?.available === false || tileSet === null) {
    findings.push({
      code: 'terrain_override_family_unavailable',
      message: `Override family ${family} has no reproducible source art`,
    });
    return findings;
  }
  if (rawRole === undefined && rawFrame === undefined) {
    findings.push({
      code: 'terrain_override_empty',
      message: 'Terrain override must select a semantic role or exact frame',
    });
    return findings;
  }
  if (rawRole !== undefined && typeof rawRole !== 'string') {
    findings.push({
      code: 'terrain_override_role_invalid',
      message: 'Terrain override role must be a registered semantic role',
    });
    return findings;
  }
  if (rawFrame !== undefined && (!Number.isSafeInteger(rawFrame) || (rawFrame as number) < 0)) {
    findings.push({
      code: 'terrain_override_frame_invalid',
      message: 'Terrain override frame must be a non-negative safe integer',
    });
    return findings;
  }
  if (targetRole === null) return findings;
  const frames = exactTerrainOverrideFramesForRole(tileSet, targetRole);
  if (frames === null) {
    findings.push({
      code: 'terrain_override_role_invalid',
      message: `Override family ${family} does not author semantic role ${targetRole}`,
    });
    return findings;
  }
  // A face role without a frame is a renderer no-op; edge/inset/ramp roles
  // can resolve their exact registered default frame from the role itself.
  if (targetRole.startsWith('face.') && rawFrame === undefined) {
    findings.push({
      code: 'terrain_override_frame_invalid',
      message: `Face override ${targetRole} requires an exact authored frame`,
    });
  } else if (rawFrame !== undefined && !frames.includes(rawFrame as number)) {
    findings.push({
      code: 'terrain_override_frame_incompatible',
      message: `Frame ${String(rawFrame)} is not authored for ${family}:${targetRole}`,
    });
  }
  return findings;
}
