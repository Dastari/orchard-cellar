import {
  MAP_BIOME_IDS,
  MAP_GAMEPLAY_ANCHOR_LABEL_MAX_LENGTH,
  TOPSIDE_SPACE_ID,
  TILE_SIZE_PIXELS,
  mapCellKey,
  mapDocumentV3Hash,
  isMapObjectLayer,
  type ContentRegistry,
  type MapBiomeId,
  type MapContentLayerId,
  type MapDocumentV3,
} from '@orchard/sim';
import { terrainProjectedDepthForElevation, type TerrainArray } from '@orchard/engine';
import {
  CanvasTextEditor,
  STUDIO_SKIN_TOKENS,
  layoutUiGrid,
  layoutUiFlex,
  loadGeneratedAsset,
  loadGeneratedAssetCatalog,
  selectAtlasFrame,
  studioToolIcon,
  type AtlasFrame,
  type LoadedAsset,
  type UiFlexItem,
  type UiIconName,
  type UiRect,
  type StudioPropertyRowModel,
} from '@orchard/ui';
import type {
  StudioCanvasToolContext,
  StudioCanvasToolKeyInput,
  StudioCanvasToolSurface,
} from '../../shell/canvas-tool.js';
import { requestStudioFileDownload } from '../../shell/file-download.js';
import type { AdminObjectsApi } from '../../admin/objects-api.js';
import type { StudioSelection } from '../../shell/index.js';
import { studioRoleCan } from '../../shell/access.js';
import {
  canvasAction,
  canvasLabel,
  canvasPanel,
  canvasParts,
  canvasRows,
  canvasSlots,
  finishCanvasTool,
  reportCanvasError,
} from '../build-canvas-common.js';
import { buildAssetPalette, type AssetPaletteItem } from '../object/asset-palette.js';
import {
  mapContextPaletteKind,
  mapAnchorToolPalette,
  mapTerrainPalette,
  type MapTerrainPaletteEntry,
} from './context-palette.js';
import {
  MAP_EDITOR_TERRAIN_TOOLS,
  MAP_EDITOR_TERRAIN_TOOL_LABELS,
  MapEditorController,
  type MapEditorLiveMarker,
} from './editor-controller.js';
import { MapEditorRenderer } from './editor-renderer.js';
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
import { MAP_EDITOR_WORKSPACES, MapEditorModel, type MapEditorWorkspace } from './model.js';
import { MapRouteSessionStore, mapRouteSessionState, type MapOutlinerView } from './route-session-state.js';
import { studioMapId } from './routes.js';
import { mapSelectionDrawerRows } from './selection-drawer.js';
import { mapRightDrawerCards } from './right-drawer-layout.js';
import {
  mapCanvasInspectorRows,
  type MapCanvasInspectorRow,
} from './canvas-dock-projections.js';
import {
  applyMapOutlinerTreeKey,
  createMapOutlinerTreeState,
  mapOutlinerTreeRows,
  setMapOutlinerQuery,
  type MapOutlinerTreeKey,
  type MapOutlinerTreeRow,
  type MapOutlinerTreeState,
} from './outliner-tree.js';
import type { MapOutlinerMutationRequest } from './outliner-authored-actions.js';
import {
  inspectMapSelection,
  type MapGeneratedSelectionDescriptor,
  type MapSelectionInspection,
} from './selection-inspection.js';
import {
  applyMapLayerSelectionGesture,
  planMapLayerBulkLock,
  planMapLayerBulkVisibility,
  reconcileMapLayerSelection,
  type MapLayerSelectionState,
} from './layer-selection.js';
import { createMapDocumentExport } from './document-export.js';
import { MapAutoPublishCoordinator } from './auto-publish.js';
import { mapResizeImpactLossCount, type MapResizeEdge, type MapResizeImpact } from './resize.js';
import {
  MAP_TERRAIN_AUTHORING_MODES,
  terrainCliffFamilyChoices,
  terrainFarmlandVisualChoices,
  terrainSurfaceFamilyChoices,
  type ExactTerrainOverrideChoice,
  type MapTerrainAuthoringMode,
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
    readonly choices: readonly ExactTerrainOverrideChoice[];
  } | null;
  catalogLoading: boolean;
  catalogReady: boolean;
  catalogPalette: readonly AssetPaletteItem[] | null;
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
  liveObjectRegistry: Pick<ContentRegistry, 'objects'>;
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

const WORKSPACE_ICONS: Readonly<Record<MapEditorWorkspace, ReturnType<typeof studioToolIcon>>> = {
  terrain: studioToolIcon('tiles'),
  objects: studioToolIcon('object'),
  biomes: studioToolIcon('map'),
  scatter: studioToolIcon('observe'),
};

const LAYER_TYPE_SYMBOLS: Readonly<Record<MapContentLayerId, UiIconName>> = Object.freeze({
  generated_base: 'layers',
  terrain: 'map',
  ground: 'landPlot',
  objects: 'box',
  gameplay: 'gamepad',
  player_owned: 'box',
  canopy: 'trees',
  anchors: 'pointer',
});

const ANCHOR_KIND_SYMBOLS = Object.freeze({
  poi: 'pointer',
  label: 'landPlot',
  spawn: 'gamepad',
  portal: 'map',
  npc: 'pointer',
  resource: 'trees',
} as const satisfies Readonly<Record<string, UiIconName>>);

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

function terrainToolShortcut(index: number): string {
  return index < 9 ? `${index + 1}` : `Alt+${index - 8}`;
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
      restored.workspace, restored.hiddenLayers, restored.userLockedLayers, restored.soloLayer,
    ))) {
    restored = null;
  }
  const interaction = new MapEditorController(model, context.invalidate);
  if (restored !== null) interaction.restoreSession(restored);
  const renderer = new MapEditorRenderer(context.invalidate);
  // Start the immutable terrain derivative when the route mounts. Browser
  // builds use the worker; non-browser/test hosts use the compatibility path.
  // Either way, later selection only reads the completed renderer cache.
  renderer.prepareInspectionTerrain(model.document(), model.terrainIdentity());
  const state = {} as MapCanvasState;
  Object.assign(state, {
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
    autoPublishEnabled: restored?.autoPublish ?? false,
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
    liveObjectRegistry: { objects: new Map() },
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

function beginLayerRename(
  state: MapCanvasState,
  layer: MapContentLayerId,
  label: string,
): void {
  if (!state.model.canRenameLayer(layer)) return;
  state.renamingLayerId = layer;
  state.layerName.setValue(label);
  state.layerName.setSelection(0, label.length);
  state.layerName.focus();
}

function commitLayerRename(state: MapCanvasState, context: StudioCanvasToolContext): void {
  const layer = state.renamingLayerId;
  if (layer === null) return;
  try {
    state.interaction.renameLayer(layer, state.layerName.snapshot().value);
    cancelLayerRename(state);
  } catch (error: unknown) {
    reportCanvasError(context, 'Layer name was not changed', error);
  }
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

function appendMapStats(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: ReturnType<typeof canvasParts>,
  bounds: UiRect,
  label: string,
): void {
  const [status, toggle] = layoutUiFlex(bounds, [
    { minSize: { width: 1, height: 40 }, grow: 1 },
    { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { direction: 'row', gap: 2, align: 'stretch' });
  const publication = state.autoPublish.presentation();
  canvasLabel(parts, 'map-stats', `${label} · AUTO ${publication.state}`, status!, { field: true });
  canvasAction(parts, 'auto-publish', publication.tooltip, toggle!, () => {
    state.autoPublishEnabled = !state.autoPublishEnabled;
    context.invalidate();
  }, {
    symbol: 'cloudConnect', active: state.autoPublishEnabled,
    ...(publication.state === 'FAILED' ? { tone: 'danger' as const } : {}),
  });
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

function armLiveSpawn(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  mapId: string,
): void {
  if (state.liveSpawnMode) {
    resetLiveSpawn(state);
    context.invalidate();
    return;
  }
  const definitionId = selectedLiveSpawnDefinition(state);
  const availability = currentLiveSpawnAvailability(state, context, mapId);
  if (!availability.allowed || definitionId === null) return;
  state.resizeMode = false;
  cancelMapResize(state);
  state.liveSpawnMode = true;
  state.liveSpawnDefinitionId = definitionId;
  state.liveSpawnPrefabId = state.interaction.snapshot().selectedPrefabId;
  context.invalidate();
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

function terrainPreview(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  entry: MapTerrainPaletteEntry,
): { readonly image: CanvasImageSource; readonly frame: AtlasFrame } | undefined {
  if (entry.assetName === null) return undefined;
  const asset = previewAsset(state, context, entry.assetName);
  if (asset === null) return undefined;
  const frame = firstPreviewFrame(asset);
  return frame === null ? undefined : { image: asset.image, frame };
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

const TERRAIN_MODE_PRESENTATION: Readonly<Record<MapTerrainAuthoringMode, {
  readonly tooltip: string;
  readonly symbol: 'brush' | 'landPlot' | 'mountain' | 'replace' | 'sprout';
}>> = Object.freeze({
  brush: { tooltip: 'Normal terrain brushes', symbol: 'brush' },
  surface_family: { tooltip: 'Choose a grass surface family', symbol: 'landPlot' },
  cliff_family: { tooltip: 'Choose a cliff family', symbol: 'mountain' },
  exact_override: { tooltip: 'Choose a topology-compatible exact tile override', symbol: 'replace' },
  farmland_visual: {
    tooltip: 'Farmland · Visual — dry authored appearance only; wet soil and crops remain runtime authority',
    symbol: 'sprout',
  },
});

function pointInside(point: { readonly x: number; readonly y: number }, bounds: UiRect): boolean {
  return point.x >= bounds.x && point.y >= bounds.y
    && point.x <= bounds.x + bounds.width && point.y <= bounds.y + bounds.height;
}

function workspaceLayer(workspace: MapEditorWorkspace): MapContentLayerId {
  return workspace === 'terrain' || workspace === 'biomes' ? 'terrain' : 'objects';
}

function workspaceForLayer(layer: MapContentLayerId): MapEditorWorkspace {
  return layer === 'generated_base' || layer === 'terrain' ? 'terrain' : 'objects';
}

function biomePalette(query: string): readonly MapBiomeId[] {
  const normalized = query.trim().toLocaleLowerCase();
  return MAP_BIOME_IDS.filter((biome) => biome.includes(normalized));
}

const MAP_PALETTE_CELL_SIZE = 62;
const MAP_PALETTE_GAP = 4;

function paletteGridWindow(
  state: MapCanvasState,
  bounds: UiRect,
  itemCount: number,
): { readonly start: number; readonly count: number; readonly cells: readonly UiRect[] } {
  const columns = Math.max(1, Math.floor((bounds.width + MAP_PALETTE_GAP)
    / (MAP_PALETTE_CELL_SIZE + MAP_PALETTE_GAP)));
  const visibleRows = Math.max(1, Math.floor((bounds.height + MAP_PALETTE_GAP)
    / (MAP_PALETTE_CELL_SIZE + MAP_PALETTE_GAP)));
  const rowCount = Math.ceil(itemCount / columns);
  state.paletteRowCount = rowCount;
  state.paletteVisibleRows = visibleRows;
  state.paletteOffset = Math.max(0, Math.min(Math.max(0, rowCount - visibleRows), state.paletteOffset));
  const start = state.paletteOffset * columns;
  const count = Math.min(itemCount - start, visibleRows * columns);
  const items = Array.from({ length: Math.max(0, count) }, () => ({
    width: MAP_PALETTE_CELL_SIZE,
    height: MAP_PALETTE_CELL_SIZE,
  }));
  const grid = layoutUiGrid(bounds, items, {
    columns,
    rowHeight: MAP_PALETTE_CELL_SIZE,
    columnGap: MAP_PALETTE_GAP,
    rowGap: MAP_PALETTE_GAP,
    justifyItems: 'stretch',
    alignItems: 'stretch',
  });
  return { start, count: Math.max(0, count), cells: grid.items };
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

function outlinerSelectionLayer(
  state: MapCanvasState,
  row: MapOutlinerTreeRow,
): MapContentLayerId | null {
  const layerMarker = ':layer:';
  const markerIndex = row.node.id.indexOf(layerMarker);
  if (markerIndex >= 0) {
    const layerId = row.node.id.slice(markerIndex + layerMarker.length);
    const layer = state.model.document().layers.find(({ id }) => id === layerId);
    if (layer !== undefined) return layer.id;
  }
  const selection = row.node.selection ?? null;
  if (selection === null) return null;
  if (selection.kind === 'entity' && selection.entityKind === 'map-object') {
    return state.model.document().objects.find(({ id }) => id === selection.id)?.layer
      ?? state.model.document().landmarks.find(({ id }) => id === selection.id)?.layer
      ?? null;
  }
  if (selection.kind === 'entity' && selection.entityKind === 'map-anchor') return 'anchors';
  const liveMarker = state.interaction.liveMarkers().find((candidate) => selection.kind === 'player'
    ? candidate.entityKind === 'player' && candidate.id === selection.identity
    : selection.kind === 'entity' && candidate.entityKind === selection.entityKind
      && candidate.id === selection.id && candidate.spaceId === selection.spaceId);
  return liveMarker?.layer ?? null;
}

function activateOutlinerRow(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  row: MapOutlinerTreeRow,
): void {
  const current = state.leftView === 'live' ? state.liveOutlinerState : state.worldOutlinerState;
  const selected = Object.freeze({ ...current, focusedId: row.node.id, selectedId: row.node.id });
  if (state.leftView === 'live') state.liveOutlinerState = selected;
  else state.worldOutlinerState = selected;
  const layer = outlinerSelectionLayer(state, row);
  if (layer !== null) {
    state.model.selectWorkspace(workspaceForLayer(layer));
    state.interaction.selectLayer(layer);
  }
  if (row.node.selection !== undefined) context.controller.selection.select(row.node.selection);
  context.invalidate();
}

function authoredOutlinerSelection(
  state: MapCanvasState,
): Readonly<{ readonly nodeKind: 'object' | 'landmark'; readonly nodeId: string }> | null {
  const selection = state.model.selection();
  if (selection.kind !== 'entity' || selection.entityKind !== 'map-object') return null;
  if (state.model.document().objects.some(({ id }) => id === selection.id)) {
    return Object.freeze({ nodeKind: 'object', nodeId: selection.id });
  }
  return state.model.document().landmarks.some(({ id }) => id === selection.id)
    ? Object.freeze({ nodeKind: 'landmark', nodeId: selection.id }) : null;
}

function outlinerLayerMutationRequest(
  state: MapCanvasState,
  row: MapOutlinerTreeRow,
): MapOutlinerMutationRequest | null {
  const selected = authoredOutlinerSelection(state);
  const targetLayer = outlinerSelectionLayer(state, row);
  if (selected === null || targetLayer === null || !isMapObjectLayer(targetLayer)) return null;
  return Object.freeze({
    kind: 'reparent',
    view: 'world',
    ...selected,
    targetLayer,
    targetAncestorIds: Object.freeze([...(row.parentId === null ? [] : [row.parentId]), row.node.id]),
  });
}

function runOutlinerMutation(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  request: MapOutlinerMutationRequest,
): boolean {
  const access = context.route.access === 'write' ? 'write' : 'read_only';
  const result = state.model.applyOutlinerMutation(request, access);
  if (!result.ok) {
    context.controller.notifications.push('error', 'Outliner edit was not applied',
      result.reason.replaceAll('_', ' '));
    context.invalidate();
    return false;
  }
  if (result.operation.kind === 'reparent_object' || result.operation.kind === 'reparent_landmark') {
    state.model.selectWorkspace(workspaceForLayer(result.operation.targetLayer));
    state.interaction.selectLayer(result.operation.targetLayer);
  }
  context.invalidate();
  return true;
}

const MAP_OUTLINER_TREE_KEYS: ReadonlySet<string> = new Set([
  'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ',
]);

function handleOutlinerTreeKey(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  tree: Parameters<typeof mapOutlinerTreeRows>[0],
  live: boolean,
  focusedId: string,
  input: StudioCanvasToolKeyInput,
): string | null {
  let treeState = createMapOutlinerTreeState(tree, {
    ...(live ? state.liveOutlinerState : state.worldOutlinerState),
    focusedId,
  });
  if (live) state.liveOutlinerState = treeState;
  else state.worldOutlinerState = treeState;
  if (!live && (input.ctrlKey || input.metaKey)
    && (input.key === 'ArrowUp' || input.key === 'ArrowDown')) {
    const focused = mapOutlinerTreeRows(tree, treeState)
      .find(({ node }) => node.id === treeState.focusedId);
    const layer = focused === undefined ? null : outlinerSelectionLayer(state, focused);
    if (focused?.node.kind !== 'group' || layer === null) return null;
    runOutlinerMutation(state, context, {
      kind: 'reorder', view: 'world', nodeKind: 'layer', nodeId: layer,
      direction: input.key === 'ArrowUp' ? 'toward_back' : 'toward_front',
    });
    return `outliner-select-${focused.node.id}`;
  }
  if (input.ctrlKey || input.metaKey || input.altKey || input.shiftKey
    || !MAP_OUTLINER_TREE_KEYS.has(input.key)) return null;
  const result = applyMapOutlinerTreeKey(tree, treeState, input.key as MapOutlinerTreeKey);
  treeState = result.state;
  if (live) state.liveOutlinerState = treeState;
  else state.worldOutlinerState = treeState;
  if (result.effect === 'activate' && result.activatedId !== null) {
    const activated = mapOutlinerTreeRows(tree, treeState)
      .find(({ node }) => node.id === result.activatedId);
    if (activated !== undefined) activateOutlinerRow(state, context, activated);
  }
  const rows = mapOutlinerTreeRows(tree, treeState);
  const focusedIndex = rows.findIndex(({ node }) => node.id === treeState.focusedId);
  if (focusedIndex >= 0) {
    if (focusedIndex < state.outlinerOffset) state.outlinerOffset = focusedIndex;
    else if (focusedIndex >= state.outlinerOffset + state.outlinerVisibleRows) {
      state.outlinerOffset = Math.max(0, focusedIndex - state.outlinerVisibleRows + 1);
    }
  }
  context.invalidate();
  return treeState.focusedId === null ? null : `outliner-select-${treeState.focusedId}`;
}

function appendMapOutliner(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: ReturnType<typeof canvasParts>,
  bounds: UiRect,
): void {
  const live = state.leftView === 'live';
  const tree = live ? context.controller.liveOutliner() : context.controller.worldOutliner();
  const editor = live ? state.liveOutlinerSearch : state.worldOutlinerSearch;
  let treeState = createMapOutlinerTreeState(tree,
    live ? state.liveOutlinerState : state.worldOutlinerState);
  if (treeState.query !== editor.snapshot().value) {
    treeState = setMapOutlinerQuery(tree, treeState, editor.snapshot().value);
  }
  if (live) state.liveOutlinerState = treeState;
  else state.worldOutlinerState = treeState;
  const card = canvasPanel(parts, `${live ? 'live' : 'world'}-outliner-card-panel`, bounds, 'thin', 4);
  const slots = canvasSlots(card, [
    { id: 'ribbon', minSize: { width: 1, height: 30 }, main: { mode: 'fixed', size: 30 } },
    { id: 'search', minSize: { width: 1, height: 40 }, main: { mode: 'fixed', size: 40 } },
    { id: 'rows', minSize: { width: 1, height: 40 }, main: { mode: 'grow', min: 40 } },
  ], { gap: 4 });
  const [searchField, clearSearch] = layoutUiFlex(slots.search!, [
    { minSize: { width: 72, height: 40 }, grow: 1 },
    { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { direction: 'row', gap: 2, align: 'stretch' });
  const searchSnapshot = editor.snapshot();
  const searchLabel = searchSnapshot.focused
    ? `${searchSnapshot.value.slice(0, searchSnapshot.focus)}|${searchSnapshot.value.slice(searchSnapshot.focus)}`
    : searchSnapshot.value || 'SEARCH TREE';
  const searchId = `outliner-search-${live ? 'live' : 'world'}`;
  canvasAction(parts, searchId, `Search the ${live ? 'Live' : 'World'} Outliner`, searchField!,
    () => editor.focus(), { role: 'textbox' });
  const searchNode = parts.nodes.findIndex(({ id }) => id === searchId);
  if (searchNode >= 0) parts.nodes[searchNode] = { ...parts.nodes[searchNode]!, label: searchLabel };
  parts.textEditors.push({ id: searchId, editor });
  canvasAction(parts, `outliner-clear-${live ? 'live' : 'world'}`, 'Clear Outliner search', clearSearch!, () => {
    editor.setValue('');
    state.outlinerOffset = 0;
    context.invalidate();
  }, { buttonGlyph: 'cross', disabled: searchSnapshot.value.length === 0 });

  const rows = mapOutlinerTreeRows(tree, treeState);
  const rowRects = canvasRows(slots.rows!, Math.max(1, rows.length), 40, 2);
  state.outlinerBounds = slots.rows!;
  state.outlinerRowCount = rows.length;
  state.outlinerVisibleRows = rowRects.length;
  state.outlinerOffset = Math.max(0, Math.min(
    Math.max(0, rows.length - rowRects.length), state.outlinerOffset,
  ));
  const start = rows.length === 0 ? 0 : state.outlinerOffset + 1;
  const end = Math.min(rows.length, state.outlinerOffset + rowRects.length);
  parts.nodes.push({
    id: `${live ? 'live' : 'world'}-outliner-ribbon`,
    kind: 'ribbon',
    bounds: slots.ribbon!,
    label: `${live ? 'LIVE OUTLINER · READ ONLY' : 'WORLD OUTLINER'}${rows.length > rowRects.length ? ` ${start}-${end}/${rows.length}` : ''}`,
  });
  if (rows.length === 0) {
    canvasLabel(parts, `${live ? 'live' : 'world'}-outliner-empty`, live
      ? 'CONNECT TO VIEW LIVE WORLD' : 'NO AUTHORED MAP NODES', rowRects[0]!, { field: true });
    return;
  }
  rows.slice(state.outlinerOffset, state.outlinerOffset + rowRects.length).forEach((row, index) => {
    const request = live ? null : outlinerLayerMutationRequest(state, row);
    const access = context.route.access === 'write' ? 'write' : 'read_only';
    const plan = request === null ? null : state.model.planOutlinerMutation(request, access);
    const controls = layoutUiFlex(rowRects[index]!, [
      { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
      { minSize: { width: 40, height: 40 }, grow: 1 },
      ...(request === null ? [] : [{ minSize: { width: 40, height: 40 },
        main: { mode: 'fixed' as const, size: 40 } }]),
    ], { direction: 'row', gap: 2, align: 'stretch' });
    const [disclosure, item, reparent] = controls;
    if (row.node.children.length > 0) {
      canvasAction(parts, `outliner-toggle-${row.node.id}`, `${row.expanded ? 'Collapse' : 'Expand'} ${row.node.label}`,
        disclosure!, () => {
          const source = live ? state.liveOutlinerState : state.worldOutlinerState;
          const result = applyMapOutlinerTreeKey(tree,
            { ...source, focusedId: row.node.id }, ' ');
          if (live) state.liveOutlinerState = result.state;
          else state.worldOutlinerState = result.state;
          context.invalidate();
        }, { symbol: 'layers', active: row.expanded });
    } else {
      parts.nodes.push({
        id: `outliner-kind-${row.node.id}`, kind: 'slot', bounds: disclosure!,
        symbol: row.node.kind === 'entity' ? 'pointer' : 'layers', state: 'idle',
      });
    }
    canvasAction(parts, `outliner-select-${row.node.id}`,
      `${row.node.kind === 'entity' ? 'Select' : row.node.kind === 'group' ? 'Target layer' : 'Open'} ${row.node.label}`,
      item!, () => activateOutlinerRow(state, context, row), {
        role: row.node.kind === 'entity' ? 'option' : 'button',
        active: treeState.selectedId === row.node.id,
        glyph: `${'· '.repeat(row.depth)}${row.node.label.toUpperCase()}`,
        keyDown: (input) => handleOutlinerTreeKey(state, context, tree, live, row.node.id, input),
      });
    if (request !== null && reparent !== undefined) {
      canvasAction(parts, `outliner-reparent-${row.node.id}`,
        plan?.ok === true ? `Move selected authored node to ${row.node.label}`
          : `Cannot move selected authored node here: ${plan?.reason.replaceAll('_', ' ') ?? 'unavailable'}`,
        reparent, () => { runOutlinerMutation(state, context, request); }, {
          buttonGlyph: 'return', disabled: plan?.ok !== true,
        });
    }
  });
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

function appendLeftDrawer(state: MapCanvasState, context: StudioCanvasToolContext,
  parts: ReturnType<typeof canvasParts>, mapId: string): void {
  const document = state.model.document();
  const liveAdapter = context.controller.liveAdapter();
  const liveView = liveAdapter?.view();
  const resizeAvailability = state.model.resizeAvailability();
  if (state.resizeImpact !== null && (state.resizeImpact.sourceHash !== mapDocumentV3Hash(document)
    || !resizeAvailability.allowed)) cancelMapResize(state);
  if (!resizeAvailability.allowed) state.resizeMode = false;
  const workspace = state.model.workspace();
  let interactionSnapshot = state.interaction.snapshot();
  if (interactionSnapshot.selectedAnchorKind !== null
    && !state.interaction.anchorPlacementAvailable()) {
    state.interaction.selectAnchorKind(null);
    interactionSnapshot = state.interaction.snapshot();
  }
  const activeLayer = interactionSnapshot.activeLayer;
  const paletteView = state.leftView === 'palette';
  const paletteKind = mapContextPaletteKind(activeLayer);
  const liveSpawnAvailability = currentLiveSpawnAvailability(state, context, mapId);
  if (state.liveSpawnMode && !liveSpawnAvailability.allowed && !state.liveSpawnCommitting) {
    resetLiveSpawn(state);
  }
  const currentContentHead = liveView?.contentHead;
  const stagedLiveSpawn = state.liveSpawnModel?.pending();
  if (!state.liveSpawnCommitting && stagedLiveSpawn !== null && stagedLiveSpawn !== undefined
    && (currentContentHead === null || currentContentHead === undefined
      || stagedLiveSpawn.contentVersion !== String(currentContentHead.revision)
      || stagedLiveSpawn.contentFingerprint !== currentContentHead.contentHash)) {
    // The server fingerprint would reject a changed definition, but removing
    // the stale Canvas confirmation makes the exact-content guarantee visible.
    resetLiveSpawn(state, false);
  }
  const slots = canvasSlots(context.controlsBounds, [
    { id: 'commands', minSize: { width: 1, height: 42 }, main: { mode: 'fixed', size: 42 } },
    { id: 'workspaces', minSize: { width: 1, height: 42 }, main: { mode: 'fixed', size: 42 } },
    { id: 'views', minSize: { width: 1, height: 42 }, main: { mode: 'fixed', size: 42 } },
    ...(paletteView && workspace === 'terrain' ? [{
      id: 'terrain-modes', minSize: { width: 1, height: 40 }, main: { mode: 'fixed' as const, size: 40 },
    }] : []),
    ...(paletteView ? [{
      id: 'search', minSize: { width: 1, height: 44 }, main: { mode: 'fixed' as const, size: 44 },
    }] : []),
    ...(paletteView && workspace === 'scatter' ? [{
      id: 'scatter', minSize: { width: 1, height: 42 }, main: { mode: 'fixed' as const, size: 42 },
    }] : []),
    ...(paletteView && workspace === 'terrain' && interactionSnapshot.terrainTool === 'transition' ? [{
      id: 'transition', minSize: { width: 1, height: 42 }, main: { mode: 'fixed' as const, size: 42 },
    }] : []),
    { id: 'palette', minSize: { width: 1, height: 80 }, main: { mode: 'grow', min: 80 } },
    { id: 'stats', minSize: { width: 1, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 6 });

  const commands = layoutUiFlex(slots.commands!, Array.from({ length: 5 }, () => ({
    minSize: { width: 40, height: 40 }, grow: 1,
  })), { direction: 'row', gap: 1, align: 'stretch' });
  canvasAction(parts, 'undo', 'Undo map edit', commands[0]!, () => {
    cancelMapResize(state); state.interaction.undo(); context.invalidate();
  },
    { buttonGlyph: 'back', disabled: !state.model.canUndo() });
  canvasAction(parts, 'redo', 'Redo map edit', commands[1]!, () => {
    cancelMapResize(state); state.interaction.redo(); context.invalidate();
  },
    { buttonGlyph: 'return', disabled: !state.model.canRedo() });
  canvasAction(parts, 'frame-map', 'Frame the whole map', commands[2]!, () => { state.interaction.frameMap(); context.invalidate(); },
    { buttonGlyph: 'square' });
  canvasAction(parts, 'export', 'Download the current local map draft as validated JSON',
    commands[3]!, () => { exportMapDraft(state, context); }, { symbol: 'export' });
  const publish = mapEditorPublishPresentation({
    dirty: state.model.dirty(),
    publishing: state.model.publishing() || liveView?.publishingMap === true,
    conflictRevision: state.model.conflictRevision(),
    validation: state.model.validationState(),
    baseRevision: state.model.baseRevision(),
    connected: liveView?.connected === true,
    synchronizing: liveView?.synchronizing === true,
    authorized: context.route.access === 'write' && studioRoleCan(liveView?.role ?? null, 'publish_map'),
    publishAvailable: mapId === 'live-island' && liveAdapter?.publishMap !== undefined,
  });
  canvasAction(parts, 'publish', publish.tooltip, commands[4]!, () => {
    state.autoPublish.requestManual();
  }, { symbol: publish.icon, tone: publish.tone, disabled: publish.disabled,
    active: publish.state === 'PUBLISHING' });

  const workspaceButtons = layoutUiFlex(slots.workspaces!, MAP_EDITOR_WORKSPACES.map(() => ({
    minSize: { width: 40, height: 40 }, grow: 1,
  })), { direction: 'row', gap: 4, align: 'stretch' });
  MAP_EDITOR_WORKSPACES.forEach((workspace, index) => canvasAction(parts, `workspace-${workspace}`,
    `${workspace} workspace`, workspaceButtons[index]!, () => {
      resetLiveSpawn(state);
      state.model.selectWorkspace(workspace);
      state.interaction.selectLayer(workspaceLayer(workspace));
      state.paletteOffset = 0;
      context.invalidate();
    }, { role: 'tab', icon: WORKSPACE_ICONS[workspace], active: state.model.workspace() === workspace }));

  const viewButtons = layoutUiFlex(slots.views!, Array.from({ length: 3 }, () => ({
    minSize: { width: 40, height: 40 }, grow: 1,
  })), { direction: 'row', gap: 4, align: 'stretch' });
  const views = [
    { id: 'palette' as const, label: 'Show the active placement palette', symbol: 'map' as const },
    { id: 'world' as const, label: 'Show the authored World Outliner', symbol: 'layers' as const },
    { id: 'live' as const, label: 'Show the subscribed Live Outliner', symbol: 'gamepad' as const },
  ];
  views.forEach((view, index) => canvasAction(parts, `left-view-${view.id}`, view.label,
    viewButtons[index]!, () => {
      state.leftView = view.id;
      state.outlinerOffset = 0;
      context.invalidate();
    }, { role: 'tab', symbol: view.symbol, active: state.leftView === view.id }));

  if (workspace === 'terrain' && slots['terrain-modes'] !== undefined) {
    const modes = layoutUiFlex(slots['terrain-modes'], MAP_TERRAIN_AUTHORING_MODES.map(() => ({
      minSize: { width: 40, height: 40 }, grow: 1,
    })), { direction: 'row', gap: 1, align: 'stretch' });
    MAP_TERRAIN_AUTHORING_MODES.forEach((mode, index) => {
      const presentation = TERRAIN_MODE_PRESENTATION[mode];
      canvasAction(parts, `terrain-mode-${mode}`, presentation.tooltip, modes[index]!, () => {
        state.interaction.selectTerrainPaletteMode(mode);
        state.paletteOffset = 0;
        context.invalidate();
      }, { symbol: presentation.symbol, active: interactionSnapshot.terrainPaletteMode === mode });
    });
  }

  const searchSnapshot = state.search.snapshot();
  if (slots.search !== undefined) {
    const showLiveSpawn = mapId === 'live-island' && workspace === 'objects';
    const searchItems = [
      { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
      { minSize: { width: 72, height: 40 }, grow: 1 },
      ...(showLiveSpawn ? [{ minSize: { width: 40, height: 40 }, main: { mode: 'fixed' as const, size: 40 } }] : []),
      { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
    ] satisfies readonly UiFlexItem[];
    const searchControls = layoutUiFlex(slots.search, searchItems,
      { direction: 'row', gap: 4, align: 'stretch' });
    const eyedropper = searchControls[0]!;
    const search = searchControls[1]!;
    const liveSpawn = showLiveSpawn ? searchControls[2]! : undefined;
    const resize = searchControls[showLiveSpawn ? 3 : 2]!;
    canvasAction(parts, 'eyedropper', 'Sample map content into the palette (I)', eyedropper!, () => {
      resetLiveSpawn(state);
      state.interaction.toggleEyedropper();
      context.invalidate();
    }, { symbol: 'pointer', active: interactionSnapshot.eyedropperActive });
    const searchLabel = searchSnapshot.focused
      ? `${searchSnapshot.value.slice(0, searchSnapshot.focus)}|${searchSnapshot.value.slice(searchSnapshot.focus)}`
      : searchSnapshot.value || 'SEARCH PALETTE';
    canvasAction(parts, 'object-search', 'Search the active map palette', search!, () => state.search.focus(),
      { role: 'textbox' });
    const searchNodeIndex = parts.nodes.findIndex(({ id }) => id === 'object-search');
    if (searchNodeIndex >= 0) parts.nodes[searchNodeIndex] = { ...parts.nodes[searchNodeIndex]!, label: searchLabel };
    parts.textEditors.push({ id: 'object-search', editor: state.search });
    if (liveSpawn !== undefined) {
      const spawnAvailability = currentLiveSpawnAvailability(state, context, mapId);
      canvasAction(parts, 'live-spawn-mode', spawnAvailability.allowed
        ? state.liveSpawnMode
          ? 'Cancel functional live entity spawn (Escape)'
          : 'Spawn selected object as a functional live entity'
        : spawnAvailability.reason,
      liveSpawn, () => armLiveSpawn(state, context, mapId), {
        symbol: 'gamepad',
        active: state.liveSpawnMode,
        disabled: !spawnAvailability.allowed || state.liveSpawnPreviewing || state.liveSpawnCommitting,
        tone: state.liveSpawnMode ? 'danger' : undefined,
      });
    }
    canvasAction(parts, 'resize-mode', resizeAvailability.allowed
      ? 'Show or hide finite map edge resize handles' : resizeAvailability.reason,
    resize!, () => {
      resetLiveSpawn(state);
      state.resizeMode = !state.resizeMode;
      if (!state.resizeMode) cancelMapResize(state);
      context.invalidate();
    }, { symbol: 'scale', active: state.resizeMode, disabled: !resizeAvailability.allowed });
  }

  if (workspace === 'scatter' && slots.scatter !== undefined) {
    const [less, density, more] = layoutUiFlex(slots.scatter, [
      { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
      { minSize: { width: 72, height: 40 }, grow: 1 },
      { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
    ], { direction: 'row', gap: 4, align: 'stretch' });
    canvasAction(parts, 'scatter-less', 'Decrease scatter density', less!, () => {
      state.interaction.adjustScatterDensity(-500); context.invalidate();
    }, { buttonGlyph: 'down', disabled: state.interaction.snapshot().scatterDensity === 0 });
    canvasLabel(parts, 'scatter-density', `${Math.round(state.interaction.snapshot().scatterDensity / 100)}% DENSITY`,
      density!, { field: true });
    canvasAction(parts, 'scatter-more', 'Increase scatter density', more!, () => {
      state.interaction.adjustScatterDensity(500); context.invalidate();
    }, { buttonGlyph: 'up', disabled: state.interaction.snapshot().scatterDensity === 10_000 });
  }

  if (workspace === 'terrain' && slots.transition !== undefined) {
    const controls = layoutUiFlex(slots.transition, Array.from({ length: 5 }, () => ({
      minSize: { width: 40, height: 40 }, grow: 1,
    })), { direction: 'row', gap: 4, align: 'stretch' });
    const transitionKind = interactionSnapshot.transitionKind;
    canvasAction(parts, 'transition-slope', 'Author a complete slope bank', controls[0]!, () => {
      state.interaction.selectTransitionKind('slope'); context.invalidate();
    }, { symbol: 'mountain', active: transitionKind === 'slope' });
    canvasAction(parts, 'transition-stairs', 'Author a multi-course stair run', controls[1]!, () => {
      state.interaction.selectTransitionKind('stairs'); context.invalidate();
    }, { symbol: 'stairs', active: transitionKind === 'stairs' });
    canvasAction(parts, 'transition-ladder', 'Author a single-lane interaction ladder', controls[2]!, () => {
      state.interaction.selectTransitionKind('ladder'); context.invalidate();
    }, { symbol: 'cave', active: transitionKind === 'ladder' });
    canvasAction(parts, 'transition-width-less',
      `Decrease transition width from ${interactionSnapshot.transitionWidth} ([)`, controls[3]!, () => {
        state.interaction.adjustTransitionWidth(-1); context.invalidate();
      }, { buttonGlyph: 'down', disabled: interactionSnapshot.transitionWidth <= 2
        || transitionKind === 'ladder' });
    canvasAction(parts, 'transition-width-more',
      `Increase transition width from ${interactionSnapshot.transitionWidth} (])`, controls[4]!, () => {
        state.interaction.adjustTransitionWidth(1); context.invalidate();
      }, { buttonGlyph: 'up', disabled: interactionSnapshot.transitionWidth >= 4
        || transitionKind === 'ladder' });
  }

  if (!paletteView) {
    state.paletteBounds = { x: 0, y: 0, width: 0, height: 0 };
    state.paletteRowCount = 0;
    state.paletteVisibleRows = 0;
    appendMapOutliner(state, context, parts, slots.palette!);
    appendMapStats(state, context, parts, slots.stats!, `${document.width}×${document.height} · ${
      state.leftView === 'live' ? 'LIVE WORLD' : 'AUTHORED WORLD'
    }`);
    return;
  }

  state.paletteBounds = slots.palette!;
  const searchQuery = searchSnapshot.value.trim().toLocaleLowerCase();
  let paletteCount: number | undefined;
  if (workspace === 'terrain' && paletteKind === 'terrain') {
    const mode = interactionSnapshot.terrainPaletteMode;
    const editable = state.interaction.terrainAuthoringAvailable();
    if (mode === 'brush') {
      const palette = mapTerrainPalette(searchQuery);
      paletteCount = palette.length;
      const window = paletteGridWindow(state, slots.palette!, palette.length);
      const visible = palette.slice(window.start, window.start + window.count);
      if (visible.length === 0) canvasLabel(parts, 'palette-empty', 'NO MATCHING TERRAIN',
        { ...slots.palette!, height: 42 }, { field: true });
      visible.forEach((entry, index) => {
        const absoluteIndex = MAP_EDITOR_TERRAIN_TOOLS.indexOf(entry.tool);
        const preview = terrainPreview(state, context, entry);
        canvasAction(parts, `terrain-tool-${entry.tool}`,
          `${entry.title} · ${MAP_EDITOR_TERRAIN_TOOL_LABELS[entry.tool]} (${terrainToolShortcut(absoluteIndex)})`,
          window.cells[index]!, () => {
            state.interaction.selectTerrainTool(entry.tool);
            context.invalidate();
          }, {
            slot: true,
            ...(preview === undefined ? { symbol: entry.tool === 'inspect' ? 'pointer' as const
              : entry.tool === 'transition' ? 'stairs' as const : 'map' as const } : { preview }),
            active: interactionSnapshot.terrainTool === entry.tool,
            disabled: !editable,
            tone: entry.tool === 'erase_ledge' || entry.tool === 'block' ? 'danger' : undefined,
          });
      });
    } else if (mode === 'surface_family') {
      const choices = terrainSurfaceFamilyChoices(searchQuery);
      paletteCount = choices.length;
      const window = paletteGridWindow(state, slots.palette!, choices.length);
      choices.slice(window.start, window.start + window.count).forEach((choice, index) => {
        const preview = terrainChoicePreview(state, context, choice.preview);
        canvasAction(parts, `terrain-surface-${choice.familyId}`,
          `Paint ${choice.label} surface family`, window.cells[index]!, () => {
            state.interaction.selectSurfaceFamily(choice.familyId); context.invalidate();
          }, { role: 'option', slot: true, ...(preview === undefined ? { symbol: 'landPlot' as const } : { preview }),
            active: interactionSnapshot.selectedSurfaceFamily === choice.familyId, disabled: !editable });
      });
    } else if (mode === 'cliff_family') {
      const choices = terrainCliffFamilyChoices(searchQuery);
      paletteCount = choices.length;
      const window = paletteGridWindow(state, slots.palette!, choices.length);
      choices.slice(window.start, window.start + window.count).forEach((choice, index) => {
        const preview = terrainChoicePreview(state, context, choice.preview);
        canvasAction(parts, `terrain-cliff-${choice.familyId}`,
          `Paint ${choice.label} cliff family · ${choice.projectionStyle}`, window.cells[index]!, () => {
            state.interaction.selectCliffFamily(choice.familyId); context.invalidate();
          }, { role: 'option', slot: true, ...(preview === undefined ? { symbol: 'mountain' as const } : { preview }),
            active: interactionSnapshot.selectedCliffFamily === choice.familyId, disabled: !editable });
      });
    } else if (mode === 'exact_override') {
      const point = state.interaction.selectedTerrainPoint();
      const tileKey = point === null ? '' : `${point.tileX},${point.tileY}`;
      const cached = state.exactTerrainPaletteCache;
      if (cached === null || cached.document !== document || cached.tileKey !== tileKey
        || cached.query !== searchQuery) {
        state.exactTerrainPaletteCache = {
          document, tileKey, query: searchQuery,
          choices: state.interaction.exactTerrainChoicesAtSelection(searchQuery),
        };
      }
      const choices = state.exactTerrainPaletteCache?.choices ?? [];
      paletteCount = choices.length;
      const window = paletteGridWindow(state, slots.palette!, choices.length);
      if (point === null || choices.length === 0) canvasLabel(parts, 'palette-empty', point === null
        ? 'SELECT A TERRAIN CELL' : 'NO COMPATIBLE EXACT TILES',
      { ...slots.palette!, height: 42 }, { field: true });
      choices.slice(window.start, window.start + window.count).forEach((choice, index) => {
        const preview = terrainChoicePreview(state, context, {
          assetId: choice.assetId, frameIndex: choice.frameIndex,
        });
        canvasAction(parts, `terrain-exact-${choice.id}`, choice.label, window.cells[index]!, () => {
          state.interaction.selectExactTerrainOverride(choice); context.invalidate();
        }, { role: 'option', slot: true, ...(preview === undefined ? { symbol: 'replace' as const } : { preview }),
          active: interactionSnapshot.selectedExactTerrainOverrideId === choice.id, disabled: !editable });
      });
    } else {
      const entries = terrainFarmlandVisualChoices(searchQuery);
      paletteCount = entries.length;
      const window = paletteGridWindow(state, slots.palette!, entries.length);
      if (entries.length === 0) canvasLabel(parts, 'palette-empty', 'NO MATCHING TERRAIN',
        { ...slots.palette!, height: 42 }, { field: true });
      entries.forEach((entry, index) => canvasAction(parts, 'terrain-farmland-visual',
        `${entry.label} — ${entry.warning.charAt(0).toLocaleLowerCase()}${entry.warning.slice(1)}`,
      window.cells[index]!, () => {
        state.interaction.selectTerrainPaletteMode('farmland_visual'); context.invalidate();
      }, { role: 'option', slot: true,
        ...(terrainChoicePreview(state, context, entry.preview) === undefined
          ? { symbol: 'sprout' as const } : { preview: terrainChoicePreview(state, context, entry.preview) }),
        active: true, disabled: !editable }));
    }
  } else if (workspace === 'biomes') {
    const palette = biomePalette(searchQuery);
    paletteCount = palette.length;
    const rows = canvasRows(slots.palette!, Math.max(1, palette.length), 42, 4);
    state.paletteRowCount = palette.length;
    state.paletteVisibleRows = rows.length;
    state.paletteOffset = Math.min(state.paletteOffset, Math.max(0, palette.length - rows.length));
    const visible = palette.slice(state.paletteOffset, state.paletteOffset + rows.length);
    if (visible.length === 0) canvasLabel(parts, 'palette-empty', 'NO MATCHING TERRAIN', rows[0]!, { field: true });
    visible.forEach((biome: MapBiomeId, index) => {
      canvasAction(parts, `biome-${biome}`, `Paint ${biome}`, rows[index]!, () => {
        state.interaction.selectBiome(biome); context.invalidate();
      }, { role: 'option', glyph: biome.replaceAll('_', ' ').toUpperCase(),
        active: state.interaction.snapshot().selectedBiome === biome });
    });
  } else if (paletteKind === 'objects') {
    const palette = state.interaction.palette(searchSnapshot.value);
    paletteCount = palette.length;
    const window = paletteGridWindow(state, slots.palette!, palette.length);
    const visible = palette.slice(window.start, window.start + window.count);
    if (visible.length === 0) canvasLabel(parts, 'palette-empty', state.catalogLoading
      ? 'LOADING ASSET LIBRARY' : 'NO OBJECTS FOR THIS LAYER',
    { ...slots.palette!, height: 42 }, { field: true });
    visible.forEach((entry, index) => {
      const preview = prefabPreview(state, context, entry);
      canvasAction(parts, `prefab-${entry.id}`, `Place ${entry.title} as authored scenery`,
        window.cells[index]!, () => {
          const nextDefinitionId = state.catalogDefinitionIds.get(entry.id);
          if (state.liveSpawnMode && isMapFunctionalLiveDefinitionId(nextDefinitionId)) {
            resetLiveSpawn(state, false);
            state.liveSpawnDefinitionId = nextDefinitionId;
            state.liveSpawnPrefabId = entry.id;
          } else if (state.liveSpawnMode) resetLiveSpawn(state);
          state.interaction.selectPrefab(entry.id);
          context.invalidate();
        },
        { role: 'option', slot: true, ...(preview === undefined ? { symbol: 'box' as const } : { preview }),
          active: interactionSnapshot.selectedPrefabId === entry.id });
    });
  } else if (paletteKind === 'anchors') {
    const entries = mapAnchorToolPalette(searchSnapshot.value);
    paletteCount = entries.length;
    const window = paletteGridWindow(state, slots.palette!, entries.length);
    const visible = entries.slice(window.start, window.start + window.count);
    if (visible.length === 0) canvasLabel(parts, 'palette-empty', 'NO MATCHING ANCHOR TOOLS',
      { ...slots.palette!, height: 42 }, { field: true });
    visible.forEach((entry, index) => {
      const available = entry.authorable && state.interaction.anchorPlacementAvailable();
      const tooltip = entry.authorable
        ? available ? `Place ${entry.title}; click map at exact projected terrain elevation`
          : `Cannot place ${entry.title}; select the visible editable Anchors layer`
        : `${entry.title}: runtime authority not available`;
      canvasAction(parts, `anchor-tool-${entry.kind}`, tooltip, window.cells[index]!, () => {
        if (!entry.authorable) return;
        state.interaction.selectAnchorKind(
          interactionSnapshot.selectedAnchorKind === entry.kind ? null : entry.kind,
        );
        context.invalidate();
      }, { role: 'option', slot: true, symbol: ANCHOR_KIND_SYMBOLS[entry.kind],
        active: interactionSnapshot.selectedAnchorKind === entry.kind,
        disabled: !available });
    });
  } else {
    state.paletteRowCount = 0;
    state.paletteVisibleRows = 0;
    state.paletteOffset = 0;
    paletteCount = 0;
    canvasLabel(parts, 'palette-empty', 'LIVE PLAYER OBJECTS · READ ONLY',
    { ...slots.palette!, height: 42 }, { field: true });
  }
  const liveSpawnReceipt = state.liveSpawnModel?.pending() ?? null;
  const stateLabel = state.liveSpawnMode
    ? state.liveSpawnCommitting ? 'LIVE SPAWN · COMMITTING'
      : state.liveSpawnPreviewing ? 'LIVE SPAWN · VALIDATING'
        : liveSpawnReceipt === null ? 'LIVE SPAWN · CLICK MAP'
          : `LIVE SPAWN · ${liveSpawnReceipt.tileX},${liveSpawnReceipt.tileY} · CONFIRM`
    : state.interaction.snapshot().eyedropperActive
    ? 'EYEDROPPER · CLICK MAP'
    : interactionSnapshot.selectedAnchorKind !== null
      ? `PLACE ${interactionSnapshot.selectedAnchorKind.toUpperCase()} · CLICK MAP · ESC CANCEL`
    : workspace === 'terrain'
    ? interactionSnapshot.terrainAuthoringFeedback !== null
      ? interactionSnapshot.terrainAuthoringFeedback
      : state.interaction.snapshot().terrainTool === 'transition'
      ? `${state.interaction.snapshot().transitionKind.toUpperCase()} W${
        state.interaction.snapshot().transitionKind === 'ladder' ? 1 : state.interaction.snapshot().transitionWidth
      } · ${state.interaction.snapshot().transitionFeedback ?? 'DRAG LOWER TO UPPER'}`
      : `${interactionSnapshot.terrainPaletteMode.replaceAll('_', ' ').toUpperCase()} · ${
        state.interaction.snapshot().terrainTool.replaceAll('_', ' ').toUpperCase()
      } · L${state.interaction.snapshot().activeElevation}`
    : workspace === 'scatter'
      ? `DRAW TO SCATTER · ${Math.round(state.interaction.snapshot().scatterDensity / 100)}%`
    : `${activeLayer.toUpperCase()} · ${paletteCount ?? 0}`;
  appendMapStats(state, context, parts, slots.stats!,
    `${document.width}×${document.height} · ${stateLabel}`);
}

function appendWorldOverlayControls(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: ReturnType<typeof canvasParts>,
): void {
  const snapshot = state.interaction.snapshot();
  const bounds = context.workspaceBounds;
  const buttons = [
    { x: bounds.x + 8, y: bounds.y + 8, width: 40, height: 40 },
    { x: bounds.x + 52, y: bounds.y + 8, width: 40, height: 40 },
  ] as const;
  canvasAction(parts, 'height-overlay', 'Show or hide elevation overlay (H)', buttons[0], () => {
    state.interaction.toggleHeightOverlay(); context.invalidate();
  }, { symbol: 'height', active: snapshot.heightOverlayVisible });
  canvasAction(parts, 'collision-overlay', 'Show or hide collision overlay (C)', buttons[1], () => {
    state.interaction.toggleCollisionOverlay(); context.invalidate();
  }, { symbol: 'collision', active: snapshot.collisionOverlayVisible });
}

function appendResizeOverlay(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: ReturnType<typeof canvasParts>,
): void {
  const document = state.model.document();
  const availability = state.model.resizeAvailability();
  const bounds = context.workspaceBounds;
  if (!availability.allowed || (!state.resizeMode && state.resizeImpact === null)) return;
  if (state.resizeImpact === null) {
    const edgeControls: Readonly<Record<MapResizeEdge, readonly [UiRect, UiRect]>> = {
      west: [
        { x: bounds.x + 8, y: bounds.y + Math.round(bounds.height / 2) - 43, width: 40, height: 40 },
        { x: bounds.x + 8, y: bounds.y + Math.round(bounds.height / 2) + 3, width: 40, height: 40 },
      ],
      east: [
        { x: bounds.x + bounds.width - 48, y: bounds.y + Math.round(bounds.height / 2) - 43, width: 40, height: 40 },
        { x: bounds.x + bounds.width - 48, y: bounds.y + Math.round(bounds.height / 2) + 3, width: 40, height: 40 },
      ],
      north: [
        { x: bounds.x + Math.round(bounds.width / 2) - 43, y: bounds.y + 8, width: 40, height: 40 },
        { x: bounds.x + Math.round(bounds.width / 2) + 3, y: bounds.y + 8, width: 40, height: 40 },
      ],
      south: [
        { x: bounds.x + Math.round(bounds.width / 2) - 43, y: bounds.y + bounds.height - 48, width: 40, height: 40 },
        { x: bounds.x + Math.round(bounds.width / 2) + 3, y: bounds.y + bounds.height - 48, width: 40, height: 40 },
      ],
    };
    (['west', 'east', 'north', 'south'] as const).forEach((edge) => {
      const dimension = edge === 'west' || edge === 'east' ? document.width : document.height;
      const unavailable = !availability.allowed ? availability.reason
        : dimension <= 1 ? 'Map edge cannot shrink below one tile' : null;
      canvasAction(parts, `resize-${edge}-shrink`, unavailable ?? `Preview crop of the ${edge} edge by one tile`,
        edgeControls[edge][0], () => requestMapResize(state, context, edge, false), {
          glyph: `${edge[0]!.toUpperCase()}−`, tone: 'danger', disabled: unavailable !== null,
        });
      canvasAction(parts, `resize-${edge}-grow`, availability.allowed
        ? `Grow the ${edge} edge by one tile` : availability.reason,
      edgeControls[edge][1], () => requestMapResize(state, context, edge, true), {
        glyph: `${edge[0]!.toUpperCase()}+`, disabled: !availability.allowed,
      });
    });
    return;
  }

  const impact = state.resizeImpact;
  const panelWidth = Math.min(460, bounds.width - 24);
  const panelBounds = {
    x: bounds.x + Math.round((bounds.width - panelWidth) / 2),
    y: bounds.y + 12,
    width: panelWidth,
    height: 116,
  };
  const content = canvasPanel(parts, 'resize-preview-panel', panelBounds, 'thin', 4);
  const regions = canvasSlots(content, [
    { id: 'dimensions', minSize: { width: 1, height: 30 }, main: { mode: 'fixed', size: 30 } },
    { id: 'loss', minSize: { width: 1, height: 30 }, main: { mode: 'fixed', size: 30 } },
    { id: 'actions', minSize: { width: 1, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 3 });
  canvasLabel(parts, 'resize-preview-dimensions',
    `CROP ${impact.edge.toUpperCase()} · ${impact.command.width}×${impact.command.height} · ${impact.croppedTileCount} TILES`,
  regions.dimensions!, { field: true, tone: 'danger' });
  const objectLoss = impact.removedObjectIds.length + impact.removedLandmarkIds.length;
  const transitionLoss = impact.removedTransitionCount + impact.removedStairRunCount;
  const otherLoss = mapResizeImpactLossCount(impact) - objectLoss - transitionLoss;
  canvasLabel(parts, 'resize-preview-loss',
    `OBJECT ${objectLoss} · TRANSITION ${transitionLoss} · OTHER ${otherLoss}`,
  regions.loss!, { field: true, tone: mapResizeImpactLossCount(impact) > 0 ? 'danger' : undefined });
  const [cancel, confirm] = layoutUiFlex(regions.actions!, Array.from({ length: 2 }, () => ({
    minSize: { width: 40, height: 40 }, grow: 1,
  })), { direction: 'row', gap: 5, align: 'stretch' });
  canvasAction(parts, 'resize-cancel', 'Cancel map crop (Escape)', cancel!, () => {
    cancelMapResize(state); context.invalidate();
  }, { buttonGlyph: 'cross' });
  canvasAction(parts, 'resize-confirm', `Confirm destructive ${impact.edge} edge crop (Enter)`,
    confirm!, () => confirmMapResize(state, context), { buttonGlyph: 'return', tone: 'danger' });
}

function appendLiveSpawnOverlay(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: ReturnType<typeof canvasParts>,
): void {
  if (!state.liveSpawnMode || state.liveSpawnTarget === null) return;
  const receipt: MapSpawnHereReceipt | null = state.liveSpawnModel?.pending() ?? null;
  const bounds = context.workspaceBounds;
  const panelWidth = Math.min(560, bounds.width - 24);
  const panelBounds = {
    x: bounds.x + Math.round((bounds.width - panelWidth) / 2),
    y: bounds.y + 12,
    width: panelWidth,
    height: 250,
  };
  const content = canvasPanel(parts, 'live-spawn-preview-panel', panelBounds, 'thin', 4);
  const regions = canvasSlots(content, [
    { id: 'ribbon', minSize: { width: 1, height: 30 }, main: { mode: 'fixed', size: 30 } },
    { id: 'target', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'authority', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'content', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'receipt', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'impact', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'actions', minSize: { width: 1, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 3 });
  parts.nodes.push({ id: 'live-spawn-ribbon', kind: 'ribbon', bounds: regions.ribbon!,
    label: state.liveSpawnCommitting ? 'SPAWNING LIVE ENTITY' : 'LIVE ENTITY PREVIEW' });
  const displayName = receipt?.displayName ?? liveSpawnDisplayName(state) ?? 'Functional entity';
  canvasLabel(parts, 'live-spawn-target',
    `${displayName.toUpperCase()} · TILE ${state.liveSpawnTarget.tileX},${state.liveSpawnTarget.tileY} · SPACE ${TOPSIDE_SPACE_ID}`,
  regions.target!, { field: true });
  canvasLabel(parts, 'live-spawn-authority', receipt === null
    ? 'AUTHORITY CHECK · VALIDATING'
    : `AUTHORITY ${receipt.authority.toUpperCase()} · REASON ${receipt.reason}`,
  regions.authority!, { field: true });
  canvasLabel(parts, 'live-spawn-content', receipt === null
    ? 'CONTENT HEAD · VALIDATING'
    : `CONTENT R${receipt.contentVersion} · ${receipt.contentFingerprint}`,
  regions.content!, { field: true });
  canvasLabel(parts, 'live-spawn-receipt', receipt === null
    ? 'BASE + RECEIPT · VALIDATING'
    : `BASE ${receipt.baseVersion} · RECEIPT ${receipt.previewFingerprint}`,
  regions.receipt!, { field: true });
  canvasLabel(parts, 'live-spawn-impact', receipt === null
    ? 'NO WORLD CHANGE UNTIL CONFIRMED'
    : `${receipt.preview.preview.changes.length} EXACT CHANGE(S) · ${receipt.preview.warnings.length} WARNING(S)`,
  regions.impact!, { field: true, tone: receipt?.preview.warnings.length ? 'danger' : 'success' });
  const [cancel, confirm] = layoutUiFlex(regions.actions!, Array.from({ length: 2 }, () => ({
    minSize: { width: 40, height: 40 }, grow: 1,
  })), { direction: 'row', gap: 5, align: 'stretch' });
  canvasAction(parts, 'live-spawn-cancel', 'Cancel functional live entity spawn (Escape)',
    cancel!, () => { resetLiveSpawn(state); context.invalidate(); }, {
      buttonGlyph: 'cross', disabled: state.liveSpawnCommitting,
    });
  canvasAction(parts, 'live-spawn-confirm', receipt === null
    ? 'Wait for the exact live mutation preview before confirming'
    : `Confirm live spawn of ${receipt.displayName} at ${receipt.tileX},${receipt.tileY}`,
  confirm!, () => confirmLiveSpawn(state, context), {
    buttonGlyph: 'return', tone: 'danger',
    disabled: receipt === null || state.liveSpawnPreviewing || state.liveSpawnCommitting,
  });
}

function appendRuntimeObjectOverlay(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: ReturnType<typeof canvasParts>,
): void {
  const marker = state.runtimeObjectMarker;
  if (marker === null) return;
  const receipt: MapRuntimeObjectReceipt | null = state.runtimeObjectModel?.pending() ?? null;
  const operation = receipt?.operation ?? (state.runtimeObjectMoveMode ? 'move_entity' : null);
  const bounds = context.workspaceBounds;
  const panelWidth = Math.min(580, bounds.width - 24);
  const panelBounds = {
    x: bounds.x + Math.round((bounds.width - panelWidth) / 2),
    y: bounds.y + 12,
    width: panelWidth,
    height: 220,
  };
  const content = canvasPanel(parts, 'runtime-object-preview-panel', panelBounds, 'thin', 4);
  const regions = canvasSlots(content, [
    { id: 'ribbon', minSize: { width: 1, height: 30 }, main: { mode: 'fixed', size: 30 } },
    { id: 'target', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'custody', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'receipt', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'impact', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'actions', minSize: { width: 1, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 3 });
  const title = operation === 'move_entity' ? 'MOVE LIVE OBJECT'
    : operation === 'repair_entity' ? 'REPAIR LIVE OBJECT'
      : operation === 'despawn_entity' ? 'DESPAWN LIVE OBJECT' : 'LIVE OBJECT PREVIEW';
  parts.nodes.push({ id: 'runtime-object-ribbon', kind: 'ribbon', bounds: regions.ribbon!,
    label: state.runtimeObjectCommitting ? 'COMMITTING LIVE OBJECT' : title });
  const destination = receipt?.to ?? state.runtimeObjectTarget;
  canvasLabel(parts, 'runtime-object-target', destination === null
    ? `${marker.label.toUpperCase()} ${marker.id} · CLICK A DESTINATION TILE`
    : `${marker.label.toUpperCase()} ${marker.id} · ${marker.tileX},${marker.tileY} → ${destination.tileX},${destination.tileY}`,
  regions.target!, { field: true });
  canvasLabel(parts, 'runtime-object-custody', receipt === null
    ? 'AUTHORITY SNAPSHOT · VALIDATING'
    : receipt.playerOwned
      ? 'PLAYER-OWNED CUSTODY · OWNER NOTICE + AUDIT REQUIRED'
      : 'SYSTEM CUSTODY · AUDIT REQUIRED',
  regions.custody!, { field: true, tone: receipt?.playerOwned ? 'danger' : undefined });
  canvasLabel(parts, 'runtime-object-receipt', receipt === null
    ? state.runtimeObjectMoveMode ? 'NO WORLD CHANGE · CHOOSE A TILE' : 'BASE + RECEIPT · VALIDATING'
    : `BASE ${receipt.baseVersion} · RECEIPT ${receipt.previewFingerprint}`,
  regions.receipt!, { field: true });
  canvasLabel(parts, 'runtime-object-impact', receipt === null
    ? 'NO WORLD CHANGE UNTIL PREVIEWED AND CONFIRMED'
    : `${receipt.preview.preview.changes.length} EXACT CHANGE(S) · ${receipt.preview.warnings.length} WARNING(S)`,
  regions.impact!, { field: true,
    tone: receipt?.operation === 'despawn_entity' || receipt?.preview.warnings.length ? 'danger' : 'success' });
  const [cancel, confirm] = layoutUiFlex(regions.actions!, Array.from({ length: 2 }, () => ({
    minSize: { width: 40, height: 40 }, grow: 1,
  })), { direction: 'row', gap: 5, align: 'stretch' });
  canvasAction(parts, 'runtime-object-cancel', 'Cancel runtime object action (Escape)', cancel!, () => {
    resetRuntimeObjectAction(state); context.invalidate();
  }, { buttonGlyph: 'cross', disabled: state.runtimeObjectCommitting });
  canvasAction(parts, 'runtime-object-confirm', receipt === null
    ? state.runtimeObjectMoveMode ? 'Choose a destination tile before confirming'
      : 'Wait for the exact authority preview before confirming'
    : `Confirm ${receipt.operation.replaceAll('_', ' ')} with exact receipt and audit`,
  confirm!, () => confirmRuntimeObjectAction(state, context), {
    buttonGlyph: 'return', tone: receipt?.operation === 'despawn_entity' ? 'danger' : 'success',
    disabled: receipt === null || state.runtimeObjectPreviewing || state.runtimeObjectCommitting,
  });
}

function appendNpcLocationOverlay(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: ReturnType<typeof canvasParts>,
): void {
  const marker = state.npcLocationMarker;
  if (marker === null) return;
  const receipt: MapNpcLocationReceipt | null = state.npcLocationModel?.pending() ?? null;
  const bounds = context.workspaceBounds;
  const panelWidth = Math.min(580, bounds.width - 24);
  const panelBounds = {
    x: bounds.x + Math.round((bounds.width - panelWidth) / 2),
    y: bounds.y + 12,
    width: panelWidth,
    height: 220,
  };
  const content = canvasPanel(parts, 'npc-location-preview-panel', panelBounds, 'thin', 4);
  const regions = canvasSlots(content, [
    { id: 'ribbon', minSize: { width: 1, height: 30 }, main: { mode: 'fixed', size: 30 } },
    { id: 'target', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'authority', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'receipt', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'impact', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'actions', minSize: { width: 1, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 3 });
  parts.nodes.push({ id: 'npc-location-ribbon', kind: 'ribbon', bounds: regions.ribbon!,
    label: state.npcLocationCommitting ? 'COMMITTING NPC HOME + LOCATION' : 'NPC HOME + LOCATION' });
  const destination = receipt?.to ?? state.npcLocationTarget;
  const homeX = marker.homeTileX ?? marker.tileX;
  const homeY = marker.homeTileY ?? marker.tileY;
  canvasLabel(parts, 'npc-location-target', destination === null
    ? `${marker.label.toUpperCase()} ${marker.id} · CLICK A DESTINATION TILE`
    : `${marker.label.toUpperCase()} ${marker.id} · LIVE ${marker.tileX},${marker.tileY} · HOME ${homeX},${homeY} → ${destination.tileX},${destination.tileY}`,
  regions.target!, { field: true });
  canvasLabel(parts, 'npc-location-authority',
    'AUTHORITY RELOCATES LIVE POSITION + HOME ATOMICALLY', regions.authority!, { field: true });
  canvasLabel(parts, 'npc-location-receipt', receipt === null
    ? state.npcLocationMoveMode ? 'NO WORLD CHANGE · CHOOSE A TILE' : 'BASE + RECEIPT · VALIDATING'
    : `BASE ${receipt.baseVersion} · RECEIPT ${receipt.previewFingerprint}`,
  regions.receipt!, { field: true });
  canvasLabel(parts, 'npc-location-impact', receipt === null
    ? 'NO WORLD CHANGE UNTIL PREVIEWED AND CONFIRMED'
    : `${receipt.preview.preview.changes.length} EXACT CHANGE(S) · INVERSE AUDIT REQUIRED`,
  regions.impact!, { field: true, tone: receipt === null ? undefined : 'success' });
  const [cancel, confirm] = layoutUiFlex(regions.actions!, Array.from({ length: 2 }, () => ({
    minSize: { width: 40, height: 40 }, grow: 1,
  })), { direction: 'row', gap: 5, align: 'stretch' });
  canvasAction(parts, 'npc-location-cancel', 'Cancel NPC home/location change (Escape)', cancel!, () => {
    resetNpcLocationAction(state); context.invalidate();
  }, { buttonGlyph: 'cross', disabled: state.npcLocationCommitting });
  canvasAction(parts, 'npc-location-confirm', receipt === null
    ? state.npcLocationMoveMode ? 'Choose a destination tile before confirming'
      : 'Wait for the exact authority preview before confirming'
    : `Confirm ${receipt.displayName} home and location with exact receipt and inverse audit`,
  confirm!, () => confirmNpcLocationAction(state, context), {
    buttonGlyph: 'return', tone: 'success',
    disabled: receipt === null || state.npcLocationPreviewing || state.npcLocationCommitting,
  });
}

function appendSchemaInspectorOverlay(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: ReturnType<typeof canvasParts>,
  mapId: string,
): void {
  const field = state.schemaActionField;
  if (field === null) return;
  const receipt: MapSchemaInspectorReceipt | null = state.schemaActionModel?.pending() ?? null;
  const bounds = context.workspaceBounds;
  const panelWidth = Math.min(600, bounds.width - 24);
  const panelBounds = {
    x: bounds.x + Math.round((bounds.width - panelWidth) / 2),
    y: bounds.y + 12,
    width: panelWidth,
    height: 226,
  };
  const content = canvasPanel(parts, 'schema-action-panel', panelBounds, 'thin', 4);
  const regions = canvasSlots(content, [
    { id: 'ribbon', minSize: { width: 1, height: 30 }, main: { mode: 'fixed', size: 30 } },
    { id: 'why', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'editor', minSize: { width: 1, height: 40 }, main: { mode: 'fixed', size: 40 } },
    { id: 'receipt', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'impact', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'actions', minSize: { width: 1, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 3 });
  parts.nodes.push({
    id: 'schema-action-ribbon', kind: 'ribbon', bounds: regions.ribbon!,
    label: state.schemaActionCommitting ? `COMMITTING ${field.label.toUpperCase()}`
      : `SCHEMA ACTION · ${field.label.toUpperCase()}`,
  });
  canvasLabel(parts, 'schema-action-why', `WHY  ${field.why}`, regions.why!, { field: true });
  const snapshot = state.schemaActionEditor.snapshot();
  const visible = snapshot.focused
    ? `${snapshot.value.slice(0, snapshot.focus)}|${snapshot.value.slice(snapshot.focus)}`
    : snapshot.value;
  canvasAction(parts, 'schema-action-editor', state.schemaActionError
    ?? `Type a valid ${field.kind} value for ${field.label}`, regions.editor!, () => context.invalidate(), {
    role: 'textbox', glyph: visible,
    ...(state.schemaActionError === null ? {} : { tone: 'danger' as const }),
  });
  parts.textEditors.push({ id: 'schema-action-editor', editor: state.schemaActionEditor });
  canvasLabel(parts, 'schema-action-receipt', receipt === null
    ? state.schemaActionPreviewing ? 'ASKING AUTHORITY FOR AN EXACT PREVIEW'
      : 'NO WORLD CHANGE · PREVIEW REQUIRED'
    : `BASE ${receipt.baseVersion} · RECEIPT ${receipt.previewFingerprint}`,
  regions.receipt!, { field: true });
  canvasLabel(parts, 'schema-action-impact', receipt === null
    ? 'TYPE → PREVIEW → EXPLICITLY CONFIRM'
    : `${receipt.stateKey}: ${String(receipt.before).toUpperCase()} → ${String(receipt.after).toUpperCase()} · AUDIT + INVERSE REQUIRED`,
  regions.impact!, { field: true, tone: receipt === null ? undefined : 'success' });
  const [cancel, proceed] = layoutUiFlex(regions.actions!, Array.from({ length: 2 }, () => ({
    minSize: { width: 40, height: 40 }, grow: 1,
  })), { direction: 'row', gap: 5, align: 'stretch' });
  canvasAction(parts, 'schema-action-cancel', 'Cancel schema field action (Escape)', cancel!, () => {
    resetSchemaInspectorAction(state); context.invalidate();
  }, { buttonGlyph: 'cross', disabled: state.schemaActionCommitting });
  canvasAction(parts, 'schema-action-proceed', receipt === null
    ? 'Preview this typed change against exact live authority'
    : `Confirm ${receipt.fieldLabel} with the exact receipt and inverse audit`, proceed!, () => {
    if (receipt === null) previewSchemaInspectorAction(state, context, mapId);
    else confirmSchemaInspectorAction(state, context, mapId);
  }, {
    buttonGlyph: 'return', tone: receipt === null ? undefined : 'success',
    disabled: state.schemaActionPreviewing || state.schemaActionCommitting,
  });
}

function appendPublishConflictOverlay(
  state: MapCanvasState,
  context: StudioCanvasToolContext,
  parts: ReturnType<typeof canvasParts>,
  revision: number,
): void {
  const bounds = context.workspaceBounds;
  const panelWidth = Math.min(440, bounds.width - 24);
  const panelBounds = {
    x: bounds.x + Math.round((bounds.width - panelWidth) / 2),
    y: bounds.y + 12,
    width: panelWidth,
    height: 82,
  };
  const content = canvasPanel(parts, 'publish-conflict-panel', panelBounds, 'thin', 4);
  const regions = canvasSlots(content, [
    { id: 'ribbon', minSize: { width: 1, height: 28 }, main: { mode: 'fixed', size: 28 } },
    { id: 'actions', minSize: { width: 1, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 4 });
  parts.nodes.push({
    id: 'publish-conflict-ribbon', kind: 'ribbon', bounds: regions.ribbon!,
    label: `MAP CONFLICT · LIVE R${revision}`,
  });
  const [reload, keepLocal, exportLocal] = layoutUiFlex(regions.actions!, Array.from(
    { length: 3 }, () => ({ minSize: { width: 40, height: 40 }, grow: 1 })),
  { direction: 'row', gap: 4, align: 'stretch' });
  canvasAction(parts, 'publish-conflict-reload',
    `Reload verified live revision ${revision}; discard this local draft and its undo history`,
  reload!, () => {
    try {
      state.model.reloadLatest();
      state.dismissedConflictRevision = null;
      context.controller.notifications.push('success', 'Latest map loaded', `Live revision ${revision}`);
      context.invalidate();
    } catch (error: unknown) {
      reportCanvasError(context, 'Latest map reload failed', error);
    }
  }, { symbol: 'load', tone: 'danger' });
  canvasAction(parts, 'publish-conflict-keep-local',
    `Keep the local draft for live revision ${revision}; publishing remains blocked`,
  keepLocal!, () => {
    state.dismissedConflictRevision = revision;
    context.controller.notifications.push(
      'info', 'Local map draft kept', `Conflict with live revision ${revision}; publish remains blocked`,
    );
    context.invalidate();
  }, { symbol: 'save' });
  canvasAction(parts, 'publish-conflict-export',
    'Download this conflicting local draft as validated JSON without changing the live map',
  exportLocal!, () => { exportMapDraft(state, context); }, { symbol: 'export' });
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
  parts: ReturnType<typeof canvasParts>): void {
  const inspector = context.inspectorBounds;
  if (inspector === undefined) return;
  const inspection = selectionInspection(state);
  const schemaRows = mapCanvasInspectorRows(context.controller.inspector.groups());
  const inspectionRows: readonly MapCanvasInspectorRow[] = inspection === null ? []
    : state.inspectorView === 'schema'
    ? schemaRows : mapSelectionDrawerRows(inspection).map((row) => ({
      ...row, heading: false, danger: false, property: null,
    }));
  const hasSelection = inspection !== null;
  const authored = inspection?.entity?.kind === 'authored_object'
    || inspection?.entity?.kind === 'authored_landmark';
  const editableAnchor = inspection?.entity?.kind === 'authored_anchor'
    && !inspection.entity.readOnly;
  const runtimeMarker = selectedRuntimeObjectMarker(state);
  const runtimeObjectSelection = inspection?.entity?.kind === 'live_object'
    && runtimeMarker !== null
    && (runtimeMarker.entityKind === 'placeable' || runtimeMarker.entityKind === 'chest');
  const npcMarker = selectedNpcLocationMarker(state);
  const npcLocationSelection = inspection?.entity?.kind === 'live_object'
    && npcMarker !== null;
  const terrainSelection = inspection?.target === 'tile' && state.model.workspace() === 'terrain';
  if (state.editingAnchorId !== null && (!editableAnchor
    || inspection.entity?.id !== state.editingAnchorId)) cancelAnchorLabelEdit(state);
  const selectionKey = inspection === null ? null : `${state.inspectorView}:` + (
    inspection.entity === null
      ? `tile:${inspection.tileX},${inspection.tileY}`
      : `${inspection.entity.kind}:${inspection.entity.id}`
  );
  if (state.selectionActiveKey !== selectionKey) {
    state.selectionOffset = 0;
    state.selectionActiveKey = selectionKey;
  }
  const cards = mapRightDrawerCards(inspector, hasSelection);
  const regions = {
    selection: cards.selection === null ? undefined
      : canvasPanel(parts, 'selection-card-panel', cards.selection, 'thin', 4),
    layers: canvasPanel(parts, 'layers-card-panel', cards.layers, 'thin', 4),
  } satisfies Readonly<Record<'selection' | 'layers', UiRect | undefined>>;

  if (inspection !== null && regions.selection !== undefined) {
    const selection = canvasSlots(regions.selection, [
      { id: 'ribbon', minSize: { width: 1, height: 30 }, main: { mode: 'fixed', size: 30 } },
      { id: 'views', minSize: { width: 1, height: 40 }, main: { mode: 'fixed', size: 40 } },
      { id: 'fields', minSize: { width: 1, height: 80 }, main: { mode: 'grow', min: 80 } },
      ...(authored || editableAnchor || runtimeObjectSelection || npcLocationSelection || terrainSelection ? [{
        id: 'actions', minSize: { width: 1, height: authored ? 86 : terrainSelection ? 76 : 42 },
        main: { mode: 'fixed' as const, size: authored ? 86 : terrainSelection ? 76 : 42 },
      }] : []),
      ...(inspection.suppression.supported ? [{
        id: 'suppression', minSize: { width: 1, height: 42 }, main: { mode: 'fixed' as const, size: 42 },
      }] : []),
    ], { gap: 5 });
    parts.nodes.push({ id: 'selection-ribbon', kind: 'ribbon', bounds: selection.ribbon!, label: 'SELECTION' });
    const inspectorViews = layoutUiFlex(selection.views!, Array.from({ length: 2 }, () => ({
      minSize: { width: 40, height: 40 }, grow: 1,
    })), { direction: 'row', gap: 4, align: 'stretch' });
    canvasAction(parts, 'selection-view-visual', 'Show composed selection and terrain details',
      inspectorViews[0]!, () => {
        state.inspectorView = 'selection'; state.selectionOffset = 0; context.invalidate();
      }, { role: 'tab', symbol: 'pointer', active: state.inspectorView === 'selection' });
    canvasAction(parts, 'selection-view-schema', 'Show the full schema Inspector fields and why help',
      inspectorViews[1]!, () => {
        state.inspectorView = 'schema'; state.selectionOffset = 0; context.invalidate();
      }, { role: 'tab', symbol: 'layers', active: state.inspectorView === 'schema' });
    state.selectionBounds = selection.fields!;
    state.selectionRowCount = inspectionRows.length;
    const fieldRows = canvasRows(selection.fields!, inspectionRows.length,
      state.inspectorView === 'schema' ? 40 : 30, 2);
    const maximumSelectionOffset = Math.max(0, inspectionRows.length - fieldRows.length);
    state.selectionOffset = Math.max(0, Math.min(maximumSelectionOffset, state.selectionOffset));
    inspectionRows.slice(state.selectionOffset, state.selectionOffset + fieldRows.length)
      .forEach((row, index) => {
        const property = row.property;
        const declaredAction = property === null ? null : parseMapSchemaInspectorAction(property.action);
        if (property !== null && declaredAction !== null) {
          const mapId = studioMapId(context.route.path);
          const availability = mapSchemaInspectorAvailability(
            property as MapSchemaInspectorField,
            currentSchemaInspectorAuthority(state, context, mapId),
          );
          canvasAction(parts, `selection-${row.id}`, availability.reason, fieldRows[index]!, () => {
            beginSchemaInspectorAction(state, context, mapId, property);
          }, {
            glyph: row.label,
            disabled: !availability.editable,
            ...(row.danger ? { tone: 'danger' as const } : {}),
          });
        } else {
          canvasLabel(parts, `selection-${row.id}`, row.label, fieldRows[index]!, {
            field: !row.heading,
            heading: row.heading,
            ...(row.danger ? { tone: 'danger' as const } : {}),
          });
        }
      });
    if (authored) {
      const actionRows = canvasRows(selection.actions!, 2, 40, 6);
      const actions = actionRows.flatMap((row) => layoutUiFlex(row, Array.from({ length: 3 }, () => ({
        minSize: { width: 40, height: 40 }, grow: 1,
      })), { direction: 'row', gap: 5, align: 'stretch' }));
      canvasAction(parts, 'selection-hide', 'Hide or show selected map content (Shift+H)', actions[0]!, () => {
        state.interaction.toggleSelectedVisibility(); context.invalidate();
      }, { buttonGlyph: 'power', active: inspection.entity?.enabled === true });
      canvasAction(parts, 'selection-clone', 'Clone selected map content (Ctrl+D)', actions[1]!, () => {
        state.interaction.cloneSelected(); context.invalidate();
      }, { buttonGlyph: 'square' });
      canvasAction(parts, 'selection-rotate', 'Rotate selected map content 90° (R)', actions[2]!, () => {
        state.interaction.rotateSelected(); context.invalidate();
      }, { buttonGlyph: 'return' });
      canvasAction(parts, 'selection-flip', 'Flip selected map content horizontally (X)', actions[3]!, () => {
        state.interaction.flipSelected(); context.invalidate();
      }, { buttonGlyph: 'left_2' });
      canvasAction(parts, 'selection-scale', 'Toggle selected map content between 1× and 2× (=)', actions[4]!, () => {
        state.interaction.cycleSelectedScale(); context.invalidate();
      }, { buttonGlyph: 'up_2' });
      canvasAction(parts, 'selection-delete', 'Delete selected authored map content', actions[5]!, () => {
        state.interaction.deleteSelected(); context.invalidate();
      }, { buttonGlyph: 'cross', tone: 'danger' });
    } else if (editableAnchor) {
      if (state.editingAnchorId === inspection.entity!.id) {
        const [field, confirm, cancel] = layoutUiFlex(selection.actions!, [
          { minSize: { width: 80, height: 40 }, grow: 1 },
          { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
          { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
        ], { direction: 'row', gap: 3, align: 'stretch' });
        const labelSnapshot = state.anchorLabel.snapshot();
        const visibleLabel = labelSnapshot.focused
          ? `${labelSnapshot.value.slice(0, labelSnapshot.focus)}|${labelSnapshot.value.slice(labelSnapshot.focus)}`
          : labelSnapshot.value;
        canvasAction(parts, 'selection-edit-anchor-label', state.anchorLabelError
          ?? `Edit ${inspection.entity!.name} label`, field!, () => commitAnchorLabelEdit(state, context), {
          role: 'textbox', glyph: visibleLabel,
          ...(state.anchorLabelError === null ? {} : { tone: 'danger' as const }),
        });
        parts.textEditors.push({ id: 'selection-edit-anchor-label', editor: state.anchorLabel });
        canvasAction(parts, 'selection-confirm-anchor-label', 'Confirm annotation anchor label (Enter)',
          confirm!, () => commitAnchorLabelEdit(state, context), {
            buttonGlyph: 'return', tone: 'success',
          });
        canvasAction(parts, 'selection-cancel-anchor-label', 'Cancel annotation anchor label edit (Escape)',
          cancel!, () => { cancelAnchorLabelEdit(state); context.invalidate(); }, { buttonGlyph: 'cross' });
      } else {
        const [edit, remove] = layoutUiFlex(selection.actions!, [
          { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
          { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
        ], { direction: 'row', gap: 4, align: 'stretch' });
        canvasAction(parts, 'selection-edit-anchor-label', `Edit ${inspection.entity!.name} label`,
          edit!, () => {
            beginAnchorLabelEdit(state, inspection.entity!.id, inspection.entity!.name);
            context.invalidate();
          }, { symbol: 'penTool' });
        canvasAction(parts, 'selection-delete-anchor', 'Delete selected annotation anchor',
          remove!, () => {
            state.interaction.deleteSelected(); context.invalidate();
          }, { buttonGlyph: 'cross', tone: 'danger' });
      }
    } else if (runtimeObjectSelection && selection.actions !== undefined) {
      const mapId = studioMapId(context.route.path);
      const availability = currentRuntimeObjectAvailability(state, context, mapId, runtimeMarker);
      const actions = layoutUiFlex(selection.actions, Array.from({ length: 3 }, () => ({
        minSize: { width: 40, height: 40 }, grow: 1,
      })), { direction: 'row', gap: 4, align: 'stretch' });
      const disabledReason = availability.allowed ? null : availability.reason;
      canvasAction(parts, 'selection-runtime-move', disabledReason
        ?? `Move ${runtimeMarker.label} through an exact authority preview`, actions[0]!, () => {
          startRuntimeObjectAction(state, context, mapId, 'move_entity');
        }, { symbol: 'pointer', disabled: !availability.allowed });
      canvasAction(parts, 'selection-runtime-repair', disabledReason
        ?? `Repair ${runtimeMarker.label} through an exact authority preview`, actions[1]!, () => {
          startRuntimeObjectAction(state, context, mapId, 'repair_entity');
        }, { symbol: 'replace', disabled: !availability.allowed });
      canvasAction(parts, 'selection-runtime-despawn', disabledReason
        ?? `Safely despawn ${runtimeMarker.label}; contents spill through server authority`, actions[2]!, () => {
          startRuntimeObjectAction(state, context, mapId, 'despawn_entity');
        }, { symbol: 'trash', tone: 'danger', disabled: !availability.allowed });
    } else if (npcLocationSelection && selection.actions !== undefined) {
      const mapId = studioMapId(context.route.path);
      const availability = currentNpcLocationAvailability(state, context, mapId, npcMarker);
      canvasAction(parts, 'selection-npc-location', availability.allowed
        ? `Move ${npcMarker.label} live position and home through an exact authority preview`
        : availability.reason,
      selection.actions, () => startNpcLocationAction(state, context, mapId), {
        symbol: 'pointer', disabled: !availability.allowed,
      });
    } else if (terrainSelection && selection.actions !== undefined) {
      const terrainActions = canvasSlots(selection.actions, [
        { id: 'status', minSize: { width: 1, height: 30 }, main: { mode: 'fixed', size: 30 } },
        { id: 'buttons', minSize: { width: 1, height: 40 }, main: { mode: 'fixed', size: 40 } },
      ], { gap: 4 });
      const snapshot = state.interaction.snapshot();
      const cell = inspection.terrain.cell;
      const defaultFamily = state.model.document().defaultSurfaceFamily ?? 'grass_1';
      canvasLabel(parts, 'selection-terrain-family-status',
        `CELL ${cell.surfaceFamily.toUpperCase()} · DEFAULT ${defaultFamily.toUpperCase()}`,
      terrainActions.status!, { field: true });
      const actions = layoutUiFlex(terrainActions.buttons!, Array.from({ length: 6 }, () => ({
        minSize: { width: 40, height: 40 }, grow: 1,
      })), { direction: 'row', gap: 1, align: 'stretch' });
      const available = state.interaction.terrainAuthoringAvailable();
      const override = state.model.document().cells[mapCellKey(inspection.tileX, inspection.tileY)];
      canvasAction(parts, 'selection-terrain-apply-current', available
        ? `Apply current palette family ${snapshot.selectedSurfaceFamily} to this cell`
        : 'Select the visible editable Terrain layer to apply a surface family', actions[0]!, () => {
          state.interaction.applySelectedSurfaceFamilyToCell(); context.invalidate();
        }, { symbol: 'landPlot', disabled: !available });
      canvasAction(parts, 'selection-terrain-use-default',
        `Use document default family ${defaultFamily} as the current palette family`, actions[1]!, () => {
          state.interaction.selectDocumentDefaultSurfaceFamily(); context.invalidate();
        }, { symbol: 'load', disabled: snapshot.selectedSurfaceFamily === defaultFamily
          && snapshot.terrainPaletteMode === 'surface_family' });
      canvasAction(parts, 'selection-terrain-apply-default', available
        ? `Make current palette family ${snapshot.selectedSurfaceFamily} the document default`
        : 'Select the visible editable Terrain layer to change its default surface family', actions[2]!, () => {
          state.interaction.setSelectedSurfaceFamilyAsDefault(); context.invalidate();
        }, { symbol: 'save', disabled: !available || snapshot.selectedSurfaceFamily === defaultFamily });
      canvasAction(parts, 'selection-terrain-inherit', available
        ? 'Clear this cell surface-family override so it inherits the document default'
        : 'Select the visible editable Terrain layer to clear this cell family', actions[3]!, () => {
          state.interaction.clearSelectedSurfaceFamily(); context.invalidate();
        }, { symbol: 'eraser', disabled: !available || override?.surfaceFamily === undefined });
      canvasAction(parts, 'selection-terrain-apply-exact', snapshot.selectedExactTerrainOverrideId === null
        ? 'Choose a topology-compatible exact tile from the Exact palette first'
        : available ? 'Apply the armed topology-compatible exact tile to this cell'
          : 'Select the visible editable Terrain layer to apply the exact tile', actions[4]!, () => {
          state.interaction.applySelectedExactTerrainOverride(); context.invalidate();
        }, { symbol: 'replace', disabled: !available || snapshot.selectedExactTerrainOverrideId === null });
      canvasAction(parts, 'selection-terrain-clear', available
        ? 'Clear this cell exact tile override'
        : 'Select the visible editable Terrain layer to clear the exact tile', actions[5]!, () => {
          state.interaction.clearSelectedExactTerrainOverride(); context.invalidate();
        }, { symbol: 'trash', tone: 'danger', disabled: !available || override?.terrainOverride === undefined });
    }
    if (inspection.suppression.supported && selection.suppression !== undefined) {
      const suppressed = inspection.suppression.suppressed;
      canvasAction(parts, 'selection-suppression', suppressed
        ? `Restore generated map object ${inspection.suppression.id ?? ''}`
        : `Suppress generated map object ${inspection.suppression.id ?? ''}`,
      selection.suppression, () => {
        if (inspection.suppression.id === null) return;
        state.model.suppressGenerated(inspection.suppression.id, !suppressed);
        context.invalidate();
      }, { buttonGlyph: 'power', active: suppressed, tone: suppressed ? 'success' : 'danger' });
    }
  } else {
    state.selectionBounds = { x: 0, y: 0, width: 0, height: 0 };
    state.selectionRowCount = 0;
  }

  const layers = canvasSlots(regions.layers!, [
    { id: 'ribbon', minSize: { width: 1, height: 30 }, main: { mode: 'fixed', size: 30 } },
    { id: 'rows', minSize: { width: 1, height: 80 }, main: { mode: 'grow', min: 80 } },
    { id: 'toolbar', minSize: { width: 1, height: 40 }, main: { mode: 'fixed', size: 40 } },
  ], { gap: 5 });
  // Photoshop-style stacks read topmost-first even though the document keeps
  // ascending painter order for rendering and canonical serialization.
  const documentLayers = [...state.model.document().layers].sort((left, right) => right.order - left.order);
  const orderedLayerIds = documentLayers.map(({ id }) => id);
  const activeLayerId = state.interaction.snapshot().activeLayer;
  state.layerSelection = reconcileMapLayerSelection(
    orderedLayerIds,
    state.layerSelection,
    activeLayerId,
  );
  const selectedLayerIds = new Set(state.layerSelection.selected);
  const selectionCount = selectedLayerIds.size;
  state.layerBounds = layers.rows!;
  const rows = canvasRows(layers.rows!, documentLayers.length, 40, 2);
  const maximumLayerOffset = Math.max(0, documentLayers.length - rows.length);
  state.layerOffset = Math.max(0, Math.min(maximumLayerOffset, state.layerOffset));
  const activeLayerIndex = documentLayers.findIndex(({ id }) => id === activeLayerId);
  if (state.layerActiveId !== activeLayerId
    || state.layerVisibleCount !== rows.length) {
    if (activeLayerIndex >= 0 && activeLayerIndex < state.layerOffset) state.layerOffset = activeLayerIndex;
    else if (activeLayerIndex >= state.layerOffset + rows.length) {
      state.layerOffset = Math.min(maximumLayerOffset, activeLayerIndex - rows.length + 1);
    }
    state.layerActiveId = activeLayerId;
    state.layerVisibleCount = rows.length;
  }
  const visibleLayerStart = documentLayers.length === 0 ? 0 : state.layerOffset + 1;
  const visibleLayerEnd = Math.min(documentLayers.length, state.layerOffset + rows.length);
  const layerRange = rows.length < documentLayers.length
    ? ` ${visibleLayerStart}-${visibleLayerEnd}/${documentLayers.length}`
    : '';
  const selectionLabel = selectionCount > 1 ? ` · ${selectionCount} SELECTED` : '';
  parts.nodes.push({ id: 'layers-ribbon', kind: 'ribbon', bounds: layers.ribbon!,
    label: `LAYERS${selectionLabel}${layerRange}` });
  documentLayers.slice(state.layerOffset, state.layerOffset + rows.length).forEach((layer, index) => {
    const [visibility, select, lock, solo] = layoutUiFlex(rows[index]!, [
      { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
      { minSize: { width: 80, height: 40 }, grow: 1 },
      { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
      { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
    ], { direction: 'row', gap: 2, align: 'stretch' });
    const visible = state.model.isLayerEyeVisible(layer.id);
    const selected = selectedLayerIds.has(layer.id);
    const primary = state.layerSelection?.active === layer.id;
    const lockable = state.model.canToggleLayerLock(layer.id);
    const locked = state.model.isLayerLocked(layer.id);
    const soloed = state.model.soloLayer() === layer.id;
    canvasAction(parts, `layer-visible-${layer.id}`, `${visible ? 'Hide' : 'Show'} ${layer.label}`,
      visibility!, () => { state.interaction.toggleLayerVisibility(layer.id); context.invalidate(); },
      { symbol: visible ? 'visibility' : 'eyeOff', active: visible });
    // The painted row and its accessible action deliberately share an id.
    // Otherwise the shell synthesizes a second fallback button bearing the
    // action label (`Work on ...`) over the Photoshop-style thumbnail/name.
    parts.nodes.push({
      id: `layer-select-${layer.id}`, kind: 'button', bounds: select!,
      state: selected ? 'active' : 'idle',
    });
    parts.actions.push({
      id: `layer-select-${layer.id}`,
      label: `${primary ? 'Primary target' : selected ? 'Selected layer' : 'Work on'} ${layer.label} `
        + `(${locked ? lockable ? 'session locked' : 'system locked' : 'editable'}). `
        + 'Shift selects a range; Ctrl or Command toggles this row',
      role: 'option',
      bounds: select!,
      disabled: false,
      activate: (input) => {
        cancelLayerRename(state);
        const next = applyMapLayerSelectionGesture(
          orderedLayerIds,
          state.layerSelection!,
          layer.id,
          {
            range: input?.shiftKey === true,
            additive: input?.ctrlKey === true || input?.metaKey === true,
          },
        );
        state.layerSelection = next;
        state.model.selectWorkspace(workspaceForLayer(next.active));
        state.interaction.selectLayer(next.active);
        state.paletteOffset = 0;
        context.invalidate();
      },
    });
    const thumbnailSize = Math.min(32, select!.height - 6);
    parts.nodes.push({
      id: `layer-thumbnail-${layer.id}`,
      kind: 'slot',
      bounds: {
        x: select!.x + 4,
        y: select!.y + Math.round((select!.height - thumbnailSize) / 2),
        width: thumbnailSize,
        height: thumbnailSize,
      },
      symbol: LAYER_TYPE_SYMBOLS[layer.id],
      state: primary ? 'active' : locked ? 'disabled' : 'idle',
    });
    parts.nodes.push({
      id: `layer-name-${layer.id}`,
      kind: 'label',
      bounds: {
        x: select!.x + thumbnailSize + 9,
        y: select!.y,
        width: Math.max(1, select!.width - thumbnailSize - 13),
        height: select!.height,
      },
      label: selectionCount > 1
        ? `${primary ? '>' : selected ? '+' : ' '} ${layer.label.toUpperCase()}`
        : layer.label.toUpperCase(),
      state: selected ? 'active' : locked ? 'disabled' : 'idle',
    });
    canvasAction(parts, `layer-lock-${layer.id}`, lockable
      ? `${locked ? 'Unlock' : 'Lock'} ${layer.label} for this editor session`
      : `${layer.label} is an immutable system layer`, lock!, () => {
      state.interaction.toggleLayerLock(layer.id); context.invalidate();
    }, { symbol: locked ? 'lock' : 'unlock', active: locked, disabled: !lockable });
    canvasAction(parts, `layer-solo-${layer.id}`, lockable
      ? `${soloed ? 'Show all layers instead of soloing' : 'Solo'} ${layer.label}`
      : `${layer.label} cannot be soloed because it is a system layer`, solo!, () => {
      state.interaction.toggleLayerSolo(layer.id); context.invalidate();
    }, { symbol: 'layers', active: soloed, disabled: !lockable });
  });

  const activeLayer = state.model.document().layers.find(
    ({ id }) => id === state.layerSelection?.active,
  );
  if (activeLayer === undefined) return;
  if (state.renamingLayerId !== null && state.renamingLayerId !== activeLayer.id) {
    cancelLayerRename(state);
  }
  if (state.renamingLayerId === activeLayer.id) {
    const [field, confirm, cancel] = layoutUiFlex(layers.toolbar!, [
      { minSize: { width: 80, height: 40 }, grow: 1 },
      { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
      { minSize: { width: 40, height: 40 }, main: { mode: 'fixed', size: 40 } },
    ], { direction: 'row', gap: 2, align: 'stretch' });
    const renameSnapshot = state.layerName.snapshot();
    const renameLabel = renameSnapshot.focused
      ? `${renameSnapshot.value.slice(0, renameSnapshot.focus)}|${renameSnapshot.value.slice(renameSnapshot.focus)}`
      : renameSnapshot.value;
    canvasAction(parts, `layer-rename-${activeLayer.id}`, `Edit ${activeLayer.label} layer name`,
      field!, () => commitLayerRename(state, context), { role: 'textbox', glyph: renameLabel });
    parts.textEditors.push({ id: `layer-rename-${activeLayer.id}`, editor: state.layerName });
    canvasAction(parts, `layer-rename-confirm-${activeLayer.id}`, `Confirm ${activeLayer.label} layer name`,
      confirm!, () => { commitLayerRename(state, context); context.invalidate(); },
      { buttonGlyph: 'return', tone: 'success' });
    canvasAction(parts, `layer-rename-cancel-${activeLayer.id}`, `Cancel ${activeLayer.label} layer rename`,
      cancel!, () => { cancelLayerRename(state); context.invalidate(); }, { buttonGlyph: 'cross' });
    return;
  }

  if (state.layerSelection.selected.length > 1) {
    const visibilityPlan = planMapLayerBulkVisibility(
      state.layerSelection.selected,
      (layer) => state.model.isLayerEyeVisible(layer),
    );
    const lockPlan = planMapLayerBulkLock(
      state.layerSelection.selected,
      (layer) => state.model.canToggleLayerLock(layer),
      (layer) => state.model.isLayerUserLocked(layer),
    );
    const [visibility, lock] = layoutUiFlex(layers.toolbar!, Array.from(
      { length: 2 },
      () => ({ minSize: { width: 40, height: 40 }, grow: 1 }),
    ), { direction: 'row', gap: 3, align: 'stretch' });
    canvasAction(parts, 'layers-bulk-visibility', visibilityPlan?.value === true
      ? `Show all ${selectionCount} selected layers`
      : `Hide all ${selectionCount} selected layers`, visibility!, () => {
      if (visibilityPlan === null) return;
      for (const layer of visibilityPlan.layers) {
        if (state.model.isLayerEyeVisible(layer) !== visibilityPlan.value) {
          state.interaction.toggleLayerVisibility(layer);
        }
      }
      context.invalidate();
    }, { symbol: visibilityPlan?.value === true ? 'visibility' : 'eyeOff',
      disabled: visibilityPlan === null });
    const immutableCount = state.layerSelection.selected.length - (lockPlan?.layers.length ?? 0);
    const immutableDetail = immutableCount > 0
      ? `; ${immutableCount} immutable system ${immutableCount === 1 ? 'lock remains' : 'locks remain'}`
      : '';
    canvasAction(parts, 'layers-bulk-lock', lockPlan?.value === false
      ? `Unlock ${lockPlan.layers.length} selected editable layers${immutableDetail}`
      : lockPlan === null
        ? 'Selected layers have immutable system locks'
        : `Lock ${lockPlan.layers.length} selected editable layers${immutableDetail}`,
    lock!, () => {
      if (lockPlan === null) return;
      for (const layer of lockPlan.layers) {
        if (state.model.isLayerUserLocked(layer) !== lockPlan.value) {
          state.interaction.toggleLayerLock(layer);
        }
      }
      context.invalidate();
    }, { symbol: lockPlan?.value === false ? 'unlock' : 'lock', disabled: lockPlan === null });
    return;
  }

  const [rename, towardFront, towardBack] = layoutUiFlex(layers.toolbar!, Array.from(
    { length: 3 },
    () => ({ minSize: { width: 40, height: 40 }, grow: 1 }),
  ), { direction: 'row', gap: 3, align: 'stretch' });
  const editable = state.model.canRenameLayer(activeLayer.id);
  const lockedDetail = state.model.isLayerSystemLocked(activeLayer.id)
    ? `${activeLayer.label} is a required read-only system layer`
    : `${activeLayer.label} is locked for this editor session`;
  const painterReorderDetail = isMapObjectLayer(activeLayer.id)
    ? null : `${activeLayer.label} is not an authored object painter layer`;
  canvasAction(parts, `layer-rename-${activeLayer.id}`,
    editable ? `Rename ${activeLayer.label}` : lockedDetail,
    rename!, () => { beginLayerRename(state, activeLayer.id, activeLayer.label); context.invalidate(); },
    { buttonGlyph: 'key_r', disabled: !editable });
  const canMoveFront = state.model.canReorderLayer(activeLayer.id, 'toward_front');
  canvasAction(parts, `layer-front-${activeLayer.id}`,
    !editable ? lockedDetail : painterReorderDetail
      ?? `Move ${activeLayer.label} toward front at equal elevation and depth`,
    towardFront!, () => { state.interaction.reorderLayer(activeLayer.id, 'toward_front'); context.invalidate(); },
    { buttonGlyph: 'up_2', disabled: !canMoveFront });
  const canMoveBack = state.model.canReorderLayer(activeLayer.id, 'toward_back');
  canvasAction(parts, `layer-back-${activeLayer.id}`,
    !editable ? lockedDetail : painterReorderDetail
      ?? `Move ${activeLayer.label} toward back at equal elevation and depth`,
    towardBack!, () => { state.interaction.reorderLayer(activeLayer.id, 'toward_back'); context.invalidate(); },
    { buttonGlyph: 'down_2', disabled: !canMoveBack });
}

export function buildMapCanvasTool(context: StudioCanvasToolContext): StudioCanvasToolSurface {
  const mapId = studioMapId(context.route.path);
  const stateKey = `map-canvas:${mapId}`;
  const state = context.controller.toolState(stateKey, () => createState(context, mapId));
  syncLiveSpawnModel(state, context);
  beginCatalogLoad(state, context);
  syncContentObjectCatalog(state, context);
  // Terrain Lab and Procedural World are isolated drafts. Feeding production
  // subscription rows into them rebuilt every live entity marker after each
  // unrelated server update and overlaid entities from the wrong document.
  const liveView = mapId === 'live-island' ? context.controller.liveAdapter()?.view() : undefined;
  const liveRows = liveView?.rows ?? null;
  const contentSource = liveView?.contentDefinitions ?? null;
  if (state.schemaLiveRowsSource !== liveRows || state.schemaContentSource !== contentSource) {
    if (state.schemaContentSource !== contentSource) state.liveObjectRegistry = { objects: new Map(
      mapObjectDefinitionsFromContentRows(contentSource ?? undefined).map((definition) => [definition.id, definition]),
    ) };
    state.schemaLiveRowsSource = liveRows;
    state.schemaContentSource = contentSource;
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
  const parts = canvasParts();
  appendLeftDrawer(state, context, parts, mapId);
  appendRightDrawer(state, context, parts);
  appendWorldOverlayControls(state, context, parts);
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

  const surface = finishCanvasTool(context, parts, (drawing, shellArt) => {
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
  }, {
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
  });
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
