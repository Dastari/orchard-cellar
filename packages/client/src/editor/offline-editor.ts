import {
  PROCEDURAL_WORLD_CHUNK_TILES,
  commitMapEdit,
  compileMapDocument,
  createEmptyMapDocument,
  createMapEditHistory,
  createTerrainLabDocument,
  mapDocumentHash,
  mapResizeOffset,
  parseMapDocument,
  rasterMapLine,
  redoMapEdit,
  resolvedMapCellAt,
  semanticTerrainTraceAt,
  serializeMapDocument,
  undoMapEdit,
  validateMapDocument,
  floorDiv,
  type MapCellPatch,
  type MapEditHistory,
  type MapPoint,
  type MapResizeAnchor,
  type ProceduralTerrainFamily,
  type SemanticTerrainTrace,
} from "@orchard/sim";
import {
  dismissLoadingScreen,
  setLoadingScreenStage,
  upgradeLoadingScreen,
} from "../loading-screen.js";
import { loadOverworldArt } from "../overworld-art.js";
import { GroundChunkCache } from "../render/ground-cache.js";
import { enqueueRaisedTerrainDepth } from "../render/raised-terrain-depth.js";
import {
  sortWorldDepthItems,
  UnifiedRenderer,
  type WorldDepthItem,
} from "../render/renderer.js";
import {
  inspectTerrainAtProjectedPoint,
  type TerrainInspection,
} from "../render/terrain-inspector.js";
import {
  terrainPlaneCollisionCellAt,
  terrainProjectedRowsPerLevel,
  type TerrainArray,
} from "../render/terrain.js";
import {
  drawEditorWorldOverlays,
  type EditorOverlayOptions,
} from "./editor-overlays.js";
import {
  editorSessionStorageKey,
  parseEditorSessionState,
  serializeEditorSessionState,
  type EditorSessionState,
} from "./editor-session-state.js";
import {
  editorTerrainHitOnPlane,
  proceduralEditorTerrainHit,
  topmostEditorTerrainHit,
  type EditorTerrainHit,
} from "./editor-picking.js";
import { clientEntryRoute } from "./editor-route.js";
import { terrainArrayForMapDocument } from "./editor-terrain.js";
import {
  editorUsesOverviewLod,
  editorWorldZoomAfterWheel,
} from "./editor-viewport.js";
import {
  canonicalProceduralEditorSeed,
  createProceduralEditorPreview,
  generateProceduralEditorChunk,
  proceduralEditorChunkGenerated,
  proceduralEditorChunkPreviewRaster,
  proceduralEditorGeneratedChunkKeys,
  proceduralEditorOverviewRaster,
  proceduralEditorPreviewHeight,
  proceduralEditorPreviewWidth,
  proceduralEditorTraceAtLocalTile,
  proceduralEditorWorldToLocalTile,
  recenterProceduralEditorPreview,
  terrainArrayForProceduralEditorPreview,
  type ProceduralEditorPreview,
} from "./procedural-editor-preview.js";
import {
  drawEditorUi,
  editorUiDrawerAt,
  editorUiMapHeaderAt,
  editorUiActionAt,
  editorUiScrollLimit,
  type EditorTool,
  type EditorEdgeMode,
  type EditorUiAction,
} from "./editor-ui.js";

const canvasElement = document.querySelector<HTMLCanvasElement>("#game");
if (canvasElement === null) throw new Error("Missing editor canvas");
const canvas: HTMLCanvasElement = canvasElement;
const renderer = new UnifiedRenderer(canvas);
const route = clientEntryRoute(location.pathname, location.search);
const mapId = route.kind === "offline_editor" ? route.mapId : "terrain-lab";
const proceduralMode = mapId === "procedural-world";
const parameters = new URLSearchParams(location.search);
const LEGACY_DEFAULT_PROCEDURAL_SEED = "orchard-sanctuary-20";
const proceduralSeed = canonicalProceduralEditorSeed(
  parameters.get("seed") ?? LEGACY_DEFAULT_PROCEDURAL_SEED,
);
let proceduralPreview: ProceduralEditorPreview | null = proceduralMode
  ? createProceduralEditorPreview({ seed: proceduralSeed })
  : null;
if (
  proceduralPreview !== null &&
  parameters.get("seed") !== String(proceduralPreview.seed)
) {
  const canonicalUrl = new URL(location.href);
  canonicalUrl.searchParams.set("seed", String(proceduralPreview.seed));
  window.history.replaceState(null, "", canonicalUrl);
}
const initialDocument =
  mapId === "terrain-lab"
    ? createTerrainLabDocument()
    : proceduralPreview === null
      ? createEmptyMapDocument({
          id: mapId,
          title: "Offline Map",
          width: 64,
          height: 64,
        })
      : createEmptyMapDocument({
          id: mapId,
          title: "Procedural Sanctuary Preview",
          width: proceduralEditorPreviewWidth(proceduralPreview),
          height: proceduralEditorPreviewHeight(proceduralPreview),
        });
const LOCAL_DRAFT_KEY = `orchard.editor.offline.${mapId}`;

function generatedChunksStorageKey(preview: ProceduralEditorPreview): string {
  return `orchard.editor.procedural.${preview.normalizedSeed}.chunks`;
}

if (proceduralPreview !== null) {
  const saved = localStorage.getItem(
    generatedChunksStorageKey(proceduralPreview),
  );
  const requested =
    saved === null
      ? ["0,0"]
      : saved.split(";").filter((entry) => /^-?\d+,-?\d+$/u.test(entry));
  for (const entry of requested) {
    const [chunkX, chunkY] = entry.split(",").map(Number);
    if (chunkX === undefined || chunkY === undefined) continue;
    try {
      proceduralPreview = generateProceduralEditorChunk(
        proceduralPreview,
        chunkX,
        chunkY,
      );
    } catch {
      /* invalid legacy entry */
    }
  }
}

setLoadingScreenStage({
  title: "OPENING CREATOR MODE",
  detail: "LOADING TERRAIN THEMES",
  progress: 38,
});
const art = await loadOverworldArt();
upgradeLoadingScreen(
  art.ui,
  art.uiSkin,
  art.fruitItems["apple"] ?? art.missingItem,
);
setLoadingScreenStage({
  title: "BUILDING THE TERRAIN LAB",
  detail: "COMPILING HEIGHT AND TOPOLOGY",
  progress: 82,
});

const groundCache = new GroundChunkCache();
let history: MapEditHistory = createMapEditHistory(initialDocument);
let compiled = compileMapDocument(history.present);
let terrain: TerrainArray =
  proceduralPreview === null
    ? terrainArrayForMapDocument(history.present, compiled)
    : terrainArrayForProceduralEditorPreview(proceduralPreview);
function currentEditorSessionStorageKey(): string {
  return editorSessionStorageKey(
    mapId,
    proceduralPreview?.normalizedSeed ?? null,
  );
}

const restoredSession = parseEditorSessionState(
  localStorage.getItem(currentEditorSessionStorageKey()),
);
let tool: EditorTool = restoredSession?.tool ?? "inspect";
let terrainFamily: ProceduralTerrainFamily =
  restoredSession?.terrainFamily ?? "temperate_meadow";
let terrainFamilyOpen = restoredSession?.terrainFamilyOpen ?? false;
let edgeMode: EditorEdgeMode = restoredSession?.edgeMode ?? "auto";
let activeElevation =
  restoredSession?.activeElevation ?? history.present.baseElevation;
let gridVisible = restoredSession?.gridVisible ?? true;
let heightVisible = restoredSession?.heightVisible ?? false;
let collisionVisible = restoredSession?.collisionVisible ?? !proceduralMode;
let leftUiScroll = restoredSession?.leftUiScroll ?? 0;
let rightUiScroll = restoredSession?.rightUiScroll ?? 0;
let hoveredUiAction: Exclude<EditorUiAction, null> | null = null;
let selectedTile: MapPoint | null = restoredSession?.selectedTile ?? null;
if (
  proceduralPreview === null &&
  selectedTile !== null &&
  (selectedTile.tileX < 0 ||
    selectedTile.tileY < 0 ||
    selectedTile.tileX >= history.present.width ||
    selectedTile.tileY >= history.present.height)
) {
  selectedTile = null;
}
let inspection: TerrainInspection | null = null;
let trace: SemanticTerrainTrace | null = null;
let validationErrors = validateMapDocument(history.present).filter(
  (issue) => issue.severity === "error",
).length;
let draftPoints: MapPoint[] = [];
let drawing = false;
let drawingElevation: number | null = null;
let panning = false;
let previousPointerX = 0;
let previousPointerY = 0;
let worldZoom = editorWorldZoomAfterWheel(
  restoredSession?.worldZoom ?? (proceduralMode ? 3 : 2),
  0,
  proceduralMode,
);
canvas.dataset["editorZoom"] = worldZoom.toFixed(5);
let cameraX =
  restoredSession?.cameraX ??
  (proceduralMode
    ? -innerWidth / worldZoom / 2
    : history.present.width * 8 - innerWidth / worldZoom / 2);
let cameraY =
  restoredSession?.cameraY ??
  (proceduralMode
    ? -innerHeight / worldZoom / 2
    : history.present.height * 8 -
      innerHeight / worldZoom / 2 -
      activeElevation * 16);
let status =
  proceduralPreview === null
    ? "UNAUTHENTICATED OFFLINE DRAFT — LIVE WORLD WRITES ARE UNAVAILABLE"
    : "SEED PREVIEW — SELECT AN OUTLINED CHUNK, THEN GENERATE CHUNK";
const keys = new Set<string>();
let lastPersistedSessionKey = currentEditorSessionStorageKey();
let lastPersistedSessionSource: string | null = null;
let nextSessionPersistenceAt = 0;

function editorSessionState(): EditorSessionState {
  return {
    version: 1,
    cameraX,
    cameraY,
    worldZoom,
    selectedTile,
    activeElevation,
    tool,
    terrainFamily,
    terrainFamilyOpen,
    edgeMode,
    gridVisible,
    heightVisible,
    collisionVisible,
    leftUiScroll,
    rightUiScroll,
  };
}

function persistEditorSession(force = false): void {
  const now = performance.now();
  if (!force && now < nextSessionPersistenceAt) return;
  nextSessionPersistenceAt = now + 250;
  const key = currentEditorSessionStorageKey();
  const source = serializeEditorSessionState(editorSessionState());
  if (key === lastPersistedSessionKey && source === lastPersistedSessionSource)
    return;
  try {
    localStorage.setItem(key, source);
    lastPersistedSessionKey = key;
    lastPersistedSessionSource = source;
  } catch {
    // The editor remains usable when storage is disabled or full.
  }
}

interface ProceduralOverviewCache {
  readonly image: HTMLCanvasElement;
  readonly minTileX: number;
  readonly minTileY: number;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly stepTiles: number;
}

let proceduralOverviewCache: ProceduralOverviewCache | null = null;
const proceduralChunkPreviewCache = new Map<string, HTMLCanvasElement>();

function cachedProceduralChunkPreviewImage(
  preview: ProceduralEditorPreview,
  chunkX: number,
  chunkY: number,
): HTMLCanvasElement {
  const key = `${preview.normalizedSeed}:${preview.generatorVersion}:${chunkX},${chunkY}`;
  const cached = proceduralChunkPreviewCache.get(key);
  if (cached !== undefined) return cached;
  const raster = proceduralEditorChunkPreviewRaster(preview, chunkX, chunkY);
  const image = document.createElement("canvas");
  image.width = raster.width;
  image.height = raster.height;
  const imageContext = image.getContext("2d");
  if (imageContext === null)
    throw new Error("Unable to create procedural chunk preview canvas");
  const imageData = imageContext.createImageData(raster.width, raster.height);
  imageData.data.set(raster.pixels);
  imageContext.putImageData(imageData, 0, 0);
  proceduralChunkPreviewCache.set(key, image);
  if (proceduralChunkPreviewCache.size > 4_096) {
    const oldest = proceduralChunkPreviewCache.keys().next().value;
    if (oldest !== undefined) proceduralChunkPreviewCache.delete(oldest);
  }
  return image;
}

function proceduralCompositionOrigin(): MapPoint {
  if (proceduralPreview === null) return { tileX: 0, tileY: 0 };
  return {
    tileX: proceduralPreview.minChunkX * PROCEDURAL_WORLD_CHUNK_TILES,
    tileY: proceduralPreview.minChunkY * PROCEDURAL_WORLD_CHUNK_TILES,
  };
}

function localProceduralPoint(worldPoint: MapPoint): MapPoint {
  if (proceduralPreview === null) return worldPoint;
  return proceduralEditorWorldToLocalTile(
    proceduralPreview,
    worldPoint.tileX,
    worldPoint.tileY,
  );
}

function chunkAtWorldTile(point: MapPoint): {
  readonly chunkX: number;
  readonly chunkY: number;
} {
  return {
    chunkX: floorDiv(point.tileX, PROCEDURAL_WORLD_CHUNK_TILES),
    chunkY: floorDiv(point.tileY, PROCEDURAL_WORLD_CHUNK_TILES),
  };
}

function rebuild(next: MapEditHistory, message: string): void {
  history = next;
  compiled = compileMapDocument(history.present);
  terrain =
    proceduralPreview === null
      ? terrainArrayForMapDocument(history.present, compiled)
      : terrainArrayForProceduralEditorPreview(proceduralPreview);
  validationErrors = validateMapDocument(history.present).filter(
    (issue) => issue.severity === "error",
  ).length;
  status = message;
  refreshInspection();
}

function commit(
  command: Parameters<typeof commitMapEdit>[1],
  message: string,
): void {
  const next = commitMapEdit(history, command);
  rebuild(next, next === history ? "NO CELLS CHANGED" : message);
}

function refreshInspection(): void {
  if (selectedTile === null) {
    inspection = null;
    trace = null;
    return;
  }
  const terrainPoint =
    proceduralPreview === null
      ? selectedTile
      : localProceduralPoint(selectedTile);
  const projection = activeElevation * terrainProjectedRowsPerLevel() * 16;
  const projectedX = (terrainPoint.tileX + 0.5) * 16;
  const projectedY = (terrainPoint.tileY + 0.5) * 16 - projection;
  const collision = terrainPlaneCollisionCellAt(
    terrain,
    terrainPoint.tileX,
    terrainPoint.tileY,
    activeElevation,
  );
  inspection = inspectTerrainAtProjectedPoint(
    terrain,
    projectedX,
    projectedY,
    activeElevation,
    collision === "blocked",
  );
  trace =
    proceduralPreview === null
      ? semanticTerrainTraceAt(
          history.present,
          selectedTile.tileX,
          selectedTile.tileY,
          compiled,
        )
      : proceduralEditorTraceAtLocalTile(
          proceduralPreview,
          terrainPoint.tileX,
          terrainPoint.tileY,
        );
}

function selectedProceduralChunk(): {
  readonly chunkX: number;
  readonly chunkY: number;
} | null {
  if (proceduralPreview === null || selectedTile === null) return null;
  return chunkAtWorldTile(selectedTile);
}

function generateSelectedProceduralChunk(): void {
  if (proceduralPreview === null) return;
  const selectedChunk = selectedProceduralChunk();
  if (selectedChunk === null) {
    status = "SELECT AN OUTLINED CHUNK FIRST";
    return;
  }
  const centered = recenterProceduralEditorPreview(
    proceduralPreview,
    selectedChunk.chunkX,
    selectedChunk.chunkY,
  );
  const next = generateProceduralEditorChunk(
    centered,
    selectedChunk.chunkX,
    selectedChunk.chunkY,
  );
  if (next === proceduralPreview) {
    status = `CHUNK ${selectedChunk.chunkX},${selectedChunk.chunkY} ALREADY GENERATED`;
    return;
  }
  proceduralPreview = next;
  terrain = terrainArrayForProceduralEditorPreview(proceduralPreview);
  localStorage.setItem(
    generatedChunksStorageKey(proceduralPreview),
    proceduralEditorGeneratedChunkKeys(proceduralPreview).join(";"),
  );
  const localPoint = localProceduralPoint(selectedTile!);
  activeElevation =
    terrain.elevations[localPoint.tileY * terrain.width + localPoint.tileX] ??
    0;
  status = `GENERATED CHUNK ${selectedChunk.chunkX},${selectedChunk.chunkY} — LOCAL PREVIEW ONLY`;
  refreshInspection();
}

function pointerWorldHit(
  screenX: number,
  screenY: number,
  lockedElevation?: number,
): EditorTerrainHit | null {
  const projectedX = cameraX + screenX / worldZoom;
  const projectedY = cameraY + screenY / worldZoom;
  if (proceduralPreview !== null) {
    const origin = proceduralCompositionOrigin();
    return proceduralEditorTerrainHit(
      terrain,
      projectedX,
      projectedY,
      origin.tileX,
      origin.tileY,
      new Set(proceduralPreview.generated.keys()),
      lockedElevation,
    );
  }
  return lockedElevation === undefined
    ? topmostEditorTerrainHit(terrain, projectedX, projectedY)
    : editorTerrainHitOnPlane(terrain, projectedX, projectedY, lockedElevation);
}

function eventPosition(
  event: PointerEvent | WheelEvent,
): readonly [number, number] {
  const bounds = canvas.getBoundingClientRect();
  return [event.clientX - bounds.left, event.clientY - bounds.top];
}

function recenterProceduralComposition(
  viewportWidth: number,
  viewportHeight: number,
): void {
  if (proceduralPreview === null) return;
  const centerTileX = Math.floor((cameraX + viewportWidth / 2) / 16);
  const centerTileY = Math.floor((cameraY + viewportHeight / 2) / 16);
  const centerChunkX = floorDiv(centerTileX, PROCEDURAL_WORLD_CHUNK_TILES);
  const centerChunkY = floorDiv(centerTileY, PROCEDURAL_WORLD_CHUNK_TILES);
  const compositionCenterX =
    proceduralPreview.minChunkX +
    Math.floor(proceduralPreview.chunkColumns / 2);
  const compositionCenterY =
    proceduralPreview.minChunkY + Math.floor(proceduralPreview.chunkRows / 2);
  if (
    Math.abs(centerChunkX - compositionCenterX) < 4 &&
    Math.abs(centerChunkY - compositionCenterY) < 4
  )
    return;
  const next = recenterProceduralEditorPreview(
    proceduralPreview,
    centerChunkX,
    centerChunkY,
  );
  if (next === proceduralPreview) return;
  proceduralPreview = next;
  terrain = terrainArrayForProceduralEditorPreview(proceduralPreview);
  refreshInspection();
}

function proceduralOverviewForViewport(
  viewportWidth: number,
  viewportHeight: number,
): ProceduralOverviewCache | null {
  if (proceduralPreview === null) return null;
  const visibleMinTileX = Math.floor(cameraX / 16);
  const visibleMinTileY = Math.floor(cameraY / 16);
  const visibleWidthTiles = Math.max(1, Math.ceil(viewportWidth / 16));
  const visibleHeightTiles = Math.max(1, Math.ceil(viewportHeight / 16));
  let stepTiles = 1;
  while (
    (Math.max(visibleWidthTiles, visibleHeightTiles) * 1.5) / stepTiles >
    512
  )
    stepTiles *= 2;
  const cached = proceduralOverviewCache;
  if (
    cached !== null &&
    cached.stepTiles === stepTiles &&
    visibleMinTileX >= cached.minTileX &&
    visibleMinTileY >= cached.minTileY &&
    visibleMinTileX + visibleWidthTiles <=
      cached.minTileX + cached.widthTiles &&
    visibleMinTileY + visibleHeightTiles <= cached.minTileY + cached.heightTiles
  )
    return cached;

  const paddingX = Math.max(32, Math.ceil(visibleWidthTiles / 4));
  const paddingY = Math.max(32, Math.ceil(visibleHeightTiles / 4));
  const alignment = stepTiles * 16;
  const minTileX =
    Math.floor((visibleMinTileX - paddingX) / alignment) * alignment;
  const minTileY =
    Math.floor((visibleMinTileY - paddingY) / alignment) * alignment;
  const widthTiles =
    Math.ceil((visibleWidthTiles + paddingX * 2) / alignment) * alignment;
  const heightTiles =
    Math.ceil((visibleHeightTiles + paddingY * 2) / alignment) * alignment;
  const raster = proceduralEditorOverviewRaster(proceduralPreview, stepTiles, {
    minTileX,
    minTileY,
    width: widthTiles,
    height: heightTiles,
  });
  const image = document.createElement("canvas");
  image.width = raster.width;
  image.height = raster.height;
  const imageContext = image.getContext("2d");
  if (imageContext === null)
    throw new Error("Unable to create procedural overview canvas");
  const imageData = imageContext.createImageData(raster.width, raster.height);
  imageData.data.set(raster.pixels);
  imageContext.putImageData(imageData, 0, 0);
  proceduralOverviewCache = {
    image,
    minTileX,
    minTileY,
    widthTiles,
    heightTiles,
    stepTiles,
  };
  return proceduralOverviewCache;
}

function uniquePoints(points: readonly MapPoint[]): readonly MapPoint[] {
  return [
    ...new Map(
      points.map((point) => [`${point.tileX},${point.tileY}`, point]),
    ).values(),
  ];
}

function brushPatch(selected: EditorTool): MapCellPatch | null {
  if (selected === "grass") return { surface: "grass", feature: "none" };
  if (selected === "dirt") return { surface: "dirt", feature: "none" };
  if (selected === "water") return { surface: "water", feature: "river" };
  if (selected === "path") return { feature: "path" };
  return null;
}

function finishStroke(): void {
  const points = uniquePoints(draftPoints);
  drawing = false;
  drawingElevation = null;
  draftPoints = [];
  if (points.length === 0) return;
  const patch = brushPatch(tool);
  if (patch !== null) {
    commit({ kind: "paint", points, patch }, `${points.length} CELLS PAINTED`);
    return;
  }
  if (tool === "raise" || tool === "lower") {
    const delta = tool === "raise" ? 1 : -1;
    if (points.length >= 3)
      commit(
        { kind: "change_elevation_polygon", polygon: points, delta },
        "CONTOUR COMPILED",
      );
    else {
      const point = points[0]!;
      const elevation = Math.max(
        0,
        resolvedMapCellAt(history.present, point.tileX, point.tileY).elevation +
          delta,
      );
      commit(
        { kind: "paint", points: [point], patch: { elevation } },
        `TILE SET TO L${elevation}`,
      );
    }
    return;
  }
  if (tool === "block") {
    const point = points[0]!;
    const current = resolvedMapCellAt(
      history.present,
      point.tileX,
      point.tileY,
    ).collision;
    const patch: MapCellPatch =
      current === "force_block"
        ? { collision: "inherit", collisionReason: "" }
        : {
            collision: "force_block",
            collisionReason: "offline editor override",
          };
    commit(
      { kind: "paint", points: [point], patch },
      `COLLISION ${current === "force_block" ? "INHERITS" : "BLOCKED"}`,
    );
  }
}

function saveLocal(): void {
  localStorage.setItem(LOCAL_DRAFT_KEY, serializeMapDocument(history.present));
  status = `SAVED LOCAL DRAFT #${mapDocumentHash(history.present)}`;
}

function loadLocal(): void {
  const source = localStorage.getItem(LOCAL_DRAFT_KEY);
  if (source === null) {
    status = "NO LOCAL DRAFT SAVED";
    return;
  }
  const document = parseMapDocument(source);
  rebuild(
    createMapEditHistory(document),
    `LOADED LOCAL DRAFT #${mapDocumentHash(document)}`,
  );
}

function exportMap(): void {
  const source = serializeMapDocument(history.present);
  const url = URL.createObjectURL(
    new Blob([source], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${history.present.id}.map.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  status = `EXPORTED #${mapDocumentHash(history.present)}`;
}

function importMap(): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,.map.json,application/json";
  input.addEventListener(
    "change",
    () => {
      const file = input.files?.[0];
      if (file === undefined) return;
      void file
        .text()
        .then((source) => {
          const imported = parseMapDocument(source);
          rebuild(
            createMapEditHistory(imported),
            `IMPORTED ${file.name} #${mapDocumentHash(imported)}`,
          );
        })
        .catch((error: unknown) => {
          status = `IMPORT FAILED: ${String(error)}`;
        });
    },
    { once: true },
  );
  input.click();
}

function randomizeProceduralSeed(): void {
  if (proceduralPreview === null) return;
  const confirmed = window.confirm(
    "Randomize the numeric world seed and regenerate this local preview? Any unsaved editor changes will be lost.",
  );
  if (!confirmed) {
    status = "SEED RANDOMIZATION CANCELLED";
    return;
  }
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  const seed = values[0] ?? 0;
  proceduralPreview = generateProceduralEditorChunk(
    createProceduralEditorPreview({ seed }),
    0,
    0,
  );
  terrain = terrainArrayForProceduralEditorPreview(proceduralPreview);
  proceduralOverviewCache = null;
  proceduralChunkPreviewCache.clear();
  selectedTile = null;
  inspection = null;
  trace = null;
  activeElevation = 0;
  cameraX = -renderer.cssWidth / worldZoom / 2;
  cameraY = -renderer.cssHeight / worldZoom / 2;
  localStorage.setItem(
    generatedChunksStorageKey(proceduralPreview),
    proceduralEditorGeneratedChunkKeys(proceduralPreview).join(";"),
  );
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  window.history.replaceState(null, "", url);
  lastPersistedSessionKey = currentEditorSessionStorageKey();
  lastPersistedSessionSource = null;
  persistEditorSession(true);
  status = `NUMERIC SEED ${seed} — ORIGIN CHUNK REGENERATED LOCALLY`;
}

function resizeFromEdge(
  edge: "west" | "east" | "north" | "south",
  grow: boolean,
  step: number,
): void {
  const before = history.present;
  const signedStep = grow ? step : -step;
  const width = Math.max(
    1,
    before.width + (edge === "west" || edge === "east" ? signedStep : 0),
  );
  const height = Math.max(
    1,
    before.height + (edge === "north" || edge === "south" ? signedStep : 0),
  );
  if (width === before.width && height === before.height) {
    status = "MAP CANNOT BE SMALLER THAN 1 x 1";
    return;
  }
  const anchor: MapResizeAnchor =
    edge === "west"
      ? "east"
      : edge === "east"
        ? "west"
        : edge === "north"
          ? "south"
          : "north";
  const offset = mapResizeOffset(before, width, height, anchor);
  const next = commitMapEdit(history, {
    kind: "resize",
    width,
    height,
    anchor,
  });
  if (selectedTile !== null) {
    const shifted = {
      tileX: selectedTile.tileX + offset.tileX,
      tileY: selectedTile.tileY + offset.tileY,
    };
    selectedTile =
      shifted.tileX >= 0 &&
      shifted.tileY >= 0 &&
      shifted.tileX < width &&
      shifted.tileY < height
        ? shifted
        : null;
  }
  cameraX += offset.tileX * 16;
  cameraY += offset.tileY * 16;
  draftPoints = [];
  drawing = false;
  drawingElevation = null;
  const actualDelta =
    edge === "west" || edge === "east"
      ? Math.abs(width - before.width)
      : Math.abs(height - before.height);
  rebuild(
    next,
    `MAP ${width} x ${height} — ${edge.toUpperCase()} EDGE ${grow ? "+" : "-"}${actualDelta}`,
  );
}

function performUiAction(
  action: Exclude<EditorUiAction, null>,
  resizeStep = 1,
): void {
  if (action.kind === "generate_chunk") {
    generateSelectedProceduralChunk();
    return;
  }
  if (action.kind === "tool") {
    tool = action.tool;
    status = `${tool.toUpperCase()} TOOL`;
    return;
  }
  if (action.kind === "toggle_grid") {
    gridVisible = !gridVisible;
    status = `TILE GRID ${gridVisible ? "ON" : "OFF"}`;
    return;
  }
  if (action.kind === "toggle_height") {
    heightVisible = !heightVisible;
    status = `HEIGHT OVERLAY ${heightVisible ? "ON" : "OFF"}`;
    return;
  }
  if (action.kind === "toggle_collision") {
    collisionVisible = !collisionVisible;
    status = `COLLISION OVERLAY ${collisionVisible ? "ON" : "OFF"}`;
    return;
  }
  if (action.kind === "toggle_terrain_family") {
    terrainFamilyOpen = !terrainFamilyOpen;
    status = terrainFamilyOpen
      ? "CHOOSE A COMPLETE TERRAIN FAMILY"
      : `TERRAIN FAMILY ${terrainFamily.toUpperCase()}`;
    return;
  }
  if (action.kind === "terrain_family") {
    terrainFamily = action.family;
    terrainFamilyOpen = false;
    status = `TERRAIN FAMILY ${terrainFamily.toUpperCase()} SELECTED`;
    return;
  }
  if (action.kind === "toggle_edge_mode") {
    edgeMode = edgeMode === "auto" ? "manual" : "auto";
    status =
      edgeMode === "auto"
        ? "AUTO EDGES ON — SEMANTIC NEIGHBOURS RESOLVE TRANSITIONS"
        : "MANUAL ROLES — RAW FRAME PALETTE IS DRAFT-ONLY";
    return;
  }
  if (action.kind === "resize") {
    resizeFromEdge(action.edge, action.grow, resizeStep);
    return;
  }
  if (action.kind === "undo") rebuild(undoMapEdit(history), "UNDO");
  else if (action.kind === "redo") rebuild(redoMapEdit(history), "REDO");
  else if (action.kind === "save") saveLocal();
  else if (action.kind === "load") loadLocal();
  else if (action.kind === "export") exportMap();
  else if (action.kind === "import") importMap();
  else randomizeProceduralSeed();
}

function uiActionAtScreen(screenX: number, screenY: number): EditorUiAction {
  const selectedChunk = selectedProceduralChunk();
  const generateAvailable =
    proceduralPreview !== null &&
    selectedChunk !== null &&
    !proceduralEditorChunkGenerated(
      proceduralPreview,
      selectedChunk.chunkX,
      selectedChunk.chunkY,
    );
  return editorUiActionAt(
    screenX,
    screenY,
    renderer.cssWidth,
    generateAvailable,
    leftUiScroll,
    rightUiScroll,
    proceduralPreview === null,
    terrainFamilyOpen,
  );
}

canvas.addEventListener("pointerdown", (event) => {
  const [screenX, screenY] = eventPosition(event);
  const drawer = editorUiDrawerAt(screenX, renderer.cssWidth);
  const action = uiActionAtScreen(screenX, screenY);
  if (action !== null) {
    performUiAction(action, event.shiftKey ? 8 : 1);
    return;
  }
  if (drawer !== null) return;
  if (editorUiMapHeaderAt(screenX, screenY, renderer.cssWidth)) return;
  if (event.button === 1 || keys.has(" ")) {
    panning = true;
    previousPointerX = screenX;
    previousPointerY = screenY;
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  const hit = pointerWorldHit(screenX, screenY);
  if (hit === null) return;
  const point: MapPoint = { tileX: hit.tileX, tileY: hit.tileY };
  activeElevation = hit.elevation;
  selectedTile = point;
  refreshInspection();
  if (tool === "inspect") {
    status = `INSPECTING ${point.tileX},${point.tileY}`;
    return;
  }
  if (proceduralPreview !== null) {
    status = "GENERATED BASE IS READ-ONLY — USE INSPECT OR GENERATE CHUNK";
    return;
  }
  const patch = brushPatch(tool);
  if (event.shiftKey && patch?.surface !== undefined) {
    commit(
      { kind: "fill_surface", start: point, surface: patch.surface },
      `${patch.surface.toUpperCase()} REGION FILLED`,
    );
    return;
  }
  drawing = true;
  drawingElevation = hit.elevation;
  draftPoints = [point];
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  const [screenX, screenY] = eventPosition(event);
  hoveredUiAction = uiActionAtScreen(screenX, screenY);
  if (panning) {
    cameraX -= (screenX - previousPointerX) / worldZoom;
    cameraY -= (screenY - previousPointerY) / worldZoom;
    previousPointerX = screenX;
    previousPointerY = screenY;
    return;
  }
  if (!drawing) return;
  const hit = pointerWorldHit(
    screenX,
    screenY,
    drawingElevation ?? activeElevation,
  );
  const point: MapPoint | null =
    hit === null ? null : { tileX: hit.tileX, tileY: hit.tileY };
  const previous = draftPoints.at(-1);
  if (
    point === null ||
    previous === undefined ||
    (point.tileX === previous.tileX && point.tileY === previous.tileY)
  )
    return;
  if (tool === "raise" || tool === "lower") draftPoints.push(point);
  else draftPoints.push(...rasterMapLine(previous, point).slice(1));
});

canvas.addEventListener("pointerup", (event) => {
  if (panning) {
    panning = false;
    canvas.releasePointerCapture(event.pointerId);
    return;
  }
  if (drawing) {
    finishStroke();
    canvas.releasePointerCapture(event.pointerId);
  }
});
canvas.addEventListener("pointerleave", () => {
  hoveredUiAction = null;
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const [screenX, screenY] = eventPosition(event);
    const drawer = editorUiDrawerAt(screenX, renderer.cssWidth);
    if (drawer !== null) {
      const maximum = editorUiScrollLimit(
        drawer,
        renderer.cssHeight,
        proceduralMode,
        terrainFamilyOpen,
      );
      const delta = event.deltaY * 0.7;
      if (drawer === "left")
        leftUiScroll = Math.max(0, Math.min(maximum, leftUiScroll + delta));
      else
        rightUiScroll = Math.max(0, Math.min(maximum, rightUiScroll + delta));
      return;
    }
    const beforeX = cameraX + screenX / worldZoom;
    const beforeY = cameraY + screenY / worldZoom;
    worldZoom = editorWorldZoomAfterWheel(
      worldZoom,
      event.deltaY,
      proceduralMode,
    );
    canvas.dataset["editorZoom"] = worldZoom.toFixed(5);
    cameraX = beforeX - screenX / worldZoom;
    cameraY = beforeY - screenY / worldZoom;
  },
  { passive: false },
);

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  if (event.ctrlKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    rebuild(undoMapEdit(history), "UNDO");
  } else if (event.ctrlKey && event.key.toLowerCase() === "y") {
    event.preventDefault();
    rebuild(redoMapEdit(history), "REDO");
  } else if (event.ctrlKey && event.key.toLowerCase() === "s") {
    event.preventDefault();
    exportMap();
  } else if (event.ctrlKey && event.key.toLowerCase() === "o") {
    event.preventDefault();
    importMap();
  } else if (/^[1-8]$/u.test(event.key))
    tool = (
      [
        "inspect",
        "grass",
        "dirt",
        "water",
        "path",
        "raise",
        "lower",
        "block",
      ] as const
    )[Number(event.key) - 1]!;
  else if (event.key.toLowerCase() === "g") gridVisible = !gridVisible;
  else if (event.key.toLowerCase() === "h") heightVisible = !heightVisible;
  else if (event.key.toLowerCase() === "c" || event.key.toLowerCase() === "b")
    collisionVisible = !collisionVisible;
  else if (event.key === "[") {
    activeElevation = Math.max(0, activeElevation - 1);
    refreshInspection();
  } else if (event.key === "]") {
    activeElevation += 1;
    refreshInspection();
  } else if (event.key.toLowerCase() === "k") saveLocal();
  else if (event.key.toLowerCase() === "l") loadLocal();
  else if (event.key === "Home") {
    cameraX = proceduralMode
      ? -renderer.cssWidth / worldZoom / 2
      : history.present.width * 8 - renderer.cssWidth / worldZoom / 2;
    cameraY = proceduralMode
      ? -renderer.cssHeight / worldZoom / 2
      : history.present.height * 8 - renderer.cssHeight / worldZoom / 2;
  }
});
window.addEventListener("keyup", (event) =>
  keys.delete(event.key.toLowerCase()),
);
window.addEventListener("blur", () => {
  keys.clear();
  drawing = false;
  drawingElevation = null;
  panning = false;
  draftPoints = [];
});
window.addEventListener("pagehide", () => persistEditorSession(true));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistEditorSession(true);
});

let previousFrame = performance.now();
function renderFrame(timeMs: number): void {
  renderer.resize();
  const elapsed = Math.min(50, timeMs - previousFrame);
  previousFrame = timeMs;
  const pan = (elapsed * 0.34) / worldZoom;
  if (keys.has("a") || keys.has("arrowleft")) cameraX -= pan;
  if (keys.has("d") || keys.has("arrowright")) cameraX += pan;
  if (keys.has("w") || keys.has("arrowup")) cameraY -= pan;
  if (keys.has("s") || keys.has("arrowdown")) cameraY += pan;
  persistEditorSession();

  const overviewMode =
    proceduralPreview !== null &&
    editorUsesOverviewLod(worldZoom, renderer.cssWidth, renderer.cssHeight);
  const viewportWorldWidth = renderer.cssWidth / worldZoom;
  const viewportWorldHeight = renderer.cssHeight / worldZoom;
  if (!overviewMode)
    recenterProceduralComposition(viewportWorldWidth, viewportWorldHeight);
  const overview = overviewMode
    ? proceduralOverviewForViewport(viewportWorldWidth, viewportWorldHeight)
    : null;
  canvas.dataset["editorRenderMode"] = overviewMode ? "overview" : "detail";
  const compositionOrigin = proceduralCompositionOrigin();
  const overlayOptions: EditorOverlayOptions = {
    activeElevation,
    gridVisible,
    heightVisible,
    collisionVisible,
    selectedTile,
    draftPolygon: draftPoints,
    overviewMode,
    ...(proceduralPreview === null
      ? {}
      : {
          proceduralChunks: {
            compositionMinTileX: compositionOrigin.tileX,
            compositionMinTileY: compositionOrigin.tileY,
            generatedChunkKeys: new Set(proceduralPreview.generated.keys()),
            chunkPreviewImage: (chunkX, chunkY) =>
              cachedProceduralChunkPreviewImage(
                proceduralPreview!,
                chunkX,
                chunkY,
              ),
            ...(overview === null ? {} : { overview }),
            selectedChunkX: selectedProceduralChunk()?.chunkX ?? null,
            selectedChunkY: selectedProceduralChunk()?.chunkY ?? null,
            terrain,
          },
        }),
  };

  let ui: CanvasRenderingContext2D;
  if (overviewMode) {
    // Clear through a small valid pass, then render semantic chunks directly
    // in display space. This avoids the detailed pass's finite backing-store
    // limit while retaining exact camera/pointer coordinates.
    renderer.beginWorld(8);
    renderer.compositeWorld();
    ui = renderer.beginUi(1);
    drawEditorWorldOverlays(
      ui,
      history.present,
      compiled,
      overlayOptions,
      cameraX,
      cameraY,
      worldZoom,
      renderer.cssWidth / worldZoom,
      renderer.cssHeight / worldZoom,
    );
  } else {
    const frame = renderer.beginWorld(worldZoom);
    const scale = frame.layout.integerScale;
    const viewportWidth = frame.layout.width / scale;
    const viewportHeight = frame.layout.height / scale;
    const terrainCameraX =
      proceduralPreview === null
        ? cameraX
        : cameraX - compositionOrigin.tileX * 16;
    const terrainCameraY =
      proceduralPreview === null
        ? cameraY
        : cameraY - compositionOrigin.tileY * 16;
    groundCache.draw(
      frame.world,
      art,
      terrain,
      terrainCameraX,
      terrainCameraY,
      scale,
      frame.layout.width,
      frame.layout.height,
    );
    const queue: WorldDepthItem[] = [];
    enqueueRaisedTerrainDepth(
      queue,
      frame.world,
      art,
      terrain,
      groundCache,
      terrainCameraX,
      terrainCameraY,
      scale,
      viewportWidth,
      viewportHeight,
    );
    for (const item of sortWorldDepthItems(queue)) item.draw();
    drawEditorWorldOverlays(
      frame.world,
      history.present,
      compiled,
      overlayOptions,
      cameraX,
      cameraY,
      scale,
      viewportWidth,
      viewportHeight,
    );
    renderer.compositeWorld();
    ui = renderer.beginUi(1);
  }

  const selectedChunk = selectedProceduralChunk();
  const selectedWorldTile = proceduralPreview === null ? null : selectedTile;
  drawEditorUi(
    ui,
    art,
    terrain,
    groundCache,
    {
      title: history.present.title,
      hash: mapDocumentHash(history.present),
      revision: history.present.revision,
      mapWidth: history.present.width,
      mapHeight: history.present.height,
      tool,
      terrainFamily,
      terrainFamilyOpen,
      edgeMode,
      activeElevation,
      gridVisible,
      heightVisible,
      collisionVisible,
      worldZoom,
      pastCount: history.past.length,
      futureCount: history.future.length,
      validationErrors,
      status,
      inspection,
      trace,
      procedural:
        proceduralPreview === null
          ? null
          : {
              seedLabel: String(proceduralPreview.seed),
              generatorVersion: proceduralPreview.generatorVersion,
              generatedChunkCount: proceduralPreview.generated.size,
              selectedChunkX: selectedChunk?.chunkX ?? null,
              selectedChunkY: selectedChunk?.chunkY ?? null,
              selectedChunkGenerated:
                selectedChunk === null
                  ? false
                  : proceduralEditorChunkGenerated(
                      proceduralPreview,
                      selectedChunk.chunkX,
                      selectedChunk.chunkY,
                    ),
              selectedWorldTileX: selectedWorldTile?.tileX ?? null,
              selectedWorldTileY: selectedWorldTile?.tileY ?? null,
            },
      hoveredAction: hoveredUiAction,
      leftScrollOffset: leftUiScroll,
      rightScrollOffset: rightUiScroll,
    },
    renderer.cssWidth,
    renderer.cssHeight,
  );
  canvas.dataset["editorStatus"] = status;
  canvas.dataset["editorSeed"] =
    proceduralPreview === null ? "" : String(proceduralPreview.seed);
  canvas.dataset["editorSelectedChunk"] =
    selectedChunk === null
      ? ""
      : `${selectedChunk.chunkX},${selectedChunk.chunkY}`;
  canvas.dataset["editorSelectedTile"] =
    selectedTile === null ? "" : `${selectedTile.tileX},${selectedTile.tileY}`;
  renderer.endUi();
}

function render(timeMs: number): void {
  try {
    renderFrame(timeMs);
    delete canvas.dataset["editorError"];
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    canvas.dataset["editorError"] = message;
    status = `RENDER ERROR: ${message}`;
    console.error(error);
  }
  requestAnimationFrame(render);
}

canvas.setAttribute("aria-label", "Orchard and Cellar offline world editor");
canvas.focus();
refreshInspection();
dismissLoadingScreen();
requestAnimationFrame(render);
