import {
  createTileObjectWorkspace,
  explodeTileObject,
  groupTileObject,
  moveTileObject,
  parseMapStampDocument,
  parseTileObjectWorkspace,
  removeTileObjectPlacement,
  serializeTileObjectWorkspace,
  tileObjectWorkspaceFromMapStamp,
  TILE_OBJECT_COLLISION_RESOLUTION,
  TILE_OBJECT_COLLISION_MASK_EMPTY,
  TILE_OBJECT_COLLISION_MASK_FULL,
  upsertTileObjectCell,
  upsertTileObjectCollection,
  upsertTileObjectPlacement,
  type MapStampPlacement,
  type MapStampVisual,
  type TileObjectCellMetadata,
  type TileObjectCollectionFrame,
  type TileObjectDefinition,
  type TileObjectWorkspaceV1,
} from '@orchard/sim';
import {
  dismissLoadingScreen,
  setLoadingScreenStage,
  upgradeLoadingScreen,
} from '../loading-screen.js';
import {
  loadGeneratedAsset,
  loadGeneratedAssetCatalog,
  type LoadedAsset,
} from '../render/assets.js';
import {
  drawPixelText,
  loadPixelUi,
  measurePixelText,
} from '../render/pixel-ui.js';
import { selectAtlasFrame, type AtlasFrame } from '../render/sprite.js';
import {
  drawUiIconAsset,
  drawUiSkinAsset,
  loadUiSkin,
  type UiIconName,
} from '../ui/skin.js';
import {
  AUTHORING_ASSET_CATEGORIES,
  buildAssetPalette,
  displayAssetName,
  filterAssetPalette,
  type AssetPaletteItem,
  type AuthoringAssetCategory,
} from './asset-palette.js';
import { clientEntryRoute } from './editor-route.js';

type StudioTool = 'inspect' | 'stamp' | 'erase' | 'pan' | 'marquee' | 'frame';
type PaletteCategory = AuthoringAssetCategory | 'all';

interface Point { readonly x: number; readonly y: number }
interface Rect extends Point { readonly width: number; readonly height: number }
interface HitRegion {
  readonly rect: Rect;
  readonly tooltip: string;
  readonly action:
    | { readonly kind: 'tool'; readonly tool: StudioTool }
    | { readonly kind: 'command'; readonly command:
      'undo' | 'redo' | 'save' | 'load' | 'export' | 'import' | 'world'
      | 'group' | 'explode' | 'height-down' | 'height-up'
      | 'collision-clear' | 'collision-full'
      | 'collision-nw' | 'collision-ne' | 'collision-sw' | 'collision-se' }
    | { readonly kind: 'search' }
    | { readonly kind: 'category'; readonly category: PaletteCategory }
    | { readonly kind: 'palette'; readonly key: string };
}

const TILE_SIZE = 16;
const UI_SCALE = 2;
const LEFT_WIDTH = 370;
const RIGHT_WIDTH = 350;
const HEADER_HEIGHT = 58;
const FOOTER_HEIGHT = 50;
const THUMBNAIL_CELL = 82;
const PALETTE_COLUMNS = 4;
const PALETTE_TOP = 252;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const SESSION_VERSION = 1;
const TRANSPARENCY_GRID_SIZE = 16;
const TRANSPARENCY_GRID_LIGHT = '#96999d';
const TRANSPARENCY_GRID_DARK = '#51555d';
const COLLECTION_COLORS = ['#d66a4a', '#5f9f62', '#6689c3', '#ad6fb8', '#d5a84b'] as const;
const COLLISION_QUADRANTS = {
  nw: 0x0033,
  ne: 0x00cc,
  sw: 0x3300,
  se: 0xcc00,
} as const;
const LAYER_ORDER = ['ground', 'object', 'canopy'] as const;

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');
if (canvasElement === null) throw new Error('Missing design studio canvas');
const canvas: HTMLCanvasElement = canvasElement;
const contextValue = canvas.getContext('2d');
if (contextValue === null) throw new Error('Canvas 2D unavailable');
const context: CanvasRenderingContext2D = contextValue;
const searchInputElement = document.querySelector<HTMLInputElement>('#account-name');
if (searchInputElement === null) throw new Error('Missing canvas text input');
const searchInput: HTMLInputElement = searchInputElement;

setLoadingScreenStage({
  title: 'OPENING LAYOUT STUDIO', detail: 'INDEXING TILES, PROPS, AND BUILDINGS', progress: 42,
});
const [ui, skin, catalog, hammer] = await Promise.all([
  loadPixelUi(),
  loadUiSkin(),
  loadGeneratedAssetCatalog(),
  loadGeneratedAsset('icon_cf_hammer', 'summer'),
]);
upgradeLoadingScreen(ui, skin, hammer);
setLoadingScreenStage({
  title: 'OPENING LAYOUT STUDIO', detail: 'PREPARING THE DESIGN BOARD', progress: 86,
});

const route = clientEntryRoute(location.pathname, location.search);
const stampId = route.kind === 'offline_design_editor' ? route.stampId : 'untitled-layout';
const localDraftKey = `orchard.editor.stamp.v1.${stampId}`;
const sessionKey = `orchard.editor.stamp-session.v${SESSION_VERSION}.${stampId}`;
const entirePalette = buildAssetPalette(catalog);
const assetCache = new Map<string, LoadedAsset>();
const assetLoads = new Map<string, Promise<void>>();

function loadPaletteAsset(assetName: string): LoadedAsset | null {
  const cached = assetCache.get(assetName);
  if (cached !== undefined) return cached;
  if (!assetLoads.has(assetName)) {
    assetLoads.set(assetName, loadGeneratedAsset(assetName, 'summer')
      .then((asset) => { assetCache.set(assetName, asset); })
      .catch((error: unknown) => { console.warn(`Palette asset failed: ${assetName}`, error); }));
  }
  return null;
}

interface StoredSession {
  readonly version: number;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly zoom: number;
  readonly tool: StudioTool;
  readonly category: PaletteCategory;
  readonly search: string;
  readonly selectedPaletteKey: string | null;
  readonly selectedPlacementId: string | null;
  readonly paletteScroll: number;
  readonly showGrid?: boolean;
}

function parseSession(source: string | null): StoredSession | null {
  if (source === null) return null;
  try {
    const value = JSON.parse(source) as Partial<StoredSession>;
    if (value.version !== SESSION_VERSION
      || typeof value.cameraX !== 'number' || !Number.isFinite(value.cameraX)
      || typeof value.cameraY !== 'number' || !Number.isFinite(value.cameraY)
      || typeof value.zoom !== 'number' || value.zoom < MIN_ZOOM || value.zoom > MAX_ZOOM
      || !['inspect', 'stamp', 'erase', 'pan', 'marquee', 'frame'].includes(value.tool ?? '')
      || !['all', ...AUTHORING_ASSET_CATEGORIES].includes(value.category as PaletteCategory)
      || typeof value.search !== 'string'
      || !(typeof value.selectedPaletteKey === 'string' || value.selectedPaletteKey === null)
      || !(typeof value.selectedPlacementId === 'string' || value.selectedPlacementId === null)
      || typeof value.paletteScroll !== 'number' || value.paletteScroll < 0
      || (value.showGrid !== undefined && typeof value.showGrid !== 'boolean')) return null;
    return value as StoredSession;
  } catch {
    return null;
  }
}

function loadInitialDocument(): TileObjectWorkspaceV1 {
  const source = localStorage.getItem(localDraftKey);
  if (source !== null) {
    try { return parseTileObjectWorkspace(source); } catch {
      try { return tileObjectWorkspaceFromMapStamp(parseMapStampDocument(source)); } catch { /* ignore corrupt local draft */ }
    }
  }
  return createTileObjectWorkspace({
    id: stampId,
    title: stampId === 'untitled-layout' ? 'Untitled Layout' : displayAssetName(stampId),
    width: 128,
    height: 96,
    assetRegistryRevision: catalog.revision,
  });
}

let documentState = loadInitialDocument();
let past: TileObjectWorkspaceV1[] = [];
let future: TileObjectWorkspaceV1[] = [];
const restored = parseSession(localStorage.getItem(sessionKey));
let cameraX = restored?.cameraX ?? documentState.width * TILE_SIZE / 2;
let cameraY = restored?.cameraY ?? documentState.height * TILE_SIZE / 2;
let zoom = restored?.zoom ?? 2;
let tool: StudioTool = restored?.tool ?? 'stamp';
let category: PaletteCategory = restored?.category ?? 'all';
let search = restored?.search ?? '';
let selectedPaletteKey: string | null = restored?.selectedPaletteKey
  ?? entirePalette.find((entry) => entry.assetName === 'prop_cf_camp_tent')?.key
  ?? entirePalette[0]?.key
  ?? null;
let selectedPlacementId: string | null = restored?.selectedPlacementId ?? null;
let selectedObjectId: string | null = documentState.objects.find((entry) =>
  selectedPlacementId !== null && entry.placementIds.includes(selectedPlacementId))?.id ?? null;
let selectedFrameId: string | null = null;
let selectedCellId: string | null = selectedObjectId === null
  ? null
  : documentState.objects.find((entry) => entry.id === selectedObjectId)?.cellIds[0] ?? null;
let selectedPlacementIds = new Set<string>(selectedObjectId === null
  ? (selectedPlacementId === null ? [] : [selectedPlacementId])
  : documentState.objects.find((entry) => entry.id === selectedObjectId)?.placementIds ?? []);
let paletteScroll = restored?.paletteScroll ?? 0;
let showGrid = restored?.showGrid ?? true;
let status = `READY — ${entirePalette.length} VISUALS FROM ${Object.keys(catalog.assets).length} ASSETS`;
let pointer: Point = { x: -1, y: -1 };
let hoveredHit: HitRegion | null = null;
let hitRegions: HitRegion[] = [];
let panning = false;
let paintAction: 'stamp' | 'erase' | null = null;
let previousPointer: Point = pointer;
let lastPaintedTile = '';
let lastSessionWrite = 0;
let selectionStart: { readonly tileX: number; readonly tileY: number } | null = null;
let selectionEnd: { readonly tileX: number; readonly tileY: number } | null = null;
let moveStartTile: { readonly tileX: number; readonly tileY: number } | null = null;
let moveSource: TileObjectWorkspaceV1 | null = null;
let moveDelta: readonly [number, number] = [0, 0];

searchInput.maxLength = 80;
searchInput.autocomplete = 'off';
searchInput.setAttribute('aria-label', 'Search the layout studio asset palette');
searchInput.value = search;

function filteredPalette(): readonly AssetPaletteItem[] {
  return filterAssetPalette(entirePalette, { search, category });
}

function selectedPaletteItem(): AssetPaletteItem | null {
  return entirePalette.find((entry) => entry.key === selectedPaletteKey) ?? null;
}

function paletteItemForPlacement(placement: MapStampPlacement): AssetPaletteItem | null {
  return entirePalette.find((entry) => entry.assetName === placement.assetName
    && entry.visual.kind === placement.visual.kind
    && entry.visual.name === placement.visual.name
    && entry.visual.frameIndex === placement.visual.frameIndex) ?? null;
}

function activeInspectorItem(): AssetPaletteItem | null {
  const placement = documentState.placements.find((entry) => entry.id === selectedPlacementId);
  return placement === undefined ? selectedPaletteItem() : paletteItemForPlacement(placement);
}

function saveLocal(message = 'LAYOUT SAVED LOCALLY'): void {
  localStorage.setItem(localDraftKey, serializeTileObjectWorkspace(documentState));
  status = message;
}

function persistSession(now = performance.now()): void {
  if (now - lastSessionWrite < 250) return;
  lastSessionWrite = now;
  const session: StoredSession = {
    version: SESSION_VERSION, cameraX, cameraY, zoom, tool, category, search,
    selectedPaletteKey, selectedPlacementId, paletteScroll, showGrid,
  };
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

function commit(next: TileObjectWorkspaceV1, message: string): void {
  if (next === documentState) return;
  past = [...past, documentState].slice(-100);
  documentState = next;
  future = [];
  saveLocal(message);
}

function undo(): void {
  const previous = past.at(-1);
  if (previous === undefined) return;
  future = [documentState, ...future].slice(0, 100);
  documentState = previous;
  past = past.slice(0, -1);
  selectedPlacementId = null;
  saveLocal('UNDO');
}

function redo(): void {
  const next = future[0];
  if (next === undefined) return;
  past = [...past, documentState].slice(-100);
  documentState = next;
  future = future.slice(1);
  selectedPlacementId = null;
  saveLocal('REDO');
}

function loadLocal(): void {
  const source = localStorage.getItem(localDraftKey);
  if (source === null) { status = 'NO LOCAL LAYOUT SAVED'; return; }
  try {
    try { documentState = parseTileObjectWorkspace(source); } catch {
      documentState = tileObjectWorkspaceFromMapStamp(parseMapStampDocument(source));
    }
    past = [];
    future = [];
    selectedPlacementId = null;
    selectedObjectId = null;
    selectedFrameId = null;
    selectedCellId = null;
    selectedPlacementIds = new Set();
    status = 'LOCAL LAYOUT LOADED';
  } catch (error: unknown) {
    status = error instanceof Error ? `LOAD FAILED — ${error.message}` : 'LOAD FAILED';
  }
}

function downloadLayout(): void {
  const blob = new Blob([serializeTileObjectWorkspace(documentState)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement('a');
  anchor.href = url;
  anchor.download = `${documentState.id}.tile-workspace.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  status = 'LAYOUT EXPORTED';
}

function importLayout(): void {
  const input = globalThis.document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.tile-workspace.json,.map-stamp.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (file === undefined) return;
    try {
      const source = await file.text();
      let imported: TileObjectWorkspaceV1;
      try { imported = parseTileObjectWorkspace(source); } catch {
        imported = tileObjectWorkspaceFromMapStamp(parseMapStampDocument(source));
      }
      past = [...past, documentState].slice(-100);
      documentState = imported;
      future = [];
      selectedPlacementId = null;
      saveLocal(`IMPORTED ${file.name.toLocaleUpperCase()}`);
    } catch (error: unknown) {
      status = error instanceof Error ? `IMPORT FAILED — ${error.message}` : 'IMPORT FAILED';
    }
  }, { once: true });
  input.click();
}

function resizeCanvas(): void {
  const dpr = Math.max(1, devicePixelRatio);
  const width = Math.max(1, Math.floor(innerWidth));
  const height = Math.max(1, Math.floor(innerHeight));
  if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
  if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.imageSmoothingEnabled = false;
}

function viewport(): Rect {
  return {
    x: LEFT_WIDTH,
    y: 0,
    width: Math.max(1, innerWidth - LEFT_WIDTH - RIGHT_WIDTH),
    height: innerHeight,
  };
}

function boardScreenOrigin(): Point {
  const view = viewport();
  return {
    x: view.x + view.width / 2 - cameraX * zoom,
    y: view.y + view.height / 2 - cameraY * zoom,
  };
}

function screenToTile(point: Point): { readonly tileX: number; readonly tileY: number } | null {
  const origin = boardScreenOrigin();
  const tileX = Math.floor((point.x - origin.x) / zoom / TILE_SIZE);
  const tileY = Math.floor((point.y - origin.y) / zoom / TILE_SIZE);
  if (tileX < 0 || tileY < 0 || tileX >= documentState.width || tileY >= documentState.height) return null;
  return { tileX, tileY };
}

function placementAt(tileX: number, tileY: number): MapStampPlacement | null {
  return [...documentState.placements].sort(comparePlacementDrawOrder).reverse().find((placement) => {
    const footprint = paletteItemForPlacement(placement)?.footprint ?? [1, 1];
    return tileX >= placement.tileX && tileX < placement.tileX + footprint[0]
      && tileY > placement.tileY - footprint[1] && tileY <= placement.tileY;
  }) ?? null;
}

function comparePlacementDrawOrder(left: MapStampPlacement, right: MapStampPlacement): number {
  return left.elevation - right.elevation
    || LAYER_ORDER.indexOf(left.layer) - LAYER_ORDER.indexOf(right.layer)
    || left.tileY - right.tileY
    || left.tileX - right.tileX
    || left.id.localeCompare(right.id);
}

function nextPlacementId(item: AssetPaletteItem, tileX: number, tileY: number): string {
  const stem = `${item.assetName}-${tileX}-${tileY}`.slice(0, 80);
  let ordinal = 1;
  while (documentState.placements.some((placement) => placement.id === `${stem}-${ordinal}`)) ordinal += 1;
  return `${stem}-${ordinal}`;
}

function stampAt(tileX: number, tileY: number): void {
  const selected = selectedPaletteItem();
  if (selected === null) return;
  const existing = [...documentState.placements].reverse().find((placement) =>
    placement.tileX === tileX && placement.tileY === tileY && placement.layer === selected.layer);
  let next = documentState;
  if (existing !== undefined) next = removeTileObjectPlacement(next, existing.id);
  const placement: MapStampPlacement = {
    id: nextPlacementId(selected, tileX, tileY),
    assetId: selected.assetId,
    assetName: selected.assetName,
    visual: selected.visual,
    tileX,
    tileY,
    elevation: 0,
    layer: selected.layer,
    quarterTurns: 0,
    flipX: false,
  };
  commit(upsertTileObjectPlacement(next, placement), `PLACED ${displayAssetName(selected.assetName).toLocaleUpperCase()}`);
  selectedPlacementId = placement.id;
}

function eraseAt(tileX: number, tileY: number): void {
  const placement = placementAt(tileX, tileY);
  if (placement === null) return;
  commit(removeTileObjectPlacement(documentState, placement.id), `REMOVED ${displayAssetName(placement.assetName).toLocaleUpperCase()}`);
  if (selectedPlacementId === placement.id) {
    selectedPlacementId = null;
    selectedObjectId = null;
    selectedCellId = null;
    selectedPlacementIds.delete(placement.id);
  }
}

function pickAt(tileX: number, tileY: number, switchToStamp: boolean): void {
  const placement = placementAt(tileX, tileY);
  selectedPlacementId = placement?.id ?? null;
  const object = placement === null ? null : documentState.objects.find((entry) => entry.placementIds.includes(placement.id)) ?? null;
  selectedObjectId = object?.id ?? null;
  selectedPlacementIds = new Set(object?.placementIds ?? (placement === null ? [] : [placement.id]));
  selectedCellId = object?.cellIds
    .map((id) => documentState.cells.find((entry) => entry.id === id))
    .find((cell) => cell?.tileX === tileX && cell.tileY === tileY)?.id ?? null;
  selectedFrameId = null;
  if (placement === null) {
    const frame = [...documentState.collections].reverse().find((entry) =>
      tileX >= entry.tileX && tileX < entry.tileX + entry.width
      && tileY >= entry.tileY && tileY < entry.tileY + entry.height) ?? null;
    selectedFrameId = frame?.id ?? null;
    status = frame === null ? 'NOTHING TO PICK' : `SELECTED COLLECTION ${frame.label.toLocaleUpperCase()}`;
    return;
  }
  const paletteEntry = paletteItemForPlacement(placement);
  if (paletteEntry !== null) selectedPaletteKey = paletteEntry.key;
  if (switchToStamp) tool = 'stamp';
  status = object === null
    ? `${switchToStamp ? 'PICKED' : 'SELECTED'} ${displayAssetName(placement.assetName).toLocaleUpperCase()}`
    : `SELECTED OBJECT ${object.label.toLocaleUpperCase()}`;
}

interface TileBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function boundsForPlacements(placementIds: ReadonlySet<string>, source = documentState): TileBounds | null {
  const placements = source.placements.filter((entry) => placementIds.has(entry.id));
  if (placements.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const placement of placements) {
    const item = paletteItemForPlacement(placement);
    const footprint = item?.footprint ?? [1, 1];
    left = Math.min(left, placement.tileX);
    top = Math.min(top, placement.tileY - footprint[1] + 1);
    right = Math.max(right, placement.tileX + footprint[0]);
    bottom = Math.max(bottom, placement.tileY + 1);
  }
  return { left, top, right, bottom };
}

function normalizedSelectionBounds(): TileBounds | null {
  if (selectionStart === null || selectionEnd === null) return null;
  return {
    left: Math.min(selectionStart.tileX, selectionEnd.tileX),
    top: Math.min(selectionStart.tileY, selectionEnd.tileY),
    right: Math.max(selectionStart.tileX, selectionEnd.tileX) + 1,
    bottom: Math.max(selectionStart.tileY, selectionEnd.tileY) + 1,
  };
}

function collectionForBounds(bounds: TileBounds, source = documentState): string | null {
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  return [...source.collections].reverse().find((entry) =>
    centerX >= entry.tileX && centerX < entry.tileX + entry.width
    && centerY >= entry.tileY && centerY < entry.tileY + entry.height)?.id ?? null;
}

function nextWorkspaceId(prefix: string, existing: readonly string[]): string {
  let ordinal = 1;
  while (existing.includes(`${prefix}-${ordinal}`)) ordinal += 1;
  return `${prefix}-${ordinal}`;
}

function groupSelection(): void {
  const groupedIds = new Set(documentState.objects.flatMap((entry) => entry.placementIds));
  const placementIds = [...selectedPlacementIds].filter((id) => !groupedIds.has(id));
  if (placementIds.length === 0) {
    status = selectedPlacementIds.size > 0 ? 'EXPLODE AN EXISTING OBJECT BEFORE REGROUPING' : 'MARQUEE SOME LOOSE TILES FIRST';
    return;
  }
  const objectId = nextWorkspaceId('tile-object', documentState.objects.map((entry) => entry.id));
  const suggested = `Tile Object ${documentState.objects.length + 1}`;
  const label = globalThis.prompt('Name this reusable tile object', suggested)?.trim();
  if (label === undefined || label.length === 0) { status = 'GROUP CANCELLED'; return; }

  let next = documentState;
  const occupied = new Map<string, { blocking: boolean; elevation: number }>();
  for (const placement of documentState.placements.filter((entry) => placementIds.includes(entry.id))) {
    const item = paletteItemForPlacement(placement);
    const footprint = item?.footprint ?? [1, 1];
    for (let offsetY = 0; offsetY < footprint[1]; offsetY += 1) {
      for (let offsetX = 0; offsetX < footprint[0]; offsetX += 1) {
        const tileX = placement.tileX + offsetX;
        const tileY = placement.tileY - footprint[1] + 1 + offsetY;
        const key = `${tileX},${tileY}`;
        const previous = occupied.get(key);
        occupied.set(key, {
          blocking: (previous?.blocking ?? false) || (item?.blocksMovement ?? false),
          elevation: Math.max(previous?.elevation ?? -32, placement.elevation),
        });
      }
    }
  }
  const claimedCellIds = new Set(documentState.objects.flatMap((entry) => entry.cellIds));
  const cellIds: string[] = [];
  for (const [coordinate, defaults] of occupied) {
    const [tileXText, tileYText] = coordinate.split(',');
    const tileX = Number(tileXText);
    const tileY = Number(tileYText);
    const existing = documentState.cells.find((entry) =>
      entry.tileX === tileX && entry.tileY === tileY && !claimedCellIds.has(entry.id));
    if (existing !== undefined) { cellIds.push(existing.id); continue; }
    const cellId = nextWorkspaceId(`${objectId}-cell`, next.cells.map((entry) => entry.id));
    next = upsertTileObjectCell(next, {
      id: cellId,
      tileX,
      tileY,
      elevation: defaults.elevation,
      collisionMask: defaults.blocking ? TILE_OBJECT_COLLISION_MASK_FULL : TILE_OBJECT_COLLISION_MASK_EMPTY,
    });
    cellIds.push(cellId);
  }
  const bounds = boundsForPlacements(new Set(placementIds), next);
  const object: TileObjectDefinition = {
    id: objectId,
    label: label.slice(0, 64),
    placementIds,
    cellIds,
    collectionId: bounds === null ? null : collectionForBounds(bounds, next),
  };
  next = groupTileObject(next, object);
  commit(next, `CREATED OBJECT ${object.label.toLocaleUpperCase()}`);
  selectedObjectId = object.id;
  selectedFrameId = null;
  selectedPlacementIds = new Set(object.placementIds);
  selectedPlacementId = object.placementIds[0] ?? null;
  selectedCellId = object.cellIds[0] ?? null;
  tool = 'inspect';
}

function explodeSelection(): void {
  if (selectedObjectId === null) { status = 'SELECT A GROUPED OBJECT TO EXPLODE'; return; }
  const object = documentState.objects.find((entry) => entry.id === selectedObjectId);
  if (object === undefined) return;
  commit(explodeTileObject(documentState, object.id), `EXPLODED ${object.label.toLocaleUpperCase()}`);
  selectedObjectId = null;
  selectedCellId = null;
  selectedPlacementIds = new Set(object.placementIds);
}

function updateSelectedCell(update: (cell: TileObjectCellMetadata) => TileObjectCellMetadata, message: string): void {
  const cell = documentState.cells.find((entry) => entry.id === selectedCellId);
  if (cell === undefined) { status = 'SELECT AN OBJECT CELL FIRST'; return; }
  commit(upsertTileObjectCell(documentState, update(cell)), message);
}

function toggleCollisionQuadrant(mask: number, quadrant: keyof typeof COLLISION_QUADRANTS): number {
  const bits = COLLISION_QUADRANTS[quadrant];
  return (mask & bits) === bits ? mask & ~bits : mask | bits;
}

function finishCollectionFrame(): void {
  const bounds = normalizedSelectionBounds();
  if (bounds === null) return;
  const suggested = `Collection ${documentState.collections.length + 1}`;
  const label = globalThis.prompt('Name this visual collection (for example Plants)', suggested)?.trim();
  if (label === undefined || label.length === 0) { status = 'COLLECTION CANCELLED'; return; }
  const id = nextWorkspaceId('collection', documentState.collections.map((entry) => entry.id));
  const frame: TileObjectCollectionFrame = {
    id,
    label: label.slice(0, 48),
    color: COLLECTION_COLORS[documentState.collections.length % COLLECTION_COLORS.length] ?? COLLECTION_COLORS[0],
    tileX: bounds.left,
    tileY: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
  commit(upsertTileObjectCollection(documentState, frame), `CREATED COLLECTION ${frame.label.toLocaleUpperCase()}`);
  selectedFrameId = frame.id;
  selectedObjectId = null;
  selectedCellId = null;
  selectedPlacementId = null;
  selectedPlacementIds = new Set();
  tool = 'inspect';
}

function selectMarqueeContents(): void {
  const bounds = normalizedSelectionBounds();
  if (bounds === null) return;
  const groupedIds = new Set(documentState.objects.flatMap((entry) => entry.placementIds));
  const ids = documentState.placements.filter((placement) => {
    if (groupedIds.has(placement.id)) return false;
    const placementBounds = boundsForPlacements(new Set([placement.id]));
    return placementBounds !== null
      && placementBounds.left < bounds.right && placementBounds.right > bounds.left
      && placementBounds.top < bounds.bottom && placementBounds.bottom > bounds.top;
  }).map((entry) => entry.id);
  selectedPlacementIds = new Set(ids);
  selectedPlacementId = ids[0] ?? null;
  selectedObjectId = null;
  selectedFrameId = null;
  selectedCellId = null;
  status = ids.length === 0 ? 'MARQUEE FOUND NO LOOSE TILES' : `${ids.length} LOOSE PIECES SELECTED`;
}

function beginInspectMove(tileX: number, tileY: number): void {
  if (selectedObjectId === null && selectedPlacementId === null) return;
  moveSource = documentState;
  moveStartTile = { tileX, tileY };
  moveDelta = [0, 0];
}

function previewInspectMove(tileX: number, tileY: number): void {
  if (moveSource === null || moveStartTile === null) return;
  const deltaX = tileX - moveStartTile.tileX;
  const deltaY = tileY - moveStartTile.tileY;
  if (deltaX === moveDelta[0] && deltaY === moveDelta[1]) return;
  try {
    if (selectedObjectId !== null) {
      documentState = moveTileObject(moveSource, selectedObjectId, deltaX, deltaY);
    } else if (selectedPlacementId !== null) {
      const placement = moveSource.placements.find((entry) => entry.id === selectedPlacementId);
      if (placement === undefined) return;
      documentState = upsertTileObjectPlacement(moveSource, {
        ...placement,
        tileX: placement.tileX + deltaX,
        tileY: placement.tileY + deltaY,
      });
    }
    moveDelta = [deltaX, deltaY];
    status = `MOVE ${deltaX >= 0 ? '+' : ''}${deltaX},${deltaY >= 0 ? '+' : ''}${deltaY}`;
  } catch {
    status = 'MOVE WOULD LEAVE THE LAYOUT BOARD';
  }
}

function finishInspectMove(): void {
  if (moveSource === null) return;
  const source = moveSource;
  const [deltaX, deltaY] = moveDelta;
  let next = source;
  try {
    if (selectedObjectId !== null) {
      const moved = moveTileObject(source, selectedObjectId, deltaX, deltaY);
      const object = moved.objects.find((entry) => entry.id === selectedObjectId);
      const bounds = boundsForPlacements(new Set(object?.placementIds ?? []), moved);
      next = moveTileObject(source, selectedObjectId, deltaX, deltaY,
        bounds === null ? null : collectionForBounds(bounds, moved));
    } else if (selectedPlacementId !== null) {
      const placement = source.placements.find((entry) => entry.id === selectedPlacementId);
      if (placement !== undefined) {
        next = upsertTileObjectPlacement(source, {
          ...placement,
          tileX: placement.tileX + deltaX,
          tileY: placement.tileY + deltaY,
        });
      }
    }
  } catch {
    next = source;
  }
  documentState = source;
  if (next !== source) commit(next, selectedObjectId === null ? 'MOVED TILE PIECE' : 'MOVED TILE OBJECT');
  moveSource = null;
  moveStartTile = null;
  moveDelta = [0, 0];
}

function visualFrame(asset: LoadedAsset, visual: MapStampVisual, timeMs: number): AtlasFrame | null {
  if (visual.kind !== 'animation') {
    return selectAtlasFrame(asset.metadata, visual.name, visual.frameIndex);
  }
  const frames = asset.metadata.animations[visual.name] ?? [];
  if (frames.length === 0) return null;
  const fps = asset.metadata.animationMeta?.[visual.name]?.fps ?? 6;
  return frames[Math.floor(timeMs * fps / 1000) % frames.length] ?? frames[0] ?? null;
}

function inside(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.y >= rect.y
    && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
}

function addHit(rect: Rect, action: HitRegion['action'], tooltip: string): void {
  hitRegions.push({ rect, action, tooltip });
}

function panel(rect: Rect): void {
  drawUiSkinAsset(context, skin.panelWood, rect);
  drawUiSkinAsset(context, skin.panelParchment, {
    x: rect.x + 10, y: rect.y + 10,
    width: Math.max(1, rect.width - 20), height: Math.max(1, rect.height - 20),
  });
}

function text(value: string, x: number, y: number, options: {
  readonly color?: string; readonly header?: boolean; readonly scale?: number; readonly align?: CanvasTextAlign;
} = {}): void {
  drawPixelText(context, ui, value, x, y, {
    color: options.color ?? '#513322',
    font: options.header ? 'header' : 'body',
    scale: options.scale ?? UI_SCALE,
    align: options.align,
  });
}

function fitText(value: string, maximumWidth: number, header = false, scale = UI_SCALE): string {
  const font = header ? ui.headerFont : ui.font;
  if (measurePixelText(value, scale, font) <= maximumWidth) return value;
  let result = value;
  while (result.length > 1 && measurePixelText(`${result}...`, scale, font) > maximumWidth) result = result.slice(0, -1);
  return `${result}...`;
}

function iconButton(
  name: UiIconName,
  x: number,
  y: number,
  command: Extract<HitRegion['action'], { kind: 'command' }>['command'],
  tooltip: string,
  enabled = true,
): void {
  const rect = { x, y, width: 38, height: 38 };
  const hovered = hoveredHit?.action.kind === 'command' && hoveredHit.action.command === command;
  if (hovered && enabled) {
    context.fillStyle = '#5ba25380';
    context.beginPath();
    context.roundRect(x, y, rect.width, rect.height, 5);
    context.fill();
  }
  drawUiIconAsset(context, skin.icons[name], { x: x + 8, y: y + 8, width: 22, height: 22 }, enabled ? 1 : 0.35);
  if (enabled) addHit(rect, { kind: 'command', command }, tooltip);
}

function categoryLabel(value: PaletteCategory): string {
  return value === 'all' ? 'ALL' : value.toLocaleUpperCase();
}

function drawAssetFitted(asset: LoadedAsset, frame: AtlasFrame, rect: Rect, padding = 5): void {
  const scale = Math.min(
    (rect.width - padding * 2) / frame.width,
    (rect.height - padding * 2) / frame.height,
    4,
  );
  const width = Math.max(1, frame.width * scale);
  const height = Math.max(1, frame.height * scale);
  context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height,
    Math.round(rect.x + (rect.width - width) / 2), Math.round(rect.y + (rect.height - height) / 2),
    Math.round(width), Math.round(height));
}

function drawLeftDrawer(timeMs: number): void {
  panel({ x: 0, y: 0, width: LEFT_WIDTH, height: innerHeight });
  drawUiSkinAsset(context, skin.banner, { x: 30, y: 14, width: LEFT_WIDTH - 60, height: 50 });
  text('PALETTE', LEFT_WIDTH / 2, 25, { header: true, scale: 2, align: 'center' });

  let toolbarX = 28;
  iconButton('undo', toolbarX, 70, 'undo', 'Undo (Ctrl+Z)', past.length > 0); toolbarX += 42;
  iconButton('redo', toolbarX, 70, 'redo', 'Redo (Ctrl+Y)', future.length > 0); toolbarX += 42;
  iconButton('save', toolbarX, 70, 'save', 'Save this layout locally (K)'); toolbarX += 42;
  iconButton('load', toolbarX, 70, 'load', 'Load the local layout (L)'); toolbarX += 42;
  iconButton('export', toolbarX, 70, 'export', 'Export a portable map-stamp JSON file'); toolbarX += 42;
  iconButton('import', toolbarX, 70, 'import', 'Import a map-stamp JSON file');

  const searchRect = { x: 24, y: 116, width: LEFT_WIDTH - 48, height: 40 };
  drawUiSkinAsset(context, skin.frameThin, searchRect);
  context.fillStyle = '#f7d4aa';
  context.fillRect(searchRect.x + 7, searchRect.y + 7, searchRect.width - 14, searchRect.height - 14);
  const searchLabel = search.length === 0 ? 'SEARCH ASSETS...' : search;
  text(fitText(searchLabel, searchRect.width - 28), searchRect.x + 14, searchRect.y + 13, {
    color: search.length === 0 ? '#8b6a55' : '#513322',
  });
  if (globalThis.document.activeElement === searchInput && Math.floor(timeMs / 500) % 2 === 0) {
    const caretX = searchRect.x + 14 + measurePixelText(search, UI_SCALE, ui.font);
    context.fillStyle = '#513322';
    context.fillRect(Math.min(searchRect.x + searchRect.width - 12, caretX), searchRect.y + 11, 2, 18);
  }
  addHit(searchRect, { kind: 'search' }, 'Search asset names and semantic tags (/ or Ctrl+F)');

  const categories: readonly PaletteCategory[] = ['all', ...AUTHORING_ASSET_CATEGORIES];
  const buttonWidth = (LEFT_WIDTH - 48) / 3;
  categories.forEach((entry, index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;
    const rect = { x: 24 + column * buttonWidth, y: 164 + row * 34, width: buttonWidth - 4, height: 30 };
    drawUiSkinAsset(context, category === entry ? skin.buttonConfirm : skin.button, rect);
    text(categoryLabel(entry), rect.x + rect.width / 2, rect.y + 9, { scale: 1, align: 'center' });
    addHit(rect, { kind: 'category', category: entry }, `Show ${categoryLabel(entry).toLocaleLowerCase()} assets`);
  });

  const entries = filteredPalette();
  const paletteBottom = innerHeight - 22;
  const paletteHeight = Math.max(1, paletteBottom - PALETTE_TOP);
  const rowCount = Math.ceil(entries.length / PALETTE_COLUMNS);
  const maximumScroll = Math.max(0, rowCount * THUMBNAIL_CELL - paletteHeight);
  paletteScroll = Math.max(0, Math.min(maximumScroll, paletteScroll));
  context.save();
  context.beginPath();
  context.rect(20, PALETTE_TOP, LEFT_WIDTH - 46, paletteHeight);
  context.clip();
  const firstRow = Math.max(0, Math.floor(paletteScroll / THUMBNAIL_CELL));
  const lastRow = Math.min(rowCount, Math.ceil((paletteScroll + paletteHeight) / THUMBNAIL_CELL));
  for (let row = firstRow; row < lastRow; row += 1) {
    for (let column = 0; column < PALETTE_COLUMNS; column += 1) {
      const entry = entries[row * PALETTE_COLUMNS + column];
      if (entry === undefined) continue;
      const rect = {
        x: 22 + column * THUMBNAIL_CELL,
        y: PALETTE_TOP + row * THUMBNAIL_CELL - paletteScroll,
        width: THUMBNAIL_CELL - 7,
        height: THUMBNAIL_CELL - 7,
      };
      drawUiSkinAsset(context, entry.key === selectedPaletteKey ? skin.selectorConfirm : skin.slot, rect);
      const asset = loadPaletteAsset(entry.assetName);
      if (asset !== null) {
        const frame = entry.animated ? visualFrame(asset, entry.visual, timeMs) : entry.frame;
        if (frame !== null) drawAssetFitted(asset, frame, { x: rect.x + 4, y: rect.y + 4, width: rect.width - 8, height: rect.height - 23 });
      }
      text(String(entry.visual.frameIndex + 1), rect.x + 7, rect.y + rect.height - 16, { scale: 1 });
      if (entry.animated) text('▶', rect.x + rect.width - 13, rect.y + 5, { color: '#397146', scale: 1 });
      addHit(rect, { kind: 'palette', key: entry.key },
        `${displayAssetName(entry.assetName)} — ${entry.visual.kind} ${entry.visual.name}${entry.visual.kind === 'variant' ? ` #${entry.visual.frameIndex + 1}` : ''}`);
    }
  }
  context.restore();

  if (maximumScroll > 0) {
    const track = { x: LEFT_WIDTH - 24, y: PALETTE_TOP, width: 9, height: paletteHeight };
    drawUiSkinAsset(context, skin.sliderTrack, track);
    const thumbHeight = Math.max(28, track.height * paletteHeight / (rowCount * THUMBNAIL_CELL));
    const thumbY = track.y + (track.height - thumbHeight) * paletteScroll / maximumScroll;
    drawUiSkinAsset(context, skin.sliderHandle, { x: track.x - 5, y: thumbY, width: 19, height: thumbHeight });
  }
  text(`${entries.length} / ${entirePalette.length} ASSETS`, LEFT_WIDTH - 28, 236, {
    scale: 1, align: 'right', color: '#397146',
  });
}

function drawToolButton(buttonTool: StudioTool, x: number, iconAsset: LoadedAsset, label: string): void {
  const rect = { x, y: 73, width: 46, height: 46 };
  drawUiSkinAsset(context, tool === buttonTool ? skin.buttonSmallConfirm : skin.slot, rect);
  drawUiSkinAsset(context, iconAsset, { x: x + 7, y: 80, width: 32, height: 32 });
  addHit(rect, { kind: 'tool', tool: buttonTool }, label);
}

function drawTransparencyGrid(board: Rect, clip: Rect): void {
  const left = Math.max(board.x, clip.x);
  const top = Math.max(board.y, clip.y);
  const right = Math.min(board.x + board.width, clip.x + clip.width);
  const bottom = Math.min(board.y + board.height, clip.y + clip.height);
  if (left >= right || top >= bottom) return;

  context.save();
  context.beginPath();
  context.rect(left, top, right - left, bottom - top);
  context.clip();
  context.fillStyle = TRANSPARENCY_GRID_DARK;
  context.fillRect(left, top, right - left, bottom - top);
  const firstColumn = Math.floor((left - board.x) / TRANSPARENCY_GRID_SIZE);
  const lastColumn = Math.ceil((right - board.x) / TRANSPARENCY_GRID_SIZE);
  const firstRow = Math.floor((top - board.y) / TRANSPARENCY_GRID_SIZE);
  const lastRow = Math.ceil((bottom - board.y) / TRANSPARENCY_GRID_SIZE);
  context.fillStyle = TRANSPARENCY_GRID_LIGHT;
  for (let row = firstRow; row < lastRow; row += 1) {
    for (let column = firstColumn; column < lastColumn; column += 1) {
      if ((row + column) % 2 !== 0) continue;
      context.fillRect(
        board.x + column * TRANSPARENCY_GRID_SIZE,
        board.y + row * TRANSPARENCY_GRID_SIZE,
        TRANSPARENCY_GRID_SIZE,
        TRANSPARENCY_GRID_SIZE,
      );
    }
  }
  context.restore();
}

function drawBoard(timeMs: number): void {
  const view = viewport();
  context.save();
  context.beginPath();
  context.rect(view.x, view.y, view.width, view.height);
  context.clip();
  context.fillStyle = '#171c19';
  context.fillRect(view.x, view.y, view.width, view.height);

  const origin = boardScreenOrigin();
  const boardWidth = documentState.width * TILE_SIZE * zoom;
  const boardHeight = documentState.height * TILE_SIZE * zoom;
  drawTransparencyGrid({
    x: Math.round(origin.x),
    y: Math.round(origin.y),
    width: Math.ceil(boardWidth),
    height: Math.ceil(boardHeight),
  }, view);

  for (const frame of documentState.collections) {
    const frameRect = {
      x: origin.x + frame.tileX * TILE_SIZE * zoom,
      y: origin.y + frame.tileY * TILE_SIZE * zoom,
      width: frame.width * TILE_SIZE * zoom,
      height: frame.height * TILE_SIZE * zoom,
    };
    context.save();
    context.globalAlpha = selectedFrameId === frame.id ? 0.2 : 0.1;
    context.fillStyle = frame.color;
    context.fillRect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
    context.restore();
    context.strokeStyle = frame.color;
    context.lineWidth = selectedFrameId === frame.id ? 4 : 2;
    context.setLineDash([10, 6]);
    context.strokeRect(frameRect.x, frameRect.y, frameRect.width, frameRect.height);
    context.setLineDash([]);
    const labelWidth = Math.min(frameRect.width, Math.max(80, measurePixelText(frame.label.toLocaleUpperCase(), 1, ui.font) + 20));
    context.fillStyle = frame.color;
    context.fillRect(frameRect.x, frameRect.y, labelWidth, 22);
    text(fitText(frame.label.toLocaleUpperCase(), labelWidth - 12, false, 1), frameRect.x + 6, frameRect.y + 7, {
      scale: 1, color: '#fff5da',
    });
  }

  context.save();
  context.translate(origin.x, origin.y);
  context.scale(zoom, zoom);
  context.imageSmoothingEnabled = false;
  const placements = [...documentState.placements].sort(comparePlacementDrawOrder);
  for (const placement of placements) {
    const asset = loadPaletteAsset(placement.assetName);
    if (asset === null) continue;
    const frame = visualFrame(asset, placement.visual, timeMs);
    if (frame === null) continue;
    const x = placement.tileX * TILE_SIZE + TILE_SIZE / 2 - asset.anchor[0];
    const y = (placement.tileY + 1) * TILE_SIZE - asset.anchor[1];
    context.save();
    if (placement.flipX || placement.quarterTurns !== 0) {
      const anchorX = placement.tileX * TILE_SIZE + TILE_SIZE / 2;
      const anchorY = (placement.tileY + 1) * TILE_SIZE;
      context.translate(anchorX, anchorY);
      context.rotate(placement.quarterTurns * Math.PI / 2);
      context.scale(placement.flipX ? -1 : 1, 1);
      context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height,
        -asset.anchor[0], -asset.anchor[1], frame.width, frame.height);
    } else {
      context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, x, y, frame.width, frame.height);
    }
    context.restore();
  }
  context.restore();

  if (showGrid && zoom >= 0.75) {
    context.strokeStyle = '#d9efbc55';
    context.lineWidth = Math.max(1, zoom < 1 ? 1 : zoom);
    context.beginPath();
    for (let x = 0; x <= documentState.width; x += 1) {
      const sx = origin.x + x * TILE_SIZE * zoom;
      context.moveTo(sx, origin.y);
      context.lineTo(sx, origin.y + boardHeight);
    }
    for (let y = 0; y <= documentState.height; y += 1) {
      const sy = origin.y + y * TILE_SIZE * zoom;
      context.moveTo(origin.x, sy);
      context.lineTo(origin.x + boardWidth, sy);
    }
    context.stroke();
  }

  const activeSelectionBounds = selectedObjectId === null
    ? boundsForPlacements(selectedPlacementIds)
    : boundsForPlacements(new Set(documentState.objects.find((entry) => entry.id === selectedObjectId)?.placementIds ?? []));
  if (activeSelectionBounds !== null) {
    context.strokeStyle = '#79d7ff';
    context.lineWidth = 3;
    context.setLineDash(selectedObjectId === null ? [6, 4] : []);
    context.strokeRect(
      origin.x + activeSelectionBounds.left * TILE_SIZE * zoom,
      origin.y + activeSelectionBounds.top * TILE_SIZE * zoom,
      (activeSelectionBounds.right - activeSelectionBounds.left) * TILE_SIZE * zoom,
      (activeSelectionBounds.bottom - activeSelectionBounds.top) * TILE_SIZE * zoom,
    );
    context.setLineDash([]);
  }

  const draftBounds = normalizedSelectionBounds();
  if (draftBounds !== null) {
    context.fillStyle = tool === 'frame' ? '#d5a84b24' : '#79d7ff22';
    context.fillRect(
      origin.x + draftBounds.left * TILE_SIZE * zoom,
      origin.y + draftBounds.top * TILE_SIZE * zoom,
      (draftBounds.right - draftBounds.left) * TILE_SIZE * zoom,
      (draftBounds.bottom - draftBounds.top) * TILE_SIZE * zoom,
    );
    context.strokeStyle = tool === 'frame' ? '#d5a84b' : '#79d7ff';
    context.lineWidth = 2;
    context.setLineDash([6, 4]);
    context.strokeRect(
      origin.x + draftBounds.left * TILE_SIZE * zoom,
      origin.y + draftBounds.top * TILE_SIZE * zoom,
      (draftBounds.right - draftBounds.left) * TILE_SIZE * zoom,
      (draftBounds.bottom - draftBounds.top) * TILE_SIZE * zoom,
    );
    context.setLineDash([]);
  }

  const selectedCell = documentState.cells.find((entry) => entry.id === selectedCellId);
  if (selectedCell !== undefined) {
    const cellX = origin.x + selectedCell.tileX * TILE_SIZE * zoom;
    const cellY = origin.y + selectedCell.tileY * TILE_SIZE * zoom;
    const subSize = TILE_SIZE * zoom / TILE_OBJECT_COLLISION_RESOLUTION;
    context.fillStyle = '#ef526f77';
    for (let bit = 0; bit < TILE_OBJECT_COLLISION_RESOLUTION ** 2; bit += 1) {
      if ((selectedCell.collisionMask & (1 << bit)) === 0) continue;
      context.fillRect(
        cellX + (bit % TILE_OBJECT_COLLISION_RESOLUTION) * subSize,
        cellY + Math.floor(bit / TILE_OBJECT_COLLISION_RESOLUTION) * subSize,
        subSize,
        subSize,
      );
    }
    context.strokeStyle = '#ffec77';
    context.lineWidth = 2;
    context.strokeRect(cellX, cellY, TILE_SIZE * zoom, TILE_SIZE * zoom);
    text(`H${selectedCell.elevation}`, cellX + 3, cellY + 3, { scale: 1, color: '#fff5da' });
  }

  const hoveredTile = inside(pointer, view) ? screenToTile(pointer) : null;
  const selectedPlacement = documentState.placements.find((entry) => entry.id === selectedPlacementId);
  const outlineTile = selectedPlacement === undefined ? hoveredTile : selectedPlacement;
  if (outlineTile !== null && outlineTile !== undefined) {
    const item = selectedPlacement === undefined ? selectedPaletteItem() : paletteItemForPlacement(selectedPlacement);
    const footprint = item?.footprint ?? [1, 1];
    context.strokeStyle = selectedPlacement === undefined ? '#f7ef9b' : '#92e382';
    context.lineWidth = 2;
    context.strokeRect(
      Math.round(origin.x + outlineTile.tileX * TILE_SIZE * zoom) + 1,
      Math.round(origin.y + (outlineTile.tileY - footprint[1] + 1) * TILE_SIZE * zoom) + 1,
      Math.max(2, footprint[0] * TILE_SIZE * zoom - 2),
      Math.max(2, footprint[1] * TILE_SIZE * zoom - 2),
    );
  }
  context.restore();

  panel({ x: view.x + 20, y: 12, width: Math.max(260, view.width - 40), height: HEADER_HEIGHT });
  text(fitText(`${documentState.title}  /  ${documentState.width}×${documentState.height} TILES  /  REV ${documentState.revision}`, view.width - 92),
    view.x + 40, 32, { color: '#397146' });

  const toolsX = view.x + Math.max(30, (view.width - 320) / 2);
  drawToolButton('inspect', toolsX, skin.cursor, 'Inspect/select placed assets (1)');
  drawToolButton('stamp', toolsX + 54, hammer, 'Stamp the selected palette asset (2)');
  drawToolButton('erase', toolsX + 108, skin.crosshair, 'Erase the top asset at a tile (3)');
  drawToolButton('pan', toolsX + 162, skin.cursorClick, 'Pan the design board (4 or Space-drag)');
  drawToolButton('marquee', toolsX + 216, skin.selectorNeutral, 'Marquee loose tiles for grouping (5)');
  drawToolButton('frame', toolsX + 270, skin.selectorConfirm, 'Draw a labelled collection frame (6)');

  panel({ x: view.x + 20, y: innerHeight - FOOTER_HEIGHT - 12, width: Math.max(260, view.width - 40), height: FOOTER_HEIGHT });
  const tile = screenToTile(pointer);
  const footer = hoveredHit?.tooltip ?? `${status}  /  ZOOM ${zoom.toFixed(2)}×${tile === null ? '' : `  /  TILE ${tile.tileX},${tile.tileY}`}`;
  text(fitText(footer, view.width - 94), view.x + 40, innerHeight - 43, { scale: 1, color: '#513322' });
}

function wrapText(value: string, maximumCharacters: number): readonly string[] {
  const words = value.split(/\s+/u);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line.length === 0 ? word : `${line} ${word}`;
    if (next.length > maximumCharacters && line.length > 0) { lines.push(line); line = word; }
    else line = next;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

function inspectorButton(
  label: string,
  rect: Rect,
  command: Extract<HitRegion['action'], { kind: 'command' }>['command'],
  active = false,
): void {
  drawUiSkinAsset(context, active ? skin.buttonConfirm : skin.button, rect);
  text(fitText(label, rect.width - 18, false, 1), rect.x + rect.width / 2, rect.y + Math.max(7, (rect.height - 8) / 2), {
    scale: 1, align: 'center',
  });
  addHit(rect, { kind: 'command', command }, label);
}

function drawRightDrawer(timeMs: number): void {
  const x = innerWidth - RIGHT_WIDTH;
  panel({ x, y: 0, width: RIGHT_WIDTH, height: innerHeight });
  drawUiSkinAsset(context, skin.banner, { x: x + 28, y: 14, width: RIGHT_WIDTH - 56, height: 50 });
  text('INSPECTOR', x + RIGHT_WIDTH / 2, 25, { header: true, scale: 2, align: 'center' });
  const selectedFrame = documentState.collections.find((entry) => entry.id === selectedFrameId);
  const selectedObject = documentState.objects.find((entry) => entry.id === selectedObjectId);
  const item = activeInspectorItem();
  if (selectedFrame !== undefined) {
    text('COLLECTION FRAME', x + 30, 84, { scale: 1, color: '#397146' });
    text(fitText(selectedFrame.label.toLocaleUpperCase(), RIGHT_WIDTH - 60), x + 30, 108, { header: true, scale: 1 });
    context.fillStyle = selectedFrame.color;
    context.fillRect(x + 30, 142, 34, 34);
    text(`ORIGIN  ${selectedFrame.tileX},${selectedFrame.tileY}`, x + 78, 143, { scale: 1 });
    text(`SIZE  ${selectedFrame.width}×${selectedFrame.height} TILES`, x + 78, 165, { scale: 1 });
    text('DRAG GROUPED OBJECTS INTO THIS BOX', x + 30, 205, { scale: 1 });
    text('TO ASSIGN THEM TO THIS COLLECTION.', x + 30, 225, { scale: 1 });
  } else if (selectedObject !== undefined) {
    const collection = documentState.collections.find((entry) => entry.id === selectedObject.collectionId);
    const selectedCell = documentState.cells.find((entry) => entry.id === selectedCellId);
    text('TILE OBJECT', x + 30, 84, { scale: 1, color: '#397146' });
    text(fitText(selectedObject.label.toLocaleUpperCase(), RIGHT_WIDTH - 60), x + 30, 108, { header: true, scale: 1 });
    text(`${selectedObject.placementIds.length} PIECES  /  ${selectedObject.cellIds.length} CELLS`, x + 30, 137, { scale: 1 });
    text(`COLLECTION  ${collection?.label.toLocaleUpperCase() ?? 'UNASSIGNED'}`, x + 30, 159, { scale: 1 });
    inspectorButton('EXPLODE OBJECT', { x: x + 30, y: 190, width: RIGHT_WIDTH - 60, height: 34 }, 'explode');
    if (selectedCell === undefined) {
      text('CLICK AN OBJECT TILE TO EDIT ITS', x + 30, 254, { scale: 1 });
      text('HEIGHT AND FRACTIONAL COLLISION.', x + 30, 274, { scale: 1 });
    } else {
      text(`CELL  ${selectedCell.tileX},${selectedCell.tileY}`, x + 30, 252, { scale: 1, color: '#397146' });
      text('HEIGHT', x + 30, 280, { scale: 1 });
      inspectorButton('-', { x: x + 102, y: 268, width: 48, height: 34 }, 'height-down');
      text(String(selectedCell.elevation), x + 175, 280, { scale: 1, align: 'center' });
      inspectorButton('+', { x: x + 202, y: 268, width: 48, height: 34 }, 'height-up');
      text('COLLISION 4×4 MASK', x + 30, 328, { scale: 1, color: '#397146' });
      const quadrantButtons = [
        ['NW', 'collision-nw', COLLISION_QUADRANTS.nw],
        ['NE', 'collision-ne', COLLISION_QUADRANTS.ne],
        ['SW', 'collision-sw', COLLISION_QUADRANTS.sw],
        ['SE', 'collision-se', COLLISION_QUADRANTS.se],
      ] as const;
      quadrantButtons.forEach(([label, command, bits], index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        inspectorButton(label, { x: x + 30 + column * 76, y: 350 + row * 42, width: 70, height: 36 }, command,
          (selectedCell.collisionMask & bits) === bits);
      });
      inspectorButton('CLEAR', { x: x + 190, y: 350, width: 128, height: 36 }, 'collision-clear',
        selectedCell.collisionMask === TILE_OBJECT_COLLISION_MASK_EMPTY);
      inspectorButton('FULL', { x: x + 190, y: 392, width: 128, height: 36 }, 'collision-full',
        selectedCell.collisionMask === TILE_OBJECT_COLLISION_MASK_FULL);
      text('QUADRANTS COMBINE INTO HALVES OR', x + 30, 452, { scale: 1 });
      text('A FULL TILE; DATA REMAINS 4×4.', x + 30, 472, { scale: 1 });
    }
  } else if (selectedPlacementIds.size > 0) {
    text('LOOSE TILE SELECTION', x + 30, 84, { scale: 1, color: '#397146' });
    text(`${selectedPlacementIds.size} PIECES SELECTED`, x + 30, 112, { header: true, scale: 1 });
    inspectorButton('CREATE TILE OBJECT', { x: x + 30, y: 148, width: RIGHT_WIDTH - 60, height: 38 }, 'group');
    text('THE NEW OBJECT CAN BE MOVED AS ONE,', x + 30, 214, { scale: 1 });
    text('EXPLODED, AND ASSIGNED TO A FRAME.', x + 30, 234, { scale: 1 });
  } else if (item === null) {
    text('SELECT AN ASSET FROM THE PALETTE', x + 30, 85, { scale: 1 });
  } else {
    const asset = loadPaletteAsset(item.assetName);
    text(fitText(displayAssetName(item.assetName).toLocaleUpperCase(), RIGHT_WIDTH - 60), x + 30, 84, { header: true, scale: 1 });
    text(`#${item.assetId}  ${item.category.toLocaleUpperCase()}`, x + 30, 106, { scale: 1, color: '#397146' });
    const preview = { x: x + 42, y: 132, width: RIGHT_WIDTH - 84, height: 220 };
    drawUiSkinAsset(context, skin.frameThin, preview);
    context.fillStyle = '#dca370';
    context.fillRect(preview.x + 8, preview.y + 8, preview.width - 16, preview.height - 16);
    if (asset !== null) {
      const frame = visualFrame(asset, item.visual, timeMs);
      if (frame !== null) drawAssetFitted(asset, frame, preview, 24);
    }
    let y = 378;
    text(`${item.visual.kind.toLocaleUpperCase()}  ${item.visual.name}  #${item.visual.frameIndex + 1}`, x + 30, y, { scale: 1 }); y += 25;
    text(`LAYER  ${item.layer.toLocaleUpperCase()}`, x + 30, y, { scale: 1 }); y += 25;
    text(`FOOTPRINT  ${item.footprint[0]}×${item.footprint[1]} TILES`, x + 30, y, { scale: 1 }); y += 25;
    text(`COLLISION  ${item.blocksMovement ? 'BLOCKING' : 'OPEN'}`, x + 30, y, { scale: 1 }); y += 25;
    text(`BUILDER  ${item.builderAvailable ? 'READY' : 'CURATOR REVIEW'}`, x + 30, y, {
      scale: 1, color: item.builderAvailable ? '#397146' : '#98513b',
    }); y += 34;
    text('SEMANTIC TAGS', x + 30, y, { scale: 1, color: '#397146' }); y += 22;
    for (const line of wrapText(item.tags.join('  '), 37).slice(0, 7)) {
      text(line, x + 30, y, { scale: 1 }); y += 18;
    }
  }
  const worldRect = { x: x + 30, y: innerHeight - 65, width: RIGHT_WIDTH - 60, height: 35 };
  drawUiSkinAsset(context, skin.buttonSmall, worldRect);
  text('OPEN TERRAIN EDITOR', worldRect.x + worldRect.width / 2, worldRect.y + 10, { scale: 1, align: 'center' });
  addHit(worldRect, { kind: 'command', command: 'world' }, 'Open the procedural terrain editor');
}

function render(timeMs: number): void {
  resizeCanvas();
  hitRegions = [];
  context.fillStyle = '#111713';
  context.fillRect(0, 0, innerWidth, innerHeight);
  drawBoard(timeMs);
  drawLeftDrawer(timeMs);
  drawRightDrawer(timeMs);
  hoveredHit = [...hitRegions].reverse().find((hit) => inside(pointer, hit.rect)) ?? null;
  canvas.dataset['studioCatalogCount'] = String(entirePalette.length);
  canvas.dataset['studioFilteredCount'] = String(filteredPalette().length);
  canvas.dataset['studioPlacementCount'] = String(documentState.placements.length);
  canvas.dataset['studioObjectCount'] = String(documentState.objects.length);
  canvas.dataset['studioCollectionCount'] = String(documentState.collections.length);
  canvas.dataset['studioSelectedObject'] = selectedObjectId ?? '';
  canvas.dataset['studioSelectedAsset'] = selectedPaletteItem()?.assetName ?? '';
  canvas.dataset['studioTool'] = tool;
  canvas.dataset['studioGrid'] = showGrid ? 'on' : 'off';
  canvas.dataset['studioStatus'] = status;
  persistSession(timeMs);
  requestAnimationFrame(render);
}

function eventPoint(event: PointerEvent | WheelEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function executeHit(hit: HitRegion): void {
  switch (hit.action.kind) {
    case 'tool': tool = hit.action.tool; status = `${tool.toLocaleUpperCase()} TOOL`; return;
    case 'search': searchInput.focus(); searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length); return;
    case 'category': category = hit.action.category; paletteScroll = 0; status = `${categoryLabel(category)} FILTER`; return;
    case 'palette':
      selectedPaletteKey = hit.action.key;
      selectedPlacementId = null;
      selectedObjectId = null;
      selectedFrameId = null;
      selectedCellId = null;
      selectedPlacementIds = new Set();
      tool = 'stamp';
      status = `SELECTED ${displayAssetName(selectedPaletteItem()?.assetName ?? '').toLocaleUpperCase()}`;
      return;
    case 'command':
      if (hit.action.command === 'undo') undo();
      else if (hit.action.command === 'redo') redo();
      else if (hit.action.command === 'save') saveLocal();
      else if (hit.action.command === 'load') loadLocal();
      else if (hit.action.command === 'export') downloadLayout();
      else if (hit.action.command === 'import') importLayout();
      else if (hit.action.command === 'world') location.assign('/editor');
      else if (hit.action.command === 'group') groupSelection();
      else if (hit.action.command === 'explode') explodeSelection();
      else if (hit.action.command === 'height-down') updateSelectedCell((cell) => ({
        ...cell, elevation: Math.max(-32, cell.elevation - 1),
      }), 'CELL HEIGHT LOWERED');
      else if (hit.action.command === 'height-up') updateSelectedCell((cell) => ({
        ...cell, elevation: Math.min(32, cell.elevation + 1),
      }), 'CELL HEIGHT RAISED');
      else if (hit.action.command === 'collision-clear') updateSelectedCell((cell) => ({
        ...cell, collisionMask: TILE_OBJECT_COLLISION_MASK_EMPTY,
      }), 'CELL COLLISION CLEARED');
      else if (hit.action.command === 'collision-full') updateSelectedCell((cell) => ({
        ...cell, collisionMask: TILE_OBJECT_COLLISION_MASK_FULL,
      }), 'CELL COLLISION FILLED');
      else if (hit.action.command.startsWith('collision-')) {
        const quadrant = hit.action.command.slice('collision-'.length) as keyof typeof COLLISION_QUADRANTS;
        updateSelectedCell((cell) => ({
          ...cell, collisionMask: toggleCollisionQuadrant(cell.collisionMask, quadrant),
        }), `${quadrant.toLocaleUpperCase()} COLLISION TOGGLED`);
      }
  }
}

canvas.addEventListener('pointerdown', (event) => {
  pointer = eventPoint(event);
  const hit = [...hitRegions].reverse().find((entry) => inside(pointer, entry.rect));
  if (hit !== undefined) {
    if (event.button === 0) executeHit(hit);
    return;
  }
  if (!inside(pointer, viewport())) return;
  if (event.button === 1 || event.shiftKey || tool === 'pan') {
    panning = true;
    previousPointer = pointer;
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  const tile = screenToTile(pointer);
  if (tile === null) return;
  if ((event.ctrlKey || event.metaKey) && event.button === 0) {
    pickAt(tile.tileX, tile.tileY, true);
    return;
  }
  if (tool === 'marquee' || tool === 'frame') {
    selectionStart = tile;
    selectionEnd = tile;
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  if (tool === 'inspect') {
    pickAt(tile.tileX, tile.tileY, false);
    beginInspectMove(tile.tileX, tile.tileY);
    if (moveSource !== null) canvas.setPointerCapture(event.pointerId);
  }
  else if (event.button === 2 || tool === 'erase') {
    eraseAt(tile.tileX, tile.tileY);
    paintAction = 'erase';
  } else if (tool === 'stamp') {
    stampAt(tile.tileX, tile.tileY);
    paintAction = 'stamp';
  }
  lastPaintedTile = `${tile.tileX},${tile.tileY}`;
  if (paintAction !== null) canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  pointer = eventPoint(event);
  if (panning) {
    cameraX -= (pointer.x - previousPointer.x) / zoom;
    cameraY -= (pointer.y - previousPointer.y) / zoom;
    previousPointer = pointer;
    return;
  }
  if (selectionStart !== null) {
    const tile = screenToTile(pointer);
    if (tile !== null) selectionEnd = tile;
    return;
  }
  if (moveSource !== null) {
    const tile = screenToTile(pointer);
    if (tile !== null) previewInspectMove(tile.tileX, tile.tileY);
    return;
  }
  if (paintAction === null) return;
  const tile = screenToTile(pointer);
  if (tile === null || `${tile.tileX},${tile.tileY}` === lastPaintedTile) return;
  lastPaintedTile = `${tile.tileX},${tile.tileY}`;
  if (paintAction === 'stamp') stampAt(tile.tileX, tile.tileY);
  else eraseAt(tile.tileX, tile.tileY);
});

canvas.addEventListener('pointerup', (event) => {
  if (selectionStart !== null) {
    if (tool === 'frame') finishCollectionFrame();
    else selectMarqueeContents();
    selectionStart = null;
    selectionEnd = null;
  }
  if (moveSource !== null) finishInspectMove();
  if ((panning || paintAction !== null || canvas.hasPointerCapture(event.pointerId))) {
    canvas.releasePointerCapture(event.pointerId);
  }
  panning = false;
  paintAction = null;
  lastPaintedTile = '';
});
canvas.addEventListener('pointerleave', () => { pointer = { x: -1, y: -1 }; });
canvas.addEventListener('contextmenu', (event) => { event.preventDefault(); });

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  pointer = eventPoint(event);
  if (pointer.x < LEFT_WIDTH) {
    const rowCount = Math.ceil(filteredPalette().length / PALETTE_COLUMNS);
    const maximum = Math.max(0, rowCount * THUMBNAIL_CELL - (innerHeight - 22 - PALETTE_TOP));
    paletteScroll = Math.max(0, Math.min(maximum, paletteScroll + event.deltaY * 0.8));
    return;
  }
  if (!inside(pointer, viewport())) return;
  const view = viewport();
  const beforeX = cameraX + (pointer.x - view.x - view.width / 2) / zoom;
  const beforeY = cameraY + (pointer.y - view.y - view.height / 2) / zoom;
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * Math.exp(-event.deltaY * 0.0015)));
  cameraX = beforeX - (pointer.x - view.x - view.width / 2) / zoom;
  cameraY = beforeY - (pointer.y - view.y - view.height / 2) / zoom;
}, { passive: false });

searchInput.addEventListener('input', () => {
  search = searchInput.value;
  paletteScroll = 0;
  selectedPlacementId = null;
});
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { searchInput.blur(); canvas.focus(); }
});

window.addEventListener('keydown', (event) => {
  if (globalThis.document.activeElement === searchInput) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'f') {
    event.preventDefault(); searchInput.focus(); return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'z') { event.preventDefault(); undo(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'y') { event.preventDefault(); redo(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 's') { event.preventDefault(); downloadLayout(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'o') { event.preventDefault(); importLayout(); }
  else if (event.key === '/' || event.key.toLocaleLowerCase() === 'f') { event.preventDefault(); searchInput.focus(); }
  else if (event.key === '1') tool = 'inspect';
  else if (event.key === '2') tool = 'stamp';
  else if (event.key === '3') tool = 'erase';
  else if (event.key === '4') tool = 'pan';
  else if (event.key === '5') tool = 'marquee';
  else if (event.key === '6') tool = 'frame';
  else if (event.key.toLocaleLowerCase() === 'g') {
    showGrid = !showGrid;
    status = `GRID ${showGrid ? 'ON' : 'OFF'}`;
  }
  else if (event.key.toLocaleLowerCase() === 'k') saveLocal();
  else if (event.key.toLocaleLowerCase() === 'l') loadLocal();
  else if (event.key === 'Enter' && selectedPlacementIds.size > 0 && selectedObjectId === null) groupSelection();
  else if (event.key.toLocaleLowerCase() === 'x' && selectedObjectId !== null) explodeSelection();
  else if (event.key === 'Escape') {
    selectionStart = null;
    selectionEnd = null;
    selectedPlacementId = null;
    selectedObjectId = null;
    selectedFrameId = null;
    selectedCellId = null;
    selectedPlacementIds = new Set();
    status = 'SELECTION CLEARED';
  }
  else if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectedPlacementId !== null) {
      let next = documentState;
      const ids = selectedObjectId === null
        ? (selectedPlacementIds.size > 0 ? [...selectedPlacementIds] : [selectedPlacementId])
        : documentState.objects.find((entry) => entry.id === selectedObjectId)?.placementIds ?? [selectedPlacementId];
      for (const id of ids) next = removeTileObjectPlacement(next, id);
      commit(next, ids.length === 1 ? 'PLACEMENT REMOVED' : `${ids.length} PIECES REMOVED`);
      selectedPlacementId = null;
      selectedObjectId = null;
      selectedCellId = null;
      selectedPlacementIds = new Set();
    }
  } else if (event.key === 'Home') {
    cameraX = documentState.width * TILE_SIZE / 2;
    cameraY = documentState.height * TILE_SIZE / 2;
    zoom = 2;
  }
});

window.addEventListener('pagehide', () => { saveLocal('LAYOUT AUTOSAVED'); persistSession(Number.POSITIVE_INFINITY); });
canvas.setAttribute('aria-label', 'Orchard and Cellar offline layout and tile palette studio');
canvas.tabIndex = 0;
canvas.focus();
dismissLoadingScreen();
requestAnimationFrame(render);
