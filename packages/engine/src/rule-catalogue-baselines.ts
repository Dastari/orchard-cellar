/** Baseline inputs intentionally include invalid/narrow geometry; no repair step. */
import { TERRAIN_CLIFF_FAMILIES, TERRAIN_SURFACE_FAMILIES } from '@orchard/sim';
import { resolveRaisedTerrainTile, type RaisedTerrainTileSet } from '@orchard/sim';
import { caveFloorAutotilePlan, caveFloorPatchVariantAt, caveFloorDecorationFrameAt } from '@orchard/sim';
import { caveFloorFrame } from '@orchard/sim';
import { connectedObjectFrame, connectedObjectFamily } from '@orchard/sim';
import { MAP_BIOME_IDS } from '@orchard/sim';
import { blob47FrameIndexFor } from './tilemap.js';
import { farmSoilFrameIndex } from './farmland.js';
import { beachFrameIndexAt, shorelineInsetFrameIndicesAt, freshwaterFrameIndexAt, freshwaterInsetFrameIndicesAt, desertShoreFrameIndexAt, desertGrassEdgeFrameIndexAt, desertGrassInsetFrameIndicesAt, grassSandTransitionFrameIndexAt, pavingGrassTransitionFrameIndexAt, savannaGrassTransitionFrameIndexAt, waterfallFrameIndexAt, authoredFarmlandFrameIndexAt, type TerrainArray } from './terrain.js';
const offsets = [[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]] as const;
const matches = (mask: number, center = true) => (x: number, y: number) => {
  if (x === 0 && y === 0) return center;
  const i = offsets.findIndex(([dx,dy]) => x === dx && y === dy);
  return i >= 0 && (mask & (1 << i)) !== 0;
};
function terrain(mask: number, center: string, on: string, off: string): TerrainArray {
  const biome = (s: string) => MAP_BIOME_IDS.indexOf(s as typeof MAP_BIOME_IDS[number]);
  const biomes = new Uint8Array(49).fill(biome(off)); biomes[24] = biome(center);
  offsets.forEach(([x,y],i) => { if (mask & (1 << i)) biomes[(3+y)*7+3+x] = biome(on); });
  return {spaceId:0,seed:0,version:0,width:7,height:7,biomes,blocked:new Uint8Array(49),horseJumpableTerrain:new Uint8Array(49),elevations:new Int16Array(49),dirtCliffRoles:new Uint8Array(49),dirtTerraces:new Uint8Array(49)};
}
export function ruleBaselineOutputs(assetNames: readonly string[]): Readonly<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  const masks = Array.from({length:256}, (_,m) => m);
  function raised(id: string, set: RaisedTerrainTileSet) {
    // Every profile, centre raised and empty, all immediate masks. Full plan
    // includes frame layers, collision and unavailable inset semantics.
    for (const profile of Object.keys(set.faceProfiles)) for (const center of [false,true]) {
      results[`${id}/${profile}/${center}`] = masks.map(m => resolveRaisedTerrainTile({raisedAt:matches(m,center)},set,profile,0,0));
    }
    results[`${id}/declaration`] = set; // Pins farther course/variant tables too.
  }
  for (const [id,f] of Object.entries(TERRAIN_CLIFF_FAMILIES)) if (f.available) raised(`raised/${id}`,f.tileSet);
  for (const [id,f] of Object.entries(TERRAIN_SURFACE_FAMILIES)) raised(`surface/${id}`, {projectionStyle:'raised',assetId:f.ledgeBank.assetId,edgeFrames:f.ledgeBank.edgeFrames,insetFrames:f.ledgeBank.insetFrames,rampFrames:{},rampBank:null,ledgeBank:null,stairFrames:null,ladderFrames:null,faceProfiles:{tall:{rows:[]}}});
  const flat = [
    ['shore/beach','beach','water','beach',beachFrameIndexAt,shorelineInsetFrameIndicesAt],
    ['shore/desert','desert_shore','oasis_water','desert_shore',desertShoreFrameIndexAt,shorelineInsetFrameIndicesAt],
    ['shore/freshwater','freshwater','plains','freshwater',freshwaterFrameIndexAt,freshwaterInsetFrameIndicesAt],
    ['transition/desert','desert','savanna','desert',desertGrassEdgeFrameIndexAt,desertGrassInsetFrameIndicesAt],
    ['transition/grass-sand','beach','beach','plains',grassSandTransitionFrameIndexAt],
    ['transition/paving','paving','paving','plains',pavingGrassTransitionFrameIndexAt],
    ['transition/savanna','savanna','savanna','plains',savannaGrassTransitionFrameIndexAt],
  ] as const;
  for (const f of flat) results[f[0]] = masks.map(m => { const t = terrain(m,f[1],f[2],f[3]); return [f[4](t,3,3), f[5]?.(t,3,3) ?? []]; });
  results.blob47 = masks.map(m => blob47FrameIndexFor(matches(m)));
  results.farmland = masks.map(m => farmSoilFrameIndex({tileX:0,tileY:0}, new Set(['0:0', ...offsets.filter((_,i) => m & (1<<i)).map(([x,y]) => `${x}:${y}`)])));
  results.authoredFarmland = masks.map(m => { const t = terrain(m,'plains','plains','plains'); const a = new Uint8Array(49); a[24]=1; offsets.forEach(([x,y],i)=>{if(m&(1<<i))a[(3+y)*7+3+x]=1;}); return authoredFarmlandFrameIndexAt({...t,authoredFarmland:a},3,3); });
  for (const center of [false,true]) results[`patch/cave-floor/${center}`] = masks.map(m => caveFloorAutotilePlan(matches(m,center)));
  results['patch/cave-variants'] = [-19,0,42].flatMap(seed => Array.from({length:64*64},(_,i) => {const x=i%64-32,y=Math.floor(i/64)-32;return [caveFloorPatchVariantAt(seed,2,x,y),caveFloorDecorationFrameAt(seed,2,x,y),caveFloorFrame(x,y,seed)];}));
  // Waterfall consumes N/E/S/W plus N2/S2: all 64 masks, present/absent centre.
  results.lane = [false,true].flatMap(center => Array.from({length:64},(_,mask) => {
    const t = terrain(0,center?'waterfall':'plains','plains','plains');
    [[0,-1],[1,0],[0,1],[-1,0],[0,-2],[0,2]].forEach(([x,y],i)=>{if(mask&(1<<i))t.biomes[(3+y!)*7+3+x!]=MAP_BIOME_IDS.indexOf('waterfall');});
    return waterfallFrameIndexAt(t,3,3);
  }));
  for(const family of ['wood_fence','white_fence','hedge','wood_small_fence','stone_fence','stone_large_fence']) results[`connect4/${family}`]=Array.from({length:16},(_,m)=>connectedObjectFrame(family,m));
  results['connect4/membership'] = assetNames.map(name => [name,connectedObjectFamily(name)]);
  return results;
}
