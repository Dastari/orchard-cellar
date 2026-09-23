import {mapEditorObjectOccupiedCells} from './connected-object-footprint.js';
import {mapMaterialChoices} from './material-palette.js';
import { exactTilePaletteChoices } from './exact-tile-palette.js';
import {
  FIXED_UNITS_PER_PIXEL, smartConnectedObjectPrefabs, connectedObjectFamily, smartObjectPresentationPrefabs, mapPrefabPresentationFamily,
  MAP_BIOME_IDS,
  SURVIVAL_WORLD_SEED,
  TERRAIN_ELEVATION_LIMIT,
  TILE_SIZE_PIXELS,
  authoredMapContentPainterTie,
  expandStairRun,
  placeableObjectDefinition,
  type ContentRegistry,
  type PlaceableContentReference,
  homesteadBuildFootprintTiles,
  mapDocumentUsesSurvivalIslandBase,
  mapCellKey,
  minimumTerrainBrushPoints,
  isChoppableTreeKind,
  MANUAL_OBJECT_CONNECTION_TAG,
  cellPartForTerrainAsset,
  contourOverrideFromCellParts,
  exactAppearanceParts,
  resolvedMapBiomeAt,
  resolvedMapCellAt,
  stairRunValid,
  survivalElevationBytes,
  terrainDocumentForMapV3,
  type CellPart,
  type CellPartSlot,
  type MapBiomeId,
  type MapCellPatch,
  type MapDocumentV3,
  type MapEditCommand,
  type MapGameplayAnchor,
  type MapPoint,
  rasterMapLine,
  type MapContentLayerId,
  type MapLandmarkInstance,
  type MapObjectInstance,
  type MapObjectLayer,
  type MapPrefabDocumentV2,
  type ResolvedMapCell,
  type TerrainSurfaceFamilyId,
  type Direction,
  type AdminJsonObject,
} from '@orchard/sim';
import { overworldPoiDecorationDepthY } from '@orchard/engine';
import type { TerrainArray } from '@orchard/engine/terrain';
import type { UiPoint, UiRect } from '@orchard/ui/studio';
import type { StudioLiveRows } from '../../shell/outliners.js';
import {
  EDITOR_ABSOLUTE_MIN_ZOOM,
  EDITOR_MAX_ZOOM,
  editorClampMapCamera,
  editorFrameMapCamera,
  editorMinimumZoomForMap,
  editorWorldZoomAfterWheel,
} from './editor-viewport.js';
import { editorTerrainHitOnPlane, topmostEditorTerrainHit } from './editor-picking.js';
import type { MapEditorModel, MapLayerReorderDirection } from './model.js';
import { mapPrefabSuggestedLayer, mapContextPrefabPalette } from './context-palette.js';
import {
  MAP_TERRAIN_AUTHORING_MODES,
  OFFLINE_TERRAIN_AUTHORING_PALETTE,
  exactTerrainOverrideChoicesAt,
  terrainCliffFamilyChoices,
  terrainSurfaceFamilyChoices,
  type ExactTerrainOverrideChoice,
  type MapTerrainAuthoringMode,
  type TerrainAuthoringPalette,
} from './terrain-authoring-palette.js';
import {
  clampMapEditorObjectDrag,
  mapEditorAuthoredObjectFootprint,
} from './selection-footprint.js';
import {
  startMapEditorSurfaceFloodFill,
  type MapEditorFloodFillTask,
} from './editor-flood-fill.js';
import {
  MAP_EDITOR_TRANSITION_KINDS,
  clampMapEditorTransitionPoint,
  mapEditorTransitionErrorLabel,
  planMapEditorTransition,
  type MapEditorTransitionKind,
  type MapEditorTransitionPlan,
  type MapEditorTransitionWidth,
} from './transition-authoring.js';
import type { MapResizeImpact } from './resize.js';

const OBJECT_LAYERS = new Set<MapContentLayerId>(['ground', 'objects', 'gameplay', 'canopy']);
export const MAP_EDITOR_AUTHORED_ANCHOR_KINDS = ['poi', 'label'] as const;
export type MapEditorAuthoredAnchorKind = typeof MAP_EDITOR_AUTHORED_ANCHOR_KINDS[number];

export function nextMapEditorAnchor(
  document: MapDocumentV3,
  kind: MapEditorAuthoredAnchorKind,
  tileX: number,
  tileY: number,
  elevation: number,
): MapGameplayAnchor {
  const used = new Set([
    ...document.objects.map(({ id }) => id),
    ...document.landmarks.map(({ id }) => id),
    ...document.anchors.map(({ id }) => id),
  ]);
  let suffix = Math.max(1, document.revision + 1);
  let id = `${kind}-${suffix}`;
  while (used.has(id)) id = `${kind}-${++suffix}`;
  return {
    id,
    kind,
    tileX,
    tileY,
    elevation,
    label: kind === 'poi' ? `Point of Interest ${suffix}` : `Map Label ${suffix}`,
  };
}

/** Build only the elevation geometry required by inverse-projection picking.
 *
 * The production terrain adapter also classifies every biome, surface,
 * movement flag, and elevation-plane collision cell. None of those fields are
 * read by editor hit testing, and compiling them synchronously on the first
 * pointer event made a single click traverse the complete 832x832 world.
 * Keep this snapshot deliberately small and cache it by terrain geometry
 * identity in the controller below. */
export function mapEditorPickingTerrain(document: MapDocumentV3): TerrainArray {
  const terrainDocument = terrainDocumentForMapV3(document);
  const length = terrainDocument.width * terrainDocument.height;
  const generatedIsland = mapDocumentUsesSurvivalIslandBase(terrainDocument);
  const seed = terrainDocument.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED;
  const generatedElevations = generatedIsland ? survivalElevationBytes(seed) : null;
  const elevations = generatedElevations?.length === length
    ? Int16Array.from(generatedElevations)
    : new Int16Array(length).fill(terrainDocument.baseElevation);

  const defaultCliffFamily = terrainDocument.defaultCliffFamily ?? 'stone_1';
  const cliffFamilyIds = [...new Set([
    defaultCliffFamily,
    ...Object.values(terrainDocument.cells).flatMap((cell) => [
      ...(cell.cliffFamily === undefined ? [] : [cell.cliffFamily]),
      ...((cell.terrainOverride ?? contourOverrideFromCellParts(cell.parts))?.family === undefined
        ? [] : [(cell.terrainOverride ?? contourOverrideFromCellParts(cell.parts))!.family!]),
    ]),
  ])];
  const cliffFamilyIndex = new Map(cliffFamilyIds.map((family, index) => [family, index + 1]));
  const hasCliffFamilies = Object.values(terrainDocument.cells).some(
    (cell) => cell.cliffFamily !== undefined,
  );
  const hasTerrainOverrides = Object.values(terrainDocument.cells).some(
    (cell) => cell.terrainOverride !== undefined || contourOverrideFromCellParts(cell.parts) !== null,
  );
  const cliffFamilies = hasCliffFamilies ? new Uint8Array(length) : undefined;
  const terrainOverrides = hasTerrainOverrides
    ? Array<NonNullable<TerrainArray['terrainOverrides']>[number]>(length).fill(null)
    : undefined;

  for (const [key, cell] of Object.entries(terrainDocument.cells)) {
    const separator = key.indexOf(',');
    const tileX = Number(key.slice(0, separator));
    const tileY = Number(key.slice(separator + 1));
    if (!Number.isInteger(tileX) || !Number.isInteger(tileY)
      || tileX < 0 || tileY < 0
      || tileX >= terrainDocument.width || tileY >= terrainDocument.height) continue;
    const index = tileY * terrainDocument.width + tileX;
    if (cell.elevation !== undefined) elevations[index] = cell.elevation;
    if (cliffFamilies !== undefined && cell.cliffFamily !== undefined) {
      cliffFamilies[index] = cliffFamilyIndex.get(cell.cliffFamily) ?? 0;
    }
    const override = cell.terrainOverride ?? contourOverrideFromCellParts(cell.parts);
    if (terrainOverrides !== undefined && override !== null) terrainOverrides[index] = override;
  }

  const transitions = [
    ...terrainDocument.transitions,
    ...(terrainDocument.stairRuns ?? []).flatMap((run) => stairRunValid(run) ? expandStairRun(run) : []),
  ];
  return {
    spaceId: 4_200_001,
    seed,
    version: terrainDocument.revision,
    width: terrainDocument.width,
    height: terrainDocument.height,
    generator: generatedIsland ? 'island' : 'debug_flat',
    defaultCliffFamily,
    cliffFamilyIds,
    ...(cliffFamilies === undefined ? {} : { cliffFamilies }),
    ...(terrainOverrides === undefined ? {} : { terrainOverrides }),
    defaultSurfaceFamily: terrainDocument.defaultSurfaceFamily ?? 'grass_1',
    biomes: new Uint8Array(0),
    blocked: [],
    horseJumpableTerrain: [],
    elevations,
    terrainTransitions: transitions,
    raisedTerrainCollisionClassified: true,
    dirtCliffRoles: new Uint8Array(0),
    dirtTerraces: new Uint8Array(0),
  };
}

/** An Exact palette tile whose atlas is a terrain component becomes a cell
 * part at that frame; any other tile (decoration) stays an object. */
export function exactTileCellPart(prefab: MapPrefabDocumentV2): CellPart | null {
  const placement = prefab.placements[0];
  if (prefab.placements.length !== 1 || placement === undefined
    || placement.visual.kind !== 'variant' || placement.visual.name !== 'base') return null;
  const target = cellPartForTerrainAsset(placement.assetName);
  return target === null ? null : { ...target, exact: { frame: placement.visual.frameIndex } };
}

export const MAP_EDITOR_TERRAIN_TOOLS = [
  'inspect',
  'grass', 'dirt', 'sand', 'stone', 'cave_floor', 'water', 'path',
  'raise', 'lower', 'set_elevation', 'flatten',
  'transition',
  'ledge', 'erase_ledge',
  'block', 'walk', 'inherit',
] as const;
export type MapEditorTerrainTool = typeof MAP_EDITOR_TERRAIN_TOOLS[number];

export const MAP_EDITOR_TERRAIN_TOOL_LABELS: Readonly<Record<MapEditorTerrainTool, string>> = Object.freeze({
  inspect: 'Inspect terrain',
  grass: 'Paint grass',
  dirt: 'Paint dirt',
  sand: 'Paint sand',
  stone: 'Paint stone',
  cave_floor: 'Paint cave floor',
  water: 'Paint water',
  path: 'Paint path',
  raise: 'Raise terrain polygon',
  lower: 'Lower terrain polygon',
  set_elevation: 'Set elevation polygon',
  flatten: 'Flatten terrain polygon',
  transition: 'Author slope, stairs, or ladder',
  ledge: 'Paint ledge',
  erase_ledge: 'Erase ledge',
  block: 'Force collision blocked',
  walk: 'Force collision walkable',
  inherit: 'Restore inherited collision',
});

const CONTINUOUS_TERRAIN_TOOLS = new Set<MapEditorTerrainTool>([
  'grass', 'dirt', 'sand', 'stone', 'cave_floor', 'water', 'path',
  'ledge', 'erase_ledge', 'block', 'walk', 'inherit',
]);

/** Resolve only terrain semantics represented exactly by the current palette.
 * Atlas-level overrides and farmland remain unsampled until those choices have
 * first-class palette entries. */
export function mapEditorTerrainToolForSample(
  cell: Pick<ResolvedMapCell, 'surface' | 'feature' | 'collision' | 'terrainOverride' | 'ledge'>,
): MapEditorTerrainTool | null {
  if (cell.terrainOverride !== null || cell.feature === 'farmland') return null;
  if (cell.collision === 'force_block') return 'block';
  if (cell.collision === 'force_walk') return 'walk';
  if (cell.ledge) return 'ledge';
  if (cell.feature === 'path') return 'path';
  if (cell.feature !== 'none' && !(cell.feature === 'river' && cell.surface === 'water')) return null;
  return cell.surface;
}

function surfacePatch(
  tool: MapEditorTerrainTool,
  document: Pick<MapDocumentV3, 'defaultCliffFamily' | 'defaultSurfaceFamily'>,
): MapCellPatch | null {
  const cliffFamily = document.defaultCliffFamily ?? 'stone_1';
  if (tool === 'grass') return { surface: 'grass', feature: 'none', cliffFamily,
    surfaceFamily: document.defaultSurfaceFamily ?? 'grass_1' };
  if (tool === 'dirt') return { surface: 'dirt', feature: 'none', cliffFamily };
  if (tool === 'sand') return { surface: 'sand', feature: 'none', cliffFamily };
  if (tool === 'stone') return { surface: 'stone', feature: 'none', cliffFamily };
  if (tool === 'cave_floor') return { surface: 'cave_floor', feature: 'none', cliffFamily: 'cave' };
  if (tool === 'water') return { surface: 'water', feature: 'river', cliffFamily };
  if (tool === 'path') return { feature: 'path', cliffFamily };
  return null;
}

export function mapEditorTerrainCommand(
  tool: MapEditorTerrainTool,
  points: readonly MapPoint[],
  document: MapDocumentV3,
  activeElevation: number,
  automaticSurround = true,
): MapEditCommand | null {
  const unique = [...new Map(points.map((point) => [`${point.tileX},${point.tileY}`, point])).values()];
  if (unique.length === 0 || tool === 'inspect') return null;
  const patch = surfacePatch(tool, document);
  if (patch !== null) return { kind: 'paint', points: unique, patch };
  if (tool === 'ledge' || tool === 'erase_ledge') {
    return { kind: 'paint', points: unique, patch: { ledge: tool === 'ledge' } };
  }
  if (tool === 'block' || tool === 'walk' || tool === 'inherit') {
    const collision = tool === 'block' ? 'force_block' : tool === 'walk' ? 'force_walk' : 'inherit';
    return { kind: 'paint', points: unique, patch: {
      collision,
      collisionReason: collision === 'inherit' ? '' : 'studio terrain override',
    } };
  }
  const terrain = terrainDocumentForMapV3(document);
  if (unique.length < 3) {
    const brush = automaticSurround ? minimumTerrainBrushPoints(unique[0]!, document.width, document.height) : unique;
    const sampled = resolvedMapCellAt(terrain, unique[0]!.tileX, unique[0]!.tileY).elevation;
    const elevation = tool === 'raise' ? sampled + 1
      : tool === 'lower' ? sampled - 1
        : tool === 'set_elevation' ? activeElevation : sampled;
    return { kind: 'paint', points: brush, patch: {
      elevation: Math.max(-TERRAIN_ELEVATION_LIMIT, Math.min(TERRAIN_ELEVATION_LIMIT, elevation)),
      cliffFamily: document.defaultCliffFamily ?? 'stone_1',
    }, enforceMinimumTerrainFootprint: automaticSurround };
  }
  if (tool === 'raise' || tool === 'lower') return {
    kind: 'change_elevation_polygon', polygon: unique, delta: tool === 'raise' ? 1 : -1,
    enforceMinimumTerrainFootprint: automaticSurround,
  };
  if (tool === 'set_elevation') return {
    kind: 'set_elevation_polygon', polygon: unique, elevation: activeElevation,
    enforceMinimumTerrainFootprint: automaticSurround,
  };
  if (tool === 'flatten') return {
    kind: 'flatten_elevation_polygon', polygon: unique, enforceMinimumTerrainFootprint: automaticSurround,
  };
  return null;
}

export interface MapEditorCameraSnapshot {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export type MapEditingTool = 'objects' | 'terrain' | 'raise' | 'lower' | 'fill';

export interface MapEditorInteractionSnapshot {
  readonly camera: MapEditorCameraSnapshot;
  readonly viewport: UiRect;
  readonly activeLayer: MapContentLayerId;
  readonly selectedPrefabId: string | null;
  readonly selectedAnchorKind: MapEditorAuthoredAnchorKind | null;
  readonly selectedBiome: MapBiomeId | null;
  readonly terrainTool: MapEditorTerrainTool;
  readonly terrainPaletteMode: MapTerrainAuthoringMode;
  readonly selectedSurfaceFamily: TerrainSurfaceFamilyId;
  readonly selectedCliffFamily: string;
  readonly selectedExactTerrainOverrideId: string | null;
  readonly sampledTerrainPatch: Readonly<MapCellPatch> | null;
  readonly terrainAuthoringFeedback: string | null;
  readonly activeElevation: number;
  readonly heightOverlayVisible: boolean;
  readonly collisionOverlayVisible: boolean;
  readonly transitionKind: MapEditorTransitionKind;
  readonly transitionWidth: MapEditorTransitionWidth;
  readonly transitionPreview: MapEditorTransitionPlan | null;
  readonly transitionFeedback: string | null;
  readonly scatterDensity: number;
  readonly eyedropperActive: boolean;
  readonly dragDestination: {
    readonly kind: 'object' | 'landmark' | 'anchor' | 'resource';
    readonly id: string;
    readonly tileX: number;
    readonly tileY: number;
    readonly elevation: number;
  } | null;
}

export interface MapEditorSessionRestore {
  readonly camera: MapEditorCameraSnapshot;
  readonly terrainTool: MapEditorTerrainTool;
  readonly terrainPaletteMode?: MapTerrainAuthoringMode;
  readonly selectedSurfaceFamily?: TerrainSurfaceFamilyId;
  readonly selectedCliffFamily?: string;
  readonly activeLayer: MapContentLayerId;
  readonly selectedPrefabId: string | null;
  readonly selectedAnchorKind?: MapEditorAuthoredAnchorKind | null;
  readonly selectedBiome: MapBiomeId | null;
  readonly activeElevation: number;
  readonly heightOverlayVisible?: boolean;
  readonly collisionOverlayVisible?: boolean;
  readonly transitionKind?: MapEditorTransitionKind;
  readonly transitionWidth?: MapEditorTransitionWidth;
  readonly scatterDensity: number;
}

export interface MapEditorLiveMarker {
  readonly id: string;
  readonly entityKind: 'placeable' | 'chest' | 'homestead' | 'resource' | 'combat-target' | 'surface' | 'npc' | 'player';
  /** Runtime kind drives the same artwork branch as the game client. */
  readonly kind: string;
  /** Exact subscribed authority metadata. Absent on non-placeable projections
   * and compatibility fixtures, which keeps their schema fields read only. */
  readonly definitionId?: string;
  /** Wildlife presentation identity is separate from the durable NPC kind. */
  readonly species?: string;
  readonly state?: AdminJsonObject;
  readonly label: string;
  readonly spaceId: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly worldX: number;
  readonly worldY: number;
  readonly elevation: number | null;
  /** Compact bottom-centred footprint expanded only for the selected marker. */
  readonly footprint: { readonly width: number; readonly height: number };
  readonly layer: MapContentLayerId;
  readonly color: string;
  readonly facing?: Direction;
  readonly moving?: boolean;
  readonly activity?: string;
  readonly open?: boolean;
  readonly lit?: boolean;
  readonly health?: number;
  readonly fixedResourceSite?: boolean;
  readonly maxHealth?: number;
  readonly depleted?: boolean;
  readonly growthStage?: number;
  readonly miningClass?: string;
  readonly richness?: number;
  readonly variant?: number;
  readonly homeTileX?: number;
  readonly homeTileY?: number;
  /** True while a player rider has custody of an NPC/mount. */
  readonly playerControlled?: boolean;
  /** Generated wildlife uses simulation-owned homes rather than authored homes. */
  readonly systemControlled?: boolean;
  readonly appearance?: {
    readonly hairKind: string;
    readonly shirtKind: string;
    readonly pantsKind: string;
    readonly shoesKind: string;
  };
  readonly online?: boolean;
  readonly animationPhase?: number;
}

export type MapEditorVisibleEntityPick =
  | {
    readonly kind: 'object' | 'landmark';
      readonly id: string;
      readonly tileX: number;
      readonly tileY: number;
      readonly elevation: number;
      readonly layer: MapObjectLayer;
    }
  | {
      readonly kind: 'anchor';
      readonly id: string;
      readonly tileX: number;
      readonly tileY: number;
      readonly elevation: number;
      readonly layer: 'anchors';
    }
  | {
      readonly kind: 'live';
      readonly id: string;
      readonly entityKind: MapEditorLiveMarker['entityKind'];
      readonly spaceId: number;
      readonly tileX: number;
      readonly tileY: number;
      readonly elevation: number;
      readonly layer: MapContentLayerId;
    };

interface RankedVisibleEntityPick {
  readonly pick: MapEditorVisibleEntityPick;
  readonly elevation: number;
  readonly footY: number;
  readonly painterTie: string;
  readonly painterIndex: number;
}

function laterVisibleEntity(
  candidate: RankedVisibleEntityPick,
  selected: RankedVisibleEntityPick | null,
): boolean {
  if (selected === null) return true;
  return candidate.elevation !== selected.elevation
    ? candidate.elevation > selected.elevation
    : candidate.footY !== selected.footY
      ? candidate.footY > selected.footY
      : candidate.painterTie !== selected.painterTie
        ? candidate.painterTie.localeCompare(selected.painterTie) > 0
        : candidate.painterIndex > selected.painterIndex;
}

/** Pick the entity a user can actually see, independently of the layer which
 * currently receives new paint. Photoshop-style layer selection controls the
 * placement target; it must not make visible content impossible to select.
 * The comparison follows gameplay elevation and foot-Y first, then uses the
 * authored layer stack as the same final equal-depth tie as the painter. */
export function pickTopmostVisibleMapEntity(
  document: MapDocumentV3,
  liveMarkers: readonly MapEditorLiveMarker[],
  isLayerVisible: (layer: MapContentLayerId) => boolean,
  tileX: number,
  tileY: number,
): MapEditorVisibleEntityPick | null {
  let selected: RankedVisibleEntityPick | null = null;
  const consider = (
    pick: MapEditorVisibleEntityPick,
    footY: number,
    painterTie: string,
    painterIndex: number,
  ): void => {
    if (!isLayerVisible(pick.layer)) return;
    const candidate = {
      pick,
      elevation: pick.elevation,
      footY,
      painterTie,
      painterIndex,
    };
    if (laterVisibleEntity(candidate, selected)) selected = candidate;
  };

  document.objects.forEach((object, index) => {
    if (!object.enabled) return;
    if (!mapEditorAuthoredObjectFootprint(document, object).some((cell) => (
      cell.tileX === tileX && cell.tileY === tileY
    ))) return;
    consider({
      kind: 'object', id: object.id, tileX: object.tileX, tileY: object.tileY,
      elevation: object.elevation, layer: object.layer,
    }, (object.tileY + 1) * TILE_SIZE_PIXELS,
    authoredMapContentPainterTie(document, object.layer, 'object', object.id), index);
  });
  const landmarkOffset = document.objects.length;
  document.landmarks.forEach((landmark, index) => {
    if (!landmark.enabled) return;
    if (landmark.tileX !== tileX || landmark.tileY !== tileY) return;
    consider({
      kind: 'landmark', id: landmark.id, tileX: landmark.tileX, tileY: landmark.tileY,
      elevation: landmark.elevation, layer: landmark.layer,
    }, overworldPoiDecorationDepthY(landmark.kind, (landmark.tileY + 1) * TILE_SIZE_PIXELS),
    authoredMapContentPainterTie(document, landmark.layer, 'landmark', landmark.id),
    landmarkOffset + index);
  });
  const liveOffset = landmarkOffset + document.landmarks.length;
  liveMarkers.forEach((marker, index) => {
    if (!homesteadBuildFootprintTiles({ footprint: marker.footprint }, marker.tileX, marker.tileY)
      .some((cell) => cell.tileX === tileX && cell.tileY === tileY)) return;
    consider({
      kind: 'live', id: marker.id, entityKind: marker.entityKind, spaceId: marker.spaceId,
      tileX: marker.tileX, tileY: marker.tileY, elevation: marker.elevation ?? 0,
      layer: marker.layer,
    }, marker.worldY, `studio-live:${marker.entityKind}:${marker.id}`, liveOffset + index);
  });
  const anchorOffset = liveOffset + liveMarkers.length;
  document.anchors.forEach((anchor, index) => {
    if (anchor.tileX !== tileX || anchor.tileY !== tileY) return;
    consider({
      kind: 'anchor', id: anchor.id, tileX: anchor.tileX, tileY: anchor.tileY,
      elevation: anchor.elevation, layer: 'anchors',
    }, (anchor.tileY + 1) * TILE_SIZE_PIXELS,
    `studio-z-anchor:${anchor.kind}:${anchor.id}`, anchorOffset + index);
  });
  // `consider` mutates through its closure; make that flow explicit because
  // TypeScript does not propagate closure assignments into this narrowing.
  return (selected as RankedVisibleEntityPick | null)?.pick ?? null;
}

function liveMarkerFootprint(registry: (Pick<ContentRegistry, 'objects'> & Partial<Pick<ContentRegistry, 'resources'>>) | null, reference: PlaceableContentReference): { readonly width: number; readonly height: number } {
  const object = registry === null ? null : placeableObjectDefinition(registry, reference);
  const cells = object?.components.placement?.footprint ?? object?.components.collision?.footprint;
  return Object.freeze({ width: Math.max(1, ...cells?.map((row) => row.length) ?? []),
    height: Math.max(1, cells?.length ?? 1) });
}

const LIVE_MARKER_FACINGS = new Set<Direction>([
  'up', 'down', 'left', 'right', 'upLeft', 'upRight', 'downLeft', 'downRight',
]);
const LIVE_ISLAND_SPACE_ID = 0;

function liveMarkerFacing(value: string | undefined): Direction {
  return LIVE_MARKER_FACINGS.has(value as Direction) ? value as Direction : 'down';
}

function tileMarkerPosition(tileX: number, tileY: number): {
  readonly worldX: number;
  readonly worldY: number;
} {
  return { worldX: tileX * TILE_SIZE_PIXELS + TILE_SIZE_PIXELS / 2,
    worldY: (tileY + 1) * TILE_SIZE_PIXELS };
}

export function mapEditorLiveMarkers(liveRows: StudioLiveRows | null, registry: (Pick<ContentRegistry, 'objects'> & Partial<Pick<ContentRegistry, 'resources'>>) | null = null): readonly MapEditorLiveMarker[] {
  if (liveRows === null) return [];
  const markers: MapEditorLiveMarker[] = [];
  for (const row of liveRows?.placeables ?? []) {
    if (row.spaceId !== LIVE_ISLAND_SPACE_ID || row.tileX === undefined || row.tileY === undefined) continue;
    markers.push({ id: row.id.toString(), entityKind: 'placeable', kind: row.kind, label: row.kind,
      definitionId: row.definitionId, state: row.state,
      spaceId: row.spaceId, tileX: row.tileX, tileY: row.tileY, elevation: row.elevation ?? null,
      ...tileMarkerPosition(row.tileX, row.tileY), footprint: liveMarkerFootprint(registry, row),
      layer: 'player_owned', color: '#df9bc7', facing: liveMarkerFacing(row.facing),
      open: row.open, lit: row.lit,
      animationPhase: Number(row.id % 19n),
      activity: row.processStartTick !== undefined || row.barrelSealedTick !== undefined
        || row.cookStartTick !== undefined || row.smeltStartTick !== undefined ? 'processing' : 'idle' });
  }
  for (const row of liveRows.chests ?? []) {
    if (row.spaceId !== LIVE_ISLAND_SPACE_ID) continue;
    markers.push({ id: row.id.toString(), entityKind: 'chest', kind: 'chest', label: 'Chest',
      definitionId: row.definitionId, state: row.state,
      spaceId: row.spaceId, tileX: row.tileX, tileY: row.tileY, elevation: row.elevation ?? null,
      ...tileMarkerPosition(row.tileX, row.tileY), footprint: Object.freeze({ width: 1, height: 1 }),
      layer: 'player_owned', color: '#d7a668', facing: liveMarkerFacing(row.facing), open: row.open });
  }
  for (const row of liveRows?.homesteads ?? []) {
    if (row.tileX === undefined || row.tileY === undefined) continue;
    markers.push({ id: String(row.spaceId), entityKind: 'homestead', kind: 'homestead',
      label: row.ownerName?.trim() ? `${row.ownerName}'s Homestead` : `Homestead ${row.spaceId}`,
      spaceId: row.spaceId, tileX: row.tileX, tileY: row.tileY, elevation: row.elevation ?? null,
      ...tileMarkerPosition(row.tileX, row.tileY), footprint: Object.freeze({ width: 3, height: 4 }),
      layer: 'player_owned', color: '#f0c777' });
  }
  for (const row of liveRows?.resources ?? []) {
    if (row.spaceId !== LIVE_ISLAND_SPACE_ID) continue;
    const definition=row.definitionId?registry?.resources?.get(row.definitionId):undefined;
    const fixedResourceSite=definition?.fixedSites?.some(site=>BigInt(site[0])===row.id)??false;
    markers.push({ id: row.id.toString(), entityKind: 'resource', kind: row.kind, definitionId: row.definitionId, label: row.kind,
      spaceId: row.spaceId, tileX: row.tileX, tileY: row.tileY, elevation: row.elevation ?? null,
      ...tileMarkerPosition(row.tileX, row.tileY), footprint: Object.freeze({ width: 1, height: 1 }),
      layer: ((row.definitionId&&registry?.resources?.get(row.definitionId)?.visual.kind==='tree')||isChoppableTreeKind(row.kind, registry?.resources ? {resources:registry.resources} : undefined)) ? 'canopy' : 'generated_base', color: '#72c77a', health: row.health, depleted: row.depleted,
      growthStage: row.growthStage, miningClass: row.miningClass, richness: row.richness,
      maxHealth: row.maximumRichness, fixedResourceSite });
  }
  for (const row of liveRows.combatTargets ?? []) {
    if (row.spaceId !== LIVE_ISLAND_SPACE_ID) continue;
    markers.push({ id: row.id.toString(), entityKind: 'combat-target', kind: row.kind ?? 'archery_target',
      definitionId: row.definitionId,
      label: `Target ${row.id}`,
      spaceId: row.spaceId, tileX: row.tileX, tileY: row.tileY, elevation: row.elevation ?? null,
      ...tileMarkerPosition(row.tileX, row.tileY), footprint: Object.freeze({ width: 1, height: 1 }),
      layer: 'gameplay', color: '#dc7777', health: row.healthCenti,
      maxHealth: row.maxHealthCenti });
  }
  for (const row of liveRows.surfaces ?? []) {
    if (row.spaceId !== LIVE_ISLAND_SPACE_ID) continue;
    markers.push({ id: row.id.toString(), entityKind: 'surface', kind: row.kind, label: row.kind,
      spaceId: row.spaceId, tileX: row.tileX, tileY: row.tileY, elevation: row.elevation ?? null,
      ...tileMarkerPosition(row.tileX, row.tileY), footprint: Object.freeze({ width: 1, height: 1 }),
      layer: 'gameplay', color: '#a7a7d9' });
  }
  for (const row of liveRows.npcs) {
    if (row.spaceId !== LIVE_ISLAND_SPACE_ID || row.x === undefined || row.y === undefined) continue;
    const tileX = Math.floor(row.x / (FIXED_UNITS_PER_PIXEL * TILE_SIZE_PIXELS));
    const tileY = Math.floor(row.y / (FIXED_UNITS_PER_PIXEL * TILE_SIZE_PIXELS));
    markers.push({ id: row.id.toString(), entityKind: 'npc', kind: row.kind,
      definitionId: row.definitionId, species: row.species,
      label: row.displayName?.trim() || row.kind, spaceId: row.spaceId, tileX, tileY,
      worldX: row.x / FIXED_UNITS_PER_PIXEL, worldY: row.y / FIXED_UNITS_PER_PIXEL,
      elevation: null, footprint: Object.freeze({ width: 1, height: 1 }), layer: 'gameplay',
      color: '#f1b34b', facing: liveMarkerFacing(row.facing), moving: row.moving,
      activity: row.wanderDirection, health: row.health, variant: row.variant,
      ...(row.homeX === undefined || row.homeY === undefined ? {} : {
        homeTileX: Math.floor(row.homeX / (FIXED_UNITS_PER_PIXEL * TILE_SIZE_PIXELS)),
        homeTileY: Math.floor(row.homeY / (FIXED_UNITS_PER_PIXEL * TILE_SIZE_PIXELS)),
      }),
      playerControlled: row.riderIdentity !== undefined,
      systemControlled: row.species !== undefined || row.kind === 'wildlife' || row.kind === 'boat',
      animationPhase: Number(row.id % 19n) });
  }
  for (const row of liveRows.players) {
    if (row.spaceId !== LIVE_ISLAND_SPACE_ID || row.x === undefined || row.y === undefined) continue;
    const tileX = Math.floor(row.x / (FIXED_UNITS_PER_PIXEL * TILE_SIZE_PIXELS));
    const tileY = Math.floor(row.y / (FIXED_UNITS_PER_PIXEL * TILE_SIZE_PIXELS));
    const identity = row.identity.toHexString();
    markers.push({ id: identity, entityKind: 'player', kind: 'player',
      label: row.displayName?.trim() || identity.slice(0, 8), spaceId: row.spaceId, tileX, tileY,
      worldX: row.x / FIXED_UNITS_PER_PIXEL, worldY: row.y / FIXED_UNITS_PER_PIXEL,
      elevation: null, footprint: Object.freeze({ width: 1, height: 1 }), layer: 'gameplay',
      color: row.online === false ? '#77838d' : '#64b7e8', facing: liveMarkerFacing(row.facing),
      moving: row.moving, activity: row.equippedKind, appearance: row.appearance,
      online: row.online, animationPhase: identity.length % 19 });
  }
  return Object.freeze(markers);
}

interface DragState {
  readonly kind: 'object' | 'landmark' | 'anchor' | 'resource';
  readonly id: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceElevation: number;
  destinationX: number;
  destinationY: number;
  destinationElevation: number;
}

type PaintStroke = {
  readonly kind: 'biome' | 'terrain' | 'scatter';
  readonly elevation: number;
  readonly tool: MapEditorTerrainTool;
  readonly points: MapPoint[];
} | {
  readonly kind: 'terrain_patch';
  readonly elevation: number;
  readonly tool: 'inspect' | 'raise' | 'lower';
  readonly patch: Readonly<MapCellPatch>;
  readonly consumesSample: boolean;
  readonly continuous: boolean;
  readonly points: MapPoint[];
};

interface TransitionDraft {
  readonly elevation: number;
  readonly start: MapPoint;
  current: MapPoint;
  plan: MapEditorTransitionPlan;
}

/** Retained interaction state for the map surface. Geometry stays in world
 * pixels and every public input method reports whether it consumed the event,
 * which lets the canvas shell preserve drawer/focus precedence. */
export class MapEditorController {
  #viewport: UiRect = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });
  #camera: MapEditorCameraSnapshot = Object.freeze({ x: 0, y: 0, zoom: 1 });
  #framed = false;
  #activeLayer: MapContentLayerId;
  #selectedPrefabId: string | null = null;
  #selectedAnchorKind: MapEditorAuthoredAnchorKind | null = null;
  #selectedBiome: MapBiomeId | null = null;
  #terrainTool: MapEditorTerrainTool = 'inspect';
  #terrainPaletteMode: MapTerrainAuthoringMode = 'brush';
  #selectedSurfaceFamily: TerrainSurfaceFamilyId;
  #selectedCliffFamily: string;
  #terrainPalette: TerrainAuthoringPalette;
  #selectedExactTerrainOverride: ExactTerrainOverrideChoice | null = null;
  #sampledTerrainPatch: Readonly<MapCellPatch> | null = null;
  #terrainAuthoringFeedback: string | null = null;
  #activeElevation = 0;
  #editingTool: MapEditingTool | null = null;
  #automaticGeneration = true;
  #material: Readonly<MapCellPatch> = { surface:'grass', feature:'none', surfaceFamily:'grass_1', cliffFamily:'stone_1', terrainOverride:null };
  #materialBiome: MapBiomeId | undefined = 'plains';
  #materialId = 'grass_1';
  #materialLabel = 'Grass 1';
  #heightOverlayVisible = false;
  #collisionOverlayVisible = false;
  #transitionKind: MapEditorTransitionKind = 'slope';
  #transitionWidth: MapEditorTransitionWidth = 2;
  #transitionDraft: TransitionDraft | null = null;
  #transitionFeedback: string | null = null;
  #scatterDensity = 3_500;
  #eyedropperActive = false;
  #catalogChoices: {source:readonly MapPrefabDocumentV2[];smart:readonly MapPrefabDocumentV2[]}|null=null;
  #prefabCache: {document:MapDocumentV3;catalog:readonly MapPrefabDocumentV2[];all:readonly MapPrefabDocumentV2[]}|null=null;
  #catalog: readonly MapPrefabDocumentV2[] = [];
  #objectStroke: {tileX:number;tileY:number;elevation:number}|null = null;
  /** Exact palette tile that is a terrain component (path edge, fringe,
   * shore, water, farmland). It paints a cell part, never an object. */
  #selectedExactPart: CellPart | null = null;
  #pan: { readonly x: number; readonly y: number } | null = null;
  #drag: DragState | null = null;
  #stroke: PaintStroke | null = null;
  #floodFill: { readonly task: MapEditorFloodFillTask; readonly document: MapDocumentV3;
    readonly tool: MapEditorTerrainTool } | null = null;
  #pickingTerrainIdentity: object | null = null;
  #pickingTerrain: TerrainArray | null = null;
  readonly #resizeLineage = new WeakMap<MapDocumentV3, {
    readonly previous: MapDocumentV3;
    readonly offset: MapPoint;
  }>();
  #liveRows: StudioLiveRows | null = null;
  #liveObjectRegistry: (Pick<ContentRegistry, 'objects'> & Partial<Pick<ContentRegistry, 'resources'>>) | null = null;
  #staticLiveMarkers: readonly MapEditorLiveMarker[] = [];
  #dynamicLiveMarkers: readonly MapEditorLiveMarker[] = [];
  #liveMarkers: readonly MapEditorLiveMarker[] = [];
  #placedMarkerSource: readonly MapEditorLiveMarker[] | null = null;
  #placedMarkerDocument: MapDocumentV3 | null = null;
  #placedMarkers: readonly MapEditorLiveMarker[] = [];
  #disposed = false;

  constructor(
    private readonly model: MapEditorModel,
    private readonly invalidate: () => void = () => undefined,
    terrainPalette: TerrainAuthoringPalette = OFFLINE_TERRAIN_AUTHORING_PALETTE,
  ) {
    this.#terrainPalette = terrainPalette;
    model.setLiveObjectOccupancy(object=>{
      if(!object.enabled)return false;
      const cells=mapEditorObjectOccupiedCells(model.document(),object);
      return this.liveMarkers().some(marker=>marker.spaceId===0&&marker.layer===object.layer
        &&!['player','npc'].includes(marker.entityKind)&&!model.document().generatedSuppressions.includes(`${marker.entityKind}-${marker.id}`)
        &&cells.some(cell=>cell.tileX>=marker.tileX-Math.floor((marker.footprint.width-1)/2)
          &&cell.tileX<marker.tileX-Math.floor((marker.footprint.width-1)/2)+marker.footprint.width
          &&cell.tileY<=marker.tileY&&cell.tileY>marker.tileY-marker.footprint.height
          &&cell.elevation===(marker.elevation??resolvedMapCellAt(terrainDocumentForMapV3(model.document()),marker.tileX,marker.tileY).elevation)));
    });
    this.#activeLayer = model.document().layers.find(({ editable }) => editable)?.id ?? 'terrain';
    this.#selectedSurfaceFamily = model.document().defaultSurfaceFamily ?? 'grass_1';
    this.#selectedCliffFamily = model.document().defaultCliffFamily ?? 'stone_1';
  }

  snapshot(): MapEditorInteractionSnapshot {
    return Object.freeze({
      camera: this.#camera,
      viewport: this.#viewport,
      activeLayer: this.#activeLayer,
      selectedPrefabId: this.#selectedPrefabId,
      selectedAnchorKind: this.#selectedAnchorKind,
      selectedBiome: this.#selectedBiome,
      terrainTool: this.#terrainTool,
      terrainPaletteMode: this.#terrainPaletteMode,
      selectedSurfaceFamily: this.#selectedSurfaceFamily,
      selectedCliffFamily: this.#selectedCliffFamily,
      selectedExactTerrainOverrideId: this.#selectedExactTerrainOverride?.id ?? null,
      sampledTerrainPatch: this.#sampledTerrainPatch,
      terrainAuthoringFeedback: this.#terrainAuthoringFeedback,
      activeElevation: this.#activeElevation,
      heightOverlayVisible: this.#heightOverlayVisible,
      collisionOverlayVisible: this.#collisionOverlayVisible,
      transitionKind: this.#transitionKind,
      transitionWidth: this.#transitionWidth,
      transitionPreview: this.#transitionDraft?.plan ?? null,
      transitionFeedback: this.#transitionFeedback,
      scatterDensity: this.#scatterDensity,
      eyedropperActive: this.#eyedropperActive,
      dragDestination: this.#drag === null ? null : {
        kind: this.#drag.kind,
        id: this.#drag.id,
        tileX: this.#drag.destinationX,
        tileY: this.#drag.destinationY,
        elevation: this.#drag.destinationElevation,
      },
    });
  }

  setViewport(viewport: UiRect): void {
    const next = Object.freeze({
      x: viewport.x,
      y: viewport.y,
      width: Math.max(1, viewport.width),
      height: Math.max(1, viewport.height),
    });
    const changed = next.width !== this.#viewport.width || next.height !== this.#viewport.height;
    this.#viewport = next;
    if (!this.#framed) {
      this.frameMap();
      this.#framed = true;
    } else if (changed) this.clampCamera();
  }

  restoreSession(state: MapEditorSessionRestore): boolean {
    const terrainPaletteMode = state.terrainPaletteMode ?? 'brush';
    const selectedSurfaceFamily = state.selectedSurfaceFamily
      ?? this.model.document().defaultSurfaceFamily ?? 'grass_1';
    const selectedCliffFamily = state.selectedCliffFamily
      ?? this.model.document().defaultCliffFamily ?? 'stone_1';
    if (!Number.isFinite(state.camera.x) || !Number.isFinite(state.camera.y)
      || !Number.isFinite(state.camera.zoom)
      || state.camera.zoom < EDITOR_ABSOLUTE_MIN_ZOOM || state.camera.zoom > EDITOR_MAX_ZOOM
      || !MAP_EDITOR_TERRAIN_TOOLS.includes(state.terrainTool)
      || !MAP_TERRAIN_AUTHORING_MODES.includes(terrainPaletteMode)
      || !terrainSurfaceFamilyChoices('', this.#terrainPalette)
        .some(({ familyId }) => familyId === selectedSurfaceFamily)
      || !terrainCliffFamilyChoices('', this.#terrainPalette)
        .some(({ familyId }) => familyId === selectedCliffFamily)
      || !this.model.document().layers.some(({ id }) => id === state.activeLayer)
      || !(state.selectedPrefabId === null
        || (typeof state.selectedPrefabId === 'string' && state.selectedPrefabId.length <= 256))
      || !(state.selectedBiome === null || MAP_BIOME_IDS.includes(state.selectedBiome))
      || !(state.selectedAnchorKind === undefined || state.selectedAnchorKind === null
        || MAP_EDITOR_AUTHORED_ANCHOR_KINDS.includes(state.selectedAnchorKind))
      || (state.selectedPrefabId !== null && state.selectedBiome !== null)
      || (state.selectedAnchorKind !== undefined && state.selectedAnchorKind !== null
        && (state.selectedPrefabId !== null || state.selectedBiome !== null
          || state.activeLayer !== 'anchors' || this.model.workspace() !== 'objects'
          || !this.model.isLayerInteractionEnabled('anchors')))
      || (state.selectedPrefabId !== null
        && this.model.workspace() !== 'objects' && this.model.workspace() !== 'scatter')
      || (state.selectedBiome !== null
        && (this.model.workspace() !== 'biomes' || state.activeLayer !== 'terrain'))
      || !Number.isInteger(state.activeElevation)
      || Math.abs(state.activeElevation) > TERRAIN_ELEVATION_LIMIT
      || (state.heightOverlayVisible !== undefined
        && typeof state.heightOverlayVisible !== 'boolean')
      || (state.collisionOverlayVisible !== undefined
        && typeof state.collisionOverlayVisible !== 'boolean')
      || (state.transitionKind !== undefined && !MAP_EDITOR_TRANSITION_KINDS.includes(state.transitionKind))
      || (state.transitionWidth !== undefined && (!Number.isInteger(state.transitionWidth)
        || state.transitionWidth < 2 || state.transitionWidth > 4))
      || !Number.isInteger(state.scatterDensity)
      || state.scatterDensity < 0 || state.scatterDensity > 10_000) return false;
    this.#camera = Object.freeze({ ...state.camera });
    this.#terrainTool = state.terrainTool;
    this.#terrainPaletteMode = terrainPaletteMode;
    this.#selectedSurfaceFamily = selectedSurfaceFamily;
    this.#selectedCliffFamily = selectedCliffFamily;
    this.#selectedExactTerrainOverride = null;
    this.#sampledTerrainPatch = null;
    this.#terrainAuthoringFeedback = null;
    this.#activeLayer = state.activeLayer;
    this.#selectedPrefabId = state.selectedPrefabId;
    this.#selectedAnchorKind = state.selectedAnchorKind ?? null;
    this.#selectedBiome = state.selectedBiome;
    this.#activeElevation = state.activeElevation;
    this.#heightOverlayVisible = state.heightOverlayVisible ?? false;
    this.#collisionOverlayVisible = state.collisionOverlayVisible ?? false;
    this.#transitionKind = state.transitionKind ?? 'slope';
    this.#transitionWidth = state.transitionWidth ?? 2;
    this.#scatterDensity = state.scatterDensity;
    this.#framed = true;
    return true;
  }

  frameMap(): void {
    const document = this.model.document();
    const framed = editorFrameMapCamera(
      document.width * TILE_SIZE_PIXELS,
      document.height * TILE_SIZE_PIXELS,
      this.localViewport(),
    );
    this.#camera = Object.freeze({ x: framed.cameraX, y: framed.cameraY, zoom: framed.zoom });
  }

  selectLayer(layer: MapContentLayerId): void {
    if (!this.model.document().layers.some(({ id }) => id === layer)) return;
    this.cancelFloodFill();
    this.#activeLayer = layer;
    this.#selectedPrefabId = null;
    this.#selectedAnchorKind = null;
    this.#selectedBiome = null;
    this.#transitionDraft = null;
    this.model.clearSelection();
  }

  editingTool(): MapEditingTool | null { return this.#editingTool; }
  automaticGeneration(): boolean { return this.#automaticGeneration; }
  setAutomaticGeneration(value: boolean): void {
    this.pointerCancel();this.#automaticGeneration=value;
    const selected=this.allPrefabs().find(p=>p.id===this.#selectedPrefabId);
    const family=selected?.placements.length===1?connectedObjectFamily(selected.placements[0]!.assetName):null;
    if(family){const replacement=this.allPrefabs().find(p=>p.placements.length===1&&connectedObjectFamily(p.placements[0]!.assetName)===family&&(value?p.tags.includes('studio.smart-family'):!p.tags.includes('studio.smart-family')&&!p.tags.includes(MANUAL_OBJECT_CONNECTION_TAG)));
      this.#selectedPrefabId=replacement?.id??null;
    }else if(this.#editingTool!=='objects')this.#selectedPrefabId=null;
  }
  materialId(): string { return this.#materialId; }
  materialLabel(): string { return this.#materialLabel; }
  selectMaterial(id: string, label: string, patch: Readonly<MapCellPatch>, biome?: MapBiomeId): void {
    this.cancelFloodFill();
    this.#selectedPrefabId=null;
    this.#materialBiome = biome;
    this.#materialId = id; this.#materialLabel = label; this.#material = patch;
    this.#eyedropperActive = false;
    if (this.#editingTool === null || this.#editingTool === 'objects') this.selectEditingTool('terrain');
  }
  selectEditingTool(tool: MapEditingTool): void {
    this.pointerCancel();
    this.#editingTool = tool;
    this.#terrainAuthoringFeedback = null;
    this.#eyedropperActive = false;
    this.#selectedPrefabId = null; this.#selectedAnchorKind = null; this.#selectedBiome = null;
    this.#selectedExactPart = null;
    this.model.selectWorkspace(tool === 'objects' ? 'objects' : 'terrain');
    this.#activeLayer = tool === 'objects' ? 'objects' : 'terrain';
    this.#terrainTool = tool === 'raise' || tool === 'lower' ? tool : 'inspect';
    this.model.clearSelection();
  }
  adjustActiveElevation(delta: number): void {
    this.pointerCancel();
    this.#activeElevation = Math.max(-TERRAIN_ELEVATION_LIMIT, Math.min(TERRAIN_ELEVATION_LIMIT, this.#activeElevation + delta));
  }
  allObjectChoices(query = ''): readonly MapPrefabDocumentV2[] {
    const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
    const all=this.allPrefabs();const stateFamilies=new Set(all.filter(p=>p.presentation).flatMap(p=>p.tags.filter(t=>t.startsWith('studio.state-family.')).map(t=>t.slice(20))));
    return all.filter(prefab => (!this.#automaticGeneration||!stateFamilies.has(mapPrefabPresentationFamily(prefab)??'')) && !prefab.tags.includes(MANUAL_OBJECT_CONNECTION_TAG)
      && (this.#automaticGeneration ? prefab.tags.includes('studio.smart-family') || prefab.placements.length!==1 || !connectedObjectFamily(prefab.placements[0]!.assetName) || prefab.placements[0]!.assetName.endsWith('_gate') : !prefab.tags.includes('studio.smart-family')&&!prefab.tags.includes('studio.smart-state')) && terms.every(term =>
      [prefab.id, prefab.title, ...prefab.tags].join(' ').toLowerCase().includes(term)));
  }
  exactTileChoices(query=''):readonly MapPrefabDocumentV2[] {
    return exactTilePaletteChoices(this.allPrefabs(), query);
  }
  selectExactTile(prefabId:string):void {
    const prefab=this.exactTileChoices().find(p=>p.id===prefabId);
    if(!prefab)return;
    this.selectEditingTool('terrain');
    const part=exactTileCellPart(prefab);
    if(part!==null){
      // Terrain components stay on the terrain layer as an exact cell part.
      this.#selectedPrefabId=prefabId;this.#selectedExactPart=part;
      return;
    }
    // Genuine decorations remain Ground Details objects.
    this.#activeLayer='ground';this.model.selectWorkspace('objects');this.#selectedPrefabId=prefabId;
  }
  /** Part the armed Exact tile will paint, or null for object placement. */
  selectedExactPart(): CellPart | null { return this.#selectedExactPart; }
  /** Exact appearance parts on the selected cell, for the inspector. */
  selectedCellExactParts(): readonly CellPart[] {
    const point=this.selectedTerrainPoint();
    return point===null?[]:exactAppearanceParts(this.model.document().cells[`${point.tileX},${point.tileY}`]?.parts);
  }
  /** "Revert to smart": drops only the exact frame of one part. */
  revertSelectedCellPartExact(slot: CellPartSlot): boolean {
    return this.paintSelectedTerrainPatch({ revertPartExact: slot });
  }
  selectObjectChoice(prefabId: string): void {
    const prefab = this.allPrefabs().find(entry => entry.id === prefabId);
    if (!prefab) return;
    this.selectEditingTool('objects');
    this.#activeLayer = mapPrefabSuggestedLayer(prefab);
    this.selectPrefab(prefabId);
  }

  toggleEyedropper(): void {
    this.#eyedropperActive = !this.#eyedropperActive;
    if (this.#eyedropperActive) {
      this.#selectedAnchorKind = null;
      this.#selectedExactTerrainOverride = null;
      this.#sampledTerrainPatch = null;
      this.#terrainAuthoringFeedback = 'CLICK TERRAIN TO SAMPLE EXACT COMPOSED CELL';
    }
  }

  toggleHeightOverlay(): boolean {
    this.#heightOverlayVisible = !this.#heightOverlayVisible;
    return this.#heightOverlayVisible;
  }

  toggleCollisionOverlay(): boolean {
    this.#collisionOverlayVisible = !this.#collisionOverlayVisible;
    return this.#collisionOverlayVisible;
  }

  selectPrefab(prefabId: string | null): void {
    if (prefabId !== null && !this.allPrefabs().some(({ id }) => id === prefabId)) return;
    this.#selectedPrefabId = prefabId;
    this.#selectedExactPart = null;
    if (prefabId !== null) this.#selectedAnchorKind = null;
    this.#eyedropperActive = false;
    if (prefabId !== null) this.#selectedBiome = null;
  }

  selectBiome(biome: MapBiomeId | null): void {
    this.#selectedBiome = biome;
    this.#eyedropperActive = false;
    if (biome !== null) this.#selectedPrefabId = null;
    if (biome !== null) this.#selectedAnchorKind = null;
  }

  anchorPlacementAvailable(): boolean {
    return this.#activeLayer === 'anchors' && this.model.workspace() === 'objects'
      && this.model.isLayerInteractionEnabled('anchors');
  }

  selectAnchorKind(kind: MapEditorAuthoredAnchorKind | null): boolean {
    if (kind === null) {
      this.#selectedAnchorKind = null;
      return true;
    }
    if (!MAP_EDITOR_AUTHORED_ANCHOR_KINDS.includes(kind) || !this.anchorPlacementAvailable()) {
      return false;
    }
    this.#selectedAnchorKind = kind;
    this.#selectedPrefabId = null;
    this.#selectedBiome = null;
    this.#eyedropperActive = false;
    this.model.clearSelection();
    return true;
  }

  selectTerrainTool(tool: MapEditorTerrainTool): void {
    if (!MAP_EDITOR_TERRAIN_TOOLS.includes(tool)) return;
    this.cancelFloodFill();
    this.#editingTool = null;
    this.#terrainTool = tool;
    this.#terrainPaletteMode = 'brush';
    this.#selectedExactTerrainOverride = null;
    this.#sampledTerrainPatch = null;
    this.#terrainAuthoringFeedback = null;
    this.#eyedropperActive = false;
    this.#selectedPrefabId = null;
    this.#selectedAnchorKind = null;
    this.#selectedBiome = null;
    this.#transitionDraft = null;
    this.#transitionFeedback = tool === 'transition'
      ? 'DRAG BETWEEN LOWER AND UPPER ENDPOINTS' : null;
  }

  terrainAuthoringAvailable(): boolean {
    return this.model.workspace() === 'terrain' && this.#activeLayer === 'terrain'
      && this.model.isLayerInteractionEnabled('terrain');
  }

  selectTerrainPaletteMode(mode: MapTerrainAuthoringMode): boolean {
    if (!MAP_TERRAIN_AUTHORING_MODES.includes(mode)) return false;
    this.cancelFloodFill();
    this.#terrainPaletteMode = mode;
    if (mode !== 'brush') this.#terrainTool = 'inspect';
    this.#selectedExactTerrainOverride = null;
    this.#sampledTerrainPatch = null;
    this.#terrainAuthoringFeedback = mode === 'farmland_visual'
      ? 'DRY VISUAL ONLY · WET SOIL AND CROPS REMAIN RUNTIME AUTHORITY' : null;
    this.#eyedropperActive = false;
    return true;
  }

  selectSurfaceFamily(family: TerrainSurfaceFamilyId): boolean {
    if (!terrainSurfaceFamilyChoices('', this.#terrainPalette)
      .some(({ familyId }) => familyId === family)) return false;
    this.#selectedSurfaceFamily = family;
    this.#terrainPaletteMode = 'surface_family';
    this.#terrainTool = 'inspect';
    this.#selectedExactTerrainOverride = null;
    this.#sampledTerrainPatch = null;
    return true;
  }

  selectCliffFamily(family: string): boolean {
    if (!terrainCliffFamilyChoices('', this.#terrainPalette)
      .some(({ familyId }) => familyId === family)) return false;
    this.#selectedCliffFamily = family;
    this.#terrainPaletteMode = 'cliff_family';
    this.#terrainTool = 'inspect';
    this.#selectedExactTerrainOverride = null;
    this.#sampledTerrainPatch = null;
    return true;
  }

  selectExactTerrainOverride(choice: ExactTerrainOverrideChoice | null): boolean {
    if (choice !== null && !this.exactChoiceValidAtSelection(choice)) return false;
    this.#selectedExactTerrainOverride = choice;
    this.#terrainPaletteMode = 'exact_override';
    this.#terrainTool = 'inspect';
    this.#sampledTerrainPatch = null;
    this.#terrainAuthoringFeedback = choice === null ? null : 'EXACT OVERRIDE ARMED FOR ONE CELL';
    return true;
  }

  applySelectedSurfaceFamilyToCell(): boolean {
    if (!terrainSurfaceFamilyChoices('', this.#terrainPalette)
      .some(({ familyId }) => familyId === this.#selectedSurfaceFamily)) return false;
    return this.paintSelectedTerrainPatch({ surfaceFamily: this.#selectedSurfaceFamily });
  }

  selectDocumentDefaultSurfaceFamily(): boolean {
    const family = this.model.document().defaultSurfaceFamily ?? 'grass_1';
    if (!terrainSurfaceFamilyChoices('', this.#terrainPalette)
      .some(({ familyId }) => familyId === family)) return false;
    const changed = this.#selectedSurfaceFamily !== family
      || this.#terrainPaletteMode !== 'surface_family';
    this.#selectedSurfaceFamily = family;
    this.#terrainPaletteMode = 'surface_family';
    this.#terrainTool = 'inspect';
    this.#selectedExactTerrainOverride = null;
    this.#sampledTerrainPatch = null;
    this.#terrainAuthoringFeedback = null;
    return changed;
  }

  setSelectedSurfaceFamilyAsDefault(): boolean {
    if (!this.terrainAuthoringAvailable()
      || !terrainSurfaceFamilyChoices('', this.#terrainPalette)
        .some(({ familyId }) => familyId === this.#selectedSurfaceFamily)) return false;
    const before = this.model.document();
    this.model.setDefaultSurfaceFamily(this.#selectedSurfaceFamily);
    return this.model.document() !== before;
  }

  clearSelectedSurfaceFamily(): boolean {
    return this.paintSelectedTerrainPatch({ surfaceFamily: null });
  }

  applySelectedExactTerrainOverride(): boolean {
    const choice = this.#selectedExactTerrainOverride;
    if (choice === null || !this.exactChoiceValidAtSelection(choice)
      || !this.paintSelectedTerrainPatch({ terrainOverride: choice.override })) return false;
    this.#selectedExactTerrainOverride = null;
    this.#terrainAuthoringFeedback = null;
    return true;
  }

  clearSelectedExactTerrainOverride(): boolean {
    return this.paintSelectedTerrainPatch({ terrainOverride: null });
  }

  selectedTerrainPoint(): MapPoint | null {
    const selection = this.model.selection();
    return selection.kind === 'tile'
      ? { tileX: selection.tileX, tileY: selection.tileY } : null;
  }

  exactTerrainChoicesAtSelection(query = ''): readonly ExactTerrainOverrideChoice[] {
    const point = this.selectedTerrainPoint();
    return point === null ? [] : exactTerrainOverrideChoicesAt({
      document: terrainDocumentForMapV3(this.model.document()),
      tileX: point.tileX, tileY: point.tileY, query, palette: this.#terrainPalette,
    });
  }

  terrainAuthoringPalette(): TerrainAuthoringPalette { return this.#terrainPalette; }

  setTerrainAuthoringPalette(palette: TerrainAuthoringPalette): boolean {
    if (palette.contentKey === this.#terrainPalette.contentKey) return false;
    this.#terrainPalette = palette;
    this.#selectedExactTerrainOverride = null;
    this.#sampledTerrainPatch = null;
    const surfaces = terrainSurfaceFamilyChoices('', palette);
    if (!surfaces.some(({ familyId }) => familyId === this.#selectedSurfaceFamily)
      && surfaces[0] !== undefined) this.#selectedSurfaceFamily = surfaces[0].familyId;
    const cliffs = terrainCliffFamilyChoices('', palette);
    if (!cliffs.some(({ familyId }) => familyId === this.#selectedCliffFamily)
      && cliffs[0] !== undefined) this.#selectedCliffFamily = cliffs[0].familyId;
    return true;
  }

  selectTransitionKind(kind: MapEditorTransitionKind): void {
    if (!MAP_EDITOR_TRANSITION_KINDS.includes(kind)) return;
    this.#transitionKind = kind;
    this.#transitionDraft = null;
    this.#transitionFeedback = 'DRAG BETWEEN LOWER AND UPPER ENDPOINTS';
  }

  adjustTransitionWidth(delta: number): void {
    if (!Number.isFinite(delta)) return;
    this.#transitionWidth = Math.max(2, Math.min(4,
      Math.round(this.#transitionWidth + delta))) as MapEditorTransitionWidth;
    this.#transitionDraft = null;
  }

  adjustScatterDensity(delta: number): void {
    if (!Number.isFinite(delta)) return;
    this.#scatterDensity = Math.max(0, Math.min(10_000, Math.round(this.#scatterDensity + delta)));
  }

  setCatalog(catalog: readonly MapPrefabDocumentV2[]): void {
    this.#catalog = Object.freeze([...catalog]);
    if (this.#selectedPrefabId !== null && !this.allPrefabs().some(({ id }) => id === this.#selectedPrefabId)) {
      this.#selectedPrefabId = null;
    }
  }

  setLiveRows(rows: StudioLiveRows | null, registry: (Pick<ContentRegistry, 'objects'> & Partial<Pick<ContentRegistry, 'resources'>>) | null = null): void {
    const contentChanged = registry !== this.#liveObjectRegistry;
    this.#liveObjectRegistry = registry;
    if (rows === this.#liveRows && !contentChanged) return;
    if (rows === null) {
      this.#liveRows = null;
      this.#staticLiveMarkers = [];
      this.#dynamicLiveMarkers = [];
      this.#liveMarkers = [];
      return;
    }
    const previous = this.#liveRows;
    const structuralChanged = contentChanged || previous === null
      || previous.placeables !== rows.placeables || previous.chests !== rows.chests
      || previous.combatTargets !== rows.combatTargets || previous.resources !== rows.resources
      || previous.surfaces !== rows.surfaces || previous.homesteads !== rows.homesteads;
    if (structuralChanged) this.#staticLiveMarkers = mapEditorLiveMarkers({
      ...rows,
      npcs: [],
      players: [],
    }, registry);
    if (previous === null || previous.npcs !== rows.npcs || previous.players !== rows.players) {
      this.#dynamicLiveMarkers = mapEditorLiveMarkers({
        placeables: [],
        chests: [],
        combatTargets: [],
        resources: [],
        surfaces: [],
        homesteads: [],
        npcs: rows.npcs,
        players: rows.players,
      });
    }
    this.#liveRows = rows;
    this.#liveMarkers = Object.freeze([...this.#staticLiveMarkers, ...this.#dynamicLiveMarkers]);
  }

  liveMarkers(): readonly MapEditorLiveMarker[] {
    const document=this.model.document();
    if(this.#placedMarkerDocument!==document||this.#placedMarkerSource!==this.#liveMarkers) {
      const placements=new Map((document.resourcePlacements??[]).map(value=>[value.id,value]));
      this.#placedMarkers=this.#liveMarkers.map(marker=>{
        const placement=marker.entityKind==='resource'?placements.get(marker.id):undefined;
        const properties=marker.entityKind==='resource'?this.model.pendingEntityProperties(marker.id):undefined;
        const positioned=placement?{...marker,tileX:placement.tileX,tileY:placement.tileY,elevation:null,...tileMarkerPosition(placement.tileX,placement.tileY)}:marker;
        return properties?{...positioned,...properties}:positioned;
      });
      this.#placedMarkerDocument=document;this.#placedMarkerSource=this.#liveMarkers;
    }
    const drag=this.#drag;
    return drag?.kind==='resource'?this.#placedMarkers.map(marker=>marker.entityKind==='resource'&&marker.id===drag.id
      ?{...marker,tileX:drag.destinationX,tileY:drag.destinationY,elevation:drag.destinationElevation,...tileMarkerPosition(drag.destinationX,drag.destinationY)}:marker):this.#placedMarkers;
  }

  /** Reuses terrain which the renderer has already received from its worker.
   * Picking reads the same elevation/projection arrays, so generating another
   * 832x832 elevation snapshot on the first pointer event is redundant. */
  adoptPickingTerrain(identity: object, terrain: TerrainArray): void {
    if (identity !== this.model.terrainGeometryIdentity()) return;
    this.#pickingTerrainIdentity = identity;
    this.#pickingTerrain = terrain;
  }

  palette(query = ''): readonly MapPrefabDocumentV2[] {
    return mapContextPrefabPalette(this.allPrefabs(), this.#activeLayer, query);
  }

  toggleLayerVisibility(layer = this.#activeLayer): void {
    this.model.toggleLayer(layer);
    this.cancelUnavailableLayerGesture(layer);
  }

  toggleLayerLock(layer = this.#activeLayer): boolean {
    const changed = this.model.toggleLayerLock(layer);
    if (changed) this.cancelUnavailableLayerGesture(layer);
    return changed;
  }

  toggleLayerSolo(layer = this.#activeLayer): boolean {
    const changed = this.model.toggleLayerSolo(layer);
    if (changed) this.cancelUnavailableLayerGesture(this.#activeLayer);
    return changed;
  }

  renameLayer(layer: MapContentLayerId, label: string): boolean {
    return this.model.renameLayer(layer, label);
  }

  reorderLayer(layer: MapContentLayerId, direction: MapLayerReorderDirection): boolean {
    return this.model.reorderLayer(layer, direction);
  }

  resize(impact: MapResizeImpact): boolean {
    this.cancelFloodFill();
    this.#transitionDraft = null;
    const previous = this.model.document();
    const changed = this.model.resize(impact);
    if (changed) {
      this.#resizeLineage.set(this.model.document(), { previous, offset: impact.offset });
      this.translateView(impact.offset);
      this.reconcileDocumentBounds();
    }
    return changed;
  }

  undo(): boolean {
    this.cancelFloodFill();
    const before = this.model.document();
    this.model.undo();
    if (this.model.document() === before) return false;
    const resize = this.#resizeLineage.get(before);
    if (resize?.previous === this.model.document()) {
      this.translateView({ tileX: -resize.offset.tileX, tileY: -resize.offset.tileY });
    }
    this.reconcileDocumentBounds();
    return true;
  }

  redo(): boolean {
    this.cancelFloodFill();
    const before = this.model.document();
    this.model.redo();
    if (this.model.document() === before) return false;
    const resize = this.#resizeLineage.get(this.model.document());
    if (resize?.previous === before) this.translateView(resize.offset);
    this.reconcileDocumentBounds();
    return true;
  }

  pointerDown(point: UiPoint, button: number, panModifierHeld = false, shiftHeld = false): boolean {
    if (!this.contains(point)) return false;
    this.cancelFloodFill();
    if (button === 1 || button === 2 || (button === 0 && panModifierHeld)) {
      this.#pan = { x: point.x, y: point.y };
      return true;
    }
    const plane = (this.#editingTool === 'raise' || this.#editingTool === 'lower') && !this.#eyedropperActive
      ? this.#activeElevation : undefined;
    const tile = this.tileAt(point, plane);
    if (tile === null) return false;
    if (button === 0 && this.#eyedropperActive) {
      this.sampleAt(tile.tileX, tile.tileY, tile.elevation);
      return true;
    }
    if (button !== 0) return false;
    if (this.selectionCursorActive()) {
      const picked = this.selectAt(tile.tileX, tile.tileY);
      if (picked !== null) {
        this.beginAuthoredDrag(picked, tile.tileX, tile.tileY);
        return true;
      }
    }
    if(this.#editingTool==='terrain'&&!this.#automaticGeneration&&this.#selectedExactPart!==null){
      if(!this.terrainAuthoringAvailable()){this.#terrainAuthoringFeedback='SELECT THE VISIBLE EDITABLE TERRAIN LAYER';return true;}
      this.model.selectTile(tile.tileX,tile.tileY);this.#activeElevation=tile.elevation;
      this.#stroke={kind:'terrain_patch',elevation:tile.elevation,tool:'inspect',patch:{cellPart:this.#selectedExactPart},
        consumesSample:false,continuous:true,points:[tile]};
      return true;
    }
    if(this.#editingTool==='terrain'&&!this.#automaticGeneration&&this.#selectedPrefabId!==null){
      this.#objectStroke=tile;this.placeSelectedPrefab(tile.tileX,tile.tileY,tile.elevation);return true;
    }
    if (this.#editingTool !== null && this.#editingTool !== 'objects') {
      if (!this.terrainAuthoringAvailable()) return true;
      this.model.selectTile(tile.tileX, tile.tileY);
      const tool = this.#editingTool;
      if (tool === 'fill') {
        if(tile.elevation!==this.#activeElevation){this.#terrainAuthoringFeedback='Choose the height of the terrain you want to fill';return true;}
        this.beginFloodFill(this.model.document(), tile, this.#material, this.#terrainTool);
      } else {
        const elevation = Math.max(-TERRAIN_ELEVATION_LIMIT, Math.min(TERRAIN_ELEVATION_LIMIT,
          this.#activeElevation + (tool === 'raise' ? 1 : tool === 'lower' ? -1 : 0)));
        const material={...this.#material};delete material.elevation;
        this.#stroke = {kind:'terrain_patch', elevation:tool==='terrain'?tile.elevation:this.#activeElevation, tool:tool === 'terrain' ? 'inspect' : tool,
          patch:tool === 'terrain' ? material : {elevation,terrainOverride:null}, consumesSample:false, continuous:true, points:[tile]};
      }
      return true;
    }
    if (this.#activeLayer === 'player_owned') {
      this.model.selectTile(tile.tileX, tile.tileY);
      return true;
    }
    if (this.#selectedAnchorKind !== null && this.anchorPlacementAvailable()) {
      const anchor = nextMapEditorAnchor(
        this.model.document(), this.#selectedAnchorKind, tile.tileX, tile.tileY, tile.elevation,
      );
      this.model.placeAnchor(anchor);
      this.model.selectAnchor(anchor.id);
      return true;
    }
    if (this.#activeLayer === 'terrain' && this.model.workspace() === 'biomes'
      && this.#selectedBiome !== null) {
      if (!this.layerEditableAndVisible('terrain')) return true;
      this.#activeElevation = tile.elevation;
      this.#stroke = { kind: 'biome', elevation: tile.elevation, tool: 'inspect', points: [tile] };
      this.model.selectTile(tile.tileX, tile.tileY);
      return true;
    }
    if (this.#activeLayer === 'terrain' && this.model.workspace() === 'terrain') {
      this.model.selectTile(tile.tileX, tile.tileY);
      if (this.#terrainTool === 'transition') {
        if (!this.model.isLayerInteractionEnabled('terrain')) {
          this.#transitionFeedback = 'SELECT THE VISIBLE EDITABLE TERRAIN LAYER';
          return true;
        }
        const start = { tileX: tile.tileX, tileY: tile.tileY };
        const plan = this.transitionPlan(start, start);
        this.#activeElevation = tile.elevation;
        this.#transitionDraft = { elevation: tile.elevation, start, current: start, plan };
        this.#transitionFeedback = mapEditorTransitionErrorLabel(plan.error);
        return true;
      }
      const customPatch = this.armedTerrainPatch();
      if (customPatch !== null) {
        if (!this.terrainAuthoringAvailable()) {
          this.#terrainAuthoringFeedback = 'SELECT THE VISIBLE EDITABLE TERRAIN LAYER';
          return true;
        }
        if (this.#selectedExactTerrainOverride !== null
          && !this.exactChoiceValidAt(this.#selectedExactTerrainOverride, tile.tileX, tile.tileY)) {
          this.#terrainAuthoringFeedback = 'EXACT OVERRIDE IS NOT COMPATIBLE WITH THIS CELL TOPOLOGY';
          return true;
        }
        this.#activeElevation = tile.elevation;
        this.#stroke = {
          kind: 'terrain_patch', elevation: tile.elevation, tool: 'inspect', patch: customPatch,
          consumesSample: this.#sampledTerrainPatch !== null,
          continuous: this.#selectedExactTerrainOverride === null,
          points: [tile],
        };
        return true;
      }
      if (this.#terrainTool === 'inspect') {
        this.#activeElevation = tile.elevation;
        return true;
      }
      if (!this.terrainAuthoringAvailable()) {
        this.#terrainAuthoringFeedback = 'SELECT THE VISIBLE EDITABLE TERRAIN LAYER';
        return true;
      }
      const patch = surfacePatch(this.#terrainTool, this.model.document());
      if (shiftHeld && patch?.surface !== undefined) {
        this.beginFloodFill(this.model.document(), tile, patch, this.#terrainTool);
        return true;
      }
      if (this.#terrainTool !== 'set_elevation') this.#activeElevation = tile.elevation;
      this.#stroke = {
        kind: 'terrain', elevation: tile.elevation, tool: this.#terrainTool, points: [tile],
      };
      return true;
    }
    if (this.model.workspace() === 'scatter' && this.#selectedPrefabId !== null
      && OBJECT_LAYERS.has(this.#activeLayer)) {
      if (!this.layerEditableAndVisible(this.#activeLayer)) return true;
      this.#stroke = {
        kind: 'scatter', elevation: tile.elevation, tool: 'inspect', points: [tile],
      };
      this.model.selectTile(tile.tileX, tile.tileY);
      return true;
    }
    if (this.#selectedPrefabId !== null && OBJECT_LAYERS.has(this.#activeLayer)) {
      const prefab=this.allPrefabs().find(p=>p.id===this.#selectedPrefabId);
      this.#objectStroke=this.#automaticGeneration&&prefab?.tags.includes('studio.smart-family')?tile:null;
      this.placeSelectedPrefab(tile.tileX, tile.tileY, tile.elevation);return true;
    }
    const selected = this.selectAt(tile.tileX, tile.tileY);
    if (selected !== null) this.beginAuthoredDrag(selected, tile.tileX, tile.tileY);
    return true;
  }

  pointerMove(point: UiPoint): boolean {
    if(this.#objectStroke){const tile=this.tileAt(point,this.#objectStroke.elevation);if(tile){for(const p of rasterMapLine(this.#objectStroke,tile).slice(1))this.placeSelectedPrefab(p.tileX,p.tileY,tile.elevation);this.#objectStroke=tile;}return true;}
    if (this.#pan !== null) {
      this.#camera = Object.freeze({
        ...this.#camera,
        x: this.#camera.x - (point.x - this.#pan.x) / this.#camera.zoom,
        y: this.#camera.y - (point.y - this.#pan.y) / this.#camera.zoom,
      });
      this.#pan = { x: point.x, y: point.y };
      this.clampCamera();
      return true;
    }
    if (this.#transitionDraft !== null) {
      const draft = this.#transitionDraft;
      const current = this.transitionPointAt(point, draft.elevation);
      if (current.tileX !== draft.current.tileX || current.tileY !== draft.current.tileY) {
        draft.current = current;
        draft.plan = this.transitionPlan(draft.start, current);
        this.#transitionFeedback = mapEditorTransitionErrorLabel(draft.plan.error);
        this.model.selectTile(current.tileX, current.tileY);
      }
      return true;
    }
    if (this.#stroke !== null) {
      const tile = this.tileAt(point, this.#stroke.elevation);
      const previous = this.#stroke.points.at(-1);
      if (tile !== null && previous !== undefined
        && (tile.tileX !== previous.tileX || tile.tileY !== previous.tileY)) {
        if (this.#stroke.kind === 'biome' || this.#stroke.kind === 'scatter'
          || (this.#stroke.kind === 'terrain_patch' && this.#stroke.continuous)
          || CONTINUOUS_TERRAIN_TOOLS.has(this.#stroke.tool)) {
          this.#stroke.points.push(...rasterMapLine(previous, tile).slice(1));
        } else if (this.#stroke.kind !== 'terrain_patch') this.#stroke.points.push(tile);
        this.model.selectTile(tile.tileX, tile.tileY);
      }
      return true;
    }
    if (this.#drag === null) return false;
    const tile = this.tileAt(point);
    if (tile === null) return true;
    const document = this.model.document();
    const desiredX = tile.tileX - this.#drag.offsetX;
    const desiredY = tile.tileY - this.#drag.offsetY;
    if (this.#drag.kind === 'object') {
      const dragId = this.#drag.id;
      const object = document.objects.find(({ id }) => id === dragId);
      if (object !== undefined) {
        const clamped = clampMapEditorObjectDrag(document, object, desiredX, desiredY, tile.elevation);
        this.#drag.destinationX = clamped.tileX;
        this.#drag.destinationY = clamped.tileY;
        this.#drag.destinationElevation = clamped.elevation;
      }
    } else {
      this.#drag.destinationX = Math.max(0, Math.min(document.width - 1, desiredX));
      this.#drag.destinationY = Math.max(0, Math.min(document.height - 1, desiredY));
      this.#drag.destinationElevation = tile.elevation;
    }
    return true;
  }

  pointerUp(): boolean {
    if(this.#objectStroke){this.#objectStroke=null;return true;}
    if (this.#pan !== null) {
      this.#pan = null;
      return true;
    }
    if (this.#transitionDraft !== null) {
      const plan = this.#transitionDraft.plan;
      this.#transitionDraft = null;
      this.#transitionFeedback = plan.error === null
        ? `${plan.kind.toUpperCase()} · ${plan.direction?.toUpperCase()} · ${plan.transitions.length} LANE STEPS`
        : mapEditorTransitionErrorLabel(plan.error);
      if (plan.command !== null) this.model.editTerrain(plan.command);
      return true;
    }
    if (this.#stroke !== null) {
      const stroke = this.#stroke;
      this.#stroke = null;
      if (stroke.kind === 'biome' && this.#selectedBiome !== null) {
        const unique = [...new Map(stroke.points.map((point) => [`${point.tileX},${point.tileY}`, point])).values()];
        this.model.paintBiome(unique, this.#selectedBiome);
      } else if (stroke.kind === 'terrain') {
        const command = mapEditorTerrainCommand(
          stroke.tool, stroke.points, this.model.document(), this.#activeElevation, this.#automaticGeneration,
        );
        if (command !== null) {
          const result=this.model.editTerrain(command);
          if(result.rejected==='terrain_inset_conflict')this.#terrainAuthoringFeedback='This stroke needs conflicting inset blocks. Widen the area or use Exact Placement.';
        }
      } else if (stroke.kind === 'terrain_patch') {
        const before = this.model.document();
        const expand = this.#automaticGeneration && (stroke.tool === 'raise' || stroke.tool === 'lower');
        const terrain = terrainDocumentForMapV3(before);
        let candidates = stroke.points;
        if(expand){
          const planned:MapPoint[]=[];
          for(const point of stroke.points){
            if(resolvedMapCellAt(terrain,point.tileX,point.tileY).elevation!==stroke.elevation)continue;
            const footprints=[point,{tileX:point.tileX-1,tileY:point.tileY},{tileX:point.tileX,tileY:point.tileY-1},{tileX:point.tileX-1,tileY:point.tileY-1}]
              .map(anchor=>minimumTerrainBrushPoints(anchor,before.width,before.height))
              .filter(points=>points.length===4&&points.every(p=>{
                const height=resolvedMapCellAt(terrain,p.tileX,p.tileY).elevation;
                return height===stroke.elevation||height===stroke.patch.elevation;
              }));
            const footprint=footprints[0];
            if(!footprint){this.#terrainAuthoringFeedback='This height needs a clear 2 by 2 area. Change height or turn Auto surround off.';return true;}
            planned.push(...footprint);
          }
          candidates=[...new Map(planned.map(point=>[mapCellKey(point.tileX,point.tileY),point])).values()];
        }
        const points = stroke.tool === 'raise' || stroke.tool === 'lower'
          ? candidates.filter(point=>resolvedMapCellAt(terrain,point.tileX,point.tileY).elevation === stroke.elevation) : candidates;
        const result=this.model.editTerrain({kind:'paint', points, patch:stroke.patch, enforceSingleTerrainInset:expand}, this.#editingTool !== null && stroke.tool === 'inspect' ? this.#materialBiome : undefined, this.#automaticGeneration && stroke.tool === 'inspect' && !stroke.consumesSample);
        if (this.model.document() !== before) {
          if (stroke.consumesSample) this.#sampledTerrainPatch = null;
          if (this.#selectedExactTerrainOverride !== null) this.#selectedExactTerrainOverride = null;
          this.#terrainAuthoringFeedback = null;
        } else if(result.rejected==='terrain_inset_conflict') {
          this.#terrainAuthoringFeedback='This stroke needs conflicting inset blocks. Widen the area or use Exact Placement.';
        }
      } else if (stroke.kind === 'scatter' && this.#selectedPrefabId !== null) {
        const prefab = this.allPrefabs().find(({ id }) => id === this.#selectedPrefabId);
        if (prefab !== undefined && this.layerEditableAndVisible(this.#activeLayer)) {
          this.model.scatter({
            seed: Math.imul(this.model.document().revision + 1, 0x9e37_79b1) >>> 0,
            points: stroke.points,
            palette: [{ prefabId: prefab.id, weight: 1 }],
            density: this.#scatterDensity,
            minimumSpacing: 2,
            layer: this.#activeLayer as MapObjectLayer,
            randomQuarterTurns: true,
            randomFlipX: true,
          }, [prefab]);
        }
      }
      return true;
    }
    const drag = this.#drag;
    this.#drag = null;
    if (drag === null) return false;
    if (drag.destinationX === drag.sourceX && drag.destinationY === drag.sourceY
      && drag.destinationElevation === drag.sourceElevation) return true;
    try {
      if(drag.kind==='resource'){
        this.model.moveResource(drag.id,drag.sourceX,drag.sourceY,drag.destinationX,drag.destinationY);
      } else if (drag.kind === 'object') {
        this.model.moveObject(drag.id, drag.destinationX, drag.destinationY, drag.destinationElevation);
      } else if (drag.kind === 'landmark') {
        this.model.moveLandmark(drag.id, drag.destinationX, drag.destinationY, drag.destinationElevation);
      } else this.model.moveAnchor(
        drag.id, drag.destinationX, drag.destinationY, drag.destinationElevation,
      );
    } catch {
      return true;
    }
    return true;
  }

  pointerCancel(): boolean {
    const objectStrokeActive=this.#objectStroke!==null;
    this.#objectStroke=null;
    const active = objectStrokeActive || this.#pan !== null || this.#drag !== null || this.#stroke !== null
      || this.#transitionDraft !== null || this.#floodFill !== null;
    this.#pan = null;
    this.#drag = null;
    this.#stroke = null;
    this.#transitionDraft = null;
    this.cancelFloodFill();
    return active;
  }

  wheel(point: UiPoint, deltaY: number): boolean {
    if (!this.contains(point)) return false;
    const local = this.localPoint(point);
    const before = this.screenToWorld(point);
    const document = this.model.document();
    const minimum = editorMinimumZoomForMap(
      document.width * TILE_SIZE_PIXELS,
      document.height * TILE_SIZE_PIXELS,
      this.localViewport(),
    );
    const zoom = editorWorldZoomAfterWheel(this.#camera.zoom, deltaY, false, minimum);
    this.#camera = Object.freeze({
      x: before.x - local.x / zoom,
      y: before.y - local.y / zoom,
      zoom,
    });
    this.clampCamera();
    return true;
  }

  keyDown(key: string, shortcut = false, shift = false, alt = false): boolean {
    this.cancelFloodFill();
    if (shortcut && key.toLocaleLowerCase() === 'z') {
      if (shift) this.redo();
      else this.undo();
      return true;
    }
    if (shortcut && key.toLocaleLowerCase() === 'y') {
      this.redo();
      return true;
    }
    if (!shortcut && key.toLocaleLowerCase() === 'i') {
      this.toggleEyedropper();
      return true;
    }
    if (!shortcut && !shift && key.toLocaleLowerCase() === 'h') {
      this.toggleHeightOverlay();
      return true;
    }
    if (!shortcut && !shift && key.toLocaleLowerCase() === 'c') {
      this.toggleCollisionOverlay();
      return true;
    }
    if (this.model.workspace() === 'terrain') {
      const shortcutIndex = /^[1-9]$/u.test(key) && !alt ? Number(key) - 1
        : /^[1-8]$/u.test(key) && alt ? 8 + Number(key) : -1;
      if (this.#editingTool !== null && shortcutIndex >= 0) {
        const tools: readonly MapEditingTool[] = ['objects','terrain','raise','lower','fill'];
        if (tools[shortcutIndex]) this.selectEditingTool(tools[shortcutIndex]!);
        else if (shortcutIndex === 5) this.toggleEyedropper();
        return true;
      }
      const tool = MAP_EDITOR_TERRAIN_TOOLS[shortcutIndex];
      if (tool !== undefined) {
        this.selectTerrainTool(tool);
        return true;
      }
      if (key === '[' || key === ']') {
        if (this.#terrainTool === 'transition') this.adjustTransitionWidth(key === '[' ? -1 : 1);
        else this.#activeElevation = Math.max(-TERRAIN_ELEVATION_LIMIT, Math.min(
          TERRAIN_ELEVATION_LIMIT,
          this.#activeElevation + (key === '[' ? -1 : 1),
        ));
        return true;
      }
    }
    if (key === 'Delete' || key === 'Backspace') return this.deleteSelected();
    if (key === 'ArrowLeft') return this.nudgeSelected(-1, 0);
    if (key === 'ArrowRight') return this.nudgeSelected(1, 0);
    if (key === 'ArrowUp') return this.nudgeSelected(0, -1);
    if (key === 'ArrowDown') return this.nudgeSelected(0, 1);
    if (shortcut && key.toLocaleLowerCase() === 'd') return this.cloneSelected();
    if (key.toLocaleLowerCase() === 'r') return this.rotateSelected();
    if (key.toLocaleLowerCase() === 'x') return this.flipSelected();
    if (key === '=') return this.cycleSelectedScale();
    if (shift && key.toLocaleLowerCase() === 'h') return this.toggleSelectedVisibility();
    if (key === 'Escape') {
      this.#eyedropperActive = false;
      this.#selectedPrefabId = null;
      this.#selectedAnchorKind = null;
      this.#selectedBiome = null;
      this.#terrainTool = 'inspect';
      this.#terrainPaletteMode = 'brush';
      this.#selectedExactTerrainOverride = null;
      this.#sampledTerrainPatch = null;
      this.#terrainAuthoringFeedback = null;
      this.#transitionDraft = null;
      this.#transitionFeedback = null;
      this.model.clearSelection();
      return true;
    }
    if (key === 'Home' || key.toLocaleLowerCase() === 'f') {
      this.frameMap();
      return true;
    }
    return false;
  }

  floodFillPending(): boolean { return this.#floodFill !== null; }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.pointerCancel();
  }

  deleteSelected(): boolean {
    const anchor = this.selectedAuthoredAnchor();
    if (anchor !== null && this.layerEditableAndVisible('anchors')) {
      this.model.removeAnchor(anchor.id);
      this.model.clearSelection();
      return true;
    }
    const selection = this.selectedAuthoredForMutation();
    if (selection === null) return false;
    if (selection.kind === 'object') this.model.removeObject(selection.id);
    else this.model.removeLandmark(selection.id);
    this.model.clearSelection();
    return true;
  }

  updateSelectedAnchorLabel(label: string): boolean {
    const anchor = this.selectedAuthoredAnchor();
    if (anchor === null || !this.layerEditableAndVisible('anchors')) return false;
    this.model.updateAnchorLabel(anchor.id, label);
    return true;
  }

  /** Move authored content one tile without ever mutating live/generated rows. */
  nudgeSelected(deltaX: number, deltaY: number): boolean {
    const anchor = this.selectedAuthoredAnchor();
    if (anchor !== null && this.layerEditableAndVisible('anchors')) {
      const document = this.model.document();
      const tileX = Math.max(0, Math.min(document.width - 1, anchor.tileX + deltaX));
      const tileY = Math.max(0, Math.min(document.height - 1, anchor.tileY + deltaY));
      if (tileX === anchor.tileX && tileY === anchor.tileY) return true;
      const elevation = resolvedMapCellAt(terrainDocumentForMapV3(document), tileX, tileY).elevation;
      this.model.moveAnchor(anchor.id, tileX, tileY, elevation);
      return true;
    }
    const selection = this.selectedAuthoredForMutation();
    if (selection === null) return false;
    const document = this.model.document();
    const desiredX = selection.value.tileX + deltaX;
    const desiredY = selection.value.tileY + deltaY;
    const clamped = selection.kind === 'object'
      ? clampMapEditorObjectDrag(
        document, selection.value, desiredX, desiredY, selection.value.elevation,
      )
      : {
        tileX: Math.max(0, Math.min(document.width - 1, desiredX)),
        tileY: Math.max(0, Math.min(document.height - 1, desiredY)),
      };
    const { tileX, tileY } = clamped;
    if (tileX === selection.value.tileX && tileY === selection.value.tileY) return true;
    if (selection.kind === 'object') {
      this.model.moveObject(selection.id, tileX, tileY, selection.value.elevation);
    } else {
      this.model.moveLandmark(selection.id, tileX, tileY, selection.value.elevation);
    }
    return true;
  }

  toggleSelectedVisibility(): boolean {
    const selection = this.selectedAuthoredForMutation();
    if (selection === null) return false;
    if (selection.kind === 'object') this.model.placeObject({ ...selection.value, enabled: !selection.value.enabled });
    else this.model.placeLandmark({ ...selection.value, enabled: !selection.value.enabled });
    return true;
  }

  rotateSelected(): boolean {
    return this.updateSelected((value) => ({
      ...value,
      quarterTurns: (value.quarterTurns + 1) % 4 as 0 | 1 | 2 | 3,
    }));
  }

  flipSelected(): boolean {
    return this.updateSelected((value) => ({ ...value, flipX: !value.flipX }));
  }

  cycleSelectedScale(): boolean {
    return this.updateSelected((value) => ({ ...value, scale: (value.scale ?? 1) === 1 ? 2 : 1 }));
  }

  cloneSelected(): boolean {
    const selection = this.selectedAuthoredForMutation();
    if (selection === null) return false;
    const document = this.model.document();
    const ids = new Set([
      ...document.objects.map(({ id }) => id),
      ...document.landmarks.map(({ id }) => id),
    ]);
    const base = `clone-${selection.id}`.replace(/[^a-z0-9_-]/giu, '-').slice(0, 80);
    let suffix = document.revision + 1;
    let id = `${base}-${suffix}`;
    while (ids.has(id)) id = `${base}-${++suffix}`;
    const tileX = selection.value.tileX < document.width - 1
      ? selection.value.tileX + 1 : Math.max(0, selection.value.tileX - 1);
    const placed = selection.kind === 'object' ? this.model.placeObject({ ...selection.value, id, tileX })
      : (this.model.placeLandmark({ ...selection.value, id, tileX }), true);
    if(placed)this.model.selectObject(id);
    return placed;
  }

  screenToWorld(point: UiPoint): UiPoint {
    const local = this.localPoint(point);
    return {
      x: this.#camera.x + local.x / this.#camera.zoom,
      y: this.#camera.y + local.y / this.#camera.zoom,
    };
  }

  /** Read-only hit seam for canvas-owned confirm-first tools. Resolving a
   * target must not arm an authored edit or mutate selection by itself. */
  tileAtPoint(point: UiPoint): Readonly<{
    tileX: number;
    tileY: number;
    elevation: number;
  }> | null {
    const tile = this.tileAt(point);
    return tile === null ? null : Object.freeze({ ...tile });
  }

  private beginFloodFill(
    document: MapDocumentV3,
    start: MapPoint,
    patch: MapCellPatch,
    tool: MapEditorTerrainTool,
  ): void {
    const biome = this.#editingTool === null ? undefined : this.#materialBiome;
    const task = startMapEditorSurfaceFloodFill(document, start);
    const pending = Object.freeze({ task, document, tool });
    this.#floodFill = pending;
    void task.result.then((points) => {
      if (this.#floodFill !== pending) return;
      this.#floodFill = null;
      if (points === null || this.#disposed || this.model.document() !== document
        || this.#activeLayer !== 'terrain' || this.model.workspace() !== 'terrain'
        || this.#terrainTool !== tool || !this.layerEditableAndVisible('terrain')) return;
      this.model.editTerrain({ kind: 'paint', points, patch }, biome, this.#automaticGeneration);
      this.invalidate();
    }).catch((error: unknown) => {
      if (this.#floodFill !== pending) return;
      this.#floodFill = null;
      console.warn('Studio map flood fill failed', error);
      this.invalidate();
    });
  }

  private cancelFloodFill(): void {
    const pending = this.#floodFill;
    this.#floodFill = null;
    pending?.task.cancel();
  }

  private layerEditableAndVisible(layer: MapContentLayerId): boolean {
    return this.model.isLayerInteractionEnabled(layer);
  }

  private cancelUnavailableLayerGesture(layer: MapContentLayerId): void {
    if (layer !== this.#activeLayer || this.model.isLayerInteractionEnabled(layer)) return;
    this.pointerCancel();
    this.#transitionDraft = null;
  }

  private armedTerrainPatch(): Readonly<MapCellPatch> | null {
    if (this.#sampledTerrainPatch !== null) return this.#sampledTerrainPatch;
    if (this.#selectedExactTerrainOverride !== null) {
      return { terrainOverride: this.#selectedExactTerrainOverride.override };
    }
    if (this.#terrainPaletteMode === 'surface_family') return terrainSurfaceFamilyChoices('', this.#terrainPalette)
      .some(({ familyId }) => familyId === this.#selectedSurfaceFamily)
      ? { surface: 'grass', feature: 'none', surfaceFamily: this.#selectedSurfaceFamily }
      : null;
    if (this.#terrainPaletteMode === 'cliff_family') return terrainCliffFamilyChoices('', this.#terrainPalette)
      .some(({ familyId }) => familyId === this.#selectedCliffFamily)
      ? { cliffFamily: this.#selectedCliffFamily } : null;
    if (this.#terrainPaletteMode === 'farmland_visual') return {
      surface: 'dirt', feature: 'farmland',
    };
    return null;
  }

  private exactChoiceValidAt(choice: ExactTerrainOverrideChoice, tileX: number, tileY: number): boolean {
    return exactTerrainOverrideChoicesAt({
      document: terrainDocumentForMapV3(this.model.document()), tileX, tileY,
      palette: this.#terrainPalette,
    }).some(({ id }) => id === choice.id);
  }

  private exactChoiceValidAtSelection(choice: ExactTerrainOverrideChoice): boolean {
    const point = this.selectedTerrainPoint();
    return point !== null && this.exactChoiceValidAt(choice, point.tileX, point.tileY);
  }

  private paintSelectedTerrainPatch(patch: MapCellPatch): boolean {
    if (!this.terrainAuthoringAvailable()) return false;
    const point = this.selectedTerrainPoint();
    if (point === null) return false;
    const before = this.model.document();
    this.model.paintTerrainPatch([point], patch);
    return this.model.document() !== before;
  }

  private selectedAuthored():
    | { readonly kind: 'object'; readonly id: string; readonly value: MapObjectInstance }
    | { readonly kind: 'landmark'; readonly id: string; readonly value: MapLandmarkInstance }
    | null {
    const selection = this.model.selection();
    if (selection.kind !== 'entity') return null;
    const object = this.model.document().objects.find(({ id }) => id === selection.id);
    if (object !== undefined) return { kind: 'object', id: object.id, value: object };
    const landmark = this.model.document().landmarks.find(({ id }) => id === selection.id);
    return landmark === undefined ? null : { kind: 'landmark', id: landmark.id, value: landmark };
  }

  private selectedAuthoredForMutation():
    | { readonly kind: 'object'; readonly id: string; readonly value: MapObjectInstance }
    | { readonly kind: 'landmark'; readonly id: string; readonly value: MapLandmarkInstance }
    | null {
    const selection = this.selectedAuthored();
    return selection !== null && this.layerEditableAndVisible(selection.value.layer) ? selection : null;
  }

  private selectedAuthoredAnchor(): MapGameplayAnchor | null {
    const selection = this.model.selection();
    if (selection.kind !== 'entity' || selection.entityKind !== 'map-anchor') return null;
    const anchor = this.model.document().anchors.find(({ id }) => id === selection.id);
    return anchor !== undefined && (anchor.kind === 'poi' || anchor.kind === 'label') ? anchor : null;
  }

  private sampleAt(tileX: number, tileY: number, elevation: number): boolean {
    const document = this.model.document();
    const workspace = this.model.workspace();
    if (workspace === 'objects' || workspace === 'scatter') {
      const object = document.objects.map((candidate, index) => ({ candidate, index }))
        .filter(({ candidate }) => candidate.enabled && this.model.isLayerRendered(candidate.layer))
        .sort((left, right) => right.candidate.elevation - left.candidate.elevation
          || right.candidate.tileY - left.candidate.tileY
          || authoredMapContentPainterTie(
            document, right.candidate.layer, 'object', right.candidate.id,
          ).localeCompare(authoredMapContentPainterTie(
            document, left.candidate.layer, 'object', left.candidate.id,
          ))
          || right.index - left.index)
        .find(({ candidate }) => mapEditorAuthoredObjectFootprint(document, candidate)
          .some((cell) => cell.tileX === tileX && cell.tileY === tileY))?.candidate;
      if (object === undefined) return false;
      this.#activeLayer = object.layer;
      const sampled=this.allPrefabs().find(prefab=>prefab.id===object.prefabId);
      const originalId=sampled?.tags.find(tag=>tag.startsWith('studio.connection.source.'))?.slice('studio.connection.source.'.length);
      const original=originalId===undefined?undefined:this.allPrefabs().find(prefab=>prefab.id===originalId);
      this.#selectedPrefabId = original?.id ?? object.prefabId;
      if(sampled?.tags.includes(MANUAL_OBJECT_CONNECTION_TAG))this.#automaticGeneration=false;
      this.#selectedBiome = null;
      this.#eyedropperActive = false;
      this.model.selectObject(object.id);
      return true;
    }
    if (this.#activeLayer !== 'terrain' && this.#activeLayer !== 'generated_base') return false;
    this.#activeElevation = elevation;
    if (workspace === 'biomes') {
      this.#activeLayer = 'terrain';
      this.#selectedBiome = resolvedMapBiomeAt(document, tileX, tileY);
      this.#selectedPrefabId = null;
      this.#eyedropperActive = false;
      this.model.selectTile(tileX, tileY);
      return true;
    }
    if (workspace !== 'terrain') return false;
    const cell = resolvedMapCellAt(terrainDocumentForMapV3(document), tileX, tileY);
    if (this.#editingTool !== null) {
      this.#material = { surface:cell.surface, feature:cell.feature, surfaceFamily:cell.surfaceFamily, cliffFamily:cell.cliffFamily, collision:cell.collision, collisionReason:cell.collisionReason ?? '', ledge:cell.ledge, terrainOverride:null };
      this.#materialBiome = resolvedMapBiomeAt(document,tileX,tileY);
      this.#materialId = cell.surface === 'grass' ? cell.surfaceFamily : cell.surface === 'water' ? cell.feature === 'river' ? 'water' : 'ocean' : cell.feature === 'path' || cell.feature === 'farmland' ? cell.feature : cell.surface;
      const choices = mapMaterialChoices(this.#terrainPalette);
      const match = choices.find(choice=>choice.biome===this.#materialBiome && choice.patch.surface===cell.surface && (choice.patch.feature??'none')===cell.feature && (choice.patch.cliffFamily??'stone_1')===cell.cliffFamily && (choice.patch.surfaceFamily??document.defaultSurfaceFamily??'grass_1')===cell.surfaceFamily);
      if(match)this.#materialId=match.id;
      this.#materialLabel = match?.label ?? this.#materialId.replaceAll('_', ' ');
      this.#editingTool = 'terrain'; this.#eyedropperActive = false;
      this.#activeLayer = 'terrain'; this.model.selectTile(tileX,tileY);
      return true;
    }
    const authoredCell = document.cells[mapCellKey(tileX, tileY)];
    this.#activeLayer = 'terrain';
    this.#terrainTool = 'inspect';
    this.#terrainPaletteMode = 'brush';
    this.#selectedSurfaceFamily = cell.surfaceFamily;
    this.#selectedCliffFamily = cell.cliffFamily;
    this.#selectedExactTerrainOverride = null;
    this.#sampledTerrainPatch = Object.freeze({
      surface: cell.surface,
      feature: cell.feature,
      collision: cell.collision,
      collisionReason: cell.collisionReason ?? '',
      // Family and exact-frame absence is meaningful source data: preserve
      // inheritance instead of turning the currently resolved defaults into
      // explicit per-cell overrides at the destination.
      cliffFamily: authoredCell?.cliffFamily ?? null,
      surfaceFamily: authoredCell?.surfaceFamily ?? null,
      terrainOverride: authoredCell?.terrainOverride ?? null,
      ledge: cell.ledge,
    });
    this.#terrainAuthoringFeedback = 'EXACT COMPOSED CELL ARMED FOR ONE STROKE';
    this.#selectedPrefabId = null;
    this.#selectedBiome = null;
    this.#eyedropperActive = false;
    this.model.selectTile(tileX, tileY);
    return true;
  }

  private updateSelected(
    update: (value: MapObjectInstance | MapLandmarkInstance) => MapObjectInstance | MapLandmarkInstance,
  ): boolean {
    const selection = this.selectedAuthored();
    if (selection === null || !this.layerEditableAndVisible(selection.value.layer)) return false;
    if (selection.kind === 'object') this.model.placeObject(update(selection.value) as MapObjectInstance);
    else this.model.placeLandmark(update(selection.value) as MapLandmarkInstance);
    return true;
  }

  private selectionCursorActive(): boolean {
    if (this.#editingTool !== null && this.#editingTool !== 'objects') return false;
    if (this.#eyedropperActive || this.#selectedPrefabId !== null || this.#selectedBiome !== null
      || this.#selectedAnchorKind !== null) return false;
    return this.model.workspace() !== 'terrain' || this.#terrainTool === 'inspect';
  }

  private beginAuthoredDrag(
    selected: MapEditorVisibleEntityPick,
    pointerTileX: number,
    pointerTileY: number,
  ): void {
    if (selected.kind === 'live' && (selected.entityKind!=='resource'||selected.layer!=='canopy'||selected.spaceId!==LIVE_ISLAND_SPACE_ID
      ||this.liveMarkers().some(marker=>marker.entityKind==='resource'&&marker.id===selected.id&&marker.fixedResourceSite))) return;
    if (selected.kind === 'anchor' && this.selectedAuthoredAnchor() === null) return;
    if (!this.layerEditableAndVisible(selected.layer)) return;
    this.#drag = {
      kind: selected.kind==='live'?'resource':selected.kind,
      id: selected.id,
      offsetX: pointerTileX - selected.tileX,
      offsetY: pointerTileY - selected.tileY,
      sourceX: selected.tileX,
      sourceY: selected.tileY,
      sourceElevation: selected.elevation,
      destinationX: selected.tileX,
      destinationY: selected.tileY,
      destinationElevation: selected.elevation,
    };
  }

  selectAtPoint(point: UiPoint): boolean {const tile=this.tileAt(point);return tile!==null&&this.selectAt(tile.tileX,tile.tileY)!==null;}

  private selectAt(tileX: number, tileY: number): MapEditorVisibleEntityPick | null {
    const selected = pickTopmostVisibleMapEntity(
      this.model.document(),
      this.liveMarkers(),
      (layer) => this.model.isLayerRendered(layer),
      tileX,
      tileY,
    );
    if (selected !== null) {
      this.model.selectWorkspace('objects');
      this.#activeLayer = selected.layer;
      this.#selectedPrefabId = null;
      this.#selectedAnchorKind = null;
      this.#selectedBiome = null;
      if (selected.kind === 'live') {
        if (selected.entityKind === 'player') this.model.selectPlayer(selected.id, selected.spaceId);
        else this.model.selectEntity(selected.entityKind, selected.id, selected.spaceId);
      } else if (selected.kind === 'anchor') this.model.selectAnchor(selected.id);
      else this.model.selectObject(selected.id);
      return selected;
    }
    this.model.selectTile(tileX, tileY);
    return null;
  }

  private placeSelectedPrefab(tileX: number, tileY: number, elevation: number): boolean {
    let prefab = this.allPrefabs().find(({ id }) => id === this.#selectedPrefabId);
    if (prefab === undefined || !OBJECT_LAYERS.has(this.#activeLayer)
      || !this.layerEditableAndVisible(this.#activeLayer)) return false;
    if(this.#automaticGeneration && prefab.tags.includes(MANUAL_OBJECT_CONNECTION_TAG))prefab={...prefab,tags:prefab.tags.filter(tag=>tag!==MANUAL_OBJECT_CONNECTION_TAG&&!tag.startsWith('studio.connection.source.')),id:`auto-${prefab.id.slice(0,59)}`};
    if (!this.#automaticGeneration && !prefab.tags.includes(MANUAL_OBJECT_CONNECTION_TAG)) prefab = {...prefab, id:`manual-${prefab.id.slice(0,42)}-${[...prefab.id].reduce((hash,char)=>Math.imul(hash^char.charCodeAt(0),16777619)>>>0,2166136261).toString(16)}`,
      tags:[...prefab.tags,MANUAL_OBJECT_CONNECTION_TAG,`studio.connection.source.${prefab.id}`]};
    if (!this.model.document().prefabs.some(({ id, revision }) => id === prefab.id && revision === prefab.revision)) {
      this.model.embedPrefab(prefab);
    }
    const layer = this.#activeLayer as MapObjectLayer;
    const base = `placed-${prefab.id}`.replace(/[^a-z0-9_-]/gu, '-').slice(0, 82);
    let suffix = this.model.document().revision + 1;
    let id = `${base}-${suffix}`;
    while (this.model.document().objects.some((object) => object.id === id)) id = `${base}-${++suffix}`;
    const placed = this.model.placeObject({
      id,
      prefabId: prefab.id,
      prefabRevision: prefab.revision,
      tileX,
      tileY,
      elevation,
      layer,
      quarterTurns: 0,
      flipX: false,
      enabled: true,
    });
    if(placed)this.model.selectObject(id);
    return placed;
  }

  private tileAt(point: UiPoint, lockedElevation?: number): {
    readonly tileX: number;
    readonly tileY: number;
    readonly elevation: number;
  } | null {
    const document = this.model.document();
    const world = this.screenToWorld(point);
    const terrain = this.pickingTerrain();
    const hit = lockedElevation === undefined
      ? topmostEditorTerrainHit(terrain, world.x, world.y)
      : editorTerrainHitOnPlane(terrain, world.x, world.y, lockedElevation);
    return hit === null || hit.tileX < 0 || hit.tileY < 0
      || hit.tileX >= document.width || hit.tileY >= document.height ? null : hit;
  }

  private transitionPointAt(point: UiPoint, lockedElevation: number): MapPoint {
    const hit = this.tileAt(point, lockedElevation);
    if (hit !== null) return { tileX: hit.tileX, tileY: hit.tileY };
    const world = this.screenToWorld(point);
    return clampMapEditorTransitionPoint(this.model.document(), {
      tileX: Math.floor(world.x / TILE_SIZE_PIXELS),
      tileY: Math.floor(world.y / TILE_SIZE_PIXELS),
    });
  }

  private transitionPlan(start: MapPoint, end: MapPoint): MapEditorTransitionPlan {
    return planMapEditorTransition(
      this.model.document(),
      start,
      end,
      this.#transitionKind,
      this.#transitionWidth,
      this.pickingTerrain(),
    );
  }

  private pickingTerrain(): TerrainArray {
    const identity = this.model.terrainGeometryIdentity();
    if (identity === this.#pickingTerrainIdentity && this.#pickingTerrain !== null) return this.#pickingTerrain;
    this.#pickingTerrain = mapEditorPickingTerrain(this.model.document());
    this.#pickingTerrainIdentity = identity;
    return this.#pickingTerrain;
  }

  private allPrefabs(): readonly MapPrefabDocumentV2[] {
    if(this.#prefabCache?.document===this.model.document()&&this.#prefabCache.catalog===this.#catalog)return this.#prefabCache.all;
    const authored = new Map(this.#catalog.map((prefab) => [prefab.id, prefab] as const));
    for (const prefab of this.model.document().prefabs) authored.set(prefab.id, prefab);
    if(this.#catalogChoices?.source!==this.#catalog)this.#catalogChoices={source:this.#catalog,smart:[...smartConnectedObjectPrefabs(this.#catalog),...smartObjectPresentationPrefabs(this.#catalog)]};
    for(const prefab of [...this.#catalogChoices.smart,...smartConnectedObjectPrefabs(this.model.document().prefabs),...smartObjectPresentationPrefabs(this.model.document().prefabs)])if(!authored.has(prefab.id))authored.set(prefab.id,prefab);
    const all=[...authored.values()];this.#prefabCache={document:this.model.document(),catalog:this.#catalog,all};return all;
  }

  private clampCamera(): void {
    const document = this.model.document();
    const clamped = editorClampMapCamera(
      this.#camera.x,
      this.#camera.y,
      this.#camera.zoom,
      document.width * TILE_SIZE_PIXELS,
      document.height * TILE_SIZE_PIXELS,
      this.localViewport(),
    );
    this.#camera = Object.freeze({ ...this.#camera, x: clamped.cameraX, y: clamped.cameraY });
  }

  private reconcileDocumentBounds(): void {
    this.#pan = null;
    this.#drag = null;
    this.#stroke = null;
    this.#transitionDraft = null;
    this.#pickingTerrainIdentity = null;
    this.#pickingTerrain = null;
    const document = this.model.document();
    const selection = this.model.selection();
    if (selection.kind === 'tile' && (selection.tileX < 0 || selection.tileY < 0
      || selection.tileX >= document.width || selection.tileY >= document.height)) {
      this.model.clearSelection();
    } else if (selection.kind === 'entity' && selection.entityKind === 'map-object'
      && !document.objects.some(({ id }) => id === selection.id)
      && !document.landmarks.some(({ id }) => id === selection.id)) {
      this.model.clearSelection();
    } else if (selection.kind === 'entity' && selection.entityKind === 'map-anchor'
      && !document.anchors.some(({ id }) => id === selection.id)) {
      this.model.clearSelection();
    }
    this.clampCamera();
    this.invalidate();
  }

  private translateView(offset: MapPoint): void {
    if (offset.tileX === 0 && offset.tileY === 0) return;
    this.#camera = Object.freeze({
      ...this.#camera,
      x: this.#camera.x + offset.tileX * TILE_SIZE_PIXELS,
      y: this.#camera.y + offset.tileY * TILE_SIZE_PIXELS,
    });
    const selection = this.model.selection();
    if (selection.kind === 'tile') {
      this.model.selectTile(selection.tileX + offset.tileX, selection.tileY + offset.tileY);
    }
  }

  private localViewport(): UiRect { return { x: 0, y: 0, width: this.#viewport.width, height: this.#viewport.height }; }
  private localPoint(point: UiPoint): UiPoint { return { x: point.x - this.#viewport.x, y: point.y - this.#viewport.y }; }
  private contains(point: UiPoint): boolean {
    return point.x >= this.#viewport.x && point.y >= this.#viewport.y
      && point.x <= this.#viewport.x + this.#viewport.width
      && point.y <= this.#viewport.y + this.#viewport.height;
  }
}
