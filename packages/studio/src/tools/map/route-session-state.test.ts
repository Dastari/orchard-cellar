import { describe, expect, it } from 'vitest';
import {
  MapRouteSessionBinding,
  MapRouteSessionStore,
  mapRouteSessionState,
  mapRouteSessionStorageKey,
  parseMapRouteSessionState,
  serializeMapRouteSessionState,
  type MapRouteSessionStorage,
} from './route-session-state.js';

class MemoryStorage implements MapRouteSessionStorage {
  readonly records = new Map<string, string>();
  writes = 0;

  getItem(key: string): string | null { return this.records.get(key) ?? null; }
  setItem(key: string, value: string): void { this.records.set(key, value); this.writes += 1; }
}

const STATE = mapRouteSessionState({
  camera: { x: 302.5, y: 641.25, zoom: 0.75 },
  workspace: 'objects',
  terrainTool: 'inspect',
  activeLayer: 'gameplay',
  hiddenLayers: ['canopy', 'player_owned'],
  userLockedLayers: ['objects'],
  soloLayer: 'gameplay',
  selectedPrefabId: 'apple-tree',
  selectedBiome: null,
  activeElevation: 2,
  heightOverlayVisible: true,
  collisionOverlayVisible: true,
  autoPublish: true,
  transitionKind: 'stairs',
  transitionWidth: 3,
  scatterDensity: 4_250,
  paletteQuery: 'apple orchard',
  paletteOffset: 7,
});

function snapshotWithoutVersion(state: typeof STATE): Omit<typeof STATE, 'version'> {
  const { version, ...snapshot } = state;
  void version;
  return snapshot;
}

describe('map route session state', () => {
  it('round-trips camera, active tools/layers, visibility, and palette position', () => {
    expect(parseMapRouteSessionState(serializeMapRouteSessionState(STATE))).toEqual(STATE);
    const armed = mapRouteSessionState({
      ...STATE,
      activeLayer: 'anchors',
      hiddenLayers: [],
      soloLayer: 'anchors',
      selectedPrefabId: null,
      selectedAnchorKind: 'poi',
    });
    expect(parseMapRouteSessionState(serializeMapRouteSessionState(armed))).toEqual(armed);
  });

  it('retains the authored Outliner view, bounded query, expansion, focus, and selection', () => {
    const outliner = mapRouteSessionState({
      ...STATE,
      outlinerView: 'world',
      authoredOutliner: {
        version: 1,
        query: 'fruit press',
        expandedIds: ['space:0', 'space:0:layer:objects'],
        focusedId: 'map-object:fruit-press',
        selectedId: 'map-object:fruit-press',
      },
    });
    expect(parseMapRouteSessionState(serializeMapRouteSessionState(outliner))).toEqual(outliner);
    expect(parseMapRouteSessionState(JSON.stringify({
      ...outliner,
      authoredOutliner: { ...outliner.authoredOutliner, expandedIds: Array.from({ length: 257 }, (_, index) => `n${index}`) },
    }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...outliner, outlinerView: 'remote' }))).toBeNull();
  });

  it('persists validated terrain modes and families without derived exact candidates', () => {
    const terrain = mapRouteSessionState({
      ...STATE,
      workspace: 'terrain',
      activeLayer: 'terrain',
      selectedPrefabId: null,
      terrainPaletteMode: 'exact_override',
      selectedSurfaceFamily: 'grass_4',
      selectedCliffFamily: 'desert_2',
    });
    const source = serializeMapRouteSessionState(terrain);
    expect(parseMapRouteSessionState(source)).toEqual(terrain);
    expect(source).not.toContain('selectedExactTerrainOverride');
    expect(source).not.toContain('exactTerrainPaletteCache');
  });

  it('isolates records by both route and document', () => {
    expect(mapRouteSessionStorageKey('/build/map', 'live-island')).not.toBe(
      mapRouteSessionStorageKey('/build/map/procedural-world', 'live-island'),
    );
    expect(mapRouteSessionStorageKey('/build/map', 'live-island')).not.toBe(
      mapRouteSessionStorageKey('/build/map', 'terrain-lab'),
    );
    expect(mapRouteSessionStorageKey('/build/map.a', 'b')).not.toBe(
      mapRouteSessionStorageKey('/build/map', 'a.b'),
    );
  });

  it('restores the matching record and suppresses duplicate render-driven writes', () => {
    const storage = new MemoryStorage();
    const first = new MapRouteSessionStore('/build/map/procedural-world', 'procedural-world', storage);
    expect(first.restore()).toBeNull();
    expect(first.save(STATE)).toBe(true);
    expect(first.save(STATE)).toBe(false);
    expect(storage.writes).toBe(1);

    const restored = new MapRouteSessionStore('/build/map/procedural-world', 'procedural-world', storage);
    expect(restored.restore()).toEqual(STATE);
    expect(restored.save(STATE)).toBe(false);
    expect(storage.writes).toBe(1);
  });

  it('rejects stale, corrupt, unsafe, and semantically invalid records', () => {
    expect(parseMapRouteSessionState('not json')).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE, version: 0 }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE,
      camera: { ...STATE.camera, x: Number.NaN } }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE,
      camera: { ...STATE.camera, zoom: 9 } }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE, activeLayer: 'weather' }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE,
      hiddenLayers: ['canopy', 'canopy'] }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE,
      userLockedLayers: ['objects', 'objects'] }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE,
      userLockedLayers: ['generated_base'] }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE,
      soloLayer: 'player_owned' }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE, selectedBiome: 'forest' }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE,
      workspace: 'terrain', selectedPrefabId: 'apple-tree' }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE, paletteOffset: -1 }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE, scatterDensity: 10_001 }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE, transitionKind: 'rope' }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE, transitionWidth: 5 }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE,
      collisionOverlayVisible: 'yes' }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE,
      autoPublish: 'yes' }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE,
      selectedAnchorKind: 'spawn', selectedPrefabId: null, activeLayer: 'anchors' }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE,
      selectedAnchorKind: 'label', selectedPrefabId: null, activeLayer: 'objects' }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE,
      selectedAnchorKind: 'label', selectedPrefabId: null, activeLayer: 'anchors',
      hiddenLayers: ['anchors'] }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE, terrainPaletteMode: 'topology' }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE, selectedSurfaceFamily: 'snow' }))).toBeNull();
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE, selectedCliffFamily: 'orchard_moss' })))
      .toMatchObject({ selectedCliffFamily: 'orchard_moss' });
    expect(parseMapRouteSessionState(JSON.stringify({ ...STATE, selectedCliffFamily: 'Bad Family!' })))
      .toBeNull();
  });

  it('hydrates transition controls for sessions written before the tool was mounted', () => {
    const legacy = { ...STATE, transitionKind: undefined, transitionWidth: undefined,
      heightOverlayVisible: undefined, collisionOverlayVisible: undefined,
      autoPublish: undefined, selectedAnchorKind: undefined,
      outlinerView: undefined, authoredOutliner: undefined,
      userLockedLayers: undefined, soloLayer: undefined };
    expect(parseMapRouteSessionState(JSON.stringify(legacy))).toMatchObject({
      transitionKind: 'slope',
      transitionWidth: 2,
      heightOverlayVisible: false,
      collisionOverlayVisible: false,
      autoPublish: false,
      outlinerView: 'palette',
      authoredOutliner: {
        version: 1, query: '', expandedIds: ['space:0'], focusedId: 'space:0', selectedId: null,
      },
      selectedAnchorKind: null,
      userLockedLayers: [],
      soloLayer: null,
      terrainPaletteMode: 'brush',
      selectedSurfaceFamily: 'grass_1',
      selectedCliffFamily: 'stone_1',
    });
  });

  it('fails soft when browser storage is unavailable', () => {
    const denied: MapRouteSessionStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
    };
    const store = new MapRouteSessionStore('/build/map', 'live-island', denied);
    expect(store.restore()).toBeNull();
    expect(store.save(STATE)).toBe(false);
  });

  it('binds one validated record to an explicit retained-state adapter', () => {
    const storage = new MemoryStorage();
    const store = new MapRouteSessionStore('/build/map', 'live-island', storage);
    let current = STATE;
    const restored: typeof STATE[] = [];
    const binding = new MapRouteSessionBinding(store, {
      snapshot: () => snapshotWithoutVersion(current),
      restore: (state) => { restored.push(state); current = state; },
    });

    expect(binding.restore()).toBe(false);
    expect(binding.persist()).toBe(true);
    current = mapRouteSessionState({ ...STATE, paletteQuery: 'changed' });

    const reloaded = new MapRouteSessionBinding(
      new MapRouteSessionStore('/build/map', 'live-island', storage),
      {
        snapshot: () => snapshotWithoutVersion(current),
        restore: (state) => { restored.push(state); current = state; },
      },
    );
    expect(reloaded.restore()).toBe(true);
    expect(restored).toEqual([STATE]);
    expect(current).toEqual(STATE);
  });

  it('contains target-specific restore failures instead of breaking route startup', () => {
    const storage = new MemoryStorage();
    new MapRouteSessionStore('/build/map', 'live-island', storage).save(STATE);
    const binding = new MapRouteSessionBinding(
      new MapRouteSessionStore('/build/map', 'live-island', storage),
      { snapshot: () => { throw new Error('unused'); }, restore: () => { throw new Error('content drift'); } },
    );
    expect(binding.restore()).toBe(false);
  });
});
