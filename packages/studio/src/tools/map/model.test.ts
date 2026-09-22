import {
  createEmptyMapDocument,
  createLiveIslandMapDocument,
  createMapPrefabDocument,
  mapDocumentV3Hash,
  migrateMapDocumentV2,
  normalizeMapDocumentV3,
  serializeMapDocumentV3,
  serializeMapDocumentV3ForTransport,
  type MapDocumentV3,
  applyMapDocumentDelta,
  parseMapDocumentDelta,
  parseMapDocumentV3,
} from '@orchard/sim';
import { describe, expect, it, vi } from 'vitest';
import {
  StudioInspectorKernel,
  StudioNotifications,
  StudioSelectionBus,
  StudioValidationPanel,
  buildWorldOutliner,
  type StudioConnectionView,
  type StudioLiveAdapter,
} from '../../shell/index.js';
import { MAP_EDITOR_WORKSPACES, MapEditorModel, type MapDraftStorage } from './model.js';

class MemoryStorage implements MapDraftStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function mapHarness(
  mapId: string,
  live: StudioLiveAdapter | null = null,
  storage: MapDraftStorage = new MemoryStorage(),
) {
  const selection = new StudioSelectionBus();
  const inspector = new StudioInspectorKernel();
  const validation = new StudioValidationPanel();
  const notifications = new StudioNotifications();
  const model = new MapEditorModel(mapId, { selection, inspector, validation, notifications, live: () => live }, storage);
  return { model, selection, inspector, validation, notifications, storage };
}

function harness(live: StudioLiveAdapter | null = null, storage: MapDraftStorage = new MemoryStorage()) {
  return mapHarness('live-island', live, storage);
}

function view(patch: Partial<StudioConnectionView> = {}): StudioConnectionView {
  return {
    connected: true, synchronizing: false, identity: 'author', role: 'admin',
    contentRevision: null, mapRevision: 0, mapDocument: null,
    publishingMap: false, worldMutating: false, error: null,
    rows: { placeables: [], npcs: [], homesteads: [], players: [] },
    ...patch,
  };
}

function remoteDocument(revision: number, title: string): MapDocumentV3 {
  return normalizeMapDocumentV3({ ...createLiveIslandMapDocument(), revision, title });
}

function mapHead(document: MapDocumentV3): NonNullable<StudioConnectionView['mapDocument']> {
  return {
    mapId: document.id,
    revision: document.revision,
    contentHash: mapDocumentV3Hash(document),
    documentJson: serializeMapDocumentV3(document),
  };
}

describe('Studio Map Editor model', () => {
  it('publishes a restored tree deletion as a delta and keeps in-flight edits for the next revision', async () => {
    const tree = { id: 'old-tree-386-373', prefabId: 'old-tree', prefabRevision: 0,
      tileX: 386, tileY: 373, elevation: 0, layer: 'objects' as const, quarterTurns: 0 as const, flipX: false, enabled: true };
    const base = normalizeMapDocumentV3({ ...remoteDocument(6, 'Town'),
      prefabs: [createMapPrefabDocument({ id: 'old-tree', title: 'Old tree' })], objects: [tree],
    });
    let liveView = view({ mapDocument: mapHead(base), mapRevision: 6 });
    const publishMap = vi.fn(async () => undefined);
    const adapter: StudioLiveAdapter = { view: () => liveView, connect: () => undefined, disconnect: () => undefined, publishMap };
    const storage = new MemoryStorage();
    const first = harness(adapter, storage).model;
    first.reconcileLiveHead(); first.removeObject(tree.id);
    first.dispose();
    const { model } = harness(adapter, storage);
    await model.publish();
    const args = publishMap.mock.calls[0] as unknown as [MapDocumentV3, string, number];
    const deletion = parseMapDocumentDelta(JSON.parse(args[1]));
    expect(args[2]).toBe(6);
    expect(args[1].length).toBeLessThan(1_000);
    expect(deletion.collections).toEqual({ objects: { [tree.id]: null } });
    model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    const accepted = normalizeMapDocumentV3({ ...parseMapDocumentV3(applyMapDocumentDelta(base, deletion)), revision: 7 });
    liveView = view({ mapDocument: mapHead(accepted), mapRevision: 7 });
    model.reconcileLiveHead();
    expect(model.baseRevision()).toBe(7);
    expect(model.publishing()).toBe(false);
    expect(model.dirty()).toBe(true);
    await model.publish();
    const nextArgs = publishMap.mock.calls[1] as unknown as [MapDocumentV3, string, number];
    const next = parseMapDocumentDelta(JSON.parse(nextArgs[1]));
    expect(nextArgs[2]).toBe(7);
    expect(next.collections?.objects).toBeUndefined();
    expect(next.collections?.cells?.['400,400']).toEqual({ biome: 'forest' });
    model.dispose();
  });
  it('stores compact drafts that restore the same map and live revision', () => {
    const remote = remoteDocument(6, 'Published town');
    const adapter = { view: () => view({ mapDocument: mapHead(remote) }) } as StudioLiveAdapter;
    const storage = new MemoryStorage();
    const { model } = harness(adapter, storage);
    model.reconcileLiveHead();
    const stored = storage.getItem('orchard.studio.map-draft.v1.live-island')!;
    const envelope = JSON.parse(stored) as { document: string };
    expect(envelope.document).toBe(serializeMapDocumentV3ForTransport(remote));
    expect(stored.length).toBeLessThan(JSON.stringify({ ...JSON.parse(stored), document: serializeMapDocumentV3(remote) }).length);
    const restored = harness(adapter, storage).model;
    expect(mapDocumentV3Hash(restored.document())).toBe(mapDocumentV3Hash(remote));
    expect(restored.baseRevision()).toBe(6);
    expect(restored.dirty()).toBe(false);
    model.dispose(); restored.dispose();
  });

  it('keeps checkout, editing and undo usable when storage fills without overwriting the saved draft', () => {
    const remote = remoteDocument(6, 'Published town');
    const adapter = { view: () => view({ mapDocument: mapHead(remote) }) } as StudioLiveAdapter;
    const storage = new MemoryStorage();
    const { model, notifications } = harness(adapter, storage);
    model.reconcileLiveHead();
    const saved = storage.getItem('orchard.studio.map-draft.v1.live-island');
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(() => model.renameLayer('objects', 'Draft objects')).not.toThrow();
    expect(model.dirty()).toBe(true);
    expect(storage.getItem('orchard.studio.map-draft.v1.live-island')).toBe(saved);
    expect(() => model.undo()).not.toThrow();
    expect(model.dirty()).toBe(false);
    expect(() => model.reloadLatest()).not.toThrow();
    expect(model.validationState()).toBe('ready');
    expect(notifications.items().filter(item => item.title === 'Map draft could not be saved')).toHaveLength(1);
    model.dispose();
  });

  it('opens the editor when browser storage cannot be read', () => {
    const storage: MapDraftStorage = { getItem() { throw new Error('Storage blocked'); }, setItem() {} };
    const { model } = harness(null, storage);
    expect(model.document().id).toBe('live-island');
    model.dispose();
  });

  it('exposes all doc42 workspaces, Photoshop-style layers, selection, and validation kernels', () => {
    const { model, selection, inspector, validation } = harness();
    expect(MAP_EDITOR_WORKSPACES).toEqual(['terrain', 'objects', 'biomes', 'scatter']);
    for (const workspace of MAP_EDITOR_WORKSPACES) { model.selectWorkspace(workspace); expect(model.workspace()).toBe(workspace); }
    expect(model.worldOutliner().spaces[0]?.layers.map(({ id }) => id)).toContain('player_owned');
    model.toggleLayer('generated_base');
    expect(model.isLayerVisible('generated_base')).toBe(false);
    selection.select({ kind: 'tile', spaceId: 0, tileX: 12, tileY: 14 });
    expect(inspector.groups().flatMap(({ rows }) => rows).map(({ id }) => id)).toEqual(expect.arrayContaining(['tile_x', 'tile_y']));
    expect(validation.issues()).toBeInstanceOf(Array);
  });

  it('projects runtime entity and player identity through the schema Inspector kernel', () => {
    const { selection, inspector } = harness();
    selection.select({ kind: 'entity', entityKind: 'placeable', id: '4131', spaceId: 0 });
    expect(inspector.groups().flatMap(({ rows }) => rows).map(({ id, value, readOnly }) => (
      [id, value, readOnly]
    ))).toEqual(expect.arrayContaining([
      ['entity_kind', 'placeable', true], ['entity_id', '4131', true], ['entity_space', 0, true],
    ]));
    selection.select({ kind: 'player', identity: 'player-1', spaceId: 0 });
    expect(inspector.groups().flatMap(({ rows }) => rows).map(({ id, value, readOnly }) => (
      [id, value, readOnly]
    ))).toEqual(expect.arrayContaining([
      ['player_identity', 'player-1', true], ['player_space', 0, true],
    ]));
  });

  it('derives typed live-state actions only from exact subscribed definition and entity state', () => {
    const definition = {
      id: 'object:standing_torch', kind: 'object', schemaVersion: 1, displayName: 'Standing Torch',
      components: { states: {
        lit: { type: 'bool', default: false },
        mode: { type: 'enum', default: 'steady', values: ['steady', 'flicker'] },
      } },
    };
    const liveView = view({
      contentDefinitions: [{ kind: 'object', json: JSON.stringify(definition) }] as never,
      rows: {
        placeables: [{
          id: 41n, spaceId: 0, kind: 'standing_torch', tileX: 12, tileY: 14,
          elevation: 0, facing: 'down', definitionId: 'object:standing_torch',
          state: { lit: true, mode: 'steady' },
        }],
        npcs: [], homesteads: [], players: [],
      },
    });
    const adapter: StudioLiveAdapter = {
      view: () => liveView, connect: () => undefined, disconnect: () => undefined,
    };
    const { model, selection, inspector } = harness(adapter);
    selection.select({ kind: 'entity', entityKind: 'placeable', id: '41', spaceId: 0 });
    const stateRows = inspector.groups().find(({ id }) => id === 'live_state')?.rows ?? [];
    expect(stateRows).toMatchObject([
      { id: 'live-state-lit', kind: 'boolean', value: true,
        action: { command: 'set_entity_state', stateKey: 'lit' } },
      { id: 'live-state-mode', kind: 'select', value: 'steady', options: ['steady', 'flicker'],
        action: { command: 'set_entity_state', stateKey: 'mode' } },
    ]);
    expect(model.schemaInspectorTarget()).toMatchObject({
      entityId: '41', definitionId: 'object:standing_torch', state: { lit: true, mode: 'steady' },
    });
  });

  it('keeps unsupported and inexact Inspector fields honestly read only', () => {
    const { model, selection, inspector } = harness();
    selection.select({ kind: 'tile', spaceId: 0, tileX: 2, tileY: 3 });
    expect(inspector.groups().flatMap(({ rows }) => rows)
      .filter(({ id }) => id === 'tile_x' || id === 'tile_y'))
      .toMatchObject([{ readOnly: true }, { readOnly: true }]);

    selection.select({ kind: 'entity', entityKind: 'placeable', id: '41', spaceId: 0 });
    expect(model.schemaInspectorTarget()).toBeNull();
    expect(inspector.groups().some(({ id }) => id === 'live_state')).toBe(false);
    expect(inspector.groups().flatMap(({ rows }) => rows).every(({ action }) => action === undefined)).toBe(true);
  });

  it('exposes anchor ids through the Anchors outliner with read-only collision-safe selection', () => {
    const base = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'anchor-map', title: 'Anchor Map', width: 8, height: 8,
    }));
    const document = {
      ...base,
      anchors: [{ id: 'spawn-main', kind: 'spawn' as const, tileX: 2, tileY: 3, elevation: 0 }],
    };
    const storage = new MemoryStorage();
    storage.setItem('orchard.studio.map-draft.v1.anchor-map', JSON.stringify({
      version: 2, baseRevision: 0, baseSemanticHash: null, dirty: false,
      document: serializeMapDocumentV3(document),
    }));
    const { model, selection, inspector } = mapHarness('anchor-map', null, storage);
    const before = mapDocumentV3Hash(model.document());
    const anchorLayer = model.worldOutliner().spaces[0]?.layers.find(({ id }) => id === 'anchors');
    expect(anchorLayer).toMatchObject({
      objectIds: ['spawn-main'],
      entities: [{ id: 'spawn-main', label: 'spawn-main', entityKind: 'map-anchor' }],
    });
    const outlinerAnchor = buildWorldOutliner(model.worldOutliner())
      .flatMap(({ children }) => children)
      .find(({ id }) => id.endsWith(':layer:anchors'))?.children[0];
    expect(outlinerAnchor?.selection).toEqual({
      kind: 'entity', entityKind: 'map-anchor', id: 'spawn-main', spaceId: 0,
    });

    model.selectAnchor('spawn-main');
    expect(selection.current()).toEqual({
      kind: 'entity', entityKind: 'map-anchor', id: 'spawn-main', spaceId: 0,
    });
    expect(inspector.groups().flatMap(({ rows }) => rows).map(({ id, value }) => [id, value]))
      .toEqual(expect.arrayContaining([
        ['anchor_id', 'spawn-main'], ['anchor_kind', 'spawn'], ['anchor_runtime', 'UNBOUND'],
      ]));
    expect(model.canUndo()).toBe(false);
    expect(mapDocumentV3Hash(model.document())).toBe(before);
  });

  it('commits each annotation anchor placement, move, and removal as one undoable edit', () => {
    const storage = new MemoryStorage();
    const base = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'anchor-edit', title: 'Anchor Edit', width: 8, height: 8,
    }));
    storage.setItem('orchard.studio.map-draft.v1.anchor-edit', JSON.stringify({
      version: 2, baseRevision: 0, baseSemanticHash: null, dirty: false,
      document: serializeMapDocumentV3(base),
    }));
    const { model } = mapHarness('anchor-edit', null, storage);
    const original = mapDocumentV3Hash(model.document());
    model.placeAnchor({
      id: 'poi-1', kind: 'poi', label: 'Point of Interest 1', tileX: 2, tileY: 2, elevation: 0,
    });
    const placed = mapDocumentV3Hash(model.document());
    expect(model.document()).toMatchObject({ revision: 1, anchors: [{ id: 'poi-1' }] });
    model.undo();
    expect(mapDocumentV3Hash(model.document())).toBe(original);
    model.redo();
    expect(mapDocumentV3Hash(model.document())).toBe(placed);

    model.moveAnchor('poi-1', 3, 2, 0);
    expect(model.document()).toMatchObject({ revision: 2, anchors: [{ tileX: 3, tileY: 2 }] });
    model.undo();
    expect(model.document()).toMatchObject({ revision: 1, anchors: [{ tileX: 2, tileY: 2 }] });
    model.redo();
    expect(model.document()).toMatchObject({ revision: 2, anchors: [{ tileX: 3, tileY: 2 }] });

    model.removeAnchor('poi-1');
    expect(model.document()).toMatchObject({ revision: 3, anchors: [] });
    model.undo();
    expect(model.document()).toMatchObject({ revision: 2, anchors: [{ id: 'poi-1' }] });
  });

  it('commits an annotation label update as exactly one undoable edit', () => {
    const storage = new MemoryStorage();
    const base = {
      ...migrateMapDocumentV2(createEmptyMapDocument({
        id: 'anchor-label-edit', title: 'Anchor Label Edit', width: 8, height: 8,
      })),
      anchors: [{
        id: 'poi-1', kind: 'poi' as const, label: 'Old Label', tileX: 2, tileY: 3, elevation: 0,
      }],
    };
    storage.setItem('orchard.studio.map-draft.v1.anchor-label-edit', JSON.stringify({
      version: 2, baseRevision: 0, baseSemanticHash: null, dirty: false,
      document: serializeMapDocumentV3(base),
    }));
    const { model } = mapHarness('anchor-label-edit', null, storage);
    const original = mapDocumentV3Hash(model.document());

    model.updateAnchorLabel('poi-1', ' Orchard Gate ');
    expect(model.document()).toMatchObject({
      revision: 1,
      anchors: [{
        id: 'poi-1', kind: 'poi', label: 'Orchard Gate', tileX: 2, tileY: 3, elevation: 0,
      }],
    });
    const updated = mapDocumentV3Hash(model.document());
    model.undo();
    expect(mapDocumentV3Hash(model.document())).toBe(original);
    model.redo();
    expect(mapDocumentV3Hash(model.document())).toBe(updated);
  });

  it('opens procedural-world as its own bounded draft instead of aliasing the live island', () => {
    const selection = new StudioSelectionBus();
    const model = new MapEditorModel('procedural-world', {
      selection,
      inspector: new StudioInspectorKernel(),
      validation: new StudioValidationPanel(),
      notifications: new StudioNotifications(),
      live: () => null,
    }, null);
    expect(model.document()).toMatchObject({
      id: 'procedural-world', title: 'Procedural Sanctuary Preview', width: 400, height: 400,
    });
    expect(model.document().id).not.toBe('live-island');
  });

  it('restores validated workspace and layer visibility without creating history', () => {
    const { model } = harness();
    expect(model.restoreSession('scatter', ['terrain', 'canopy'], ['objects'], 'ground')).toBe(true);
    expect(model.workspace()).toBe('scatter');
    expect(model.isLayerVisible('terrain')).toBe(false);
    expect(model.isLayerVisible('canopy')).toBe(false);
    expect(model.isLayerUserLocked('objects')).toBe(true);
    expect(model.soloLayer()).toBe('ground');
    expect(model.isLayerVisible('ground')).toBe(true);
    expect(model.isLayerVisible('gameplay')).toBe(false);
    expect(model.canUndo()).toBe(false);
    expect(model.restoreSession('objects', ['not-a-layer' as never])).toBe(false);
    expect(model.restoreSession('objects', [], ['generated_base'])).toBe(false);
    expect(model.restoreSession('objects', [], [], 'player_owned')).toBe(false);
    expect(model.workspace()).toBe('scatter');
  });

  it('keeps eye visibility separate from session locks and single-layer solo state', () => {
    const { model } = harness();
    expect(model.toggleLayerLock('generated_base')).toBe(false);
    expect(model.isLayerSystemLocked('generated_base')).toBe(true);
    expect(model.toggleLayerLock('objects')).toBe(true);
    expect(model.isLayerUserLocked('objects')).toBe(true);
    expect(model.isLayerInteractionEnabled('objects')).toBe(false);
    expect(model.canRenameLayer('objects')).toBe(false);

    expect(model.toggleLayerSolo('terrain')).toBe(true);
    expect(model.isLayerEyeVisible('objects')).toBe(true);
    expect(model.isLayerVisible('objects')).toBe(false);
    expect(model.isLayerVisible('terrain')).toBe(true);
    model.toggleLayer('terrain');
    expect(model.isLayerEyeVisible('terrain')).toBe(false);
    expect(model.isLayerVisible('terrain')).toBe(false);
    expect(model.toggleLayerSolo('terrain')).toBe(true);
    expect(model.soloLayer()).toBeNull();
    expect(model.isLayerEyeVisible('objects')).toBe(true);
  });

  it('autosaves edits with the live base, restores them, and keeps undo/redo deterministic', () => {
    const storage = new MemoryStorage();
    const first = harness(null, storage).model;
    const before = mapDocumentV3Hash(first.document());
    first.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    const edited = mapDocumentV3Hash(first.document());
    expect(edited).not.toBe(before);
    first.undo(); expect(mapDocumentV3Hash(first.document())).toBe(before);
    first.redo(); expect(mapDocumentV3Hash(first.document())).toBe(edited);
    expect(mapDocumentV3Hash(harness(null, storage).model.document())).toBe(edited);
  });

  it('commits a verified resize as one undoable, redoable, persisted command', () => {
    const storage = new MemoryStorage();
    const adapter: StudioLiveAdapter = {
      view: () => view(), connect: () => undefined, disconnect: () => undefined,
    };
    const model = mapHarness('terrain-lab', adapter, storage).model;
    const before = mapDocumentV3Hash(model.document());
    const originalWidth = model.document().width;
    const impact = model.planResize('west', true);

    expect(model.resize(impact)).toBe(true);
    const resized = mapDocumentV3Hash(model.document());
    expect(model.document()).toMatchObject({ width: originalWidth + 1, revision: 1 });
    expect(model.canUndo()).toBe(true);
    model.undo();
    expect(mapDocumentV3Hash(model.document())).toBe(before);
    expect(model.canUndo()).toBe(false);
    model.redo();
    expect(mapDocumentV3Hash(model.document())).toBe(resized);
    expect(mapDocumentV3Hash(mapHarness('terrain-lab', adapter, storage).model.document())).toBe(resized);
  });

  it('protects signed/procedural and fixed live-world bounds at every role', () => {
    expect(harness().model.resizeAvailability()).toMatchObject({ allowed: false });
    const support: StudioLiveAdapter = {
      view: () => view({ role: 'support' }), connect: () => undefined, disconnect: () => undefined,
    };
    expect(harness(support).model.resizeAvailability()).toMatchObject({ allowed: false });
    const admin: StudioLiveAdapter = {
      view: () => view({ role: 'admin' }), connect: () => undefined, disconnect: () => undefined,
    };
    expect(harness(admin).model.resizeAvailability()).toMatchObject({
      allowed: false, reason: 'Live island dimensions are fixed by server authority',
    });

    const selection = new StudioSelectionBus();
    const procedural = new MapEditorModel('procedural-world', {
      selection,
      inspector: new StudioInspectorKernel(),
      validation: new StudioValidationPanel(),
      notifications: new StudioNotifications(),
      live: () => admin,
    }, null);
    expect(procedural.resizeAvailability()).toMatchObject({ allowed: false });
    expect(() => procedural.planResize('east', true)).toThrow('map_resize_forbidden');
    procedural.dispose();
  });

  it('rejects a crop preview after any intervening document edit', () => {
    const adapter: StudioLiveAdapter = {
      view: () => view(), connect: () => undefined, disconnect: () => undefined,
    };
    const model = mapHarness('terrain-lab', adapter).model;
    const impact = model.planResize('south', false);
    model.paintBiome([{ tileX: 4, tileY: 4 }], 'forest');
    expect(() => model.resize(impact)).toThrow('map_resize_preview_stale');
  });

  it('renames and reorders authored layers as persisted, hash-visible, undoable edits', () => {
    const storage = new MemoryStorage();
    const model = harness(null, storage).model;
    model.toggleLayer('objects');
    const initialHash = mapDocumentV3Hash(model.document());

    expect(model.renameLayer('objects', '  Orchard   Props  ')).toBe(true);
    const renamedHash = mapDocumentV3Hash(model.document());
    expect(renamedHash).not.toBe(initialHash);
    expect(model.document().layers.find(({ id }) => id === 'objects')?.label).toBe('Orchard Props');
    expect(model.isLayerVisible('objects')).toBe(false);

    expect(model.reorderLayer('objects', 'toward_back')).toBe(true);
    const reorderedHash = mapDocumentV3Hash(model.document());
    expect(reorderedHash).not.toBe(renamedHash);
    expect(model.document().layers.map(({ id }) => id)).toEqual([
      'generated_base', 'terrain', 'objects', 'ground', 'gameplay', 'player_owned', 'canopy', 'anchors',
    ]);
    expect(model.document().revision).toBe(2);

    model.undo();
    expect(mapDocumentV3Hash(model.document())).toBe(renamedHash);
    model.undo();
    expect(mapDocumentV3Hash(model.document())).toBe(initialHash);
    model.redo();
    model.redo();
    expect(mapDocumentV3Hash(model.document())).toBe(reorderedHash);
    expect(mapDocumentV3Hash(harness(null, storage).model.document())).toBe(reorderedHash);
  });

  it('keeps required live/generated layers and their ordering boundaries read-only', () => {
    const { model } = harness();
    const before = mapDocumentV3Hash(model.document());

    expect(model.canRenameLayer('generated_base')).toBe(false);
    expect(model.canRenameLayer('player_owned')).toBe(false);
    expect(model.renameLayer('generated_base', 'Editable base')).toBe(false);
    expect(model.renameLayer('player_owned', 'Authored placeables')).toBe(false);
    expect(model.reorderLayer('terrain', 'toward_back')).toBe(false);
    expect(model.reorderLayer('terrain', 'toward_front')).toBe(false);
    expect(model.reorderLayer('gameplay', 'toward_front')).toBe(false);
    expect(model.reorderLayer('canopy', 'toward_back')).toBe(false);
    expect(() => model.renameLayer('objects', '   ')).toThrow('map_layer_label_invalid');
    expect(() => model.renameLayer('objects', 'x'.repeat(49))).toThrow('map_layer_label_invalid');
    expect(mapDocumentV3Hash(model.document())).toBe(before);
    expect(model.canUndo()).toBe(false);
  });

  it('executes guarded Outliner reparent and reorder requests as one history entry', () => {
    const storage = new MemoryStorage();
    const prefab = createMapPrefabDocument({ id: 'outliner-tree', title: 'Outliner Tree' });
    const base = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'outliner-edit', title: 'Outliner Edit', width: 16, height: 16,
    }));
    const document = normalizeMapDocumentV3({
      ...base,
      prefabs: [prefab],
      objects: [{
        id: 'tree-1', prefabId: prefab.id, prefabRevision: prefab.revision,
        tileX: 3, tileY: 4, elevation: 0, layer: 'objects',
        quarterTurns: 0, flipX: false, enabled: true,
      }],
      landmarks: [{
        id: 'dock-1', sourceDecorationId: 5, groupId: 'fisherman_fin_camp',
        groupLabel: 'Fisher Dock', kind: 'fisher_dock', tileX: 5, tileY: 6,
        elevation: 0, layer: 'ground', variant: 0, animationOffset: 0,
        quarterTurns: 0, flipX: false, enabled: true,
      }],
    });
    storage.setItem('orchard.studio.map-draft.v1.outliner-edit', JSON.stringify({
      version: 2, baseRevision: 0, baseSemanticHash: null, dirty: false,
      document: serializeMapDocumentV3(document),
    }));
    const model = mapHarness('outliner-edit', null, storage).model;
    const original = mapDocumentV3Hash(model.document());

    expect(model.applyOutlinerMutation({
      kind: 'reparent', view: 'world', nodeKind: 'object', nodeId: 'tree-1', targetLayer: 'ground',
    }, 'write')).toMatchObject({ ok: true, operation: { undoEntries: 1 } });
    expect(model.document().objects[0]?.layer).toBe('ground');
    model.undo();
    expect(mapDocumentV3Hash(model.document())).toBe(original);
    expect(model.canUndo()).toBe(false);
    model.redo();
    expect(model.document().objects[0]?.layer).toBe('ground');

    expect(model.applyOutlinerMutation({
      kind: 'reparent', view: 'world', nodeKind: 'landmark', nodeId: 'dock-1', targetLayer: 'canopy',
    }, 'write')).toMatchObject({ ok: true, operation: { undoEntries: 1 } });
    expect(model.document().landmarks[0]?.layer).toBe('canopy');
    model.undo();
    expect(model.document().landmarks[0]?.layer).toBe('ground');

    expect(model.applyOutlinerMutation({
      kind: 'reorder', view: 'world', nodeKind: 'layer', nodeId: 'objects', direction: 'toward_back',
    }, 'write')).toMatchObject({ ok: true, operation: { undoEntries: 1 } });
    expect(model.document().layers.map(({ id }) => id)).toEqual([
      'generated_base', 'terrain', 'objects', 'ground', 'gameplay', 'player_owned', 'canopy', 'anchors',
    ]);
    model.undo();
    expect(model.document().layers.map(({ id }) => id)).toEqual([
      'generated_base', 'terrain', 'ground', 'objects', 'gameplay', 'player_owned', 'canopy', 'anchors',
    ]);
  });

  it('derives Outliner mutation guards from live model state and keeps runtime rows read-only', () => {
    const { model } = harness();
    expect(model.applyOutlinerMutation({
      kind: 'reparent', view: 'live', nodeKind: 'object', nodeId: 'anything', targetLayer: 'ground',
    }, 'write')).toEqual({ ok: false, reason: 'runtime_read_only' });
    expect(model.applyOutlinerMutation({
      kind: 'reorder', view: 'world', nodeKind: 'layer', nodeId: 'objects', direction: 'toward_back',
    }, 'read_only')).toEqual({ ok: false, reason: 'authority_read_only' });

    model.toggleLayerLock('objects');
    expect(model.applyOutlinerMutation({
      kind: 'reorder', view: 'world', nodeKind: 'layer', nodeId: 'objects', direction: 'toward_back',
    }, 'write')).toEqual({ ok: false, reason: 'layer_locked' });
    model.toggleLayerLock('objects');
    model.toggleLayerSolo('terrain');
    expect(model.applyOutlinerMutation({
      kind: 'reorder', view: 'world', nodeKind: 'layer', nodeId: 'objects', direction: 'toward_back',
    }, 'write')).toEqual({ ok: false, reason: 'layer_hidden' });
    expect(model.canUndo()).toBe(false);
  });

  it('embeds prefabs and commits deterministic scatter as one undoable map command', () => {
    const { model } = harness();
    const prefab = createMapPrefabDocument({ id: 'studio-tree', title: 'Studio Tree' });
    model.embedPrefab(prefab);
    const revision = model.document().revision;
    model.scatter({
      seed: 42, points: [{ tileX: 400, tileY: 400 }, { tileX: 401, tileY: 400 }],
      palette: [{ prefabId: prefab.id, weight: 1 }], density: 10_000, minimumSpacing: 0,
      layer: 'objects', randomQuarterTurns: true, randomFlipX: true,
    });
    expect(model.document().objects).toHaveLength(2);
    expect(model.document().revision).toBe(revision + 1);
    model.undo(); expect(model.document().objects).toHaveLength(0);
  });

  it('atomically embeds a catalog prefab and scatters it with one undo entry', () => {
    const { model } = harness();
    const prefab = createMapPrefabDocument({ id: 'catalog-tree', title: 'Catalog Tree' });
    const before = mapDocumentV3Hash(model.document());
    model.scatter({
      seed: 91, points: [{ tileX: 400, tileY: 400 }, { tileX: 402, tileY: 400 }],
      palette: [{ prefabId: prefab.id, weight: 1 }], density: 10_000, minimumSpacing: 2,
      layer: 'objects',
    }, [prefab]);
    expect(model.document().objects).toHaveLength(2);
    expect(model.document().revision).toBe(1);
    expect(model.document().prefabs.some(({ id }) => id === prefab.id)).toBe(true);
    model.undo();
    expect(mapDocumentV3Hash(model.document())).toBe(before);
    expect(model.document().prefabs.some(({ id }) => id === prefab.id)).toBe(false);
  });

  it('adopts the initial verified live head and follows a clean remote advance', () => {
    const revisionSeven = remoteDocument(7, 'Remote revision seven');
    let liveView = view({ mapRevision: 7, mapDocument: mapHead(revisionSeven) });
    const adapter: StudioLiveAdapter = {
      view: () => liveView, connect: () => undefined, disconnect: () => undefined,
    };
    const { model, notifications } = harness(adapter);
    model.reconcileLiveHead();
    expect(model.document()).toEqual(revisionSeven);
    expect(model.baseRevision()).toBe(7);
    expect(model.dirty()).toBe(false);
    expect(model.canUndo()).toBe(false);

    const revisionEight = remoteDocument(8, 'Remote revision eight');
    liveView = view({ mapRevision: 8, mapDocument: mapHead(revisionEight) });
    model.reconcileLiveHead();
    expect(model.document()).toEqual(revisionEight);
    expect(model.baseRevision()).toBe(8);
    expect(model.conflictRevision()).toBeNull();
    expect(model.dirty()).toBe(false);
    expect(notifications.items()).toHaveLength(0);
  });

  it('preserves a dirty draft when a different live head advances', () => {
    const revisionSeven = remoteDocument(7, 'Remote revision seven');
    let liveView = view({ mapRevision: 7, mapDocument: mapHead(revisionSeven) });
    const adapter: StudioLiveAdapter = {
      view: () => liveView, connect: () => undefined, disconnect: () => undefined,
    };
    const { model, notifications, storage } = harness(adapter);
    model.reconcileLiveHead();
    model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    const localHash = mapDocumentV3Hash(model.document());
    const storedDraft = [...(storage as MemoryStorage).values.values()][0];

    const revisionEight = remoteDocument(8, 'A concurrent remote edit');
    liveView = view({ mapRevision: 8, mapDocument: mapHead(revisionEight) });
    model.reconcileLiveHead();
    model.reconcileLiveHead();
    expect(mapDocumentV3Hash(model.document())).toBe(localHash);
    expect([...(storage as MemoryStorage).values.values()][0]).toBe(storedDraft);
    expect(model.baseRevision()).toBe(7);
    expect(model.conflictRevision()).toBe(8);
    expect(model.canUndo()).toBe(true);
    expect(notifications.items().filter(({ kind }) => kind === 'conflict')).toHaveLength(1);
  });

  it('reloads a verified conflict head only through the explicit destructive action', () => {
    const revisionSeven = remoteDocument(7, 'Remote revision seven');
    let liveView = view({ mapRevision: 7, mapDocument: mapHead(revisionSeven) });
    const adapter: StudioLiveAdapter = {
      view: () => liveView, connect: () => undefined, disconnect: () => undefined,
    };
    const { model } = harness(adapter);
    model.reconcileLiveHead();
    model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    const localHash = mapDocumentV3Hash(model.document());
    const revisionEight = remoteDocument(8, 'Verified latest map');
    liveView = view({ mapRevision: 8, mapDocument: mapHead(revisionEight) });
    model.reconcileLiveHead();

    expect(mapDocumentV3Hash(model.document())).toBe(localHash);
    expect(model.reloadLatest()).toBe(true);
    expect(model.document()).toEqual(revisionEight);
    expect(model.baseRevision()).toBe(8);
    expect(model.conflictRevision()).toBeNull();
    expect(model.dirty()).toBe(false);
    expect(model.canUndo()).toBe(false);
  });

  it('does not discard a local conflict draft for an unverified reload head', () => {
    const revisionSeven = remoteDocument(7, 'Remote revision seven');
    let liveView = view({ mapRevision: 7, mapDocument: mapHead(revisionSeven) });
    const adapter: StudioLiveAdapter = {
      view: () => liveView, connect: () => undefined, disconnect: () => undefined,
    };
    const { model } = harness(adapter);
    model.reconcileLiveHead();
    model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    const localHash = mapDocumentV3Hash(model.document());
    liveView = view({
      mapRevision: 8,
      mapDocument: { ...mapHead(remoteDocument(8, 'Tampered latest map')), contentHash: 'not-the-document-hash' },
    });
    model.reconcileLiveHead();

    expect(() => model.reloadLatest()).toThrow('live_map_head_unverified');
    expect(mapDocumentV3Hash(model.document())).toBe(localHash);
    expect(model.dirty()).toBe(true);
    expect(model.canUndo()).toBe(true);
  });

  it('publishes against the checked-out base even if the adapter observes a newer head', async () => {
    const revisionSeven = remoteDocument(7, 'Remote revision seven');
    let liveView = view({ mapRevision: 7, mapDocument: mapHead(revisionSeven) });
    const revisionEight = remoteDocument(8, 'Concurrent remote revision');
    const publishMap = vi.fn(async () => {
      liveView = view({ mapRevision: 8, mapDocument: mapHead(revisionEight) });
      throw new Error('live_map_revision_conflict');
    });
    const adapter: StudioLiveAdapter = {
      view: () => liveView, connect: () => undefined, disconnect: () => undefined, publishMap,
    };
    const { model } = harness(adapter);
    model.reconcileLiveHead();
    model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    const localHash = mapDocumentV3Hash(model.document());
    await expect(model.publish()).rejects.toThrow('live_map_revision_conflict');
    expect(publishMap).toHaveBeenCalledOnce();
    expect(publishMap).toHaveBeenCalledWith(expect.anything(), expect.any(String), 7);
    expect(mapDocumentV3Hash(model.document())).toBe(localHash);
    expect(model.baseRevision()).toBe(7);
    expect(model.conflictRevision()).toBe(8);
    expect(model.publishing()).toBe(false);
  });

  it('exposes publish in-flight state until the matching authority head arrives', async () => {
    const revisionSeven = remoteDocument(7, 'Remote revision seven');
    let liveView = view({ mapRevision: 7, mapDocument: mapHead(revisionSeven) });
    let finishPublish: (() => void) | undefined;
    const publishMap = vi.fn(() => new Promise<void>((resolve) => { finishPublish = resolve; }));
    const adapter: StudioLiveAdapter = {
      view: () => liveView, connect: () => undefined, disconnect: () => undefined, publishMap,
    };
    const { model } = harness(adapter);
    model.reconcileLiveHead();
    model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    const pending = model.publish();
    expect(model.publishing()).toBe(true);
    finishPublish?.();
    await pending;
    expect(model.publishing()).toBe(true);

    const accepted = normalizeMapDocumentV3({ ...model.document(), revision: 8 });
    liveView = view({ mapRevision: 8, mapDocument: mapHead(accepted) });
    model.reconcileLiveHead();
    expect(model.publishing()).toBe(false);
    expect(model.dirty()).toBe(false);
  });

  it('refreshes biome rendering without revalidating terrain after adopting a clean head', () => {
    const revisionNine = remoteDocument(9, 'Different live head');
    const liveView = view({ mapRevision: 9, mapDocument: mapHead(revisionNine) });
    const adapter: StudioLiveAdapter = {
      view: () => liveView, connect: () => undefined, disconnect: () => undefined,
    };
    const { model, validation, notifications } = harness(adapter);
    const setIssues = vi.spyOn(validation, 'setIssues');
    model.refreshKernels();
    model.refreshKernels();
    expect(setIssues).not.toHaveBeenCalled();
    model.reconcileLiveHead();
    model.reconcileLiveHead();
    expect(model.baseRevision()).toBe(9);
    expect(notifications.items().filter(({ kind }) => kind === 'conflict')).toHaveLength(0);
    setIssues.mockClear();
    const terrainIdentity = model.terrainIdentity();
    const terrainGeometryIdentity = model.terrainGeometryIdentity();
    model.paintBiome([{ tileX: 400, tileY: 400 }], 'forest');
    const biomeIdentity = model.terrainIdentity();
    expect(biomeIdentity).not.toBe(terrainIdentity);
    expect(model.terrainGeometryIdentity()).toBe(terrainGeometryIdentity);
    expect(setIssues).not.toHaveBeenCalled();
    model.undo();
    expect(model.terrainIdentity()).toBe(terrainIdentity);
    expect(setIssues).not.toHaveBeenCalled();
    model.redo();
    expect(model.terrainIdentity()).toBe(biomeIdentity);
    expect(setIssues).not.toHaveBeenCalled();
    model.apply({ kind: 'terrain', command: {
      kind: 'paint', points: [{ tileX: 400, tileY: 400 }], patch: { surface: 'stone' },
    } });
    expect(model.terrainIdentity()).not.toBe(biomeIdentity);
    expect(model.terrainGeometryIdentity()).not.toBe(terrainGeometryIdentity);
    expect(setIssues).not.toHaveBeenCalled();
  });
});

it('draws browser edits before saving, coalesces rapid strokes, and flushes the latest draft on disposal',()=>{
 vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',()=>0);
 try {
  const storage=new MemoryStorage(),save=vi.spyOn(storage,'setItem');
  const {model}=mapHarness('terrain-lab',null,storage);
  model.editTerrain({kind:'paint',points:[{tileX:2,tileY:2}],patch:{surface:'water'}});
  expect(model.document().cells['2,2']?.surface).toBe('water');
  expect(model.dirty()).toBe(true);expect(save).not.toHaveBeenCalled();
  vi.advanceTimersByTime(200);
  model.editTerrain({kind:'paint',points:[{tileX:3,tileY:2}],patch:{surface:'water'}});
  vi.advanceTimersByTime(200);expect(save).not.toHaveBeenCalled();
  vi.advanceTimersByTime(50);expect(save).toHaveBeenCalledTimes(1);
  model.editTerrain({kind:'paint',points:[{tileX:4,tileY:2}],patch:{surface:'water'}});
  model.dispose();expect(save).toHaveBeenCalledTimes(2);
  const draft=JSON.parse(save.mock.calls[1]![1]) as {document:string};
  expect(parseMapDocumentV3(draft.document).cells['4,2']?.surface).toBe('water');
  vi.runAllTimers();expect(save).toHaveBeenCalledTimes(2);
 } finally {vi.unstubAllGlobals();vi.useRealTimers();}
});
