import {
  MAP_BIOME_IDS,
  MAP_CONTENT_LAYER_IDS,
  TERRAIN_ELEVATION_LIMIT,
  TERRAIN_SURFACE_FAMILY_IDS,
  type MapBiomeId,
  type MapContentLayerId,
  type TerrainSurfaceFamilyId,
} from '@orchard/sim';
import {
  MAP_TERRAIN_AUTHORING_MODES,
  type MapTerrainAuthoringMode,
} from './terrain-authoring-palette.js';
import {
  MAP_EDITOR_TERRAIN_TOOLS,
  MAP_EDITOR_AUTHORED_ANCHOR_KINDS,
  type MapEditorAuthoredAnchorKind,
  type MapEditorTerrainTool,
} from './editor-controller.js';
import {
  MAP_EDITOR_WORKSPACES,
  type MapEditorWorkspace,
} from './model.js';
import { EDITOR_ABSOLUTE_MIN_ZOOM, EDITOR_MAX_ZOOM } from './editor-viewport.js';
import {
  MAP_EDITOR_TRANSITION_KINDS,
  type MapEditorTransitionKind,
  type MapEditorTransitionWidth,
} from './transition-authoring.js';
import {
  MAP_OUTLINER_SESSION_VERSION,
  parseMapOutlinerTreeState,
  type MapOutlinerTreeState,
} from './outliner-tree.js';

const MAP_ROUTE_SESSION_VERSION = 1;
const MAX_PALETTE_QUERY_LENGTH = 80;

export type MapOutlinerView = 'palette' | 'world' | 'live';

const DEFAULT_AUTHORED_OUTLINER_STATE: MapOutlinerTreeState = Object.freeze({
  version: MAP_OUTLINER_SESSION_VERSION,
  query: '',
  expandedIds: Object.freeze(['space:0']),
  focusedId: 'space:0',
  selectedId: null,
});

export interface MapRouteSessionState {
  readonly version: typeof MAP_ROUTE_SESSION_VERSION;
  readonly camera: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  readonly workspace: MapEditorWorkspace;
  readonly terrainTool: MapEditorTerrainTool;
  readonly terrainPaletteMode: MapTerrainAuthoringMode;
  readonly selectedSurfaceFamily: TerrainSurfaceFamilyId;
  readonly selectedCliffFamily: string;
  readonly activeLayer: MapContentLayerId;
  readonly hiddenLayers: readonly MapContentLayerId[];
  readonly userLockedLayers: readonly MapContentLayerId[];
  readonly soloLayer: MapContentLayerId | null;
  readonly selectedPrefabId: string | null;
  readonly selectedAnchorKind: MapEditorAuthoredAnchorKind | null;
  readonly selectedBiome: MapBiomeId | null;
  readonly activeElevation: number;
  readonly heightOverlayVisible: boolean;
  readonly collisionOverlayVisible: boolean;
  readonly autoPublish: boolean;
  readonly outlinerView: MapOutlinerView;
  readonly authoredOutliner: MapOutlinerTreeState;
  readonly transitionKind: MapEditorTransitionKind;
  readonly transitionWidth: MapEditorTransitionWidth;
  readonly scatterDensity: number;
  readonly paletteQuery: string;
  readonly paletteOffset: number;
}

export interface MapRouteSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Runtime adapter kept deliberately free of canvas/model/controller classes so
 * the retained shell can bind a route without taking ownership of map logic. */
export interface MapRouteSessionTarget {
  snapshot(): Omit<MapRouteSessionState, 'version'>;
  restore(state: MapRouteSessionState): void;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isContentLayer(value: unknown): value is MapContentLayerId {
  return typeof value === 'string'
    && MAP_CONTENT_LAYER_IDS.includes(value as MapContentLayerId);
}

function isWorkspace(value: unknown): value is MapEditorWorkspace {
  return typeof value === 'string'
    && (MAP_EDITOR_WORKSPACES as readonly string[]).includes(value);
}

function isTerrainTool(value: unknown): value is MapEditorTerrainTool {
  return typeof value === 'string'
    && (MAP_EDITOR_TERRAIN_TOOLS as readonly string[]).includes(value);
}

function isTerrainPaletteMode(value: unknown): value is MapTerrainAuthoringMode {
  return typeof value === 'string'
    && (MAP_TERRAIN_AUTHORING_MODES as readonly string[]).includes(value);
}

function isSurfaceFamily(value: unknown): value is TerrainSurfaceFamilyId {
  return typeof value === 'string'
    && (TERRAIN_SURFACE_FAMILY_IDS as readonly string[]).includes(value);
}

function isCliffFamilyReference(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128
    && /^[a-z0-9][a-z0-9_-]*$/u.test(value);
}

function isBiome(value: unknown): value is MapBiomeId {
  return typeof value === 'string'
    && (MAP_BIOME_IDS as readonly string[]).includes(value);
}

function isTransitionKind(value: unknown): value is MapEditorTransitionKind {
  return typeof value === 'string'
    && (MAP_EDITOR_TRANSITION_KINDS as readonly string[]).includes(value);
}

/** Map view state is isolated by both canonical route and durable document id.
 * Encoding prevents slashes and punctuation in either identity from changing
 * the storage-key namespace. */
export function mapRouteSessionStorageKey(routePath: string, documentId: string): string {
  return `orchard.studio.map-route.v${MAP_ROUTE_SESSION_VERSION}`
    + `.${encodeURIComponent(JSON.stringify([routePath, documentId]))}`;
}

export function serializeMapRouteSessionState(state: MapRouteSessionState): string {
  return JSON.stringify(state);
}

export function parseMapRouteSessionState(source: string | null): MapRouteSessionState | null {
  if (source === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate['camera'] !== 'object' || candidate['camera'] === null) return null;
  const camera = candidate['camera'] as Record<string, unknown>;
  const hiddenLayers = candidate['hiddenLayers'];
  const userLockedLayers = candidate['userLockedLayers'] ?? [];
  const soloLayer = candidate['soloLayer'] ?? null;
  // Version-one route sessions predate mounted transition authoring and world
  // overlays. Keep the stable storage namespace and hydrate those controls.
  const transitionKind = candidate['transitionKind'] ?? 'slope';
  const transitionWidth = candidate['transitionWidth'] ?? 2;
  const heightOverlayVisible = candidate['heightOverlayVisible'] ?? false;
  const collisionOverlayVisible = candidate['collisionOverlayVisible'] ?? false;
  const autoPublish = candidate['autoPublish'] ?? false;
  const outlinerView = candidate['outlinerView'] ?? 'palette';
  const authoredOutliner = candidate['authoredOutliner'] === undefined
    ? DEFAULT_AUTHORED_OUTLINER_STATE
    : parseMapOutlinerTreeState(candidate['authoredOutliner']);
  const selectedAnchorKind = candidate['selectedAnchorKind'] ?? null;
  const terrainPaletteMode = candidate['terrainPaletteMode'] ?? 'brush';
  const selectedSurfaceFamily = candidate['selectedSurfaceFamily'] ?? 'grass_1';
  const selectedCliffFamily = candidate['selectedCliffFamily'] ?? 'stone_1';
  if (
    candidate['version'] !== MAP_ROUTE_SESSION_VERSION
    || !isFiniteNumber(camera['x'])
    || !isFiniteNumber(camera['y'])
    || !isFiniteNumber(camera['zoom'])
    || camera['zoom'] < EDITOR_ABSOLUTE_MIN_ZOOM
    || camera['zoom'] > EDITOR_MAX_ZOOM
    || !isWorkspace(candidate['workspace'])
    || !isTerrainTool(candidate['terrainTool'])
    || !isTerrainPaletteMode(terrainPaletteMode)
    || !isSurfaceFamily(selectedSurfaceFamily)
    || !isCliffFamilyReference(selectedCliffFamily)
    || !isContentLayer(candidate['activeLayer'])
    || !Array.isArray(hiddenLayers)
    || hiddenLayers.some((layer) => !isContentLayer(layer))
    || new Set(hiddenLayers).size !== hiddenLayers.length
    || !Array.isArray(userLockedLayers)
    || userLockedLayers.some((layer) => !isContentLayer(layer)
      || layer === 'generated_base' || layer === 'player_owned')
    || new Set(userLockedLayers).size !== userLockedLayers.length
    || !(soloLayer === null || (isContentLayer(soloLayer)
      && soloLayer !== 'generated_base' && soloLayer !== 'player_owned'))
    || !(candidate['selectedPrefabId'] === null
      || (typeof candidate['selectedPrefabId'] === 'string'
        && candidate['selectedPrefabId'].length <= 256))
    || !(selectedAnchorKind === null
      || (typeof selectedAnchorKind === 'string'
        && MAP_EDITOR_AUTHORED_ANCHOR_KINDS.includes(selectedAnchorKind as MapEditorAuthoredAnchorKind)))
    || !(candidate['selectedBiome'] === null || isBiome(candidate['selectedBiome']))
    || (candidate['selectedPrefabId'] !== null && candidate['selectedBiome'] !== null)
    || ((candidate['selectedPrefabId'] !== null || candidate['selectedBiome'] !== null
      || selectedAnchorKind !== null)
      && ((hiddenLayers as readonly unknown[]).includes(candidate['activeLayer'])
        || (userLockedLayers as readonly unknown[]).includes(candidate['activeLayer'])
        || (soloLayer !== null && soloLayer !== candidate['activeLayer'])))
    || (selectedAnchorKind !== null
      && (candidate['selectedPrefabId'] !== null || candidate['selectedBiome'] !== null
        || candidate['workspace'] !== 'objects' || candidate['activeLayer'] !== 'anchors'
        || (hiddenLayers as readonly unknown[]).includes('anchors')))
    || (candidate['selectedPrefabId'] !== null
      && candidate['workspace'] !== 'objects' && candidate['workspace'] !== 'scatter')
    || (candidate['selectedBiome'] !== null
      && (candidate['workspace'] !== 'biomes' || candidate['activeLayer'] !== 'terrain'))
    || !isInteger(candidate['activeElevation'])
    || Math.abs(candidate['activeElevation']) > TERRAIN_ELEVATION_LIMIT
    || typeof heightOverlayVisible !== 'boolean'
    || typeof collisionOverlayVisible !== 'boolean'
    || typeof autoPublish !== 'boolean'
    || !(outlinerView === 'palette' || outlinerView === 'world' || outlinerView === 'live')
    || authoredOutliner === null
    || !isTransitionKind(transitionKind)
    || !isInteger(transitionWidth)
    || transitionWidth < 2
    || transitionWidth > 4
    || !isInteger(candidate['scatterDensity'])
    || candidate['scatterDensity'] < 0
    || candidate['scatterDensity'] > 10_000
    || typeof candidate['paletteQuery'] !== 'string'
    || candidate['paletteQuery'].length > MAX_PALETTE_QUERY_LENGTH
    || !isInteger(candidate['paletteOffset'])
    || candidate['paletteOffset'] < 0
  ) return null;

  return Object.freeze({
    version: MAP_ROUTE_SESSION_VERSION,
    camera: Object.freeze({ x: camera['x'], y: camera['y'], zoom: camera['zoom'] }),
    workspace: candidate['workspace'],
    terrainTool: candidate['terrainTool'],
    terrainPaletteMode,
    selectedSurfaceFamily,
    selectedCliffFamily,
    activeLayer: candidate['activeLayer'],
    hiddenLayers: Object.freeze([...(hiddenLayers as MapContentLayerId[])]),
    userLockedLayers: Object.freeze([...(userLockedLayers as MapContentLayerId[])]),
    soloLayer: soloLayer as MapContentLayerId | null,
    selectedPrefabId: candidate['selectedPrefabId'],
    selectedAnchorKind: selectedAnchorKind as MapEditorAuthoredAnchorKind | null,
    selectedBiome: candidate['selectedBiome'],
    activeElevation: candidate['activeElevation'],
    heightOverlayVisible,
    collisionOverlayVisible,
    autoPublish,
    outlinerView,
    authoredOutliner,
    transitionKind,
    transitionWidth: transitionWidth as MapEditorTransitionWidth,
    scatterDensity: candidate['scatterDensity'],
    paletteQuery: candidate['paletteQuery'],
    paletteOffset: candidate['paletteOffset'],
  });
}

/** Small fail-soft persistence boundary. Saving the same snapshot repeatedly is
 * cheap because render-driven callers only write when the serialized value
 * changes. Storage denial/quota failures never make the editor unusable. */
export class MapRouteSessionStore {
  readonly #key: string;
  #lastSource: string | null = null;

  constructor(
    routePath: string,
    documentId: string,
    private readonly storage: MapRouteSessionStorage | null = browserMapRouteSessionStorage(),
  ) {
    this.#key = mapRouteSessionStorageKey(routePath, documentId);
  }

  restore(): MapRouteSessionState | null {
    if (this.storage === null) return null;
    try {
      const source = this.storage.getItem(this.#key);
      const parsed = parseMapRouteSessionState(source);
      this.#lastSource = parsed === null ? null : source;
      return parsed;
    } catch {
      return null;
    }
  }

  save(state: MapRouteSessionState): boolean {
    if (this.storage === null) return false;
    const source = serializeMapRouteSessionState(state);
    if (source === this.#lastSource) return false;
    try {
      this.storage.setItem(this.#key, source);
      this.#lastSource = source;
      return true;
    } catch {
      return false;
    }
  }
}

function browserMapRouteSessionStorage(): MapRouteSessionStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Couples the validated store to retained map state. Invalid/stale storage and
 * content-dependent restore failures are treated as a cache miss; the route can
 * still initialize from its canonical document defaults. */
export class MapRouteSessionBinding {
  constructor(
    private readonly store: MapRouteSessionStore,
    private readonly target: MapRouteSessionTarget,
  ) {}

  restore(): boolean {
    const state = this.store.restore();
    if (state === null) return false;
    try {
      this.target.restore(state);
      return true;
    } catch {
      return false;
    }
  }

  persist(): boolean {
    return this.store.save(mapRouteSessionState(this.target.snapshot()));
  }
}

export function mapRouteSessionState(
  state: Omit<MapRouteSessionState, 'version' | 'transitionKind' | 'transitionWidth'
    | 'heightOverlayVisible' | 'collisionOverlayVisible' | 'selectedAnchorKind'
    | 'autoPublish'
    | 'outlinerView' | 'authoredOutliner'
    | 'terrainPaletteMode' | 'selectedSurfaceFamily' | 'selectedCliffFamily'
    | 'userLockedLayers' | 'soloLayer'>
    & Partial<Pick<MapRouteSessionState, 'transitionKind' | 'transitionWidth'
      | 'heightOverlayVisible' | 'collisionOverlayVisible' | 'selectedAnchorKind'
      | 'autoPublish'
      | 'outlinerView' | 'authoredOutliner'
      | 'terrainPaletteMode' | 'selectedSurfaceFamily' | 'selectedCliffFamily'
      | 'userLockedLayers' | 'soloLayer'>>,
): MapRouteSessionState {
  return {
    version: MAP_ROUTE_SESSION_VERSION,
    ...state,
    transitionKind: state.transitionKind ?? 'slope',
    transitionWidth: state.transitionWidth ?? 2,
    heightOverlayVisible: state.heightOverlayVisible ?? false,
    collisionOverlayVisible: state.collisionOverlayVisible ?? false,
    autoPublish: state.autoPublish ?? false,
    outlinerView: state.outlinerView ?? 'palette',
    authoredOutliner: state.authoredOutliner ?? DEFAULT_AUTHORED_OUTLINER_STATE,
    selectedAnchorKind: state.selectedAnchorKind ?? null,
    terrainPaletteMode: state.terrainPaletteMode ?? 'brush',
    selectedSurfaceFamily: state.selectedSurfaceFamily ?? 'grass_1',
    selectedCliffFamily: state.selectedCliffFamily ?? 'stone_1',
    userLockedLayers: state.userLockedLayers ?? [],
    soloLayer: state.soloLayer ?? null,
  };
}
