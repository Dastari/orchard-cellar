import {describe,expect,it} from 'vitest';
import {cliffFamilyIndex,terrainCliffTileSet,type CliffFamilyId} from '@orchard/sim';
import {authoredCliffGroundLayerAt,groundAssetForTile} from './ground-cache.js';
import type {TerrainArray} from './terrain.js';
import type {OverworldArt} from './overworld-art.js';
import type {LoadedAsset} from '@orchard/ui';

function terrain(family:CliffFamilyId):TerrainArray {
 return {spaceId:1,seed:0,version:0,width:1,height:1,biomes:new Uint8Array(1),blocked:new Uint8Array(0),horseJumpableTerrain:new Uint8Array(0),
  elevations:new Int16Array([1]),dirtCliffRoles:new Uint8Array(1),dirtTerraces:new Uint8Array(1),
  cliffFamilies:new Uint8Array([cliffFamilyIndex(family)]),authoredSurfaces:['stone']};
}
describe('explicit native cliff ground',()=>{
 it('uses the actual native cap frame for authored desert and shroomland, without changing terrain',()=>{
  for(const [family,assetId,frame] of [['desert_2','tile_cf_desert_cliff_2',139],['shroomlands','tile_cf_shroomlands_cliff',39]] as const){
   const t=terrain(family),before=structuredClone(t);
   const asset={} as LoadedAsset;
   const art={terrainAssets:{[assetId]:asset}} as unknown as OverworldArt;
   expect(authoredCliffGroundLayerAt(t,0,0)).toEqual({assetId,frame});
   expect(groundAssetForTile(art,t,0,0,'highland')).toBe(asset);
   expect(t).toEqual(before);
  }
 });
 it('preserves inherited maps, explicit grass palettes, exact surfaces and unverified interior fills',()=>{
  const t=terrain('stone_2');
  expect(authoredCliffGroundLayerAt({...t,cliffFamilies:undefined},0,0)).toBeNull();
  expect(authoredCliffGroundLayerAt({...t,authoredSurfaces:undefined},0,0)).toBeNull();
  expect(authoredCliffGroundLayerAt({...t,surfaceFamilies:new Uint8Array([1])},0,0)).toBeNull();
  expect(authoredCliffGroundLayerAt({...t,authoredSurfaces:['grass']},0,0)).toBeNull();
  expect(authoredCliffGroundLayerAt(terrain('volcanic_interior'),0,0)).toBeNull();
 });
 it('does not apply a bootstrap cap to a different live family asset',()=>{
  const t={...terrain('desert_2'),tilesets:{familyIds:['desert_2'],
   tileSetFor:()=>({...terrainCliffTileSet('desert_2')!,assetId:'custom_live_desert'})}};
  expect(authoredCliffGroundLayerAt(t,0,0)).toBeNull();
 });
});
