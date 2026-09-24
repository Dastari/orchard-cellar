import { describe, expect, it } from 'vitest';
import {
  createEmptyMapDocument, createMapPrefabDocument, LIVE_ISLAND_MAP_ID, migrateMapDocumentV2,
  STREETLAMP_DEFINITION, STREETLAMP_ID_BASE, type MapObjectInstance, type MapPrefabDocumentV2,
} from '@orchard/sim';
import type { StudioLiveRows } from '../../shell/outliners.js';
import { mapEditorLiveMarkers, pickTopmostVisibleMapEntity } from './editor-controller.js';
import { classifyLiveOwnership, mapStreetlampLiveBindings } from './live-ownership.js';
import { mapRuntimeObjectAvailability } from './runtime-object-actions.js';

const WORLD = 'c200-module-identity';
const PLAYER = 'c200-player-identity';
const lampId = (tileX: number, tileY: number): bigint => STREETLAMP_ID_BASE + BigInt(tileY * 512 + tileX);

const lampPrefab: MapPrefabDocumentV2 = {
  ...createMapPrefabDocument({ id: 'town-lamp', title: 'Town lamp', width: 1, height: 1 }),
  pivot: { tileX: 0, tileY: 0 },
  cells: [{ id: 'cell', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0x0660 }],
  placements: [{ id: 'lamp', assetId: 1, assetName: 'prop_cf_hearth_streetlamp', tileX: 0, tileY: 0,
    elevation: 0, layer: 'object', quarterTurns: 0, flipX: false,
    visual: { kind: 'variant', name: 'base', frameIndex: 0 } }],
};
const lampObject: MapObjectInstance = {
  id: 'lamp-object', prefabId: lampPrefab.id, prefabRevision: lampPrefab.revision,
  tileX: 20, tileY: 24, elevation: 0, layer: 'objects', enabled: true, quarterTurns: 0, flipX: false,
};
const liveIsland = {
  ...migrateMapDocumentV2(createEmptyMapDocument({ id: LIVE_ISLAND_MAP_ID, title: 'Live', width: 64, height: 64 })),
  prefabs: [lampPrefab],
  objects: [lampObject],
};

const rows = (placeables: StudioLiveRows['placeables'], chests: StudioLiveRows['chests'] = []): StudioLiveRows => ({
  placeables, chests, homesteads: [], players: [], npcs: [], resources: [], combatTargets: [], surfaces: [],
});
const lampRow = { id: lampId(20, 24), spaceId: 0, kind: 'hearth_streetlamp', definitionId: STREETLAMP_DEFINITION,
  ownerIdentity: WORLD, tileX: 20, tileY: 24, lit: true };

describe('ownership-aware live markers (Studio/Map Editor)', () => {
  it('classifies rows by their owner, learning the world identity from reserved rows', () => {
    const worldBench = { id: 900n, spaceId: 0, kind: 'bench', definitionId: 'object:bench', ownerIdentity: WORLD };
    const playerBench = { id: 901n, spaceId: 0, kind: 'bench', definitionId: 'object:bench', ownerIdentity: PLAYER };
    const classify = classifyLiveOwnership([lampRow, worldBench, playerBench], null);
    expect(classify(lampRow)).toEqual({ ownership: 'world', mapMaterialized: true });
    expect(classify(worldBench)).toEqual({ ownership: 'world', mapMaterialized: false });
    expect(classify(playerBench)).toEqual({ ownership: 'player', mapMaterialized: false });
    // Without a proven authority row nothing is loosened.
    expect(classifyLiveOwnership([worldBench], null)(worldBench).ownership).toBe('player');
    // A reserved id with another definition is not a town lamp.
    const impostor = { ...lampRow, definitionId: 'object:bench', ownerIdentity: PLAYER };
    expect(classifyLiveOwnership([impostor], null)(impostor).ownership).toBe('player');
  });

  it('projects world-owned rows onto World Objects and keeps player rows locked', () => {
    const markers = mapEditorLiveMarkers(rows([
      lampRow,
      { id: 7n, spaceId: 0, kind: 'tent', ownerIdentity: PLAYER, tileX: 30, tileY: 30 },
    ], [
      { id: 8n, spaceId: 0, ownerIdentity: WORLD, tileX: 31, tileY: 30 },
      { id: 9n, spaceId: 0, ownerIdentity: PLAYER, tileX: 32, tileY: 30 },
    ]));
    expect(markers.map(({ id, layer, ownership }) => [id, layer, ownership])).toEqual([
      [lampRow.id.toString(), 'objects', 'world'],
      ['7', 'player_owned', 'player'],
      ['8', 'objects', 'world'],
      ['9', 'player_owned', 'player'],
    ]);
    expect(markers[0]).toMatchObject({ mapMaterialized: true });
  });

  it('prefers the editable authored lamp over its materialized live row', () => {
    const markers = mapEditorLiveMarkers(rows([lampRow]));
    expect(mapStreetlampLiveBindings(liveIsland).get(lampRow.id.toString())).toBe('lamp-object');
    expect(pickTopmostVisibleMapEntity(liveIsland, markers, () => true, 20, 24, liveIsland))
      .toMatchObject({ kind: 'object', id: 'lamp-object' });
    // Both halves share the World Objects band, so hiding it hides the lamp.
    expect(pickTopmostVisibleMapEntity(liveIsland, markers, (layer) => layer !== 'objects', 20, 24, liveIsland))
      .toBeNull();
    // Without an enabled authored copy the live row stays selectable.
    const disabled = { ...liveIsland, objects: [{ ...lampObject, enabled: false }] };
    expect(pickTopmostVisibleMapEntity(disabled, markers, () => true, 20, 24, liveIsland))
      .toMatchObject({ kind: 'live', id: lampRow.id.toString(), layer: 'objects' });
  });

  it('keeps authored picking through a dirty move without an old-position ghost', () => {
    const markers = mapEditorLiveMarkers(rows([lampRow]));
    const moved = { ...liveIsland, objects: [{ ...lampObject, tileX: 26, layer: 'canopy' as const }] };
    expect(pickTopmostVisibleMapEntity(moved, markers, () => true, 26, 24, liveIsland))
      .toMatchObject({ kind: 'object', id: lampObject.id });
    expect(pickTopmostVisibleMapEntity(moved, markers, () => true, 20, 24, liveIsland)).toBeNull();
    expect(pickTopmostVisibleMapEntity(moved, markers, layer => layer !== 'canopy', 20, 24, liveIsland)).toBeNull();
    expect(pickTopmostVisibleMapEntity(moved, markers, layer => layer !== 'canopy', 26, 24, liveIsland)).toBeNull();
    const deleted = { ...liveIsland, objects: [] };
    expect(pickTopmostVisibleMapEntity(deleted, markers, () => true, 20, 24, liveIsland))
      .toMatchObject({ kind: 'live', id: String(lampRow.id) });
  });

  it('routes world-owned objects through the admin path but not map-materialized lamps', () => {
    const markers = mapEditorLiveMarkers(rows([lampRow], [{ id: 8n, spaceId: 0, ownerIdentity: WORLD, tileX: 31, tileY: 30 }]));
    const input = { mapId: LIVE_ISLAND_MAP_ID, routeAccess: 'write' as const, connected: true,
      role: 'owner', hasLiveApi: true };
    expect(mapRuntimeObjectAvailability({ ...input, marker: markers[1]! })).toEqual({ allowed: true, authority: 'owner' });
    expect(mapRuntimeObjectAvailability({ ...input, marker: markers[0]! })).toMatchObject({ allowed: false });
  });
});
