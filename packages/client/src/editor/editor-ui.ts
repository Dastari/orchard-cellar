import {
  PROCEDURAL_TERRAIN_FAMILIES,
  type ProceduralTerrainFamily,
  type SemanticTerrainTrace,
} from "@orchard/sim";
import type { OverworldArt } from "../overworld-art.js";
import type { LoadedAsset } from "../render/assets.js";
import type { GroundChunkCache } from "../render/ground-cache.js";
import { drawPixelText, measurePixelText } from "../render/pixel-ui.js";
import {
  drawTerrainInspectionVisuals,
  terrainInspectionVisualLayout,
  type TerrainInspection,
} from "../render/terrain-inspector.js";
import type { TerrainArray } from "../render/terrain.js";
import { Ribbon } from "../ui/ribbon.js";
import { drawScrollBarChrome } from "../ui/scrollbar.js";
import {
  drawThinHudPanel,
  drawUiIconAsset,
  drawUiSkinAsset,
  type UiIconName,
} from "../ui/skin.js";

export const EDITOR_TOOLS = [
  "inspect",
  "grass",
  "dirt",
  "water",
  "path",
  "raise",
  "lower",
  "block",
] as const;
export type EditorTool = (typeof EDITOR_TOOLS)[number];
export type EditorResizeEdge = "west" | "east" | "north" | "south";
export type EditorEdgeMode = "auto" | "manual";

export type EditorUiAction =
  | { readonly kind: "tool"; readonly tool: EditorTool }
  | { readonly kind: "toggle_grid" | "toggle_height" | "toggle_collision" }
  | { readonly kind: "toggle_terrain_family" }
  | {
      readonly kind: "terrain_family";
      readonly family: ProceduralTerrainFamily;
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
        | "randomize_seed";
    }
  | {
      readonly kind: "resize";
      readonly edge: EditorResizeEdge;
      readonly grow: boolean;
    }
  | { readonly kind: "generate_chunk" }
  | null;

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

export interface EditorUiModel {
  readonly title: string;
  readonly hash: string;
  readonly revision: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly tool: EditorTool;
  readonly terrainFamily: ProceduralTerrainFamily;
  readonly terrainFamilyOpen: boolean;
  readonly edgeMode: EditorEdgeMode;
  readonly activeElevation: number;
  readonly gridVisible: boolean;
  readonly heightVisible: boolean;
  readonly collisionVisible: boolean;
  readonly worldZoom: number;
  readonly pastCount: number;
  readonly futureCount: number;
  readonly validationErrors: number;
  readonly status: string;
  readonly inspection: TerrainInspection | null;
  readonly trace: SemanticTerrainTrace | null;
  readonly procedural: ProceduralEditorUiModel | null;
  readonly hoveredAction: Exclude<EditorUiAction, null> | null;
  readonly leftScrollOffset: number;
  readonly rightScrollOffset: number;
}

export const EDITOR_UI_SCALE = 2;
const LEFT_WIDTH = 168;
const RIGHT_WIDTH = 272;
const BUTTON_HEIGHT = 27;
const DRAWER_INSET = 8;
const DRAWER_BOTTOM_SAFE = 16;
const DRAWER_SCROLLBAR_GUTTER = 25;
const DRAWER_SCROLLBAR_RIGHT = 24;
const DRAWER_SCROLLBAR_WIDTH = 14;
const DRAWER_SCROLLBAR_THUMB_HEIGHT = 18;
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
const RIGHT_CONTENT_BOTTOM = 680;
const MAP_PLATE_HEIGHT = 28;
const MAP_PLATE_PADDING = 2;

const COMMAND_GRID_Y = 40;
const COMMAND_BUTTON_SIZE = 16;
const COMMAND_BUTTON_STEP_X = 18;
const COMMAND_GRID_COLUMNS = 7;
const TOOL_GRID_Y = 72;
const TOOL_GRID_COLUMNS = 4;
const TOOL_BUTTON_SIZE = 29;
const TOOL_BUTTON_STEP = 32;
const DISPLAY_BUTTON_SIZE = 20;
const DISPLAY_BUTTON_STEP = 24;
const DISPLAY_GRID_Y = TOOL_GRID_Y + 2 * TOOL_BUTTON_STEP;
const TOOL_NAME_Y = 164;
const FAMILY_LABEL_Y = 180;
const FAMILY_BUTTON_Y = 191;
const FAMILY_BUTTON_HEIGHT = 43;
const FAMILY_LIST_Y = FAMILY_BUTTON_Y + FAMILY_BUTTON_HEIGHT + 2;
const FAMILY_ROW_HEIGHT = 44;
const RESIZE_GAP = 14;

const COMMAND_ACTIONS = [
  "undo",
  "redo",
  "save",
  "load",
  "export",
  "import",
  "randomize_seed",
] as const;
type CommandAction = (typeof COMMAND_ACTIONS)[number];

const DISPLAY_ACTIONS = [
  "toggle_grid",
  "toggle_height",
  "toggle_collision",
  "toggle_edge_mode",
] as const;
type DisplayAction = (typeof DISPLAY_ACTIONS)[number];

export const EDITOR_TERRAIN_FAMILIES: readonly ProceduralTerrainFamily[] = [
  ...PROCEDURAL_TERRAIN_FAMILIES.slice(0, 4),
  "snow_highland",
  ...PROCEDURAL_TERRAIN_FAMILIES.slice(4, -1),
];

const FAMILY_LABELS: Readonly<Record<ProceduralTerrainFamily, string>> = {
  temperate_meadow: "GRASS 1",
  temperate_woodland: "GRASS 2",
  temperate_plains: "GRASS 3",
  temperate_highland: "GRASS 4",
  snow_highland: "SNOW",
  desert_1: "DESERT 1",
  desert_2: "DESERT 2",
  desert_3: "DESERT 3",
  shroom_green: "SHROOM GREEN",
  shroom_blue: "SHROOM BLUE",
  shroom_purple: "SHROOM PURPLE",
  volcanic: "VOLCANIC",
};

const FAMILY_DETAILS: Readonly<Record<ProceduralTerrainFamily, string>> = {
  temperate_meadow: "MEADOW / WATER 1",
  temperate_woodland: "WOODLAND / WATER 2",
  temperate_plains: "PLAINS / WATER 3",
  temperate_highland: "HIGHLAND / WATER 4",
  snow_highland: "HIGHLAND / OVERLAY",
  desert_1: "SAND / WATER 1",
  desert_2: "SAND / WATER 2",
  desert_3: "SAND / WATER 3",
  shroom_green: "GREEN TERRAIN SET",
  shroom_blue: "BLUE TERRAIN SET",
  shroom_purple: "PURPLE TERRAIN SET",
  volcanic: "ROCK / LAVA SET",
};

const FAMILY_COLORS: Readonly<
  Record<ProceduralTerrainFamily, readonly [string, string, string]>
> = {
  temperate_meadow: ["#58a45f", "#3694b8", "#66758c"],
  temperate_woodland: ["#2f713d", "#2f7799", "#59697e"],
  temperate_plains: ["#84a45e", "#4a9ec0", "#747f92"],
  temperate_highland: ["#8c9a83", "#638da1", "#7e8794"],
  snow_highland: ["#e4eef0", "#8fb6c5", "#788491"],
  desert_1: ["#d8b15d", "#3b92ad", "#9a7656"],
  desert_2: ["#c9974d", "#337f9f", "#8a694e"],
  desert_3: ["#b67d42", "#2f7698", "#75594a"],
  shroom_green: ["#4f9567", "#39798b", "#6b5b86"],
  shroom_blue: ["#4f7998", "#315f86", "#5d5a88"],
  shroom_purple: ["#765b98", "#44577f", "#765579"],
  volcanic: ["#51464c", "#b64d31", "#302b34"],
};

function familyListHeight(open: boolean): number {
  return open ? EDITOR_TERRAIN_FAMILIES.length * FAMILY_ROW_HEIGHT : 0;
}

function familyPaletteBottom(open: boolean): number {
  return open
    ? FAMILY_LIST_Y + familyListHeight(true)
    : FAMILY_BUTTON_Y + FAMILY_BUTTON_HEIGHT;
}

function resizeY(open: boolean): number {
  return familyPaletteBottom(open) + RESIZE_GAP;
}

function resizeButtonY(open: boolean): number {
  return resizeY(open) + 17;
}

function leftContentBottom(open: boolean, procedural: boolean): number {
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

function toolIcon(art: OverworldArt, tool: EditorTool): LoadedAsset {
  switch (tool) {
    case "inspect":
      return art.uiSkin.cursor;
    case "grass":
      return art.iconHoe;
    case "dirt":
      return art.iconShovel;
    case "water":
      return art.iconWateringCan;
    case "path":
      return art.itemPlank;
    case "raise":
      return art.iconPickaxe;
    case "lower":
      return art.iconAxe;
    case "block":
      return art.uiSkin.crosshair;
  }
}

function toolButton(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  tool: EditorTool,
  x: number,
  y: number,
  selected: boolean,
): void {
  drawUiSkinAsset(
    context,
    selected ? art.uiSkin.buttonConfirm : art.uiSkin.slot,
    {
      x,
      y,
      width: TOOL_BUTTON_SIZE,
      height: TOOL_BUTTON_SIZE,
    },
  );
  drawUiSkinAsset(context, toolIcon(art, tool), {
    x: x + 5,
    y: y + 5,
    width: TOOL_BUTTON_SIZE - 10,
    height: TOOL_BUTTON_SIZE - 10,
  });
  if (selected)
    drawUiSkinAsset(context, art.uiSkin.selectorConfirm, {
      x: x - 2,
      y: y - 2,
      width: TOOL_BUTTON_SIZE + 4,
      height: TOOL_BUTTON_SIZE + 4,
    });
}

function ghostIconButton(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  icon: UiIconName,
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
  drawUiIconAsset(
    context,
    art.uiSkin.icons[icon],
    {
      x: x + inset,
      y: y + inset,
      width: size - inset * 2,
      height: size - inset * 2,
    },
    enabled ? 1 : 0.35,
  );
  context.restore();
}

const COMMAND_ICONS: Readonly<Record<CommandAction, UiIconName>> = {
  undo: "undo",
  redo: "redo",
  save: "save",
  load: "load",
  export: "export",
  import: "import",
  randomize_seed: "randomize",
};

function commandButton(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  action: CommandAction,
  x: number,
  y: number,
  enabled: boolean,
  hovered: boolean,
): void {
  ghostIconButton(
    context,
    art,
    COMMAND_ICONS[action],
    x,
    y,
    COMMAND_BUTTON_SIZE,
    hovered,
    false,
    enabled,
  );
}

const DISPLAY_ICONS: Readonly<Record<DisplayAction, UiIconName>> = {
  toggle_grid: "grid",
  toggle_height: "height",
  toggle_collision: "collision",
  toggle_edge_mode: "autoEdges",
};

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
  family: ProceduralTerrainFamily,
  x: number,
  y: number,
  size = 12,
): void {
  for (const [index, color] of FAMILY_COLORS[family].entries()) {
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
  family: ProceduralTerrainFamily,
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
  drawPixelText(context, art.ui, FAMILY_LABELS[family], x + 47, y + 7, {
    color: selected ? "#f7eccd" : "#4d2e22",
    font: "body",
  });
  drawPixelText(context, art.ui, FAMILY_DETAILS[family], x + 7, y + 25, {
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
): number {
  const logicalHeight = viewportHeight / EDITOR_UI_SCALE;
  const contentBottom =
    drawer === "left"
      ? leftContentBottom(terrainFamilyOpen, procedural)
      : RIGHT_CONTENT_BOTTOM;
  return Math.max(0, contentBottom - logicalHeight + DRAWER_BOTTOM_SAFE);
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
    DRAWER_SCROLLBAR_THUMB_HEIGHT,
  );
}

const TOOL_LABELS: Readonly<Record<EditorTool, string>> = {
  inspect: "INSPECT / PAN",
  grass: "GRASS BRUSH",
  dirt: "GROUND / PATH BASE",
  water: "WATER / RIVER",
  path: "PATH OVERLAY",
  raise: "RAISE CONTOUR",
  lower: "LOWER CONTOUR",
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
      if (command === "randomize_seed" && finiteMapResizeAvailable) return null;
      return { kind: command };
    }
    if (viewportY < LEFT_SCROLL_TOP) return null;
    const logicalY = viewportY + leftScrollOffset;
    const toolColumn = Math.floor(
      (logicalX - LEFT_CONTENT_X) / TOOL_BUTTON_STEP,
    );
    const toolRow = Math.floor((logicalY - TOOL_GRID_Y) / TOOL_BUTTON_STEP);
    const insideTool =
      toolColumn >= 0 &&
      toolColumn < TOOL_GRID_COLUMNS &&
      toolRow >= 0 &&
      toolRow < 2 &&
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
    const logicalY =
      viewportY + (viewportY >= RIGHT_SCROLL_TOP ? rightScrollOffset : 0);
    if (
      proceduralGenerateAvailable &&
      logicalY >= GENERATE_CHUNK_Y &&
      logicalY < GENERATE_CHUNK_Y + GENERATE_CHUNK_HEIGHT &&
      logicalX >= logicalViewportWidth - RIGHT_WIDTH + RIGHT_CONTENT_X &&
      logicalX < logicalViewportWidth - DRAWER_SCROLLBAR_GUTTER
    )
      return { kind: "generate_chunk" };
    return null;
  }
  return null;
}

export function editorUiTooltipForAction(
  action: Exclude<EditorUiAction, null>,
): string {
  if (action.kind === "tool")
    return `${TOOL_LABELS[action.tool]} (${EDITOR_TOOLS.indexOf(action.tool) + 1})`;
  if (action.kind === "toggle_grid") return "TOGGLE TILE GRID (G)";
  if (action.kind === "toggle_height") return "TOGGLE HEIGHT OVERLAY (H)";
  if (action.kind === "toggle_collision") return "TOGGLE COLLISION OVERLAY (C)";
  if (action.kind === "toggle_terrain_family")
    return "CHOOSE A COMPLETE TERRAIN TILESET";
  if (action.kind === "terrain_family")
    return `${FAMILY_LABELS[action.family]} — ${FAMILY_DETAILS[action.family]}`;
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
  if (action.kind === "resize") {
    return `${action.grow ? "GROW" : "CROP"} ${action.edge.toUpperCase()} MAP EDGE`;
  }
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
    return `${model.title} / ${model.mapWidth}x${model.mapHeight} / #${model.hash.slice(0, 6)} / R${model.revision} / E${model.validationErrors}`;
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
  panel(context, art, x, 0, RIGHT_WIDTH, viewportHeight);
  ribbon(art).drawSingle(context, "TILE INSPECTOR", {
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
    Math.max(1, viewportHeight - RIGHT_SCROLL_TOP - DRAWER_BOTTOM_SAFE),
  );
  context.clip();
  context.translate(0, -model.rightScrollOffset);
  const drawContent = (): void => {
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
    const visualX =
      x +
      RIGHT_CONTENT_X +
      Math.floor((RIGHT_CONTENT_WIDTH - visual.width) / 2);
    const visualY = detailY + 38;
    drawUiSkinAsset(context, art.uiSkin.frameThin, {
      x: visualX - 4,
      y: visualY - 4,
      width: visual.width + 8,
      height: visual.height + 8,
    });
    drawTerrainInspectionVisuals(
      context,
      art,
      terrain,
      groundCache,
      inspection,
      visualX,
      visualY,
    );
    let lineY = visualY + 14 + visual.height;
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
  };
  drawContent();
  context.restore();
  drawScrollbar(
    context,
    art,
    x + RIGHT_WIDTH - DRAWER_SCROLLBAR_RIGHT,
    RIGHT_SCROLL_TOP,
    viewportHeight,
    RIGHT_CONTENT_BOTTOM,
    model.rightScrollOffset,
  );
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
  ribbon(art).drawSingle(context, "CREATOR MODE", {
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
            : true,
      model.hoveredAction?.kind === action,
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
  context.restore();
  drawScrollbar(
    context,
    art,
    LEFT_WIDTH - DRAWER_SCROLLBAR_RIGHT,
    LEFT_SCROLL_TOP,
    logicalViewportHeight,
    leftContentBottom(model.terrainFamilyOpen, model.procedural !== null),
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
  const statusLabel = `${TOOL_LABELS[model.tool]} / L${model.activeElevation} / ZOOM ${model.worldZoom.toFixed(3)}x / ${hoverHelp}`;
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
