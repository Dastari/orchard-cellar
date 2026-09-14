import {terrainElevationAtWorldFoot,type TerrainArray} from './terrain.js';
import type {PointLight} from './lighting.js';
/** Source pixels may move sideways under rotation; plane sampling stays at the
 * physical parent contact, independently of the flame/bulb's visual position. */
export function projectPointLightToTerrain(light:PointLight,terrain:TerrainArray,
  projectionAt:(x:number,y:number)=>number,terrainSampleY?:number,terrainSampleX?:number):PointLight{
  const x=terrainSampleX??light.worldX,y=terrainSampleY??light.receiverDirectionWorldY??light.worldY;
  const projection=projectionAt(x,y);
  return {...light,worldY:light.worldY-projection,elevationLayer:terrainElevationAtWorldFoot(terrain,x,y),
    ...(light.receiverDirectionWorldY===undefined?{}:{receiverDirectionWorldY:light.receiverDirectionWorldY-projection})};
}
