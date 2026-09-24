import { describe, expect, it } from 'vitest';
import { createEmptyMapDocument, createMapPrefabDocument, migrateMapDocumentV2,
  STREETLAMP_DEFINITION, STREETLAMP_ID_BASE, type MapDocumentV3, type MapObjectInstance } from '@orchard/sim';
import { mapEditorLiveMarkers } from './editor-controller.js';
import { resolveMapLampPresentation } from './lamp-presentation.js';

const prefab = { ...createMapPrefabDocument({ id: 'lamp', title: 'Lamp', width: 1, height: 1 }),
  pivot: { tileX: 1, tileY: 0 }, placements: [{ id: 'sprite', assetId: 1, assetName: 'prop_cf_hearth_streetlamp',
    tileX: 2, tileY: 0, elevation: 0, layer: 'object' as const, quarterTurns: 0 as const, flipX: false,
    visual: { kind: 'variant' as const, name: 'base', frameIndex: 0 } }] };
const object: MapObjectInstance = { id: 'authored-lamp', prefabId: prefab.id, prefabRevision: prefab.revision,
  tileX: 20, tileY: 24, elevation: 0, layer: 'objects', enabled: true, quarterTurns: 0, flipX: false };
const published: MapDocumentV3 = { ...migrateMapDocumentV2(createEmptyMapDocument({ id: 'live-island', title: 'Lamps', width: 64, height: 64 })),
  prefabs: [prefab], objects: [object], landmarks: [] };
const id = STREETLAMP_ID_BASE + BigInt(24 * 512 + 21);
const markers = mapEditorLiveMarkers({ placeables: [{ id, spaceId: 0, kind: 'hearth_streetlamp', definitionId: STREETLAMP_DEFINITION,
  ownerIdentity: 'world', tileX: 21, tileY: 24, state: { mode: 'off', lit: false }, lit: false }],
  chests: [], homesteads: [], players: [], npcs: [], resources: [], combatTargets: [], surfaces: [] });

describe('published lamp presentation', () => {
  it('projects an authoritative row through stable authored identity and prefab pivot offsets', () => {
    const draft = { ...published, objects: [{ ...object, tileX: 30, tileY: 31, elevation: 2, layer: 'canopy' as const }] };
    const result = resolveMapLampPresentation(draft, published, markers);
    expect(result.liveMarkers).toEqual([]);
    expect(result.replacements.get(object.id)).toEqual({ ...markers[0], tileX: 31, tileY: 31,
      worldX: 504, worldY: 512, elevation: 2, layer: 'canopy' });
    expect(result.replacements.get(object.id)?.state).toBe(markers[0]!.state);
    expect(markers[0]).toMatchObject({ tileX: 21, tileY: 24 });
    expect(published.objects[0]!.tileX).toBe(20);
  });

  it('keeps a disabled or deleted lamp at its authoritative location until publication', () => {
    for (const objects of [[{ ...object, enabled: false }], []]) {
      const result = resolveMapLampPresentation({ ...published, objects }, published, markers);
      expect(result.replacements.size).toBe(0);
      expect(result.liveMarkers).toEqual(markers);
      expect([...result.disabledAuthoredIds]).toEqual(objects.length ? [object.id] : []);
    }
    expect(resolveMapLampPresentation({ ...published, objects: [] }, { ...published, objects: [] }, []).liveMarkers).toEqual([]);
  });

  it('preserves offline, unverified, unrelated and player-owned representations', () => {
    expect(resolveMapLampPresentation(published, published, []).replacements.size).toBe(0);
    expect(resolveMapLampPresentation(published, null, markers).liveMarkers).toBe(markers);
    expect(resolveMapLampPresentation({ ...published, id: 'terrain-lab' }, published, markers).liveMarkers).toBe(markers);
    const others = [{ ...markers[0]!, id: '777', mapMaterialized: false, ownership: 'player' as const },
      { ...markers[0]!, id: String(id + 1n) }];
    const result = resolveMapLampPresentation(published, published, [...markers, ...others]);
    expect(result.replacements.size).toBe(1);
    expect(result.liveMarkers).toEqual(others);
  });

  it('does not replace converted objects or unsupported transforms', () => {
    for (const update of [{ quarterTurns: 1 as const }, { flipX: true }, { scale: 2 as const }, { prefabId: 'tree' }]) {
      const draft = { ...published, objects: [{ ...object, ...update }] };
      const result = resolveMapLampPresentation(draft, published, markers);
      expect(result.replacements.size).toBe(0);
      expect(result.liveMarkers).toEqual(markers);
    }
    const draft = { ...published, objects: [object, { ...object, id: 'unfinished', quarterTurns: 1 as const }] };
    expect(resolveMapLampPresentation(draft, published, markers).replacements.has(object.id)).toBe(true);
  });
});
