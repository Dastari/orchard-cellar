import {
  ORCHARD_STONE_THEME,
  MAP_COLLISION_OVERRIDES,
  MAP_FEATURE_KINDS,
  MAP_SURFACE_KINDS,
  TERRAIN_MATERIAL_DEFINITIONS,
  mapCoordinateInBounds,
  resolvedMapCellAt,
  type MapDocumentV2,
  type MapFeatureKind,
  type MapSurfaceKind,
  type MapTerrainRole,
  type MapThemeManifest,
} from './map-document.js';
import type { MapPoint } from './map-editing.js';
import {
  SURVIVAL_RAISED_CLIFF_TILE_SET,
} from './survival-world.js';
import {
  resolveRaisedTerrainContoursAt,
  type RaisedTerrainFaceJoin,
  type RaisedTerrainRampRole,
} from './raised-terrain-autotile.js';
import { terrainTransitionValid, type TerrainTransition } from './terrain-elevation.js';

export interface CompiledMapDocument {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly revision: number;
  readonly elevations: Int16Array;
  readonly surfaces: readonly MapSurfaceKind[];
  readonly features: readonly MapFeatureKind[];
  readonly blocked: readonly boolean[];
  readonly transitions: readonly TerrainTransition[];
}

export interface MapValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
  readonly tileX?: number;
  readonly tileY?: number;
}

export interface SemanticTerrainLayer {
  readonly role: MapTerrainRole | `contour.edge.${string}` | `contour.inset.${string}`
    | `contour.face.${string}.${RaisedTerrainFaceJoin}` | `crossing.${RaisedTerrainRampRole}`;
  readonly contourLevel: number;
  readonly blocksMovement: boolean;
  readonly blocksLight: boolean;
  readonly reason: string;
}

export interface SemanticTerrainTrace {
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly layers: readonly SemanticTerrainLayer[];
}

export function compileMapDocument(document: MapDocumentV2): CompiledMapDocument {
  const length = document.width * document.height;
  const elevations = new Int16Array(length);
  const surfaces: MapSurfaceKind[] = Array(length);
  const features: MapFeatureKind[] = Array(length);
  const blocked: boolean[] = Array(length);
  for (let tileY = 0; tileY < document.height; tileY += 1) {
    for (let tileX = 0; tileX < document.width; tileX += 1) {
      const index = tileY * document.width + tileX;
      const cell = resolvedMapCellAt(document, tileX, tileY);
      elevations[index] = cell.elevation;
      surfaces[index] = cell.surface;
      features[index] = cell.feature;
      const material = TERRAIN_MATERIAL_DEFINITIONS[cell.surface];
      const featureBlocks = cell.feature === 'river';
      blocked[index] = cell.collision === 'force_block'
        || (cell.collision !== 'force_walk' && (!material.walkable || featureBlocks));
    }
  }
  return {
    id: document.id,
    width: document.width,
    height: document.height,
    revision: document.revision,
    elevations,
    surfaces,
    features,
    blocked,
    transitions: document.transitions,
  };
}

export function compiledMapElevationAt(map: CompiledMapDocument, tileX: number, tileY: number): number {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) return 0;
  return map.elevations[tileY * map.width + tileX] ?? 0;
}

function rampRoleAt(
  transitions: readonly TerrainTransition[],
  contourLevel: number,
  tileX: number,
  tileY: number,
): RaisedTerrainRampRole | null {
  for (const transition of transitions) {
    if (transition.contourLevel !== contourLevel || transition.direction !== 'up') continue;
    const rightLane = transitions.some((candidate) => candidate.contourLevel === contourLevel
      && candidate.direction === 'up' && candidate.lowerTileX === transition.lowerTileX + 1
      && candidate.lowerTileY === transition.lowerTileY);
    if (transition.upperTileX === tileX && transition.upperTileY === tileY) {
      return rightLane ? 'ramp_top_left' : 'ramp_top_right';
    }
    if (transition.lowerTileX === tileX && transition.lowerTileY === tileY) {
      return rightLane ? 'ramp_bottom_left' : 'ramp_bottom_right';
    }
  }
  return null;
}

/** Asset-independent adapter around the shipped cliff resolver. Frame lookup
 * stays in the existing runtime theme while editor/debug consumers receive a
 * complete semantic WHY trace for the same topology result. */
export function semanticTerrainTraceAt(
  document: MapDocumentV2,
  tileX: number,
  tileY: number,
  compiled: CompiledMapDocument = compileMapDocument(document),
): SemanticTerrainTrace {
  let maximumElevation = 0;
  for (const elevation of compiled.elevations) maximumElevation = Math.max(maximumElevation, elevation);
  const cell = resolvedMapCellAt(document, tileX, tileY);
  const layers: SemanticTerrainLayer[] = [{
    role: `surface.${cell.surface}`,
    contourLevel: 0,
    blocksMovement: compiled.blocked[tileY * compiled.width + tileX] ?? true,
    blocksLight: TERRAIN_MATERIAL_DEFINITIONS[cell.surface].blocksLight,
    reason: `authored ${cell.surface} surface${cell.feature === 'none' ? '' : ` with ${cell.feature} feature`}`,
  }];
  if (cell.feature === 'path' || cell.feature === 'river') layers.push({
    role: `feature.${cell.feature}`,
    contourLevel: cell.elevation,
    blocksMovement: cell.feature === 'river',
    blocksLight: false,
    reason: `${cell.feature} overlay selected by the feature mask`,
  });
  const elevationAt = (x: number, y: number): number => compiledMapElevationAt(compiled, x, y);
  for (const { contourLevel, plan } of resolveRaisedTerrainContoursAt(
    elevationAt,
    maximumElevation,
    SURVIVAL_RAISED_CLIFF_TILE_SET,
    'tall',
    tileX,
    tileY,
    (level, x, y) => rampRoleAt(compiled.transitions, level, x, y),
  )) {
    if (plan.edgeRole !== null) layers.push({
      role: `contour.edge.${plan.edgeRole}`,
      contourLevel,
      blocksMovement: plan.blocksMovement,
      blocksLight: SURVIVAL_RAISED_CLIFF_TILE_SET.edgeBlocksLight ?? false,
      reason: `level ${contourLevel} cardinal occupancy selected ${plan.edgeRole}`,
    });
    for (const role of plan.insetRoles) layers.push({
      role: `contour.inset.${role}`,
      contourLevel,
      blocksMovement: false,
      blocksLight: false,
      reason: `level ${contourLevel} diagonal gap selected ${role}`,
    });
    for (const face of plan.faceLayers) layers.push({
      role: `contour.face.${face.rowId}.${face.join}`,
      contourLevel,
      blocksMovement: face.blocksMovement,
      blocksLight: face.blocksLight,
      reason: `${face.direct ? 'direct' : 'support'} south face row ${face.rowId}, ${face.join} join`,
    });
    if (plan.rampRole !== null) layers.push({
      role: `crossing.${plan.rampRole}`,
      contourLevel,
      blocksMovement: false,
      blocksLight: false,
      reason: `explicit level ${contourLevel} transition selected ${plan.rampRole}`,
    });
  }
  return { tileX, tileY, elevation: cell.elevation, layers };
}

export function mapCollisionAtPlane(
  compiled: CompiledMapDocument,
  tileX: number,
  tileY: number,
  activeElevation: number,
): 'open' | 'blocked' | 'transition' {
  if (tileX < 0 || tileY < 0 || tileX >= compiled.width || tileY >= compiled.height) return 'blocked';
  const index = tileY * compiled.width + tileX;
  if (compiled.blocked[index] ?? true) return 'blocked';
  if (compiled.transitions.some((transition) => (
    (transition.lowerTileX === tileX && transition.lowerTileY === tileY)
    || (transition.upperTileX === tileX && transition.upperTileY === tileY)
  ) && (transition.contourLevel === activeElevation || transition.contourLevel - 1 === activeElevation))) {
    return 'transition';
  }
  return (compiled.elevations[index] ?? 0) === activeElevation ? 'open' : 'blocked';
}

export function mapDependencyHalo(
  document: Pick<MapDocumentV2, 'width' | 'height'>,
  changed: readonly MapPoint[],
  radius = 3,
): readonly MapPoint[] {
  const points = new Map<string, MapPoint>();
  for (const point of changed) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const tileX = point.tileX + offsetX;
        const tileY = point.tileY + offsetY;
        if (tileX < 0 || tileY < 0 || tileX >= document.width || tileY >= document.height) continue;
        points.set(`${tileX},${tileY}`, { tileX, tileY });
      }
    }
  }
  return [...points.values()].sort((left, right) => left.tileY - right.tileY || left.tileX - right.tileX);
}

function themeCoverageIssues(theme: MapThemeManifest): MapValidationIssue[] {
  const required: readonly MapTerrainRole[] = [
    'surface.grass', 'contour.edge', 'contour.inset', 'contour.face', 'contour.face_foot', 'crossing.slope',
  ];
  return required.filter((role) => theme.roles[role] === undefined).map((role) => ({
    severity: 'error', code: 'theme_role_missing', message: `Theme ${theme.id} does not provide ${role}`,
  }));
}

export function validateMapDocument(
  document: MapDocumentV2,
  theme: MapThemeManifest = ORCHARD_STONE_THEME,
): readonly MapValidationIssue[] {
  const issues: MapValidationIssue[] = [...themeCoverageIssues(theme)];
  if (document.width <= 0 || document.height <= 0) {
    issues.push({ severity: 'error', code: 'dimensions_invalid', message: 'Map dimensions must be positive' });
  }
  for (const [key, cell] of Object.entries(document.cells)) {
    const [tileX, tileY] = key.split(',').map(Number);
    if (tileX === undefined || tileY === undefined || !mapCoordinateInBounds(document, tileX, tileY)) {
      issues.push({ severity: 'error', code: 'cell_out_of_bounds', message: `Cell ${key} is outside the map` });
      continue;
    }
    if (cell.elevation !== undefined && (!Number.isInteger(cell.elevation) || cell.elevation < 0)) {
      issues.push({ severity: 'error', code: 'elevation_invalid', message: 'Elevation must be a non-negative integer', tileX, tileY });
    }
    if (cell.surface !== undefined && !MAP_SURFACE_KINDS.includes(cell.surface)) {
      issues.push({ severity: 'error', code: 'surface_invalid', message: `Unknown surface ${String(cell.surface)}`, tileX, tileY });
    }
    if (cell.feature !== undefined && !MAP_FEATURE_KINDS.includes(cell.feature)) {
      issues.push({ severity: 'error', code: 'feature_invalid', message: `Unknown feature ${String(cell.feature)}`, tileX, tileY });
    }
    if (cell.collision !== undefined && !MAP_COLLISION_OVERRIDES.includes(cell.collision)) {
      issues.push({ severity: 'error', code: 'collision_invalid', message: `Unknown collision override ${String(cell.collision)}`, tileX, tileY });
    }
    if (cell.collision !== undefined && cell.collision !== 'inherit' && !cell.collisionReason?.trim()) {
      issues.push({ severity: 'error', code: 'collision_reason_missing', message: 'Collision overrides require a reason', tileX, tileY });
    }
  }
  for (const transition of document.transitions) {
    if (!terrainTransitionValid(transition)) {
      issues.push({ severity: 'error', code: 'transition_invalid', message: 'Transition endpoints/direction are invalid' });
      continue;
    }
    if (!mapCoordinateInBounds(document, transition.lowerTileX, transition.lowerTileY)
      || !mapCoordinateInBounds(document, transition.upperTileX, transition.upperTileY)) {
      issues.push({ severity: 'error', code: 'transition_out_of_bounds', message: 'Transition leaves the map' });
      continue;
    }
    const lower = resolvedMapCellAt(document, transition.lowerTileX, transition.lowerTileY).elevation;
    const upper = resolvedMapCellAt(document, transition.upperTileX, transition.upperTileY).elevation;
    if (lower !== transition.contourLevel - 1 || upper !== transition.contourLevel) {
      issues.push({
        severity: 'error', code: 'transition_height_mismatch',
        message: `Transition L${transition.contourLevel} joins elevations ${lower} and ${upper}`,
        tileX: transition.lowerTileX, tileY: transition.lowerTileY,
      });
    }
  }
  return issues;
}
