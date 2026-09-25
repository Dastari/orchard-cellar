import {
  SURVIVAL_BIOMES, TERRAIN_MATERIAL_DEFINITIONS, resolvedMapCellAt, terrainDocumentForMapV3,
  mapDocumentUsesSurvivalIslandBase, survivalBiomeAt, survivalBiomeAllowsHorseJump,
  survivalDirtTerraceAt, survivalDirtCliffRoleAt, SURVIVAL_DIRT_CLIFF_ROLES, surfaceFamilyIndex,
  type CellPart, type MapDocumentV3, type MapSurfaceKind, type SurvivalBiome,
} from '@orchard/sim';
import type { TerrainArray } from '@orchard/engine/terrain';
import { mapGeneratedBaseTerrainKey } from './editor-terrain-derivatives.js';

const surfaceBiome = (surface: MapSurfaceKind): SurvivalBiome => surface==='water'?'freshwater'
  :surface==='sand'?'beach':surface==='stone'||surface==='cave_floor'?'highland':surface==='dirt'?'dirt_terrace':'plains';

/** Copy-on-write visual channels. Shared semantic resolution owns tile rules;
 * this path only replaces changed cells and never mutates the generator cache. */
export function patchMapEditorTerrain(previous: TerrainArray, before: MapDocumentV3, after: MapDocumentV3):
  {terrain:TerrainArray; changed:readonly {tileX:number;tileY:number}[]}|null {
  if(before.id!==after.id || mapGeneratedBaseTerrainKey(before)!==mapGeneratedBaseTerrainKey(after)
    ||JSON.stringify(before.transitions)!==JSON.stringify(after.transitions)
    ||JSON.stringify(before.stairRuns)!==JSON.stringify(after.stairRuns))return null;
  const keys=[...new Set([...Object.keys(before.cells),...Object.keys(after.cells)])]
    .filter(key=>JSON.stringify(before.cells[key])!==JSON.stringify(after.cells[key]));
  if(keys.length>4096)return null;
  const changed=keys.map(key=>{const [x,y]=key.split(',');return {tileX:Number(x),tileY:Number(y)};});
  const length=previous.width*previous.height, doc=terrainDocumentForMapV3(after);
  const elevations=previous.elevations.slice(),biomes=previous.biomes.slice(),blocked=previous.blocked.slice();
  const horseJumpableTerrain=previous.horseJumpableTerrain.slice(), dirtTerraces=previous.dirtTerraces.slice(),dirtCliffRoles=previous.dirtCliffRoles.slice();
  const familyIds=[...(previous.cliffFamilyIds??[after.defaultCliffFamily??'stone_1'])];
  const cliffFamilies=previous.cliffFamilies?.slice()??new Uint8Array(length).fill(1);
  const surfaceFamilies=previous.surfaceFamilies?.slice()??new Uint8Array(length).fill(surfaceFamilyIndex(after.defaultSurfaceFamily??'grass_1'));
  const terrainOverrides=[...(previous.terrainOverrides??Array(length).fill(null))];
  const ledges=previous.ledges?.slice()??new Uint8Array(length);
  const authoredSurfaces=previous.authoredSurfaces?.slice()??Array.from(previous.biomes,index=>{
    const biome=SURVIVAL_BIOMES[index];
    return (biome==='water'||biome==='freshwater'||biome==='waterfall'||biome==='oasis_water'?'water'
      :biome==='beach'||biome==='desert_shore'?'sand'
      :biome==='highland'||biome==='ridge'||biome==='desert_ridge'||biome==='coastal_cliff'?'stone'
      :biome==='dirt_terrace'||biome==='dirt_ridge'?'dirt':'grass') as MapSurfaceKind;
  });
  let authoredFarmland=previous.authoredFarmland?.slice();
  let cellParts:Map<number,readonly CellPart[]>|undefined=previous.cellParts===undefined?undefined:new Map(previous.cellParts);
  const generated=mapDocumentUsesSurvivalIslandBase(after);
  for(const {tileX,tileY} of changed) {
    const index=tileY*previous.width+tileX,key=`${tileX},${tileY}`,cell=resolvedMapCellAt(doc,tileX,tileY);
    const semantic=after.cells[key], authored=doc.cells[key];
    const surface=cell.feature==='river'?'water':cell.feature==='path'?'dirt':cell.surface;
    const hasSurface=authored?.surface!==undefined||authored?.feature!==undefined;
    const biome=semantic?.biome??(hasSurface?surfaceBiome(surface):generated?survivalBiomeAt(previous.seed,tileX,tileY):after.baseBiome??surfaceBiome(surface));
    elevations[index]=cell.elevation;biomes[index]=Math.max(0,SURVIVAL_BIOMES.indexOf(biome));
    blocked[index]=cell.collision==='force_block'||(cell.collision!=='force_walk'&&(cell.ledge||!TERRAIN_MATERIAL_DEFINITIONS[cell.surface].walkable||cell.feature==='river'))?1:0;
    horseJumpableTerrain[index]=survivalBiomeAllowsHorseJump(biome)?1:0;
    if(!familyIds.includes(cell.cliffFamily))familyIds.push(cell.cliffFamily);
    if(familyIds.length>255)return null;
    cliffFamilies[index]=familyIds.indexOf(cell.cliffFamily)+1;surfaceFamilies[index]=surfaceFamilyIndex(cell.surfaceFamily);
    terrainOverrides[index]=cell.terrainOverride;ledges[index]=Number(cell.ledge);
    if(cell.parts.length>0)(cellParts??=new Map()).set(index,cell.parts);else cellParts?.delete(index);
    if(authoredSurfaces)authoredSurfaces[index]=cell.surface;
    if(cell.feature==='farmland')authoredFarmland??=new Uint8Array(length);
    if(authoredFarmland)authoredFarmland[index]=Number(cell.feature==='farmland');
    dirtTerraces[index]=generated?Number(survivalDirtTerraceAt(previous.seed,tileX,tileY)):0;
    dirtCliffRoles[index]=generated?SURVIVAL_DIRT_CLIFF_ROLES.indexOf(survivalDirtCliffRoleAt(previous.seed,tileX,tileY)):0;
    if(hasSurface||semantic?.biome!==undefined){dirtTerraces[index]=0;dirtCliffRoles[index]=0;}
    if(surface==='dirt')dirtTerraces[index]=1;
  }
  return {changed,terrain:{...previous,version:after.revision,elevations,biomes,blocked,horseJumpableTerrain,dirtTerraces,dirtCliffRoles,
    cliffFamilies,cliffFamilyIds:familyIds,surfaceFamilies,terrainOverrides,ledges,
    ...(authoredSurfaces?{authoredSurfaces}:{}),...(authoredFarmland?{authoredFarmland}:{}),...(cellParts?{cellParts}:{}),raisedTerrainCollisionClassified:true}};
}
