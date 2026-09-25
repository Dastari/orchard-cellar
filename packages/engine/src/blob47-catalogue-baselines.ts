/** Frozen pre-migration layer probes. Bit order NESW, NE SE SW NW. */
import { MAP_BIOME_IDS, surfaceFamilyIndex, type TerrainSurfaceFamilyId } from '@orchard/sim';
import { authoredFarmlandGroundLayersAt, authoredGrassFringeLayersAt } from './ground-cache.js';
import type { TerrainArray } from './terrain.js';
export const blobOffsets = [[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]] as const;
function base(): TerrainArray {
  return {spaceId:0,seed:0,version:0,width:3,height:3,biomes:new Uint8Array(9).fill(MAP_BIOME_IDS.indexOf('plains')),blocked:new Uint8Array(9),horseJumpableTerrain:new Uint8Array(9),elevations:new Int16Array(9),dirtCliffRoles:new Uint8Array(9),dirtTerraces:new Uint8Array(9),surfaceFamilies:new Uint8Array(9)};
}
export function blobLayerBaselineOutputs(): Readonly<Record<string, unknown>> {
  const result: Record<string,unknown> = {};
  result.farmland = Array.from({length:256},(_,mask)=>{
    const t=base(); const a=new Uint8Array(9);a[4]=1;
    blobOffsets.forEach(([x,y],i)=>{if(mask&(1<<i))a[(y+1)*3+x+1]=1;});
    return authoredFarmlandGroundLayersAt({...t,authoredFarmland:a},1,1);
  });
  for(const family of ['grass_1','grass_2','grass_3','grass_4'] as const) {
    for(const own of ['beach','paving','grass_1','grass_2','grass_3','grass_4'] as const) {
      result[`${family}/${own}`]=Array.from({length:256},(_,mask)=>{
        const t=base();t.biomes.fill(MAP_BIOME_IDS.indexOf('water'));
        t.biomes[4]=MAP_BIOME_IDS.indexOf(own.startsWith('grass_')?'plains':own as 'beach'|'paving');
        t.surfaceFamilies![4]=own.startsWith('grass_')?surfaceFamilyIndex(own as TerrainSurfaceFamilyId):0;
        blobOffsets.forEach(([x,y],i)=>{if(mask&(1<<i)){const at=(y+1)*3+x+1;t.biomes[at]=MAP_BIOME_IDS.indexOf('plains');t.surfaceFamilies![at]=surfaceFamilyIndex(family);}});
        return authoredGrassFringeLayersAt(t,1,1);
      });
    }
  }
  // Mixed families, distinct heights, edge clipping, and non-vegetated centres.
  let state=19371;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
  result.mixed=Array.from({length:512},()=>{
    const t=base();for(let i=0;i<9;i++){t.biomes[i]=MAP_BIOME_IDS.indexOf((['plains','forest','beach','paving','water'] as const)[random()%5]!);t.surfaceFamilies![i]=random()%5;t.elevations[i]=random()%3;}
    return Array.from({length:9},(_,i)=>authoredGrassFringeLayersAt(t,i%3,Math.floor(i/3)));
  });
  return result;
}
