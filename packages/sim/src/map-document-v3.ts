import { parseCombatRegions, type CombatRegion } from './combat-regions.js';
import { MAP_BIOME_IDS, type MapBiomeId } from './biomes.js';
import {
  mapCellKey,
  normalizeMapDocument,
  parseMapDocument,
  resolvedMapCellAt,
  serializeMapDocument,
  type MapCellOverride,
  type MapDocumentV2,
  type MapSurfaceKind,
  MAP_DOCUMENT_SCHEMA_VERSION,
  SURVIVAL_ISLAND_MAP_GENERATOR,
  mapDocumentUsesSurvivalIslandBase,
  mapGameplayAnchorIdValid,
  parseMapGameplayAnchor,
  type MapGameplayAnchor,
} from './map-document.js';
import {
  applyMapEdit,
  type AppliedMapEdit,
  type MapEditCommand,
  type MapPoint,
} from './map-editing.js';
import {
  normalizeMapPrefab,
  parseMapPrefabDocument,
  serializeMapPrefabDocument,
  transformMapPrefabCollisionMask,
  type MapPrefabDocumentV2,
} from './map-prefab.js';
import {
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  SURVIVAL_WORLD_VERSION,
  generateSurvivalLandmarkDecorations,
  survivalAuthoredLandmarkDecorations,
  survivalDecorationObstacle,
  survivalBiomeAt,
  survivalTerrainTransitions,
  type GeneratedSurvivalDecoration,
  type SurvivalLandmarkRegistry,
} from './survival-world.js';
import type { LandmarkDecorationRole, SpaceLandmarkDefinition } from './content/world-definition.js';
import { TILE_SIZE_FIXED, type CollisionObstacle, type MovementMedium } from './state.js';
import { floorDiv, floorMod } from './world-coordinates.js';

export const MAP_DOCUMENT_V3_SCHEMA_VERSION = 3 as const;
export const LIVE_ISLAND_MAP_ID = 'live-island' as const;

export const MAP_CONTENT_LAYER_IDS = [
  'generated_base',
  'terrain',
  'ground',
  'objects',
  'gameplay',
  'player_owned',
  'canopy',
  'anchors',
] as const;
export type MapContentLayerId = typeof MAP_CONTENT_LAYER_IDS[number];

export interface MapContentLayerDefinition {
  readonly id: MapContentLayerId;
  readonly label: string;
  readonly order: number;
  readonly editable: boolean;
}

export const DEFAULT_MAP_CONTENT_LAYERS: readonly MapContentLayerDefinition[] = [
  { id: 'generated_base', label: 'Generated Base', order: 0, editable: false },
  { id: 'terrain', label: 'Terrain Overrides', order: 10, editable: true },
  { id: 'ground', label: 'Ground Details', order: 20, editable: true },
  { id: 'objects', label: 'World Objects', order: 30, editable: true },
  { id: 'gameplay', label: 'Gameplay Objects', order: 40, editable: true },
  { id: 'player_owned', label: 'Player-Owned Objects', order: 45, editable: false },
  { id: 'canopy', label: 'Canopy / Foreground', order: 50, editable: true },
  { id: 'anchors', label: 'Anchors and Zones', order: 60, editable: true },
];

export type MapObjectLayer = 'ground' | 'objects' | 'gameplay' | 'canopy';

export interface MapObjectInstance {
  readonly id: string;
  readonly prefabId: string;
  readonly prefabRevision: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly layer: MapObjectLayer;
  readonly quarterTurns: 0 | 1 | 2 | 3;
  readonly flipX: boolean;
  /** Integer world scale around the prefab pivot. One is omitted in canonical
   * JSON for compatibility with documents authored before scaling existed. */
  readonly scale?: 1 | 2;
  readonly enabled: boolean;
}

/** A persisted instance from one of the hand-authored named locations. Its
 * special decoration renderer is retained, but placement is ordinary map
 * content rather than seeded generation. */
export interface MapLandmarkInstance {
  readonly id: string;
  readonly sourceDecorationId: number;
  readonly groupId: string;
  readonly groupLabel: string;
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly elevation: number;
  readonly layer: MapObjectLayer;
  readonly variant: number;
  readonly animationOffset: number;
  readonly role?: LandmarkDecorationRole;
  readonly quarterTurns: 0 | 1 | 2 | 3;
  readonly flipX: boolean;
  readonly scale?: 1 | 2;
  readonly enabled: boolean;
}

export interface MapDocumentV3CellOverride extends MapCellOverride {
  /** Explicit semantic biome; absence inherits from the pinned base. */
  readonly biome?: MapBiomeId;
}

export interface MapDocumentV3 extends Omit<MapDocumentV2, 'schemaVersion' | 'cells'> {
  readonly schemaVersion: typeof MAP_DOCUMENT_V3_SCHEMA_VERSION;
  readonly baseBiome: MapBiomeId;
  readonly cells: Readonly<Record<string, MapDocumentV3CellOverride>>;
  readonly layers: readonly MapContentLayerDefinition[];
  readonly prefabs: readonly MapPrefabDocumentV2[];
  readonly objects: readonly MapObjectInstance[];
  readonly landmarks: readonly MapLandmarkInstance[];
  readonly generatedSuppressions: readonly string[];
  /** Authored authority policy; absent on historical maps means peaceful. */
  readonly combatRegions?: readonly CombatRegion[];
}

export type AuthoredMapContentKind = 'landmark' | 'object';

const contentLayerRanks = new WeakMap<MapDocumentV3, ReadonlyMap<MapContentLayerId, number>>();

/** Zero-based back-to-front rank from the document's persisted layer stack.
 * Runtime drawing and editor hit testing use this only as the final tie-break
 * after elevation and foot-Y; it is deliberately not a global z-index. */
export function mapContentLayerRank(
  document: MapDocumentV3,
  layer: MapContentLayerId,
): number {
  let ranks = contentLayerRanks.get(document);
  if (ranks === undefined) {
    ranks = new Map([...document.layers]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map(({ id }, index) => [id, index] as const));
    contentLayerRanks.set(document, ranks);
  }
  return ranks.get(layer) ?? -1;
}

/** Stable shared final-tie key for persisted authored content. Keeping the
 * `live-map` namespace preserves its existing relationship with dynamic
 * player/NPC/placeable ties while allowing layer reorder within equal depth. */
export function authoredMapContentPainterTie(
  document: MapDocumentV3,
  layer: MapObjectLayer,
  kind: AuthoredMapContentKind,
  id: string,
  partId?: string,
): string {
  const rank = String(Math.max(0, mapContentLayerRank(document, layer))).padStart(2, '0');
  return `live-map:${rank}:${kind}:${id}${partId === undefined ? '' : `:${partId}`}`;
}

const INSTANCE_ID = /^[a-z0-9][a-z0-9_-]{0,95}$/u;
const PREFAB_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
export const MAP_OBJECT_LAYER_IDS: readonly MapObjectLayer[] = [
  'ground', 'objects', 'gameplay', 'canopy',
];

export function isMapObjectLayer(layer: MapContentLayerId): layer is MapObjectLayer {
  return MAP_OBJECT_LAYER_IDS.includes(layer as MapObjectLayer);
}

export function createSurvivalAuthoredLandmarkInstances(
  landmarks?: readonly SpaceLandmarkDefinition[],
): readonly MapLandmarkInstance[] {
  const decorations = landmarks === undefined
    ? survivalAuthoredLandmarkDecorations()
    : generateSurvivalLandmarkDecorations(landmarks);
  return decorations.map((decoration) => ({
    id: `landmark-${decoration.id}`,
    sourceDecorationId: decoration.id,
    groupId: decoration.groupId,
    groupLabel: decoration.groupLabel,
    kind: decoration.kind,
    tileX: decoration.tileX,
    tileY: decoration.tileY,
    elevation: 0,
    layer: decoration.layer ?? 'objects',
    variant: decoration.variant,
    animationOffset: decoration.animationOffset,
    ...(decoration.role === undefined ? {} : { role: decoration.role }),
    quarterTurns: 0,
    flipX: false,
    enabled: true,
  }));
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= minimum && value <= maximum;
}

export function defaultBiomeForSurface(surface: MapSurfaceKind): MapBiomeId {
  if (surface === 'water') return 'freshwater';
  if (surface === 'sand') return 'beach';
  if (surface === 'stone' || surface === 'cave_floor') return 'highland';
  if (surface === 'dirt') return 'dirt_terrace';
  return 'plains';
}

export function terrainDocumentForMapV3(document: MapDocumentV3): MapDocumentV2 {
  const cells = Object.fromEntries(Object.entries(document.cells).map(([key, cell]) => {
    const terrain = { ...cell };
    delete (terrain as { biome?: MapBiomeId }).biome;
    return [key, terrain] as const;
  }));
  return normalizeMapDocument({
    ...document,
    schemaVersion: 2,
    cells,
  });
}

export function migrateMapDocumentV2(
  document: MapDocumentV2,
  landmarks?: readonly SpaceLandmarkDefinition[],
): MapDocumentV3 {
  return normalizeMapDocumentV3({
    ...document,
    schemaVersion: MAP_DOCUMENT_V3_SCHEMA_VERSION,
    baseBiome: defaultBiomeForSurface(document.baseSurface),
    cells: document.cells,
    layers: DEFAULT_MAP_CONTENT_LAYERS,
    prefabs: [],
    objects: [],
    landmarks: document.id === LIVE_ISLAND_MAP_ID
      ? createSurvivalAuthoredLandmarkInstances(landmarks) : [],
    generatedSuppressions: [],
  });
}

export function resolvedMapBiomeAt(
  document: MapDocumentV3,
  tileX: number,
  tileY: number,
): MapBiomeId {
  const authored = document.cells[mapCellKey(tileX, tileY)]?.biome;
  if (authored !== undefined) return authored;
  if (mapDocumentUsesSurvivalIslandBase(document)) {
    return survivalBiomeAt(
      document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED,
      tileX,
      tileY,
    );
  }
  return document.baseBiome;
}

/** Sparse authoring overlay for the current production island. Generated
 * terrain stays implicit; only authored differences are serialized. */
export function createLiveIslandMapDocument(options: {
  readonly seed?: number;
  readonly generatorVersion?: number;
  readonly landmarks?: readonly SpaceLandmarkDefinition[];
} = {}): MapDocumentV3 {
  const seed = options.seed ?? SURVIVAL_WORLD_SEED;
  const generatorVersion = options.generatorVersion ?? SURVIVAL_WORLD_VERSION;
  return migrateMapDocumentV2({
    schemaVersion: MAP_DOCUMENT_SCHEMA_VERSION,
    id: LIVE_ISLAND_MAP_ID,
    title: 'Live Island',
    width: SURVIVAL_WORLD_SIZE,
    height: SURVIVAL_WORLD_SIZE,
    tileSize: 16,
    themeId: 'orchard_stone',
    baseElevation: 0,
    baseSurface: 'grass',
    defaultCliffFamily: 'stone_1',
    defaultSurfaceFamily: 'grass_1',
    revision: 0,
    cells: {},
    transitions: survivalTerrainTransitions(seed),
    stairRuns: [],
    scenery: [],
    anchors: [],
    provenance: {
      kind: 'generated',
      source: LIVE_ISLAND_MAP_ID,
      generator: SURVIVAL_ISLAND_MAP_GENERATOR,
      generatorSeed: seed,
      generatorVersion,
    },
  }, options.landmarks);
}

function parseObjectInstance(value: unknown, width: number, height: number): MapObjectInstance | null {
  const candidate = record(value);
  if (candidate === null
    || typeof candidate['id'] !== 'string' || !INSTANCE_ID.test(candidate['id'])
    || typeof candidate['prefabId'] !== 'string' || !PREFAB_ID.test(candidate['prefabId'])
    || !integerInRange(candidate['prefabRevision'], 0, 0x7fff_ffff)
    || !integerInRange(candidate['tileX'], 0, width - 1)
    || !integerInRange(candidate['tileY'], 0, height - 1)
    || !integerInRange(candidate['elevation'], -32, 32)
    || !MAP_OBJECT_LAYER_IDS.includes(candidate['layer'] as MapObjectLayer)
    || !integerInRange(candidate['quarterTurns'], 0, 3)
    || typeof candidate['flipX'] !== 'boolean'
    || !(candidate['scale'] === undefined || candidate['scale'] === 1 || candidate['scale'] === 2)
    || typeof candidate['enabled'] !== 'boolean') return null;
  return {
    id: candidate['id'],
    prefabId: candidate['prefabId'],
    prefabRevision: candidate['prefabRevision'],
    tileX: candidate['tileX'],
    tileY: candidate['tileY'],
    elevation: candidate['elevation'],
    layer: candidate['layer'] as MapObjectLayer,
    quarterTurns: candidate['quarterTurns'] as 0 | 1 | 2 | 3,
    flipX: candidate['flipX'],
    ...(candidate['scale'] === 2 ? { scale: 2 as const } : {}),
    enabled: candidate['enabled'],
  };
}

function parseLandmarkInstance(value: unknown, width: number, height: number): MapLandmarkInstance | null {
  const candidate = record(value);
  if (candidate === null
    || typeof candidate['id'] !== 'string' || !INSTANCE_ID.test(candidate['id'])
    || !integerInRange(candidate['sourceDecorationId'], 0, Number.MAX_SAFE_INTEGER)
    || typeof candidate['groupId'] !== 'string' || !INSTANCE_ID.test(candidate['groupId'])
    || typeof candidate['groupLabel'] !== 'string' || candidate['groupLabel'].length < 1 || candidate['groupLabel'].length > 64
    || typeof candidate['kind'] !== 'string' || !INSTANCE_ID.test(candidate['kind'])
    || !integerInRange(candidate['tileX'], 0, width - 1)
    || !integerInRange(candidate['tileY'], 0, height - 1)
    || !integerInRange(candidate['elevation'], -32, 32)
    || !MAP_OBJECT_LAYER_IDS.includes(candidate['layer'] as MapObjectLayer)
    || !integerInRange(candidate['variant'], 0, 255)
    || !integerInRange(candidate['animationOffset'], 0, 0x7fff_ffff)
    || !(candidate['role'] === undefined || candidate['role'] === 'soil.watered')
    || !integerInRange(candidate['quarterTurns'], 0, 3)
    || typeof candidate['flipX'] !== 'boolean'
    || !(candidate['scale'] === undefined || candidate['scale'] === 1 || candidate['scale'] === 2)
    || typeof candidate['enabled'] !== 'boolean') return null;
  return {
    id: candidate['id'],
    sourceDecorationId: candidate['sourceDecorationId'],
    groupId: candidate['groupId'] as string,
    groupLabel: candidate['groupLabel'],
    kind: candidate['kind'],
    tileX: candidate['tileX'], tileY: candidate['tileY'], elevation: candidate['elevation'],
    layer: candidate['layer'] as MapObjectLayer,
    variant: candidate['variant'], animationOffset: candidate['animationOffset'],
    ...(candidate['role'] === undefined ? {} : { role: candidate['role'] as LandmarkDecorationRole }),
    quarterTurns: candidate['quarterTurns'] as 0 | 1 | 2 | 3,
    flipX: candidate['flipX'],
    ...(candidate['scale'] === 2 ? { scale: 2 as const } : {}),
    enabled: candidate['enabled'],
  };
}

function parseLayer(value: unknown): MapContentLayerDefinition | null {
  const candidate = record(value);
  if (candidate === null
    || !MAP_CONTENT_LAYER_IDS.includes(candidate['id'] as MapContentLayerId)
    || typeof candidate['label'] !== 'string'
    || candidate['label'].length < 1 || candidate['label'].length > 48
    || !integerInRange(candidate['order'], 0, 1_000)
    || typeof candidate['editable'] !== 'boolean') return null;
  return {
    id: candidate['id'] as MapContentLayerId,
    label: candidate['label'],
    order: candidate['order'],
    editable: candidate['editable'],
  };
}

export function normalizeMapDocumentV3(document: MapDocumentV3): MapDocumentV3 {
  const terrain = normalizeMapDocument(terrainDocumentForMapV3Unnormalized(document));
  const cells = Object.fromEntries(Object.entries(document.cells)
    .map(([key, cell]) => [key, {
      ...(terrain.cells[key] ?? {}),
      ...(cell.biome === undefined || (!mapDocumentUsesSurvivalIslandBase(document) && cell.biome === document.baseBiome) ? {} : { biome: cell.biome }),
    }] as const)
    .filter(([, cell]) => Object.keys(cell).length > 0)
    .sort(([left], [right]) => left.localeCompare(right)));
  const suppliedLayers = new Map(document.layers.map((layer) => [layer.id, layer] as const));
  const layers = DEFAULT_MAP_CONTENT_LAYERS.map((fallback) => suppliedLayers.get(fallback.id) ?? fallback);
  return {
    ...document,
    ...terrain,
    schemaVersion: MAP_DOCUMENT_V3_SCHEMA_VERSION,
    cells,
    layers: layers.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
    prefabs: [...document.prefabs].map(normalizeMapPrefab).sort((left, right) => left.id.localeCompare(right.id)),
    objects: [...document.objects].sort((left, right) => (
      left.layer.localeCompare(right.layer) || left.elevation - right.elevation
      || left.tileY - right.tileY || left.tileX - right.tileX || left.id.localeCompare(right.id)
    )),
    landmarks: [...(document.landmarks ?? [])].sort((left, right) => (
      left.layer.localeCompare(right.layer) || left.elevation - right.elevation
      || left.tileY - right.tileY || left.tileX - right.tileX || left.id.localeCompare(right.id)
    )),
    generatedSuppressions: [...new Set(document.generatedSuppressions)].sort(),
    ...(document.combatRegions === undefined ? {} : {combatRegions:parseCombatRegions(document.combatRegions,document.width,document.height)}),
  };
}

/** Internal conversion used while normalization is already in progress. */
function terrainDocumentForMapV3Unnormalized(document: MapDocumentV3): MapDocumentV2 {
  const cells = Object.fromEntries(Object.entries(document.cells).map(([key, cell]) => {
    const terrain = { ...cell };
    delete (terrain as { biome?: MapBiomeId }).biome;
    return [key, terrain] as const;
  }));
  return { ...document, schemaVersion: 2, cells };
}

export function serializeMapDocumentV3(document: MapDocumentV3): string {
  return `${JSON.stringify(normalizeMapDocumentV3(document), null, 2)}\n`;
}

/** Publication payload omits presentation whitespace; canonical hashes and exports stay unchanged. */
export function serializeMapDocumentV3ForTransport(document: MapDocumentV3): string {
  return JSON.stringify(normalizeMapDocumentV3(document));
}

export function parseMapDocumentV3(
  source: string,
  authoredLandmarks?: readonly SpaceLandmarkDefinition[],
): MapDocumentV3 {
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new SyntaxError('Map document is not valid JSON'); }
  const candidate = record(value);
  if (candidate === null) throw new TypeError('Map document must be an object');
  if (candidate['schemaVersion'] === 2) {
    return migrateMapDocumentV2(parseMapDocument(source), authoredLandmarks);
  }
  if (candidate['schemaVersion'] !== MAP_DOCUMENT_V3_SCHEMA_VERSION
    || !MAP_BIOME_IDS.includes(candidate['baseBiome'] as MapBiomeId)
    || !Array.isArray(candidate['layers'])
    || !Array.isArray(candidate['prefabs'])
    || !Array.isArray(candidate['objects'])
    || !(candidate['landmarks'] === undefined || Array.isArray(candidate['landmarks']))
    || !Array.isArray(candidate['generatedSuppressions'])
    || candidate['generatedSuppressions'].some((id) => typeof id !== 'string' || !INSTANCE_ID.test(id))) {
    throw new TypeError('Map V3 layers are invalid');
  }
  const terrainSource = JSON.stringify({
    ...candidate,
    schemaVersion: 2,
    cells: Object.fromEntries(Object.entries(record(candidate['cells']) ?? {}).map(([key, value]) => {
      const cell = record(value);
      if (cell === null) return [key, value];
      const terrain = { ...cell };
      delete terrain['biome'];
      return [key, terrain];
    })),
  });
  const terrain = parseMapDocument(terrainSource);
  const sourceCells = record(candidate['cells']);
  if (sourceCells === null) throw new TypeError('Map V3 cells are invalid');
  const cells: Record<string, MapDocumentV3CellOverride> = {};
  for (const [key, value] of Object.entries(sourceCells)) {
    const cell = record(value);
    if (cell === null
      || !(cell['biome'] === undefined || MAP_BIOME_IDS.includes(cell['biome'] as MapBiomeId))) {
      throw new TypeError('Map V3 biome override is invalid');
    }
    cells[key] = {
      ...(terrain.cells[key] ?? {}),
      ...(cell['biome'] === undefined ? {} : { biome: cell['biome'] as MapBiomeId }),
    };
  }
  const layers = candidate['layers'].map(parseLayer);
  const objects = candidate['objects'].map((object) => parseObjectInstance(object, terrain.width, terrain.height));
  const legacyLandmarkSuppressions = new Set(candidate['generatedSuppressions'] as string[]);
  const landmarkSource = candidate['landmarks'] === undefined && terrain.id === LIVE_ISLAND_MAP_ID
    ? createSurvivalAuthoredLandmarkInstances(authoredLandmarks).map((landmark) => ({
        ...landmark,
        enabled: !legacyLandmarkSuppressions.has(`decoration-${landmark.sourceDecorationId}`),
      }))
    : (candidate['landmarks'] ?? []);
  const landmarks = (landmarkSource as unknown[])
    .map((landmark) => parseLandmarkInstance(landmark, terrain.width, terrain.height))
    .map((landmark) => landmark === null
      || !legacyLandmarkSuppressions.has(`decoration-${landmark.sourceDecorationId}`)
      ? landmark : { ...landmark, enabled: false });
  const authoredRoles = terrain.id === LIVE_ISLAND_MAP_ID
    ? new Map<number, LandmarkDecorationRole | undefined>(
        createSurvivalAuthoredLandmarkInstances(authoredLandmarks)
          .map((landmark) => [landmark.sourceDecorationId, landmark.role] as const),
      )
    : new Map<number, LandmarkDecorationRole>();
  const hydratedLandmarks = landmarks.map((landmark) => {
    if (landmark === null || !authoredRoles.has(landmark.sourceDecorationId)) return landmark;
    const role = authoredRoles.get(landmark.sourceDecorationId);
    const projected = { ...landmark };
    if (role === undefined) delete projected.role;
    else projected.role = role;
    return projected;
  });
  const prefabs = candidate['prefabs'].map((prefab) => (
    parseMapPrefabDocument(JSON.stringify(prefab))
  ));
  if (layers.some((layer) => layer === null) || objects.some((object) => object === null)
    || hydratedLandmarks.some((landmark) => landmark === null)) {
    throw new TypeError('Map V3 content is invalid');
  }
  const layerIds = layers.map((layer) => layer!.id);
  const objectIds = objects.map((object) => object!.id);
  const landmarkIds = hydratedLandmarks.map((landmark) => landmark!.id);
  const anchorIds = terrain.anchors.map((anchor) => anchor.id);
  const prefabIds = prefabs.map((prefab) => prefab.id);
  if (new Set(layerIds).size !== layerIds.length
    || new Set(objectIds).size !== objectIds.length
    || new Set(landmarkIds).size !== landmarkIds.length
    || new Set([...objectIds, ...landmarkIds, ...anchorIds]).size
      !== objectIds.length + landmarkIds.length + anchorIds.length
    || new Set(prefabIds).size !== prefabIds.length
    || objects.some((object) => !prefabIds.includes(object!.prefabId))) {
    throw new TypeError('Map V3 ids and prefab references must be unique and complete');
  }
  return normalizeMapDocumentV3({
    ...terrain,
    schemaVersion: MAP_DOCUMENT_V3_SCHEMA_VERSION,
    baseBiome: candidate['baseBiome'] as MapBiomeId,
    ...(candidate['combatRegions'] === undefined ? {} : {combatRegions:parseCombatRegions(candidate['combatRegions'],terrain.width,terrain.height)}),
    cells,
    layers: layers as MapContentLayerDefinition[],
    prefabs,
    objects: objects as MapObjectInstance[],
    landmarks: hydratedLandmarks as MapLandmarkInstance[],
    generatedSuppressions: (candidate['generatedSuppressions'] as string[]).filter((id) => (
      !hydratedLandmarks.some((landmark) => id === `decoration-${landmark!.sourceDecorationId}`)
    )),
  });
}

export function mapDocumentV3Hash(document: MapDocumentV3): string {
  let hash = 2_166_136_261;
  for (const character of serializeMapDocumentV3(document)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export type MapDocumentV3EditCommand =
  | { readonly kind: 'terrain'; readonly command: MapEditCommand; readonly biome?: MapBiomeId }
  | { readonly kind: 'paint_biome'; readonly points: readonly MapPoint[]; readonly biome: MapBiomeId }
  | { readonly kind: 'embed_prefab'; readonly prefab: MapPrefabDocumentV2 }
  | { readonly kind: 'place_object'; readonly object: MapObjectInstance }
  | {
      readonly kind: 'place_objects';
      readonly objects: readonly MapObjectInstance[];
      readonly replaceObjectIds?: readonly string[];
    }
  | { readonly kind: 'remove_object'; readonly objectId: string }
  | {
      readonly kind: 'move_object'; readonly objectId: string;
      readonly tileX: number; readonly tileY: number; readonly elevation?: number;
    }
  | { readonly kind: 'place_landmark'; readonly landmark: MapLandmarkInstance }
  | { readonly kind: 'remove_landmark'; readonly landmarkId: string }
  | {
      readonly kind: 'move_landmark'; readonly landmarkId: string;
      readonly tileX: number; readonly tileY: number; readonly elevation?: number;
    }
  | { readonly kind: 'place_anchor'; readonly anchor: MapGameplayAnchor }
  | { readonly kind: 'remove_anchor'; readonly anchorId: string }
  | {
      readonly kind: 'move_anchor'; readonly anchorId: string;
      readonly tileX: number; readonly tileY: number; readonly elevation: number;
    }
  | { readonly kind: 'update_anchor_label'; readonly anchorId: string; readonly label: string }
  | { readonly kind: 'suppress_generated_object'; readonly generatedId: string; readonly suppressed: boolean };

export interface AppliedMapDocumentV3Edit {
  readonly document: MapDocumentV3;
  readonly changed: readonly MapPoint[];
  readonly fullRebuild?: boolean;
}

function mergeTerrainEdit(document: MapDocumentV3, edit: AppliedMapEdit): MapDocumentV3 {
  const cells = Object.fromEntries(Object.entries(edit.document.cells).map(([key, cell]) => [key, {
    ...cell,
    ...(document.cells[key]?.biome === undefined ? {} : { biome: document.cells[key]!.biome }),
  }] as const));
  for (const [key, cell] of Object.entries(document.cells)) {
    if (cell.biome !== undefined && cells[key] === undefined) cells[key] = { biome: cell.biome };
  }
  return normalizeMapDocumentV3({
    ...document,
    ...edit.document,
    schemaVersion: MAP_DOCUMENT_V3_SCHEMA_VERSION,
    cells,
  });
}

export function applyMapDocumentV3Edit(
  document: MapDocumentV3,
  command: MapDocumentV3EditCommand,
): AppliedMapDocumentV3Edit {
  if (command.kind === 'terrain') {
    const terrain = terrainDocumentForMapV3(document);
    const edit = applyMapEdit(terrain, command.command);
    let next = edit.document === terrain ? document : mergeTerrainEdit(document, edit);
    const changed = new Map(edit.changed.map(point => [mapCellKey(point.tileX, point.tileY), point]));
    if (command.biome !== undefined && command.command.kind === 'paint') {
      const cells = {...next.cells};
      for (const point of command.command.points) {
        if (point.tileX < 0 || point.tileY < 0 || point.tileX >= document.width || point.tileY >= document.height) continue;
        const key = mapCellKey(point.tileX,point.tileY);
        if (resolvedMapBiomeAt(next,point.tileX,point.tileY) === command.biome) continue;
        cells[key] = {...cells[key],biome:command.biome};
        changed.set(key,point);
      }
      if (changed.size > 0) next = normalizeMapDocumentV3({...next,cells,revision:document.revision+1});
    }
    return {document:next,changed:[...changed.values()],
      ...(edit.fullRebuild === undefined ? {} : {fullRebuild:edit.fullRebuild})};
  }
  if (command.kind === 'paint_biome') {
    const cells = { ...document.cells };
    const changed: MapPoint[] = [];
    for (const point of command.points) {
      if (point.tileX < 0 || point.tileY < 0 || point.tileX >= document.width || point.tileY >= document.height) continue;
      const key = mapCellKey(point.tileX, point.tileY);
      if (resolvedMapBiomeAt(document, point.tileX, point.tileY) === command.biome) continue;
      cells[key] = {
        ...(cells[key] ?? {}),
        biome: command.biome,
      };
      if (Object.keys(cells[key]!).length === 0) delete cells[key];
      changed.push(point);
    }
    if (changed.length === 0) return { document, changed };
    return {
      document: normalizeMapDocumentV3({ ...document, revision: document.revision + 1, cells }),
      changed,
    };
  }
  if (command.kind === 'embed_prefab') {
    const prefab = normalizeMapPrefab(command.prefab);
    const previous = document.prefabs.find((entry) => entry.id === prefab.id);
    if (previous !== undefined && serializeMapPrefabDocument(previous) === serializeMapPrefabDocument(prefab)) {
      return { document, changed: [] };
    }
    return {
      document: normalizeMapDocumentV3({
        ...document,
        revision: document.revision + 1,
        prefabs: [...document.prefabs.filter((entry) => entry.id !== prefab.id), prefab],
      }),
      changed: [],
    };
  }
  if (command.kind === 'place_object') {
    const object = parseObjectInstance(command.object, document.width, document.height);
    const prefab = document.prefabs.find((entry) => entry.id === object?.prefabId);
    if (object === null || prefab === undefined || prefab.revision !== object.prefabRevision) {
      throw new TypeError('Map object references an unavailable prefab revision');
    }
    const previous = document.objects.find((entry) => entry.id === object.id);
    if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(object)) {
      return { document, changed: [] };
    }
    return {
      document: normalizeMapDocumentV3({
        ...document,
        revision: document.revision + 1,
        objects: [...document.objects.filter((entry) => entry.id !== object.id), object],
      }),
      changed: [{ tileX: object.tileX, tileY: object.tileY }],
    };
  }
  if (command.kind === 'place_objects') {
    if (command.objects.length === 0 && (command.replaceObjectIds?.length ?? 0) === 0) {
      return { document, changed: [] };
    }
    const parsed = command.objects.map((object) => parseObjectInstance(object, document.width, document.height));
    if (parsed.some((object) => object === null)) throw new TypeError('Map object batch is invalid');
    const objects = parsed as MapObjectInstance[];
    const objectIds = objects.map((object) => object.id);
    if (new Set(objectIds).size !== objectIds.length) throw new TypeError('Map object batch ids must be unique');
    for (const object of objects) {
      const prefab = document.prefabs.find((entry) => entry.id === object.prefabId);
      if (prefab === undefined || prefab.revision !== object.prefabRevision) {
        throw new TypeError('Map object references an unavailable prefab revision');
      }
    }
    const replaced = new Set(command.replaceObjectIds ?? []);
    const previousById = new Map(document.objects.map((object) => [object.id, object] as const));
    const next = [
      ...document.objects.filter((object) => !replaced.has(object.id) && !objectIds.includes(object.id)),
      ...objects,
    ];
    const changed = [
      ...[...replaced].flatMap((id) => {
        const previous = previousById.get(id);
        return previous === undefined ? [] : [{ tileX: previous.tileX, tileY: previous.tileY }];
      }),
      ...objects.map((object) => ({ tileX: object.tileX, tileY: object.tileY })),
    ];
    return {
      document: normalizeMapDocumentV3({
        ...document,
        revision: document.revision + 1,
        objects: next,
      }),
      changed,
    };
  }
  if (command.kind === 'remove_object') {
    const previous = document.objects.find((entry) => entry.id === command.objectId);
    if (previous === undefined) return { document, changed: [] };
    return {
      document: normalizeMapDocumentV3({
        ...document,
        revision: document.revision + 1,
        objects: document.objects.filter((entry) => entry.id !== command.objectId),
      }),
      changed: [{ tileX: previous.tileX, tileY: previous.tileY }],
    };
  }
  if (command.kind === 'move_object') {
    const previous = document.objects.find((entry) => entry.id === command.objectId);
    if (previous === undefined) return { document, changed: [] };
    const object = parseObjectInstance({
      ...previous,
      tileX: command.tileX,
      tileY: command.tileY,
      elevation: command.elevation ?? previous.elevation,
    }, document.width, document.height);
    if (object === null) throw new RangeError('Map object movement leaves the map');
    if (JSON.stringify(previous) === JSON.stringify(object)) return { document, changed: [] };
    return {
      document: normalizeMapDocumentV3({
        ...document,
        revision: document.revision + 1,
        objects: document.objects.map((entry) => entry.id === object.id ? object : entry),
      }),
      changed: [
        { tileX: previous.tileX, tileY: previous.tileY },
        { tileX: object.tileX, tileY: object.tileY },
      ],
    };
  }
  if (command.kind === 'place_landmark') {
    const landmark = parseLandmarkInstance(command.landmark, document.width, document.height);
    if (landmark === null) throw new TypeError('Map landmark placement is invalid');
    const previous = document.landmarks.find((entry) => entry.id === landmark.id);
    if (previous !== undefined && JSON.stringify(previous) === JSON.stringify(landmark)) {
      return { document, changed: [] };
    }
    return {
      document: normalizeMapDocumentV3({
        ...document,
        revision: document.revision + 1,
        landmarks: [...document.landmarks.filter((entry) => entry.id !== landmark.id), landmark],
      }),
      changed: [{ tileX: landmark.tileX, tileY: landmark.tileY }],
    };
  }
  if (command.kind === 'remove_landmark') {
    const previous = document.landmarks.find((entry) => entry.id === command.landmarkId);
    if (previous === undefined) return { document, changed: [] };
    return {
      document: normalizeMapDocumentV3({
        ...document,
        revision: document.revision + 1,
        landmarks: document.landmarks.filter((entry) => entry.id !== command.landmarkId),
      }),
      changed: [{ tileX: previous.tileX, tileY: previous.tileY }],
    };
  }
  if (command.kind === 'move_landmark') {
    const previous = document.landmarks.find((entry) => entry.id === command.landmarkId);
    if (previous === undefined) return { document, changed: [] };
    const landmark = parseLandmarkInstance({
      ...previous,
      tileX: command.tileX,
      tileY: command.tileY,
      elevation: command.elevation ?? previous.elevation,
    }, document.width, document.height);
    if (landmark === null) throw new RangeError('Map landmark movement leaves the map');
    if (JSON.stringify(previous) === JSON.stringify(landmark)) return { document, changed: [] };
    return {
      document: normalizeMapDocumentV3({
        ...document,
        revision: document.revision + 1,
        landmarks: document.landmarks.map((entry) => entry.id === landmark.id ? landmark : entry),
      }),
      changed: [
        { tileX: previous.tileX, tileY: previous.tileY },
        { tileX: landmark.tileX, tileY: landmark.tileY },
      ],
    };
  }
  if (command.kind === 'place_anchor') {
    const anchor = parseMapGameplayAnchor(command.anchor, document.width, document.height);
    if (anchor === null || (anchor.kind !== 'poi' && anchor.kind !== 'label')) {
      throw new TypeError('Only annotation gameplay anchors can be authored');
    }
    if (resolvedMapCellAt(terrainDocumentForMapV3(document), anchor.tileX, anchor.tileY).elevation
      !== anchor.elevation) throw new RangeError('Map gameplay anchor elevation does not match terrain');
    if (document.anchors.some(({ id }) => id === anchor.id)
      || document.objects.some(({ id }) => id === anchor.id)
      || document.landmarks.some(({ id }) => id === anchor.id)) {
      throw new TypeError('Map gameplay anchor id must be unique');
    }
    return {
      document: normalizeMapDocumentV3({
        ...document,
        revision: document.revision + 1,
        anchors: [...document.anchors, anchor],
      }),
      changed: [{ tileX: anchor.tileX, tileY: anchor.tileY }],
    };
  }
  if (command.kind === 'remove_anchor') {
    const previous = document.anchors.find(({ id }) => id === command.anchorId);
    if (previous === undefined) return { document, changed: [] };
    if (previous.kind !== 'poi' && previous.kind !== 'label') {
      throw new TypeError('Runtime-authoritative gameplay anchors cannot be removed');
    }
    return {
      document: normalizeMapDocumentV3({
        ...document,
        revision: document.revision + 1,
        anchors: document.anchors.filter(({ id }) => id !== command.anchorId),
      }),
      changed: [{ tileX: previous.tileX, tileY: previous.tileY }],
    };
  }
  if (command.kind === 'move_anchor') {
    const previous = document.anchors.find(({ id }) => id === command.anchorId);
    if (previous === undefined) return { document, changed: [] };
    if (previous.kind !== 'poi' && previous.kind !== 'label') {
      throw new TypeError('Runtime-authoritative gameplay anchors cannot be moved');
    }
    const anchor = parseMapGameplayAnchor({
      ...previous,
      tileX: command.tileX,
      tileY: command.tileY,
      elevation: command.elevation,
    }, document.width, document.height);
    if (anchor === null) throw new RangeError('Map gameplay anchor movement leaves the map');
    if (resolvedMapCellAt(terrainDocumentForMapV3(document), anchor.tileX, anchor.tileY).elevation
      !== anchor.elevation) throw new RangeError('Map gameplay anchor elevation does not match terrain');
    if (JSON.stringify(previous) === JSON.stringify(anchor)) return { document, changed: [] };
    return {
      document: normalizeMapDocumentV3({
        ...document,
        revision: document.revision + 1,
        anchors: document.anchors.map((entry) => entry.id === anchor.id ? anchor : entry),
      }),
      changed: [
        { tileX: previous.tileX, tileY: previous.tileY },
        { tileX: anchor.tileX, tileY: anchor.tileY },
      ],
    };
  }
  if (command.kind === 'update_anchor_label') {
    if (typeof command.anchorId !== 'string' || !mapGameplayAnchorIdValid(command.anchorId)) {
      throw new TypeError('Map gameplay anchor id is invalid');
    }
    if (typeof command.label !== 'string') throw new TypeError('Map gameplay anchor label is invalid');
    const previous = document.anchors.find(({ id }) => id === command.anchorId);
    if (previous === undefined) return { document, changed: [] };
    if (previous.kind !== 'poi' && previous.kind !== 'label') {
      throw new TypeError('Runtime-authoritative gameplay anchor labels cannot be edited');
    }
    const anchor = parseMapGameplayAnchor({ ...previous, label: command.label }, document.width, document.height);
    if (anchor === null) throw new RangeError('Map gameplay anchor label is invalid');
    if (previous.label === anchor.label) return { document, changed: [] };
    return {
      document: normalizeMapDocumentV3({
        ...document,
        revision: document.revision + 1,
        anchors: document.anchors.map((entry) => entry.id === anchor.id ? anchor : entry),
      }),
      changed: [{ tileX: anchor.tileX, tileY: anchor.tileY }],
    };
  }
  const suppressions = new Set(document.generatedSuppressions);
  const had = suppressions.has(command.generatedId);
  if (command.suppressed) suppressions.add(command.generatedId);
  else suppressions.delete(command.generatedId);
  if (had === command.suppressed) return { document, changed: [] };
  return {
    document: normalizeMapDocumentV3({
      ...document,
      revision: document.revision + 1,
      generatedSuppressions: [...suppressions],
    }),
    changed: [],
  };
}

export function mapLandmarkDecoration(landmark: MapLandmarkInstance): GeneratedSurvivalDecoration {
  return {
    id: landmark.sourceDecorationId,
    kind: landmark.kind,
    tileX: landmark.tileX,
    tileY: landmark.tileY,
    variant: landmark.variant,
    animationOffset: landmark.animationOffset,
    ...(landmark.role === undefined ? {} : { role: landmark.role }),
  };
}

/** Transform the legacy landmark collision silhouette around its authored
 * sprite anchor. Client prediction and server authority both use this path. */
export function mapLandmarkCollisionObstacle(
  landmark: MapLandmarkInstance,
  medium: MovementMedium,
  registry?: SurvivalLandmarkRegistry,
): CollisionObstacle | null {
  if (!landmark.enabled) return null;
  const obstacle = survivalDecorationObstacle(mapLandmarkDecoration(landmark), medium, registry);
  if (obstacle === null) return null;
  const quarterTurns = landmark.quarterTurns;
  const objectScale = landmark.scale ?? 1;
  if (quarterTurns === 0 && !landmark.flipX && objectScale === 1) return obstacle;
  const anchorX = landmark.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const anchorY = (landmark.tileY + 1) * TILE_SIZE_FIXED;
  const transform = (x: number, y: number): readonly [number, number] => {
    let deltaX = x - anchorX;
    const deltaY = y - anchorY;
    if (landmark.flipX) deltaX = -deltaX;
    const rotated = quarterTurns === 0 ? [deltaX, deltaY] as const
      : quarterTurns === 1 ? [-deltaY, deltaX] as const
        : quarterTurns === 2 ? [-deltaX, -deltaY] as const
          : [deltaY, -deltaX] as const;
    return [anchorX + rotated[0] * objectScale, anchorY + rotated[1] * objectScale];
  };
  const corners = [
    transform(obstacle.left, obstacle.top),
    transform(obstacle.right + 1, obstacle.top),
    transform(obstacle.left, obstacle.bottom + 1),
    transform(obstacle.right + 1, obstacle.bottom + 1),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return {
    left: Math.min(...xs), top: Math.min(...ys),
    right: Math.max(...xs) - 1, bottom: Math.max(...ys) - 1,
  };
}

export function mapObjectPrefab(
  document: MapDocumentV3,
  object: MapObjectInstance,
): MapPrefabDocumentV2 | null {
  return document.prefabs.find((prefab) => (
    prefab.id === object.prefabId && prefab.revision === object.prefabRevision
  )) ?? null;
}

export function mapObjectCollisionCells(
  document: MapDocumentV3,
  object: MapObjectInstance,
): readonly { readonly tileX: number; readonly tileY: number; readonly elevation: number; readonly collisionMask: number }[] {
  const prefab = mapObjectPrefab(document, object);
  if (prefab === null || !object.enabled) return [];
  const transformedCells = prefab.cells.map((cell) => {
    let deltaX = cell.tileX - prefab.pivot.tileX;
    const deltaY = cell.tileY - prefab.pivot.tileY;
    if (object.flipX) deltaX = -deltaX;
    const transformed = object.quarterTurns === 0 ? { tileX: deltaX, tileY: deltaY }
      : object.quarterTurns === 1 ? { tileX: -deltaY, tileY: deltaX }
        : object.quarterTurns === 2 ? { tileX: -deltaX, tileY: -deltaY }
          : { tileX: deltaY, tileY: -deltaX };
    return {
      tileX: object.tileX + transformed.tileX,
      tileY: object.tileY + transformed.tileY,
      elevation: object.elevation + cell.elevation,
      collisionMask: transformMapPrefabCollisionMask(
        cell.collisionMask,
        object.quarterTurns,
        object.flipX,
      ),
    };
  });
  const scale = object.scale ?? 1;
  if (scale === 1) return transformedCells;
  const scaled = new Map<string, {
    tileX: number; tileY: number; elevation: number; collisionMask: number;
  }>();
  for (const cell of transformedCells) {
    for (let bit = 0; bit < 16; bit += 1) {
      if ((cell.collisionMask & (1 << bit)) === 0) continue;
      const sourceQuarterX = (cell.tileX - object.tileX) * 4 + bit % 4;
      const sourceQuarterY = (cell.tileY - object.tileY) * 4 + Math.floor(bit / 4);
      for (let scaleY = 0; scaleY < scale; scaleY += 1) {
        for (let scaleX = 0; scaleX < scale; scaleX += 1) {
          const quarterX = sourceQuarterX * scale + scaleX;
          const quarterY = sourceQuarterY * scale + scaleY;
          const tileX = object.tileX + floorDiv(quarterX, 4);
          const tileY = object.tileY + floorDiv(quarterY, 4);
          const localX = floorMod(quarterX, 4);
          const localY = floorMod(quarterY, 4);
          const key = `${tileX},${tileY},${cell.elevation}`;
          const previous = scaled.get(key);
          scaled.set(key, {
            tileX,
            tileY,
            elevation: cell.elevation,
            collisionMask: (previous?.collisionMask ?? 0) | (1 << (localY * 4 + localX)),
          });
        }
      }
    }
  }
  return [...scaled.values()].sort((left, right) => (
    left.elevation - right.elevation || left.tileY - right.tileY || left.tileX - right.tileX
  ));
}

export function mapV3TerrainCellAt(document: MapDocumentV3, tileX: number, tileY: number) {
  return resolvedMapCellAt(terrainDocumentForMapV3(document), tileX, tileY);
}

export function serializeMapV3TerrainCompatibility(document: MapDocumentV3): string {
  return serializeMapDocument(terrainDocumentForMapV3(document));
}

export * from './connected-objects.js';
