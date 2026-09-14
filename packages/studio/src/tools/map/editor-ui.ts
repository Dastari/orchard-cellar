import {
  MAP_BIOME_IDS,
  TERRAIN_CLIFF_FAMILY_IDS,
  TERRAIN_CLIFF_FAMILIES,
  TERRAIN_SURFACE_FAMILY_IDS,
  type CliffFamilyId,
  type MapBiomeId,
  type MapContentLayerId,
  type MapObjectLayer,
  type TerrainSurfaceFamilyId,
  type SemanticTerrainTrace,
  type TerrainOverride,
} from "@orchard/sim";
import type { OverworldArt } from '@orchard/engine/overworld-art';
import type { LoadedAsset } from '@orchard/ui';
import type { AtlasFrame } from '@orchard/ui';
import type { GroundChunkCache } from '@orchard/engine/ground-cache';
import { drawPixelText, measurePixelText } from '@orchard/ui';
import {
  drawTerrainInspectionVisuals,
  terrainInspectionThumbnailRects,
  terrainInspectionVisualLayout,
  type TerrainInspection,
} from '@orchard/engine/terrain-inspector';
import type { TerrainArray } from '@orchard/engine/terrain';
import { Ribbon } from '@orchard/ui';
import { drawIconButton } from '@orchard/ui';
import { drawScrollBarChrome } from '@orchard/ui';
import {
  drawThinHudPanel,
  drawUiIconAsset,
  drawUiSkinAsset,
} from '@orchard/ui';
import { editorUiSymbol, type EditorIconId } from '@orchard/ui';

export const EDITOR_TOOLS = [
  "inspect",
  "grass",
  "dirt",
  "sand",
  "stone",
  "cave_floor",
  "water",
  "path",
  "raise",
  "lower",
  "set_elevation",
  "flatten",
  "transition",
  "ledge",
  "erase_ledge",
  "override",
  "block",
] as const;
export type EditorTool = (typeof EDITOR_TOOLS)[number];

export const EDITOR_WORKSPACE_MODES = ['terrain', 'objects', 'biomes', 'scatter'] as const;
export type EditorWorkspaceMode = typeof EDITOR_WORKSPACE_MODES[number];

export function editorToolForShortcut(key: string, altKey = false): EditorTool | null {
  if (!altKey && /^[1-9]$/u.test(key)) return EDITOR_TOOLS[Number(key) - 1] ?? null;
  if (altKey && /^[0-7]$/u.test(key)) return EDITOR_TOOLS[9 + Number(key)] ?? null;
  return null;
}
export type EditorResizeEdge = "west" | "east" | "north" | "south";
export type EditorEdgeMode = "auto" | "manual";

export type EditorUiAction =
  | { readonly kind: "tool"; readonly tool: EditorTool }
  | { readonly kind: 'workspace'; readonly workspace: EditorWorkspaceMode }
  | { readonly kind: 'toggle_content_layer'; readonly layer: MapContentLayerId }
  | { readonly kind: 'select_content_layer'; readonly layer: MapContentLayerId }
  | { readonly kind: 'focus_object_search' }
  | { readonly kind: 'select_prefab'; readonly prefabId: string }
  | { readonly kind: 'cycle_prefab_collection' }
  | {
      readonly kind:
        | 'clone_selected_object'
        | 'delete_selected_object'
        | 'toggle_selected_object_visibility'
        | 'rotate_selected_object'
        | 'flip_selected_object'
        | 'scale_selected_object';
    }
  | { readonly kind: 'cycle_biome'; readonly delta: -1 | 1 }
  | { readonly kind: 'scatter_density'; readonly delta: -500 | 500 }
  | { readonly kind: "elevation_delta"; readonly delta: -1 | 1 }
  | { readonly kind: 'stair_width'; readonly delta: -1 | 1 }
  | { readonly kind: "toggle_grid" | "toggle_height" | "toggle_collision" }
  | { readonly kind: "toggle_terrain_family" }
  | { readonly kind: 'cycle_surface_family' }
  | {
      readonly kind: "terrain_family";
      readonly family: CliffFamilyId;
    }
  | { readonly kind: "toggle_edge_mode" }
  | {
      readonly kind:
        | "undo"
        | "redo"
        | "save"
        | "load"
        | "export"
        | "import"
        | "randomize_seed"
        | 'connect_live'
        | 'publish_live';
    }
  | {
      readonly kind: "resize";
      readonly edge: EditorResizeEdge;
      readonly grow: boolean;
    }
  | { readonly kind: "generate_chunk" }
  | { readonly kind: 'select_inspection_layer'; readonly index: number }
  | { readonly kind: 'toggle_inspection_layer'; readonly index: number }
  | { readonly kind: 'apply_terrain_override'; readonly override: TerrainOverride }
  | null;

export function editorInspectionLayerShortcut(
  key: string,
  shiftKey: boolean,
  selectedIndex: number | null,
  layerCount: number,
): EditorUiAction {
  if (!Number.isSafeInteger(layerCount) || layerCount <= 0) return null;
  if (shiftKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    const step = key === 'ArrowLeft' ? -1 : 1;
    const current = selectedIndex ?? (step < 0 ? 0 : -1);
    return {
      kind: 'select_inspection_layer',
      index: (current + step + layerCount) % layerCount,
    };
  }
  if (key.toLowerCase() === 'v'
    && selectedIndex !== null
    && selectedIndex >= 0
    && selectedIndex < layerCount) {
    return { kind: 'toggle_inspection_layer', index: selectedIndex };
  }
  return null;
}

export interface ProceduralEditorUiModel {
  readonly seedLabel: string;
  readonly generatorVersion: number;
  readonly generatedChunkCount: number;
  readonly selectedChunkX: number | null;
  readonly selectedChunkY: number | null;
  readonly selectedChunkGenerated: boolean;
  readonly selectedWorldTileX: number | null;
  readonly selectedWorldTileY: number | null;
}

export interface EditorContentLayerUiModel {
  readonly id: MapContentLayerId;
  readonly label: string;
  readonly visible: boolean;
  readonly editable: boolean;
  readonly active?: boolean;
}

export interface EditorPrefabUiModel {
  readonly id: string;
  readonly title: string;
  readonly collection: string;
  readonly tags: readonly string[];
  readonly previewAsset?: LoadedAsset | null;
  readonly previewFrame?: AtlasFrame | null;
}

export interface EditorSelectionUiModel {
  readonly kind: 'authored_object' | 'authored_landmark' | 'generated_object' | 'live_player_object';
  readonly id: string;
  readonly name: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly layer: string;
  readonly prefabId: string | null;
  readonly prefabRevision: number | null;
  readonly rotationDegrees: number;
  readonly flipX: boolean;
  readonly scale: 1 | 2;
  readonly enabled: boolean;
  readonly cloneable: boolean;
  readonly deletable: boolean;
  readonly hideable: boolean;
  readonly transformable: boolean;
  readonly movable?: boolean;
  readonly previewAsset: LoadedAsset | null;
  readonly previewFrame: AtlasFrame | null;
  readonly metadata: readonly { readonly label: string; readonly value: string }[];
}

export interface EditorUiModel {
  readonly title: string;
  readonly hash: string;
  readonly revision: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly tool: EditorTool;
  readonly workspaceMode: EditorWorkspaceMode;
  readonly contentLayers: readonly EditorContentLayerUiModel[];
  readonly activeObjectLayer: MapObjectLayer;
  readonly prefabs: readonly EditorPrefabUiModel[];
  readonly selectedPrefabId: string | null;
  readonly prefabCollection: string;
  readonly objectSearch: string;
  readonly objectSearchFocused: boolean;
  readonly activeBiome: MapBiomeId;
  readonly scatterDensity: number;
  readonly selectedObjectId: string | null;
  readonly selection: EditorSelectionUiModel | null;
  readonly live: {
    readonly supported: boolean;
    readonly connected: boolean;
    readonly synchronizing: boolean;
    readonly worldSynchronized: boolean;
    readonly homesteadCount: number;
    readonly publishing: boolean;
    readonly canPublish: boolean;
    readonly remoteRevision: number | null;
    readonly dirty: boolean;
    readonly error: string | null;
  };
  readonly terrainFamily: CliffFamilyId;
  readonly surfaceFamily: TerrainSurfaceFamilyId;
  readonly terrainFamilyOpen: boolean;
  readonly edgeMode: EditorEdgeMode;
  readonly activeElevation: number;
  readonly elevationDelta: number;
  readonly stairWidth: 2 | 3 | 4;
  readonly gridVisible: boolean;
  readonly heightVisible: boolean;
  readonly collisionVisible: boolean;
  readonly worldZoom: number;
  readonly pastCount: number;
  readonly futureCount: number;
  readonly validationErrors: number;
  readonly status: string;
  readonly inspection: TerrainInspection | null;
  readonly inspectionLayerVisibility: readonly boolean[];
  readonly selectedInspectionLayer: number | null;
  readonly trace: SemanticTerrainTrace | null;
  readonly procedural: ProceduralEditorUiModel | null;
  readonly hoveredAction: Exclude<EditorUiAction, null> | null;
  readonly leftScrollOffset: number;
  readonly rightScrollOffset: number;
  readonly overridePalette: readonly TerrainOverride[];
}

export const EDITOR_UI_SCALE = 2;
const LEFT_WIDTH = 204;
const RIGHT_WIDTH = 272;
const BUTTON_HEIGHT = 27;
const DRAWER_INSET = 8;
const DRAWER_BOTTOM_SAFE = 16;
const DRAWER_SCROLLBAR_GUTTER = 25;
const DRAWER_SCROLLBAR_RIGHT = 24;
const DRAWER_SCROLLBAR_WIDTH = 14;
const LEFT_CONTENT_X = 16;
const RIGHT_CONTENT_X = 20;
const RIGHT_CONTENT_WIDTH =
  RIGHT_WIDTH - RIGHT_CONTENT_X - DRAWER_SCROLLBAR_GUTTER;
const LEFT_SCROLL_TOP = 66;
const RIGHT_SCROLL_TOP = 32;
const RESIZE_BUTTON_WIDTH = 29;
const RESIZE_BUTTON_STEP = 31;
const GENERATE_CHUNK_Y = 92;
const GENERATE_CHUNK_HEIGHT = BUTTON_HEIGHT - 3;
const RIGHT_CONTENT_BOTTOM = 900;
const OVERRIDE_PALETTE_Y = 570;
const OVERRIDE_PALETTE_COLUMNS = 2;
const OVERRIDE_PALETTE_ROW_HEIGHT = 22;
const MAP_PLATE_HEIGHT = 28;
const MAP_PLATE_PADDING = 2;
const INSPECTION_FRAME_PADDING = 10;

function rightLayerPanelTop(logicalViewportHeight: number): number {
  return Math.max(1, Math.min(
    logicalViewportHeight - 1,
    Math.max(150, Math.floor(logicalViewportHeight / 2)),
  ));
}

function rightLayerListY(logicalViewportHeight: number): number {
  return rightLayerPanelTop(logicalViewportHeight) + 38;
}

export interface EditorWorldViewportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Screen-space area which is actually available to the map. Camera fitting
 * must exclude the opaque drawers and the floating header/status plates or a
 * framed map appears pinned beneath the UI instead of centred on the canvas. */
export function editorWorldViewportRect(
  viewportWidth: number,
  viewportHeight: number,
): EditorWorldViewportRect {
  const horizontalInset = (LEFT_WIDTH + RIGHT_WIDTH) * EDITOR_UI_SCALE;
  const plateInset = (MAP_PLATE_HEIGHT + 6) * EDITOR_UI_SCALE;
  return {
    x: LEFT_WIDTH * EDITOR_UI_SCALE,
    y: plateInset,
    width: Math.max(1, viewportWidth - horizontalInset),
    height: Math.max(1, viewportHeight - plateInset * 2),
  };
}

const COMMAND_GRID_Y = 40;
const COMMAND_BUTTON_SIZE = 16;
const COMMAND_BUTTON_STEP_X = 18;
const COMMAND_GRID_COLUMNS = 9;
const WORKSPACE_GRID_Y = 70;
const WORKSPACE_BUTTON_SIZE = 29;
const WORKSPACE_BUTTON_STEP = 32;
const TOOL_GRID_Y = 108;
const CONTENT_LAYER_ROW_HEIGHT = 19;
const OBJECT_CONTROL_Y = 130;
const OBJECT_SEARCH_Y = 116;
const SCATTER_DENSITY_Y = 112;
const SCATTER_SEARCH_Y = 161;
const PREFAB_SEARCH_HEIGHT = 24;
const PREFAB_TILE_SIZE = 46;
const PREFAB_TILE_STEP = 49;
const PREFAB_TILE_COLUMNS = 3;
const LEFT_PREFAB_FILTER_Y = 145;
const LEFT_SCATTER_PREFAB_FILTER_Y = 190;
const LEFT_PREFAB_LIST_GAP = 31;
const INSPECTOR_PREVIEW_SIZE = 72;
const INSPECTOR_ACTION_Y = 224;
const INSPECTOR_ACTION_SIZE = 30;
const INSPECTOR_ACTION_STEP = 34;
const TOOL_GRID_COLUMNS = 4;
const TOOL_GRID_ROWS = Math.ceil(EDITOR_TOOLS.length / TOOL_GRID_COLUMNS);
const TOOL_BUTTON_SIZE = 29;
const TOOL_BUTTON_STEP = 32;
const DISPLAY_BUTTON_SIZE = 20;
const DISPLAY_BUTTON_STEP = 24;
const DISPLAY_GRID_Y = TOOL_GRID_Y + TOOL_GRID_ROWS * TOOL_BUTTON_STEP;
const TOOL_NAME_Y = DISPLAY_GRID_Y + 28;
const ELEVATION_DELTA_Y = TOOL_NAME_Y + 11;
const ELEVATION_DELTA_BUTTON_X = 96;
const ELEVATION_DELTA_BUTTON_Y = ELEVATION_DELTA_Y - 5;
const ELEVATION_DELTA_BUTTON_SIZE = 22;
const FAMILY_LABEL_Y = TOOL_NAME_Y + 40;
const FAMILY_BUTTON_Y = FAMILY_LABEL_Y + 11;
const FAMILY_BUTTON_HEIGHT = 43;
const FAMILY_LIST_Y = FAMILY_BUTTON_Y + FAMILY_BUTTON_HEIGHT + 2;
const FAMILY_ROW_HEIGHT = 44;
const RESIZE_GAP = 14;

function inspectionVisualOrigin(
  logicalViewportWidth: number,
  inspection: TerrainInspection,
  procedural: boolean,
): { readonly x: number; readonly y: number } {
  const visual = terrainInspectionVisualLayout(inspection);
  return {
    x: logicalViewportWidth - RIGHT_WIDTH + RIGHT_CONTENT_X
      + Math.floor((RIGHT_CONTENT_WIDTH - visual.width) / 2),
    y: (procedural ? 96 : 40) + 38,
  };
}

function pointInside(
  x: number,
  y: number,
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): boolean {
  return x >= rect.x && x < rect.x + rect.width
    && y >= rect.y && y < rect.y + rect.height;
}

const COMMAND_ACTIONS = [
  "undo",
  "redo",
  "save",
  "load",
  "export",
  "import",
  "randomize_seed",
  'connect_live',
  'publish_live',
] as const;
type CommandAction = (typeof COMMAND_ACTIONS)[number];

const DISPLAY_ACTIONS = [
  "toggle_grid",
  "toggle_height",
  "toggle_collision",
  "toggle_edge_mode",
] as const;
type DisplayAction = (typeof DISPLAY_ACTIONS)[number];

export const EDITOR_TERRAIN_FAMILIES: readonly CliffFamilyId[] =
  TERRAIN_CLIFF_FAMILY_IDS.filter((family) => TERRAIN_CLIFF_FAMILIES[family].available);
export const EDITOR_SURFACE_FAMILIES: readonly TerrainSurfaceFamilyId[] =
  TERRAIN_SURFACE_FAMILY_IDS;

function familyColors(family: CliffFamilyId): readonly [string, string, string] {
  if (family.startsWith('desert')) return ['#d8b15d', '#b8794d', '#7b5843'];
  if (family === 'shroomlands') return ['#635d70', '#9b42d0', '#d19d71'];
  if (family.startsWith('volcanic')) return ['#51464c', '#b64d31', '#302b34'];
  if (family.startsWith('dungeon')) return ['#293250', '#495982', '#151a32'];
  if (family === 'cave') return ['#6c3d3c', '#aa7058', '#3c272d'];
  return ['#58a45f', '#66758c', '#35485d'];
}

function familyDetail(family: CliffFamilyId): string {
  if (family.startsWith('desert')) return 'SAND / CLIFF / WATERFALL';
  if (family.endsWith('interior') || family.startsWith('dungeon') || family === 'cave') {
    return 'INTERIOR WALL / LADDER';
  }
  return 'CLIFF / FACE / TRANSITIONS';
}

function familyListHeight(open: boolean): number {
  return open ? EDITOR_TERRAIN_FAMILIES.length * FAMILY_ROW_HEIGHT : 0;
}

function familyPaletteBottom(open: boolean): number {
  return open
    ? FAMILY_LIST_Y + familyListHeight(true)
    : FAMILY_BUTTON_Y + FAMILY_BUTTON_HEIGHT;
}

function resizeY(open: boolean): number {
  return surfaceButtonY(open) + BUTTON_HEIGHT + RESIZE_GAP;
}

function surfaceLabelY(open: boolean): number {
  return familyPaletteBottom(open) + RESIZE_GAP;
}

function surfaceButtonY(open: boolean): number {
  return surfaceLabelY(open) + 11;
}

function resizeButtonY(open: boolean): number {
  return resizeY(open) + 17;
}

function leftPrefabFilterY(workspace: EditorWorkspaceMode): number {
  return workspace === 'scatter' ? LEFT_SCATTER_PREFAB_FILTER_Y : LEFT_PREFAB_FILTER_Y;
}

function leftPrefabSearchY(workspace: EditorWorkspaceMode): number {
  return workspace === 'scatter' ? SCATTER_SEARCH_Y : OBJECT_SEARCH_Y;
}

export function editorPrefabMatchesSearch(
  prefab: EditorPrefabUiModel,
  search: string,
): boolean {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return true;
  const searchable = [prefab.id, prefab.title, prefab.collection, ...prefab.tags]
    .join(' ')
    .toLocaleLowerCase();
  return terms.every((term) => searchable.includes(term));
}

export function editorVisiblePrefabs(
  prefabs: readonly EditorPrefabUiModel[],
  collection: string,
  search = '',
): readonly EditorPrefabUiModel[] {
  return prefabs.filter((prefab) => (
    (collection === 'all' || prefab.collection === collection)
    && editorPrefabMatchesSearch(prefab, search)
  ));
}

/** Placement state must never outlive the palette item that communicates it.
 * A filtered-out prefab is indistinguishable from cursor mode to the user, so
 * allowing it to remain active would turn an apparently empty click into an
 * invisible placement action. */
export function editorVisiblePrefabSelection(
  prefabs: readonly EditorPrefabUiModel[],
  collection: string,
  search: string,
  selectedPrefabId: string | null,
): string | null {
  if (selectedPrefabId === null) return null;
  return editorVisiblePrefabs(prefabs, collection, search)
    .some((prefab) => prefab.id === selectedPrefabId)
    ? selectedPrefabId
    : null;
}

function leftPrefabListY(workspace: EditorWorkspaceMode): number {
  return leftPrefabFilterY(workspace) + LEFT_PREFAB_LIST_GAP;
}

function leftContentBottom(
  open: boolean,
  procedural: boolean,
  workspace: EditorWorkspaceMode = 'terrain',
  prefabCount = 0,
): number {
  if (workspace === 'objects' || workspace === 'scatter') {
    const rows = Math.ceil(prefabCount / PREFAB_TILE_COLUMNS);
    return Math.max(leftPrefabListY(workspace) + rows * PREFAB_TILE_STEP + 30, 430);
  }
  if (workspace === 'biomes') return OBJECT_CONTROL_Y + 85;
  return procedural ? familyPaletteBottom(open) : resizeButtonY(open) + 68;
}

const RESIZE_ACTIONS = [
  { kind: "resize", edge: "west", grow: false },
  { kind: "resize", edge: "west", grow: true },
  { kind: "resize", edge: "east", grow: false },
  { kind: "resize", edge: "east", grow: true },
  { kind: "resize", edge: "north", grow: false },
  { kind: "resize", edge: "north", grow: true },
  { kind: "resize", edge: "south", grow: false },
  { kind: "resize", edge: "south", grow: true },
] as const satisfies readonly Exclude<EditorUiAction, null>[];

function panel(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  drawUiSkinAsset(context, art.uiSkin.panelWood, { x, y, width, height });
  const inset = height <= 32 ? 4 : 7;
  drawUiSkinAsset(context, art.uiSkin.panelParchment, {
    x: x + inset,
    y: y + inset,
    width: Math.max(1, width - inset * 2),
    height: Math.max(1, height - inset * 2),
  });
}

function text(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  value: string,
  x: number,
  y: number,
  color = "#553521",
  size = 12,
): void {
  drawPixelText(context, art.ui, value, x, y, {
    color,
    font: size >= 12 ? "header" : "body",
  });
}

type EditorButtonVariant = "normal" | "confirm" | "deny";

function button(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  label: string,
  x: number,
  y: number,
  width: number,
  selected = false,
  enabled = true,
  variant: EditorButtonVariant = "normal",
): void {
  const asset =
    selected || variant === "confirm"
      ? art.uiSkin.buttonConfirm
      : variant === "deny"
        ? art.uiSkin.buttonDeny
        : art.uiSkin.button;
  const destination = { x, y, width, height: BUTTON_HEIGHT - 3 };
  drawUiSkinAsset(context, asset, destination, enabled ? "idle" : "disabled");
  drawPixelText(context, art.ui, label, x + width / 2, y + 8, {
    align: "center",
    color: enabled ? "#4d2e22" : "#715b4c",
    font: "body",
  });
}

const TOOL_ICON_IDS: Readonly<Record<EditorTool, EditorIconId>> = {
  inspect: 'editor.tool.inspect',
  grass: 'editor.tool.grass',
  dirt: 'editor.tool.dirt',
  sand: 'editor.tool.sand',
  stone: 'editor.tool.stone',
  cave_floor: 'editor.tool.cave_floor',
  water: 'editor.tool.water',
  path: 'editor.tool.path',
  raise: 'editor.tool.raise',
  lower: 'editor.tool.lower',
  set_elevation: 'editor.tool.set_elevation',
  flatten: 'editor.tool.flatten',
  transition: 'editor.tool.transition',
  ledge: 'editor.tool.ledge',
  erase_ledge: 'editor.tool.erase_ledge',
  override: 'editor.tool.override',
  block: 'editor.tool.block',
};

const WORKSPACE_LABELS: Readonly<Record<EditorWorkspaceMode, string>> = {
  terrain: 'TERRAIN',
  objects: 'OBJECTS',
  biomes: 'BIOMES',
  scatter: 'SCATTER',
};

const WORKSPACE_ICON_IDS: Readonly<Record<EditorWorkspaceMode, EditorIconId>> = {
  terrain: 'editor.workspace.terrain',
  objects: 'editor.workspace.objects',
  biomes: 'editor.workspace.biomes',
  scatter: 'editor.workspace.scatter',
};

function workspaceButton(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  workspace: EditorWorkspaceMode,
  x: number,
  y: number,
  selected: boolean,
): void {
  framedIconButton(context, art, WORKSPACE_ICON_IDS[workspace], x, y,
    WORKSPACE_BUTTON_SIZE, selected);
}

function contentLayerButton(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  layer: EditorContentLayerUiModel,
  x: number,
  y: number,
  width: number,
): void {
  drawUiSkinAsset(context, layer.active ? art.uiSkin.buttonConfirm : art.uiSkin.button, {
    x, y, width, height: 18,
  });
  ghostIconButton(context, art,
    layer.visible ? 'editor.object.show' : 'editor.object.hide', x + 2, y + 2, 14,
    false, false, true);
  ghostIconButton(context, art, 'editor.display.layers', x + 20, y + 2, 14,
    false, false, layer.editable);
  text(context, art, layer.label.toUpperCase().slice(0, 25), x + 38, y + 6,
    layer.active ? '#f7eccd' : layer.editable ? '#553521' : '#79543a', 7);
}

function toolButton(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  tool: EditorTool,
  x: number,
  y: number,
  selected: boolean,
): void {
  framedIconButton(context, art, TOOL_ICON_IDS[tool], x, y, TOOL_BUTTON_SIZE, selected);
}

function ghostIconButton(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  icon: EditorIconId,
  x: number,
  y: number,
  size: number,
  hovered = false,
  selected = false,
  enabled = true,
): void {
  context.save();
  if (selected || hovered) {
    context.fillStyle = selected ? "#5aa354b8" : "#d79a6880";
    context.beginPath();
    context.roundRect(x, y, size, size, 3);
    context.fill();
  }
  const inset = Math.max(2, Math.floor(size * 0.18));
  const iconAsset = art.uiSkin.icons?.[editorUiSymbol(icon)];
  if (iconAsset !== undefined) {
    drawUiIconAsset(
      context,
      iconAsset,
      {
        x: x + inset,
        y: y + inset,
        width: size - inset * 2,
        height: size - inset * 2,
      },
      enabled ? 1 : 0.35,
    );
  }
  context.restore();
}

function framedIconButton(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  icon: EditorIconId,
  x: number,
  y: number,
  size: number,
  selected = false,
  enabled = true,
  deny = false,
): void {
  drawUiSkinAsset(context,
    deny ? art.uiSkin.buttonDeny : selected ? art.uiSkin.buttonConfirm : art.uiSkin.slot,
    { x, y, width: size, height: size }, enabled ? 'idle' : 'disabled');
  ghostIconButton(context, art, icon, x + 3, y + 3, size - 6, false, false, enabled);
  if (selected) drawUiSkinAsset(context, art.uiSkin.selectorConfirm, {
    x: x - 2, y: y - 2, width: size + 4, height: size + 4,
  });
}

function prefabTile(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  prefab: EditorPrefabUiModel,
  x: number,
  y: number,
  selected: boolean,
): void {
  drawUiSkinAsset(context, selected ? art.uiSkin.buttonConfirm : art.uiSkin.slot, {
    x, y, width: PREFAB_TILE_SIZE, height: PREFAB_TILE_SIZE,
  });
  const asset = prefab.previewAsset ?? null;
  const frame = prefab.previewFrame ?? null;
  if (asset !== null && frame !== null) {
    const maximum = PREFAB_TILE_SIZE - 12;
    const scale = Math.min(maximum / frame.width, maximum / frame.height, 3);
    const width = Math.max(1, Math.floor(frame.width * scale));
    const height = Math.max(1, Math.floor(frame.height * scale));
    context.save();
    context.imageSmoothingEnabled = false;
    context.drawImage(
      asset.image,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      x + Math.floor((PREFAB_TILE_SIZE - width) / 2),
      y + Math.floor((PREFAB_TILE_SIZE - height) / 2),
      width,
      height,
    );
    context.restore();
  } else {
    ghostIconButton(context, art, 'editor.object.prefab', x + 6, y + 6,
      PREFAB_TILE_SIZE - 12, false, false, true);
  }
  if (selected) drawUiSkinAsset(context, art.uiSkin.selectorConfirm, {
    x: x - 2, y: y - 2, width: PREFAB_TILE_SIZE + 4, height: PREFAB_TILE_SIZE + 4,
  });
}

function drawPrefabSearch(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  value: string,
  focused: boolean,
  y: number,
): void {
  const width = LEFT_WIDTH - LEFT_CONTENT_X - DRAWER_SCROLLBAR_GUTTER;
  const rect = { x: LEFT_CONTENT_X, y, width, height: PREFAB_SEARCH_HEIGHT };
  drawUiSkinAsset(context, art.uiSkin.frameThin, rect);
  context.fillStyle = focused ? '#ffe1af' : '#f2c994';
  context.fillRect(rect.x + 5, rect.y + 5, rect.width - 10, rect.height - 10);
  const label = value.length === 0 ? 'SEARCH OBJECTS...' : value.toUpperCase();
  drawPixelText(
    context,
    art.ui,
    fittedPixelText(label, rect.width - 17, art.ui.font),
    rect.x + 8,
    rect.y + 8,
    { color: value.length === 0 ? '#8b6a55' : '#513322', font: 'body' },
  );
  if (focused && Math.floor(performance.now() / 500) % 2 === 0) {
    const caretX = rect.x + 8 + measurePixelText(value.toUpperCase(), 1, art.ui.font);
    context.fillStyle = '#513322';
    context.fillRect(Math.min(rect.x + rect.width - 8, caretX), rect.y + 7, 1, 10);
  }
}

const COMMAND_ICONS: Readonly<Record<CommandAction, EditorIconId>> = {
  undo: 'editor.command.undo',
  redo: 'editor.command.redo',
  save: 'editor.command.save',
  load: 'editor.command.load',
  export: 'editor.command.export',
  import: 'editor.command.import',
  randomize_seed: 'editor.command.randomize',
  connect_live: 'editor.command.connect_live',
  publish_live: 'editor.command.publish_live',
};

function commandButton(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  action: CommandAction,
  x: number,
  y: number,
  enabled: boolean,
  hovered: boolean,
  selected = false,
): void {
  ghostIconButton(
    context,
    art,
    COMMAND_ICONS[action],
    x,
    y,
    COMMAND_BUTTON_SIZE,
    hovered,
    selected,
    enabled,
  );
}

const DISPLAY_ICONS: Readonly<Record<DisplayAction, EditorIconId>> = {
  toggle_grid: 'editor.display.grid',
  toggle_height: 'editor.display.height',
  toggle_collision: 'editor.display.collision',
  toggle_edge_mode: 'editor.display.auto_edges',
};

const INSPECTOR_OBJECT_ACTIONS = [
  'clone_selected_object',
  'delete_selected_object',
  'toggle_selected_object_visibility',
  'rotate_selected_object',
  'flip_selected_object',
  'scale_selected_object',
] as const;
type InspectorObjectAction = typeof INSPECTOR_OBJECT_ACTIONS[number];

function inspectorObjectActionIcon(
  action: InspectorObjectAction,
  selection: EditorSelectionUiModel,
): EditorIconId {
  if (action === 'clone_selected_object') return 'editor.object.clone';
  if (action === 'delete_selected_object') return 'editor.object.delete';
  if (action === 'toggle_selected_object_visibility') {
    return selection.enabled ? 'editor.object.hide' : 'editor.object.show';
  }
  if (action === 'rotate_selected_object') return 'editor.object.rotate';
  if (action === 'flip_selected_object') return 'editor.object.flip';
  return 'editor.object.scale';
}

function inspectorObjectActionEnabled(
  action: InspectorObjectAction,
  selection: EditorSelectionUiModel,
): boolean {
  if (action === 'clone_selected_object') return selection.cloneable;
  if (action === 'delete_selected_object') return selection.deletable;
  if (action === 'toggle_selected_object_visibility') return selection.hideable;
  return selection.transformable;
}

function displayButton(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  action: DisplayAction,
  x: number,
  y: number,
  selected: boolean,
  hovered: boolean,
): void {
  ghostIconButton(
    context,
    art,
    DISPLAY_ICONS[action],
    x,
    y,
    DISPLAY_BUTTON_SIZE,
    hovered,
    selected,
  );
}

function familySwatches(
  context: CanvasRenderingContext2D,
  family: CliffFamilyId,
  x: number,
  y: number,
  size = 12,
): void {
  for (const [index, color] of familyColors(family).entries()) {
    context.fillStyle = color;
    context.fillRect(x + index * (size + 1), y, size, size);
    context.strokeStyle = "#553521aa";
    context.strokeRect(
      x + index * (size + 1) + 0.5,
      y + 0.5,
      size - 1,
      size - 1,
    );
  }
}

function familyButton(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  family: CliffFamilyId,
  x: number,
  y: number,
  width: number,
  selected = false,
): void {
  drawUiSkinAsset(
    context,
    selected ? art.uiSkin.buttonConfirm : art.uiSkin.button,
    {
      x,
      y,
      width,
      height: FAMILY_BUTTON_HEIGHT,
    },
  );
  familySwatches(context, family, x + 7, y + 6, 10);
  drawPixelText(context, art.ui, family.replaceAll('_', ' ').toUpperCase(), x + 47, y + 7, {
    color: selected ? "#f7eccd" : "#4d2e22",
    font: "body",
  });
  drawPixelText(context, art.ui, familyDetail(family), x + 7, y + 25, {
    color: selected ? "#f7eccd" : "#79543a",
    font: "body",
  });
}

const ribbons = new WeakMap<OverworldArt, Ribbon>();

function ribbon(art: OverworldArt): Ribbon {
  const existing = ribbons.get(art);
  if (existing !== undefined) return existing;
  const created = new Ribbon(art.uiSkin.banner, art.ui);
  ribbons.set(art, created);
  return created;
}

export type EditorUiDrawer = "left" | "right";

export function editorUiDrawerAt(
  screenX: number,
  viewportWidth: number,
): EditorUiDrawer | null {
  if (screenX < LEFT_WIDTH * EDITOR_UI_SCALE) return "left";
  if (screenX >= viewportWidth - RIGHT_WIDTH * EDITOR_UI_SCALE) return "right";
  return null;
}

export function editorUiScrollLimit(
  drawer: EditorUiDrawer,
  viewportHeight: number,
  procedural = false,
  terrainFamilyOpen = false,
  workspaceMode: EditorWorkspaceMode = 'terrain',
  prefabCount = 0,
  selectionMetadataCount: number | null = null,
  inspectorContentAvailable = true,
): number {
  const logicalHeight = viewportHeight / EDITOR_UI_SCALE;
  const contentBottom =
    drawer === "left"
      ? leftContentBottom(terrainFamilyOpen, procedural, workspaceMode, prefabCount)
      : selectionMetadataCount === null
        ? inspectorContentAvailable ? RIGHT_CONTENT_BOTTOM : 170
        : Math.max(340, INSPECTOR_ACTION_Y + INSPECTOR_ACTION_SIZE
          + selectionMetadataCount * 12 + 65);
  const visibleBottom = drawer === 'right' ? rightLayerPanelTop(logicalHeight) : logicalHeight;
  return Math.max(0, contentBottom - visibleBottom + DRAWER_BOTTOM_SAFE);
}

export interface EditorUiScrollbarConfig {
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly totalRows: number;
  readonly visibleRows: number;
}

export function editorUiScrollbarConfig(
  drawer: EditorUiDrawer,
  viewportWidth: number,
  viewportHeight: number,
  procedural = false,
  terrainFamilyOpen = false,
  workspaceMode: EditorWorkspaceMode = 'terrain',
  prefabCount = 0,
  selectionMetadataCount: number | null = null,
  inspectorContentAvailable = true,
): EditorUiScrollbarConfig {
  const logicalWidth = viewportWidth / EDITOR_UI_SCALE;
  const logicalHeight = viewportHeight / EDITOR_UI_SCALE;
  const top = drawer === 'left' ? LEFT_SCROLL_TOP : RIGHT_SCROLL_TOP;
  const paneBottom = drawer === 'left' ? logicalHeight : rightLayerPanelTop(logicalHeight);
  const contentBottom = drawer === 'left'
    ? leftContentBottom(terrainFamilyOpen, procedural, workspaceMode, prefabCount)
    : selectionMetadataCount === null
      ? inspectorContentAvailable ? RIGHT_CONTENT_BOTTOM : 170
      : Math.max(340, INSPECTOR_ACTION_Y + INSPECTOR_ACTION_SIZE
        + selectionMetadataCount * 12 + 65);
  const visibleRows = Math.max(1, paneBottom - top - DRAWER_BOTTOM_SAFE);
  return {
    bounds: {
      x: drawer === 'left'
        ? LEFT_WIDTH - DRAWER_SCROLLBAR_RIGHT
        : logicalWidth - DRAWER_SCROLLBAR_RIGHT,
      y: top + 3,
      width: DRAWER_SCROLLBAR_WIDTH,
      height: Math.max(1, visibleRows - 6),
    },
    totalRows: Math.max(visibleRows, contentBottom - top),
    visibleRows,
  };
}

function drawScrollbar(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  top: number,
  height: number,
  contentBottom: number,
  offset: number,
): void {
  const visibleHeight = height - top - DRAWER_BOTTOM_SAFE;
  const contentHeight = contentBottom - top;
  if (visibleHeight >= contentHeight || visibleHeight <= 0) return;
  drawScrollBarChrome(
    context,
    art.uiSkin,
    { x, y: top + 3, width: DRAWER_SCROLLBAR_WIDTH, height: visibleHeight - 6 },
    contentHeight,
    visibleHeight,
    offset,
  );
}

const TOOL_LABELS: Readonly<Record<EditorTool, string>> = {
  inspect: "INSPECT / PAN",
  grass: "GRASS BRUSH",
  dirt: "GROUND / PATH BASE",
  sand: "SAND BRUSH",
  stone: "STONE BRUSH",
  cave_floor: "INTERIOR / EXCAVATION",
  water: "WATER / RIVER",
  path: "PATH OVERLAY",
  raise: "RAISE CONTOUR",
  lower: "LOWER CONTOUR",
  set_elevation: "SET TO ACTIVE LEVEL",
  flatten: "FLATTEN TO START HEIGHT",
  transition: "RAMP / STAIR / LADDER",
  ledge: "PAINT LEDGE POLYGON",
  erase_ledge: "ERASE LEDGE / OPEN GAP",
  override: "REPLACE AUTOTILE PIECE",
  block: "COLLISION OVERRIDE",
};

export function editorUiActionAt(
  screenX: number,
  screenY: number,
  viewportWidth: number,
  proceduralGenerateAvailable = false,
  leftScrollOffset = 0,
  rightScrollOffset = 0,
  finiteMapResizeAvailable = true,
  terrainFamilyOpen = false,
  overridePalette: readonly TerrainOverride[] = [],
  inspection: TerrainInspection | null = null,
  proceduralInspection = false,
  activeTool: EditorTool = 'inspect',
  activeWorkspace: EditorWorkspaceMode = 'terrain',
  contentLayers: readonly EditorContentLayerUiModel[] = [],
  prefabs: readonly EditorPrefabUiModel[] = [],
  prefabCollection = 'all',
  liveConnected = false,
  liveCanPublish = false,
  selection: EditorSelectionUiModel | null = null,
  includeDisabled = false,
  viewportHeight = 1_080,
  prefabSearch = '',
): EditorUiAction {
  const logicalX = screenX / EDITOR_UI_SCALE;
  const viewportY = screenY / EDITOR_UI_SCALE;
  const logicalViewportWidth = viewportWidth / EDITOR_UI_SCALE;
  if (
    logicalX >= LEFT_CONTENT_X &&
    logicalX < LEFT_WIDTH - DRAWER_SCROLLBAR_GUTTER
  ) {
    const commandColumn = Math.floor(
      (logicalX - LEFT_CONTENT_X) / COMMAND_BUTTON_STEP_X,
    );
    const insideCommand =
      commandColumn >= 0 &&
      commandColumn < COMMAND_GRID_COLUMNS &&
      logicalX - (LEFT_CONTENT_X + commandColumn * COMMAND_BUTTON_STEP_X) <
        COMMAND_BUTTON_SIZE &&
      viewportY >= COMMAND_GRID_Y &&
      viewportY < COMMAND_GRID_Y + COMMAND_BUTTON_SIZE;
    const command = insideCommand ? COMMAND_ACTIONS[commandColumn] : undefined;
    if (command !== undefined) {
      if (command === "randomize_seed" && finiteMapResizeAvailable && !includeDisabled) return null;
      if (command === 'publish_live'
        && (!liveConnected || !liveCanPublish)
        && !includeDisabled) return null;
      return { kind: command };
    }
    if (viewportY < LEFT_SCROLL_TOP) return null;
    const logicalY = viewportY + leftScrollOffset;
    const workspaceIndex = Math.floor((logicalX - LEFT_CONTENT_X) / WORKSPACE_BUTTON_STEP);
    const workspace = EDITOR_WORKSPACE_MODES[workspaceIndex];
    if (workspace !== undefined
      && logicalX - (LEFT_CONTENT_X + workspaceIndex * WORKSPACE_BUTTON_STEP) < WORKSPACE_BUTTON_SIZE
      && logicalY >= WORKSPACE_GRID_Y
      && logicalY < WORKSPACE_GRID_Y + WORKSPACE_BUTTON_SIZE) {
      return { kind: 'workspace', workspace };
    }
    if (activeWorkspace !== 'terrain') {
      if (activeWorkspace === 'objects' || activeWorkspace === 'scatter') {
        if (activeWorkspace === 'scatter'
          && logicalY >= SCATTER_DENSITY_Y + 13
          && logicalY < SCATTER_DENSITY_Y + 35) {
          return { kind: 'scatter_density', delta: logicalX < 96 ? -500 : 500 };
        }
        const searchY = leftPrefabSearchY(activeWorkspace);
        if (logicalY >= searchY && logicalY < searchY + PREFAB_SEARCH_HEIGHT) {
          return { kind: 'focus_object_search' };
        }
        const filterY = leftPrefabFilterY(activeWorkspace);
        if (logicalY >= filterY && logicalY < filterY + BUTTON_HEIGHT) {
          return { kind: 'cycle_prefab_collection' };
        }
        const visiblePrefabs = editorVisiblePrefabs(prefabs, prefabCollection, prefabSearch);
        const listY = leftPrefabListY(activeWorkspace);
        const prefabColumn = Math.floor((logicalX - LEFT_CONTENT_X) / PREFAB_TILE_STEP);
        const prefabRow = Math.floor((logicalY - listY) / PREFAB_TILE_STEP);
        const prefabIndex = prefabRow * PREFAB_TILE_COLUMNS + prefabColumn;
        const prefab = visiblePrefabs[prefabIndex];
        if (prefab !== undefined && prefabColumn >= 0 && prefabColumn < PREFAB_TILE_COLUMNS
          && prefabRow >= 0
          && logicalX - (LEFT_CONTENT_X + prefabColumn * PREFAB_TILE_STEP) < PREFAB_TILE_SIZE
          && logicalY - (listY + prefabRow * PREFAB_TILE_STEP) < PREFAB_TILE_SIZE) {
          return { kind: 'select_prefab', prefabId: prefab.id };
        }
      } else if (activeWorkspace === 'biomes'
        && logicalY >= OBJECT_CONTROL_Y
        && logicalY < OBJECT_CONTROL_Y + 24) {
        return { kind: 'cycle_biome', delta: logicalX < 96 ? -1 : 1 };
      }
      return null;
    }
    const toolColumn = Math.floor(
      (logicalX - LEFT_CONTENT_X) / TOOL_BUTTON_STEP,
    );
    const toolRow = Math.floor((logicalY - TOOL_GRID_Y) / TOOL_BUTTON_STEP);
    const insideTool =
      toolColumn >= 0 &&
      toolColumn < TOOL_GRID_COLUMNS &&
      toolRow >= 0 &&
      toolRow < TOOL_GRID_ROWS &&
      logicalX - (LEFT_CONTENT_X + toolColumn * TOOL_BUTTON_STEP) <
        TOOL_BUTTON_SIZE &&
      logicalY - (TOOL_GRID_Y + toolRow * TOOL_BUTTON_STEP) >= 0 &&
      logicalY - (TOOL_GRID_Y + toolRow * TOOL_BUTTON_STEP) < TOOL_BUTTON_SIZE;
    const tool = insideTool
      ? EDITOR_TOOLS[toolRow * TOOL_GRID_COLUMNS + toolColumn]
      : undefined;
    if (tool !== undefined) return { kind: "tool", tool };
    const displayIndex = Math.floor(
      (logicalX - LEFT_CONTENT_X) / DISPLAY_BUTTON_STEP,
    );
    const displayAction =
      displayIndex >= 0 && displayIndex < DISPLAY_ACTIONS.length
        ? DISPLAY_ACTIONS[displayIndex]
        : undefined;
    const insideDisplay =
      displayAction !== undefined &&
      logicalX - (LEFT_CONTENT_X + displayIndex * DISPLAY_BUTTON_STEP) <
        DISPLAY_BUTTON_SIZE &&
      logicalY >= DISPLAY_GRID_Y &&
      logicalY < DISPLAY_GRID_Y + DISPLAY_BUTTON_SIZE;
    if (insideDisplay && displayAction !== undefined)
      return { kind: displayAction };
    if (
      logicalY >= ELEVATION_DELTA_BUTTON_Y &&
      logicalY < ELEVATION_DELTA_BUTTON_Y + ELEVATION_DELTA_BUTTON_SIZE
    ) {
      if (
        logicalX >= ELEVATION_DELTA_BUTTON_X &&
        logicalX < ELEVATION_DELTA_BUTTON_X + ELEVATION_DELTA_BUTTON_SIZE
      ) {
        return { kind: activeTool === 'transition' ? 'stair_width' : "elevation_delta", delta: -1 };
      }
      const increaseX =
        ELEVATION_DELTA_BUTTON_X + ELEVATION_DELTA_BUTTON_SIZE + 4;
      if (
        logicalX >= increaseX &&
        logicalX < increaseX + ELEVATION_DELTA_BUTTON_SIZE
      ) {
        return { kind: activeTool === 'transition' ? 'stair_width' : "elevation_delta", delta: 1 };
      }
    }
    if (
      logicalY >= FAMILY_BUTTON_Y &&
      logicalY < FAMILY_BUTTON_Y + FAMILY_BUTTON_HEIGHT
    ) {
      return { kind: "toggle_terrain_family" };
    }
    if (
      terrainFamilyOpen &&
      logicalY >= FAMILY_LIST_Y &&
      logicalY < FAMILY_LIST_Y + familyListHeight(true)
    ) {
      const family =
        EDITOR_TERRAIN_FAMILIES[
          Math.floor((logicalY - FAMILY_LIST_Y) / FAMILY_ROW_HEIGHT)
        ];
      if (family !== undefined) return { kind: "terrain_family", family };
    }
    const currentSurfaceButtonY = surfaceButtonY(terrainFamilyOpen);
    if (logicalY >= currentSurfaceButtonY
      && logicalY < currentSurfaceButtonY + BUTTON_HEIGHT) {
      return { kind: 'cycle_surface_family' };
    }
    const currentResizeButtonY = resizeButtonY(terrainFamilyOpen);
    const resizeRow = Math.floor(
      (logicalY - currentResizeButtonY) / BUTTON_HEIGHT,
    );
    const resizeColumn = Math.floor(
      (logicalX - LEFT_CONTENT_X) / RESIZE_BUTTON_STEP,
    );
    const withinResizeButton =
      resizeRow >= 0 &&
      resizeRow < 2 &&
      resizeColumn >= 0 &&
      resizeColumn < 4 &&
      logicalX - (LEFT_CONTENT_X + resizeColumn * RESIZE_BUTTON_STEP) <
        RESIZE_BUTTON_WIDTH;
    if (finiteMapResizeAvailable && withinResizeButton) {
      return RESIZE_ACTIONS[resizeRow * 4 + resizeColumn] ?? null;
    }
  }
  if (logicalX >= logicalViewportWidth - RIGHT_WIDTH) {
    const logicalViewportHeight = viewportHeight / EDITOR_UI_SCALE;
    const layerListY = rightLayerListY(logicalViewportHeight);
    const visualLayers = [...contentLayers].reverse();
    const layerIndex = Math.floor((viewportY - layerListY) / CONTENT_LAYER_ROW_HEIGHT);
    const layer = visualLayers[layerIndex];
    const rowX = logicalViewportWidth - RIGHT_WIDTH + RIGHT_CONTENT_X;
    if (layer !== undefined && viewportY >= layerListY
      && viewportY - (layerListY + layerIndex * CONTENT_LAYER_ROW_HEIGHT) < 18
      && logicalX >= rowX && logicalX < rowX + RIGHT_CONTENT_WIDTH) {
      return logicalX < rowX + 18
        ? { kind: 'toggle_content_layer', layer: layer.id }
        : { kind: 'select_content_layer', layer: layer.id };
    }
    if (viewportY >= rightLayerPanelTop(logicalViewportHeight)) return null;
    const logicalY =
      viewportY + (viewportY >= RIGHT_SCROLL_TOP ? rightScrollOffset : 0);
    if (selection !== null) {
      const actionIndex = Math.floor(
        (logicalX - (logicalViewportWidth - RIGHT_WIDTH + RIGHT_CONTENT_X)) / INSPECTOR_ACTION_STEP,
      );
      const action = INSPECTOR_OBJECT_ACTIONS[actionIndex];
      if (action !== undefined
        && logicalY >= INSPECTOR_ACTION_Y
        && logicalY < INSPECTOR_ACTION_Y + INSPECTOR_ACTION_SIZE
        && logicalX - (logicalViewportWidth - RIGHT_WIDTH + RIGHT_CONTENT_X
          + actionIndex * INSPECTOR_ACTION_STEP) < INSPECTOR_ACTION_SIZE
        && (inspectorObjectActionEnabled(action, selection) || includeDisabled)) {
        return { kind: action };
      }
      return null;
    }
    if (inspection !== null) {
      const visualOrigin = inspectionVisualOrigin(
        logicalViewportWidth,
        inspection,
        proceduralInspection,
      );
      for (const rect of terrainInspectionThumbnailRects(
        inspection,
        visualOrigin.x,
        visualOrigin.y,
      )) {
        if (pointInside(logicalX, logicalY, rect.visibilityToggle)) {
          return { kind: 'toggle_inspection_layer', index: rect.index };
        }
        if (pointInside(logicalX, logicalY, rect)) {
          return { kind: 'select_inspection_layer', index: rect.index };
        }
      }
    }
    if (
      proceduralGenerateAvailable &&
      logicalY >= GENERATE_CHUNK_Y &&
      logicalY < GENERATE_CHUNK_Y + GENERATE_CHUNK_HEIGHT &&
      logicalX >= logicalViewportWidth - RIGHT_WIDTH + RIGHT_CONTENT_X &&
      logicalX < logicalViewportWidth - DRAWER_SCROLLBAR_GUTTER
    )
      return { kind: "generate_chunk" };
    const paletteX = logicalViewportWidth - RIGHT_WIDTH + RIGHT_CONTENT_X;
    const paletteWidth = Math.floor(RIGHT_CONTENT_WIDTH / OVERRIDE_PALETTE_COLUMNS);
    const paletteColumn = Math.floor((logicalX - paletteX) / paletteWidth);
    const paletteRow = Math.floor((logicalY - OVERRIDE_PALETTE_Y) / OVERRIDE_PALETTE_ROW_HEIGHT);
    const paletteIndex = paletteRow * OVERRIDE_PALETTE_COLUMNS + paletteColumn;
    if (paletteColumn >= 0 && paletteColumn < OVERRIDE_PALETTE_COLUMNS
      && paletteRow >= 0
      && logicalY - (OVERRIDE_PALETTE_Y + paletteRow * OVERRIDE_PALETTE_ROW_HEIGHT) < 19
      && logicalX - (paletteX + paletteColumn * paletteWidth) < paletteWidth - 3
      && overridePalette[paletteIndex] !== undefined) {
      return { kind: 'apply_terrain_override', override: overridePalette[paletteIndex]! };
    }
    return null;
  }
  return null;
}

export function editorUiTooltipForAction(
  action: Exclude<EditorUiAction, null>,
): string {
  if (action.kind === 'workspace') return `SWITCH TO ${WORKSPACE_LABELS[action.workspace]} WORKSPACE`;
  if (action.kind === 'toggle_content_layer') return `HIDE OR SHOW ${action.layer.replaceAll('_', ' ').toUpperCase()} LAYER`;
  if (action.kind === 'select_content_layer') return `MAKE ${action.layer.replaceAll('_', ' ').toUpperCase()} THE ACTIVE LAYER`;
  if (action.kind === 'focus_object_search') return 'SEARCH OBJECT NAMES, COLLECTIONS, AND TAGS (/ OR CTRL+F)';
  if (action.kind === 'select_prefab') return `SELECT PREFAB ${action.prefabId.toUpperCase()}`;
  if (action.kind === 'cycle_prefab_collection') return 'CYCLE PREFAB COLLECTION FILTER';
  if (action.kind === 'clone_selected_object') return 'CLONE THE SELECTED AUTHORED OBJECT';
  if (action.kind === 'delete_selected_object') {
    return 'DELETE SELECTED MAP OBJECT (PROCEDURAL OBJECTS USE A REVERSIBLE SUPPRESSION)';
  }
  if (action.kind === 'toggle_selected_object_visibility') return 'HIDE OR SHOW THE SELECTED OBJECT';
  if (action.kind === 'rotate_selected_object') return 'ROTATE THE SELECTED OBJECT 90 DEGREES (R)';
  if (action.kind === 'flip_selected_object') return 'FLIP THE SELECTED OBJECT HORIZONTALLY (X)';
  if (action.kind === 'scale_selected_object') return 'TOGGLE THE SELECTED OBJECT BETWEEN 1X AND 2X SCALE';
  if (action.kind === 'cycle_biome') return `${action.delta < 0 ? 'PREVIOUS' : 'NEXT'} BIOME BRUSH`;
  if (action.kind === 'scatter_density') return `${action.delta < 0 ? 'DECREASE' : 'INCREASE'} PROCEDURAL SCATTER DENSITY`;
  if (action.kind === "tool") {
    const ordinal = EDITOR_TOOLS.indexOf(action.tool) + 1;
    return `${TOOL_LABELS[action.tool]} (${ordinal < 10 ? ordinal : `ALT+${ordinal - 10}`})`;
  }
  if (action.kind === "elevation_delta")
    return `${action.delta < 0 ? "DECREASE" : "INCREASE"} RAISE/LOWER BRUSH DELTA`;
  if (action.kind === 'stair_width')
    return `${action.delta < 0 ? 'DECREASE' : 'INCREASE'} STAIR / RAMP-BANK WIDTH`;
  if (action.kind === "toggle_grid") return "TOGGLE TILE GRID (G)";
  if (action.kind === "toggle_height") return "TOGGLE HEIGHT OVERLAY (H)";
  if (action.kind === "toggle_collision") return "TOGGLE COLLISION OVERLAY (C)";
  if (action.kind === "toggle_terrain_family")
    return "CHOOSE A COMPLETE TERRAIN TILESET";
  if (action.kind === "terrain_family")
    return `${action.family.replaceAll('_', ' ').toUpperCase()} — ${familyDetail(action.family)}`;
  if (action.kind === 'cycle_surface_family') return 'CYCLE THE GRASS SURFACE FAMILY';
  if (action.kind === "toggle_edge_mode")
    return "TOGGLE AUTOMATIC TERRAIN EDGES";
  if (action.kind === "undo") return "UNDO LAST EDIT (CTRL+Z)";
  if (action.kind === "redo") return "REDO LAST EDIT (CTRL+Y)";
  if (action.kind === "save") return "SAVE LOCAL DRAFT (K)";
  if (action.kind === "load") return "LOAD LOCAL DRAFT (L)";
  if (action.kind === "export") return "EXPORT MAP JSON (CTRL+S)";
  if (action.kind === "import") return "IMPORT MAP JSON (CTRL+O)";
  if (action.kind === "randomize_seed")
    return "RANDOMIZE NUMERIC SEED AND RESET LOCAL PREVIEW";
  if (action.kind === 'connect_live')
    return 'CONNECT TO LIVE AUTHORING — OWNER/ADMIN EDITS AUTO-SYNC';
  if (action.kind === 'publish_live')
    return 'SYNC THE QUEUED REVISION NOW — CONNECTED EDITS AUTO-SYNC';
  if (action.kind === "resize") {
    return `${action.grow ? "GROW" : "CROP"} ${action.edge.toUpperCase()} MAP EDGE`;
  }
  if (action.kind === 'apply_terrain_override') {
    return `REPLACE L${action.override.contourLevel} WITH ${action.override.role ?? 'FRAME'} ${action.override.frameIndex ?? ''}`;
  }
  if (action.kind === 'select_inspection_layer')
    return `SHOW DETAILS FOR COMPOSITE LAYER ${action.index + 1}`;
  if (action.kind === 'toggle_inspection_layer')
    return `HIDE OR SHOW COMPOSITE LAYER ${action.index + 1}`;
  return "GENERATE SELECTED CHUNK LOCALLY";
}

function mapHeaderRect(logicalViewportWidth: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const available = Math.max(
    0,
    logicalViewportWidth - LEFT_WIDTH - RIGHT_WIDTH,
  );
  const width = Math.max(120, available - 24);
  return {
    x: LEFT_WIDTH + 12,
    y: 6,
    width,
    height: MAP_PLATE_HEIGHT,
  };
}

export function editorUiHeaderLabel(model: EditorUiModel): string {
  if (model.procedural === null) {
    const live = !model.live.supported
      ? ''
      : model.live.error !== null
        ? ' / LIVE ERROR'
        : !model.live.connected
          ? ' / LIVE OFFLINE'
          : model.live.synchronizing || !model.live.worldSynchronized
            ? ' / LIVE SYNCING'
            : ` / LIVE R${model.live.remoteRevision ?? 0}${model.live.dirty ? '*' : ''}`
              + ` / ${model.live.homesteadCount} HOME${model.live.homesteadCount === 1 ? '' : 'S'}`;
    return `${model.title} / ${model.mapWidth}x${model.mapHeight} / #${model.hash.slice(0, 6)} / R${model.revision}${live} / E${model.validationErrors}`;
  }
  const shortTitle = model.title.replace(/\s+Preview$/u, "");
  return `${shortTitle} / SEED ${model.procedural.seedLabel} / V${model.procedural.generatorVersion} / ${model.procedural.generatedChunkCount} CHUNKS GENERATED / R${model.revision} / E${model.validationErrors}`;
}

function fittedPixelText(
  value: string,
  maximumWidth: number,
  asset: LoadedAsset,
): string {
  if (measurePixelText(value, 1, asset) <= maximumWidth) return value;
  let fitted = value;
  while (
    fitted.length > 1 &&
    measurePixelText(`${fitted}...`, 1, asset) > maximumWidth
  ) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted}...`;
}

/** The map header is intentionally floating over the viewport rather than
 * living in either drawer. Treat it as editor chrome so clicks never paint
 * through it into the world. */
export function editorUiMapHeaderAt(
  screenX: number,
  screenY: number,
  viewportWidth: number,
): boolean {
  const logicalX = screenX / EDITOR_UI_SCALE;
  const logicalY = screenY / EDITOR_UI_SCALE;
  const rect = mapHeaderRect(viewportWidth / EDITOR_UI_SCALE);
  return (
    logicalX >= rect.x &&
    logicalX < rect.x + rect.width &&
    logicalY >= rect.y &&
    logicalY < rect.y + rect.height
  );
}

function drawObjectSelectionInspector(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  selection: EditorSelectionUiModel,
  drawerX: number,
): void {
  const x = drawerX + RIGHT_CONTENT_X;
  const previewX = x;
  const previewY = 42;
  drawUiSkinAsset(context, art.uiSkin.frameThin, {
    x: previewX,
    y: previewY,
    width: INSPECTOR_PREVIEW_SIZE,
    height: INSPECTOR_PREVIEW_SIZE,
  });
  if (selection.previewAsset !== null && selection.previewFrame !== null) {
    const frame = selection.previewFrame;
    const available = INSPECTOR_PREVIEW_SIZE - 14;
    const previewScale = Math.min(4, available / Math.max(frame.width, frame.height));
    const width = Math.max(1, Math.floor(frame.width * previewScale));
    const height = Math.max(1, Math.floor(frame.height * previewScale));
    context.save();
    context.imageSmoothingEnabled = false;
    context.drawImage(
      selection.previewAsset.image,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      previewX + Math.floor((INSPECTOR_PREVIEW_SIZE - width) / 2),
      previewY + Math.floor((INSPECTOR_PREVIEW_SIZE - height) / 2),
      width,
      height,
    );
    context.restore();
  } else {
    ghostIconButton(context, art, 'editor.object.prefab', previewX + 17, previewY + 17, 38,
      false, false, false);
  }
  const detailX = previewX + INSPECTOR_PREVIEW_SIZE + 10;
  text(context, art, selection.name.toUpperCase().slice(0, 20), detailX, 45, '#553521', 9);
  text(context, art,
    selection.kind === 'generated_object' ? 'PROCEDURAL OBJECT'
      : selection.kind === 'authored_landmark' ? 'AUTHORED LANDMARK'
        : selection.kind === 'live_player_object' ? 'LIVE PLAYER OBJECT' : 'AUTHORED PREFAB',
    detailX, 61, selection.kind === 'generated_object' ? '#9a573d' : '#496b3f', 7);
  text(context, art, selection.id.toUpperCase().slice(0, 22), detailX, 75, '#79543a', 6);
  text(context, art, `TILE ${selection.tileX}, ${selection.tileY}`, detailX, 94, '#553521', 8);
  text(context, art, `ELEVATION L${selection.elevation}`, detailX, 108, '#79543a', 7);

  let lineY = 132;
  const fields: Array<readonly [string, string]> = [
    ['LAYER', selection.layer.toUpperCase()],
    ['ROTATION', `${selection.rotationDegrees}°`],
    ['FLIP X', selection.flipX ? 'YES' : 'NO'],
    ['SCALE', `${selection.scale}X`],
    ['VISIBLE', selection.enabled ? 'YES' : 'NO'],
  ];
  if (selection.prefabId !== null) fields.push(['PREFAB', selection.prefabId.toUpperCase()]);
  if (selection.prefabRevision !== null) fields.push(['PREFAB REV', String(selection.prefabRevision)]);
  for (const [label, value] of fields) {
    text(context, art, label, x, lineY, '#79543a', 7);
    text(context, art, value.slice(0, 26), x + 75, lineY, '#553521', 7);
    lineY += 12;
  }

  text(context, art, 'OBJECT ACTIONS', x, INSPECTOR_ACTION_Y - 13, '#553521', 8);
  for (let index = 0; index < INSPECTOR_OBJECT_ACTIONS.length; index += 1) {
    const action = INSPECTOR_OBJECT_ACTIONS[index]!;
    const enabled = inspectorObjectActionEnabled(action, selection);
    const rect = {
      x: x + index * INSPECTOR_ACTION_STEP,
      y: INSPECTOR_ACTION_Y,
      width: INSPECTOR_ACTION_SIZE,
      height: INSPECTOR_ACTION_SIZE,
    };
    const icon = art.uiSkin.icons?.[
      editorUiSymbol(inspectorObjectActionIcon(action, selection))
    ];
    if (icon !== undefined) {
      drawIconButton(
        context,
        art.uiSkin,
        rect,
        {
          icon,
          tone: action === 'delete_selected_object' ? 'danger'
            : action === 'toggle_selected_object_visibility' && !selection.enabled ? 'success' : 'neutral',
          state: enabled ? 'idle' : 'disabled',
        },
      );
    }
    if (action === 'toggle_selected_object_visibility' && !selection.enabled) {
      drawUiSkinAsset(context, art.uiSkin.selectorConfirm, {
        x: rect.x - 2, y: rect.y - 2, width: rect.width + 4, height: rect.height + 4,
      });
    }
  }
  lineY = INSPECTOR_ACTION_Y + INSPECTOR_ACTION_SIZE + 23;
  if (selection.kind === 'generated_object') {
    text(context, art, 'PROCEDURAL CONTENT CANNOT BE MOVED.', x, lineY, '#9a573d', 7);
    lineY += 13;
    text(context, art, 'DELETE / HIDE CREATE A REVERSIBLE SUPPRESSION.', x, lineY, '#79543a', 7);
    lineY += 18;
  } else if (selection.kind === 'live_player_object') {
    text(context, art,
      selection.movable ? 'OWNER/ADMIN: DRAG ON THE MAP TO MOVE.' : 'LIVE PLAYER STATE IS SHOWN READ-ONLY.',
      x, lineY, '#496b3f', 7);
    lineY += 18;
  }
  for (const entry of selection.metadata) {
    text(context, art, entry.label.toUpperCase().slice(0, 18), x, lineY, '#79543a', 7);
    text(context, art, entry.value.toUpperCase().slice(0, 25), x + 88, lineY, '#553521', 7);
    lineY += 12;
  }
}

function drawInspector(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  terrain: TerrainArray,
  groundCache: GroundChunkCache,
  model: EditorUiModel,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const x = viewportWidth - RIGHT_WIDTH;
  const layerPanelY = rightLayerPanelTop(viewportHeight);
  panel(context, art, x, 0, RIGHT_WIDTH, layerPanelY);
  panel(context, art, x, layerPanelY, RIGHT_WIDTH, viewportHeight - layerPanelY);
  ribbon(art).drawSingle(context, 'SELECTION INSPECTOR', {
    x: x + 14,
    y: 7,
    width: RIGHT_WIDTH - 28,
    height: 27,
  });
  context.save();
  context.beginPath();
  context.rect(
    x + DRAWER_INSET,
    RIGHT_SCROLL_TOP,
    RIGHT_WIDTH - DRAWER_INSET - DRAWER_SCROLLBAR_GUTTER,
    Math.max(1, layerPanelY - RIGHT_SCROLL_TOP - DRAWER_BOTTOM_SAFE),
  );
  context.clip();
  context.translate(0, -model.rightScrollOffset);
  const drawContent = (): void => {
    if (model.selection !== null) {
      drawObjectSelectionInspector(context, art, model.selection, x);
      return;
    }
    if (
      model.procedural !== null &&
      model.procedural.selectedChunkX !== null &&
      model.procedural.selectedChunkY !== null
    ) {
      const procedural = model.procedural;
      text(
        context,
        art,
        `SEED ${procedural.seedLabel}  GEN V${procedural.generatorVersion}`,
        x + RIGHT_CONTENT_X,
        39,
        "#496b3f",
        9,
      );
      text(
        context,
        art,
        `CHUNK ${procedural.selectedChunkX},${procedural.selectedChunkY}`,
        x + RIGHT_CONTENT_X,
        54,
        "#553521",
        11,
      );
      if (
        procedural.selectedWorldTileX !== null &&
        procedural.selectedWorldTileY !== null
      ) {
        text(
          context,
          art,
          `WORLD TILE ${procedural.selectedWorldTileX},${procedural.selectedWorldTileY}`,
          x + RIGHT_CONTENT_X,
          69,
          "#79543a",
          9,
        );
      }
      if (!procedural.selectedChunkGenerated) {
        text(
          context,
          art,
          "NOT GENERATED",
          x + RIGHT_CONTENT_X,
          82,
          "#9a573d",
          9,
        );
        button(
          context,
          art,
          "GENERATE CHUNK",
          x + RIGHT_CONTENT_X,
          GENERATE_CHUNK_Y,
          RIGHT_CONTENT_WIDTH,
          false,
          true,
          "confirm",
        );
        text(
          context,
          art,
          "Local editor materialization only.",
          x + RIGHT_CONTENT_X,
          124,
          "#79543a",
          9,
        );
        text(
          context,
          art,
          "No SpaceTimeDB write is performed.",
          x + RIGHT_CONTENT_X,
          138,
          "#79543a",
          9,
        );
        text(
          context,
          art,
          "V1 material families are preview-only.",
          x + RIGHT_CONTENT_X,
          152,
          "#9a573d",
          9,
        );
        return;
      }
    }
    if (model.inspection === null || model.trace === null) {
      text(
        context,
        art,
        "Click any world tile.",
        x + RIGHT_CONTENT_X,
        model.procedural === null ? 42 : 96,
        "#79543a",
      );
      text(
        context,
        art,
        "Shows final composite, every frame,",
        x + RIGHT_CONTENT_X,
        model.procedural === null ? 62 : 116,
        "#79543a",
        10,
      );
      text(
        context,
        art,
        "height, collision and WHY trace.",
        x + RIGHT_CONTENT_X,
        model.procedural === null ? 76 : 130,
        "#79543a",
        10,
      );
      return;
    }
    const inspection = model.inspection;
    const detailY = model.procedural === null ? 40 : 96;
    const tileX = model.procedural?.selectedWorldTileX ?? inspection.tileX;
    const tileY = model.procedural?.selectedWorldTileY ?? inspection.tileY;
    if (model.procedural !== null) {
      text(
        context,
        art,
        "SEMANTIC V1 / TEMPORARY MATERIAL ART",
        x + RIGHT_CONTENT_X,
        83,
        "#9a573d",
        8,
      );
    }
    text(
      context,
      art,
      `TILE ${tileX},${tileY}  L${inspection.logicalElevation}`,
      x + RIGHT_CONTENT_X,
      detailY,
    );
    text(
      context,
      art,
      `PLANE L${model.activeElevation}  ${inspection.collisionCell.toUpperCase()}`,
      x + RIGHT_CONTENT_X,
      detailY + 16,
      inspection.collisionCell === "blocked" ? "#a34337" : "#496b3f",
    );
    const visual = terrainInspectionVisualLayout(inspection);
    const visualOrigin = inspectionVisualOrigin(
      viewportWidth,
      inspection,
      model.procedural !== null,
    );
    const visualX = visualOrigin.x;
    const visualY = visualOrigin.y;
    drawUiSkinAsset(context, art.uiSkin.frameThin, {
      x: visualX - INSPECTION_FRAME_PADDING,
      y: visualY - INSPECTION_FRAME_PADDING,
      width: visual.width + INSPECTION_FRAME_PADDING * 2,
      height: visual.height + INSPECTION_FRAME_PADDING * 2,
    });
    drawTerrainInspectionVisuals(
      context,
      art,
      terrain,
      groundCache,
      inspection,
      visualX,
      visualY,
      {
        layerVisibility: model.inspectionLayerVisibility,
        selectedLayerIndex: model.selectedInspectionLayer,
      },
    );
    let lineY = visualY + visual.height + INSPECTION_FRAME_PADDING + 10;
    const selectedLayer = model.selectedInspectionLayer === null
      ? null
      : inspection.layers[model.selectedInspectionLayer] ?? null;
    if (selectedLayer === null) {
      text(
        context,
        art,
        "CLICK A TILE FOR LAYER DETAILS",
        x + RIGHT_CONTENT_X,
        lineY,
        "#79543a",
        8,
      );
      lineY += 13;
      text(
        context,
        art,
        "SHIFT+RIGHT SELECTS THE FIRST LAYER",
        x + RIGHT_CONTENT_X,
        lineY,
        "#79543a",
        7,
      );
      lineY += 18;
    } else {
      const selectedIndex = model.selectedInspectionLayer!;
      const visible = model.inspectionLayerVisibility[selectedIndex] !== false;
      text(
        context,
        art,
        `LAYER ${selectedIndex + 1}/${inspection.layers.length}  ${visible ? 'VISIBLE' : 'HIDDEN'}`,
        x + RIGHT_CONTENT_X,
        lineY,
        visible ? "#496b3f" : "#a34337",
        9,
      );
      lineY += 13;
      text(
        context,
        art,
        selectedLayer.role.slice(0, 35).toUpperCase(),
        x + RIGHT_CONTENT_X,
        lineY,
        "#553521",
        8,
      );
      lineY += 12;
      text(
        context,
        art,
        selectedLayer.asset.slice(0, 35),
        x + RIGHT_CONTENT_X,
        lineY,
        "#79543a",
        8,
      );
      lineY += 12;
      text(
        context,
        art,
        `FRAME ${selectedLayer.frame ?? '-'} / CONTOUR L${selectedLayer.contourLevel} / ${selectedLayer.depthPhase.toUpperCase()}`,
        x + RIGHT_CONTENT_X,
        lineY,
        "#79543a",
        8,
      );
      lineY += 13;
      text(
        context,
        art,
        "SHIFT+LEFT/RIGHT / V TOGGLE",
        x + RIGHT_CONTENT_X,
        lineY,
        "#79543a",
        7,
      );
      lineY += 20;
    }
    text(
      context,
      art,
      "WHY THIS COMPOSITION",
      x + RIGHT_CONTENT_X,
      lineY,
      "#553521",
      11,
    );
    lineY += 17;
    for (const layer of model.trace.layers.slice(0, 9)) {
      const role =
        layer.role.length > 31 ? `${layer.role.slice(0, 28)}...` : layer.role;
      text(
        context,
        art,
        `L${layer.contourLevel} ${role}`,
        x + RIGHT_CONTENT_X,
        lineY,
        "#70442c",
        9,
      );
      lineY += 12;
      const reason =
        layer.reason.length > 36
          ? `${layer.reason.slice(0, 33)}...`
          : layer.reason;
      text(context, art, reason, x + RIGHT_CONTENT_X + 6, lineY, "#79543a", 8);
      lineY += 12;
    }
    if (model.tool === 'override' && model.overridePalette.length > 0) {
      text(
        context,
        art,
        `REPLACE THIS PIECE — L${model.overridePalette[0]!.contourLevel}`,
        x + RIGHT_CONTENT_X,
        OVERRIDE_PALETTE_Y - 17,
        '#553521',
        10,
      );
      const buttonWidth = Math.floor(RIGHT_CONTENT_WIDTH / OVERRIDE_PALETTE_COLUMNS) - 3;
      for (let index = 0; index < model.overridePalette.length; index += 1) {
        const entry = model.overridePalette[index]!;
        const column = index % OVERRIDE_PALETTE_COLUMNS;
        const row = Math.floor(index / OVERRIDE_PALETTE_COLUMNS);
        button(
          context,
          art,
          `${(entry.role ?? 'frame').slice(0, 10)} ${entry.frameIndex ?? ''}`,
          x + RIGHT_CONTENT_X + column * (buttonWidth + 3),
          OVERRIDE_PALETTE_Y + row * OVERRIDE_PALETTE_ROW_HEIGHT,
          buttonWidth,
          false,
          true,
        );
      }
    }
  };
  drawContent();
  context.restore();
  drawScrollbar(
    context,
    art,
    x + RIGHT_WIDTH - DRAWER_SCROLLBAR_RIGHT,
    RIGHT_SCROLL_TOP,
    layerPanelY,
    model.selection === null
      ? model.inspection === null ? 170 : RIGHT_CONTENT_BOTTOM
      : Math.max(340, INSPECTOR_ACTION_Y + INSPECTOR_ACTION_SIZE
        + model.selection.metadata.length * 12 + 65),
    model.rightScrollOffset,
  );
  ribbon(art).drawSingle(context, 'LAYERS', {
    x: x + 14,
    y: layerPanelY + 7,
    width: RIGHT_WIDTH - 28,
    height: 27,
  });
  const layerY = rightLayerListY(viewportHeight);
  [...model.contentLayers].reverse().forEach((layer, index) => {
    contentLayerButton(
      context,
      art,
      layer,
      x + RIGHT_CONTENT_X,
      layerY + index * CONTENT_LAYER_ROW_HEIGHT,
      RIGHT_CONTENT_WIDTH,
    );
  });
}

export function drawEditorUi(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  terrain: TerrainArray,
  groundCache: GroundChunkCache,
  model: EditorUiModel,
  viewportWidth: number,
  viewportHeight: number,
): void {
  context.save();
  context.scale(EDITOR_UI_SCALE, EDITOR_UI_SCALE);
  const logicalViewportWidth = viewportWidth / EDITOR_UI_SCALE;
  const logicalViewportHeight = viewportHeight / EDITOR_UI_SCALE;

  const headerRect = mapHeaderRect(logicalViewportWidth);
  const headerContent = drawThinHudPanel(
    context,
    art.uiSkin,
    headerRect,
    MAP_PLATE_PADDING,
  );
  const headerLabel = editorUiHeaderLabel(model);
  context.save();
  context.beginPath();
  context.rect(
    headerContent.x,
    headerContent.y,
    headerContent.width,
    headerContent.height,
  );
  context.clip();
  drawPixelText(
    context,
    art.ui,
    fittedPixelText(headerLabel, headerContent.width, art.ui.font),
    headerContent.x,
    headerContent.y + Math.max(0, Math.floor((headerContent.height - 7) / 2)),
    {
      color: model.validationErrors === 0 ? "#496b3f" : "#a34337",
      font: "body",
    },
  );
  context.restore();

  panel(context, art, 0, 0, LEFT_WIDTH, logicalViewportHeight);
  ribbon(art).drawSingle(context, "MAP EDITOR", {
    x: 12,
    y: 7,
    width: LEFT_WIDTH - 24,
    height: 27,
  });
  for (let index = 0; index < COMMAND_ACTIONS.length; index += 1) {
    const action = COMMAND_ACTIONS[index]!;
    commandButton(
      context,
      art,
      action,
      LEFT_CONTENT_X + index * COMMAND_BUTTON_STEP_X,
      COMMAND_GRID_Y,
      action === "undo"
        ? model.pastCount > 0
        : action === "redo"
          ? model.futureCount > 0
          : action === "randomize_seed"
            ? model.procedural !== null
            : action === 'connect_live'
              ? !model.live.synchronizing
              : action === 'publish_live'
                ? model.live.connected && model.live.canPublish && model.live.dirty && !model.live.publishing
            : true,
      model.hoveredAction?.kind === action,
      action === 'connect_live' && model.live.connected,
    );
  }
  context.save();
  context.beginPath();
  context.rect(
    DRAWER_INSET,
    LEFT_SCROLL_TOP,
    LEFT_WIDTH - DRAWER_INSET - DRAWER_SCROLLBAR_GUTTER,
    Math.max(1, logicalViewportHeight - LEFT_SCROLL_TOP - DRAWER_BOTTOM_SAFE),
  );
  context.clip();
  context.translate(0, -model.leftScrollOffset);
  for (let index = 0; index < EDITOR_WORKSPACE_MODES.length; index += 1) {
    const workspace = EDITOR_WORKSPACE_MODES[index]!;
    workspaceButton(
      context,
      art,
      workspace,
      LEFT_CONTENT_X + index * WORKSPACE_BUTTON_STEP,
      WORKSPACE_GRID_Y,
      workspace === model.workspaceMode,
    );
  }
  if (model.workspaceMode === 'terrain') {
  for (let index = 0; index < EDITOR_TOOLS.length; index += 1) {
    const tool = EDITOR_TOOLS[index]!;
    const column = index % TOOL_GRID_COLUMNS;
    const row = Math.floor(index / TOOL_GRID_COLUMNS);
    toolButton(
      context,
      art,
      tool,
      LEFT_CONTENT_X + column * TOOL_BUTTON_STEP,
      TOOL_GRID_Y + row * TOOL_BUTTON_STEP,
      tool === model.tool,
    );
  }
  for (let index = 0; index < DISPLAY_ACTIONS.length; index += 1) {
    const action = DISPLAY_ACTIONS[index]!;
    const selected =
      action === "toggle_grid"
        ? model.gridVisible
        : action === "toggle_height"
          ? model.heightVisible
          : action === "toggle_collision"
            ? model.collisionVisible
            : model.edgeMode === "auto";
    displayButton(
      context,
      art,
      action,
      LEFT_CONTENT_X + index * DISPLAY_BUTTON_STEP,
      DISPLAY_GRID_Y,
      selected,
      model.hoveredAction?.kind === action,
    );
  }
  text(
    context,
    art,
    TOOL_LABELS[model.tool],
    LEFT_CONTENT_X,
    TOOL_NAME_Y,
    "#553521",
    9,
  );
  text(
    context,
    art,
    model.tool === 'transition'
      ? `STAIR WIDTH ${model.stairWidth}`
      : `BRUSH DELTA ${model.elevationDelta}`,
    LEFT_CONTENT_X,
    ELEVATION_DELTA_Y,
    "#79543a",
    8,
  );
  button(
    context,
    art,
    "-",
    ELEVATION_DELTA_BUTTON_X,
    ELEVATION_DELTA_BUTTON_Y,
    ELEVATION_DELTA_BUTTON_SIZE,
    false,
    model.tool === 'transition' ? model.stairWidth > 2 : model.elevationDelta > 1,
  );
  button(
    context,
    art,
    "+",
    ELEVATION_DELTA_BUTTON_X + ELEVATION_DELTA_BUTTON_SIZE + 4,
    ELEVATION_DELTA_BUTTON_Y,
    ELEVATION_DELTA_BUTTON_SIZE,
    false,
    model.tool === 'transition' ? model.stairWidth < 4 : model.elevationDelta < 8,
  );
  text(
    context,
    art,
    "TERRAIN FAMILY",
    LEFT_CONTENT_X,
    FAMILY_LABEL_Y,
    "#79543a",
    8,
  );
  familyButton(
    context,
    art,
    model.terrainFamily,
    LEFT_CONTENT_X,
    FAMILY_BUTTON_Y,
    LEFT_WIDTH - LEFT_CONTENT_X - DRAWER_SCROLLBAR_GUTTER,
    model.terrainFamilyOpen,
  );
  if (model.terrainFamilyOpen) {
    for (let index = 0; index < EDITOR_TERRAIN_FAMILIES.length; index += 1) {
      const family = EDITOR_TERRAIN_FAMILIES[index]!;
      familyButton(
        context,
        art,
        family,
        LEFT_CONTENT_X,
        FAMILY_LIST_Y + index * FAMILY_ROW_HEIGHT,
        LEFT_WIDTH - LEFT_CONTENT_X - DRAWER_SCROLLBAR_GUTTER,
        family === model.terrainFamily,
      );
    }
  }
  const currentSurfaceLabelY = surfaceLabelY(model.terrainFamilyOpen);
  const currentSurfaceButtonY = surfaceButtonY(model.terrainFamilyOpen);
  text(context, art, 'SURFACE FAMILY', LEFT_CONTENT_X, currentSurfaceLabelY, '#79543a', 8);
  button(
    context,
    art,
    model.surfaceFamily.replaceAll('_', ' ').toUpperCase(),
    LEFT_CONTENT_X,
    currentSurfaceButtonY,
    LEFT_WIDTH - LEFT_CONTENT_X - DRAWER_SCROLLBAR_GUTTER,
  );
  if (model.procedural === null) {
    const currentResizeY = resizeY(model.terrainFamilyOpen);
    const currentResizeButtonY = resizeButtonY(model.terrainFamilyOpen);
    text(
      context,
      art,
      `MAP ${model.mapWidth} x ${model.mapHeight}  RESIZE EDGES`,
      LEFT_CONTENT_X,
      currentResizeY,
      "#553521",
      9,
    );
    const resizeLabels = [
      "W-",
      "W+",
      "E-",
      "E+",
      "N-",
      "N+",
      "S-",
      "S+",
    ] as const;
    for (let index = 0; index < resizeLabels.length; index += 1) {
      const column = index % 4;
      const row = Math.floor(index / 4);
      button(
        context,
        art,
        resizeLabels[index]!,
        LEFT_CONTENT_X + column * RESIZE_BUTTON_STEP,
        currentResizeButtonY + row * BUTTON_HEIGHT,
        RESIZE_BUTTON_WIDTH,
      );
    }
    text(
      context,
      art,
      "SHIFT = 8 TILES / UNDO RESTORES CROP",
      LEFT_CONTENT_X,
      currentResizeButtonY + 53,
      "#79543a",
      7,
    );
  }
  } else {
    if (model.workspaceMode === 'objects' || model.workspaceMode === 'scatter') {
      if (model.workspaceMode === 'scatter') {
        text(context, art, `DENSITY ${Math.round(model.scatterDensity / 100)}%`, LEFT_CONTENT_X,
          SCATTER_DENSITY_Y, '#553521', 8);
        button(context, art, '-', LEFT_CONTENT_X, SCATTER_DENSITY_Y + 13, 50, false, model.scatterDensity > 0);
        button(context, art, '+', 96, SCATTER_DENSITY_Y + 13, 50, false, model.scatterDensity < 10_000);
      }
      const searchY = leftPrefabSearchY(model.workspaceMode);
      const filterY = leftPrefabFilterY(model.workspaceMode);
      const listY = leftPrefabListY(model.workspaceMode);
      text(context, art, 'OBJECT PALETTE', LEFT_CONTENT_X, searchY - 11, '#553521', 8);
      drawPrefabSearch(
        context,
        art,
        model.objectSearch,
        model.objectSearchFocused,
        searchY,
      );
      button(context, art, `COLLECTION: ${model.prefabCollection.toUpperCase()}`,
        LEFT_CONTENT_X, filterY, LEFT_WIDTH - LEFT_CONTENT_X - DRAWER_SCROLLBAR_GUTTER);
      const visiblePrefabs = editorVisiblePrefabs(
        model.prefabs,
        model.prefabCollection,
        model.objectSearch,
      );
      const firstVisibleRow = Math.max(0, Math.floor(
        (model.leftScrollOffset + LEFT_SCROLL_TOP - listY) / PREFAB_TILE_STEP,
      ));
      const lastVisibleRow = Math.max(firstVisibleRow, Math.ceil(
        (model.leftScrollOffset + logicalViewportHeight - DRAWER_BOTTOM_SAFE - listY)
          / PREFAB_TILE_STEP,
      ));
      const firstVisibleIndex = firstVisibleRow * PREFAB_TILE_COLUMNS;
      const lastVisibleIndex = Math.min(
        visiblePrefabs.length,
        (lastVisibleRow + 1) * PREFAB_TILE_COLUMNS,
      );
      for (let index = firstVisibleIndex; index < lastVisibleIndex; index += 1) {
        const prefab = visiblePrefabs[index]!;
        const column = index % PREFAB_TILE_COLUMNS;
        const row = Math.floor(index / PREFAB_TILE_COLUMNS);
        const x = LEFT_CONTENT_X + column * PREFAB_TILE_STEP;
        const y = listY + row * PREFAB_TILE_STEP;
        prefabTile(context, art, prefab, x, y, prefab.id === model.selectedPrefabId);
      }
      if (visiblePrefabs.length === 0) {
        text(context, art, 'NO MATCHING OBJECTS', LEFT_CONTENT_X,
          listY + 10, '#9a573d', 7);
      }
    } else {
      const biomeIndex = MAP_BIOME_IDS.indexOf(model.activeBiome);
      text(context, art, 'ACTIVE BIOME BRUSH', LEFT_CONTENT_X, OBJECT_CONTROL_Y - 14, '#553521', 8);
      button(context, art, '<', LEFT_CONTENT_X, OBJECT_CONTROL_Y, 28, false, biomeIndex > 0);
      button(context, art, model.activeBiome.replaceAll('_', ' ').toUpperCase(), LEFT_CONTENT_X + 31,
        OBJECT_CONTROL_Y, 72);
      button(context, art, '>', 122, OBJECT_CONTROL_Y, 28, false, biomeIndex < MAP_BIOME_IDS.length - 1);
      text(context, art, 'PAINT OR SHIFT-FILL BIOME METADATA', LEFT_CONTENT_X,
        OBJECT_CONTROL_Y + 37, '#79543a', 7);
    }
  }
  context.restore();
  drawScrollbar(
    context,
    art,
    LEFT_WIDTH - DRAWER_SCROLLBAR_RIGHT,
    LEFT_SCROLL_TOP,
    logicalViewportHeight,
    leftContentBottom(
      model.terrainFamilyOpen,
      model.procedural !== null,
      model.workspaceMode,
      editorVisiblePrefabs(model.prefabs, model.prefabCollection, model.objectSearch).length,
    ),
    model.leftScrollOffset,
  );

  drawInspector(
    context,
    art,
    terrain,
    groundCache,
    model,
    logicalViewportWidth,
    logicalViewportHeight,
  );
  const statusWidth = Math.max(
    140,
    logicalViewportWidth - LEFT_WIDTH - RIGHT_WIDTH - 16,
  );
  const statusRect = {
    x: LEFT_WIDTH + 8,
    y: logicalViewportHeight - MAP_PLATE_HEIGHT - 6,
    width: statusWidth,
    height: MAP_PLATE_HEIGHT,
  };
  const statusContent = drawThinHudPanel(
    context,
    art.uiSkin,
    statusRect,
    MAP_PLATE_PADDING,
  );
  const hoverHelp =
    model.hoveredAction === null
      ? model.status
      : editorUiTooltipForAction(model.hoveredAction);
  const brushSetting = model.tool === 'transition'
    ? `W${model.stairWidth}` : `Δ${model.elevationDelta}`;
  const activeModeLabel = model.workspaceMode === 'terrain'
    ? TOOL_LABELS[model.tool]
    : model.workspaceMode === 'biomes'
      ? `BIOME ${model.activeBiome.toUpperCase()}`
      : model.workspaceMode === 'scatter'
        ? `SCATTER ${Math.round(model.scatterDensity / 100)}% / ${
          (model.contentLayers.find((layer) => layer.active)?.id ?? model.activeObjectLayer).toUpperCase()}`
        : `OBJECTS / ${
          (model.contentLayers.find((layer) => layer.active)?.id ?? model.activeObjectLayer).toUpperCase()}`;
  const statusLabel = `${activeModeLabel} / L${model.activeElevation} / ${brushSetting} / ZOOM ${model.worldZoom.toFixed(3)}x / ${hoverHelp}`;
  context.save();
  context.beginPath();
  context.rect(
    statusContent.x,
    statusContent.y,
    statusContent.width,
    statusContent.height,
  );
  context.clip();
  drawPixelText(
    context,
    art.ui,
    fittedPixelText(statusLabel, statusContent.width, art.ui.font),
    statusContent.x,
    statusContent.y + Math.max(0, Math.floor((statusContent.height - 7) / 2)),
    { color: "#553521", font: "body" },
  );
  context.restore();
  context.restore();
}
