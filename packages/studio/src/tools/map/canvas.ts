import {
  MAP_GAMEPLAY_ANCHOR_LABEL_MAX_LENGTH,
  TOPSIDE_SPACE_ID,
  TILE_SIZE_PIXELS,
  mapCellKey,
  mapDocumentV3Hash,

  contentDefinitionRowsHash,
  parseContentDefinition,
  type ContentRegistry,

  type MapContentLayerId,
  type MapDocumentV3,
  type TilesetContentDefinition,
} from '@orchard/sim';
import { mapMaterialChoices, mapObjectCategory, mapPaletteColumns, MAP_OBJECT_FILTERS, type MapObjectFilter } from './material-palette.js';
import { studioLibraryDrawer } from '../../shell/workspace-controls.js';
import { terrainProjectedDepthForElevation, type TerrainArray } from '@orchard/engine';
import {
  ui as kit, uiFixed, UiElement, type UiButtonModifiers, type UiTone,
  CanvasTextEditor,
  STUDIO_SKIN_TOKENS,
  loadGeneratedAsset,
  loadGeneratedAssetCatalog,
  selectAtlasFrame,
  type AtlasFrame,
  type LoadedAsset,
  type UiIconName,
  type UiRect,
  type StudioPropertyRowModel,
} from '@orchard/ui/studio';
import type {
  StudioCanvasToolContext,

  StudioCanvasToolSurface,
} from '../../shell/canvas-tool.js';
import { requestStudioFileDownload } from '../../shell/file-download.js';
import type { AdminObjectsApi } from '../../admin/objects-api.js';
import type { StudioSelection } from '../../shell/index.js';
import { studioRoleCan } from '../../shell/access.js';
import { buildAssetPalette, type AssetPaletteItem } from '../object/asset-palette.js';

import {
  MapEditorController,
  type MapEditorLiveMarker,
} from './editor-controller.js';
import { MapEditorRenderer, mapGameplayAnchorMarkerScreenPosition } from './editor-renderer.js';
import {
  mapObjectCatalogEntriesWithContent,
  mapObjectDefinitionsFromContentRows,
  type MapContentDefinitionRow,
} from './content-object-catalog.js';
import {
  MapSpawnHereModel,
  isMapFunctionalLiveDefinitionId,
  mapLiveSpawnAvailability,
  type MapFunctionalLiveDefinitionId,
  type MapSpawnHereReceipt,
} from './live-object-tools.js';
import {
  MapRuntimeObjectActionModel,
  mapRuntimeObjectAvailability,
  type MapRuntimeObjectDraft,
  type MapRuntimeObjectReceipt,
} from './runtime-object-actions.js';
import {
  MapNpcLocationActionModel,
  mapNpcLocationAvailability,
  type MapNpcLocationMarker,
  type MapNpcLocationReceipt,
} from './npc-location-actions.js';
import {
  MapSchemaInspectorActionModel,
  mapSchemaInspectorAvailability,
  parseMapSchemaInspectorAction,
  type MapSchemaInspectorAuthority,
  type MapSchemaInspectorField,
  type MapSchemaInspectorReceipt,
} from './schema-inspector-actions.js';
import {  MapEditorModel } from './model.js';
import { MapRouteSessionStore, mapRouteSessionState, type MapOutlinerView } from './route-session-state.js';
import { studioMapId } from './routes.js';
import { mapSelectionDrawerRows } from './selection-drawer.js';
import {
  mapCanvasInspectorRows,
  type MapCanvasInspectorRow,
} from './canvas-dock-projections.js';
import {
  createMapOutlinerTreeState,

  type MapOutlinerTreeState,
} from './outliner-tree.js';

import {
  inspectMapSelection,
  type MapGeneratedSelectionDescriptor,
  type MapSelectionInspection,
} from './selection-inspection.js';
import {
  type MapLayerSelectionState,
} from './layer-selection.js';
import { createMapDocumentExport } from './document-export.js';
import { MapAutoPublishCoordinator } from './auto-publish.js';
import { mapResizeImpactLossCount, type MapResizeEdge, type MapResizeImpact } from './resize.js';
import { verifiedStudioLiveContent } from './live-content-registry.js';
import {
  OFFLINE_TERRAIN_AUTHORING_PALETTE,
  liveTerrainAuthoringPalette,

  type ExactTerrainOverrideChoice,

  type TerrainAuthoringPalette,
  type TerrainPalettePreview,
} from './terrain-authoring-palette.js';

interface MapCanvasInspectionCache {
  readonly document: MapDocumentV3;
  readonly selection: ReturnType<MapEditorModel['selection']>;
  readonly activeLayer: MapContentLayerId;
  readonly hiddenKey: string;
  /** Stable selected-resource signature. Unrelated live-row churn must not
   * invalidate a tile or authored-object inspection. */
  readonly generatedEntityKey: string;
  readonly inspection: MapSelectionInspection | null;
}

interface MapCanvasState {
  readonly model: MapEditorModel;
  readonly interaction: MapEditorController;
  readonly renderer: MapEditorRenderer;
  readonly search: CanvasTextEditor;
  readonly layerName: CanvasTextEditor;
  readonly anchorLabel: CanvasTextEditor;
  readonly session: MapRouteSessionStore;
  readonly autoPublish: MapAutoPublishCoordinator;
  autoPublishEnabled: boolean;
  paletteOffset: number;
  paletteSuggestionsOpen: boolean;
  paletteBounds: UiRect;
  paletteRowCount: number;
  paletteVisibleRows: number;
  layerOffset: number;
  layerBounds: UiRect;
  layerActiveId: MapContentLayerId | null;
  layerVisibleCount: number;
  /** Ephemeral drawer selection. The controller's activeLayer remains the
   * single placement/authoring target persisted by route session state. */
  layerSelection: MapLayerSelectionState | null;
  renamingLayerId: MapContentLayerId | null;
  editingAnchorId: string | null;
  anchorLabelError: string | null;
  resizeMode: boolean;
  resizeImpact: MapResizeImpact | null;
  dismissedConflictRevision: number | null;
  selectionOffset: number;
  selectionBounds: UiRect;
  selectionRowCount: number;
  selectionActiveKey: string | null;
  inspectionCache: MapCanvasInspectionCache | null;
  exactTerrainPaletteCache: {
    readonly document: MapDocumentV3;
    readonly tileKey: string;
    readonly query: string;
    readonly contentKey: string;
    readonly choices: readonly ExactTerrainOverrideChoice[];
  } | null;
  terrainPaletteSource: object | null;
  terrainPalette: TerrainAuthoringPalette;
  catalogLoading: boolean;
  catalogReady: boolean;
  catalogPalette: readonly AssetPaletteItem[] | null;
  objectFilter: MapObjectFilter;
  catalogAssetRevision: string;
  catalogContentSource: readonly MapContentDefinitionRow[] | undefined | null;
  catalogItems: ReadonlyMap<string, AssetPaletteItem>;
  catalogDefinitionIds: ReadonlyMap<string, string>;
  liveSpawnApi: AdminObjectsApi | null;
  liveSpawnModel: MapSpawnHereModel | null;
  liveSpawnMode: boolean;
  liveSpawnDefinitionId: MapFunctionalLiveDefinitionId | null;
  liveSpawnPrefabId: string | null;
  liveSpawnTarget: Readonly<{ readonly tileX: number; readonly tileY: number;
    readonly elevation: number }> | null;
  liveSpawnPreviewing: boolean;
  liveSpawnCommitting: boolean;
  liveSpawnRequest: number;
  runtimeObjectModel: MapRuntimeObjectActionModel | null;
  runtimeObjectMarker: MapEditorLiveMarker | null;
  runtimeObjectMoveMode: boolean;
  runtimeObjectTarget: Readonly<{ readonly tileX: number; readonly tileY: number;
    readonly elevation: number }> | null;
  runtimeObjectPreviewing: boolean;
  runtimeObjectCommitting: boolean;
  runtimeObjectRequest: number;
  npcLocationModel: MapNpcLocationActionModel | null;
  npcLocationMarker: MapNpcLocationMarker | null;
  npcLocationMoveMode: boolean;
  npcLocationTarget: Readonly<{ readonly tileX: number; readonly tileY: number;
    readonly elevation: number }> | null;
  npcLocationPreviewing: boolean;
  npcLocationCommitting: boolean;
  npcLocationRequest: number;
  readonly schemaActionEditor: CanvasTextEditor;
  schemaActionModel: MapSchemaInspectorActionModel | null;
  schemaActionField: StudioPropertyRowModel | null;
  schemaActionTargetId: string | null;
  schemaActionError: string | null;
  schemaActionPreviewing: boolean;
  schemaActionCommitting: boolean;
  schemaActionRequest: number;
  schemaLiveRowsSource: object | null;
  schemaContentSource: object | null;
  schemaContentAuthorityKey: string;
  liveObjectRegistry: ContentRegistry | null;
  disposed: boolean;
  readonly previewAssets: Map<string, LoadedAsset>;
  readonly previewLoading: Set<string>;
  readonly previewFailures: Set<string>;
  outlinerDocument: MapDocumentV3 | null;
  leftView: MapOutlinerView;
  outlinerOffset: number;
  outlinerBounds: UiRect;
  outlinerRowCount: number;
  outlinerVisibleRows: number;
  readonly worldOutlinerSearch: CanvasTextEditor;
  readonly liveOutlinerSearch: CanvasTextEditor;
  worldOutlinerState: MapOutlinerTreeState;
  liveOutlinerState: MapOutlinerTreeState;
  inspectorView: 'selection' | 'schema';
}

export type MapEditorPublishState = 'CLEAN' | 'DIRTY' | 'PUBLISHING' | 'CONFLICT';

export interface MapEditorPublishPresentation {
  readonly state: MapEditorPublishState;
  readonly disabled: boolean;
  readonly tooltip: string;
  readonly icon: UiIconName;
  readonly tone?: 'success' | 'danger';
}

export function mapEditorPublishPresentation(input: {
  readonly dirty: boolean;
  readonly publishing: boolean;
  readonly conflictRevision: number | null;
  readonly validation: 'ready' | 'pending' | 'invalid';
  readonly baseRevision: number;
  readonly connected: boolean;
  readonly synchronizing: boolean;
  readonly authorized: boolean;
  readonly publishAvailable: boolean;
}): MapEditorPublishPresentation {
  if (input.conflictRevision !== null) return {
    state: 'CONFLICT', disabled: true, icon: 'lock', tone: 'danger',
    tooltip: `CONFLICT — Live revision ${input.conflictRevision} changed; reload latest or keep this local draft`,
  };
  if (input.publishing) return {
    state: 'PUBLISHING', disabled: true, icon: 'cloudConnect',
    tooltip: 'PUBLISHING — Waiting for live authority',
  };
  if (!input.dirty) return {
    state: 'CLEAN', disabled: true, icon: 'save',
    tooltip: 'CLEAN — No unpublished map changes',
  };
  if (input.validation === 'pending') return {
    state: 'DIRTY', disabled: true, icon: 'cloudPublish',
    tooltip: 'DIRTY — Wait for map validation to finish',
  };
  if (input.validation === 'invalid') return {
    state: 'DIRTY', disabled: true, icon: 'lock', tone: 'danger',
    tooltip: 'DIRTY — Resolve blocking map validation errors before publishing',
  };
  if (input.synchronizing) return {
    state: 'DIRTY', disabled: true, icon: 'cloudPublish',
    tooltip: 'DIRTY — Wait for the live map subscription to synchronize',
  };
  if (!input.connected) return {
    state: 'DIRTY', disabled: true, icon: 'cloudPublish',
    tooltip: 'DIRTY — Connect to the live world to publish',
  };
  if (!input.authorized) return {
    state: 'DIRTY', disabled: true, icon: 'cloudPublish',
    tooltip: 'DIRTY — Map publish permission is required',
  };
  if (!input.publishAvailable) return {
    state: 'DIRTY', disabled: true, icon: 'cloudPublish',
    tooltip: 'DIRTY — Live map publishing is unavailable',
  };
  return {
    state: 'DIRTY', disabled: false, icon: 'cloudPublish', tone: 'success',
    tooltip: `DIRTY — Publish local changes against live revision ${input.baseRevision}`,
  };
}

interface TerrainPaletteSnapshot {
  readonly source: object | null;
  readonly palette: TerrainAuthoringPalette;
}

function terrainPaletteSnapshot(context: StudioCanvasToolContext): TerrainPaletteSnapshot {
  const live = context.controller.liveAdapter();
  if (live === null) return { source: null, palette: OFFLINE_TERRAIN_AUTHORING_PALETTE };
  const view = live.view();
  const head = view.contentHead;
  const rows = view.contentDefinitions;
  const ready = view.connected && !view.synchronizing && view.error === null
    && head !== undefined && head !== null && rows !== undefined
    && rows.length === head.definitionCount;
  const readinessKey = ready
    ? `${head.revision}:${head.contentHash}`
    : `unavailable:${String(head?.revision ?? view.contentRevision ?? 'none')}:${rows?.length ?? 'none'}`;
  if (!ready) return { source: rows ?? view, palette: liveTerrainAuthoringPalette([], readinessKey) };
  try {
    const sourceRows = rows.map(({ id, kind, slug, json }) => ({ id, kind, slug, json }));
    if (contentDefinitionRowsHash(sourceRows) !== head.contentHash) {
      return { source: rows, palette: liveTerrainAuthoringPalette([], `${readinessKey}:hash-mismatch`) };
    }
    const definitions = rows.flatMap((row): readonly TilesetContentDefinition[] => {
      if (row.kind !== 'tileset') return [];
      const definition = parseContentDefinition(row.kind, row.json);
      return definition.kind === 'tileset' ? [definition] : [];
    });
    return { source: rows, palette: liveTerrainAuthoringPalette(definitions, readinessKey) };
  } catch {
    return { source: rows, palette: liveTerrainAuthoringPalette([], `${readinessKey}:invalid`) };
  }
}

function syncTerrainPalette(state: MapCanvasState, context: StudioCanvasToolContext): void {
  const snapshot = terrainPaletteSnapshot(context);
  if (snapshot.source === state.terrainPaletteSource
    && snapshot.palette.contentKey === state.terrainPalette.contentKey) return;
  state.terrainPaletteSource = snapshot.source;
  state.terrainPalette = snapshot.palette;
  state.exactTerrainPaletteCache = null;
  state.interaction.setTerrainAuthoringPalette(snapshot.palette);
  if (state.renderer.setTerrainAuthoringPalette(snapshot.palette)) {
    state.renderer.prepareInspectionTerrain(state.model.document(), state.model.terrainIdentity());
  }
}

function createState(context: StudioCanvasToolContext, mapId: string): MapCanvasState {
  const model = new MapEditorModel(mapId, {
    selection: context.controller.selection,
    inspector: context.controller.inspector,
    validation: context.controller.validation,
    notifications: context.controller.notifications,
    live: () => context.controller.liveAdapter(),
  });
  if (context.route.path.endsWith('/procedural-world')) model.selectWorkspace('scatter');
  else if (context.route.path.endsWith('/terrain-lab')) model.selectWorkspace('terrain');
  const session = new MapRouteSessionStore(context.route.path, model.document().id);
  let restored = session.restore();
  if (restored !== null && (!model.document().layers.some(({ id }) => id === restored!.activeLayer)
    || !restored.hiddenLayers.every((id) => model.document().layers.some((layer) => layer.id === id))
    || !restored.userLockedLayers.every((id) => model.document().layers.some((layer) => layer.id === id))
    || (restored.soloLayer !== null
      && !model.document().layers.some((layer) => layer.id === restored!.soloLayer))
    || !model.restoreSession(
      restored.workspace, restored.hiddenLayers, [], null,
    ))) {
    restored = null;
  }
  const terrainPalette = terrainPaletteSnapshot(context);
  const interaction = new MapEditorController(model, context.invalidate, terrainPalette.palette);
  interaction.selectEditingTool(restored?.workspace === 'terrain' ? 'terrain' : 'objects');
  if (restored !== null) interaction.restoreSession(restored);
  const renderer = new MapEditorRenderer(context.invalidate, terrainPalette.palette);
  // Start the immutable terrain derivative when the route mounts. Browser
  // builds use the worker; non-browser/test hosts use the compatibility path.
  // Either way, later selection only reads the completed renderer cache.
  renderer.prepareInspectionTerrain(model.document(), model.terrainIdentity());
  const state = {} as MapCanvasState;
  Object.assign(state, {
    objectFilter: 'all',
    model,
    interaction,
    renderer,
    search: new CanvasTextEditor({ value: restored?.paletteQuery ?? '', maxLength: 80, onChange: () => {
      state.paletteOffset = 0;
      context.invalidate();
    } }),
    layerName: new CanvasTextEditor({ maxLength: 48, onChange: () => context.invalidate() }),
    anchorLabel: new CanvasTextEditor({ maxLength: 4_096, onChange: () => {
      state.anchorLabelError = null;
      context.invalidate();
    } }),
    schemaActionEditor: new CanvasTextEditor({ maxLength: 128, onChange: () => {
      state.schemaActionError = null;
      context.invalidate();
    } }),
    worldOutlinerSearch: new CanvasTextEditor({ value: restored?.authoredOutliner.query ?? '', maxLength: 80,
      onChange: () => { state.outlinerOffset = 0; context.invalidate(); } }),
    liveOutlinerSearch: new CanvasTextEditor({ maxLength: 80,
      onChange: () => { state.outlinerOffset = 0; context.invalidate(); } }),
    session,
    autoPublish: new MapAutoPublishCoordinator(context.invalidate),
    autoPublishEnabled: false,
    paletteOffset: restored?.paletteOffset ?? 0,
    paletteBounds: { x: 0, y: 0, width: 0, height: 0 },
    paletteRowCount: 0,
    paletteVisibleRows: 0,
    layerOffset: 0,
    layerBounds: { x: 0, y: 0, width: 0, height: 0 },
    layerActiveId: null,
    layerVisibleCount: 0,
    layerSelection: null,
    renamingLayerId: null,
    editingAnchorId: null,
    anchorLabelError: null,
    resizeMode: false,
    resizeImpact: null,
    dismissedConflictRevision: null,
    selectionOffset: 0,
    selectionBounds: { x: 0, y: 0, width: 0, height: 0 },
    selectionRowCount: 0,
    selectionActiveKey: null,
    inspectionCache: null,
    exactTerrainPaletteCache: null,
    terrainPaletteSource: terrainPalette.source,
    terrainPalette: terrainPalette.palette,
    catalogLoading: false,
    catalogReady: false,
    catalogPalette: null,
    catalogAssetRevision: '',
    catalogContentSource: null,
    catalogItems: new Map(),
    catalogDefinitionIds: new Map(),
    liveSpawnApi: null,
    liveSpawnModel: null,
    liveSpawnMode: false,
    liveSpawnDefinitionId: null,
    liveSpawnPrefabId: null,
    liveSpawnTarget: null,
    liveSpawnPreviewing: false,
    liveSpawnCommitting: false,
    liveSpawnRequest: 0,
    runtimeObjectModel: null,
    runtimeObjectMarker: null,
    runtimeObjectMoveMode: false,
    runtimeObjectTarget: null,
    runtimeObjectPreviewing: false,
    runtimeObjectCommitting: false,
    runtimeObjectRequest: 0,
    npcLocationModel: null,
    npcLocationMarker: null,
    npcLocationMoveMode: false,
    npcLocationTarget: null,
    npcLocationPreviewing: false,
    npcLocationCommitting: false,
    npcLocationRequest: 0,
    schemaActionModel: null,
    schemaActionField: null,
    schemaActionTargetId: null,
    schemaActionError: null,
    schemaActionPreviewing: false,
    schemaActionCommitting: false,
    schemaActionRequest: 0,
    schemaLiveRowsSource: null,
    schemaContentSource: null,
    schemaContentAuthorityKey: '',
    liveObjectRegistry: null,
    disposed: false,
    previewAssets: new Map(),
    previewLoading: new Set(),
    previewFailures: new Set(),
    outlinerDocument: null,
    leftView: restored?.outlinerView ?? 'palette',
    outlinerOffset: 0,
    outlinerBounds: { x: 0, y: 0, width: 0, height: 0 },
    outlinerRowCount: 0,
    outlinerVisibleRows: 0,
    worldOutlinerState: restored?.authoredOutliner ?? Object.freeze({
      version: 1, query: '', expandedIds: Object.freeze(['space:0']), focusedId: 'space:0', selectedId: null,
    }),
    liveOutlinerState: createMapOutlinerTreeState([]),
    inspectorView: 'selection',
  });
  return state;
}

function cancelLayerRename(state: MapCanvasState): void {
  state.renamingLayerId = null;
  state.layerName.blur();
}

function cancelAnchorLabelEdit(state: MapCanvasState): void {
  state.editingAnchorId = null;
  state.anchorLabelError = null;
  state.anchorLabel.blur();
}

function beginAnchorLabelEdit(state: MapCanvasState, anchorId: string, label: string): void {
  cancelLayerRename(state);
  state.editingAnchorId = anchorId;
  state.anchorLabelError = null;
  state.anchorLabel.setValue(label);
  state.anchorLabel.setSelection(0, label.length);
  state.anchorLabel.focus();
}

function commitAnchorLabelEdit(state: MapCanvasState, context: StudioCanvasToolContext): void {
  if (state.editingAnchorId === null) return;
  const selection = state.model.selection();
  if (selection.kind !== 'entity' || selection.entityKind !== 'map-anchor'
    || selection.id !== state.editingAnchorId) {
    cancelAnchorLabelEdit(state);
    return;
  }
  const draft = state.anchorLabel.snapshot().value;
  const trimmed = draft.trim();
  const error = trimmed.length === 0
    ? 'Anchor label is required'
    : trimmed.length > MAP_GAMEPLAY_ANCHOR_LABEL_MAX_LENGTH
      ? `Anchor label must be ${MAP_GAMEPLAY_ANCHOR_LABEL_MAX_LENGTH} characters or fewer`
      : null;
  if (error !== null) {
    state.anchorLabelError = error;
    context.controller.notifications.push('error', 'Anchor label was not changed', error);
    context.invalidate();
    return;
  }
  try {
    if (!state.interaction.updateSelectedAnchorLabel(draft)) {
      throw new Error('Only selected POI and label anchors can be renamed');
    }
    cancelAnchorLabelEdit(state);
  } catch (errorValue: unknown) {
    state.anchorLabelError = errorValue instanceof Error ? errorValue.message : String(errorValue);
    reportCanvasError(context, 'Anchor label was not changed', errorValue);
  }
}

function cancelMapResize(state: MapCanvasState): void {
  state.resizeImpact = null;
}

function requestMapResize(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  edge: MapResizeEdge,
  grow: boolean,
): void {
  cancelLayerRename(state);
  try {
    const impact = state.model.planResize(edge, grow);
    if (grow) state.interaction.resize(impact);
    else state.resizeImpact = impact;
  } catch (error: unknown) {
    reportCanvasError(context, 'Map was not resized', error);
  }
  context.invalidate();
}

function confirmMapResize(state: MapCanvasState, context: StudioCanvasToolContext): void {
  const impact = state.resizeImpact;
  if (impact === null) return;
  state.resizeImpact = null;
  try {
    state.interaction.resize(impact);
  } catch (error: unknown) {
    reportCanvasError(context, 'Map was not resized', error);
  }
  context.invalidate();
}

function drawMapResizePreview(
  context: CanvasRenderingContext2D,
  impact: MapResizeImpact | null,
  interaction: ReturnType<MapEditorController['snapshot']>,
): void {
  if (impact === null || impact.cropBounds === null) return;
  const { viewport, camera } = interaction;
  const crop = impact.cropBounds;
  const x = viewport.x + (crop.minimumTileX * TILE_SIZE_PIXELS - camera.x) * camera.zoom;
  const y = viewport.y + (crop.minimumTileY * TILE_SIZE_PIXELS - camera.y) * camera.zoom;
  const width = (crop.maximumTileX - crop.minimumTileX + 1) * TILE_SIZE_PIXELS * camera.zoom;
  const height = (crop.maximumTileY - crop.minimumTileY + 1) * TILE_SIZE_PIXELS * camera.zoom;
  context.save();
  context.beginPath();
  context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  context.fillStyle = 'rgba(154, 49, 42, 0.48)';
  context.fillRect(x, y, width, height);
  context.strokeStyle = STUDIO_SKIN_TOKENS.parchmentLight;
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.strokeRect(x, y, width, height);
  context.setLineDash([]);
  context.restore();
}

function persistSession(state: MapCanvasState): void {
  const interaction = state.interaction.snapshot();
  state.session.save(mapRouteSessionState({
    camera: interaction.camera,
    workspace: state.model.workspace(),
    terrainTool: interaction.terrainTool,
    terrainPaletteMode: interaction.terrainPaletteMode,
    selectedSurfaceFamily: interaction.selectedSurfaceFamily,
    selectedCliffFamily: interaction.selectedCliffFamily,
    activeLayer: interaction.activeLayer,
    hiddenLayers: state.model.document().layers
      .filter(({ id }) => !state.model.isLayerEyeVisible(id)).map(({ id }) => id),
    userLockedLayers: state.model.userLockedLayers(),
    soloLayer: state.model.soloLayer(),
    selectedPrefabId: interaction.selectedPrefabId,
    selectedAnchorKind: interaction.selectedAnchorKind,
    selectedBiome: interaction.selectedBiome,
    activeElevation: interaction.activeElevation,
    heightOverlayVisible: interaction.heightOverlayVisible,
    collisionOverlayVisible: interaction.collisionOverlayVisible,
    autoPublish: state.autoPublishEnabled,
    outlinerView: state.leftView,
    authoredOutliner: state.worldOutlinerState,
    transitionKind: interaction.transitionKind,
    transitionWidth: interaction.transitionWidth,
    scatterDensity: interaction.scatterDensity,
    paletteQuery: state.search.snapshot().value,
    paletteOffset: state.paletteOffset,
  }));
}

function publishMapFromCanvas(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
): Promise<void> {
  const title = state.model.document().title;
  const pending = state.model.publish();
  context.invalidate();
  return pending.then(() => {
    context.controller.notifications.push('success', 'Map published', title);
  }).catch((error: unknown) => {
    reportCanvasError(context, 'Map publish failed', error);
    throw error;
  }).finally(context.invalidate);
}

function syncMapAutoPublish(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
): void {
  const liveAdapter = context.controller.liveAdapter();
  const liveView = liveAdapter?.view();
  state.autoPublish.observe({
    enabled: state.autoPublishEnabled,
    dirty: state.model.dirty(),
    editKey: state.model.document(),
    conflictRevision: state.model.conflictRevision(),
    validation: state.model.validationState(),
    connected: liveView?.connected === true,
    synchronizing: liveView?.synchronizing === true,
    writable: mapId === 'live-island' && context.route.access === 'write',
    authorized: studioRoleCan(liveView?.role ?? null, 'publish_map'),
    publishAvailable: mapId === 'live-island' && liveAdapter?.publishMap !== undefined,
    authorityPublishing: state.model.publishing() || liveView?.publishingMap === true,
  }, () => publishMapFromCanvas(state, context));
}

function syncContentObjectCatalog(state: MapCanvasState, context: StudioCanvasToolContext): void {
  if (state.catalogPalette === null) return;
  const source = context.controller.liveAdapter()?.view().contentDefinitions;
  if (source === state.catalogContentSource) return;
  state.catalogContentSource = source;
  const entries = mapObjectCatalogEntriesWithContent(
    state.catalogPalette,
    state.catalogAssetRevision,
    mapObjectDefinitionsFromContentRows(source),
  );
  state.interaction.setCatalog(entries.map(({ prefab }) => prefab));
  state.catalogItems = new Map(entries.map(({ item, prefab }) => [prefab.id, item] as const));
  state.catalogDefinitionIds = new Map(entries.flatMap(({ prefab, contentDefinitionId }) => (
    contentDefinitionId === undefined ? [] : [[prefab.id, contentDefinitionId] as const]
  )));
  if (state.liveSpawnMode && (state.liveSpawnPrefabId === null
    || state.catalogDefinitionIds.get(state.liveSpawnPrefabId) !== state.liveSpawnDefinitionId)) {
    resetLiveSpawn(state);
  }
}

function resetLiveSpawn(state: MapCanvasState, leaveMode = true): void {
  state.liveSpawnRequest += 1;
  state.liveSpawnModel?.cancel();
  state.liveSpawnPreviewing = false;
  state.liveSpawnCommitting = false;
  state.liveSpawnTarget = null;
  if (leaveMode) {
    state.liveSpawnMode = false;
    state.liveSpawnDefinitionId = null;
    state.liveSpawnPrefabId = null;
  }
}

function resetRuntimeObjectAction(state: MapCanvasState): void {
  state.runtimeObjectRequest += 1;
  state.runtimeObjectModel?.cancel();
  state.runtimeObjectMarker = null;
  state.runtimeObjectMoveMode = false;
  state.runtimeObjectTarget = null;
  state.runtimeObjectPreviewing = false;
  state.runtimeObjectCommitting = false;
}

function resetNpcLocationAction(state: MapCanvasState): void {
  state.npcLocationRequest += 1;
  state.npcLocationModel?.cancel();
  state.npcLocationMarker = null;
  state.npcLocationMoveMode = false;
  state.npcLocationTarget = null;
  state.npcLocationPreviewing = false;
  state.npcLocationCommitting = false;
}

function resetSchemaInspectorAction(state: MapCanvasState): void {
  state.schemaActionRequest += 1;
  state.schemaActionModel?.cancel();
  state.schemaActionField = null;
  state.schemaActionTargetId = null;
  state.schemaActionError = null;
  state.schemaActionPreviewing = false;
  state.schemaActionCommitting = false;
  state.schemaActionEditor.blur();
}

function syncLiveSpawnModel(state: MapCanvasState, context: StudioCanvasToolContext): void {
  const api = context.controller.liveAdapter()?.adminObjects;
  const liveApi = api?.source === 'live' ? api : null;
  if (state.liveSpawnApi === liveApi) return;
  resetLiveSpawn(state);
  resetRuntimeObjectAction(state);
  resetNpcLocationAction(state);
  resetSchemaInspectorAction(state);
  state.schemaActionModel?.dispose();
  state.liveSpawnApi = liveApi;
  state.liveSpawnModel = liveApi === null ? null : new MapSpawnHereModel(liveApi);
  state.runtimeObjectModel = liveApi === null ? null : new MapRuntimeObjectActionModel(liveApi);
  state.npcLocationModel = liveApi === null ? null : new MapNpcLocationActionModel(liveApi);
  state.schemaActionModel = liveApi === null ? null : new MapSchemaInspectorActionModel(liveApi);
}

function currentSchemaInspectorAuthority(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
): MapSchemaInspectorAuthority {
  const view = context.controller.liveAdapter()?.view();
  return Object.freeze({
    mapId,
    routeAccess: context.route.access,
    connected: view?.connected === true,
    role: view?.role ?? null,
    hasLiveApi: state.schemaActionModel !== null,
    target: state.model.schemaInspectorTarget(),
  });
}

function beginSchemaInspectorAction(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
  field: StudioPropertyRowModel,
): void {
  const availability = mapSchemaInspectorAvailability(
    field as MapSchemaInspectorField,
    currentSchemaInspectorAuthority(state, context, mapId),
  );
  if (!availability.editable) return;
  resetSchemaInspectorAction(state);
  state.schemaActionField = field;
  state.schemaActionTargetId = state.model.schemaInspectorTarget()?.entityId ?? null;
  const value = field.value === null ? '' : String(field.value);
  state.schemaActionEditor.setValue(value);
  state.schemaActionEditor.setSelection(0, value.length);
  state.schemaActionEditor.focus();
  context.invalidate();
}

function schemaActionReason(field: StudioPropertyRowModel, targetId: string): string {
  return `Change ${field.label} on live entity ${targetId} from the Map Inspector`;
}

function previewSchemaInspectorAction(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
): void {
  const field = state.schemaActionField;
  const model = state.schemaActionModel;
  const authority = currentSchemaInspectorAuthority(state, context, mapId);
  const target = authority.target;
  if (field === null || model === null || target === null || state.schemaActionPreviewing
    || state.schemaActionCommitting) return;
  const request = ++state.schemaActionRequest;
  state.schemaActionError = null;
  state.schemaActionPreviewing = true;
  void model.preview(
    field as MapSchemaInspectorField,
    authority,
    state.schemaActionEditor.snapshot().value,
    schemaActionReason(field, target.entityId),
  ).then(() => {
    if (request !== state.schemaActionRequest || state.disposed) return;
    state.schemaActionPreviewing = false;
    context.invalidate();
  }).catch((error: unknown) => {
    if (request !== state.schemaActionRequest || state.disposed) return;
    state.schemaActionPreviewing = false;
    state.schemaActionError = error instanceof Error ? error.message : String(error);
    context.invalidate();
  });
}

function confirmSchemaInspectorAction(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
): void {
  const field = state.schemaActionField;
  const model = state.schemaActionModel;
  if (field === null || model === null || model.pending() === null
    || state.schemaActionPreviewing || state.schemaActionCommitting) return;
  const request = ++state.schemaActionRequest;
  state.schemaActionError = null;
  state.schemaActionCommitting = true;
  void model.commit(true, currentSchemaInspectorAuthority(state, context, mapId)).then((result) => {
    if (request !== state.schemaActionRequest || state.disposed) return;
    context.controller.notifications.push('success', `${field.label} changed`,
      result.audit === null ? 'Authority committed the change.' : `Audit ${result.audit.id}`);
    resetSchemaInspectorAction(state);
    context.invalidate();
  }).catch((error: unknown) => {
    if (request !== state.schemaActionRequest || state.disposed) return;
    state.schemaActionCommitting = false;
    state.schemaActionError = error instanceof Error ? error.message : String(error);
    context.invalidate();
  });
}

function selectedLiveSpawnDefinition(state: MapCanvasState): MapFunctionalLiveDefinitionId | null {
  const prefabId = state.interaction.snapshot().selectedPrefabId;
  const definitionId = prefabId === null ? null : state.catalogDefinitionIds.get(prefabId);
  return isMapFunctionalLiveDefinitionId(definitionId) ? definitionId : null;
}

function currentLiveSpawnAvailability(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
) {
  const view = context.controller.liveAdapter()?.view();
  return mapLiveSpawnAvailability({
    mapId,
    routeAccess: context.route.access,
    connected: view?.connected === true,
    role: view?.role ?? null,
    hasLiveApi: state.liveSpawnApi !== null,
    contentVersion: view?.contentHead === null || view?.contentHead === undefined
      ? null : String(view.contentHead.revision),
    contentFingerprint: view?.contentHead?.contentHash ?? null,
    definitionId: state.liveSpawnMode
      ? state.liveSpawnDefinitionId : selectedLiveSpawnDefinition(state),
  });
}

function liveSpawnDisplayName(state: MapCanvasState): string | null {
  if (state.liveSpawnPrefabId === null) return null;
  return state.interaction.palette().find(({ id }) => id === state.liveSpawnPrefabId)?.title
    ?? state.liveSpawnDefinitionId?.replace(/^object:/u, '').replaceAll('_', ' ')
    ?? null;
}

function requestLiveSpawnPreview(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
  point: { readonly x: number; readonly y: number },
): boolean {
  if (!state.liveSpawnMode || state.liveSpawnCommitting) return false;
  const availability = currentLiveSpawnAvailability(state, context, mapId);
  const definitionId = state.liveSpawnDefinitionId;
  const model = state.liveSpawnModel;
  const view = context.controller.liveAdapter()?.view();
  const target = state.interaction.tileAtPoint(point);
  const displayName = liveSpawnDisplayName(state);
  if (!availability.allowed || definitionId === null || model === null
    || view?.contentHead === null || view?.contentHead === undefined
    || target === null || displayName === null) {
    if (!availability.allowed) {
      context.controller.notifications.push('error', 'Live spawn unavailable', availability.reason);
      resetLiveSpawn(state);
      context.invalidate();
      return true;
    }
    return target === null;
  }

  const request = ++state.liveSpawnRequest;
  model.cancel();
  state.liveSpawnTarget = target;
  state.liveSpawnPreviewing = true;
  state.model.selectTile(target.tileX, target.tileY);
  const reason = `Spawn ${displayName} from Map Editor`;
  void model.preview({
    definitionId,
    displayName,
    spaceId: TOPSIDE_SPACE_ID,
    tileX: target.tileX,
    tileY: target.tileY,
    reason,
    authority: availability.authority,
    contentVersion: String(view.contentHead.revision),
    contentFingerprint: view.contentHead.contentHash,
  }).catch((error: unknown) => {
    if (request !== state.liveSpawnRequest || state.disposed) return;
    reportCanvasError(context, 'Live spawn preview failed', error);
  }).finally(() => {
    if (request !== state.liveSpawnRequest || state.disposed) return;
    state.liveSpawnPreviewing = false;
    context.invalidate();
  });
  context.invalidate();
  return true;
}

function confirmLiveSpawn(state: MapCanvasState, context: StudioCanvasToolContext): void {
  if (state.liveSpawnCommitting) return;
  const model = state.liveSpawnModel;
  if (model === null || model.pending() === null) return;
  const request = ++state.liveSpawnRequest;
  state.liveSpawnCommitting = true;
  void model.commit().then((result) => {
    if (request !== state.liveSpawnRequest || state.disposed) return;
    context.controller.notifications.push('success', 'Functional entity spawned',
      `${result.preview.operation.replaceAll('_', ' ')} · ${result.version}`);
    resetLiveSpawn(state);
    context.invalidate();
  }).catch((error: unknown) => {
    if (request !== state.liveSpawnRequest || state.disposed) return;
    state.liveSpawnCommitting = false;
    state.liveSpawnTarget = null;
    reportCanvasError(context, 'Live spawn failed', error);
  }).finally(() => {
    if (request === state.liveSpawnRequest && !state.disposed) context.invalidate();
  });
  context.invalidate();
}

function selectedRuntimeObjectMarker(state: MapCanvasState): MapEditorLiveMarker | null {
  const selection = state.model.selection();
  if (selection.kind !== 'entity') return null;
  return state.interaction.liveMarkers().find((marker) => marker.id === selection.id
    && marker.entityKind === selection.entityKind && marker.spaceId === selection.spaceId) ?? null;
}

function currentRuntimeObjectAvailability(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
  marker: MapEditorLiveMarker | null = selectedRuntimeObjectMarker(state),
) {
  const view = context.controller.liveAdapter()?.view();
  return mapRuntimeObjectAvailability({
    mapId,
    routeAccess: context.route.access,
    connected: view?.connected === true,
    role: view?.role ?? null,
    hasLiveApi: state.runtimeObjectModel !== null,
    marker,
  });
}

function runtimeObjectReason(marker: MapEditorLiveMarker, operation: MapRuntimeObjectDraft['operation']): string {
  const verb = operation === 'move_entity' ? 'Move'
    : operation === 'repair_entity' ? 'Repair' : 'Safely despawn';
  return `${verb} ${marker.label} ${marker.id} from Map Editor`;
}

function requestRuntimeObjectPreview(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
  draft: MapRuntimeObjectDraft,
  target: Readonly<{ readonly tileX: number; readonly tileY: number; readonly elevation: number }> | null = null,
): void {
  if (state.runtimeObjectCommitting) return;
  const marker = state.runtimeObjectMarker ?? selectedRuntimeObjectMarker(state);
  const availability = currentRuntimeObjectAvailability(state, context, mapId, marker);
  const model = state.runtimeObjectModel;
  if (!availability.allowed || marker === null || model === null) {
    context.controller.notifications.push('error', 'Runtime object action unavailable',
      availability.allowed ? 'No runtime object is selected' : availability.reason);
    resetRuntimeObjectAction(state);
    context.invalidate();
    return;
  }
  const request = ++state.runtimeObjectRequest;
  model.cancel();
  state.runtimeObjectMarker = marker;
  state.runtimeObjectMoveMode = false;
  state.runtimeObjectTarget = target;
  state.runtimeObjectPreviewing = true;
  void model.preview(marker, draft, runtimeObjectReason(marker, draft.operation)).catch((error: unknown) => {
    if (request !== state.runtimeObjectRequest || state.disposed) return;
    resetRuntimeObjectAction(state);
    reportCanvasError(context, 'Runtime object preview failed', error);
  }).finally(() => {
    if (request !== state.runtimeObjectRequest || state.disposed) return;
    state.runtimeObjectPreviewing = false;
    context.invalidate();
  });
  context.invalidate();
}

function startRuntimeObjectAction(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
  operation: MapRuntimeObjectDraft['operation'],
): void {
  const marker = selectedRuntimeObjectMarker(state);
  const availability = currentRuntimeObjectAvailability(state, context, mapId, marker);
  if (!availability.allowed || marker === null) return;
  resetLiveSpawn(state);
  state.resizeMode = false;
  cancelMapResize(state);
  resetRuntimeObjectAction(state);
  state.runtimeObjectMarker = marker;
  if (operation === 'move_entity') {
    state.runtimeObjectMoveMode = true;
    context.invalidate();
    return;
  }
  requestRuntimeObjectPreview(state, context, mapId, { operation });
}

function requestRuntimeObjectMovePreview(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
  point: { readonly x: number; readonly y: number },
): boolean {
  if (!state.runtimeObjectMoveMode || state.runtimeObjectCommitting) return false;
  const target = state.interaction.tileAtPoint(point);
  if (target === null) return true;
  requestRuntimeObjectPreview(state, context, mapId, {
    operation: 'move_entity', tileX: target.tileX, tileY: target.tileY,
  }, target);
  return true;
}

function confirmRuntimeObjectAction(state: MapCanvasState, context: StudioCanvasToolContext): void {
  const model = state.runtimeObjectModel;
  const receipt = model?.pending();
  if (model === null || receipt === null || state.runtimeObjectCommitting) return;
  const request = ++state.runtimeObjectRequest;
  state.runtimeObjectCommitting = true;
  void model.commit(true).then((result) => {
    if (request !== state.runtimeObjectRequest || state.disposed) return;
    context.controller.notifications.push('success', 'Runtime object changed',
      `${result.preview.operation.replaceAll('_', ' ')} · audit ${result.audit?.id ?? 'missing'}`);
    resetRuntimeObjectAction(state);
    context.invalidate();
  }).catch((error: unknown) => {
    if (request !== state.runtimeObjectRequest || state.disposed) return;
    resetRuntimeObjectAction(state);
    reportCanvasError(context, 'Runtime object commit failed', error);
  }).finally(() => {
    if (request === state.runtimeObjectRequest && !state.disposed) context.invalidate();
  });
  context.invalidate();
}

function selectedNpcLocationMarker(state: MapCanvasState): MapNpcLocationMarker | null {
  const marker = selectedRuntimeObjectMarker(state);
  return marker?.entityKind === 'npc' ? marker : null;
}

function currentNpcLocationAvailability(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
  marker: MapNpcLocationMarker | null = selectedNpcLocationMarker(state),
) {
  const view = context.controller.liveAdapter()?.view();
  return mapNpcLocationAvailability({
    mapId,
    routeAccess: context.route.access,
    connected: view?.connected === true,
    role: view?.role ?? null,
    hasLiveApi: state.npcLocationModel !== null,
    marker,
  });
}

function startNpcLocationAction(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
): void {
  const marker = selectedNpcLocationMarker(state);
  const availability = currentNpcLocationAvailability(state, context, mapId, marker);
  if (!availability.allowed || marker === null) return;
  resetLiveSpawn(state);
  resetRuntimeObjectAction(state);
  state.resizeMode = false;
  cancelMapResize(state);
  resetNpcLocationAction(state);
  state.npcLocationMarker = marker;
  state.npcLocationMoveMode = true;
  context.invalidate();
}

function requestNpcLocationPreview(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
  point: { readonly x: number; readonly y: number },
): boolean {
  if (!state.npcLocationMoveMode || state.npcLocationCommitting) return false;
  const target = state.interaction.tileAtPoint(point);
  if (target === null) return true;
  const marker = state.npcLocationMarker ?? selectedNpcLocationMarker(state);
  const availability = currentNpcLocationAvailability(state, context, mapId, marker);
  const model = state.npcLocationModel;
  if (!availability.allowed || marker === null || model === null) {
    context.controller.notifications.push('error', 'NPC home action unavailable',
      availability.allowed ? 'No authored NPC is selected' : availability.reason);
    resetNpcLocationAction(state);
    context.invalidate();
    return true;
  }
  const request = ++state.npcLocationRequest;
  model.cancel();
  state.npcLocationTarget = target;
  state.npcLocationMoveMode = false;
  state.npcLocationPreviewing = true;
  void model.preview(marker, target.tileX, target.tileY,
    `Move ${marker.label} ${marker.id} home and location from Map Editor`)
    .catch((error: unknown) => {
      if (request !== state.npcLocationRequest || state.disposed) return;
      resetNpcLocationAction(state);
      reportCanvasError(context, 'NPC home preview failed', error);
    }).finally(() => {
      if (request !== state.npcLocationRequest || state.disposed) return;
      state.npcLocationPreviewing = false;
      context.invalidate();
    });
  context.invalidate();
  return true;
}

function confirmNpcLocationAction(state: MapCanvasState, context: StudioCanvasToolContext): void {
  const model = state.npcLocationModel;
  const receipt = model?.pending();
  if (model === null || receipt == null || state.npcLocationCommitting) return;
  const request = ++state.npcLocationRequest;
  state.npcLocationCommitting = true;
  void model.commit(true).then((result) => {
    if (request !== state.npcLocationRequest || state.disposed) return;
    context.controller.notifications.push('success', 'NPC home and location changed',
      `${receipt.displayName} · audit ${result.audit?.id ?? 'missing'}`);
    resetNpcLocationAction(state);
    context.invalidate();
  }).catch((error: unknown) => {
    if (request !== state.npcLocationRequest || state.disposed) return;
    resetNpcLocationAction(state);
    reportCanvasError(context, 'NPC home commit failed', error);
  }).finally(() => {
    if (request === state.npcLocationRequest && !state.disposed) context.invalidate();
  });
  context.invalidate();
}

function beginCatalogLoad(state: MapCanvasState, context: StudioCanvasToolContext): void {
  if (state.catalogLoading || state.catalogReady) return;
  state.catalogLoading = true;
  void loadGeneratedAssetCatalog().then((catalog) => {
    state.catalogPalette = buildAssetPalette(catalog);
    state.catalogAssetRevision = catalog.revision;
    state.catalogReady = true;
    syncContentObjectCatalog(state, context);
  }).catch((error: unknown) => {
    reportCanvasError(context, 'Map asset library failed', error);
  }).finally(() => {
    state.catalogLoading = false;
    context.invalidate();
  });
}

function previewAsset(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  assetName: string,
): LoadedAsset | null {
  const loaded = state.previewAssets.get(assetName);
  if (loaded !== undefined) return loaded;
  if (!state.previewLoading.has(assetName) && !state.previewFailures.has(assetName)) {
    state.previewLoading.add(assetName);
    void loadGeneratedAsset(assetName, 'summer').then((asset) => {
      state.previewAssets.set(assetName, asset);
    }).catch(() => {
      // Optional thumbnail failure leaves the semantic tool or prefab usable;
      // its authored UI-LAB glyph remains visible as the fallback.
      state.previewFailures.add(assetName);
    }).finally(() => {
      state.previewLoading.delete(assetName);
      context.invalidate();
    });
  }
  return null;
}

function firstPreviewFrame(asset: LoadedAsset): AtlasFrame | null {
  return Object.values(asset.metadata.states ?? {})[0]
    ?? Object.values(asset.metadata.variants ?? {})[0]?.[0]
    ?? Object.values(asset.metadata.animations)[0]?.[0]
    ?? null;
}

function prefabPreview(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  prefab: ReturnType<MapEditorController['palette']>[number],
): { readonly image: CanvasImageSource; readonly frame: AtlasFrame } | undefined {
  const placement = prefab.placements[0];
  if (placement === undefined) return undefined;
  const asset = previewAsset(state, context, placement.assetName);
  if (asset === null) return undefined;
  const catalogFrame = state.catalogItems.get(prefab.id)?.frame;
  const frame = catalogFrame ?? (placement.visual.kind === 'state'
    ? asset.metadata.states?.[placement.visual.name]
    : placement.visual.kind === 'variant'
      ? asset.metadata.variants?.[placement.visual.name]?.[placement.visual.frameIndex]
      : asset.metadata.animations[placement.visual.name]?.[placement.visual.frameIndex])
    ?? firstPreviewFrame(asset);
  return frame === null || frame === undefined ? undefined : { image: asset.image, frame };
}

function terrainChoicePreview(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  preview: TerrainPalettePreview,
): { readonly image: CanvasImageSource; readonly frame: AtlasFrame } | undefined {
  const asset = previewAsset(state, context, preview.assetId);
  if (asset === null) return undefined;
  const frame = selectAtlasFrame(asset.metadata, 'base', preview.frameIndex)
    ?? Object.values(asset.metadata.states ?? {})[preview.frameIndex]
    ?? firstPreviewFrame(asset);
  return frame === null || frame === undefined ? undefined : { image: asset.image, frame };
}

function pointInside(point: { readonly x: number; readonly y: number }, bounds: UiRect): boolean {
  return point.x >= bounds.x && point.y >= bounds.y
    && point.x <= bounds.x + bounds.width && point.y <= bounds.y + bounds.height;
}

export function selectedGeneratedMapDescriptor(
  document: MapDocumentV3,
  selection: StudioSelection,
  liveMarkers: ReturnType<MapEditorController['liveMarkers']>,
  terrain?: TerrainArray,
): MapGeneratedSelectionDescriptor | null {
  if (selection.kind !== 'entity' && selection.kind !== 'player') return null;
  if (selection.kind === 'entity' && (document.objects.some(({ id }) => id === selection.id)
    || document.landmarks.some(({ id }) => id === selection.id))) return null;
  const marker = liveMarkers.find((candidate) => selection.kind === 'player'
    ? candidate.entityKind === 'player' && candidate.id === selection.identity
      && (selection.spaceId === null || candidate.spaceId === selection.spaceId)
    : candidate.entityKind === selection.entityKind && candidate.id === selection.id
      && candidate.spaceId === selection.spaceId);
  if (marker === undefined) return null;
  const terrainIndex = marker.tileY * (terrain?.width ?? 0) + marker.tileX;
  const resolvedElevation = marker.elevation
    ?? (terrain !== undefined && marker.tileX >= 0 && marker.tileY >= 0
      && marker.tileX < terrain.width && marker.tileY < terrain.height
      ? terrain.elevations[terrainIndex]
      : undefined)
    ?? document.cells[`${marker.tileX},${marker.tileY}`]?.elevation
    ?? document.baseElevation;
  const details = [
    ...(marker.open === undefined ? [] : [{ label: 'Open', value: marker.open ? 'YES' : 'NO' }]),
    ...(marker.lit === undefined ? [] : [{ label: 'Lit', value: marker.lit ? 'YES' : 'NO' }]),
    ...(marker.facing === undefined ? [] : [{ label: 'Facing', value: marker.facing.toUpperCase() }]),
    ...(marker.moving === undefined ? [] : [{ label: 'Moving', value: marker.moving ? 'YES' : 'NO' }]),
    ...(marker.activity === undefined ? [] : [{ label: 'Activity', value: marker.activity.toUpperCase() }]),
    ...(marker.health === undefined ? [] : [{ label: 'Health', value: marker.maxHealth === undefined
      ? String(marker.health) : `${marker.health} / ${marker.maxHealth}` }]),
    ...(marker.homeTileX === undefined || marker.homeTileY === undefined
      ? [] : [{ label: 'Home', value: `${marker.homeTileX}, ${marker.homeTileY}` }]),
    ...(marker.playerControlled === true ? [{ label: 'Custody', value: 'PLAYER RIDER' }] : []),
    ...(marker.systemControlled === true ? [{ label: 'Authority', value: 'GENERATED WILDLIFE' }] : []),
  ];
  return {
    entityKind: marker.entityKind,
    id: marker.id,
    spaceId: marker.spaceId,
    name: marker.label,
    tileX: marker.tileX,
    tileY: marker.tileY,
    elevation: resolvedElevation,
    layer: marker.layer,
    source: `live-world:${marker.entityKind}`,
    provenance: 'live',
    runtimeKind: marker.kind,
    details,
    suppressionId: marker.entityKind === 'resource' ? `resource-${marker.id}` : null,
  };
}

function generatedDescriptorKey(descriptor: MapGeneratedSelectionDescriptor | null): string {
  return descriptor === null ? '' : [
    descriptor.entityKind, descriptor.id, descriptor.spaceId, descriptor.name,
    descriptor.tileX, descriptor.tileY, descriptor.elevation, descriptor.layer,
    descriptor.source, descriptor.provenance ?? '', descriptor.runtimeKind ?? '',
    descriptor.details?.map(({ label, value }) => `${label}:${value}`).join(',') ?? '',
    descriptor.suppressionId ?? '',
  ].join('|');
}

function selectionInspection(state: MapCanvasState): MapSelectionInspection | null {
  const document = state.model.document();
  const selection = state.model.selection();
  // Live subscriptions can invalidate the canvas many times per second. No
  // selection means there is no upper drawer to build, so do not even touch
  // the potentially large live-marker collection.
  if (selection.kind !== 'tile' && selection.kind !== 'entity' && selection.kind !== 'player') return null;
  const interaction = state.interaction.snapshot();
  const hiddenLayers = document.layers.filter(({ id }) => !state.model.isLayerRendered(id)).map(({ id }) => id);
  const hiddenKey = hiddenLayers.join('|');
  const authoredEntity = selection.kind === 'entity' && (
    selection.entityKind === 'map-object' && (
      document.objects.some(({ id }) => id === selection.id)
      || document.landmarks.some(({ id }) => id === selection.id)
    ) || selection.entityKind === 'map-anchor'
      && document.anchors.some(({ id }) => id === selection.id)
  );
  const liveSelection = selection.kind === 'player' || (selection.kind === 'entity' && !authoredEntity);
  const liveTerrain = liveSelection
    ? state.renderer.inspectionTerrain(state.model.terrainIdentity())
    : null;
  if (liveSelection && liveTerrain === null) return null;
  const generatedEntity = liveSelection
    ? selectedGeneratedMapDescriptor(document, selection, state.interaction.liveMarkers(), liveTerrain ?? undefined)
    : null;
  const generatedEntityKey = generatedDescriptorKey(generatedEntity);
  const cached = state.inspectionCache;
  if (cached?.document === document && cached.selection === selection
    && cached.activeLayer === interaction.activeLayer && cached.hiddenKey === hiddenKey
    && cached.generatedEntityKey === generatedEntityKey) return cached.inspection;

  const generatedEntities = generatedEntity === null ? [] : [generatedEntity];
  const resolvable = selection.kind === 'tile' || (selection.kind === 'entity' && (
    authoredEntity || generatedEntities.some(({ id, entityKind, spaceId }) => id === selection.id
      && entityKind === selection.entityKind && spaceId === selection.spaceId)
  )) || (selection.kind === 'player' && generatedEntities.some(({ id, entityKind, spaceId }) => (
    entityKind === 'player' && id === selection.identity
      && (selection.spaceId === null || spaceId === selection.spaceId)
  )));
  let inspection: MapSelectionInspection | null = null;
  if (resolvable) {
    const renderedTerrain = liveTerrain
      ?? state.renderer.inspectionTerrain(state.model.terrainIdentity());
    // Selection is an input hot path. The renderer produces this exact terrain
    // asynchronously for canonical, authored, and noncanonical maps alike;
    // wait for it rather than compiling 832x832 cells in the pointer frame.
    if (renderedTerrain === null) return null;
    inspection = inspectMapSelection({
      document,
      selection,
      activeLayer: interaction.activeLayer,
      hiddenLayers,
      generatedEntities,
      terrain: renderedTerrain,
    });
  }
  state.inspectionCache = { document, selection, activeLayer: interaction.activeLayer,
    hiddenKey, generatedEntityKey, inspection };
  return inspection;
}

function exportMapDraft(state: MapCanvasState, context: StudioCanvasToolContext): void {
  const prepared = createMapDocumentExport(state.model.document());
  if (!prepared.ok) {
    context.controller.notifications.push('error', 'Map export failed', prepared.error.message);
    context.invalidate();
    return;
  }
  const download = requestStudioFileDownload(prepared.payload);
  if (!download.ok) {
    context.controller.notifications.push('error', 'Map export unavailable', download.message);
    context.invalidate();
    return;
  }
  context.controller.notifications.push(
    'success',
    'Map download requested',
    `${prepared.payload.filename} · ${prepared.payload.byteLength.toLocaleString()} bytes`,
  );
  context.invalidate();
}

interface MapKitPaletteChoice { readonly id:string; readonly label:string; readonly apply:()=>void; readonly preview?:()=>{readonly image:CanvasImageSource;readonly frame:AtlasFrame}|undefined;readonly symbol?:UiIconName;readonly active?:boolean;readonly disabled?:boolean;readonly tone?:UiTone;readonly glyph?:string }
function mapKitPaletteChoices(state:MapCanvasState,context:StudioCanvasToolContext,query:string):{choices:MapKitPaletteChoice[];empty:string} {
  const interaction = state.interaction;
  if (interaction.editingTool() !== 'objects') return {
    choices: mapMaterialChoices(state.terrainPalette,query).map(choice=>({
      id:`map-material-${choice.id}`, label:choice.label,
      apply:()=>{interaction.selectMaterial(choice.id,choice.label,choice.patch,choice.biome);context.invalidate();},
      preview:()=>terrainChoicePreview(state,context,choice.preview),
      active:interaction.materialId()===choice.id, symbol:'landPlot', disabled:!interaction.terrainAuthoringAvailable(),
    })), empty:'No matching terrain',
  };
  return {choices:interaction.allObjectChoices(query)
    .filter(prefab=>state.objectFilter==='all'||mapObjectCategory(prefab)===state.objectFilter)
    .map(prefab=>({id:`map-prefab-${prefab.id}`,label:prefab.title,
      apply:()=>{interaction.selectObjectChoice(prefab.id);context.invalidate();},
      preview:()=>prefabPreview(state,context,prefab),symbol:'box',
      active:interaction.snapshot().selectedPrefabId===prefab.id,
    })),empty:state.catalogLoading?'Loading objects':'No matching objects'};
}

function mapKitPalette(state:MapCanvasState,context:StudioCanvasToolContext):UiElement {
  const children:UiElement[]=[];
  children.push(kit.input({id:'map-object-search',label:'Search palette',placeholder:'Search palette',editor:state.search,
    onChange:()=>{state.paletteOffset=0;context.invalidate();}}));
  if(state.interaction.editingTool()==='objects') {
    const symbols:Record<MapObjectFilter,UiIconName>={all:'grid',plants:'sprout',fences:'cave',buildings:'map',prefabs:'package',other:'box'};
    children.push(kit.grid({columns:3,columnWidth:uiFixed(24),rowHeight:uiFixed(24),gap:4,height:uiFixed(52),shrink:0},
      MAP_OBJECT_FILTERS.map(filter=>kit.tooltip(filter[0]!.toUpperCase()+filter.slice(1),kit.iconButton({lucide:symbols[filter]},
        {id:`map-filter-${filter}`,label:`Filter ${filter}`,tone:state.objectFilter===filter?'success':'primary',onPress:()=>{
          state.objectFilter=filter;state.paletteOffset=0;context.invalidate();}}),{width:uiFixed(24),height:uiFixed(24)}))));
  }
  const result=mapKitPaletteChoices(state,context,state.search.snapshot().value);
  if(result.choices.length===0)children.push(kit.text(result.empty,{id:'map-palette-empty'}));
  let columns=mapPaletteColumns(context.controlsBounds.width/2);
  const rows=()=>Array.from({length:Math.ceil(result.choices.length/columns)},(_,index)=>result.choices.slice(index*columns,(index+1)*columns));
  const list=kit.list<readonly MapKitPaletteChoice[]>({id:'map-palette-list',label:'Placement palette',items:rows(),key:row=>row[0]!.id,
    rowHeight:uiFixed(28),rowPadding:0,layout:{width:'grow',height:'grow',minHeight:uiFixed(28)},initialScrollY:state.paletteOffset,
    onScroll:element=>{state.paletteOffset=element.scroll.y;},
    onArrange:element=>{const next=mapPaletteColumns(element.contentRect.width);if(next!==columns){columns=next;element.setProps({items:rows()},false);}},
    render:row=>kit.grid({columns,columnWidth:uiFixed(24),rowHeight:uiFixed(24),gap:4,width:'grow',height:uiFixed(24)},row.map(choice=>{
      const preview=choice.preview?.();
      const control=kit.button({id:choice.id,label:'',ariaLabel:choice.label,disabled:choice.disabled,size:'md',
        tone:choice.active?'success':'primary',layout:{width:uiFixed(24),height:uiFixed(24),padding:2},onPress:choice.apply,
        children:[preview?kit.image(preview.image,preview.frame,{label:choice.label,fit:'contain',integerScale:true,layout:{width:'grow',height:'grow'}})
          :kit.icon({lucide:choice.symbol??'box'},{layout:{width:'grow',height:'grow'}}),
          ...(choice.active?[new UiElement({kind:'palette-selection-reticle',style:{position:'absolute',inset:{left:0,right:0,top:0,bottom:0}},
            paintOverlay(element,{context:ctx}) {const r=element.rect;ctx.save();ctx.strokeStyle='#fff4ad';ctx.lineWidth=1;
              ctx.beginPath();for(const [x,y,dx,dy] of [[r.x,r.y,1,1],[r.x+r.width,r.y,-1,1],[r.x,r.y+r.height,1,-1],[r.x+r.width,r.y+r.height,-1,-1]]){
                ctx.moveTo(x!+dx!*5,y!);ctx.lineTo(x!,y!);ctx.lineTo(x!,y!+dy!*5);
              }ctx.stroke();ctx.restore();}})]:[])]});
      return kit.tooltip(choice.label,control,{width:uiFixed(24),height:uiFixed(24)});
    })),
  });
  children.push(list);
  state.paletteBounds={x:0,y:0,width:0,height:0};state.paletteRowCount=result.choices.length;state.paletteVisibleRows=4;
  return kit.flex({width:'grow',height:'grow',gap:4},children);
}

function appendLeftDrawer(state: MapCanvasState, context: StudioCanvasToolContext,
  parts: MapCanvasParts, mapId: string): void {
  const document = state.model.document();

  const resizeAvailability = state.model.resizeAvailability();
  if (state.resizeImpact !== null && (state.resizeImpact.sourceHash !== mapDocumentV3Hash(document)
    || !resizeAvailability.allowed)) cancelMapResize(state);
  if (!resizeAvailability.allowed) state.resizeMode = false;

  let interactionSnapshot = state.interaction.snapshot();
  if (interactionSnapshot.selectedAnchorKind !== null
    && !state.interaction.anchorPlacementAvailable()) {
    state.interaction.selectAnchorKind(null);
    interactionSnapshot = state.interaction.snapshot();
  }

  const liveSpawnAvailability = currentLiveSpawnAvailability(state, context, mapId);
  if (state.liveSpawnMode && !liveSpawnAvailability.allowed && !state.liveSpawnCommitting) {
    resetLiveSpawn(state);
  }
  const command=(id:string,label:string,icon:UiIconName,onPress:()=>void,active=false)=>kit.tooltip(label,
    kit.iconButton({lucide:icon},{id:`map-${id}`,label,onPress,tone:active?'success':'primary'}),{width:uiFixed(24),height:uiFixed(24)});
  const tool=state.interaction.editingTool();
  const choose=(value:NonNullable<ReturnType<MapEditorController['editingTool']>>)=>{
    resetLiveSpawn(state);state.interaction.selectEditingTool(value);state.paletteOffset=0;context.invalidate();
  };
  const selectedName=tool==='objects'
    ? state.interaction.allObjectChoices().find(prefab=>prefab.id===interactionSnapshot.selectedPrefabId)?.title??state.model.document().prefabs.find(prefab=>prefab.id===interactionSnapshot.selectedPrefabId)?.title??'Select an object'
    : state.interaction.materialLabel();
  parts.kit.controls=studioLibraryDrawer([
    kit.grid({columns:3,columnWidth:uiFixed(24),rowHeight:uiFixed(24),gap:4,height:uiFixed(52),shrink:0},[
      command('tool-objects','Select objects','pointer',()=>choose('objects'),tool==='objects'&&!interactionSnapshot.eyedropperActive),
      command('tool-terrain','Paint terrain','landPlot',()=>choose('terrain'),tool==='terrain'&&!interactionSnapshot.eyedropperActive),
      command('tool-raise','Raise terrain','mountain',()=>choose('raise'),tool==='raise'&&!interactionSnapshot.eyedropperActive),
      command('tool-lower','Lower terrain','moveDown',()=>choose('lower'),tool==='lower'&&!interactionSnapshot.eyedropperActive),
      command('tool-fill','Flood fill terrain','waves',()=>choose('fill'),tool==='fill'&&!interactionSnapshot.eyedropperActive),
      command('eyedropper','Sample selected object or terrain (I)','penTool',()=>{state.interaction.toggleEyedropper();context.invalidate();},interactionSnapshot.eyedropperActive),
    ]),
  ],mapKitPalette(state,context),[
    kit.text(selectedName,{id:'map-selected-material',maxLines:2,layout:{width:'grow'}}),
    kit.tooltip('Automatically generate surrounding terrain and connect neighboring objects',
      kit.checkbox({id:'map-auto-generation',label:'Auto surround',value:state.interaction.automaticGeneration(),
        onChange:value=>{state.interaction.setAutomaticGeneration(value===true);context.invalidate();}}),{width:'grow',shrink:0}),
  ]);
}

/** Overlay content uses the same retained hit tree as the surrounding workbench.
 * The panel consumes background input; the rest of the map stays interactive
 * while a move/spawn operation is waiting for a destination. */
interface MapCanvasParts {
  readonly kit: { controls?: UiElement; inspector?: UiElement; annotations?: UiElement; overlays?: UiElement };
}
function reportCanvasError(context: StudioCanvasToolContext, title: string, error: unknown): void {
  context.controller.notifications.push('error', title, error instanceof Error ? error.message : String(error));
  context.invalidate();
}

function appendMapOverlayPanel(
  parts: MapCanvasParts, context: StudioCanvasToolContext,
  id: string, children: readonly UiElement[],
): void {
  parts.kit.overlays?.append(kit.frame({ id: `map-${id}-panel`, style: 'thin', blockInput: true,
    layout: { position: 'absolute', inset: { left: 8, right: 8, top: uiFixed(40) },
      height: uiFixed(Math.max(80, Math.min(280, context.workspaceBounds.height / 2 - 48))),
      overflow: 'scroll-y', gap: 8 }, children,
  }));
}

function mapOverlayAction(
  id: string, label: string, onPress: () => void,
  options: { readonly disabled?: boolean; readonly tone?: UiTone } = {},
): UiElement {
  const caption = id.endsWith('-cancel') ? 'Cancel'
    : id.endsWith('-confirm') ? 'Confirm'
    : id === 'schema-action-proceed' ? label.startsWith('Preview') ? 'Preview change' : 'Confirm change'
    : id === 'publish-conflict-reload' ? 'Reload live map'
    : id === 'publish-conflict-keep-local' ? 'Keep local draft'
    : id === 'publish-conflict-export' ? 'Export local draft' : label;
  return kit.tooltip(label, kit.button({ id: `map-${id}`, label: caption, onPress, ...options,
    layout: { width: 'grow', shrink: 0 } }), { width: 'grow', shrink: 0 });
}

function appendAnchorAnnotation(state: MapCanvasState, context: StudioCanvasToolContext, parts: MapCanvasParts): void {
  const selection = state.model.selection();
  if (selection.kind !== 'entity' || selection.entityKind !== 'map-anchor' || selection.spaceId !== 0
    || !state.model.isLayerVisible('anchors')) return;
  const anchor = state.model.document().anchors.find(anchor => anchor.id === selection.id);
  const terrain = state.renderer.inspectionTerrain(state.model.terrainIdentity());
  if (!anchor || !terrain) return;
  const { viewport, camera } = state.interaction.snapshot();
  const point = mapGameplayAnchorMarkerScreenPosition(anchor, terrain, viewport, camera);
  if (point.x < viewport.x || point.y < viewport.y || point.x >= viewport.x + viewport.width || point.y >= viewport.y + viewport.height) return;
  const width = Math.min(200, context.workspaceBounds.width / 2);
  parts.kit.annotations = kit.stack({ width: 'grow', height: 'grow' }, [kit.speechBubble({
    id: 'map-anchor-annotation', text: `${anchor.kind.toUpperCase()} · ${anchor.id} · RUNTIME UNBOUND`,
    tone: 'info', tail: 'down', maxWidth: uiFixed(width),
    layout: { position: 'absolute', inset: {
      left: uiFixed(Math.max(0, Math.min(context.workspaceBounds.width / 2 - width, (point.x - viewport.x) / 2 - width / 2))),
      top: uiFixed(Math.max(0, (point.y - viewport.y) / 2 - 48)),
    }, width: uiFixed(width) },
  })]);
}

function armLiveSpawn(state: MapCanvasState, context: StudioCanvasToolContext, mapId: string): void {
  if (state.liveSpawnMode) { resetLiveSpawn(state); context.invalidate(); return; }
  const definitionId = selectedLiveSpawnDefinition(state);
  if (!currentLiveSpawnAvailability(state, context, mapId).allowed || definitionId === null) return;
  state.resizeMode = false; cancelMapResize(state); state.liveSpawnMode = true;
  state.liveSpawnDefinitionId = definitionId;
  state.liveSpawnPrefabId = state.interaction.snapshot().selectedPrefabId;
  context.invalidate();
}

function heightArrow(direction: number): UiElement {
  return new UiElement({kind:'height-arrow',style:{width:'grow',height:'grow'},paintOverlay(element,{context}) {
    const x=element.rect.x+element.rect.width/2,y=element.rect.y+element.rect.height/2;
    context.save();context.strokeStyle='#202536';context.lineWidth=2;context.beginPath();
    context.moveTo(x,y-direction*5);context.lineTo(x,y+direction*5);
    context.moveTo(x-4,y+direction);context.lineTo(x,y+direction*5);context.lineTo(x+4,y+direction);
    context.stroke();context.restore();
  }});
}

function appendWorldOverlayControls(
  state: MapCanvasState, context: StudioCanvasToolContext, parts: MapCanvasParts,
): void {
  const snapshot = state.interaction.snapshot();
  if(snapshot.terrainAuthoringFeedback)parts.kit.overlays?.append(kit.text(snapshot.terrainAuthoringFeedback,{id:'map-tool-feedback',maxLines:3,layout:{position:'absolute',inset:{left:8,bottom:8},width:uiFixed(260)}}));
  const view=context.controller.liveAdapter()?.view();
  const publish=mapEditorPublishPresentation({dirty:state.model.dirty(),publishing:state.model.publishing()||view?.publishingMap===true,
    conflictRevision:state.model.conflictRevision(),validation:state.model.validationState(),baseRevision:state.model.baseRevision(),
    connected:view?.connected===true,synchronizing:view?.synchronizing===true,authorized:context.route.access==='write'&&studioRoleCan(view?.role??null,'publish_map'),
    publishAvailable:context.controller.liveAdapter()?.publishMap!==undefined});
  parts.kit.overlays?.append(kit.flex({ direction:'row',gap:4,position:'absolute',inset:{left:8,top:8},height:uiFixed(24) },[
    kit.tooltip('Edit lower height level ([)',kit.button({children:[heightArrow(1)],id:'map-height-down',label:'',ariaLabel:'Lower active height',disabled:snapshot.activeElevation<=-8,
      layout:{width:uiFixed(24)},onPress:()=>{state.interaction.adjustActiveElevation(-1);context.invalidate();}})),
    kit.text(`Height ${snapshot.activeElevation}`,{id:'map-current-height',layout:{width:uiFixed(64)}}),
    kit.tooltip('Edit higher height level (])',kit.button({children:[heightArrow(-1)],id:'map-height-up',label:'',ariaLabel:'Raise active height',disabled:snapshot.activeElevation>=8,
      layout:{width:uiFixed(24)},onPress:()=>{state.interaction.adjustActiveElevation(1);context.invalidate();}})),
    kit.tooltip('Undo',kit.iconButton({lucide:'undo'},{id:'map-undo',label:'Undo',disabled:!state.model.canUndo(),onPress:()=>{state.interaction.undo();context.invalidate();}})),
    kit.tooltip('Redo',kit.iconButton({lucide:'redo'},{id:'map-redo',label:'Redo',disabled:!state.model.canRedo(),onPress:()=>{state.interaction.redo();context.invalidate();}})),
    kit.tooltip('Frame map',kit.iconButton({lucide:'map'},{id:'map-frame-map',label:'Frame map',onPress:()=>{state.interaction.frameMap();context.invalidate();}})),
    kit.tooltip('Export map',kit.iconButton({lucide:'export'},{id:'map-export',label:'Export map',onPress:()=>exportMapDraft(state,context)})),
    kit.tooltip('Resize map',kit.iconButton({lucide:'scale'},{id:'map-resize-mode',label:state.model.resizeAvailability().reason??'Resize map',disabled:!state.model.resizeAvailability().allowed,onPress:()=>{state.resizeMode=!state.resizeMode;cancelMapResize(state);context.invalidate();}})),
    kit.tooltip('Place functional live entity',kit.iconButton({lucide:'gamepad'},{id:'map-live-spawn-mode',label:state.liveSpawnMode?'Cancel functional live entity spawn (Escape)':'Spawn selected object as a functional live entity',tone:state.liveSpawnMode?'success':'primary',disabled:!currentLiveSpawnAvailability(state,context,studioMapId(context.route.path)).allowed,onPress:()=>armLiveSpawn(state,context,studioMapId(context.route.path))})),
    kit.tooltip(publish.tooltip,kit.iconButton({lucide:'cloudPublish'},{id:'map-publish',label:publish.tooltip,disabled:publish.disabled,onPress:()=>state.autoPublish.requestManual()})),
  ]));
}

function appendResizeOverlay(
  state: MapCanvasState, context: StudioCanvasToolContext, parts: MapCanvasParts,
): void {
  const document = state.model.document(), availability = state.model.resizeAvailability();
  if (!availability.allowed || (!state.resizeMode && state.resizeImpact === null)) return;
  if (state.resizeImpact === null) {
    appendMapOverlayPanel(parts, context, 'resize-edges', [kit.text('Resize map', { role: 'header' }),
      ...(['west', 'east', 'north', 'south'] as const).map(edge => {
        const dimension = edge === 'west' || edge === 'east' ? document.width : document.height;
        return kit.flex({ direction: 'row', gap: 4, width: 'grow', shrink: 0 }, [
          mapOverlayAction(`resize-${edge}-shrink`, `Crop ${edge}`, () => requestMapResize(state, context, edge, false),
            { tone: 'danger', disabled: dimension <= 1 }),
          mapOverlayAction(`resize-${edge}-grow`, `Grow ${edge}`, () => requestMapResize(state, context, edge, true)),
        ]);
      }), mapOverlayAction('resize-cancel', 'Cancel map resize (Escape)', () => { cancelMapResize(state); context.invalidate(); }),
    ]);
    return;
  }
  const impact = state.resizeImpact;
  const objectLoss = impact.removedObjectIds.length + impact.removedLandmarkIds.length;
  const transitionLoss = impact.removedTransitionCount + impact.removedStairRunCount;
  const otherLoss = mapResizeImpactLossCount(impact) - objectLoss - transitionLoss;
  appendMapOverlayPanel(parts, context, 'resize-preview', [
    kit.text(`CROP ${impact.edge.toUpperCase()} · ${impact.command.width}×${impact.command.height} · ${impact.croppedTileCount} TILES`,
      { id: 'map-resize-preview-dimensions', layout: { width: 'grow' } }),
    kit.text(`OBJECT ${objectLoss} · TRANSITION ${transitionLoss} · OTHER ${otherLoss}`,
      { id: 'map-resize-preview-loss', layout: { width: 'grow' } }),
    mapOverlayAction('resize-cancel', 'Cancel map crop (Escape)', () => { cancelMapResize(state); context.invalidate(); }),
    mapOverlayAction('resize-confirm', `Confirm destructive ${impact.edge} edge crop (Enter)`,
      () => confirmMapResize(state, context), { tone: 'danger' }),
  ]);
}

function appendLiveSpawnOverlay(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: MapCanvasParts,
): void {
const children:UiElement[]=[];
if (!state.liveSpawnMode || state.liveSpawnTarget === null) return;
const receipt: MapSpawnHereReceipt | null = state.liveSpawnModel?.pending() ?? null;
children.push(kit.text(state.liveSpawnCommitting ? 'SPAWNING LIVE ENTITY' : 'LIVE ENTITY PREVIEW',{id:'map-'+'live-spawn-ribbon',layout:{width:'grow'}}));
const displayName = receipt?.displayName ?? liveSpawnDisplayName(state) ?? 'Functional entity';
children.push(kit.text(`${displayName.toUpperCase()} · TILE ${state.liveSpawnTarget.tileX},${state.liveSpawnTarget.tileY} · SPACE ${TOPSIDE_SPACE_ID}`,{id:'map-'+'live-spawn-target',layout:{width:'grow'}}));
children.push(kit.text(receipt === null
    ? 'AUTHORITY CHECK · VALIDATING'
    : `AUTHORITY ${receipt.authority.toUpperCase()} · REASON ${receipt.reason}`,{id:'map-'+'live-spawn-authority',layout:{width:'grow'}}));
children.push(kit.text(receipt === null
    ? 'CONTENT HEAD · VALIDATING'
    : `CONTENT R${receipt.contentVersion} · ${receipt.contentFingerprint}`,{id:'map-'+'live-spawn-content',layout:{width:'grow'}}));
children.push(kit.text(receipt === null
    ? 'BASE + RECEIPT · VALIDATING'
    : `BASE ${receipt.baseVersion} · RECEIPT ${receipt.previewFingerprint}`,{id:'map-'+'live-spawn-receipt',layout:{width:'grow'}}));
children.push(kit.text(receipt === null
    ? 'NO WORLD CHANGE UNTIL CONFIRMED'
    : `${receipt.preview.preview.changes.length} EXACT CHANGE(S) · ${receipt.preview.warnings.length} WARNING(S)`,{id:'map-'+'live-spawn-impact',layout:{width:'grow'}}));
children.push(mapOverlayAction('live-spawn-cancel','Cancel functional live entity spawn (Escape)',() => { resetLiveSpawn(state); context.invalidate(); },{disabled: state.liveSpawnCommitting}));
children.push(mapOverlayAction('live-spawn-confirm',receipt === null
    ? 'Wait for the exact live mutation preview before confirming'
    : `Confirm live spawn of ${receipt.displayName} at ${receipt.tileX},${receipt.tileY}`,() => confirmLiveSpawn(state, context),{tone: 'danger',disabled: receipt === null || state.liveSpawnPreviewing || state.liveSpawnCommitting}));
appendMapOverlayPanel(parts,context,'appendLiveSpawnOverlay',children);
}

function appendRuntimeObjectOverlay(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: MapCanvasParts,
): void {
const children:UiElement[]=[];
const marker = state.runtimeObjectMarker;
if (marker === null) return;
const receipt: MapRuntimeObjectReceipt | null = state.runtimeObjectModel?.pending() ?? null;
const operation = receipt?.operation ?? (state.runtimeObjectMoveMode ? 'move_entity' : null);
const title = operation === 'move_entity' ? 'MOVE LIVE OBJECT'
    : operation === 'repair_entity' ? 'REPAIR LIVE OBJECT'
      : operation === 'despawn_entity' ? 'DESPAWN LIVE OBJECT' : 'LIVE OBJECT PREVIEW';
children.push(kit.text(state.runtimeObjectCommitting ? 'COMMITTING LIVE OBJECT' : title,{id:'map-'+'runtime-object-ribbon',layout:{width:'grow'}}));
const destination = receipt?.to ?? state.runtimeObjectTarget;
children.push(kit.text(destination === null
    ? `${marker.label.toUpperCase()} ${marker.id} · CLICK A DESTINATION TILE`
    : `${marker.label.toUpperCase()} ${marker.id} · ${marker.tileX},${marker.tileY} → ${destination.tileX},${destination.tileY}`,{id:'map-'+'runtime-object-target',layout:{width:'grow'}}));
children.push(kit.text(receipt === null
    ? 'AUTHORITY SNAPSHOT · VALIDATING'
    : receipt.playerOwned
      ? 'PLAYER-OWNED CUSTODY · OWNER NOTICE + AUDIT REQUIRED'
      : 'SYSTEM CUSTODY · AUDIT REQUIRED',{id:'map-'+'runtime-object-custody',layout:{width:'grow'}}));
children.push(kit.text(receipt === null
    ? state.runtimeObjectMoveMode ? 'NO WORLD CHANGE · CHOOSE A TILE' : 'BASE + RECEIPT · VALIDATING'
    : `BASE ${receipt.baseVersion} · RECEIPT ${receipt.previewFingerprint}`,{id:'map-'+'runtime-object-receipt',layout:{width:'grow'}}));
children.push(kit.text(receipt === null
    ? 'NO WORLD CHANGE UNTIL PREVIEWED AND CONFIRMED'
    : `${receipt.preview.preview.changes.length} EXACT CHANGE(S) · ${receipt.preview.warnings.length} WARNING(S)`,{id:'map-'+'runtime-object-impact',layout:{width:'grow'}}));
children.push(mapOverlayAction('runtime-object-cancel','Cancel runtime object action (Escape)',() => {
    resetRuntimeObjectAction(state); context.invalidate();
  },{disabled: state.runtimeObjectCommitting}));
children.push(mapOverlayAction('runtime-object-confirm',receipt === null
    ? state.runtimeObjectMoveMode ? 'Choose a destination tile before confirming'
      : 'Wait for the exact authority preview before confirming'
    : `Confirm ${receipt.operation.replaceAll('_', ' ')} with exact receipt and audit`,() => confirmRuntimeObjectAction(state, context),{tone: receipt?.operation === 'despawn_entity' ? 'danger' : 'success',disabled: receipt === null || state.runtimeObjectPreviewing || state.runtimeObjectCommitting}));
appendMapOverlayPanel(parts,context,'appendRuntimeObjectOverlay',children);
}

function appendNpcLocationOverlay(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: MapCanvasParts,
): void {
const children:UiElement[]=[];
const marker = state.npcLocationMarker;
if (marker === null) return;
const receipt: MapNpcLocationReceipt | null = state.npcLocationModel?.pending() ?? null;
children.push(kit.text(state.npcLocationCommitting ? 'COMMITTING NPC HOME + LOCATION' : 'NPC HOME + LOCATION',{id:'map-'+'npc-location-ribbon',layout:{width:'grow'}}));
const destination = receipt?.to ?? state.npcLocationTarget;
const homeX = marker.homeTileX ?? marker.tileX;
const homeY = marker.homeTileY ?? marker.tileY;
children.push(kit.text(destination === null
    ? `${marker.label.toUpperCase()} ${marker.id} · CLICK A DESTINATION TILE`
    : `${marker.label.toUpperCase()} ${marker.id} · LIVE ${marker.tileX},${marker.tileY} · HOME ${homeX},${homeY} → ${destination.tileX},${destination.tileY}`,{id:'map-'+'npc-location-target',layout:{width:'grow'}}));
children.push(kit.text('AUTHORITY RELOCATES LIVE POSITION + HOME ATOMICALLY',{id:'map-'+'npc-location-authority',layout:{width:'grow'}}));
children.push(kit.text(receipt === null
    ? state.npcLocationMoveMode ? 'NO WORLD CHANGE · CHOOSE A TILE' : 'BASE + RECEIPT · VALIDATING'
    : `BASE ${receipt.baseVersion} · RECEIPT ${receipt.previewFingerprint}`,{id:'map-'+'npc-location-receipt',layout:{width:'grow'}}));
children.push(kit.text(receipt === null
    ? 'NO WORLD CHANGE UNTIL PREVIEWED AND CONFIRMED'
    : `${receipt.preview.preview.changes.length} EXACT CHANGE(S) · INVERSE AUDIT REQUIRED`,{id:'map-'+'npc-location-impact',layout:{width:'grow'}}));
children.push(mapOverlayAction('npc-location-cancel','Cancel NPC home/location change (Escape)',() => {
    resetNpcLocationAction(state); context.invalidate();
  },{disabled: state.npcLocationCommitting}));
children.push(mapOverlayAction('npc-location-confirm',receipt === null
    ? state.npcLocationMoveMode ? 'Choose a destination tile before confirming'
      : 'Wait for the exact authority preview before confirming'
    : `Confirm ${receipt.displayName} home and location with exact receipt and inverse audit`,() => confirmNpcLocationAction(state, context),{tone: 'success',disabled: receipt === null || state.npcLocationPreviewing || state.npcLocationCommitting}));
appendMapOverlayPanel(parts,context,'appendNpcLocationOverlay',children);
}

function appendSchemaInspectorOverlay(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: MapCanvasParts,
  mapId: string,
): void {
const children:UiElement[]=[];
const field = state.schemaActionField;
if (field === null) return;
const receipt: MapSchemaInspectorReceipt | null = state.schemaActionModel?.pending() ?? null;
children.push(kit.text(state.schemaActionCommitting ? `COMMITTING ${field.label.toUpperCase()}`
      : `SCHEMA ACTION · ${field.label.toUpperCase()}`,{id:'map-'+'schema-action-ribbon',layout:{width:'grow'}}));
children.push(kit.text(`WHY  ${field.why}`,{id:'map-'+'schema-action-why',layout:{width:'grow'}}));
children.push(kit.input({id:'map-schema-action-editor',label:field.label,editor:state.schemaActionEditor,error:state.schemaActionError??undefined,onChange:()=>context.invalidate()}));
children.push(kit.text(receipt === null
    ? state.schemaActionPreviewing ? 'ASKING AUTHORITY FOR AN EXACT PREVIEW'
      : 'NO WORLD CHANGE · PREVIEW REQUIRED'
    : `BASE ${receipt.baseVersion} · RECEIPT ${receipt.previewFingerprint}`,{id:'map-'+'schema-action-receipt',layout:{width:'grow'}}));
children.push(kit.text(receipt === null
    ? 'TYPE → PREVIEW → EXPLICITLY CONFIRM'
    : `${receipt.stateKey}: ${String(receipt.before).toUpperCase()} → ${String(receipt.after).toUpperCase()} · AUDIT + INVERSE REQUIRED`,{id:'map-'+'schema-action-impact',layout:{width:'grow'}}));
children.push(mapOverlayAction('schema-action-cancel','Cancel schema field action (Escape)',() => {
    resetSchemaInspectorAction(state); context.invalidate();
  },{disabled: state.schemaActionCommitting}));
children.push(mapOverlayAction('schema-action-proceed',receipt === null
    ? 'Preview this typed change against exact live authority'
    : `Confirm ${receipt.fieldLabel} with the exact receipt and inverse audit`,() => {
    if (receipt === null) previewSchemaInspectorAction(state, context, mapId);
    else confirmSchemaInspectorAction(state, context, mapId);
  },{tone: receipt === null ? undefined : 'success',disabled: state.schemaActionPreviewing || state.schemaActionCommitting}));
appendMapOverlayPanel(parts,context,'appendSchemaInspectorOverlay',children);
}

function appendPublishConflictOverlay(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: MapCanvasParts,
  revision: number,
): void {
const children:UiElement[]=[];
children.push(kit.text(`MAP CONFLICT · LIVE R${revision}`,{id:'map-'+'publish-conflict-ribbon',layout:{width:'grow'}}));
children.push(mapOverlayAction('publish-conflict-reload',`Reload verified live revision ${revision}; discard this local draft and its undo history`,() => {
    try {
      state.model.reloadLatest();
      state.dismissedConflictRevision = null;
      context.controller.notifications.push('success', 'Latest map loaded', `Live revision ${revision}`);
      context.invalidate();
    } catch (error: unknown) {
      reportCanvasError(context, 'Latest map reload failed', error);
    }
  },{tone: 'danger'}));
children.push(mapOverlayAction('publish-conflict-keep-local',`Keep the local draft for live revision ${revision}; publishing remains blocked`,() => {
    state.dismissedConflictRevision = revision;
    context.controller.notifications.push(
      'info', 'Local map draft kept', `Conflict with live revision ${revision}; publish remains blocked`,
    );
    context.invalidate();
  },{}));
children.push(mapOverlayAction('publish-conflict-export','Download this conflicting local draft as validated JSON without changing the live map',() => { exportMapDraft(state, context); },{}));
appendMapOverlayPanel(parts,context,'publish-conflict',children);
}

function drawLiveSpawnTarget(
  context: CanvasRenderingContext2D,
  state: MapCanvasState,
): void {
  const target = state.liveSpawnTarget;
  if (!state.liveSpawnMode || target === null) return;
  const { viewport, camera } = state.interaction.snapshot();
  const terrain = state.renderer.inspectionTerrain(state.model.terrainIdentity());
  const projection = terrain === null ? 0
    : terrainProjectedDepthForElevation(terrain, target.elevation);
  const x = viewport.x + (target.tileX * TILE_SIZE_PIXELS - camera.x) * camera.zoom;
  const y = viewport.y + (target.tileY * TILE_SIZE_PIXELS - projection - camera.y) * camera.zoom;
  const size = Math.max(5, TILE_SIZE_PIXELS * camera.zoom);
  context.save();
  context.beginPath();
  context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  context.fillStyle = state.liveSpawnModel?.pending() === null
    ? 'rgba(239, 188, 83, 0.28)' : 'rgba(104, 187, 114, 0.34)';
  context.fillRect(Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  context.strokeStyle = state.liveSpawnModel?.pending() === null
    ? STUDIO_SKIN_TOKENS.amber : STUDIO_SKIN_TOKENS.green;
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.strokeRect(Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  context.setLineDash([]);
  context.restore();
}

function drawRuntimeObjectTarget(
  context: CanvasRenderingContext2D,
  state: MapCanvasState,
): void {
  const target = state.runtimeObjectTarget;
  if (state.runtimeObjectMarker === null || target === null) return;
  const { viewport, camera } = state.interaction.snapshot();
  const terrain = state.renderer.inspectionTerrain(state.model.terrainIdentity());
  const projection = terrain === null ? 0
    : terrainProjectedDepthForElevation(terrain, target.elevation);
  const x = viewport.x + (target.tileX * TILE_SIZE_PIXELS - camera.x) * camera.zoom;
  const y = viewport.y + (target.tileY * TILE_SIZE_PIXELS - projection - camera.y) * camera.zoom;
  const size = Math.max(5, TILE_SIZE_PIXELS * camera.zoom);
  context.save();
  context.beginPath();
  context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  context.fillStyle = 'rgba(104, 187, 114, 0.34)';
  context.fillRect(Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  context.strokeStyle = STUDIO_SKIN_TOKENS.green;
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.strokeRect(Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  context.setLineDash([]);
  context.restore();
}

function drawNpcLocationTarget(
  context: CanvasRenderingContext2D,
  state: MapCanvasState,
): void {
  const target = state.npcLocationTarget;
  if (state.npcLocationMarker === null || target === null) return;
  const { viewport, camera } = state.interaction.snapshot();
  const terrain = state.renderer.inspectionTerrain(state.model.terrainIdentity());
  const projection = terrain === null ? 0
    : terrainProjectedDepthForElevation(terrain, target.elevation);
  const x = viewport.x + (target.tileX * TILE_SIZE_PIXELS - camera.x) * camera.zoom;
  const y = viewport.y + (target.tileY * TILE_SIZE_PIXELS - projection - camera.y) * camera.zoom;
  const size = Math.max(5, TILE_SIZE_PIXELS * camera.zoom);
  context.save();
  context.beginPath();
  context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  context.fillStyle = 'rgba(241, 179, 75, 0.34)';
  context.fillRect(Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  context.strokeStyle = STUDIO_SKIN_TOKENS.amber;
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.strokeRect(Math.round(x), Math.round(y), Math.round(size), Math.round(size));
  context.setLineDash([]);
  context.restore();
}

function appendRightDrawer(state: MapCanvasState, context: StudioCanvasToolContext,
  parts: MapCanvasParts): void {
  if (!context.inspectorBounds) return;
  const inspection = selectionInspection(state), mapId = studioMapId(context.route.path);
  const children: UiElement[] = [];
  const button = (id: string, label: string, onPress: (event: UiButtonModifiers) => void,
    options: { disabled?: boolean; tone?: UiTone; help?: string; icon?: UiIconName } = {}): UiElement => {
    const base = kit.button({ id: `map-${id}`, label, onPress, disabled: options.disabled, tone: options.tone ?? 'primary',
      ...(options.icon ? { leading: kit.icon({lucide:options.icon}) } : {}), layout:{width:'grow',shrink:0} });
    return options.help ? kit.tooltip(options.help,base,{width:'grow',height:uiFixed(24),shrink:0}) : base;
  };
  const action = (id:string,label:string,onPress:()=>void,options:Parameters<typeof button>[3]={}) => children.push(button(id,label,onPress,options));
  if (state.interaction.snapshot().activeLayer === 'anchors') {
    for (const kind of ['poi','label'] as const) action(`anchor-tool-${kind}`,kind==='poi'?'Point of interest':'Map label',()=>{state.interaction.selectAnchorKind(kind);context.invalidate();},{disabled:!state.interaction.anchorPlacementAvailable()});
  }
  // Scrolling now belongs to the retained drawer, not the map's wheel router.
  state.selectionBounds = {x:0,y:0,width:0,height:0}; state.layerBounds = {x:0,y:0,width:0,height:0};
  state.selectionRowCount = 0;
  if (inspection) {
    const editableAnchor = inspection.entity?.kind==='authored_anchor'&&!inspection.entity.readOnly;
    if(state.editingAnchorId!==null&&(!editableAnchor||inspection.entity?.id!==state.editingAnchorId))cancelAnchorLabelEdit(state);
    children.push(kit.select({id:'map-selection-view',label:'Inspector view',value:state.inspectorView,
      options:[{value:'selection',label:'Selection'},{value:'schema',label:'Schema'}],onChange:value=>{state.inspectorView=value as 'selection'|'schema';context.invalidate();}}));
    const rows: readonly MapCanvasInspectorRow[] = state.inspectorView==='schema' ? mapCanvasInspectorRows(context.controller.inspector.groups())
      : mapSelectionDrawerRows(inspection).map(row=>({...row,heading:false,danger:false,property:null}));
    for(const row of rows){
      children.push(kit.text(row.label,{id:`map-selection-${row.id}-label`,role:row.heading?'header':'body',layout:{width:'grow'}}));
      const property=row.property;
      if(property&&parseMapSchemaInspectorAction(property.action)){
        const availability=mapSchemaInspectorAvailability(property as MapSchemaInspectorField,currentSchemaInspectorAuthority(state,context,mapId));
        action(`selection-${row.id}`,'Change',()=>beginSchemaInspectorAction(state,context,mapId,property),{disabled:!availability.editable,help:availability.reason,tone:row.danger?'danger':'primary'});
      }
    }
    const entity=inspection.entity;
    if(entity?.kind==='authored_object'||entity?.kind==='authored_landmark'){
      action('selection-hide','Visibility',()=>{state.interaction.toggleSelectedVisibility();context.invalidate();},{icon:'visibility',tone:entity.enabled?'success':'primary'});
      action('selection-clone','Clone',()=>{state.interaction.cloneSelected();context.invalidate();});
      action('selection-rotate','Rotate',()=>{state.interaction.rotateSelected();context.invalidate();});
      action('selection-flip','Flip',()=>{state.interaction.flipSelected();context.invalidate();});
      action('selection-scale','Scale',()=>{state.interaction.cycleSelectedScale();context.invalidate();});
      action('selection-delete','Delete',()=>{state.interaction.deleteSelected();context.invalidate();},{tone:'danger'});
    }else if(editableAnchor){
      if(state.editingAnchorId===entity!.id){
        children.push(kit.input({id:'map-selection-edit-anchor-label',label:'Anchor label',editor:state.anchorLabel,error:state.anchorLabelError??undefined,onSubmit:()=>commitAnchorLabelEdit(state,context)}));
        if(state.anchorLabelError) children.push(kit.text(state.anchorLabelError,{id:'map-selection-anchor-label-error'}));
        action('selection-confirm-anchor-label','Confirm',()=>commitAnchorLabelEdit(state,context),{tone:'success'});
        action('selection-cancel-anchor-label','Cancel',()=>{cancelAnchorLabelEdit(state);context.invalidate();});
      }else{
        action('selection-edit-anchor-label','Edit label',()=>{beginAnchorLabelEdit(state,entity!.id,entity!.name);context.invalidate();});
        action('selection-delete-anchor','Delete',()=>{state.interaction.deleteSelected();context.invalidate();},{tone:'danger'});
      }
    }else{
      const runtime=selectedRuntimeObjectMarker(state),npc=selectedNpcLocationMarker(state);
      if(entity?.kind==='live_object'&&runtime&&(runtime.entityKind==='placeable'||runtime.entityKind==='chest')){
        const availability=currentRuntimeObjectAvailability(state,context,mapId,runtime);
        for(const [name,label,operation] of [['move','Move','move_entity'],['repair','Repair','repair_entity'],['despawn','Despawn','despawn_entity']] as const)
          action(`selection-runtime-${name}`,label,()=>startRuntimeObjectAction(state,context,mapId,operation),{disabled:!availability.allowed,help:availability.allowed?undefined:availability.reason,tone:name==='despawn'?'danger':'primary'});
      }else if(entity?.kind==='live_object'&&npc){
        const availability=currentNpcLocationAvailability(state,context,mapId,npc);
        action('selection-npc-location','Move NPC',()=>startNpcLocationAction(state,context,mapId),{disabled:!availability.allowed,help:availability.allowed?undefined:availability.reason});
      }else if(inspection.target==='tile'&&state.model.workspace()==='terrain'){
        const snapshot=state.interaction.snapshot(),available=state.interaction.terrainAuthoringAvailable();
        const defaultFamily=state.model.document().defaultSurfaceFamily??'grass_1';
        const override=state.model.document().cells[mapCellKey(inspection.tileX,inspection.tileY)];
        children.push(kit.text(`Cell ${inspection.terrain.cell.surfaceFamily}; default ${defaultFamily}`));
        action('selection-terrain-apply-current','Apply family',()=>{state.interaction.applySelectedSurfaceFamilyToCell();context.invalidate();},{disabled:!available});
        action('selection-terrain-use-default','Use default',()=>{state.interaction.selectDocumentDefaultSurfaceFamily();context.invalidate();},{disabled:snapshot.selectedSurfaceFamily===defaultFamily&&snapshot.terrainPaletteMode==='surface_family'});
        action('selection-terrain-apply-default','Set default',()=>{state.interaction.setSelectedSurfaceFamilyAsDefault();context.invalidate();},{disabled:!available||snapshot.selectedSurfaceFamily===defaultFamily});
        action('selection-terrain-inherit','Inherit',()=>{state.interaction.clearSelectedSurfaceFamily();context.invalidate();},{disabled:!available||override?.surfaceFamily===undefined});
        action('selection-terrain-apply-exact','Apply exact',()=>{state.interaction.applySelectedExactTerrainOverride();context.invalidate();},{disabled:!available||snapshot.selectedExactTerrainOverrideId===null});
        action('selection-terrain-clear','Clear exact',()=>{state.interaction.clearSelectedExactTerrainOverride();context.invalidate();},{disabled:!available||override?.terrainOverride===undefined,tone:'danger'});
      }
    }
    if(inspection.suppression.supported){const suppressed=inspection.suppression.suppressed;
      action('selection-suppression',suppressed?'Restore generated':'Suppress generated',()=>{if(inspection.suppression.id!==null){state.model.suppressGenerated(inspection.suppression.id,!suppressed);context.invalidate();}},{tone:suppressed?'success':'danger'});
    }
    children.push(kit.separator());
  } else if(state.editingAnchorId!==null)cancelAnchorLabelEdit(state);
  const layers=[...state.model.document().layers].sort((a,b)=>b.order-a.order);
  const activeId=state.interaction.snapshot().activeLayer;
  children.push(kit.text('Layers',{role:'header'}));
  for(const layer of layers){
    const visible=state.model.isLayerEyeVisible(layer.id);
    children.push(kit.flex({direction:'row',width:'grow',height:uiFixed(24),gap:4,shrink:0},[
      kit.tooltip(`${visible?'Hide':'Show'} ${layer.label}`,kit.iconButton({lucide:visible?'visibility':'eyeOff'},
        {id:`map-layer-visible-${layer.id}`,label:`${visible?'Hide':'Show'} ${layer.label}`,tone:visible?'success':'primary',
          onPress:()=>{state.interaction.toggleLayerVisibility(layer.id);context.invalidate();}}),{width:uiFixed(24),height:uiFixed(24)}),
      button(`layer-select-${layer.id}`,layer.label,()=>{
        state.interaction.selectEditingTool(layer.id==='terrain'||layer.id==='generated_base'?'terrain':'objects');
        state.interaction.selectLayer(layer.id);state.paletteOffset=0;context.invalidate();
      },{tone:activeId===layer.id?'success':'primary'}),
    ]));
  }
  parts.kit.inspector=kit.flex({width:'grow',gap:4},children);
}

export function buildMapCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const mapId = studioMapId(context.route.path);
  const stateKey = `map-canvas:${mapId}`;
  const state = context.controller.toolState(stateKey, () => createState(context, mapId));
  syncTerrainPalette(state, context);
  syncLiveSpawnModel(state, context);
  beginCatalogLoad(state, context);
  syncContentObjectCatalog(state, context);
  // Terrain Lab and Procedural World are isolated drafts. Feeding production
  // subscription rows into them rebuilt every live entity marker after each
  // unrelated server update and overlaid entities from the wrong document.

  const liveView = mapId === 'live-island' ? context.controller.liveAdapter()?.view() : undefined;
  const liveRows = liveView?.rows ?? null;
  const contentSource = liveView?.contentDefinitions ?? null;
  const contentAuthorityKey = liveView === undefined ? 'unavailable'
    : `${liveView.connected}:${liveView.synchronizing}:${liveView.error ?? ''}:${String(liveView.contentHead?.revision ?? '')}:${liveView.contentHead?.contentHash ?? ''}:${contentSource?.length ?? -1}`;
  if (state.schemaLiveRowsSource !== liveRows || state.schemaContentSource !== contentSource
    || state.schemaContentAuthorityKey !== contentAuthorityKey) {
    if (state.schemaContentSource !== contentSource
      || state.schemaContentAuthorityKey !== contentAuthorityKey) {
      const verified = verifiedStudioLiveContent(liveView);
      state.liveObjectRegistry = verified?.registry ?? null;
      state.renderer.setLiveContent(verified?.key ?? contentAuthorityKey, verified?.registry ?? null);
    }
    state.schemaLiveRowsSource = liveRows;
    state.schemaContentSource = contentSource;
    state.schemaContentAuthorityKey = contentAuthorityKey;
    state.interaction.setLiveRows(liveRows, state.liveObjectRegistry);
    state.model.refreshKernels();
  }
  if (state.schemaActionField !== null) {
    const target = state.model.schemaInspectorTarget();
    const action = parseMapSchemaInspectorAction(state.schemaActionField.action);
    if (target === null || target.entityId !== state.schemaActionTargetId || action === null
      || target.state[action.stateKey] !== state.schemaActionField.value) {
      resetSchemaInspectorAction(state);
    }
  }
  if (state.runtimeObjectMarker !== null) {
    const currentMarker = selectedRuntimeObjectMarker(state);
    if (currentMarker === null
      || currentMarker.id !== state.runtimeObjectMarker.id
      || currentMarker.entityKind !== state.runtimeObjectMarker.entityKind
      || currentMarker.spaceId !== state.runtimeObjectMarker.spaceId
      || currentMarker.tileX !== state.runtimeObjectMarker.tileX
      || currentMarker.tileY !== state.runtimeObjectMarker.tileY) {
      resetRuntimeObjectAction(state);
    }
  }
  if (state.npcLocationMarker !== null) {
    const currentMarker = selectedNpcLocationMarker(state);
    if (currentMarker === null
      || currentMarker.id !== state.npcLocationMarker.id
      || currentMarker.spaceId !== state.npcLocationMarker.spaceId
      || currentMarker.playerControlled !== state.npcLocationMarker.playerControlled
      || currentMarker.systemControlled !== state.npcLocationMarker.systemControlled) {
      resetNpcLocationAction(state);
    }
  }
  state.model.reconcileLiveHead();
  if (state.outlinerDocument !== state.model.document()) {
    context.controller.setWorldDraft(
      `map:${mapId}:${mapDocumentV3Hash(state.model.document())}`,
      state.model.worldOutliner(),
    );
    state.outlinerDocument = state.model.document();
  }
  const conflictRevision = state.model.conflictRevision();
  if (conflictRevision === null) state.dismissedConflictRevision = null;
  syncMapAutoPublish(state, context, mapId);
  state.interaction.setViewport(context.workspaceBounds);
  if (mapId === 'live-island') {
    const document = state.model.document();
    const { camera, viewport } = state.interaction.snapshot();
    context.controller.liveAdapter()?.setMapViewport?.({
      spaceId: TOPSIDE_SPACE_ID,
      mapWidthTiles: document.width,
      mapHeightTiles: document.height,
      cameraX: camera.x,
      cameraY: camera.y,
      zoom: camera.zoom,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
  }
  const parts: MapCanvasParts = { kit: {} };
  parts.kit.overlays = kit.stack({ width: 'grow', height: 'grow' });
  appendLeftDrawer(state, context, parts, mapId);
  appendRightDrawer(state, context, parts);
  appendWorldOverlayControls(state, context, parts);
  appendAnchorAnnotation(state, context, parts);
  const showConflict = conflictRevision !== null
    && state.dismissedConflictRevision !== conflictRevision
    && !state.liveSpawnCommitting
    && !state.runtimeObjectCommitting
    && !state.npcLocationCommitting
    && !state.schemaActionCommitting;
  if (showConflict) {
    if (state.resizeMode || state.resizeImpact !== null) cancelMapResize(state);
    if (state.liveSpawnMode || state.liveSpawnPreviewing || state.liveSpawnTarget !== null) {
      resetLiveSpawn(state);
    }
    if (state.runtimeObjectMarker !== null || state.runtimeObjectPreviewing) {
      resetRuntimeObjectAction(state);
    }
    if (state.npcLocationMarker !== null || state.npcLocationPreviewing) {
      resetNpcLocationAction(state);
    }
    if (state.schemaActionField !== null || state.schemaActionPreviewing) {
      resetSchemaInspectorAction(state);
    }
    appendPublishConflictOverlay(state, context, parts, conflictRevision);
  } else {
    appendResizeOverlay(state, context, parts);
    appendLiveSpawnOverlay(state, context, parts);
    appendRuntimeObjectOverlay(state, context, parts);
    appendNpcLocationOverlay(state, context, parts);
    appendSchemaInspectorOverlay(state, context, parts, mapId);
  }
  persistSession(state);

  const surface: StudioCanvasToolSurface = { kit: parts.kit, draw: (drawing, shellArt) => {
    state.renderer.draw(
      drawing,
      state.model,
      state.interaction,
      context.controller.gridVisible(),
      shellArt,
    );
    drawMapResizePreview(drawing, state.resizeImpact, state.interaction.snapshot());
    drawLiveSpawnTarget(drawing, state);
    drawRuntimeObjectTarget(drawing, state);
    drawNpcLocationTarget(drawing, state);
  }, input: {
    spaceDragPan: true,
    pointerDown: (input) => {
      if (state.editingAnchorId !== null) {
        cancelAnchorLabelEdit(state);
        context.invalidate();
        return true;
      }
      if (state.schemaActionField !== null && !(input.button === 1
        || (input.button === 0 && (input.altKey || input.spaceHeld === true)))) return true;
      if (state.resizeImpact !== null) return true;
      if ((state.npcLocationMoveMode || state.npcLocationPreviewing
        || (state.npcLocationModel?.pending() ?? null) !== null)
        && !(input.button === 1
          || (input.button === 0 && (input.altKey || input.spaceHeld === true)))) {
        return state.npcLocationMoveMode && input.button === 0
          ? requestNpcLocationPreview(state, context, mapId, input.point)
          : true;
      }
      if ((state.runtimeObjectMoveMode || state.runtimeObjectPreviewing
        || (state.runtimeObjectModel?.pending() ?? null) !== null)
        && !(input.button === 1
          || (input.button === 0 && (input.altKey || input.spaceHeld === true)))) {
        return state.runtimeObjectMoveMode && input.button === 0
          ? requestRuntimeObjectMovePreview(state, context, mapId, input.point)
          : true;
      }
      if (state.liveSpawnMode && !(input.button === 1
        || (input.button === 0 && (input.altKey || input.spaceHeld === true)))) {
        return input.button === 0
          ? requestLiveSpawnPreview(state, context, mapId, input.point)
          : true;
      }
      const wasSampling = state.interaction.snapshot().eyedropperActive;
      const consumed = state.interaction.pointerDown(
        input.point,
        input.button,
        input.altKey || input.spaceHeld === true,
        input.shiftKey,
      );
      if (wasSampling && !state.interaction.snapshot().eyedropperActive) {
        state.search.setValue('');
        state.paletteOffset = 0;
      }
      return consumed;
    },
    pointerMove: (input) => state.resizeImpact !== null || state.interaction.pointerMove(input.point),
    pointerUp: () => state.resizeImpact !== null || state.interaction.pointerUp(),
    pointerCancel: () => state.resizeImpact !== null || state.interaction.pointerCancel(),
    wheel: (input) => {
      if (state.selectionRowCount > 0 && pointInside(input.point, state.selectionBounds)) {
        const visibleRows = Math.max(1, Math.floor((state.selectionBounds.height + 2) / 32));
        const direction = input.deltaY < 0 ? -1 : 1;
        const step = Math.max(1, Math.ceil(Math.abs(input.deltaY) / 30));
        state.selectionOffset = Math.max(0, Math.min(Math.max(0, state.selectionRowCount - visibleRows),
          state.selectionOffset + direction * step));
        return true;
      }
      if (pointInside(input.point, state.layerBounds)) {
        const documentLayerCount = state.model.document().layers.length;
        const visibleRows = Math.max(1, Math.floor((state.layerBounds.height + 2) / 42));
        const direction = input.deltaY < 0 ? -1 : 1;
        const step = Math.max(1, Math.ceil(Math.abs(input.deltaY) / 40));
        state.layerOffset = Math.max(0, Math.min(Math.max(0, documentLayerCount - visibleRows),
          state.layerOffset + direction * step));
        return true;
      }
      if (state.leftView !== 'palette' && pointInside(input.point, state.outlinerBounds)) {
        const direction = input.deltaY < 0 ? -1 : 1;
        const step = Math.max(1, Math.ceil(Math.abs(input.deltaY) / 40));
        state.outlinerOffset = Math.max(0, Math.min(
          Math.max(0, state.outlinerRowCount - state.outlinerVisibleRows),
          state.outlinerOffset + direction * step,
        ));
        return true;
      }
      if (pointInside(input.point, state.paletteBounds)) {
        const direction = input.deltaY < 0 ? -1 : 1;
        const step = Math.max(1, Math.ceil(Math.abs(input.deltaY) / 40));
        state.paletteOffset = Math.max(0, Math.min(
          Math.max(0, state.paletteRowCount - state.paletteVisibleRows),
          state.paletteOffset + direction * step,
        ));
        return true;
      }
      if (state.resizeImpact !== null && pointInside(input.point, context.workspaceBounds)) return true;
      return state.interaction.wheel(input.point, input.deltaY);
    },
    keyDown: (input) => {
      if (state.schemaActionField !== null) {
        if (input.key === 'Escape') {
          if (!state.schemaActionCommitting) resetSchemaInspectorAction(state);
          context.invalidate();
        } else if (input.key === 'Enter') {
          if ((state.schemaActionModel?.pending() ?? null) === null) {
            previewSchemaInspectorAction(state, context, mapId);
          } else {
            confirmSchemaInspectorAction(state, context, mapId);
          }
        }
        // The mounted CanvasTextEditor owns ordinary input and this guard
        // prevents map/outliner shortcuts from firing under its focus.
        return true;
      }
      if (state.editingAnchorId !== null) {
        if (input.key === 'Escape') {
          cancelAnchorLabelEdit(state);
          context.invalidate();
        } else if (input.key === 'Enter') commitAnchorLabelEdit(state, context);
        // Text editing owns all keys while mounted. Characters and navigation
        // are normally consumed by CanvasTextEditor before this hook; this
        // guard prevents unhandled shortcuts from mutating the map beneath it.
        return true;
      }
      if (state.liveSpawnMode) {
        if (input.key === 'Escape') {
          if (!state.liveSpawnCommitting) resetLiveSpawn(state);
          context.invalidate();
          return true;
        }
        if (input.key === 'Enter' && (state.liveSpawnModel?.pending() ?? null) !== null) {
          confirmLiveSpawn(state, context);
          return true;
        }
      }
      if (state.runtimeObjectMarker !== null) {
        if (input.key === 'Escape') {
          if (!state.runtimeObjectCommitting) resetRuntimeObjectAction(state);
          context.invalidate();
          return true;
        }
        if (input.key === 'Enter' && (state.runtimeObjectModel?.pending() ?? null) !== null) {
          confirmRuntimeObjectAction(state, context);
          return true;
        }
        if (state.runtimeObjectMoveMode || state.runtimeObjectPreviewing
          || (state.runtimeObjectModel?.pending() ?? null) !== null) return true;
      }
      if (state.npcLocationMarker !== null) {
        if (input.key === 'Escape') {
          if (!state.npcLocationCommitting) resetNpcLocationAction(state);
          context.invalidate();
          return true;
        }
        if (input.key === 'Enter' && (state.npcLocationModel?.pending() ?? null) !== null) {
          confirmNpcLocationAction(state, context);
          return true;
        }
        if (state.npcLocationMoveMode || state.npcLocationPreviewing
          || (state.npcLocationModel?.pending() ?? null) !== null) return true;
      }
      if (state.resizeImpact !== null) {
        if (input.key === 'Escape') {
          cancelMapResize(state);
          context.invalidate();
        } else if (input.key === 'Enter') confirmMapResize(state, context);
        return true;
      }
      if (state.resizeMode && input.key === 'Escape') {
        state.resizeMode = false;
        context.invalidate();
        return true;
      }
      if (state.renamingLayerId !== null && input.key === 'Escape') {
        cancelLayerRename(state);
        return true;
      }
      return state.interaction.keyDown(
        input.key,
        input.ctrlKey || input.metaKey,
        input.shiftKey,
        input.altKey,
      );
    },
  } };
  return Object.freeze({
    ...surface,
    lifecycle: Object.freeze({
      key: stateKey,
      dispose: () => {
        if (!context.controller.releaseToolState(stateKey, state)) return;
        state.disposed = true;
        resetLiveSpawn(state);
        resetRuntimeObjectAction(state);
        resetNpcLocationAction(state);
        resetSchemaInspectorAction(state);
        state.schemaActionModel?.dispose();
        state.autoPublish.dispose();
        persistSession(state);
        state.interaction.dispose();
        state.search.blur();
        state.worldOutlinerSearch.blur();
        state.liveOutlinerSearch.blur();
        state.schemaActionEditor.blur();
        state.layerName.blur();
        cancelAnchorLabelEdit(state);
        state.renderer.dispose();
        state.model.dispose();
      },
    }),
  });
}
