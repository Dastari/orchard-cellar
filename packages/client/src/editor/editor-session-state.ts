import {
  PROCEDURAL_TERRAIN_FAMILIES,
  type MapPoint,
  type ProceduralTerrainFamily,
} from "@orchard/sim";
import {
  EDITOR_TOOLS,
  type EditorEdgeMode,
  type EditorTool,
} from "./editor-ui.js";

const EDITOR_SESSION_VERSION = 1;

export interface EditorSessionState {
  readonly version: typeof EDITOR_SESSION_VERSION;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly worldZoom: number;
  readonly selectedTile: MapPoint | null;
  readonly activeElevation: number;
  readonly tool: EditorTool;
  readonly terrainFamily: ProceduralTerrainFamily;
  readonly terrainFamilyOpen: boolean;
  readonly edgeMode: EditorEdgeMode;
  readonly gridVisible: boolean;
  readonly heightVisible: boolean;
  readonly collisionVisible: boolean;
  readonly leftUiScroll: number;
  readonly rightUiScroll: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isEditorTool(value: unknown): value is EditorTool {
  return (
    typeof value === "string" &&
    (EDITOR_TOOLS as readonly string[]).includes(value)
  );
}

function isTerrainFamily(value: unknown): value is ProceduralTerrainFamily {
  return (
    typeof value === "string" &&
    (PROCEDURAL_TERRAIN_FAMILIES as readonly string[]).includes(value)
  );
}

function isEdgeMode(value: unknown): value is EditorEdgeMode {
  return value === "auto" || value === "manual";
}

function parseSelectedTile(value: unknown): MapPoint | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Record<string, unknown>;
  if (!isInteger(candidate["tileX"]) || !isInteger(candidate["tileY"]))
    return undefined;
  return { tileX: candidate["tileX"], tileY: candidate["tileY"] };
}

export function editorSessionStorageKey(
  mapId: string,
  proceduralSeed: number | null,
): string {
  const identity =
    proceduralSeed === null ? mapId : `${mapId}.seed.${proceduralSeed}`;
  return `orchard.editor.session.v${EDITOR_SESSION_VERSION}.${identity}`;
}

export function serializeEditorSessionState(
  state: EditorSessionState,
): string {
  return JSON.stringify(state);
}

export function parseEditorSessionState(
  source: string | null,
): EditorSessionState | null {
  if (source === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const selectedTile = parseSelectedTile(candidate["selectedTile"]);
  if (
    candidate["version"] !== EDITOR_SESSION_VERSION ||
    !isFiniteNumber(candidate["cameraX"]) ||
    !isFiniteNumber(candidate["cameraY"]) ||
    !isFiniteNumber(candidate["worldZoom"]) ||
    candidate["worldZoom"] <= 0 ||
    selectedTile === undefined ||
    !isInteger(candidate["activeElevation"]) ||
    candidate["activeElevation"] < 0 ||
    !isEditorTool(candidate["tool"]) ||
    !isTerrainFamily(candidate["terrainFamily"]) ||
    !isBoolean(candidate["terrainFamilyOpen"]) ||
    !isEdgeMode(candidate["edgeMode"]) ||
    !isBoolean(candidate["gridVisible"]) ||
    !isBoolean(candidate["heightVisible"]) ||
    !isBoolean(candidate["collisionVisible"]) ||
    !isFiniteNumber(candidate["leftUiScroll"]) ||
    candidate["leftUiScroll"] < 0 ||
    !isFiniteNumber(candidate["rightUiScroll"]) ||
    candidate["rightUiScroll"] < 0
  )
    return null;

  return {
    version: EDITOR_SESSION_VERSION,
    cameraX: candidate["cameraX"],
    cameraY: candidate["cameraY"],
    worldZoom: candidate["worldZoom"],
    selectedTile,
    activeElevation: candidate["activeElevation"],
    tool: candidate["tool"],
    terrainFamily: candidate["terrainFamily"],
    terrainFamilyOpen: candidate["terrainFamilyOpen"],
    edgeMode: candidate["edgeMode"],
    gridVisible: candidate["gridVisible"],
    heightVisible: candidate["heightVisible"],
    collisionVisible: candidate["collisionVisible"],
    leftUiScroll: candidate["leftUiScroll"],
    rightUiScroll: candidate["rightUiScroll"],
  };
}
