import { patchMapEditorTerrain } from './editor-terrain-patch.js';
import { terrainMinimumElevation, terrainMaximumElevation } from '@orchard/engine/terrain';
import { writeEditorMapOverviewPixel } from './editor-map-overview.js';
import { connectedObjectFamily, connectedObjectIndex } from '@orchard/sim';
import { drawConnectedObject } from '@orchard/engine/connected-objects';
import {
  TILE_SIZE_PIXELS,
  authoredMapContentPainterTie,
  isBreakableRockKind,
  isChoppableTreeKind,
  isGatherableResourceKind,
  isMineableOreKind,
  isWildlifeSpecies,
  mapLandmarkDecoration,
  treeGrowthStageName,
  runtimeResourceDefinition,
  type ContentRegistry,
  type MiningNodeClass,
  type MapDocumentV3,
  type MapGameplayAnchor,
  type MapGameplayAnchorKind,
} from '@orchard/sim';
import {
  drawTileRaster, drawTerrainInspectionVisuals, type TerrainInspection,
  GroundChunkCache,
  drawAuthoredOverworldObject,
  drawAnimatedTerrain,
  drawOverworldArcheryTarget,
  drawOverworldAvatar,
  drawOverworldBoat,
  drawOverworldChest,
  drawOverworldHorse,
  drawOverworldMerchant,
  drawOverworldOreNode,
  drawOverworldPlaceable,
  drawOverworldPoiDecoration,
  drawOverworldRock,
  drawOverworldRogueEnemy,
  drawOverworldStump,
  drawOverworldTree,
  drawAuthoredResourceVisual, authoredResourceVisual,
  drawOverworldTreeRegrowth,
  drawOverworldWildlife,
  enqueueLiveMapObjects,
  enqueueRaisedTerrainDepth,
  liveMapObjectAssetsReady,
  loadMapEditorArt,
  overworldPoiDecorationDepthY,
  preloadLiveMapObjectAssets,
  sortWorldDepthItems,
  terrainProjectedDepthAtFoot,
  terrainElevationAtWorldFoot,
  terrainProjectedDepthForElevation,
  terrainProjectedElevationAtFoot,
  terrainProjectedSortOffset,
  type OverworldArt,
  type TerrainArray,
  type WorldDepthItem,
} from '@orchard/engine';
import { authoredNpcArt, loadAuthoredNpcArt } from '@orchard/engine/authored-npc-art';
import {
  STUDIO_SKIN_TOKENS,
  drawUiIconAsset,
  loadGeneratedAsset,
  type LoadedAsset,
  type StudioSpatialArt,
  type UiIconName,
  type UiRect,
} from '@orchard/ui/studio';
import type { MapEditorController, MapEditorLiveMarker } from './editor-controller.js';
import {
  editorShowsObjectSprites,
  editorUsesOverviewLod,
  editorWorldCullBounds,
  type EditorWorldCullBounds,
} from './editor-viewport.js';
import type { MapEditorModel } from './model.js';
import { buildMapEditorTerrain } from './editor-terrain-build.js';
import { MapEditorTerrainLoader } from './editor-terrain-loader.js';
import {
  buildMapEditorTerrainDerivatives, mapTerrainOverrideInfluenceRuns,
  mapGeneratedBaseTerrainKey,
  type MapEditorTerrainDerivatives,
  type MapEditorTerrainInfluenceRun,
  type MapOverviewLayer,
} from './editor-terrain-derivatives.js';
import {
  mapEditorAuthoredDragFootprint,
  type MapEditorSelectionFootprintCell,
} from './selection-footprint.js';
import type { MapEditorTransitionPlan } from './transition-authoring.js';
import {
  MapEditorOverlayCache,
  drawActiveMapEditorOverlays,
} from './active-overlays.js';
import { IncrementalMapOverviewCache } from './editor-overview-cache.js';
import {
  OFFLINE_TERRAIN_AUTHORING_PALETTE,
  type TerrainAuthoringPalette,
} from './terrain-authoring-palette.js';
import { resolveStudioLiveMarkerPresentation } from './live-marker-presentation.js';

export {
  mapEditorAuthoredObjectFootprint,
  mapEditorAuthoredDragFootprint,
  type MapEditorSelectionFootprintCell,
} from './selection-footprint.js';

export {
  mapGeneratedBaseDocument,
  mapGeneratedBaseTerrainKey,
  mapTerrainOverrideInfluenceRuns,
  type MapEditorTerrainInfluenceRun,
  type MapOverviewLayer,
} from './editor-terrain-derivatives.js';

export interface VisibleTileRange {
  readonly minimumX: number;
  readonly minimumY: number;
  readonly maximumX: number;
  readonly maximumY: number;
}

export interface MapGameplayAnchorMarkerVisual {
  readonly icon: UiIconName;
  readonly color: string;
}

const MAP_GAMEPLAY_ANCHOR_MARKERS: Readonly<Record<
  MapGameplayAnchorKind,
  MapGameplayAnchorMarkerVisual
>> = Object.freeze({
  spawn: { icon: 'gamepad', color: STUDIO_SKIN_TOKENS.green },
  portal: { icon: 'map', color: STUDIO_SKIN_TOKENS.purple },
  poi: { icon: 'pointer', color: STUDIO_SKIN_TOKENS.amber },
  npc: { icon: 'pointer', color: STUDIO_SKIN_TOKENS.blue },
  resource: { icon: 'trees', color: STUDIO_SKIN_TOKENS.greenDark },
  label: { icon: 'landPlot', color: STUDIO_SKIN_TOKENS.wood },
});

export function mapGameplayAnchorMarkerVisual(
  kind: MapGameplayAnchorKind,
): MapGameplayAnchorMarkerVisual {
  return MAP_GAMEPLAY_ANCHOR_MARKERS[kind];
}

export function visibleMapGameplayAnchors(
  anchors: readonly MapGameplayAnchor[],
  range: VisibleTileRange,
): readonly MapGameplayAnchor[] {
  return anchors.filter((anchor) => anchor.tileX >= range.minimumX
    && anchor.tileX < range.maximumX && anchor.tileY >= range.minimumY
    && anchor.tileY < range.maximumY);
}

export function mapGameplayAnchorMarkerScreenPosition(
  anchor: MapGameplayAnchor,
  terrain: TerrainArray,
  viewport: UiRect,
  camera: { readonly x: number; readonly y: number; readonly zoom: number },
): { readonly x: number; readonly y: number } {
  return {
    x: viewport.x + (anchor.tileX * TILE_SIZE_PIXELS + TILE_SIZE_PIXELS / 2 - camera.x)
      * camera.zoom,
    y: viewport.y + (anchor.tileY * TILE_SIZE_PIXELS + TILE_SIZE_PIXELS / 2
      - terrainProjectedDepthForElevation(terrain, anchor.elevation) - camera.y) * camera.zoom,
  };
}

export type MapEditorTerrainRenderMode = 'none' | 'overview' | 'detail';

interface MapEditorTransitionPreviewSegment {
  readonly lower: { readonly tileX: number; readonly tileY: number; readonly elevation: number };
  readonly upper: { readonly tileX: number; readonly tileY: number; readonly elevation: number };
}

export function mapEditorTransitionPreviewSegments(
  plan: MapEditorTransitionPlan,
): readonly MapEditorTransitionPreviewSegment[] {
  if (plan.transitions.length === 0) return [{ lower: plan.from, upper: plan.to }];
  return plan.transitions.map((transition) => ({
    lower: {
      tileX: transition.lowerTileX,
      tileY: transition.lowerTileY,
      elevation: transition.contourLevel - 1,
    },
    upper: {
      tileX: transition.upperTileX,
      tileY: transition.upperTileY,
      elevation: transition.contourLevel,
    },
  }));
}

function drawMapEditorTransitionPreview(
  context: CanvasRenderingContext2D,
  plan: MapEditorTransitionPlan,
  terrain: TerrainArray | null,
  viewport: UiRect,
  camera: { readonly x: number; readonly y: number; readonly zoom: number },
): void {
  const point = (tileX: number, tileY: number, elevation: number): readonly [number, number] => {
    const projection = terrain === null ? 0 : terrainProjectedDepthForElevation(terrain, elevation);
    return [
      viewport.x + (tileX * TILE_SIZE_PIXELS + TILE_SIZE_PIXELS / 2 - camera.x) * camera.zoom,
      viewport.y + (tileY * TILE_SIZE_PIXELS + TILE_SIZE_PIXELS / 2 - projection - camera.y) * camera.zoom,
    ];
  };
  context.save();
  context.beginPath();
  context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  context.strokeStyle = plan.error === null ? '#b9f6bd' : '#ff8f82';
  context.fillStyle = context.strokeStyle;
  context.lineWidth = 2;
  context.setLineDash(plan.error === null ? [] : [5, 3]);
  for (const segment of mapEditorTransitionPreviewSegments(plan)) {
    const lower = point(segment.lower.tileX, segment.lower.tileY, segment.lower.elevation);
    const upper = point(segment.upper.tileX, segment.upper.tileY, segment.upper.elevation);
    context.beginPath();
    context.moveTo(lower[0], lower[1]);
    context.lineTo(upper[0], upper[1]);
    context.stroke();
    const markerSize = Math.max(4, Math.min(8, TILE_SIZE_PIXELS * camera.zoom * 0.4));
    context.fillRect(Math.round(lower[0] - markerSize / 2), Math.round(lower[1] - markerSize / 2), markerSize, markerSize);
    context.fillRect(Math.round(upper[0] - markerSize / 2), Math.round(upper[1] - markerSize / 2), markerSize, markerSize);
  }
  context.restore();
}

interface MapEditorDetailedTerrainPass {
  readonly terrain: TerrainArray;
  readonly groundCache: GroundChunkCache;
  readonly clipRuns: readonly MapEditorTerrainInfluenceRun[] | null;
}

export interface MapEditorSelectionFootprintRect {
  readonly tile: UiRect;
  readonly collision: readonly UiRect[];
}

export function visibleMapSelectionFootprint(
  cells: readonly MapEditorSelectionFootprintCell[],
  range: VisibleTileRange,
): readonly MapEditorSelectionFootprintCell[] {
  return cells.filter(({ tileX, tileY }) => tileX >= range.minimumX - 1
    && tileX <= range.maximumX + 1 && tileY >= range.minimumY - 1
    && tileY <= range.maximumY + 1);
}

export function mapEditorSelectionFootprintRects(
  cells: readonly MapEditorSelectionFootprintCell[],
  terrain: TerrainArray,
  viewport: UiRect,
  camera: { readonly x: number; readonly y: number; readonly zoom: number },
): readonly MapEditorSelectionFootprintRect[] {
  const tileSize = TILE_SIZE_PIXELS * camera.zoom;
  const quarterSize = tileSize / 4;
  return cells.map((cell) => {
    const projection = terrainProjectedDepthForElevation(terrain, cell.elevation);
    const tile = {
      x: viewport.x + (cell.tileX * TILE_SIZE_PIXELS - camera.x) * camera.zoom,
      y: viewport.y + (cell.tileY * TILE_SIZE_PIXELS - projection - camera.y) * camera.zoom,
      width: tileSize,
      height: tileSize,
    };
    const collision: UiRect[] = [];
    for (let bit = 0; bit < 16; bit += 1) {
      if ((cell.collisionMask & (1 << bit)) === 0) continue;
      collision.push({
        x: tile.x + bit % 4 * quarterSize,
        y: tile.y + Math.floor(bit / 4) * quarterSize,
        width: quarterSize,
        height: quarterSize,
      });
    }
    return { tile, collision };
  });
}

function drawMapEditorSelectionFootprint(
  context: CanvasRenderingContext2D,
  cells: readonly MapEditorSelectionFootprintCell[],
  terrain: TerrainArray,
  viewport: UiRect,
  camera: { readonly x: number; readonly y: number; readonly zoom: number },
): void {
  const rects = mapEditorSelectionFootprintRects(cells, terrain, viewport, camera);
  if (rects.length === 0) return;
  context.save();
  context.fillStyle = `${STUDIO_SKIN_TOKENS.amber}30`;
  for (const { tile } of rects) {
    context.fillRect(Math.round(tile.x), Math.round(tile.y),
      Math.max(1, Math.round(tile.width)), Math.max(1, Math.round(tile.height)));
  }
  context.fillStyle = `${STUDIO_SKIN_TOKENS.danger}70`;
  for (const { collision } of rects) {
    for (const quarter of collision) {
      context.fillRect(Math.round(quarter.x), Math.round(quarter.y),
        Math.max(1, Math.ceil(quarter.width)), Math.max(1, Math.ceil(quarter.height)));
    }
  }
  for (const [color, width] of [
    [STUDIO_SKIN_TOKENS.woodDark, 4],
    [STUDIO_SKIN_TOKENS.parchmentLight, 2],
  ] as const) {
    context.strokeStyle = color;
    context.lineWidth = width;
    for (const { tile } of rects) {
      context.strokeRect(Math.round(tile.x), Math.round(tile.y),
        Math.max(1, Math.round(tile.width)), Math.max(1, Math.round(tile.height)));
    }
  }
  context.restore();
}

function drawMapGameplayAnchorMarkers(
  context: CanvasRenderingContext2D,
  art: StudioSpatialArt,
  anchors: readonly MapGameplayAnchor[],
  terrain: TerrainArray,
  viewport: UiRect,
  camera: { readonly x: number; readonly y: number; readonly zoom: number },
  selection: ReturnType<MapEditorModel['selection']>,
): void {
  if (anchors.length === 0) return;
  context.save();
  context.beginPath();
  context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  for (const anchor of anchors) {
    const point = mapGameplayAnchorMarkerScreenPosition(anchor, terrain, viewport, camera);
    const visual = mapGameplayAnchorMarkerVisual(anchor.kind);
    const selected = selection.kind === 'entity' && selection.entityKind === 'map-anchor'
      && selection.id === anchor.id && selection.spaceId === 0;
    const size = Math.max(16, Math.min(26, Math.round(18 * Math.max(1, camera.zoom))));
    const radius = size / 2;
    const markerX = Math.round(point.x);
    const markerY = Math.round(point.y);
    context.fillStyle = visual.color;
    context.strokeStyle = selected ? STUDIO_SKIN_TOKENS.parchmentLight : STUDIO_SKIN_TOKENS.ink;
    context.lineWidth = selected ? 3 : 2;
    context.beginPath();
    context.moveTo(markerX, markerY - radius);
    context.lineTo(markerX + radius, markerY);
    context.lineTo(markerX, markerY + radius);
    context.lineTo(markerX - radius, markerY);
    context.lineTo(markerX, markerY - radius);
    context.fill();
    context.stroke();
    const iconSize = Math.max(12, size - 6);
    const icon = art.skin?.icons?.[visual.icon];
    if (icon !== undefined) drawUiIconAsset(context, icon, {
        x: Math.round(point.x - iconSize / 2),
        y: Math.round(point.y - iconSize / 2),
        width: iconSize,
        height: iconSize,
      }, 1, 'brightness(0) invert(1)');

  }
  context.restore();
}

/** The retained production terrain compositor is deliberately more expensive
 * than the semantic map raster. Keep its close-up pass bounded even on very
 * large monitors: the previous backing-store-only threshold could admit more
 * than 30,000 terrain cells into one synchronous frame. */
export const MAX_EDITOR_DETAILED_TILES = 20_000;
export const EDITOR_ART_RETRY_INITIAL_MS = 1_000;
export const EDITOR_ART_RETRY_MAXIMUM_MS = 60_000;

/** Keep tree/resource markers visible at overview zoom; only flat surfaces collapse. */
export function mapEditorOverviewLiveMarkerVisible(
  marker: Pick<MapEditorLiveMarker, 'entityKind'>,
): boolean {
  return marker.entityKind !== 'surface';
}

export function editorArtRetryDelayMs(failureCount: number): number {
  const exponent = Number.isFinite(failureCount)
    ? Math.max(0, Math.min(16, Math.floor(failureCount) - 1))
    : 0;
  return Math.min(EDITOR_ART_RETRY_MAXIMUM_MS, EDITOR_ART_RETRY_INITIAL_MS * 2 ** exponent);
}

export function editorDetailedTileEstimate(
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  const safeZoom = Math.max(1 / 128, zoom);
  // Raised terrain and animated overlays inspect a border outside the view.
  const columns = Math.ceil(viewportWidth / (TILE_SIZE_PIXELS * safeZoom)) + 16;
  const rows = Math.ceil(viewportHeight / (TILE_SIZE_PIXELS * safeZoom)) + 16;
  return columns * rows;
}

export function mapOverviewLayerForVisibility(
  generatedBaseVisible: boolean,
  terrainOverridesVisible: boolean,
): MapOverviewLayer | null {
  if (generatedBaseVisible && terrainOverridesVisible) return 'combined';
  if (generatedBaseVisible) return 'generated_base';
  if (terrainOverridesVisible) return 'terrain';
  return null;
}

export const mapDetailedTerrainLayerForVisibility = mapOverviewLayerForVisibility;

export function mapEditorTerrainRenderMode(
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  detailedArtReady: boolean,
  generatedBaseVisible: boolean,
  terrainOverridesVisible: boolean,
): MapEditorTerrainRenderMode {
  if (!generatedBaseVisible && !terrainOverridesVisible) return 'none';
  if (detailedArtReady && (generatedBaseVisible || terrainOverridesVisible)
    && !editorUsesOverviewLod(zoom, viewportWidth, viewportHeight)
    && editorDetailedTileEstimate(zoom, viewportWidth, viewportHeight)
      <= MAX_EDITOR_DETAILED_TILES) return 'detail';
  return 'overview';
}


function pointInsideCull(bounds: EditorWorldCullBounds, worldX: number, worldY: number): boolean {
  return worldX >= bounds.minimumX && worldY >= bounds.minimumY
    && worldX <= bounds.maximumX && worldY <= bounds.maximumY;
}

export function visibleMapTileRange(
  document: Pick<MapDocumentV3, 'width' | 'height'>,
  viewport: UiRect,
  camera: { readonly x: number; readonly y: number; readonly zoom: number },
): VisibleTileRange {
  const worldWidth = viewport.width / Math.max(1 / 128, camera.zoom);
  const worldHeight = viewport.height / Math.max(1 / 128, camera.zoom);
  return {
    minimumX: Math.max(0, Math.floor(camera.x / TILE_SIZE_PIXELS)),
    minimumY: Math.max(0, Math.floor(camera.y / TILE_SIZE_PIXELS)),
    maximumX: Math.min(document.width, Math.ceil((camera.x + worldWidth) / TILE_SIZE_PIXELS)),
    maximumY: Math.min(document.height, Math.ceil((camera.y + worldHeight) / TILE_SIZE_PIXELS)),
  };
}

/** A one-semantic-pixel-per-tile island cache. The expensive terrain compile
 * happens only when terrain changes; content, pan, zoom and shell redraws
 * reuse it, and each draw copies only the visible source rectangle. */
export class MapEditorRenderer {
  #selectionMask: HTMLCanvasElement | null = null;
  #terrainIdentity: object | null = null;
  #terrainPendingIdentity: object | null = null;
  #terrain: TerrainArray | null = null;
  #terrainDocument: MapDocumentV3 | null = null;
  #terrainDerivativesReady=false;
  #overviewElevationRange={minimum:0,maximum:0};
  #generatedBaseTerrainKey = '';
  #generatedBaseTerrain: TerrainArray | null = null;
  #terrainOverrideInfluenceRuns: readonly MapEditorTerrainInfluenceRun[] | null = null;
  #terrainFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  #terrainDerivationTimer: ReturnType<typeof setTimeout> | null = null;
  #groundCache = new GroundChunkCache();
  #generatedBaseGroundCache = new GroundChunkCache();
  #art: OverworldArt | null = null;
  #artRequest: Promise<void> | null = null;
  #artFailureCount = 0;
  #artRetryAt = 0;
  #artWarningShown = false;
  #liveContentKey = '';
  #liveRegistry: ContentRegistry | null = null;
  readonly #liveObjectAssets = new Map<string, LoadedAsset | null>();
  readonly #liveObjectAssetRequests = new Set<string>();
  #liveNpcArtRequest = 0;
  #prefabAssetDocument: MapDocumentV3 | null = null;
  #disposed = false;
  readonly #terrainLoader = new MapEditorTerrainLoader();
  readonly #overlayCache: MapEditorOverlayCache;
  readonly #overviewCache: IncrementalMapOverviewCache<HTMLCanvasElement>;
  #terrainPalette: TerrainAuthoringPalette;

  constructor(
    private readonly invalidate: () => void = () => undefined,
    terrainPalette: TerrainAuthoringPalette = OFFLINE_TERRAIN_AUTHORING_PALETTE,
  ) {
    this.#terrainPalette = terrainPalette;
    this.#overlayCache = new MapEditorOverlayCache(
      (width, height) => this.overlayImage(width, height),
      invalidate,
    );
    this.#overviewCache = new IncrementalMapOverviewCache(
      (width, height, pixels) => this.image(width, height, pixels),
      (image) => {
        image.width = 0;
        image.height = 0;
      },
      invalidate,
    );
  }

  setLiveContent(key: string, registry: ContentRegistry | null): boolean {
    if (key === this.#liveContentKey && registry === this.#liveRegistry) return false;
    this.#liveContentKey = key;
    this.#liveRegistry = registry;
    this.#liveObjectAssets.clear();
    this.#liveObjectAssetRequests.clear();
    this.#scheduleLiveNpcArt();
    return true;
  }

  setTerrainAuthoringPalette(palette: TerrainAuthoringPalette): boolean {
    if (palette.contentKey === this.#terrainPalette.contentKey) return false;
    this.#terrainPalette = palette;
    this.#terrainIdentity = null;
    this.#terrainPendingIdentity = null;
    this.#terrain = null;
    this.#generatedBaseTerrain = null;
    this.#terrainOverrideInfluenceRuns = null;
    this.#groundCache = new GroundChunkCache();
    this.#generatedBaseGroundCache = new GroundChunkCache();
    this.#overviewCache.clear();
    return true;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#terrainLoader.dispose();
    this.#overlayCache.dispose();
    this.#overviewCache.dispose();
    if (this.#terrainFallbackTimer !== null) clearTimeout(this.#terrainFallbackTimer);
    this.#terrainFallbackTimer = null;
    if (this.#terrainDerivationTimer !== null) clearTimeout(this.#terrainDerivationTimer);
    this.#terrainDerivationTimer = null;
    this.#terrainPendingIdentity = null;
    this.#terrain = null;
    this.#generatedBaseTerrain = null;
    this.#terrainOverrideInfluenceRuns = null;
    this.#prefabAssetDocument = null;
  }

  /** Explicit user-action hook for retry buttons or route-level recovery. */
  retryDetailedArt(): void {
    if (this.#disposed) return;
    if (this.#art !== null || this.#artRequest !== null) return;
    this.#artRetryAt = 0;
    this.invalidate();
  }

  drawTileInspection(context:CanvasRenderingContext2D,inspection:TerrainInspection):void {
    if(this.#art&&this.#terrain)drawTerrainInspectionVisuals(context,this.#art,this.#terrain,this.#groundCache,inspection,0,0);
  }

  /** Inspector images use the same loaded assets as the map. */
  liveMarkerPreview(marker:MapEditorLiveMarker):{image:CanvasImageSource;frame:import('@orchard/ui').AtlasFrame}|undefined {
    if(this.#art===null||this.#liveRegistry===null)return undefined;
    if(marker.entityKind==='resource') {
      const definition=runtimeResourceDefinition(this.#liveRegistry,marker);if(!definition)return undefined;
      const growth=treeGrowthStageName(marker.growthStage??3);
      const state=marker.depleted?(growth==='small'?'depleted_small':growth==='medium'?'depleted_medium':'depleted'):growth==='small'||growth==='medium'?growth:'mature';
      const resolved=authoredResourceVisual(this.#art,definition.visual,state);
      if(!resolved)return undefined;
      const frame=Object.values(resolved.asset.metadata.states??{})[0]??Object.values(resolved.asset.metadata.variants??{})[0]?.[0]??resolved.asset.metadata.animations['base']?.[0]??Object.values(resolved.asset.metadata.animations)[0]?.[0];
      return frame?{image:resolved.asset.image,frame}:undefined;
    }
    const presentation=resolveStudioLiveMarkerPresentation(this.#liveRegistry,marker);
    if(presentation.kind==='npc') {
      const asset=authoredNpcArt(this.#art,presentation.runtimeKind);
      const frame=asset&&Object.values(asset.metadata.animations)[0]?.[0];
      return asset&&frame?{image:asset.image,frame}:undefined;
    }
    if(presentation.kind==='object') {
      const sprite=presentation.definition.components.sprite;if(!sprite)return undefined;
      this.ensureLiveObjectAsset(sprite.asset);const asset=this.#liveObjectAssets.get(sprite.asset);
      const frame=asset?.metadata.animations['base']?.[0]??(asset&&Object.values(asset.metadata.animations)[0]?.[0]);
      return asset&&frame?{image:asset.image,frame}:undefined;
    }
    return undefined;
  }

  landmarkPreview(kind:string):{image:CanvasImageSource;frame:import('@orchard/ui').AtlasFrame}|undefined {
    const asset=this.#art?.poiDecorations[kind];
    const frame=asset&&(asset.metadata.animations['base']?.[0]??Object.values(asset.metadata.animations)[0]?.[0]);
    return asset&&frame?{image:asset.image,frame}:undefined;
  }

  /** Inspection adopts only a completed terrain matching the current draft. */
  inspectionTerrain(terrainIdentity: object): TerrainArray | null {
    return this.#terrainIdentity === terrainIdentity ? this.#terrain : null;
  }

  /** Starts the same worker-backed terrain request used by draw(), allowing
   * the first inspector selection to reuse it without owning a compile path. */
  prepareInspectionTerrain(document: MapDocumentV3, terrainIdentity: object): void {
    if (this.#disposed) return;
    this.terrainFor(document, terrainIdentity);
  }

  draw(
    context: CanvasRenderingContext2D,
    model: MapEditorModel,
    interaction: MapEditorController,
    gridVisible: boolean,
    shellArt: StudioSpatialArt,
  ): void {
    if (this.#disposed) return;
    const sourceDocument = model.document();
    const drag = interaction.snapshot().dragDestination;
    const document:MapDocumentV3 = drag===null?sourceDocument:{...sourceDocument,
      objects:drag.kind==='object'?sourceDocument.objects.map(object=>object.id===drag.id?{...object,tileX:drag.tileX,tileY:drag.tileY,elevation:drag.elevation}:object):sourceDocument.objects,
      landmarks:drag.kind==='landmark'?sourceDocument.landmarks.map(object=>object.id===drag.id?{...object,tileX:drag.tileX,tileY:drag.tileY,elevation:drag.elevation}:object):sourceDocument.landmarks};
    const {
      camera,
      viewport,
      dragDestination,
      transitionPreview,
      activeElevation,
      heightOverlayVisible,
      collisionOverlayVisible,
    } = interaction.snapshot();
    const generatedBaseVisible = model.isLayerVisible('generated_base');
    const terrainOverridesVisible = model.isLayerVisible('terrain');
    const closeEnoughForDetail = !editorUsesOverviewLod(camera.zoom, viewport.width, viewport.height);
    const wantsObjectSprites = editorShowsObjectSprites(camera.zoom);
    const art = closeEnoughForDetail || wantsObjectSprites ? this.detailedArt(shellArt) : null;
    const terrainMode = mapEditorTerrainRenderMode(
      camera.zoom,
      viewport.width,
      viewport.height,
      art !== null,
      generatedBaseVisible,
      terrainOverridesVisible,
    );
    const overviewLayer = mapOverviewLayerForVisibility(
      generatedBaseVisible,
      terrainOverridesVisible,
    );
    const anchorsVisible = model.isLayerVisible('anchors') && document.anchors.length > 0;
    const needsTerrain = terrainMode !== 'none' || (art !== null && wantsObjectSprites) || anchorsVisible;
    const terrain = needsTerrain ? this.terrainFor(sourceDocument, model.terrainIdentity()) : null;
    if (terrain !== null && this.#terrainIdentity === model.terrainIdentity()) interaction.adoptPickingTerrain(model.terrainGeometryIdentity(), terrain);
    const detailedLayer = terrainMode === 'detail'
      ? mapDetailedTerrainLayerForVisibility(generatedBaseVisible, terrainOverridesVisible)
      : null;
    const generatedBaseTerrain = terrain !== null
      && (detailedLayer === 'generated_base' || detailedLayer === 'terrain')
      ? this.generatedBaseTerrainFor(document, model.terrainIdentity())
      : null;
    let detailedTerrain: MapEditorDetailedTerrainPass | null = null;
    if (detailedLayer === 'combined' && terrain !== null) {
      detailedTerrain = { terrain, groundCache: this.#groundCache, clipRuns: null };
    } else if (detailedLayer === 'generated_base' && generatedBaseTerrain !== null) {
      detailedTerrain = {
        terrain: generatedBaseTerrain,
        groundCache: this.#generatedBaseGroundCache,
        clipRuns: null,
      };
    } else if (detailedLayer === 'terrain' && terrain !== null && generatedBaseTerrain !== null) {
      const clipRuns = this.#terrainOverrideInfluenceRuns ?? [];
      // A transparent empty authored layer needs no production terrain work.
      if (clipRuns.length > 0) {
        detailedTerrain = { terrain, groundCache: this.#groundCache, clipRuns };
      }
    }
    const range = visibleMapTileRange(document, viewport, camera);
    context.save();
    context.imageSmoothingEnabled = false;
    const sourceWidth = range.maximumX - range.minimumX;
    const sourceHeight = range.maximumY - range.minimumY;
    if (terrainMode === 'overview' && sourceWidth > 0 && sourceHeight > 0
      && overviewLayer !== null && terrain !== null) {
      const overview = this.#overviewCache.image(this.#terrainIdentity ?? model.terrainIdentity(), overviewLayer);
      if (overview !== null) {
        drawTileRaster(context, overview, range, viewport, camera);
      }
    }

    const artworkVisible = art !== null && terrain !== null && wantsObjectSprites;
    const prefabArtworkVisible = artworkVisible && liveMapObjectAssetsReady(document);
    if (artworkVisible && !prefabArtworkVisible) this.preloadPrefabAssets(document);
    if (art !== null && terrain !== null && (terrainMode === 'detail' || artworkVisible)) {
      this.drawDetailed(
        context,
        art,
        terrain,
        document,
        model,
        interaction,
        viewport,
        camera,
        detailedTerrain,
        prefabArtworkVisible,
        artworkVisible,
      );
    }

    if (gridVisible && TILE_SIZE_PIXELS * camera.zoom >= 5) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.52)';
      context.lineWidth = 1;
      context.beginPath();
      for (let tileX = range.minimumX; tileX <= range.maximumX; tileX += 1) {
        const x = Math.round(viewport.x + (tileX * TILE_SIZE_PIXELS - camera.x) * camera.zoom) + 0.5;
        context.moveTo(x, viewport.y);
        context.lineTo(x, viewport.y + viewport.height);
      }
      for (let tileY = range.minimumY; tileY <= range.maximumY; tileY += 1) {
        const y = Math.round(viewport.y + (tileY * TILE_SIZE_PIXELS - camera.y) * camera.zoom) + 0.5;
        context.moveTo(viewport.x, y);
        context.lineTo(viewport.x + viewport.width, y);
      }
      context.stroke();
    }

    if (terrain !== null) drawActiveMapEditorOverlays(
      context,
      document,
      terrain,
      range,
      viewport,
      camera,
      activeElevation,
      { height: heightOverlayVisible, collision: collisionOverlayVisible },
      this.#overlayCache,
      generatedBaseVisible || terrainOverridesVisible,
    );

    if (transitionPreview !== null) {
      drawMapEditorTransitionPreview(context, transitionPreview, terrain, viewport, camera);
    }

    if (anchorsVisible && terrain !== null) drawMapGameplayAnchorMarkers(
      context,
      shellArt,
      visibleMapGameplayAnchors(document.anchors, range),
      terrain,
      viewport,
      camera,
      model.selection(),
    );

    const selection = model.selection();
    const marker = (id: string, tileX: number, tileY: number, color: string, enabled: boolean,
      entityKind = 'map-object', spaceId = 0, artworkRendered = false,
      worldX = tileX * TILE_SIZE_PIXELS + TILE_SIZE_PIXELS / 2,
      worldY = (tileY + 1) * TILE_SIZE_PIXELS): void => {
      const x = viewport.x + (worldX - camera.x) * camera.zoom;
      const projection = wantsObjectSprites && terrain !== null
        ? terrainProjectedDepthAtFoot(terrain, worldX, worldY)
        : 0;
      const y = viewport.y
        + (worldY - TILE_SIZE_PIXELS / 2 - projection - camera.y) * camera.zoom;
      const selected = selection.kind === 'player' ? entityKind === 'player'
        && selection.identity === id && (selection.spaceId === null || selection.spaceId === spaceId)
        : selection.kind === 'entity' && selection.entityKind === entityKind
          && selection.id === id && selection.spaceId === spaceId;
      const radius = Math.max(3, Math.min(9, TILE_SIZE_PIXELS * camera.zoom * 0.38));
      if (!artworkRendered || !enabled) {
        context.fillStyle = enabled ? color : 'rgba(110, 110, 110, 0.62)';
        context.fillRect(Math.round(x - radius), Math.round(y - radius), Math.ceil(radius * 2), Math.ceil(radius * 2));
      }
      if (selected && (!wantsObjectSprites || terrain === null)) {
        context.strokeStyle = '#ffffff';
        context.lineWidth = 2;
        context.strokeRect(Math.round(x - radius - 2), Math.round(y - radius - 2), Math.ceil(radius * 2 + 4), Math.ceil(radius * 2 + 4));
      }
    };
    for (const landmark of document.landmarks) {
      if (!model.isLayerVisible(landmark.layer)) continue;
      if (landmark.tileX < range.minimumX || landmark.tileX >= range.maximumX
        || landmark.tileY < range.minimumY || landmark.tileY >= range.maximumY) continue;
      marker(landmark.id, landmark.tileX, landmark.tileY, '#f3d37a', landmark.enabled,
        'map-object', 0, artworkVisible && landmark.enabled);
    }
    for (const object of document.objects) {
      if (!model.isLayerVisible(object.layer)) continue;
      if (object.tileX < range.minimumX || object.tileX >= range.maximumX
        || object.tileY < range.minimumY || object.tileY >= range.maximumY) continue;
      marker(object.id, object.tileX, object.tileY, '#8ad7dd', object.enabled,
        'map-object', 0, prefabArtworkVisible && object.enabled);
    }
    for (const live of interaction.liveMarkers()) {
      const selectedAtOverview = selection.kind === 'player'
        ? live.entityKind === 'player' && live.id === selection.identity
          && (selection.spaceId === null || live.spaceId === selection.spaceId)
        : selection.kind === 'entity' && live.entityKind === selection.entityKind
          && live.id === selection.id && live.spaceId === selection.spaceId;
      if ((!wantsObjectSprites && !selectedAtOverview && !mapEditorOverviewLiveMarkerVisible(live))
        || !model.isLayerVisible(live.layer)
        || live.tileX < range.minimumX || live.tileX >= range.maximumX
        || live.tileY < range.minimumY || live.tileY >= range.maximumY) continue;
      marker(live.id, live.tileX, live.tileY, live.color, true, live.entityKind,
        live.spaceId, artworkVisible && this.liveMarkerHasArtwork(live), live.worldX, live.worldY);
    }
    if(wantsObjectSprites&&terrain!==null)this.drawSelectedSilhouette(context,model,interaction,terrain,viewport,camera);
    if (dragDestination !== null) {
      context.setLineDash([5, 3]);
      const draggedObject = dragDestination.kind === 'object'
        ? document.objects.find(({ id }) => id === dragDestination.id) : undefined;
      if (draggedObject !== undefined && terrain !== null) {
        const preview = mapEditorAuthoredDragFootprint(document, draggedObject, {
          tileX: dragDestination.tileX,
          tileY: dragDestination.tileY,
          elevation: dragDestination.elevation,
        });
        drawMapEditorSelectionFootprint(
          context,
          visibleMapSelectionFootprint(preview, range),
          terrain,
          viewport,
          camera,
        );
      } else {
        const x = viewport.x + (dragDestination.tileX * TILE_SIZE_PIXELS - camera.x) * camera.zoom;
        const projection = terrain === null ? 0
          : terrainProjectedDepthForElevation(terrain, dragDestination.elevation);
        const y = viewport.y
          + (dragDestination.tileY * TILE_SIZE_PIXELS - projection - camera.y) * camera.zoom;
        const size = Math.max(5, TILE_SIZE_PIXELS * camera.zoom);
        context.strokeStyle = STUDIO_SKIN_TOKENS.parchmentLight;
        context.lineWidth = 2;
        context.strokeRect(Math.round(x), Math.round(y), Math.round(size), Math.round(size));
      }
      context.setLineDash([]);
    }
    context.restore();
  }

  private terrainFor(mapDocument: MapDocumentV3, terrainIdentity: object): TerrainArray | null {
    if (this.#terrainIdentity === terrainIdentity && this.#terrain !== null) return this.#terrain;
    const retained = this.#terrainDocument?.id===mapDocument.id && this.#terrain?.width===mapDocument.width
      &&this.#terrain.height===mapDocument.height ? this.#terrain : null;
    if (this.#terrainPendingIdentity === terrainIdentity) return retained;
    const patch=retained&&this.#terrainDocument&&this.#terrainDerivativesReady?patchMapEditorTerrain(retained,this.#terrainDocument,mapDocument):null;
    if(patch) {
      if(this.#terrainDerivationTimer!==null)clearTimeout(this.#terrainDerivationTimer);
      this.#terrainDerivationTimer=null;
      this.#groundCache.adoptSparseTerrain(retained!,patch.terrain,patch.changed);
      this.#terrain=patch.terrain;this.#terrainIdentity=terrainIdentity;this.#terrainDocument=mapDocument;this.#terrainPendingIdentity=null;
      this.#overviewCache.adoptSparse(terrainIdentity,(image,layer)=>{
        if(layer==='generated_base')return;
        const ctx=image.getContext('2d');if(!ctx)return;const pixel=new Uint8ClampedArray(4);
        for(const point of patch.changed){const index=point.tileY*mapDocument.width+point.tileX;
          if(layer==='terrain'&&!mapDocument.cells[`${point.tileX},${point.tileY}`]){ctx.clearRect(point.tileX,point.tileY,1,1);continue;}
          writeEditorMapOverviewPixel(pixel,0,patch.terrain.biomes[index]!,patch.terrain.elevations[index]!,this.#overviewElevationRange.minimum,this.#overviewElevationRange.maximum);
          ctx.fillStyle=`rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;ctx.fillRect(point.tileX,point.tileY,1,1);}
      });
      // Sparse edits retain the previous full overview and base. Only isolated
      // terrain-layer clipping needs a deferred derivative scan.
      this.#terrainDerivationTimer=setTimeout(()=>{
        this.#terrainDerivationTimer=null;
        if(this.#terrainIdentity!==terrainIdentity||this.#disposed)return;
        if(this.#generatedBaseTerrain)this.#terrainOverrideInfluenceRuns=mapTerrainOverrideInfluenceRuns(patch.terrain,this.#generatedBaseTerrain);
        this.invalidate();
      },0);
      return patch.terrain;
    }
    if (this.#terrainFallbackTimer !== null) clearTimeout(this.#terrainFallbackTimer);
    this.#terrainFallbackTimer = null;
    if (this.#terrainDerivationTimer !== null) clearTimeout(this.#terrainDerivationTimer);
    this.#terrainDerivationTimer = null;
    const pending = this.#terrainLoader.load(mapDocument, this.#terrainPalette);
    if (pending !== null) {
      this.#terrainPendingIdentity = terrainIdentity;
      void pending.then(({ terrain, derivatives }) => {
        if (this.#disposed || this.#terrainPendingIdentity !== terrainIdentity) return;
        this.acceptTerrain(mapDocument, terrainIdentity, terrain, derivatives);
        this.invalidate();
      }).catch((error: unknown) => {
        if (this.#disposed || this.#terrainPendingIdentity !== terrainIdentity) return;
        this.#terrainPendingIdentity = null;
        console.warn('Studio map terrain worker failed; using the compatibility renderer', error);
        this.invalidate();
      });
      return retained;
    }
    // A module worker can be unavailable in tests, embedded webviews, or a
    // browser with a restrictive worker policy. Preserve that compatibility
    // without moving the complete terrain compiler back into draw().
    this.#terrainPendingIdentity = terrainIdentity;
    this.#terrainFallbackTimer = setTimeout(() => {
      this.#terrainFallbackTimer = null;
      if (this.#disposed || this.#terrainPendingIdentity !== terrainIdentity) return;
      try {
        this.acceptTerrain(
          mapDocument,
          terrainIdentity,
          buildMapEditorTerrain(mapDocument, this.#terrainPalette),
        );
        this.invalidate();
      } catch (error) {
        if (this.#terrainPendingIdentity !== terrainIdentity) return;
        this.#terrainPendingIdentity = null;
        console.warn('Studio map terrain compatibility renderer failed', error);
      }
    }, 0);
    return retained;
  }

  private acceptTerrain(
    mapDocument: MapDocumentV3,
    terrainIdentity: object,
    terrain: TerrainArray,
    derivatives?: MapEditorTerrainDerivatives,
  ): TerrainArray {
    if (this.#terrainDerivationTimer !== null) clearTimeout(this.#terrainDerivationTimer);
    this.#terrainDerivationTimer = null;
    this.#terrain = terrain;
    this.#terrainDocument = mapDocument;
    this.#terrainDerivativesReady=false;
    this.#overviewElevationRange={minimum:Math.min(0,terrainMinimumElevation(terrain)),maximum:Math.max(0,terrainMaximumElevation(terrain))};
    this.#terrainIdentity = terrainIdentity;
    this.#terrainPendingIdentity = null;
    this.#terrainOverrideInfluenceRuns = null;
    this.#overviewCache.adoptSparse(terrainIdentity,()=>{});
    if (derivatives !== undefined) {
      this.acceptTerrainDerivatives(terrainIdentity, derivatives);
      return this.#terrain;
    }
    // On the untouched production island, combined and generated-base pixels
    // are identical. Sharing the completed worker result prevents a second
    // main-thread generator pass when the user isolates the base layer.
    if (Object.keys(mapDocument.cells).length === 0) {
      this.#generatedBaseTerrain = terrain;
      this.#generatedBaseTerrainKey = mapGeneratedBaseTerrainKey(mapDocument);
    }
    // Module workers are unavailable in a few test/non-browser hosts. Keep the
    // compatibility path, but never perform its full-map scans inside draw().
    this.#terrainDerivationTimer = setTimeout(() => {
      this.#terrainDerivationTimer = null;
      if (this.#disposed || this.#terrainIdentity !== terrainIdentity) return;
      try {
        this.acceptTerrainDerivatives(
          terrainIdentity,
          buildMapEditorTerrainDerivatives(mapDocument, terrain, this.#terrainPalette),
        );
        this.invalidate();
      } catch (error) {
        console.warn('Studio map terrain derivatives failed', error);
      }
    }, 0);
    return this.#terrain;
  }

  private acceptTerrainDerivatives(
    terrainIdentity: object,
    derivatives: MapEditorTerrainDerivatives,
  ): void {
    if (this.#disposed || this.#terrainIdentity !== terrainIdentity) return;
    this.#terrainDerivativesReady=true;
    // Sparse authored edits deliberately leave this key unchanged. Retaining
    // the existing immutable base also retains its production ground chunks;
    // replacing it with an equivalent new TerrainArray would make the cache
    // discard and repaint every visible base chunk after each brush stroke.
    if (this.#generatedBaseTerrain === null
      || this.#generatedBaseTerrainKey !== derivatives.generatedBaseTerrainKey) {
      this.#generatedBaseTerrain = derivatives.generatedBaseTerrain;
    }
    this.#generatedBaseTerrainKey = derivatives.generatedBaseTerrainKey;
    this.#terrainOverrideInfluenceRuns = derivatives.terrainOverrideInfluenceRuns;
    if (typeof document !== 'undefined') {
      this.#overviewCache.accept(terrainIdentity, derivatives.overview);
    }
  }

  private generatedBaseTerrainFor(
    mapDocument: MapDocumentV3,
    terrainIdentity: object,
  ): TerrainArray | null {
    // terrainFor() establishes the identity and invalidates this derivative.
    if (this.#terrainIdentity !== terrainIdentity) this.terrainFor(mapDocument, terrainIdentity);
    const generatedBaseTerrainKey = mapGeneratedBaseTerrainKey(mapDocument);
    if (this.#generatedBaseTerrainKey === generatedBaseTerrainKey
      && this.#generatedBaseTerrain !== null) return this.#generatedBaseTerrain;
    // The worker or deferred compatibility derivation owns this full-map
    // product. Returning null keeps an isolated layer safely blank meanwhile.
    return null;
  }

  private detailedArt(shellArt: StudioSpatialArt): OverworldArt | null {
    if (this.#disposed) return null;
    if (this.#art !== null || this.#artRequest !== null) return this.#art;
    if (Date.now() < this.#artRetryAt) return null;
    this.#artRequest = loadMapEditorArt(shellArt.fonts, shellArt.skin).then((art) => {
      if (this.#disposed) return;
      this.#art = art;
      this.#artFailureCount = 0;
      this.#artRetryAt = 0;
      this.#scheduleLiveNpcArt();
      this.invalidate();
    }).catch((error: unknown) => {
      if (this.#disposed) return;
      // Preserve transient recovery without allowing frequent live-state
      // invalidations to restart the complete artwork graph every frame.
      this.#artRequest = null;
      this.#artFailureCount += 1;
      this.#artRetryAt = Date.now() + editorArtRetryDelayMs(this.#artFailureCount);
      if (!this.#artWarningShown) {
        this.#artWarningShown = true;
        console.warn('Studio detailed map artwork failed to load', error);
      }
    });
    return null;
  }

  private preloadPrefabAssets(mapDocument: MapDocumentV3): void {
    if (this.#disposed) return;
    if (this.#prefabAssetDocument === mapDocument) return;
    this.#prefabAssetDocument = mapDocument;
    void preloadLiveMapObjectAssets(mapDocument).then(() => {
      if (!this.#disposed && this.#prefabAssetDocument === mapDocument) this.invalidate();
    });
  }

  private drawDetailed(
    context: CanvasRenderingContext2D,
    art: OverworldArt,
    terrain: TerrainArray,
    mapDocument: MapDocumentV3,
    model: MapEditorModel,
    interaction: MapEditorController,
    viewport: UiRect,
    camera: { readonly x: number; readonly y: number; readonly zoom: number },
    detailedTerrain: MapEditorDetailedTerrainPass | null,
    drawPrefabs: boolean,
    drawLiveArtwork: boolean,
  ): void {
    const viewportWorldWidth = viewport.width / camera.zoom;
    const viewportWorldHeight = viewport.height / camera.zoom;
    const cull = editorWorldCullBounds(
      camera.x,
      camera.y,
      viewportWorldWidth,
      viewportWorldHeight,
      TILE_SIZE_PIXELS * 8,
    );
    context.save();
    context.beginPath();
    context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
    context.clip();
    context.translate(viewport.x, viewport.y);
    const terrainClip = detailedTerrain?.clipRuns === null || detailedTerrain === null
      ? null
      : this.terrainClipPath(detailedTerrain.clipRuns, viewport, camera);
    const clipTerrain = (draw: () => void): void => {
      if (terrainClip === null) {
        draw();
        return;
      }
      context.save();
      context.clip(terrainClip);
      draw();
      context.restore();
    };
    if (detailedTerrain !== null) clipTerrain(() => {
      detailedTerrain.groundCache.draw(
        context,
        art,
        detailedTerrain.terrain,
        camera.x,
        camera.y,
        camera.zoom,
        viewport.width,
        viewport.height,
      );
      drawAnimatedTerrain(
        context,
        art,
        detailedTerrain.terrain,
        camera.x,
        camera.y,
        camera.zoom,
        viewportWorldWidth,
        viewportWorldHeight,
      );
    });

    const queue: WorldDepthItem[] = [];
    const terrainQueue: WorldDepthItem[] = [];
    if (detailedTerrain !== null) {
      enqueueRaisedTerrainDepth(
        terrainQueue,
        context,
        art,
        detailedTerrain.terrain,
        detailedTerrain.groundCache,
        camera.x,
        camera.y,
        camera.zoom,
        viewportWorldWidth,
        viewportWorldHeight,
      );
      queue.push(...terrainQueue);
    }
    const enqueueProjected = (worldX: number, worldFootY: number, item: WorldDepthItem): void => {
      const projection = terrainProjectedDepthAtFoot(terrain, worldX, worldFootY);
      const elevation = terrainProjectedElevationAtFoot(terrain, worldX, worldFootY);
      queue.push({
        ...item,
        footY: item.footY - projection,
        depthOffset: item.depthOffset ?? terrainProjectedSortOffset(elevation),
        elevationLayer: item.elevationLayer ?? Math.ceil(Math.max(0, elevation - 0.001)),
        draw: () => {
          context.save();
          context.translate(0, -projection * camera.zoom);
          item.draw();
          context.restore();
        },
      });
    };

    if (drawPrefabs) {
      const visibleObjects = mapDocument.objects.filter((object) => pointInsideCull(
        cull,
        object.tileX * TILE_SIZE_PIXELS + TILE_SIZE_PIXELS / 2,
        (object.tileY + 1) * TILE_SIZE_PIXELS,
      ) && model.isLayerVisible(object.layer));
      enqueueLiveMapObjects({ ...mapDocument, objects: visibleObjects }, {
        connectionDocument: mapDocument,
        context,
        cameraX: camera.x,
        cameraY: camera.y,
        scale: camera.zoom,
        timeMs: performance.now(),
        visible: (worldX, worldY) => pointInsideCull(cull, worldX, worldY),
        enqueue: enqueueProjected,
      });
    }

    for (const landmark of mapDocument.landmarks) {
      if (!landmark.enabled || !model.isLayerVisible(landmark.layer)) continue;
      const decoration = mapLandmarkDecoration(landmark);
      const worldX = decoration.tileX * TILE_SIZE_PIXELS + TILE_SIZE_PIXELS / 2;
      const worldY = (decoration.tileY + 1) * TILE_SIZE_PIXELS;
      if (!pointInsideCull(cull, worldX, worldY)) continue;
      enqueueProjected(worldX, worldY, {
        footY: overworldPoiDecorationDepthY(decoration.kind, worldY),
        depthPhase: 'entity',
        tie: authoredMapContentPainterTie(
          mapDocument, landmark.layer, 'landmark', landmark.id,
        ),
        draw: () => {
          const screenX = Math.round((worldX - camera.x) * camera.zoom);
          const screenY = Math.round((worldY - camera.y) * camera.zoom);
          context.save();
          context.translate(screenX, screenY);
          context.rotate(landmark.quarterTurns * Math.PI / 2);
          const scale = landmark.scale ?? 1;
          context.scale(landmark.flipX ? -scale : scale, scale);
          context.translate(-screenX, -screenY);
          drawOverworldPoiDecoration(
            context,
            art,
            decoration.kind,
            worldX,
            worldY,
            camera.x,
            camera.y,
            camera.zoom,
            decoration.variant,
            0,
          );
          context.restore();
        },
      });
    }

    if (drawLiveArtwork) {
      const liveAnimationFrame = Math.floor(performance.now() / 125);
      const connections = interaction.liveMarkers().flatMap(marker=>{
        const presentation=resolveStudioLiveMarkerPresentation(this.#liveRegistry,marker);
        const family=presentation.kind==='object'?connectedObjectFamily(presentation.definition.components.sprite?.asset??''):null;
        return family?[{marker,family,tileX:marker.tileX,tileY:marker.tileY,elevation:marker.elevation??terrainElevationAtWorldFoot(terrain,marker.worldX,marker.worldY),space:marker.spaceId}]:[];
      });
      const masks=connectedObjectIndex(connections);
      const byId=new Map(connections.map(cell=>[cell.marker.id,{family:cell.family,mask:masks(cell)}]));
      for (const marker of interaction.liveMarkers()) {
        if (!model.isLayerVisible(marker.layer)
          || !pointInsideCull(cull, marker.worldX, marker.worldY)) continue;
        this.enqueueLiveMarker(
          enqueueProjected, context, art, marker, marker.worldX, marker.worldY, camera,
          liveAnimationFrame, byId.get(marker.id),
        );
      }
    }
    const clippedTerrainItems = terrainClip === null ? null : new Set(terrainQueue);
    let terrainClipActive = false;
    for (const item of sortWorldDepthItems(queue)) {
      const itemNeedsTerrainClip = clippedTerrainItems?.has(item) === true;
      if (itemNeedsTerrainClip && !terrainClipActive) {
        context.save();
        context.clip(terrainClip!);
        terrainClipActive = true;
      } else if (!itemNeedsTerrainClip && terrainClipActive) {
        context.restore();
        terrainClipActive = false;
      }
      item.draw();
    }
    if (terrainClipActive) context.restore();
    context.restore();
  }

  private terrainClipPath(
    runs: readonly MapEditorTerrainInfluenceRun[],
    viewport: UiRect,
    camera: { readonly x: number; readonly y: number; readonly zoom: number },
  ): Path2D {
    const path = new Path2D();
    const viewportWorldWidth = viewport.width / camera.zoom;
    const viewportWorldHeight = viewport.height / camera.zoom;
    const minimumTileX = Math.floor(camera.x / TILE_SIZE_PIXELS) - 1;
    const maximumTileX = Math.ceil((camera.x + viewportWorldWidth) / TILE_SIZE_PIXELS) + 1;
    const minimumTileY = Math.floor(camera.y / TILE_SIZE_PIXELS) - 1;
    const maximumTileY = Math.ceil((camera.y + viewportWorldHeight) / TILE_SIZE_PIXELS) + 1;
    for (const run of runs) {
      if (run.tileY < minimumTileY || run.tileY > maximumTileY
        || run.lastTileX < minimumTileX || run.firstTileX > maximumTileX) continue;
      const firstTileX = Math.max(run.firstTileX, minimumTileX);
      const lastTileX = Math.min(run.lastTileX, maximumTileX);
      path.rect(
        Math.floor((firstTileX * TILE_SIZE_PIXELS - camera.x) * camera.zoom) - 1,
        Math.floor((run.tileY * TILE_SIZE_PIXELS - camera.y) * camera.zoom) - 1,
        Math.ceil((lastTileX - firstTileX + 1) * TILE_SIZE_PIXELS * camera.zoom) + 2,
        Math.ceil(TILE_SIZE_PIXELS * camera.zoom) + 2,
      );
    }
    return path;
  }

  private liveMarkerHasArtwork(marker: MapEditorLiveMarker): boolean {
    if(marker.entityKind==='resource'&&this.#liveRegistry!==null)return runtimeResourceDefinition(this.#liveRegistry,marker)!==null;
    if (marker.entityKind !== 'placeable' && marker.entityKind !== 'chest'
      && marker.entityKind !== 'combat-target' && marker.entityKind !== 'npc') return true;
    if (marker.entityKind === 'npc' && marker.species === 'bee' && marker.activity === 'inside_hive') {
      return false;
    }
    const presentation = resolveStudioLiveMarkerPresentation(this.#liveRegistry, marker);
    if (presentation.kind === 'neutral') return false;
    if (presentation.kind === 'object') {
      const sprite = presentation.definition.components.sprite;
      if (sprite === undefined) return presentation.legacyFallback;
      this.ensureLiveObjectAsset(sprite.asset);
      return this.#liveObjectAssets.get(sprite.asset) !== undefined
        && this.#liveObjectAssets.get(sprite.asset) !== null;
    }
    if (presentation.kind === 'npc') {
      return this.#art !== null && authoredNpcArt(this.#art, presentation.runtimeKind) !== undefined;
    }
    if (presentation.kind === 'wildlife') return isWildlifeSpecies(presentation.species);
    return true;
  }

  private drawSelectedSilhouette(context:CanvasRenderingContext2D,model:MapEditorModel,interaction:MapEditorController,
    terrain:TerrainArray,viewport:UiRect,camera:ReturnType<MapEditorController['snapshot']>['camera']):void {
    const selection=model.selection();if(selection.kind!=='entity'&&selection.kind!=='player')return;
    if(typeof globalThis.document==='undefined'||!this.#art)return;
    const canvas=this.#selectionMask??=globalThis.document.createElement('canvas');
    if(canvas.width!==Math.ceil(viewport.width))canvas.width=Math.ceil(viewport.width);
    if(canvas.height!==Math.ceil(viewport.height))canvas.height=Math.ceil(viewport.height);
    const mask=canvas.getContext('2d');if(!mask)return;
    mask.clearRect(0,0,canvas.width,canvas.height);mask.imageSmoothingEnabled=false;
    const enqueue=(x:number,y:number,item:WorldDepthItem)=>{mask.save();mask.translate(0,-terrainProjectedDepthAtFoot(terrain,x,y)*camera.zoom);item.draw();mask.restore();};
    const document=model.document();
    const object=selection.kind==='entity'&&selection.entityKind==='map-object'?document.objects.find(value=>value.id===selection.id):undefined;
    const landmark=selection.kind==='entity'&&selection.entityKind==='map-object'?document.landmarks.find(value=>value.id===selection.id):undefined;
    if(object&&model.isLayerVisible(object.layer)) {
      enqueueLiveMapObjects({...document,objects:[object]},{connectionDocument:document,context:mask,cameraX:camera.x,cameraY:camera.y,scale:camera.zoom,timeMs:performance.now(),visible:()=>true,enqueue});
    } else if(landmark&&model.isLayerVisible(landmark.layer)) {
      const x=landmark.tileX*16+8,y=(landmark.tileY+1)*16;
      const sx=Math.round((x-camera.x)*camera.zoom),sy=Math.round((y-camera.y)*camera.zoom);
      mask.save();mask.translate(0,-terrainProjectedDepthAtFoot(terrain,x,y)*camera.zoom);mask.translate(sx,sy);mask.rotate(landmark.quarterTurns*Math.PI/2);
      mask.scale((landmark.flipX?-1:1)*(landmark.scale??1),landmark.scale??1);mask.translate(-sx,-sy);
      drawOverworldPoiDecoration(mask,this.#art,landmark.kind,x,y,camera.x,camera.y,camera.zoom,landmark.variant,0);mask.restore();
    } else {
      const marker=interaction.liveMarkers().find(value=>selection.kind==='player'?value.entityKind==='player'&&value.id===selection.identity:value.entityKind===selection.entityKind&&value.id===selection.id&&value.spaceId===selection.spaceId);
      if(marker&&model.isLayerVisible(marker.layer))this.enqueueLiveMarker(enqueue,mask,this.#art,marker,marker.worldX,marker.worldY,camera,Math.floor(performance.now()/125));
    }
    mask.save();mask.globalCompositeOperation='source-in';mask.fillStyle='rgba(255,206,82,0.48)';mask.fillRect(0,0,canvas.width,canvas.height);mask.restore();
    context.drawImage(canvas,viewport.x,viewport.y);
  }

  private ensureLiveObjectAsset(name: string): void {
    if (this.#disposed || this.#liveObjectAssets.has(name) || this.#liveObjectAssetRequests.has(name)) return;
    const contentKey = this.#liveContentKey;
    this.#liveObjectAssetRequests.add(name);
    void loadGeneratedAsset(name, 'summer').then((asset) => {
      if (!this.#disposed && contentKey === this.#liveContentKey) this.#liveObjectAssets.set(name, asset);
    }).catch(() => {
      if (!this.#disposed && contentKey === this.#liveContentKey) this.#liveObjectAssets.set(name, null);
    }).finally(() => {
      this.#liveObjectAssetRequests.delete(name);
      if (!this.#disposed && contentKey === this.#liveContentKey) this.invalidate();
    });
  }

  #scheduleLiveNpcArt(): void {
    const art = this.#art;
    const registry = this.#liveRegistry;
    const request = ++this.#liveNpcArtRequest;
    if (this.#disposed || art === null || registry === null) return;
    void loadAuthoredNpcArt(art, registry.npcs.values()).then(() => {
      if (!this.#disposed && request === this.#liveNpcArtRequest) this.invalidate();
    }).catch((error: unknown) => {
      if (!this.#disposed && request === this.#liveNpcArtRequest) {
        console.warn('Studio authored NPC artwork failed to load', error);
        this.invalidate();
      }
    });
  }

  private enqueueLiveMarker(
    enqueue: (worldX: number, worldFootY: number, item: WorldDepthItem) => void,
    context: CanvasRenderingContext2D,
    art: OverworldArt,
    marker: MapEditorLiveMarker,
    worldX: number,
    worldY: number,
    camera: { readonly x: number; readonly y: number; readonly zoom: number },
    animationFrameBase: number,
    connection?: {family:NonNullable<ReturnType<typeof connectedObjectFamily>>;mask:number},
  ): void {
    if (!this.liveMarkerHasArtwork(marker)) return;
    const presentation = resolveStudioLiveMarkerPresentation(this.#liveRegistry, marker);
    const animationFrame = animationFrameBase + (marker.animationPhase ?? marker.id.length % 19);
    const draw = (): void => {
      if(connection && marker.kind !== 'fence_gate' && drawConnectedObject(context,connection.family,connection.mask,worldX,worldY,camera.x,camera.y,camera.zoom)) return;
      if (presentation.kind === 'object') {
        const sprite = presentation.definition.components.sprite;
        const asset = sprite === undefined ? undefined : this.#liveObjectAssets.get(sprite.asset);
        if (sprite !== undefined && asset !== undefined && asset !== null) {
          const state = marker.state ?? {};
          const animationByState = sprite.animationByState;
          const stateAnimation = animationByState === undefined ? undefined
            : Object.entries(state).sort(([left], [right]) => left.localeCompare(right))
              .map(([name, value]) => value === true ? animationByState[name]
                : typeof value === 'string' ? animationByState[`${name}.${value}`] ?? animationByState[value]
                  : undefined).find((value) => value !== undefined);
          const animation = stateAnimation ?? animationByState?.default ?? 'base';
          if (drawAuthoredOverworldObject(
            context, asset, animation, animationFrame, worldX, worldY,
            camera.x, camera.y, camera.zoom, sprite.scale ?? 1,
          ) || !presentation.legacyFallback) return;
        } else if (!presentation.legacyFallback) return;
      } else if (presentation.kind === 'neutral' && ['placeable','chest','combat-target','npc'].includes(marker.entityKind)) return;
      if(marker.entityKind==='resource' && this.#liveRegistry!==null) {
        const definition=runtimeResourceDefinition(this.#liveRegistry,marker);
        if(!definition)return;
        const growth=treeGrowthStageName(marker.growthStage??3);
        const visualState=marker.depleted?(growth==='small'?'depleted_small':growth==='medium'?'depleted_medium':'depleted'):growth==='small'||growth==='medium'?growth:'mature';
        const nodeClass:MiningNodeClass=marker.miningClass==='pure'||marker.miningClass==='pristine'||marker.miningClass==='rock'?marker.miningClass:'mixed';
        drawAuthoredResourceVisual(context,art,definition.visual,visualState,worldX,worldY,camera.x,camera.y,camera.zoom,nodeClass,marker.richness??1,animationFrame);
        return;
      }
      if (marker.entityKind === 'chest') {
        drawOverworldChest(
          context, art, worldX, worldY, camera.x, camera.y, camera.zoom, marker.open ? 5 : 0,
        );
        return;
      }
      if (marker.entityKind === 'combat-target') {
        drawOverworldArcheryTarget(context, art, worldX, worldY, camera.x, camera.y, camera.zoom);
        return;
      }
      if (marker.entityKind === 'player') {
        drawOverworldAvatar(
          context, art, worldX, worldY, marker.facing ?? 'down', marker.moving ?? false,
          animationFrame, camera.x, camera.y, camera.zoom, null, null,
          marker.appearance, marker.activity ?? 'empty', animationFrame, true,
          marker.online === false ? 'stone' : 'normal',
        );
        return;
      }
      if (marker.entityKind === 'npc') {
        const facing = marker.facing ?? 'down';
        const moving = marker.moving ?? false;
        if (presentation.kind === 'mount' && presentation.adapter === 'boat') {
          drawOverworldBoat(
            context, art, worldX, worldY, facing, moving, animationFrame,
            camera.x, camera.y, camera.zoom,
          );
        } else if (presentation.kind === 'mount' && presentation.adapter === 'horse') {
          drawOverworldHorse(
            context, art, worldX, worldY, facing, moving, animationFrame,
            camera.x, camera.y, camera.zoom, false, undefined, marker.variant ?? 0,
            marker.activity,
          );
        } else if (presentation.kind === 'wildlife' && isWildlifeSpecies(presentation.species)) {
          drawOverworldWildlife(
            context, art, presentation.species, marker.variant ?? 0, marker.activity ?? 'idle',
            worldX, worldY, facing, moving, animationFrame, camera.x, camera.y, camera.zoom,
          );
        } else if (presentation.kind === 'legacy-npc' && art.rogueEnemies[presentation.runtimeKind] !== undefined) {
          drawOverworldRogueEnemy(
            context, art, presentation.runtimeKind, marker.health === 0 ? 'defeated' : marker.activity ?? 'idle',
            worldX, worldY, facing, moving, animationFrame, camera.x, camera.y, camera.zoom,
            false,
          );
        } else {
          const runtimeKind = presentation.kind === 'npc' ? presentation.runtimeKind
            : presentation.kind === 'legacy-npc' ? presentation.runtimeKind : marker.kind;
          drawOverworldMerchant(
            context, art, worldX, worldY, facing, moving, animationFrame,
            camera.x, camera.y, camera.zoom, runtimeKind, marker.activity,
            presentation.kind === 'npc' ? presentation.fishingCycle : false,
          );
        }
        return;
      }
      if (marker.entityKind === 'placeable') {
        drawOverworldPlaceable(
          context, art, marker.kind, marker.open ?? false, 0, animationFrame,
          worldX, worldY, camera.x, camera.y, camera.zoom, marker.lit ?? false,
        );
        return;
      }
      if (marker.entityKind === 'surface') {
        drawOverworldPoiDecoration(
          context, art, 'marlow_tent_table', worldX, worldY,
          camera.x, camera.y, camera.zoom,
        );
        return;
      }
      if (marker.entityKind === 'homestead') {
        drawOverworldPoiDecoration(
          context, art, 'homestead_tent_marker', worldX, worldY,
          camera.x, camera.y, camera.zoom,
        );
        return;
      }
      if (marker.depleted && isChoppableTreeKind(marker.kind)) {
        drawOverworldStump(
          context, art, worldX, worldY, camera.x, camera.y, camera.zoom,
          marker.kind, treeGrowthStageName(marker.growthStage ?? 3),
        );
      } else if (marker.depleted) return;
      else if (isChoppableTreeKind(marker.kind)
        && (treeGrowthStageName(marker.growthStage ?? 3) === 'small'
          || treeGrowthStageName(marker.growthStage ?? 3) === 'medium')) {
        const growth = treeGrowthStageName(marker.growthStage ?? 3) as 'small' | 'medium';
        drawOverworldTreeRegrowth(
          context, art, worldX, worldY, camera.x, camera.y, camera.zoom,
          marker.kind, growth,
        );
      } else if (isChoppableTreeKind(marker.kind)) {
        drawOverworldTree(
          context, art, worldX, worldY - 4, false,
          camera.x, camera.y, camera.zoom, marker.kind,
        );
      } else if (isMineableOreKind(marker.kind)) {
        const nodeClass: MiningNodeClass = marker.miningClass === 'pure'
          || marker.miningClass === 'pristine' || marker.miningClass === 'rock'
          ? marker.miningClass : 'mixed';
        drawOverworldOreNode(
          context, art, marker.kind, worldX, worldY,
          camera.x, camera.y, camera.zoom, nodeClass, marker.richness,
        );
      } else if (isBreakableRockKind(marker.kind) || marker.kind === 'loose_stone') {
        drawOverworldRock(context, art, worldX, worldY, camera.x, camera.y, camera.zoom);
      } else {
        drawOverworldPoiDecoration(
          context,
          art,
          marker.kind === 'fish_pool' ? 'nature_fish_shadow'
            : isGatherableResourceKind(marker.kind) ? 'poi_fallen_log' : marker.kind,
          worldX,
          worldY,
          camera.x,
          camera.y,
          camera.zoom,
        );
      }
    };
    enqueue(worldX, worldY, {
      footY: marker.entityKind === 'homestead'
        ? overworldPoiDecorationDepthY('homestead_tent_marker', worldY)
        : worldY,
      depthPhase: marker.entityKind === 'surface' ? 'surface' : 'entity',
      tie: `studio-live:${marker.entityKind}:${marker.id}`,
      draw,
    });
  }

  private image(width: number, height: number, source: Uint8ClampedArray): HTMLCanvasElement {
    const image = document.createElement('canvas');
    image.width = width;
    image.height = height;
    const context = image.getContext('2d');
    if (context === null) throw new Error('studio_map_overview_context_unavailable');
    const pixels = context.createImageData(width, height);
    pixels.data.set(source);
    context.putImageData(pixels, 0, 0);
    return image;
  }

  private overlayImage(width: number, height: number) {
    const image = document.createElement('canvas');
    image.width = width;
    image.height = height;
    const context = image.getContext('2d');
    if (context === null) throw new Error('studio_map_overlay_context_unavailable');
    return {
      image,
      writeRows: (startY: number, rowWidth: number, rowCount: number, source: Uint8ClampedArray) => {
        const pixels = context.createImageData(rowWidth, rowCount);
        pixels.data.set(source);
        context.putImageData(pixels, 0, startY);
      },
      dispose: () => {
        image.width = 0;
        image.height = 0;
      },
    };
  }
}
