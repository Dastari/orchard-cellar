import { isNaturalObjectProjection } from './content/natural-object.js';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import {BOOTSTRAP_SPACE_DEFINITIONS} from './content/bootstrap-spaces.js';
import type {ContentRegistry} from './content/registry.js';
import {hearthFurnitureObstacle,type HearthFurniturePlacement} from './hearth-furniture-placement.js';
import {hearthFurnitureShapeForPlaceable} from './hearth-furniture-state.js';
import {FIXED_UNITS_PER_PIXEL,type CollisionMap} from './state.js';

export type HearthInteriorKind='inn'|'general-store'|'carpenter'|'furnisher'|'smith'|'guild'|'garden-cottage'|'orchard-cottage'|'barn'|'greenhouse';
export interface HearthInteriorFurniture {
  readonly id:string;readonly kind:string;readonly definitionId:`object:${string}`;
  readonly tileX:number;readonly tileY:number;readonly halfWidth:number;readonly depth:number;
  readonly supportId?:string;readonly objectTag?:string;
}
export interface HearthInterior {
  readonly kind:HearthInteriorKind;readonly spaceId:number;readonly name:string;readonly sizeTiles:number;
  readonly rooms:readonly (readonly [number,number,number,number])[];
  readonly furniture:readonly HearthInteriorFurniture[];
  readonly arrival:{readonly tileX:number;readonly tileY:number};
  readonly exit:{readonly tileX:number;readonly tileY:number};
  readonly service:{readonly tileX:number;readonly tileY:number};
  readonly approach:{readonly tileX:number;readonly tileY:number};
}

const activeInteriorCatalog=(registry:ContentRegistry)=>{
  const owners=[...registry.spaces.values()].filter(space=>space.retired!==true&&space.hearthInteriorCatalog!==undefined);
  return owners.length===1?owners[0]!.hearthInteriorCatalog!:null;
};
const artFingerprint=(asset:string)=>{
  let hash=2166136261;
  for(const character of asset){hash^=character.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return ((hash>>>4)%1296).toString(36).padStart(2,'0');
};
const objectForArt=(registry:ContentRegistry,fingerprint:string,presentation?:string)=>{
  const matches=[...registry.objects.values()].filter(object=>object.retired!==true&&!isNaturalObjectProjection(object)
    &&object.components.sprite!==undefined&&artFingerprint(object.components.sprite.asset)===fingerprint);
  if(matches.length===1)return matches[0]!;
  const exact=presentation===undefined?[]:matches.filter(object=>object.components.sprite?.asset===`prop_cf_${presentation}`);
  return exact.length===1?exact[0]!:null;
};
const fixtureTag=(tags:readonly string[]|undefined)=>{
  const matches=tags?.filter(tag=>tag.startsWith('station.')||tag==='container.barrel')??[];
  return matches.length===1?matches[0]:undefined;
};
const number36=(value:string)=>Number.parseInt(value,36);
const numbers=(value:string)=>[...value].map(number36);
const KINDS={i:'inn',g:'general-store',c:'carpenter',f:'furnisher',s:'smith',u:'guild',h:'garden-cottage',o:'orchard-cottage',b:'barn',p:'greenhouse'} as const;

export function runtimeHearthInteriorForSpace(registry:ContentRegistry,spaceId:number):HearthInterior|null{
  const catalog=activeInteriorCatalog(registry);
  const spaces=[...registry.spaces.values()].filter(space=>space.retired!==true&&space.spaceId===spaceId);
  if(catalog===null||spaces.length!==1)return null;
  const space=spaces[0]!,authored=space.hearthInterior;
  if(space.generator!=='village_interior'||authored===undefined)return null;
  const [arrivalX,arrivalY,exitX,exitY,defaultServiceX,defaultServiceY,defaultApproachX,defaultApproachY]=catalog;
  const [kindCode,roomList,itemList,override]=authored,kind=KINDS[kindCode];
  const rooms=roomList.split(';').map(room=>[...room].map(number36) as [number,number,number,number]);
  const items=itemList.split(';').map(item=>{
    const fixed=item.length>=6&&!item.slice(4).startsWith('-'),support=item.slice(4).startsWith('-');
    const mark=item.indexOf('!');
    return [item.slice(0,2),number36(item[2]!),number36(item[3]!),
      ...(support?[-number36(item.slice(5))]:fixed?[number36(item[4]!),number36(item[5]!)]:[]),
      ...(mark<0?[]:[item.slice(mark+1)])] as [string,number,number,number?,number?,string?];
  });
  const furniture:HearthInteriorFurniture[]=[];
  for(const [index,item] of items.entries()){
    const [fingerprint,tileX,tileY,fourth,fifth,presentation]=item;
    const object=objectForArt(registry,String(fingerprint),presentation);
    if(object===null)return null;
    const asset=object.components.sprite?.asset;
    if(asset===undefined||!asset.startsWith('prop_cf_'))return null;
    const fixed=item.length>=5,itemKind=presentation??asset.slice('prop_cf_'.length);
    const objectTag=fixed?fixtureTag(object.components.identity?.tags):undefined;
    if(fixed&&presentation===undefined&&objectTag===undefined)return null;
    const supportIndex=item.length===4&&fourth!==undefined&&fourth<0?-fourth-1:undefined;
    if((item.length===4&&supportIndex===undefined)||(supportIndex!==undefined&&supportIndex>=index))return null;
    const supportId=supportIndex===undefined?undefined:furniture[supportIndex]?.id;
    if(supportIndex!==undefined&&supportId===undefined)return null;
    const halfWidth=fixed?fourth!:0,depth=fixed?fifth!:0,id=`${itemKind}:${tileX}:${tileY}`;
    if(furniture.some(existing=>existing.id===id))return null;
    furniture.push({id,kind:itemKind,definitionId:object.id,tileX,tileY,halfWidth,depth,
      ...(supportId===undefined?{}:{supportId}),...(objectTag===undefined?{}:{objectTag})});
  }
  const [serviceX,serviceY,approachX,approachY]=override===undefined
    ?[defaultServiceX,defaultServiceY,defaultApproachX,defaultApproachY]
    :numbers(override) as [number,number,number,number];
  return {kind,spaceId,name:space.name,sizeTiles:space.sizeTiles,rooms,furniture,
    arrival:{tileX:arrivalX,tileY:arrivalY},exit:{tileX:exitX,tileY:exitY},
    service:{tileX:serviceX,tileY:serviceY},approach:{tileX:approachX,tileY:approachY}};
}

export function activeHearthInteriors(registry:ContentRegistry):readonly HearthInterior[]{
  return [...registry.spaces.values()].filter(space=>space.retired!==true&&space.hearthInterior!==undefined)
    .map(space=>runtimeHearthInteriorForSpace(registry,space.spaceId)).filter((entry):entry is HearthInterior=>entry!==null);
}
const bootstrapCatalog=BOOTSTRAP_SPACE_DEFINITIONS.find(space=>space.retired!==true
  &&space.hearthInteriorCatalog!==undefined)?.hearthInteriorCatalog;
if(bootstrapCatalog===undefined)throw new Error('bootstrap_hearth_interior_catalog_invalid');
let bootstrapInteriors:readonly HearthInterior[]|null=null;
const readBootstrapInteriors=()=>bootstrapInteriors??=activeHearthInteriors(bootstrapContentRegistry());
export const HEARTH_INTERIORS:readonly HearthInterior[]=new Proxy(
  [] as HearthInterior[],
  {get:(_target,key)=>{
    const rows=readBootstrapInteriors(),value=Reflect.get(rows,key,rows);
    return typeof value==='function'?value.bind(rows):value;
  }},
);
export const HEARTH_INTERIOR_SIZE=BOOTSTRAP_SPACE_DEFINITIONS.find(space=>space.retired!==true
  &&space.generator==='village_interior'&&space.hearthInterior!==undefined)?.sizeTiles??32;
export const HEARTH_INTERIOR_ARRIVAL={tileX:bootstrapCatalog[0],tileY:bootstrapCatalog[1]} as const;
export const HEARTH_INTERIOR_EXIT={tileX:bootstrapCatalog[2],tileY:bootstrapCatalog[3]} as const;

export function hearthInteriorForSpace(spaceId:number):HearthInterior|undefined;
export function hearthInteriorForSpace(registry:ContentRegistry,spaceId:number):HearthInterior|null;
export function hearthInteriorForSpace(registryOrSpaceId:ContentRegistry|number,spaceId?:number):HearthInterior|null|undefined{
  return typeof registryOrSpaceId==='number'?HEARTH_INTERIORS.find(interior=>interior.spaceId===registryOrSpaceId)
    :runtimeHearthInteriorForSpace(registryOrSpaceId,spaceId!);
}
export function hearthInteriorNativePlacements(interior:HearthInterior):readonly HearthFurniturePlacement[];
export function hearthInteriorNativePlacements(registry:ContentRegistry,interior:HearthInterior):readonly HearthFurniturePlacement[];
export function hearthInteriorNativePlacements(registryOrInterior:ContentRegistry|HearthInterior,maybeInterior?:HearthInterior):readonly HearthFurniturePlacement[]{
  const registry=maybeInterior===undefined?bootstrapContentRegistry():registryOrInterior as ContentRegistry;
  const interior=maybeInterior??registryOrInterior as HearthInterior;
  return interior.furniture.flatMap(item=>{
    const shape=hearthFurnitureShapeForPlaceable(registry,{kind:item.kind,definitionId:item.definitionId});
    return shape?[{id:item.id,shape,tileX:item.tileX,tileY:item.tileY,...(item.supportId?{supportId:item.supportId}:{})}]:[];
  });
}
export function hearthInteriorFurnitureObstacles(interior:HearthInterior):readonly ReturnType<typeof hearthFurnitureObstacle>[];
export function hearthInteriorFurnitureObstacles(registry:ContentRegistry,interior:HearthInterior):readonly NonNullable<ReturnType<typeof hearthFurnitureObstacle>>[];
export function hearthInteriorFurnitureObstacles(registryOrInterior:ContentRegistry|HearthInterior,maybeInterior?:HearthInterior){
  const registry=maybeInterior===undefined?bootstrapContentRegistry():registryOrInterior as ContentRegistry;
  const interior=maybeInterior??registryOrInterior as HearthInterior;
  return interior.furniture.flatMap(item=>{
    const shape=hearthFurnitureShapeForPlaceable(registry,{kind:item.kind,definitionId:item.definitionId});
    if(shape){const obstacle=hearthFurnitureObstacle({id:item.id,shape,tileX:item.tileX,tileY:item.tileY});return obstacle?[obstacle]:[];}
    const x=item.tileX*16+8,y=item.tileY*16;
    return [{left:(x-item.halfWidth)*FIXED_UNITS_PER_PIXEL,right:(x+item.halfWidth)*FIXED_UNITS_PER_PIXEL-1,
      top:(y-item.depth)*FIXED_UNITS_PER_PIXEL,bottom:y*FIXED_UNITS_PER_PIXEL-1}];
  });
}
const collisionFor=(interior:HearthInterior,registry:ContentRegistry=bootstrapContentRegistry()):CollisionMap=>{
  const width=interior.sizeTiles,blocked=new Uint8Array(width*width).fill(1);
  for(const [left,top,right,bottom] of interior.rooms)
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)blocked[y*width+x]=0;
  return {width,height:width,blocked,elevations:new Int16Array(width*width),obstacles:hearthInteriorFurnitureObstacles(registry,interior)};
};
export function hearthInteriorCollision(spaceId:number):CollisionMap;
export function hearthInteriorCollision(registry:ContentRegistry,spaceId:number):CollisionMap|null;
export function hearthInteriorCollision(registryOrSpaceId:ContentRegistry|number,spaceId?:number):CollisionMap|null{
  const interior=typeof registryOrSpaceId==='number'?hearthInteriorForSpace(registryOrSpaceId)
    :runtimeHearthInteriorForSpace(registryOrSpaceId,spaceId!);
  if(!interior){
    if(typeof registryOrSpaceId==='number')throw new Error(`Unknown village interior: ${registryOrSpaceId}`);
    return null;
  }
  return collisionFor(interior,typeof registryOrSpaceId==='number'?bootstrapContentRegistry():registryOrSpaceId);
}
