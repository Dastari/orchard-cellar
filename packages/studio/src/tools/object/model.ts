import {
  createTileObjectWorkspace,
  explodeTileObject,
  groupTileObject,
  moveTileObject,
  parseTileObjectWorkspace,
  serializeTileObjectWorkspace,
  setTileObjectPivot,
  tileObjectToMapPrefab,
  transformTileObject,
  upsertTileObjectCell,
  upsertTileObjectCollection,
  upsertTileObjectPlacement,
  type MapStampPlacement,
  type TileObjectCellMetadata,
  type TileObjectCollectionFrame,
  type TileObjectWorkspaceV1,
} from '@orchard/sim';
import type { StudioInspectorKernel, StudioSelectionBus, StudioValidationPanel } from '../../shell/index.js';

export const OBJECT_STUDIO_LAYERS = ['ground', 'object', 'canopy'] as const;
export type ObjectStudioLayer = typeof OBJECT_STUDIO_LAYERS[number];

export interface ObjectStudioServices {
  readonly selection: StudioSelectionBus;
  readonly inspector: StudioInspectorKernel;
  readonly validation: StudioValidationPanel;
}

export interface ObjectDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const storageKey = (id: string): string => `orchard.studio.object-draft.v1.${id}`;

export class ObjectStudioModel {
  #workspace: TileObjectWorkspaceV1;
  #selected = new Set<string>();
  #visibleLayers = new Set<ObjectStudioLayer>(OBJECT_STUDIO_LAYERS);
  #activeLayer: ObjectStudioLayer = 'object';

  constructor(
    readonly objectId: string,
    private readonly services: ObjectStudioServices,
    private readonly storage: ObjectDraftStorage | null = typeof localStorage === 'undefined' ? null : localStorage,
  ) {
    this.#workspace = createTileObjectWorkspace({ id: objectId, title: objectId === 'untitled-layout' ? 'Untitled Layout' : objectId });
    this.restore();
    this.reconcileKernels();
  }

  workspace(): TileObjectWorkspaceV1 { return this.#workspace; }
  selectedIds(): readonly string[] { return Object.freeze([...this.#selected]); }
  activeLayer(): ObjectStudioLayer { return this.#activeLayer; }
  layerVisible(layer: ObjectStudioLayer): boolean { return this.#visibleLayers.has(layer); }
  refreshKernels(): void { this.reconcileKernels(); }
  worldOutliner(): { readonly spaces: readonly { readonly id: number; readonly label: string; readonly layers: readonly { readonly id: string; readonly label: string; readonly objectIds: readonly string[] }[] }[] } {
    return { spaces: [{ id: 0, label: this.#workspace.title, layers: OBJECT_STUDIO_LAYERS.map((layer) => ({
      id: layer,
      label: layer[0]!.toUpperCase() + layer.slice(1),
      objectIds: [
        ...this.#workspace.placements.filter((placement) => placement.layer === layer).map((placement) => placement.id),
        ...this.#workspace.objects.filter((object) => object.placementIds.some((id) => this.#workspace.placements.find((placement) => placement.id === id)?.layer === layer)).map((object) => object.id),
      ],
    })) }] };
  }

  select(id: string, modifier: 'replace' | 'add' | 'toggle' = 'replace'): void {
    if (modifier === 'replace') this.#selected = new Set([id]);
    else if (modifier === 'add') this.#selected.add(id);
    else if (this.#selected.has(id)) this.#selected.delete(id);
    else this.#selected.add(id);
    this.services.selection.select({ kind: 'entity', entityKind: 'prefab-piece', id, spaceId: 0 });
    this.reconcileKernels();
  }

  marquee(ids: readonly string[], additive = false): void {
    this.#selected = additive ? new Set([...this.#selected, ...ids]) : new Set(ids);
    const first = ids[0];
    this.services.selection.select(first === undefined
      ? { kind: 'none' }
      : { kind: 'entity', entityKind: 'prefab-piece', id: first, spaceId: 0 });
    this.reconcileKernels();
  }

  stamp(placement: MapStampPlacement): void { this.commit(upsertTileObjectPlacement(this.#workspace, placement)); }
  setCollision(cell: TileObjectCellMetadata): void { this.commit(upsertTileObjectCell(this.#workspace, cell)); }
  upsertCollection(frame: TileObjectCollectionFrame): void { this.commit(upsertTileObjectCollection(this.#workspace, frame)); }

  group(id: string, label: string): void {
    this.commit(groupTileObject(this.#workspace, {
      id,
      label,
      placementIds: [...this.#selected],
      cellIds: this.#workspace.cells.filter((cell) => this.#selected.has(cell.id)).map((cell) => cell.id),
      collectionId: null,
    }));
    this.#selected = new Set([id]);
  }

  explode(id: string): void { this.commit(explodeTileObject(this.#workspace, id)); }
  move(id: string, deltaX: number, deltaY: number, collectionId?: string | null): void {
    this.commit(moveTileObject(this.#workspace, id, deltaX, deltaY, collectionId));
  }
  setPivot(id: string, tileX: number, tileY: number): void { this.commit(setTileObjectPivot(this.#workspace, id, tileX, tileY)); }
  transform(id: string, operation: 'rotate_clockwise' | 'rotate_counterclockwise' | 'flip_horizontal'): void {
    this.commit(transformTileObject(this.#workspace, id, operation));
  }
  exportPrefab(id: string) { return tileObjectToMapPrefab(this.#workspace, id); }

  selectLayer(layer: ObjectStudioLayer): void { this.#activeLayer = layer; this.reconcileKernels(); }
  toggleLayer(layer: ObjectStudioLayer): void {
    if (this.#visibleLayers.has(layer)) this.#visibleLayers.delete(layer);
    else this.#visibleLayers.add(layer);
  }

  private commit(workspace: TileObjectWorkspaceV1): void {
    this.#workspace = workspace;
    this.storage?.setItem(storageKey(this.objectId), serializeTileObjectWorkspace(workspace));
    this.reconcileKernels();
  }

  private restore(): void {
    const source = this.storage?.getItem(storageKey(this.objectId));
    if (source === null || source === undefined) return;
    try {
      const restored = parseTileObjectWorkspace(source);
      if (restored.id === this.objectId) this.#workspace = restored;
    } catch {
      // Corrupt drafts fall back to a safe empty workspace.
    }
  }

  private reconcileKernels(): void {
    const dangling = this.#workspace.objects.flatMap((object) => object.placementIds
      .filter((id) => !this.#workspace.placements.some((placement) => placement.id === id))
      .map((id) => ({ id: `dangling:${object.id}:${id}`, severity: 'error' as const, message: `${object.label} references missing placement ${id}.` })));
    this.services.validation.setIssues(dangling);
    const selected = this.#workspace.placements.find(({ id }) => this.#selected.has(id));
    this.services.inspector.inspect([
      { id: 'object', label: 'Workspace', component: 'document', kind: 'readonly', value: this.#workspace.title, why: 'Portable Object Studio workspace.', readOnly: true },
      { id: 'size', label: 'Canvas', component: 'document', kind: 'readonly', value: `${this.#workspace.width}×${this.#workspace.height}`, why: 'General 128×96 tile canvas by default.', readOnly: true },
      { id: 'layer', label: 'Target layer', component: 'selection', kind: 'readonly', value: this.#activeLayer, why: 'New pieces target this layer.', readOnly: true },
      { id: 'selection', label: 'Selected', component: 'selection', kind: 'readonly', value: this.#selected.size, why: 'Shift-add and Ctrl/Cmd-toggle selection.', readOnly: true },
      ...(selected === undefined ? [] : [
        { id: 'tile_x', label: 'Tile X', component: 'selection', kind: 'number' as const, value: selected.tileX, why: 'Selected piece origin.', readOnly: false },
        { id: 'tile_y', label: 'Tile Y', component: 'selection', kind: 'number' as const, value: selected.tileY, why: 'Selected piece origin.', readOnly: false },
        { id: 'elevation', label: 'Elevation', component: 'selection', kind: 'number' as const, value: selected.elevation, why: 'Signed per-piece height.', readOnly: false },
      ]),
    ]);
  }
}
