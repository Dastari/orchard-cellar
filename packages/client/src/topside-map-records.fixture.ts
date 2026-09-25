import {
  activeSurvivalLandmarks, connectedObjectAsset, createLiveIslandMapDocument, createMapPrefabDocument, generateSurvivalProceduralDecorations,
  LIVE_ISLAND_MAP_ID, runtimeHearthSupplyCache, serializeMapDocumentV3, SURVIVAL_WORLD_SEED, TOPSIDE_SPACE_ID,
  type CombatRegion, type ContentRegistry, type MapDocumentV3, type MapObjectInstance, type MapPrefabDocumentV2,
} from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';

/**
 * Static world S4e: an authored live island exercising everything the topside
 * painters read from the map: prefab objects in every chunk (edges and corners
 * included; multi-placement prefabs, every quarter turn, flips, scale, state-driven
 * presentation, ground and canopy layers, lights, streetlamps, a connected fence run
 * across a chunk edge, disabled objects and a stale prefab revision), the installed
 * hearth supply cache, the ferry's availability region, suppressed procedural and
 * landmark decorations (both spellings a document may carry) and a disabled landmark.
 *
 * Asset frames: tests mock `loadGeneratedAsset` with states `base`, `on`, `chest`
 * and animations `burn`, `sway` (FIXTURE_ASSET_METADATA).
 */

/** The frames every mocked fixture asset carries. */
export function fixtureAssetMetadata(name: string) {
  const frame = (x: number, height = 32) => ({ x, y: 0, width: 16, height, durationTicks: 1 });
  return {
    name,
    metadata: {
      image: `${name}.png`,
      animations: { burn: [frame(0), frame(16)], sway: [frame(32), frame(48, 48)] },
      animationMeta: { sway: { fps: 5 } },
      states: { base: frame(64), on: frame(80, 40), chest: frame(96, 24) },
    },
    anchor: name.length % 2 === 0 ? [8, 31] : [7, 29],
  };
}

function placement(id: string, assetName: string, visual: { kind: 'state' | 'animation'; name: string }, extra: object = {}) {
  return {
    id, assetId: 1, assetName, tileX: 0, tileY: 0, elevation: 0, layer: 'object' as const,
    quarterTurns: 0 as const, flipX: false, visual: { ...visual, frameIndex: 0 }, ...extra,
  };
}

function prefab(id: string, fields: Partial<MapPrefabDocumentV2>): MapPrefabDocumentV2 {
  return { ...createMapPrefabDocument({ id, title: id }), ...fields };
}

function fixturePrefabs(registry: ContentRegistry): MapPrefabDocumentV2[] {
  const cache = runtimeHearthSupplyCache(registry, undefined, TOPSIDE_SPACE_ID)!;
  return [
    prefab('tree', {
      width: 3, height: 3, pivot: { tileX: 1, tileY: 2 },
      cells: [{ id: 'trunk', tileX: 1, tileY: 2, elevation: 0, collisionMask: 0x0660 },
        { id: 'root', tileX: 2, tileY: 2, elevation: 0, collisionMask: 0x000f }],
      placements: [
        placement('trunk', 'tree_trunk_fixture', { kind: 'state', name: 'base' }, { tileX: 1, tileY: 2 }),
        placement('canopy', 'tree_canopy_fixture', { kind: 'animation', name: 'sway' }, { tileX: 1, tileY: 1, layer: 'canopy', flipX: true, quarterTurns: 1 }),
      ],
    }),
    prefab('torch', { placements: [placement('flame', 'prop_cf_standing_torch', { kind: 'animation', name: 'burn' })] }),
    prefab('streetlamp', { placements: [placement('lamp', 'prop_cf_hearth_streetlamp', { kind: 'state', name: 'base' })] }),
    prefab('standing-lamp', {
      cells: [{ id: 'base', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0xffff }],
      placements: [placement('lamp', 'prop_cf_furniture_rustic_standing_lamp', { kind: 'state', name: 'base' })],
    }),
    prefab('rug', { width: 2, placements: [placement('rug', 'rug_fixture', { kind: 'state', name: 'base' }, { layer: 'ground', tileX: 1, quarterTurns: 3, flipX: true })] }),
    prefab('fence', { placements: [placement('rail', connectedObjectAsset('wood_fence'), { kind: 'state', name: 'base' })] }),
    prefab('sapling', {
      presentation: {
        properties: { grown: { type: 'bool', default: false } },
        rules: [{ when: { grown: true }, placementId: 'plant', appearance: { assetId: 2, assetName: 'grown_fixture', visual: { kind: 'state', name: 'on', frameIndex: 0 } }, scalePermille: 1500 }],
      },
      placements: [placement('plant', 'sapling_fixture', { kind: 'state', name: 'base' })],
    }),
    // The reviewed supply-cache chest (hearthSupplyCacheInstalled's exact shape).
    { ...createMapPrefabDocument({ id: cache.prefabId, title: 'Supply cache' }), revision: 1, pivot: { tileX: 0, tileY: 0 },
      cells: [{ id: 'base', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0xffff }],
      placements: [{ ...placement('chest', cache.assetName, { kind: 'state', name: cache.visualState }), assetId: cache.assetId }] },
  ];
}

const PREFAB_CYCLE = ['tree', 'torch', 'streetlamp', 'standing-lamp', 'rug', 'sapling'] as const;
const LAYERS = ['objects', 'canopy', 'gameplay', 'ground'] as const;

function fixtureObjects(registry: ContentRegistry): MapObjectInstance[] {
  const cache = runtimeHearthSupplyCache(registry, undefined, TOPSIDE_SPACE_ID)!;
  const objects: MapObjectInstance[] = [];
  const object = (id: string, prefabId: string, tileX: number, tileY: number, fields: Partial<MapObjectInstance> = {}): MapObjectInstance => ({
    id, prefabId, prefabRevision: 0, tileX, tileY, elevation: 0, layer: 'objects',
    quarterTurns: 0, flipX: false, scale: 1, enabled: true, ...fields,
  });
  // Four objects in every chunk of the 13 x 13 map: near the top-left corner, inside,
  // on the last row and on the last column, so windows cut through them at every edge.
  let index = 0;
  for (let cy = 0; cy < 13; cy++) for (let cx = 0; cx < 13; cx++) {
    const x = cx * 64, y = cy * 64;
    for (const [dx, dy] of [[1, 1], [33, 20], [30, 63], [63, 40]] as const) {
      const prefabId = PREFAB_CYCLE[index % PREFAB_CYCLE.length]!;
      objects.push(object(`o-${cx}-${cy}-${dx}-${dy}`, prefabId, x + dx, y + dy, {
        quarterTurns: (index % 4) as 0 | 1 | 2 | 3, flipX: index % 3 === 0, scale: index % 5 === 0 ? 2 : 1,
        layer: prefabId === 'rug' ? 'ground' : LAYERS[index % 3]!,
        ...(prefabId === 'sapling' && index % 2 === 0 ? { state: { grown: true } } : {}),
        ...(index % 17 === 0 ? { enabled: false } : {}),
        ...(index % 23 === 0 ? { prefabRevision: 9 } : {}),
      }));
      index++;
    }
  }
  // A connected fence run across the chunk edge at x = 256, with a corner.
  for (let tileX = 250; tileX <= 262; tileX++) objects.push(object(`fence-${tileX}`, 'fence', tileX, 200));
  objects.push(object('fence-corner', 'fence', 262, 201));
  objects.push(object(cache.objectId, cache.prefabId, cache.tileX, cache.tileY, { prefabRevision: 1 }));
  return objects;
}

/** The authored fixture document (the live island's document as Studio publishes it). */
export function topsideAuthoredFixture(registry: ContentRegistry): MapDocumentV3 {
  const cache = runtimeHearthSupplyCache(registry, undefined, TOPSIDE_SPACE_ID)!;
  const base = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
  const procedural = generateSurvivalProceduralDecorations(SURVIVAL_WORLD_SEED, registry);
  const landmarks = base.landmarks.map((landmark, index) => index === 1 ? { ...landmark, enabled: false } : landmark);
  const regions: CombatRegion[] = [
    { id: 'cinder-sanctuary', spaceId: TOPSIDE_SPACE_ID, minX: cache.tileX - 8, minY: cache.tileY - 8, maxX: cache.tileX + 8, maxY: cache.frontage.tileY + 8, policy: 'sanctuary' },
    { id: 'willowharbour', spaceId: TOPSIDE_SPACE_ID, minX: 190, minY: 380, maxX: 230, maxY: 420, policy: 'sanctuary' },
  ];
  return {
    ...base,
    landmarks,
    prefabs: [...base.prefabs, ...fixturePrefabs(registry)],
    objects: [...base.objects, ...fixtureObjects(registry)],
    combatRegions: regions,
    generatedSuppressions: [...base.generatedSuppressions,
      `decoration-${procedural[0]!.id}`, String(procedural[100]!.id), `decoration-${procedural[2000]!.id}`,
      ...(landmarks[0] === undefined ? [] : [`decoration-${landmarks[0].sourceDecorationId}`])],
  };
}

export function topsideFixtureRow(document: MapDocumentV3, contentHash: string): LiveMapDocumentRow {
  return { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash, documentJson: serializeMapDocumentV3(document) };
}
