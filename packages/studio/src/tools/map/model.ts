import { parseVerifiedStudioMapHead } from './verified-live-map.js';
import { mapEditorJoinedPrefabForEdit, mapEditorObjectPlacementConflict } from './connected-object-footprint.js';
import {
  LIVE_ISLAND_MAP_ID, type MapEntityStateEdit, type ObjectPropertyState,
  isMapObjectLayer,
  applyMapDocumentV3Edit,
  createEmptyMapDocument,
  createTerrainLabDocument,
  generateMapScatter,
  mapDocumentV3Hash,
  migrateMapDocumentV2,
  normalizeMapDocumentV3,
  parseMapDocumentV3,
  createMapDocumentDelta,
  serializeMapDocumentV3ForTransport,
  terrainDocumentForMapV3,
  validateMapDocument,
  type MapBiomeId,
  type AppliedMapDocumentV3Edit,
  type MapCellPatch,
  type MapContentLayerId,
  type MapDocumentV3,
  type MapDocumentV3EditCommand,
  type MapEditCommand,
  type MapGameplayAnchor,
  type MapObjectInstance,
  type MapLandmarkInstance,
  type MapPrefabDocumentV2,
  type MapScatterRequest,
  type TerrainSurfaceFamilyId,
} from '@orchard/sim';
import type {
  StudioInspectorKernel,
  StudioLiveAdapter,
  StudioNotifications,
  StudioSelection,
  StudioSelectionBus,
  StudioValidationPanel,
} from '../../shell/index.js';
import {
  editorMapSemanticHash,
  type EditorLivePublishSnapshot,
  resolveEditorLiveRevision,
} from './live-sync.js';
import {
  createStudioLiveIslandBootstrapDocument,
  isStudioCanonicalLiveIslandTerrain,
} from './editor-live-island-bootstrap.js';
import {
  loadMapEditorValidation,
  MAP_EDITOR_VALIDATION_SUPERSEDED,
  mapEditorValidationWorkerAvailable,
} from './editor-validation-loader.js';
import {
  applyStudioMapResize,
  planStudioMapResize,
  type MapResizeEdge,
  type MapResizeImpact,
} from './resize.js';
import {
  planMapOutlinerMutation,
  type MapOutlinerMutationPlan,
  type MapOutlinerMutationRequest,
} from './outliner-authored-actions.js';
import { mapObjectDefinitionsFromContentRows } from './content-object-catalog.js';
import {
  mapSchemaInspectorObjectStateFields,
  parseMapSchemaInspectorAction,
  type MapSchemaInspectorTarget,
} from './schema-inspector-actions.js';

export const MAP_EDITOR_VALIDATION_DEBOUNCE_MS = 180;

export const MAP_EDITOR_WORKSPACES = ['terrain', 'objects', 'biomes', 'scatter'] as const;
export type MapEditorWorkspace = typeof MAP_EDITOR_WORKSPACES[number];

export type MapLayerReorderDirection = 'toward_front' | 'toward_back';

export interface MapResizeAvailability {
  readonly allowed: boolean;
  readonly reason: string;
}

const MAP_EDITOR_LOCKED_LAYER_IDS: ReadonlySet<MapContentLayerId> = new Set([
  'generated_base',
  'player_owned',
]);

function normalizedLayerLabel(label: string): string | null {
  const normalized = label.trim().replace(/\s+/gu, ' ');
  return normalized.length > 0 && normalized.length <= 48 ? normalized : null;
}

interface DraftEnvelope {
  readonly version: 2;
  readonly baseRevision: number;
  readonly baseSemanticHash: string | null;
  readonly dirty: boolean;
  readonly document: string;
}

interface LegacyDraftEnvelope {
  readonly version: 1;
  readonly baseRevision: number;
  readonly document: string;
}

export interface MapEditorServices {
  readonly selection: StudioSelectionBus;
  readonly inspector: StudioInspectorKernel;
  readonly validation: StudioValidationPanel;
  readonly notifications: StudioNotifications;
  readonly live: () => StudioLiveAdapter | null;
}

export interface MapDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const storageKey = (mapId: string): string => `orchard.studio.map-draft.v1.${mapId}`;

function initialDocument(mapId: string): MapDocumentV3 {
  if (mapId === 'terrain-lab') {
    return migrateMapDocumentV2(createTerrainLabDocument());
  }
  if (mapId === 'procedural-world') {
    return migrateMapDocumentV2(createEmptyMapDocument({
      id: 'procedural-world',
      title: 'Procedural Sanctuary Preview',
      width: 400,
      height: 400,
    }));
  }
  return createStudioLiveIslandBootstrapDocument();
}

export class MapEditorModel {
  #document: MapDocumentV3;
  #publishedEntityStates: readonly MapEntityStateEdit[] = [];
  #past: MapDocumentV3[] = [];
  #future: MapDocumentV3[] = [];
  #workspace: MapEditorWorkspace = 'terrain';
  #hiddenLayers = new Set<MapContentLayerId>();
  #userLockedLayers = new Set<MapContentLayerId>();
  #soloLayer: MapContentLayerId | null = null;
  #baseRevision = 0;
  #baseSemanticHash: string | null = null;
  #dirty = false;
  #conflictRevision: number | null = null;
  #publishing: EditorLivePublishSnapshot | null = null;
  #reconciledLiveHead: object | null = null;
  #terrainIdentity: object = {};
  readonly #terrainIdentities = new WeakMap<MapDocumentV3, object>();
  #terrainValidationIdentity: object = {};
  readonly #terrainValidationIdentities = new WeakMap<MapDocumentV3, object>();
  #validatedTerrainIdentity: object | null = null;
  #validationTimer: ReturnType<typeof setTimeout> | null = null;
  #validationGeneration = 0;
  #validationState: 'ready' | 'pending' | 'invalid' = 'ready';
  #schemaInspectorTarget: MapSchemaInspectorTarget | null = null;
  readonly #unsubscribeSelection: () => void;
  #disposed = false;
  #draftStorageWarningShown = false;
  #draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #flushPendingDraft = (): void => {
    if (this.#draftSaveTimer === null) return;
    clearTimeout(this.#draftSaveTimer);
    this.#draftSaveTimer = null;
    this.updateDirtyState();
    this.save();
  };

  constructor(
    readonly mapId: string,
    private readonly services: MapEditorServices,
    private readonly storage: MapDraftStorage | null = typeof localStorage === 'undefined' ? null : localStorage,
  ) {
    this.#document = initialDocument(mapId);
    this.restore();
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.#flushPendingDraft);
    this.#terrainIdentities.set(this.#document, this.#terrainIdentity);
    this.#terrainValidationIdentities.set(this.#document, this.#terrainValidationIdentity);
    this.#unsubscribeSelection = this.services.selection.subscribe((selection) => this.inspect(selection));
    this.reconcileKernels();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#flushPendingDraft();
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.#flushPendingDraft);
    this.#disposed = true;
    this.#validationGeneration += 1;
    if (this.#validationTimer !== null) {
      clearTimeout(this.#validationTimer);
      this.#validationTimer = null;
    }
    this.#unsubscribeSelection();
  }

  document(): MapDocumentV3 { return this.#document; }
  /** Stable across content-only edits so render caches do not rebuild the
   * 832x832 terrain merely because an object moved. Biome paint invalidates
   * this visual identity without invalidating terrain-structure validation. */
  terrainIdentity(): object { return this.#terrainIdentity; }
  /** Structural terrain identity for elevation-aware picking. Unlike the
   * visual identity, semantic biome paint does not invalidate this cache. */
  terrainGeometryIdentity(): object { return this.#terrainValidationIdentity; }
  workspace(): MapEditorWorkspace { return this.#workspace; }
  baseRevision(): number { return this.#baseRevision; }
  dirty(): boolean { return this.#dirty; }
  conflictRevision(): number | null { return this.#conflictRevision; }
  publishing(): boolean { return this.#publishing !== null; }
  validationState(): 'ready' | 'pending' | 'invalid' { return this.#validationState; }
  selection(): StudioSelection { return this.services.selection.current(); }
  schemaInspectorTarget(): MapSchemaInspectorTarget | null { return this.#schemaInspectorTarget; }
  refreshKernels(): void { this.reconcileKernels(); }
  canUndo(): boolean { return this.#past.length > 0; }
  canRedo(): boolean { return this.#future.length > 0; }
  isLayerEyeVisible(id: MapContentLayerId): boolean { return !this.#hiddenLayers.has(id); }
  isLayerVisible(id: MapContentLayerId): boolean {
    return this.isLayerEyeVisible(id) && (this.#soloLayer === null || this.#soloLayer === id);
  }
  isLayerRendered(id: MapContentLayerId): boolean { return this.isLayerVisible(id); }
  isLayerSystemLocked(id: MapContentLayerId): boolean {
    const layer = this.#document.layers.find((candidate) => candidate.id === id);
    return layer?.editable !== true || MAP_EDITOR_LOCKED_LAYER_IDS.has(id);
  }
  isLayerUserLocked(id: MapContentLayerId): boolean { return this.#userLockedLayers.has(id); }
  isLayerLocked(id: MapContentLayerId): boolean {
    return this.isLayerSystemLocked(id) || this.isLayerUserLocked(id);
  }
  canToggleLayerLock(id: MapContentLayerId): boolean { return !this.isLayerSystemLocked(id); }
  canSoloLayer(id: MapContentLayerId): boolean { return !this.isLayerSystemLocked(id); }
  userLockedLayers(): readonly MapContentLayerId[] { return Object.freeze([...this.#userLockedLayers]); }
  soloLayer(): MapContentLayerId | null { return this.#soloLayer; }
  isLayerInteractionEnabled(id: MapContentLayerId): boolean {
    return this.isLayerVisible(id) && !this.isLayerLocked(id);
  }

  resizeAvailability(): MapResizeAvailability {
    if (this.mapId === 'procedural-world') return {
      allowed: false,
      reason: 'Signed procedural worlds have no finite map edge',
    };
    if (this.mapId !== LIVE_ISLAND_MAP_ID
      && this.#document.provenance.generator !== 'survival-island') return {
      allowed: true,
      reason: 'Resize this finite authored map',
    };
    return {
      allowed: false,
      reason: 'Live island dimensions are fixed by server authority',
    };
  }

  planResize(edge: MapResizeEdge, grow: boolean, step = 1): MapResizeImpact {
    const availability = this.resizeAvailability();
    if (!availability.allowed) throw new Error('map_resize_forbidden');
    return planStudioMapResize(this.#document, edge, grow, step);
  }

  resize(impact: MapResizeImpact): boolean {
    const availability = this.resizeAvailability();
    if (!availability.allowed) throw new Error('map_resize_forbidden');
    if (impact.sourceHash !== mapDocumentV3Hash(this.#document)) throw new Error('map_resize_preview_stale');
    const verified = planStudioMapResize(this.#document, impact.edge, impact.grow, impact.step);
    if (JSON.stringify(verified.command) !== JSON.stringify(impact.command)) {
      throw new Error('map_resize_preview_invalid');
    }
    const previous = this.#document;
    const next = applyStudioMapResize(previous, verified.command);
    this.#past.push(previous);
    this.#terrainIdentity = {};
    this.#terrainValidationIdentity = {};
    this.#terrainIdentities.set(next, this.#terrainIdentity);
    this.#terrainValidationIdentities.set(next, this.#terrainValidationIdentity);
    this.#document = next;
    this.#future = [];
    this.updateDirtyState();
    this.save();
    this.reconcileKernels();
    return true;
  }

  canRenameLayer(id: MapContentLayerId): boolean {
    return this.canToggleLayerLock(id) && !this.isLayerUserLocked(id);
  }

  canReorderLayer(id: MapContentLayerId, direction: MapLayerReorderDirection): boolean {
    if (!this.canRenameLayer(id)) return false;
    const layers = this.#document.layers;
    const index = layers.findIndex((candidate) => candidate.id === id);
    const target = layers[index + (direction === 'toward_front' ? 1 : -1)];
    return target !== undefined
      && isMapObjectLayer(id)
      && isMapObjectLayer(target.id)
      && this.canRenameLayer(target.id)
      && target.order !== layers[index]?.order;
  }

  selectWorkspace(workspace: MapEditorWorkspace): void {
    this.#workspace = workspace;
    this.services.selection.select({ kind: 'none' });
  }

  restoreSession(
    workspace: MapEditorWorkspace,
    hiddenLayers: readonly MapContentLayerId[],
    userLockedLayers: readonly MapContentLayerId[] = [],
    soloLayer: MapContentLayerId | null = null,
  ): boolean {
    if (!MAP_EDITOR_WORKSPACES.includes(workspace)
      || new Set(hiddenLayers).size !== hiddenLayers.length
      || hiddenLayers.some((id) => !this.#document.layers.some((layer) => layer.id === id))
      || new Set(userLockedLayers).size !== userLockedLayers.length
      || userLockedLayers.some((id) => !this.canToggleLayerLock(id))
      || (soloLayer !== null && !this.canSoloLayer(soloLayer))) return false;
    this.#workspace = workspace;
    this.#hiddenLayers = new Set(hiddenLayers);
    this.#userLockedLayers = new Set(userLockedLayers);
    this.#soloLayer = soloLayer;
    this.services.selection.select({ kind: 'none' });
    return true;
  }

  toggleLayer(id: MapContentLayerId): void {
    if (this.#hiddenLayers.has(id)) this.#hiddenLayers.delete(id);
    else this.#hiddenLayers.add(id);
  }

  toggleLayerLock(id: MapContentLayerId): boolean {
    if (!this.canToggleLayerLock(id)) return false;
    if (this.#userLockedLayers.has(id)) this.#userLockedLayers.delete(id);
    else this.#userLockedLayers.add(id);
    return true;
  }

  toggleLayerSolo(id: MapContentLayerId): boolean {
    if (!this.canSoloLayer(id)) return false;
    this.#soloLayer = this.#soloLayer === id ? null : id;
    return true;
  }

  renameLayer(id: MapContentLayerId, label: string): boolean {
    if (!this.canRenameLayer(id)) return false;
    const normalized = normalizedLayerLabel(label);
    if (normalized === null) throw new TypeError('map_layer_label_invalid');
    const current = this.#document.layers.find((layer) => layer.id === id)!;
    if (current.label === normalized) return false;
    this.commitLayerEdit(this.#document.layers.map((layer) => (
      layer.id === id ? { ...layer, label: normalized } : layer
    )));
    return true;
  }

  reorderLayer(id: MapContentLayerId, direction: MapLayerReorderDirection): boolean {
    if (!this.canReorderLayer(id, direction)) return false;
    const layers = this.#document.layers;
    const index = layers.findIndex((candidate) => candidate.id === id);
    const targetIndex = index + (direction === 'toward_front' ? 1 : -1);
    const current = layers[index]!;
    const target = layers[targetIndex]!;
    this.commitLayerEdit(layers.map((layer) => layer.id === current.id
      ? { ...layer, order: target.order }
      : layer.id === target.id ? { ...layer, order: current.order } : layer));
    return true;
  }

  /** Derives every document/session guard inside the model so a Canvas caller
   * cannot bypass a hidden, locked, solo, conflict, or publish boundary. */
  planOutlinerMutation(
    request: MapOutlinerMutationRequest,
    access: 'anonymous' | 'read_only' | 'write',
  ): MapOutlinerMutationPlan {
    return planMapOutlinerMutation(this.#document, request, {
      access,
      conflict: this.#conflictRevision !== null,
      publishing: this.#publishing !== null,
      hiddenLayers: new Set(this.#document.layers
        .filter(({ id }) => !this.isLayerVisible(id)).map(({ id }) => id)),
      lockedLayers: new Set(this.#document.layers
        .filter(({ id }) => this.isLayerLocked(id)).map(({ id }) => id)),
    });
  }

  /** Executes a successful plan through exactly one existing history commit. */
  applyOutlinerMutation(
    request: MapOutlinerMutationRequest,
    access: 'anonymous' | 'read_only' | 'write',
  ): MapOutlinerMutationPlan {
    const plan = this.planOutlinerMutation(request, access);
    if (!plan.ok) return plan;
    const operation = plan.operation;
    if (operation.kind === 'reorder_layer') {
      if (!this.reorderLayer(operation.id, operation.direction)) {
        return Object.freeze({ ok: false, reason: 'no_change' });
      }
      return plan;
    }
    if (operation.kind === 'reparent_object') {
      const object = this.#document.objects.find(({ id }) => id === operation.id);
      if (object === undefined) return Object.freeze({ ok: false, reason: 'node_missing' });
      this.placeObject({ ...object, layer: operation.targetLayer });
      return plan;
    }
    const landmark = this.#document.landmarks.find(({ id }) => id === operation.id);
    if (landmark === undefined) return Object.freeze({ ok: false, reason: 'node_missing' });
    this.placeLandmark({ ...landmark, layer: operation.targetLayer });
    return plan;
  }

  apply(command: MapDocumentV3EditCommand): AppliedMapDocumentV3Edit {
    const result = applyMapDocumentV3Edit(this.#document, command);
    this.acceptDocument(result.document, command.kind === 'terrain' || command.kind === 'paint_biome', command.kind === 'terrain');
    return result;
  }

  private acceptDocument(next: MapDocumentV3, terrainChanged = false, terrainValidationChanged = false): void {
    if (next === this.#document) return;
    this.#past.push(this.#document);
    this.#terrainIdentity = terrainChanged
      ? {}
      : this.#terrainIdentity;
    this.#terrainValidationIdentity = terrainValidationChanged
      ? {}
      : this.#terrainValidationIdentity;
    this.#terrainIdentities.set(next, this.#terrainIdentity);
    this.#terrainValidationIdentities.set(next, this.#terrainValidationIdentity);
    this.#document = next;
    this.#future = [];
    if (typeof requestAnimationFrame === 'undefined') {
      this.updateDirtyState();
      this.save();
    } else {
      // Show the local edit first; coalesce serialization/hash work while a
      // brush is active. Navigation and disposal synchronously flush the draft.
      this.#dirty = true;
      if (this.#draftSaveTimer !== null) clearTimeout(this.#draftSaveTimer);
      this.#draftSaveTimer = setTimeout(this.#flushPendingDraft, 250);
    }
    this.reconcileKernels();
  }

  pendingEntityProperties(entityId:string):ObjectPropertyState|undefined {
    const id=`resource:${entityId}`,draft=this.#document.entityStates?.find(e=>e.id===id),published=this.#publishedEntityStates.find(e=>e.id===id);
    if(JSON.stringify(draft)===JSON.stringify(published))return undefined;
    return draft?.state??published?.baseState;
  }
  editResourceState(entityId:string,current:ObjectPropertyState,patch:ObjectPropertyState):void {
    const id=`resource:${entityId}`,previous=this.#document.entityStates?.find(e=>e.id===id);
    const pending=this.pendingEntityProperties(entityId)!==undefined;
    const state={...(pending?previous?.state:{}),...patch};
    const baseState=Object.fromEntries(Object.keys(state).map(key=>[key,pending&&previous&&Object.hasOwn(previous.baseState,key)?previous.baseState[key]!:current[key]!]));
    this.apply({kind:'edit_entity_state',edit:{id,entityId,entityKind:'resource',baseState,state}});
  }
  moveResource(id:string,sourceTileX:number,sourceTileY:number,tileX:number,tileY:number):void {
    const prior=this.#document.resourcePlacements?.find(value=>value.id===id);
    this.apply({kind:'move_resource',placement:{id,originTileX:prior?.originTileX??sourceTileX,originTileY:prior?.originTileY??sourceTileY,tileX,tileY}});
  }
  embedPrefab(prefab: MapPrefabDocumentV2): void { this.apply({ kind: 'embed_prefab', prefab }); }
  #liveOccupancy: (object:MapObjectInstance)=>boolean = ()=>false;
  setLiveObjectOccupancy(check:(object:MapObjectInstance)=>boolean):void {this.#liveOccupancy=check;}
  placeObject(object: MapObjectInstance): boolean {
    const previous=this.#document.objects.find(value=>value.id===object.id);
    const geometryChanged=!previous||['tileX','tileY','elevation','layer','prefabId','quarterTurns','flipX','scale','enabled'].some(key=>previous[key as keyof MapObjectInstance]!==object[key as keyof MapObjectInstance]);
    if(geometryChanged&&(mapEditorObjectPlacementConflict(this.#document,object)!==null||this.#liveOccupancy(object))){this.services.notifications.push('warning','Space occupied','Choose an empty position on this layer.');return false;}
    const prefab = geometryChanged ? mapEditorJoinedPrefabForEdit(this.#document, object) : null;
    if (prefab) {
      const embedded = applyMapDocumentV3Edit(this.#document, { kind: 'embed_prefab', prefab }).document;
      const placed = applyMapDocumentV3Edit(embedded, { kind: 'place_object', object: {
        ...object, prefabId: prefab.id, prefabRevision: prefab.revision,
      } }).document;
      this.acceptDocument(normalizeMapDocumentV3({ ...placed, revision: this.#document.revision + 1 }));
      return true;
    }
    this.apply({ kind: 'place_object', object });return true;
  }
  placeLandmark(landmark: MapLandmarkInstance): void { this.apply({ kind: 'place_landmark', landmark }); }
  placeAnchor(anchor: MapGameplayAnchor): void { this.apply({ kind: 'place_anchor', anchor }); }
  moveObject(objectId: string, tileX: number, tileY: number, elevation?: number): void {
    const object=this.#document.objects.find(value=>value.id===objectId);
    if(object)this.placeObject({...object,tileX,tileY,...(elevation===undefined?{}:{elevation})});
  }
  moveLandmark(landmarkId: string, tileX: number, tileY: number, elevation?: number): void {
    this.apply({ kind: 'move_landmark', landmarkId, tileX, tileY, ...(elevation === undefined ? {} : { elevation }) });
  }
  moveAnchor(anchorId: string, tileX: number, tileY: number, elevation: number): void {
    this.apply({ kind: 'move_anchor', anchorId, tileX, tileY, elevation });
  }
  updateAnchorLabel(anchorId: string, label: string): void {
    this.apply({ kind: 'update_anchor_label', anchorId, label });
  }
  removeObject(objectId: string): void { this.apply({ kind: 'remove_object', objectId }); }
  removeLandmark(landmarkId: string): void { this.apply({ kind: 'remove_landmark', landmarkId }); }
  removeAnchor(anchorId: string): void { this.apply({ kind: 'remove_anchor', anchorId }); }
  selectTile(tileX: number, tileY: number): void {
    this.services.selection.select({ kind: 'tile', spaceId: 0, tileX, tileY });
  }
  selectObject(id: string): void {
    this.services.selection.select({ kind: 'entity', entityKind: 'map-object', id, spaceId: 0 });
  }
  selectAnchor(id: string): void {
    this.services.selection.select({ kind: 'entity', entityKind: 'map-anchor', id, spaceId: 0 });
  }
  selectEntity(entityKind: string, id: string, spaceId: number): void {
    this.services.selection.select({ kind: 'entity', entityKind, id, spaceId });
  }
  selectPlayer(identity: string, spaceId: number): void {
    this.services.selection.select({ kind: 'player', identity, spaceId });
  }
  clearSelection(): void { this.services.selection.select({ kind: 'none' }); }
  paintBiome(points: readonly { readonly tileX: number; readonly tileY: number }[], biome: MapBiomeId): void {
    this.apply({ kind: 'paint_biome', points, biome });
  }
  paintTerrainPatch(
    points: readonly { readonly tileX: number; readonly tileY: number }[],
    patch: MapCellPatch,
  ): void {
    this.editTerrain({ kind: 'paint', points, patch });
  }
  setDefaultSurfaceFamily(family: TerrainSurfaceFamilyId): void {
    this.editTerrain({ kind: 'set_default_surface_family', family });
  }
  editTerrain(command: MapEditCommand, biome?: MapBiomeId, automaticSurround = false): AppliedMapDocumentV3Edit { return this.apply({ kind: 'terrain', command, automaticSurround, ...(biome === undefined ? {} : {biome}) }); }
  suppressGenerated(generatedId: string, suppressed = true): void {
    this.apply({ kind: 'suppress_generated_object', generatedId, suppressed });
  }
  scatter(request: MapScatterRequest, catalogPrefabs: readonly MapPrefabDocumentV2[] = []): void {
    const before = this.#document;
    let staged = before;
    for (const paletteEntry of request.palette) {
      if (staged.prefabs.some(({ id }) => id === paletteEntry.prefabId)) continue;
      const prefab = catalogPrefabs.find(({ id }) => id === paletteEntry.prefabId);
      if (prefab === undefined) throw new TypeError(`Map scatter prefab is unavailable: ${paletteEntry.prefabId}`);
      staged = applyMapDocumentV3Edit(staged, { kind: 'embed_prefab', prefab }).document;
    }
    const objects = generateMapScatter(staged, request);
    if (objects.length === 0) return;
    const placed = applyMapDocumentV3Edit(staged, { kind: 'place_objects', objects }).document;
    const next = normalizeMapDocumentV3({ ...placed, revision: before.revision + 1 });
    // Embedding a catalog prefab and accepting its generated placements is one
    // authoring gesture, so it intentionally owns a single history entry.
    this.#past.push(before);
    this.#terrainIdentities.set(next, this.#terrainIdentity);
    this.#terrainValidationIdentities.set(next, this.#terrainValidationIdentity);
    this.#document = next;
    this.#future = [];
    this.updateDirtyState();
    this.save();
    this.reconcileKernels();
  }

  undo(): void {
    const previous = this.#past.pop();
    if (previous === undefined) return;
    this.#future.push(this.#document);
    this.#document = previous;
    this.#terrainIdentity = this.#terrainIdentities.get(previous) ?? {};
    this.#terrainValidationIdentity = this.#terrainValidationIdentities.get(previous) ?? {};
    this.#terrainIdentities.set(previous, this.#terrainIdentity);
    this.#terrainValidationIdentities.set(previous, this.#terrainValidationIdentity);
    this.updateDirtyState();
    this.save();
    this.reconcileKernels();
  }

  redo(): void {
    const next = this.#future.pop();
    if (next === undefined) return;
    this.#past.push(this.#document);
    this.#document = next;
    this.#terrainIdentity = this.#terrainIdentities.get(next) ?? {};
    this.#terrainValidationIdentity = this.#terrainValidationIdentities.get(next) ?? {};
    this.#terrainIdentities.set(next, this.#terrainIdentity);
    this.#terrainValidationIdentities.set(next, this.#terrainValidationIdentity);
    this.updateDirtyState();
    this.save();
    this.reconcileKernels();
  }

  /** Layer metadata participates in the canonical document/hash and history,
   * while retaining the exact terrain identities because no terrain arrays
   * changed. Required layer ids and locked live/generated rows are never
   * replaced by this path. */
  private commitLayerEdit(layers: MapDocumentV3['layers']): void {
    const previous = this.#document;
    const next = normalizeMapDocumentV3({
      ...previous,
      revision: previous.revision + 1,
      layers,
    });
    this.#past.push(previous);
    this.#terrainIdentities.set(next, this.#terrainIdentity);
    this.#terrainValidationIdentities.set(next, this.#terrainValidationIdentity);
    this.#document = next;
    this.#future = [];
    this.updateDirtyState();
    this.save();
    this.reconcileKernels();
  }

  reconcileLiveHead(): void {
    const head = this.services.live()?.view().mapDocument;
    if (head === null || head === undefined) {
      this.#reconciledLiveHead = null;
      return;
    }
    // StudioConnection preserves this projection identity until the authority
    // row actually changes. Dynamic world redraws must not repeatedly parse and
    // hash the same potentially large document.
    if (head === this.#reconciledLiveHead) return;
    this.#reconciledLiveHead = head;
    // The shell exposes only the production live-island head. Laboratory and
    // procedural drafts must remain isolated from that authority resource.
    if (head.mapId !== this.mapId) return;
    let remoteDocument: MapDocumentV3;
    try {
      remoteDocument = parseVerifiedStudioMapHead(head, this.mapId);
    } catch {
      this.markConflict(head.revision, `Live map revision ${head.revision} could not be verified; local edits were preserved.`);
      return;
    }
    this.#publishedEntityStates=remoteDocument.entityStates??[];
    const remoteSemanticHash = editorMapSemanticHash(remoteDocument);
    const localSemanticHash = editorMapSemanticHash(this.#document);

    if (this.#publishing !== null && head.revision > this.#baseRevision) {
      const resolution = resolveEditorLiveRevision(
        this.#publishing,
        head.revision,
        remoteSemanticHash,
        localSemanticHash,
      );
      this.#publishing = null;
      if (resolution.kind === 'conflict') {
        this.markConflict(head.revision);
        return;
      }
      this.#baseRevision = head.revision;
      this.#baseSemanticHash = remoteSemanticHash;
      this.#conflictRevision = null;
      if (resolution.kind === 'published_current') this.acceptLiveDocument(remoteDocument, false);
      else {
        this.#dirty = true;
        this.save();
      }
      return;
    }

    // An older subscription snapshot can arrive after a newer one. It cannot
    // change the checked-out base or prove anything about the local draft.
    if (head.revision < this.#baseRevision) return;

    if (head.revision === this.#baseRevision) {
      if (this.#baseSemanticHash !== null && remoteSemanticHash !== this.#baseSemanticHash) {
        this.markConflict(head.revision);
        return;
      }
      const stateChanged = this.#baseSemanticHash === null || this.#conflictRevision !== null;
      const wasDirty = this.#dirty;
      this.#baseSemanticHash = remoteSemanticHash;
      this.#conflictRevision = null;
      if (localSemanticHash === remoteSemanticHash) {
        this.#dirty = false;
        // Replace only when authority assigned a different canonical revision.
        // Re-parsing and accepting the same head on every canvas draw would
        // continuously invalidate the complete terrain cache.
        if (mapDocumentV3Hash(this.#document) !== head.contentHash) {
          this.acceptLiveDocument(remoteDocument, false);
        } else if (stateChanged || wasDirty) {
          this.save();
        }
      }
      else {
        this.#dirty = true;
        if (stateChanged || !wasDirty) this.save();
      }
      return;
    }

    // A clean checkout follows the live head. A divergent draft never does:
    // the author must explicitly resolve that conflict rather than losing work.
    if (!this.#dirty || localSemanticHash === remoteSemanticHash) {
      this.acceptLiveDocument(remoteDocument, true);
      return;
    }
    this.markConflict(head.revision);
  }

  /** Explicit destructive conflict resolution. The current local draft is
   * replaced only after the user activates Reload latest and the subscribed
   * authority head passes the same id/revision/hash verification as reconcile. */
  reloadLatest(): boolean {
    if (this.#publishing !== null) throw new Error('map_publish_in_progress');
    const head = this.services.live()?.view().mapDocument;
    if (head === null || head === undefined || head.mapId !== this.mapId) {
      throw new Error('live_map_head_unavailable');
    }
    let document: MapDocumentV3;
    try {
      document = parseVerifiedStudioMapHead(head, this.mapId);
    } catch {
      throw new Error('live_map_head_unverified');
    }
    this.#reconciledLiveHead = head;
    this.acceptLiveDocument(document, true);
    return true;
  }

  async publish(): Promise<void> {
    this.reconcileLiveHead();
    if (this.#conflictRevision !== null) throw new Error('live_map_conflict');
    if (this.#publishing !== null) throw new Error('map_publish_in_progress');
    const adapter = this.services.live();
    if (adapter?.publishMap === undefined) throw new Error('live_map_adapter_unavailable');
    const head = adapter.view().mapDocument;
    if (head === null || head === undefined || head.revision !== this.#baseRevision) {
      throw new Error('live_map_head_unavailable');
    }
    const base = parseVerifiedStudioMapHead(head, this.mapId);
    const document = this.#document;
    const deltaJson = JSON.stringify(createMapDocumentDelta(base, document));
    const publishing = Object.freeze({
      baseRevision: this.#baseRevision,
      semanticHash: editorMapSemanticHash(document),
    });
    this.#publishing = publishing;
    try {
      await adapter.publishMap(document, deltaJson, publishing.baseRevision);
    } catch (error: unknown) {
      if (this.#publishing === publishing) this.#publishing = null;
      this.reconcileLiveHead();
      throw error;
    }
  }

  worldOutliner(): { readonly spaces: readonly { readonly id: number; readonly label: string; readonly layers: readonly { readonly id: string; readonly label: string; readonly objectIds: readonly string[]; readonly entities?: readonly { readonly id: string; readonly label: string; readonly entityKind: string }[] }[] }[] } {
    return {
      spaces: [{
        id: 0,
        label: this.#document.title,
        layers: this.#document.layers.map((layer) => ({
          id: layer.id,
          label: layer.label,
          objectIds: [
            ...this.#document.objects.filter((object) => object.layer === layer.id).map(({ id }) => id),
            ...this.#document.landmarks.filter((object) => object.layer === layer.id).map(({ id }) => id),
            ...(layer.id === 'anchors' ? this.#document.anchors.map(({ id }) => id) : []),
          ],
          entities: [
            ...this.#document.objects.filter((object) => object.layer === layer.id).map((object) => ({
              id: object.id,
              label: object.id,
              entityKind: 'map-object',
            })),
            ...this.#document.landmarks.filter((object) => object.layer === layer.id).map((object) => ({
              id: object.id,
              label: object.id,
              entityKind: 'map-object',
            })),
            ...(layer.id === 'anchors' ? this.#document.anchors.map((anchor) => ({
              id: anchor.id,
              label: anchor.label ?? anchor.id,
              entityKind: 'map-anchor',
            })) : []),
          ],
        })),
      }],
    };
  }

  private save(): void {
    if (this.#draftSaveTimer !== null) clearTimeout(this.#draftSaveTimer);
    this.#draftSaveTimer = null;
    const envelope: DraftEnvelope = {
      version: 2,
      baseRevision: this.#baseRevision,
      baseSemanticHash: this.#baseSemanticHash,
      dirty: this.#dirty,
      // Pretty exports can exceed localStorage's quota on the live town map.
      // Drafts use the same lossless compact representation as publication.
      document: serializeMapDocumentV3ForTransport(this.#document),
    };
    try {
      this.storage?.setItem(storageKey(this.mapId), JSON.stringify(envelope));
      this.#draftStorageWarningShown = false;
    } catch {
      // Storage failure must not abort checkout, validation or the render loop.
      // Preserve both the in-memory draft and any previously stored draft.
      if (!this.#draftStorageWarningShown) {
        this.#draftStorageWarningShown = true;
        this.services.notifications.push('warning', 'Map draft could not be saved',
          'Your map remains open. Browser storage is unavailable or full; export your draft before closing or reloading.');
      }
    }
  }

  private restore(): void {
    try {
      const source = this.storage?.getItem(storageKey(this.mapId));
      if (source === null || source === undefined) return;
      const envelope = JSON.parse(source) as Partial<DraftEnvelope | LegacyDraftEnvelope>;
      if ((envelope.version !== 1 && envelope.version !== 2)
        || typeof envelope.baseRevision !== 'number' || typeof envelope.document !== 'string') return;
      const document = parseMapDocumentV3(envelope.document);
      if (document.id !== this.mapId) return;
      if (envelope.version === 2) {
        const current = envelope as Partial<DraftEnvelope>;
        if (!(current.baseSemanticHash === null || typeof current.baseSemanticHash === 'string')
          || typeof current.dirty !== 'boolean') return;
        this.#document = document;
        this.#baseRevision = envelope.baseRevision;
        this.#baseSemanticHash = current.baseSemanticHash;
        this.#dirty = this.#baseSemanticHash === null
          ? current.dirty
          : editorMapSemanticHash(document) !== this.#baseSemanticHash;
      } else {
        // Version-one drafts did not retain enough information to prove they
        // were clean. Treat them as dirty until a matching head proves otherwise.
        this.#document = document;
        this.#baseRevision = envelope.baseRevision;
        this.#dirty = true;
      }
    } catch {
      // A corrupt local draft must never prevent opening the canonical seed.
    }
  }

  private updateDirtyState(): void {
    this.#dirty = this.#baseSemanticHash === null
      ? true
      : editorMapSemanticHash(this.#document) !== this.#baseSemanticHash;
  }

  private acceptLiveDocument(document: MapDocumentV3, clearHistory: boolean): void {
    if (clearHistory) {
      this.#past = [];
      this.#future = [];
    }
    this.#document = document;
    this.#baseRevision = document.revision;
    this.#baseSemanticHash = editorMapSemanticHash(document);
    this.#dirty = false;
    this.#conflictRevision = null;
    this.#terrainIdentity = {};
    this.#terrainValidationIdentity = {};
    this.#terrainIdentities.set(document, this.#terrainIdentity);
    this.#terrainValidationIdentities.set(document, this.#terrainValidationIdentity);
    this.save();
    this.reconcileKernels();
  }

  private markConflict(revision: number, detail?: string): void {
    if (this.#conflictRevision === revision) return;
    this.#conflictRevision = revision;
    this.services.notifications.push(
      'conflict',
      'Map head conflict',
      detail ?? `Live map advanced to revision ${revision}; reload or merge before publishing.`,
    );
  }

  private reconcileKernels(): void {
    // Design review is opt-in. An ordinary edit neither scans nor repairs the map.
    this.inspect(this.services.selection.current());
  }

  validateDesign(): void {
    if (this.#validatedTerrainIdentity === this.#terrainValidationIdentity) {
      this.inspect(this.services.selection.current());
      return;
    }
    // The normalized, untouched production island is exactly the trusted
    // generator output. Compiling 692,224 cells merely to rediscover that it
    // has no authored terrain errors blocked the browser for nearly a second.
    const identity = this.#terrainValidationIdentity;
    this.#validatedTerrainIdentity = identity;
    this.#validationGeneration += 1;
    const generation = this.#validationGeneration;
    if (this.#validationTimer !== null) {
      clearTimeout(this.#validationTimer);
      this.#validationTimer = null;
    }
    if (isStudioCanonicalLiveIslandTerrain(this.#document)) {
      this.setValidationIssues([]);
    } else if (!mapEditorValidationWorkerAvailable()) {
      // Exact compatibility path for tests and hosts without module workers.
      this.setValidationIssues(validateMapDocument(terrainDocumentForMapV3(this.#document)));
    } else {
      const document = this.#document;
      this.#validationState = 'pending';
      this.services.validation.setIssues([{
        id: 'map_validation_pending',
        severity: 'info',
        message: 'Map validation is updating…',
      }]);
      // Terrain brushes can emit many immutable documents per gesture. Only
      // validate after a short quiet period; the worker queue independently
      // caps in-flight work at the active request plus the latest replacement.
      this.#validationTimer = setTimeout(() => {
        this.#validationTimer = null;
        const pending = loadMapEditorValidation(document);
        if (pending === null) {
          if (generation === this.#validationGeneration
            && identity === this.#terrainValidationIdentity) {
            this.setValidationIssues(validateMapDocument(terrainDocumentForMapV3(document)));
          }
          return;
        }
        void pending.then((issues) => {
          if (generation !== this.#validationGeneration
            || identity !== this.#terrainValidationIdentity) return;
          this.setValidationIssues(issues);
        }).catch((error: unknown) => {
          if (generation !== this.#validationGeneration
            || identity !== this.#terrainValidationIdentity) return;
          if (error instanceof Error && error.message === MAP_EDITOR_VALIDATION_SUPERSEDED) {
            // Another retained map workspace may have supplied the newer
            // queued request. Retry this still-current identity through the
            // bounded worker queue instead of validating 832x832 cells here.
            this.#validatedTerrainIdentity = null;
            this.reconcileKernels();
            return;
          }
          // Worker construction/runtime failure must not weaken validation.
          this.setValidationIssues(validateMapDocument(terrainDocumentForMapV3(document)));
        });
      }, MAP_EDITOR_VALIDATION_DEBOUNCE_MS);
    }
    this.inspect(this.services.selection.current());
  }

  private setValidationIssues(issues: ReturnType<typeof validateMapDocument>): void {
    this.#validationState = issues.some(({ severity }) => severity === 'error') ? 'invalid' : 'ready';
    this.services.validation.setIssues(issues.map((issue) => ({
      id: `${issue.code}:${issue.tileX ?? ''}:${issue.tileY ?? ''}`,
      severity: issue.severity,
      message: issue.message,
    })));
  }

  private inspect(selection: StudioSelection): void {
    this.#schemaInspectorTarget = null;
    const base = [
      { id: 'map', label: 'Map', component: 'document', kind: 'readonly' as const, value: this.#document.title, why: 'Current local MapDocumentV3 draft.', readOnly: true },
      { id: 'revision', label: 'Revision', component: 'document', kind: 'readonly' as const, value: this.#document.revision, why: 'Local document revision.', readOnly: true },
      { id: 'workspace', label: 'Workspace', component: 'document', kind: 'readonly' as const, value: this.#workspace, why: 'Active Map Editor workspace.', readOnly: true },
    ];
    if (selection.kind === 'tile') {
      this.services.inspector.inspect([...base,
        { id: 'tile_x', label: 'Tile X', component: 'selection', kind: 'number', value: selection.tileX, why: 'Logical tile coordinate; move the selection with the spatial map tools.', readOnly: true },
        { id: 'tile_y', label: 'Tile Y', component: 'selection', kind: 'number', value: selection.tileY, why: 'Logical tile coordinate; move the selection with the spatial map tools.', readOnly: true },
      ]);
      return;
    }
    const selectedId = selection.kind === 'entity' ? selection.id : null;
    const anchor = selection.kind === 'entity' && selection.entityKind === 'map-anchor'
      ? this.#document.anchors.find(({ id }) => id === selectedId) : undefined;
    if (anchor !== undefined) {
      this.inspectAnchor(base, anchor);
      return;
    }
    const object = selection.kind === 'entity' && selection.entityKind === 'map-object'
      ? this.#document.objects.find(({ id }) => id === selectedId)
        ?? this.#document.landmarks.find(({ id }) => id === selectedId)
      : undefined;
    if (object !== undefined) {
      this.services.inspector.inspect([...base,
      { id: 'object_id', label: 'Object', component: 'selection', kind: 'readonly', value: object.id, why: 'Stable authored instance id.', readOnly: true },
      { id: 'layer', label: 'Layer', component: 'selection', kind: 'readonly', value: object.layer, why: 'Photoshop-style content layer.', readOnly: true },
      { id: 'elevation', label: 'Elevation', component: 'selection', kind: 'number', value: object.elevation, why: 'Signed terrain plane; the Inspector has no safe elevation action.', readOnly: true },
      ]);
      return;
    }
    if (selection.kind === 'entity') {
      const liveView = this.services.live()?.view();
      const liveRow = selection.entityKind === 'placeable'
        ? liveView?.rows.placeables.find(({ id }) => id.toString() === selection.id)
        : selection.entityKind === 'chest'
          ? liveView?.rows.chests?.find(({ id }) => id.toString() === selection.id)
          : undefined;
      const exactTarget = liveRow?.definitionId === undefined || liveRow.state === undefined
        || liveRow.tileX === undefined || liveRow.tileY === undefined ? null : Object.freeze({
          entityId: selection.id,
          entityKind: selection.entityKind as 'placeable' | 'chest',
          definitionId: liveRow.definitionId,
          spaceId: liveRow.spaceId,
          tileX: liveRow.tileX,
          tileY: liveRow.tileY,
          state: liveRow.state,
        });
      const definition = exactTarget === null ? undefined
        : mapObjectDefinitionsFromContentRows(liveView?.contentDefinitions)
          .find(({ id }) => id === exactTarget.definitionId);
      const stateFields = definition === undefined || exactTarget === null ? []
        : mapSchemaInspectorObjectStateFields(definition, exactTarget).map((field) => {
          const action = parseMapSchemaInspectorAction(field.action);
          return {
            ...field,
            component: 'live_state',
            kind: action?.value.type === 'bool' ? 'boolean' as const
              : action?.value.type === 'enum' ? 'select' as const
                : action?.value.type === 'counter' ? 'number' as const : 'readonly' as const,
            ...(action === null ? {} : { defaultValue: action.value.default }),
            ...(action?.value.type === 'enum' ? { options: action.value.values } : {}),
          };
        });
      this.#schemaInspectorTarget = exactTarget;
      this.services.inspector.inspect([...base,
        { id: 'entity_kind', label: 'Kind', component: 'live_selection', kind: 'readonly', value: selection.entityKind, why: 'Subscribed runtime table projection.', readOnly: true },
        { id: 'entity_id', label: 'Entity', component: 'live_selection', kind: 'readonly', value: selection.id, why: 'Durable runtime entity identifier.', readOnly: true },
        { id: 'entity_space', label: 'Space', component: 'live_selection', kind: 'readonly', value: selection.spaceId, why: 'Authoritative runtime space.', readOnly: true },
        ...stateFields,
      ]);
      return;
    }
    if (selection.kind === 'player') {
      this.services.inspector.inspect([...base,
        { id: 'player_identity', label: 'Player', component: 'live_selection', kind: 'readonly', value: selection.identity, why: 'Authenticated runtime identity.', readOnly: true },
        { id: 'player_space', label: 'Space', component: 'live_selection', kind: 'readonly', value: selection.spaceId, why: 'Current authoritative space, or offline when absent.', readOnly: true },
      ]);
      return;
    }
    this.services.inspector.inspect(base);
  }

  private inspectAnchor(
    base: Parameters<StudioInspectorKernel['inspect']>[0],
    anchor: MapGameplayAnchor,
  ): void {
    this.services.inspector.inspect([...base,
      { id: 'anchor_id', label: 'Anchor', component: 'selection', kind: 'readonly', value: anchor.id, why: 'Stable authored gameplay anchor id.', readOnly: true },
      { id: 'anchor_kind', label: 'Kind', component: 'selection', kind: 'readonly', value: anchor.kind, why: 'Semantic anchor kind.', readOnly: true },
      { id: 'anchor_tile', label: 'Tile', component: 'selection', kind: 'readonly', value: `${anchor.tileX}, ${anchor.tileY}`, why: 'Authored tile coordinate.', readOnly: true },
      { id: 'anchor_elevation', label: 'Elevation', component: 'selection', kind: 'readonly', value: anchor.elevation, why: 'Stored terrain plane.', readOnly: true },
      { id: 'anchor_runtime', label: 'Runtime', component: 'selection', kind: 'readonly', value: 'UNBOUND', why: 'Studio anchors are annotations until a runtime system explicitly binds them.', readOnly: true },
    ]);
  }
}
