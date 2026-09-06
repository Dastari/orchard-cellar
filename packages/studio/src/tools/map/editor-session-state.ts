import {
  MAP_BIOME_IDS,
  MAP_CONTENT_LAYER_IDS,
  TERRAIN_CLIFF_FAMILY_IDS,
  TERRAIN_CLIFF_FAMILIES,
  TERRAIN_SURFACE_FAMILY_IDS,
  TERRAIN_ELEVATION_LIMIT,
  type CliffFamilyId,
  type TerrainSurfaceFamilyId,
  type MapPoint,
  type MapBiomeId,
  type MapContentLayerId,
  type MapObjectLayer,
} from "@orchard/sim";
import {
  EDITOR_TOOLS,
  EDITOR_WORKSPACE_MODES,
  type EditorEdgeMode,
  type EditorTool,
  type EditorWorkspaceMode,
} from "./editor-ui.js";

const EDITOR_SESSION_VERSION = 3;

export interface EditorSessionState {
  readonly version: typeof EDITOR_SESSION_VERSION;
  readonly cameraX: number;
  readonly cameraY: number;
  readonly worldZoom: number;
  readonly selectedTile: MapPoint | null;
  readonly activeElevation: number;
  readonly elevationDelta: number;
  readonly stairWidth: 2 | 3 | 4;
  readonly tool: EditorTool;
  readonly workspaceMode: EditorWorkspaceMode;
  readonly hiddenContentLayers: readonly MapContentLayerId[];
  readonly activeContentLayer: MapContentLayerId;
  readonly activeObjectLayer: MapObjectLayer;
  readonly selectedPrefabId: string | null;
  readonly prefabCollection: string;
  readonly activeBiome: MapBiomeId;
  readonly scatterDensity: number;
  readonly terrainFamily: CliffFamilyId;
  readonly surfaceFamily: TerrainSurfaceFamilyId;
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

function isWorkspaceMode(value: unknown): value is EditorWorkspaceMode {
  return typeof value === 'string' && (EDITOR_WORKSPACE_MODES as readonly string[]).includes(value);
}

function isObjectLayer(value: unknown): value is MapObjectLayer {
  return value === 'ground' || value === 'objects' || value === 'gameplay' || value === 'canopy';
}

function isContentLayer(value: unknown): value is MapContentLayerId {
  return typeof value === 'string' && MAP_CONTENT_LAYER_IDS.includes(value as MapContentLayerId);
}

function isTerrainFamily(value: unknown): value is CliffFamilyId {
  return (
    typeof value === "string" &&
    (TERRAIN_CLIFF_FAMILY_IDS as readonly string[]).includes(value)
    && TERRAIN_CLIFF_FAMILIES[value as CliffFamilyId].available
  );
}

function isSurfaceFamily(value: unknown): value is TerrainSurfaceFamilyId {
  return typeof value === 'string'
    && (TERRAIN_SURFACE_FAMILY_IDS as readonly string[]).includes(value);
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
  const stairWidth = candidate['stairWidth'] === undefined ? 2 : candidate['stairWidth'];
  const legacyActiveContentLayer = candidate['workspaceMode'] === 'terrain'
    || candidate['workspaceMode'] === 'biomes'
    ? 'terrain'
    : candidate['activeObjectLayer'];
  const activeContentLayer = candidate['activeContentLayer'] ?? legacyActiveContentLayer;
  if (
    candidate["version"] !== EDITOR_SESSION_VERSION ||
    !isFiniteNumber(candidate["cameraX"]) ||
    !isFiniteNumber(candidate["cameraY"]) ||
    !isFiniteNumber(candidate["worldZoom"]) ||
    candidate["worldZoom"] <= 0 ||
    selectedTile === undefined ||
    !isInteger(candidate["activeElevation"]) ||
    Math.abs(candidate["activeElevation"]) > TERRAIN_ELEVATION_LIMIT ||
    !isInteger(candidate['elevationDelta']) ||
    candidate['elevationDelta'] < 1 || candidate['elevationDelta'] > TERRAIN_ELEVATION_LIMIT ||
    !isInteger(stairWidth) || stairWidth < 2 || stairWidth > 4 ||
    !isEditorTool(candidate["tool"]) ||
    !isWorkspaceMode(candidate['workspaceMode']) ||
    !Array.isArray(candidate['hiddenContentLayers'])
    || candidate['hiddenContentLayers'].some((layer) =>
      typeof layer !== 'string' || !MAP_CONTENT_LAYER_IDS.includes(layer as MapContentLayerId))
    || !isContentLayer(activeContentLayer)
    || !isObjectLayer(candidate['activeObjectLayer'])
    || !(typeof candidate['selectedPrefabId'] === 'string' || candidate['selectedPrefabId'] === null)
    || typeof candidate['prefabCollection'] !== 'string'
    || !MAP_BIOME_IDS.includes(candidate['activeBiome'] as MapBiomeId)
    || !isInteger(candidate['scatterDensity'])
    || candidate['scatterDensity'] < 0 || candidate['scatterDensity'] > 10_000 ||
    !isTerrainFamily(candidate["terrainFamily"]) ||
    !isSurfaceFamily(candidate['surfaceFamily']) ||
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
    elevationDelta: candidate['elevationDelta'],
    stairWidth: stairWidth as 2 | 3 | 4,
    tool: candidate["tool"],
    workspaceMode: candidate['workspaceMode'],
    hiddenContentLayers: candidate['hiddenContentLayers'] as MapContentLayerId[],
    activeContentLayer,
    activeObjectLayer: candidate['activeObjectLayer'],
    selectedPrefabId: candidate['selectedPrefabId'],
    prefabCollection: candidate['prefabCollection'],
    activeBiome: candidate['activeBiome'] as MapBiomeId,
    scatterDensity: candidate['scatterDensity'],
    terrainFamily: candidate["terrainFamily"],
    surfaceFamily: candidate['surfaceFamily'],
    terrainFamilyOpen: candidate["terrainFamilyOpen"],
    edgeMode: candidate["edgeMode"],
    gridVisible: candidate["gridVisible"],
    heightVisible: candidate["heightVisible"],
    collisionVisible: candidate["collisionVisible"],
    leftUiScroll: candidate["leftUiScroll"],
    rightUiScroll: candidate["rightUiScroll"],
  };
}
