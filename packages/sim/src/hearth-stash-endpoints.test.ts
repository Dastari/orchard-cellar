import { expect, it } from 'vitest';
import { hearthSupplyCacheInstalled, hearthSupplyCacheApproachClear, runtimeHearthSupplyCache } from './hearth-stash-endpoints.js';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type { SpaceContentDefinition } from './content/world-definition.js';
import { createLiveIslandMapDocument, type MapDocumentV3 } from './map-document-v3.js';
import type {MapPrefabDocumentV2} from './map-prefab.js';
import { HEARTH_COMBAT_REGIONS } from './hearth-archipelago.js';
import { TILE_SIZE_FIXED, type CollisionMap } from './state.js';

const registry=bootstrapContentRegistry(),cache=runtimeHearthSupplyCache(registry)!;
const prefab:MapPrefabDocumentV2={schemaVersion:2,kind:'map_prefab',id:cache.prefabId,title:'supply cache',
  width:1,height:1,tileSize:16,pivot:{tileX:0,tileY:0},revision:1,assetRegistryRevision:'fixture',tags:['semantic.fixture'],
  collection:{id:'fixture',label:'Fixture',color:'#000000'},behaviors:[{kind:'static'}],
  cells:[{id:'base',tileX:0,tileY:0,elevation:0,collisionMask:0xffff}],placements:[{id:'visual',
    assetId:cache.assetId,assetName:cache.assetName,tileX:0,tileY:0,elevation:0,layer:'object',
    visual:{kind:'state',name:'chest',frameIndex:0},quarterTurns:0,flipX:false}]};
const document: MapDocumentV3 = { ...createLiveIslandMapDocument(), combatRegions: HEARTH_COMBAT_REGIONS,
  prefabs: [prefab], objects: [{ id: cache.objectId, prefabId: prefab.id, prefabRevision: 1,
    tileX: cache.tileX, tileY: cache.tileY, elevation: 0, layer: 'objects', quarterTurns: 0, flipX: false, enabled: true }] };
it('admits the exact authored native chest and denies displaced, disabled, rebound or non-sanctuary endpoints', () => {
  expect(hearthSupplyCacheInstalled(cache,document)).toBe(true);
  expect(hearthSupplyCacheInstalled(cache,null)).toBe(false);
  expect(hearthSupplyCacheInstalled(cache,{ ...document, combatRegions: [] })).toBe(false);
  for (const patch of [{ enabled: false }, { tileX: 651 }, { elevation: 1 }, { scale: 2 as const },
    { quarterTurns: 1 as const }, { flipX: true }, { prefabRevision: 2 }]) {
    expect(hearthSupplyCacheInstalled(cache,{ ...document, objects: [{ ...document.objects[0]!, ...patch }] })).toBe(false);
  }
  expect(hearthSupplyCacheInstalled(cache,{ ...document, prefabs: [{ ...prefab, placements: [{ ...prefab.placements[0]!, assetId: 0 }] }] })).toBe(false);
  expect(hearthSupplyCacheInstalled(cache,{ ...document, prefabs: [{ ...prefab, cells: [] }] })).toBe(false);
});
it('keeps the frontage body clear of the chest and requires bounded same-plane unobstructed access', () => {
  const collision: CollisionMap = { width: 832, height: 832, blocked: new Uint8Array(832 * 832),
    elevations: new Int16Array(832 * 832), obstacles: [{ left: 650 * TILE_SIZE_FIXED, right: 651 * TILE_SIZE_FIXED - 1,
      top: 202 * TILE_SIZE_FIXED, bottom: 203 * TILE_SIZE_FIXED - 1 }] };
  const position = { x: 650.5 * TILE_SIZE_FIXED, y: 204.5 * TILE_SIZE_FIXED };
  expect(hearthSupplyCacheApproachClear(cache,position, collision)).toBe(true);
  expect(hearthSupplyCacheApproachClear(cache,position, { ...collision, obstacles: [...collision.obstacles!, {
    left: 650 * TILE_SIZE_FIXED, right: 651 * TILE_SIZE_FIXED - 1,
    top: 203 * TILE_SIZE_FIXED, bottom: 203 * TILE_SIZE_FIXED + 1 }] })).toBe(false);
  expect(hearthSupplyCacheApproachClear(cache,{ ...position, y: 203.5 * TILE_SIZE_FIXED }, collision)).toBe(false);
  expect(hearthSupplyCacheApproachClear(cache,{ ...position, x: position.x + 2 * TILE_SIZE_FIXED }, collision)).toBe(false);
  collision.elevations![204 * 832 + 650] = 1;
  expect(hearthSupplyCacheApproachClear(cache,position, collision)).toBe(false);
  collision.elevations![204 * 832 + 650] = 0;
  const side = { ...position, x: position.x + TILE_SIZE_FIXED };
  expect(hearthSupplyCacheApproachClear(cache,side, collision)).toBe(true);
  expect(hearthSupplyCacheApproachClear(cache,side, { ...collision, obstacles: [...collision.obstacles!, {
    left: 651 * TILE_SIZE_FIXED, right: 651 * TILE_SIZE_FIXED + 1, top: 203 * TILE_SIZE_FIXED, bottom: 206 * TILE_SIZE_FIXED }] })).toBe(false);
});

it('resolves renamed authored identifiers and fails neutral for missing, retired, or ambiguous owners',()=>{
  const island=registry.spaces.get('space:island')!;
  const chest=registry.objects.get('object:chest')!,renamedChest={...chest,id:'object:renamed_cache' as const};
  const renamed:SpaceContentDefinition={...island,id:'space:renamed_island',
    supplyCache:['renamed_cache',renamedChest.id,'renamed-map-object','renamed-prefab',cache.assetId,650,202,650,204] as const};
  const renamedRegistry={...registry,spaces:new Map([[renamed.id,renamed]]),objects:new Map([[renamedChest.id,renamedChest]])};
  expect(runtimeHearthSupplyCache(renamedRegistry)?.endpointId).toBe('renamed_cache');
  expect(runtimeHearthSupplyCache(renamedRegistry,'renamed_cache')?.objectId).toBe('renamed-map-object');
  expect(runtimeHearthSupplyCache({...renamedRegistry,spaces:new Map([[renamed.id,{...renamed,retired:true}]])})).toBeNull();
  expect(runtimeHearthSupplyCache({...renamedRegistry,objects:new Map()})).toBeNull();
  expect(runtimeHearthSupplyCache({...renamedRegistry,spaces:new Map<string,SpaceContentDefinition>(
    [[renamed.id,renamed],['space:second',{...renamed,id:'space:second'}]])})).toBeNull();
});
