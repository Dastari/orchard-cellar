import {
  ORCHARD_STONE_THEME,
  MAP_COLLISION_OVERRIDES,
  MAP_FEATURE_KINDS,
  MAP_GAMEPLAY_ANCHOR_ELEVATION_MAXIMUM,
  MAP_GAMEPLAY_ANCHOR_ELEVATION_MINIMUM,
  MAP_GAMEPLAY_ANCHOR_KINDS,
  MAP_GAMEPLAY_ANCHOR_LABEL_MAX_LENGTH,
  MAP_SURFACE_KINDS,
  TERRAIN_MATERIAL_DEFINITIONS,
  mapCoordinateInBounds,
  mapDocumentUsesSurvivalIslandBase,
  mapGameplayAnchorIdValid,
  mapGameplayAnchorKindRequiresLabel,
  resolvedMapCellAt,
  type MapDocumentV2,
  type MapFeatureKind,
  type MapSurfaceKind,
  type MapTerrainRole,
  type MapThemeManifest,
  type ResolvedMapCell,
  type TerrainOverride,
} from './map-document.js';
import type { MapPoint } from './map-editing.js';
import {
  resolveRaisedTerrainContoursAt,
  raisedTerrainProjectionRowsPerLevel,
  type RaisedTerrainFaceJoin,
  type RaisedTerrainRampRole,
  type RaisedTerrainRole,
} from './raised-terrain-autotile.js';
import {
  TERRAIN_SURFACE_FAMILY_IDS,
  surfaceFamilyIndex,
  terrainCliffTileSet,
  type CliffFamilyId,
} from './terrain-tilesets.js';
import {
  terrainTransitionCapability,
  type RuntimeTilesetResolver,
} from './terrain/tileset-registry.js';
import { validateExactTerrainOverride } from './terrain/terrain-override-validation.js';
import {
  expandStairRun,
  retainMinimumTerrainFootprint,
  terrainTransitionLaneAt,
  stairRunValid,
  terrainTransitionValid,
  type TerrainTransition,
} from './terrain-elevation.js';
import type { CollisionMap } from './state.js';
import {
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_WORLD_VERSION,
} from './survival-world.js';

export interface CompiledMapDocument {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly revision: number;
  readonly baseElevation: number;
  readonly defaultCliffFamily: string;
  readonly cliffFamilyIds: readonly string[];
  readonly tilesets?: RuntimeTilesetResolver;
  readonly elevations: Int16Array;
  readonly cliffFamilies: Uint8Array;
  readonly surfaceFamilies: Uint8Array;
  readonly terrainOverrides: readonly (TerrainOverride | null)[];
  readonly ledges: Uint8Array;
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
    | `contour.face.${string}.${RaisedTerrainFaceJoin}` | `crossing.${RaisedTerrainRampRole}`
    | `contour.override.${string}`;
  readonly contourLevel: number;
  readonly blocksMovement: boolean;
  readonly blocksLight: boolean;
  readonly reason: string;
  readonly frameIndex?: number;
  readonly family: string;
}

export interface SemanticTerrainTrace {
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly layers: readonly SemanticTerrainLayer[];
}

const compiledElevationRangeCache = new WeakMap<
  CompiledMapDocument,
  { readonly minimum: number; readonly maximum: number }
>();

function compiledElevationRange(
  compiled: CompiledMapDocument,
): { readonly minimum: number; readonly maximum: number } {
  const cached = compiledElevationRangeCache.get(compiled);
  if (cached !== undefined) return cached;
  let minimum = compiled.baseElevation;
  let maximum = compiled.baseElevation;
  for (const elevation of compiled.elevations) {
    minimum = Math.min(minimum, elevation);
    maximum = Math.max(maximum, elevation);
  }
  const range = { minimum, maximum };
  compiledElevationRangeCache.set(compiled, range);
  return range;
}

export function compileMapDocument(document: MapDocumentV2, tilesets?: RuntimeTilesetResolver): CompiledMapDocument {
  const length = document.width * document.height;
  const elevations = new Int16Array(length);
  const cliffFamilies = new Uint8Array(length);
  const surfaceFamilies = new Uint8Array(length);
  const terrainOverrides: (TerrainOverride | null)[] = Array(length).fill(null);
  const ledges = new Uint8Array(length);
  const surfaces: MapSurfaceKind[] = Array(length);
  const features: MapFeatureKind[] = Array(length);
  const blocked: boolean[] = Array(length);
  const defaultCliffFamily = document.defaultCliffFamily ?? 'stone_1';
  const cliffFamilyIds = [...new Set([defaultCliffFamily, ...Object.values(document.cells).flatMap((cell) => [
    ...(cell.cliffFamily === undefined ? [] : [cell.cliffFamily]),
    ...(cell.terrainOverride?.family === undefined ? [] : [cell.terrainOverride.family]),
  ])])];
  if (cliffFamilyIds.length > 255) throw new Error('Map uses more than 255 cliff families');
  for (let tileY = 0; tileY < document.height; tileY += 1) {
    for (let tileX = 0; tileX < document.width; tileX += 1) {
      const index = tileY * document.width + tileX;
      const cell = resolvedMapCellAt(document, tileX, tileY);
      elevations[index] = cell.elevation;
      cliffFamilies[index] = cliffFamilyIds.indexOf(cell.cliffFamily) + 1;
      surfaceFamilies[index] = surfaceFamilyIndex(cell.surfaceFamily);
      terrainOverrides[index] = cell.terrainOverride;
      ledges[index] = Number(cell.ledge);
      surfaces[index] = cell.surface;
      features[index] = cell.feature;
      const material = TERRAIN_MATERIAL_DEFINITIONS[cell.surface];
      const featureBlocks = cell.feature === 'river';
      blocked[index] = cell.collision === 'force_block'
        || (cell.collision !== 'force_walk' && (cell.ledge || !material.walkable || featureBlocks));
    }
  }
  const transitions = [
    ...document.transitions,
    ...(document.stairRuns ?? []).flatMap((run) => stairRunValid(run) ? expandStairRun(run) : []),
  ];
  const compiled = {
    id: document.id,
    width: document.width,
    height: document.height,
    revision: document.revision,
    baseElevation: document.baseElevation,
    defaultCliffFamily,
    cliffFamilyIds,
    ...(tilesets === undefined ? {} : { tilesets }),
    elevations,
    cliffFamilies,
    surfaceFamilies,
    terrainOverrides,
    ledges,
    surfaces,
    features,
    blocked,
    transitions,
  };
  compiledElevationRangeCache.set(compiled, compiledElevationRange(compiled));
  return compiled;
}

export function compiledMapElevationAt(map: CompiledMapDocument, tileX: number, tileY: number): number {
  if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
    const tileSet = map.tilesets?.tileSetFor(map.defaultCliffFamily) ?? terrainCliffTileSet(map.defaultCliffFamily);
    return tileSet?.baseDatum ?? 0;
  }
  return map.elevations[tileY * map.width + tileX] ?? 0;
}

function rampRoleAt(
  transitions: readonly TerrainTransition[],
  contourLevel: number,
  tileX: number,
  tileY: number,
): RaisedTerrainRampRole | null {
  const lane = terrainTransitionLaneAt(transitions, contourLevel, tileX, tileY);
  if (lane === null) return null;
  return `ramp_${lane.endpoint === 'upper' ? 'top' : 'bottom'}_${lane.position}`;
}

/** Asset-independent adapter around the shipped cliff resolver. Frame lookup
 * stays in the existing runtime theme while editor/debug consumers receive a
 * complete semantic WHY trace for the same topology result. */
export function semanticTerrainTraceAt(
  document: MapDocumentV2,
  tileX: number,
  tileY: number,
  compiled: CompiledMapDocument = compileMapDocument(document),
  applyTerrainOverride = true,
  knownElevationRange?: { readonly minimum: number; readonly maximum: number },
  knownCell?: ResolvedMapCell,
): SemanticTerrainTrace {
  const family = cellFamilyAt(compiled, tileX, tileY);
  const tileSet = compiled.tilesets?.tileSetFor(family) ?? terrainCliffTileSet(family)
    ?? compiled.tilesets?.tileSetFor(compiled.defaultCliffFamily) ?? terrainCliffTileSet(compiled.defaultCliffFamily);
  if (tileSet === null) throw new Error(`Unavailable terrain cliff family: ${family}`);
  const baseDatum = tileSet.baseDatum ?? document.baseElevation;
  const range = knownElevationRange ?? compiledElevationRange(compiled);
  const minimumElevation = Math.min(baseDatum, range.minimum);
  const maximumElevation = Math.max(baseDatum, range.maximum);
  const cell = knownCell ?? resolvedMapCellAt(document, tileX, tileY);
  const layers: SemanticTerrainLayer[] = [{
    role: `surface.${cell.surface}`,
    contourLevel: 0,
    blocksMovement: compiled.blocked[tileY * compiled.width + tileX] ?? true,
    blocksLight: TERRAIN_MATERIAL_DEFINITIONS[cell.surface].blocksLight,
    reason: `authored ${cell.surface} surface${cell.feature === 'none' ? '' : ` with ${cell.feature} feature`}`,
    family,
  }];
  if (cell.feature === 'path' || cell.feature === 'river') layers.push({
    role: `feature.${cell.feature}`,
    contourLevel: cell.elevation,
    blocksMovement: cell.feature === 'river',
    blocksLight: false,
    reason: `${cell.feature} overlay selected by the feature mask`,
    family,
  });
  const elevationAt = (x: number, y: number): number => compiledMapElevationAt(compiled, x, y);
  for (const { contourLevel, plan } of resolveRaisedTerrainContoursAt(
    elevationAt,
    maximumElevation,
    tileSet,
    'tall',
    tileX,
    tileY,
    (level, x, y) => rampRoleAt(compiled.transitions, level, x, y),
    minimumElevation + 1,
  )) {
    if (plan.edgeRole !== null) layers.push({
      role: `contour.edge.${plan.edgeRole}`,
      contourLevel,
      blocksMovement: plan.blocksMovement,
      blocksLight: tileSet.edgeBlocksLight ?? false,
      reason: `level ${contourLevel} cardinal occupancy selected ${plan.edgeRole}`,
      ...(plan.edgeFrame === null ? {} : { frameIndex: plan.edgeFrame }),
      family,
    });
    for (const role of plan.insetRoles) layers.push({
      role: `contour.inset.${role}`,
      contourLevel,
      blocksMovement: false,
      blocksLight: false,
      reason: `level ${contourLevel} diagonal gap selected ${role}`,
      ...(plan.insetFrames[plan.insetRoles.indexOf(role)] === undefined
        ? {} : { frameIndex: plan.insetFrames[plan.insetRoles.indexOf(role)]! }),
      family,
    });
    for (const face of plan.faceLayers) layers.push({
      role: `contour.face.${face.rowId}.${face.join}`,
      contourLevel,
      blocksMovement: face.blocksMovement,
      blocksLight: face.blocksLight,
      reason: `${face.direct ? 'direct' : 'support'} south face row ${face.rowId}, ${face.join} join`,
      frameIndex: face.frame,
      family,
    });
    if (plan.rampRole !== null) layers.push({
      role: `crossing.${plan.rampRole}`,
      contourLevel,
      blocksMovement: false,
      blocksLight: false,
      reason: `explicit level ${contourLevel} transition selected ${plan.rampRole}`,
      ...(plan.rampFrame === null ? {} : { frameIndex: plan.rampFrame }),
      family,
    });
  }
  const terrainOverride = cell.terrainOverride;
  if (applyTerrainOverride && terrainOverride !== null) {
    const overrideFamily = terrainOverride.family ?? family;
    const contourLayers = layers.filter((layer) => (
      layer.contourLevel === terrainOverride.contourLevel
      && (layer.role.startsWith('contour.') || layer.role.startsWith('crossing.'))
    ));
    const expectedRole = terrainOverride.role === undefined ? undefined
      : semanticLayerRoleForOverride(terrainOverride.role, contourLayers);
    const target = expectedRole === undefined
      ? contourLayers[contourLayers.length - 1]
      : contourLayers.find((layer) => layer.role === expectedRole);
    if (target !== undefined) {
      const index = layers.indexOf(target);
      layers[index] = {
        ...target,
        ...(terrainOverride.role === undefined ? {} : { role: `contour.override.${terrainOverride.role}` }),
        ...(terrainOverride.frameIndex === undefined ? {} : { frameIndex: terrainOverride.frameIndex }),
        family: overrideFamily,
        reason: `${target.reason}; final authored terrain override applied`,
      };
    }
  }
  return { tileX, tileY, elevation: cell.elevation, layers };
}

function semanticLayerRoleForOverride(
  role: NonNullable<TerrainOverride['role']>,
  contourLayers: readonly SemanticTerrainLayer[],
): SemanticTerrainLayer['role'] {
  if (role.startsWith('face.')) return `contour.${role}` as SemanticTerrainLayer['role'];
  if (role.startsWith('ramp_')) return `crossing.${role}` as SemanticTerrainLayer['role'];
  return contourLayers.some((layer) => layer.role === `contour.edge.${role}`)
    ? `contour.edge.${role}`
    : `contour.inset.${role}`;
}

function terrainOverrideRoleForLayer(
  role: SemanticTerrainLayer['role'],
): RaisedTerrainRole | null {
  if (role.startsWith('contour.edge.')) return role.slice('contour.edge.'.length) as RaisedTerrainRole;
  if (role.startsWith('contour.inset.')) return role.slice('contour.inset.'.length) as RaisedTerrainRole;
  if (role.startsWith('contour.face.')) return role.slice('contour.'.length) as RaisedTerrainRole;
  if (role.startsWith('crossing.ramp_')) return role.slice('crossing.'.length) as RaisedTerrainRole;
  return null;
}

/** Matches the renderer's legacy frame-only substitution precedence. New
 * authoring should always persist a semantic role, but old documents remain
 * valid when their target can still be inferred exactly. */
function implicitTerrainOverrideRole(
  contourLayers: readonly SemanticTerrainLayer[],
): RaisedTerrainRole | null {
  const matching = (prefix: string): RaisedTerrainRole | null => {
    const layer = [...contourLayers].reverse().find((candidate) => candidate.role.startsWith(prefix));
    return layer === undefined ? null : terrainOverrideRoleForLayer(layer.role);
  };
  return matching('crossing.ramp_')
    ?? matching('contour.inset.')
    ?? matching('contour.edge.')
    ?? matching('contour.face.');
}

export function cellFamilyAt(
  compiled: CompiledMapDocument,
  tileX: number,
  tileY: number,
): string {
  if (tileX < 0 || tileY < 0 || tileX >= compiled.width || tileY >= compiled.height) {
    return compiled.defaultCliffFamily;
  }
  const index = compiled.cliffFamilies[tileY * compiled.width + tileX] ?? 0;
  return index === 0 ? compiled.defaultCliffFamily
    : compiled.cliffFamilyIds[index - 1] ?? compiled.defaultCliffFamily;
}

/** Builds plane-indexed physical cliff geometry for an authored map. Unlike
 * the legacy island/cellar producers, the first slice is the document's true
 * signed minimum elevation, so pits and peaks share one collision contract. */
export function compiledMapTerrainPlaneCollisionBytes(
  compiled: CompiledMapDocument,
  projection?: {readonly baseDatum: number},
): Uint8Array {
  const stride = compiled.width * compiled.height;
  const { minimum, maximum } = compiledElevationRange(compiled);
  const blocked = new Uint8Array((maximum - minimum + 1) * stride);
  const elevationAt = (x: number, y: number): number => compiledMapElevationAt(compiled, x, y);
  const contractTileSet = compiled.tilesets?.tileSetFor(compiled.defaultCliffFamily)
    ?? terrainCliffTileSet(compiled.defaultCliffFamily);
  const projectedRows = contractTileSet === null ? 0
    : raisedTerrainProjectionRowsPerLevel(contractTileSet);
  const baseDatum = projection?.baseDatum ?? contractTileSet?.baseDatum ?? compiled.baseElevation;
  for (let tileY = 0; tileY < compiled.height; tileY += 1) {
    for (let tileX = 0; tileX < compiled.width; tileX += 1) {
      const family = cellFamilyAt(compiled, tileX, tileY);
      const tileSet = compiled.tilesets?.tileSetFor(family) ?? terrainCliffTileSet(family)
        ?? compiled.tilesets?.tileSetFor(compiled.defaultCliffFamily) ?? terrainCliffTileSet(compiled.defaultCliffFamily);
      if (tileSet === null) continue;
      for (const { contourLevel, plan } of resolveRaisedTerrainContoursAt(
        elevationAt,
        maximum,
        tileSet,
        'tall',
        tileX,
        tileY,
        (level, x, y) => rampRoleAt(compiled.transitions, level, x, y),
        minimum + 1,
      )) {
        const tileIndex = tileY * compiled.width + tileX;
        const capPlane = contourLevel - minimum;
        if (plan.rampFrame === null
          && (plan.edgeFrame !== null || plan.insetFrames.length > 0)) {
          blocked[capPlane * stride + tileIndex] = 1;
        }
        if (!plan.faceLayers.some((face) => face.direct && face.blocksMovement)) continue;
        const projectedTileY = tileY - (contourLevel - baseDatum) * projectedRows;
        const facePlane = contourLevel - 1 - minimum;
        if (projectedTileY >= 0 && projectedTileY < compiled.height && facePlane >= 0) {
          blocked[facePlane * stride + projectedTileY * compiled.width + tileX] = 1;
        }
      }
    }
  }
  // Crossings are authored doorways through both adjacent plane guards.
  for (const transition of compiled.transitions) {
    if (transition.kind !== 'slope' && transition.kind !== 'stairs') continue;
    for (const [tileX, tileY, plane] of [
      [transition.lowerTileX, transition.lowerTileY, transition.contourLevel - 1],
      [transition.upperTileX, transition.upperTileY, transition.contourLevel],
    ] as const) {
      if (tileX < 0 || tileY < 0 || tileX >= compiled.width || tileY >= compiled.height) continue;
      const planeIndex = plane - minimum;
      if (planeIndex >= 0 && planeIndex <= maximum - minimum) {
        blocked[planeIndex * stride + tileY * compiled.width + tileX] = 0;
      }
    }
  }
  return blocked;
}

export function terrainPlaneCollisionBytesForElevationGrid(
  width: number,
  height: number,
  elevations: Int16Array,
  transitions: readonly TerrainTransition[],
  defaultCliffFamily: CliffFamilyId,
  projection?: {readonly baseDatum: number},
): Uint8Array {
  if (elevations.length !== width * height) {
    throw new Error(`Terrain elevation field has ${elevations.length} cells; expected ${width * height}`);
  }
  return compiledMapTerrainPlaneCollisionBytes({
    id: 'elevation-grid',
    width,
    height,
    revision: 0,
    baseElevation: terrainCliffTileSet(defaultCliffFamily)?.baseDatum ?? 0,
    defaultCliffFamily,
    cliffFamilyIds: [defaultCliffFamily],
    elevations,
    cliffFamilies: new Uint8Array(width * height),
    surfaceFamilies: new Uint8Array(width * height),
    terrainOverrides: Array(width * height).fill(null),
    ledges: new Uint8Array(width * height),
    surfaces: Array(width * height).fill('stone'),
    features: Array(width * height).fill('none'),
    blocked: Array<boolean>(width * height).fill(false),
    transitions,
  }, projection);
}

export function collisionMapForCompiledMapDocument(
  compiled: CompiledMapDocument,
): CollisionMap {
  let minimum = compiled.baseElevation;
  for (const elevation of compiled.elevations) minimum = Math.min(minimum, elevation);
  return {
    width: compiled.width,
    height: compiled.height,
    blocked: compiled.blocked,
    elevations: compiled.elevations,
    terrainTransitions: compiled.transitions,
    terrainPlaneBlocked: compiledMapTerrainPlaneCollisionBytes(compiled),
    terrainMinimumElevation: minimum,
    horseJumpableTerrain: Array<boolean>(compiled.width * compiled.height).fill(false),
    obstacles: [],
  };
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
    (transition.kind === 'slope' || transition.kind === 'stairs')
    && ((transition.lowerTileX === tileX && transition.lowerTileY === tileY)
    || (transition.upperTileX === tileX && transition.upperTileY === tileY))
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

const LEGACY_LIVE_ISLAND_STAIR_TRANSITIONS = new Set([
  '1:474:408:474:407',
  '1:475:408:475:407',
  '2:474:407:474:406',
  '2:475:407:475:406',
  '3:474:406:474:405',
  '3:475:406:475:405',
]);

function legacyLiveIslandStairCompatibility(
  document: MapDocumentV2,
  transition: TerrainTransition,
  width: number,
): boolean {
  if (document.id !== 'live-island'
    || document.width !== SURVIVAL_WORLD_SIZE
    || document.height !== SURVIVAL_WORLD_SIZE
    || !mapDocumentUsesSurvivalIslandBase(document)
    || document.provenance.generatorSeed !== SURVIVAL_WORLD_SEED
    || document.provenance.generatorVersion !== SURVIVAL_WORLD_VERSION
    || document.defaultCliffFamily !== 'stone_1'
    || transition.kind !== 'stairs'
    || transition.direction !== 'up'
    || width !== 2
    || resolvedMapCellAt(document, transition.lowerTileX, transition.lowerTileY).cliffFamily !== 'stone_1'
    || resolvedMapCellAt(document, transition.upperTileX, transition.upperTileY).cliffFamily !== 'stone_1') return false;
  return LEGACY_LIVE_ISLAND_STAIR_TRANSITIONS.has([
    transition.contourLevel,
    transition.lowerTileX,
    transition.lowerTileY,
    transition.upperTileX,
    transition.upperTileY,
  ].join(':'));
}

export function validateMapDocument(
  document: MapDocumentV2,
  theme: MapThemeManifest = ORCHARD_STONE_THEME,
  tilesets?: RuntimeTilesetResolver,
): readonly MapValidationIssue[] {
  const issues: MapValidationIssue[] = [...themeCoverageIssues(theme)];
  const compiled = compileMapDocument(document, tilesets);
  if (document.width <= 0 || document.height <= 0) {
    issues.push({ severity: 'error', code: 'dimensions_invalid', message: 'Map dimensions must be positive' });
  }
  if (!TERRAIN_SURFACE_FAMILY_IDS.includes(document.defaultSurfaceFamily ?? 'grass_1')) {
    issues.push({
      severity: 'error', code: 'default_surface_family_invalid',
      message: `Surface family ${String(document.defaultSurfaceFamily)} is not registered`,
    });
  }
  const anchorIds = new Set<string>();
  for (const anchor of document.anchors) {
    if (!mapGameplayAnchorIdValid(anchor.id)) {
      issues.push({ severity: 'error', code: 'anchor_id_invalid', message: `Anchor id ${anchor.id} is invalid` });
    } else if (anchorIds.has(anchor.id)) {
      issues.push({ severity: 'error', code: 'anchor_duplicate', message: `Anchor id ${anchor.id} is duplicated` });
    }
    anchorIds.add(anchor.id);
    if (!MAP_GAMEPLAY_ANCHOR_KINDS.includes(anchor.kind)) {
      issues.push({ severity: 'error', code: 'anchor_kind_invalid', message: `Anchor ${anchor.id} has an unknown kind` });
    }
    const inBounds = mapCoordinateInBounds(document, anchor.tileX, anchor.tileY);
    if (!inBounds) {
      issues.push({
        severity: 'error', code: 'anchor_out_of_bounds', message: `Anchor ${anchor.id} is outside the map`,
        tileX: anchor.tileX, tileY: anchor.tileY,
      });
    }
    const elevationValid = Number.isInteger(anchor.elevation)
      && anchor.elevation >= MAP_GAMEPLAY_ANCHOR_ELEVATION_MINIMUM
      && anchor.elevation <= MAP_GAMEPLAY_ANCHOR_ELEVATION_MAXIMUM;
    if (!elevationValid) {
      issues.push({
        severity: 'error', code: 'anchor_elevation_invalid',
        message: `Anchor ${anchor.id} elevation must be a bounded integer`,
        tileX: anchor.tileX, tileY: anchor.tileY,
      });
    }
    const label = anchor.label?.trim();
    if ((anchor.label !== undefined && (label === undefined || label.length < 1
      || label.length > MAP_GAMEPLAY_ANCHOR_LABEL_MAX_LENGTH))
      || (MAP_GAMEPLAY_ANCHOR_KINDS.includes(anchor.kind)
        && mapGameplayAnchorKindRequiresLabel(anchor.kind) && label === undefined)) {
      issues.push({
        severity: 'error', code: 'anchor_label_invalid',
        message: `Anchor ${anchor.id} requires a valid bounded label`,
        tileX: anchor.tileX, tileY: anchor.tileY,
      });
    }
    if (inBounds && elevationValid
      && resolvedMapCellAt(document, anchor.tileX, anchor.tileY).elevation !== anchor.elevation) {
      issues.push({
        severity: 'error', code: 'anchor_height_mismatch',
        message: `Anchor ${anchor.id} elevation does not match terrain`,
        tileX: anchor.tileX, tileY: anchor.tileY,
      });
    }
  }
  if ((tilesets?.tileSetFor(document.defaultCliffFamily ?? 'stone_1')
    ?? terrainCliffTileSet(document.defaultCliffFamily ?? 'stone_1')) === null) {
    issues.push({
      severity: 'error', code: 'default_cliff_family_unavailable',
      message: `Cliff family ${document.defaultCliffFamily ?? 'stone_1'} has no source art`,
    });
  }
  let minimumElevation = document.baseElevation;
  let maximumElevation = document.baseElevation;
  for (const elevation of compiled.elevations) {
    minimumElevation = Math.min(minimumElevation, elevation);
    maximumElevation = Math.max(maximumElevation, elevation);
  }
  const validateFootprint = (level: number, excavated: boolean): void => {
    const contour = Uint8Array.from(compiled.elevations, (elevation) => Number(
      excavated ? elevation <= level : elevation >= level,
    ));
    const retained = retainMinimumTerrainFootprint(contour, document.width, document.height);
    const invalid = contour.findIndex((cell, index) => cell === 1 && retained[index] === 0);
    if (invalid < 0) return;
    issues.push({
      severity: 'warning', code: 'terrain_footprint_too_small',
      message: `Contour L${level} contains terrain narrower than the 2x2 minimum`,
      tileX: invalid % document.width,
      tileY: Math.floor(invalid / document.width),
    });
  };
  for (let level = document.baseElevation + 1; level <= maximumElevation; level += 1) {
    validateFootprint(level, false);
  }
  for (let level = document.baseElevation - 1; level >= minimumElevation; level -= 1) {
    validateFootprint(level, true);
  }
  for (const [key, cell] of Object.entries(document.cells)) {
    const [tileX, tileY] = key.split(',').map(Number);
    if (tileX === undefined || tileY === undefined || !mapCoordinateInBounds(document, tileX, tileY)) {
      issues.push({ severity: 'error', code: 'cell_out_of_bounds', message: `Cell ${key} is outside the map` });
      continue;
    }
    if (cell.elevation !== undefined && !Number.isInteger(cell.elevation)) {
      issues.push({ severity: 'error', code: 'elevation_invalid', message: 'Elevation must be an integer', tileX, tileY });
    }
    if (cell.surface !== undefined && !MAP_SURFACE_KINDS.includes(cell.surface)) {
      issues.push({ severity: 'error', code: 'surface_invalid', message: `Unknown surface ${String(cell.surface)}`, tileX, tileY });
    }
    if (cell.surfaceFamily !== undefined && !TERRAIN_SURFACE_FAMILY_IDS.includes(cell.surfaceFamily)) {
      issues.push({
        severity: 'error', code: 'surface_family_invalid',
        message: `Surface family ${String(cell.surfaceFamily)} is not registered`, tileX, tileY,
      });
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
    if (cell.cliffFamily !== undefined && (tilesets?.tileSetFor(cell.cliffFamily)
      ?? terrainCliffTileSet(cell.cliffFamily)) === null) {
      issues.push({ severity: 'error', code: 'cliff_family_unavailable', message: `Cliff family ${cell.cliffFamily} has no source art`, tileX, tileY });
    }
    const rawTerrainOverride: unknown = cell.terrainOverride;
    if (rawTerrainOverride !== undefined
      && (typeof rawTerrainOverride !== 'object' || rawTerrainOverride === null
        || Array.isArray(rawTerrainOverride))) {
      issues.push({
        severity: 'error', code: 'terrain_override_invalid',
        message: 'Terrain override must be an object', tileX, tileY,
      });
    }
    const terrainOverride = typeof rawTerrainOverride === 'object' && rawTerrainOverride !== null
      && !Array.isArray(rawTerrainOverride) ? rawTerrainOverride as TerrainOverride : null;
    if (terrainOverride !== null
      && !Number.isInteger(terrainOverride.contourLevel)) {
      issues.push({
        severity: 'error', code: 'terrain_override_contour_invalid',
        message: 'Terrain override contour level must be an integer', tileX, tileY,
      });
    }
    if (terrainOverride !== null && Number.isInteger(terrainOverride.contourLevel)) {
      const override = terrainOverride;
      const cellFamily = resolvedMapCellAt(document, tileX, tileY).cliffFamily;
      const baseTileSet = tilesets?.tileSetFor(cellFamily) ?? terrainCliffTileSet(cellFamily);
      const contourLayers = baseTileSet === null ? []
        : semanticTerrainTraceAt(document, tileX, tileY, compiled, false).layers
          .filter((layer) => layer.contourLevel === override.contourLevel);
      const rawRole: unknown = override.role;
      const declaredRole = typeof rawRole === 'string' ? rawRole as RaisedTerrainRole : null;
      const expected = declaredRole === null ? null
        : semanticLayerRoleForOverride(declaredRole, contourLayers);
      const topologyMatches = declaredRole === null
        ? contourLayers.length > 0
        : contourLayers.some((layer) => layer.role === expected);
      const targetRole = declaredRole ?? implicitTerrainOverrideRole(contourLayers);
      if (!topologyMatches || targetRole === null) {
        issues.push({
          severity: 'error', code: 'terrain_override_topology_mismatch',
          message: `Override ${declaredRole ?? 'frame'} at L${override.contourLevel} does not match derived topology`, tileX, tileY,
        });
      }
      const rawFamily: unknown = override.family;
      const overrideFamily = typeof rawFamily === 'string' ? rawFamily : cellFamily;
      const overrideTileSet = typeof rawFamily === 'string' || rawFamily === undefined
        ? tilesets?.tileSetFor(overrideFamily) ?? terrainCliffTileSet(overrideFamily)
        : null;
      for (const finding of validateExactTerrainOverride(
        override,
        overrideFamily,
        overrideTileSet,
        targetRole,
      )) {
        issues.push({ severity: 'error', ...finding, tileX, tileY });
      }
    }
  }
  for (const run of document.stairRuns ?? []) {
    if (!stairRunValid(run)) {
      issues.push({ severity: 'error', code: 'stair_run_invalid', message: 'Stair run levels or direction are invalid', tileX: run.x, tileY: run.y });
      continue;
    }
    for (const transition of expandStairRun(run)) {
      if (!mapCoordinateInBounds(document, transition.lowerTileX, transition.lowerTileY)
        || !mapCoordinateInBounds(document, transition.upperTileX, transition.upperTileY)) {
        issues.push({ severity: 'error', code: 'stair_run_out_of_bounds', message: 'Stair run leaves the map', tileX: run.x, tileY: run.y });
        break;
      }
      const lower = resolvedMapCellAt(document, transition.lowerTileX, transition.lowerTileY).elevation;
      const upper = resolvedMapCellAt(document, transition.upperTileX, transition.upperTileY).elevation;
      if (lower !== transition.contourLevel - 1 || upper !== transition.contourLevel) {
        issues.push({
          severity: 'error', code: 'stair_run_height_mismatch',
          message: `Stair run course L${transition.contourLevel} joins elevations ${lower} and ${upper}`,
          tileX: transition.lowerTileX, tileY: transition.lowerTileY,
        });
        break;
      }
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
  const reportedTransitionCapabilities = new Set<string>();
  for (const transition of compiled.transitions) {
    if (!terrainTransitionValid(transition)
      || !mapCoordinateInBounds(document, transition.lowerTileX, transition.lowerTileY)
      || !mapCoordinateInBounds(document, transition.upperTileX, transition.upperTileY)) continue;
    const lower = resolvedMapCellAt(document, transition.lowerTileX, transition.lowerTileY).elevation;
    const upper = resolvedMapCellAt(document, transition.upperTileX, transition.upperTileY).elevation;
    if (lower !== transition.contourLevel - 1 || upper !== transition.contourLevel) continue;
    const lane = terrainTransitionLaneAt(
      compiled.transitions,
      transition.contourLevel,
      transition.lowerTileX,
      transition.lowerTileY,
    );
    const families = new Set([
      cellFamilyAt(compiled, transition.lowerTileX, transition.lowerTileY),
      cellFamilyAt(compiled, transition.upperTileX, transition.upperTileY),
    ]);
    const width = lane?.width ?? 1;
    const legacySlopeArtAvailable = [...families].every((familyId) => terrainTransitionCapability({
      kind: 'slope',
      direction: 'up',
      familyId,
      width,
      ...(tilesets === undefined ? {} : { tilesets }),
    }).supported);
    if (legacySlopeArtAvailable
      && legacyLiveIslandStairCompatibility(document, transition, width)) {
      const findingKey = 'transition_legacy_generated_stair_compatibility';
      if (!reportedTransitionCapabilities.has(findingKey)) {
        reportedTransitionCapabilities.add(findingKey);
        issues.push({
          severity: 'warning',
          code: findingKey,
          message: 'Pinned live-island generator stairs retain their legacy slope-bank rendering compatibility.',
          tileX: transition.lowerTileX,
          tileY: transition.lowerTileY,
        });
      }
      continue;
    }
    for (const familyId of families) {
      const capability = terrainTransitionCapability({
        kind: transition.kind,
        direction: transition.direction,
        familyId,
        width,
        ...(tilesets === undefined ? {} : { tilesets }),
      });
      if (capability.supported) continue;
      const findingKey = `${capability.code}:${transition.kind}:${transition.direction}:${familyId}`;
      if (reportedTransitionCapabilities.has(findingKey)) continue;
      reportedTransitionCapabilities.add(findingKey);
      issues.push({
        severity: 'error',
        code: capability.code,
        message: capability.message,
        tileX: transition.lowerTileX,
        tileY: transition.lowerTileY,
      });
    }
  }
  return issues;
}
