/** Deliberate room programmes, not random furnishing density. Native tile units. */
import {readFileSync,writeFileSync} from 'node:fs';
import {bootstrapContentRegistry,HEARTH_INTERIORS} from '@orchard/sim';
type Bounds=readonly[number,number,number,number];
type Fixture=readonly[string,number,number,number?];
interface Design { rooms:Bounds[]; fixtures:Fixture[]; windows:readonly (readonly[number,number])[]; floors?:{bounds:Bounds;style:'townhouse'|'stone'|'soil'}[] }
const f=(kind:string,x:number,y:number,support?:number):Fixture=>support===undefined?[kind,x,y]:[kind,x,y,support];
const r=(kind:string,x:number,y:number)=>f(`furniture_rustic_${kind}`,x,y);
const t=(kind:string,x:number,y:number)=>f(`furniture_townhouse_${kind}`,x,y);
const hall:Bounds[]=[[14,8,17,27],[11,9,21,10],[11,22,21,23],[13,8,13,12]];
const wings:Bounds[]=[[7,5,12,11],[20,5,25,11],[7,18,12,24],[20,18,25,24],...hall];
const kitchen=(x:number,y:number):Fixture[]=>[r('cooking_range',x,y),r('cupboard',x+2,y),t('washstand',x,y+2),r('dining_table',x+2,y+4),r('chair',x+1,y+5),r('chair',x+4,y+5)];
const sitting=(x:number,y:number):Fixture[]=>[t('loveseat',x,y),t('floor_lamp',x+3,y),t('patterned_rug',x+2,y+4),t('armchair',x+4,y+3),t('side_table',x+1,y+3),r('potted_fern',x+4,y+6)];
const bedroom=(x:number,y:number):Fixture[]=>[t('bed',x,y+1),t('wardrobe',x+3,y),r('runner',x,y+3),t('floor_lamp',x+5,y+2),r('writing_table',x+3,y+5),r('stool',x+3,y+6)];
const bath=(x:number,y:number):Fixture[]=>[t('washstand',x,y),t('wall_mirror',x,y+1),t('bath',x+3,y),t('round_rug',x+2,y+3),t('cabinet',x,y+5),t('flower_planter',x+4,y+5)];
export const WILLOW_INTERIOR_DESIGNS:Record<string,Design>={
 'garden-cottage':{rooms:wings,fixtures:[...sitting(7,5),...bath(20,5),...kitchen(7,18),...bedroom(20,18)],windows:[[9,5],[24,5],[11,18],[22,18]],floors:[{bounds:[7,5,12,11],style:'townhouse'},{bounds:[20,5,25,11],style:'stone'},{bounds:[20,18,25,24],style:'townhouse'}]},
 'orchard-cottage':{rooms:wings,fixtures:[...kitchen(7,5),...sitting(20,5),r('bed',7,19),r('cupboard',10,18),r('runner',7,21),r('writing_table',10,23),r('stool',10,24),r('standing_lamp',9,18),...bath(20,18)],windows:[[11,5],[22,5],[8,18],[24,18]],floors:[{bounds:[20,18,25,24],style:'stone'}]},
 inn:{rooms:[[6,5,10,11],[13,5,17,11],[21,5,26,11],[6,18,26,24],...hall],fixtures:[
  r('bed',6,6),r('cupboard',8,5),r('runner',6,8),r('standing_lamp',10,5),r('writing_table',8,10),r('stool',8,11),
  r('bed',21,6),r('cupboard',24,5),r('runner',21,8),r('standing_lamp',23,5),r('writing_table',24,10),r('stool',24,11),
  r('cooking_range',15,5),t('washstand',16,5),r('writing_table',14,8),
  r('hearth',6,18),r('cupboard',24,18),r('potted_fern',6,24),r('potted_fern',26,24),
  r('woven_rug',9,23),r('dining_table',9,21),r('chair',7,22),r('chair',11,22),
  r('woven_rug',23,23),r('dining_table',23,21),r('chair',21,22),r('chair',25,22),r('standing_lamp',12,18),r('standing_lamp',20,18)],windows:[[7,5],[22,5],[10,18],[22,18]],floors:[{bounds:[13,5,17,7],style:'stone'}]},
 carpenter:{rooms:[[6,5,12,11],[20,5,26,11],[6,18,12,24],[20,18,26,24],...hall],fixtures:[
  f('workbench',9,7),r('cupboard',6,5),r('bench',9,10),r('standing_lamp',12,5),
  r('writing_table',21,5),r('stool',21,6),r('bookshelf',25,5),r('potted_fern',25,11),
  f('workbench',9,20),r('bench',7,23),r('standing_lamp',12,18),
  r('woven_rug',23,22),r('dining_table',23,21),r('chair',21,22),r('chair',25,22),r('cupboard',20,18),r('potted_fern',26,18)],windows:[[10,5],[23,5],[10,18],[24,18]]},
 furnisher:{rooms:[[6,5,12,11],[21,5,27,11],[6,18,12,24],[21,18,27,24],...hall],fixtures:[
  r('bed',6,6),r('cupboard',9,5),r('runner',6,8),r('standing_lamp',8,5),r('writing_table',9,10),r('stool',9,11),
  t('dining_table',24,8),f('furniture_townhouse_table_lamp',24,7,6),t('chair',22,9),t('chair',26,9),t('cabinet',21,5),t('flower_planter',27,5),
  ...sitting(6,18),...bedroom(21,18)],windows:[[7,5],[25,5],[8,18],[23,18]],floors:[{bounds:[6,18,12,24],style:'townhouse'},{bounds:[21,18,27,24],style:'townhouse'}]},
 'general-store':{rooms:[[6,5,26,11],[6,18,12,24],[20,18,26,24],...hall],fixtures:[
  r('cupboard',6,5),t('cabinet',9,5),r('cupboard',21,5),t('cabinet',24,5),r('writing_table',14,8),
  f('barrel',7,8),f('barrel',9,8),f('barrel',23,8),f('barrel',25,8),r('standing_lamp',19,5),
  r('cupboard',6,18),r('cupboard',9,18),f('barrel',7,21),f('barrel',10,21),f('barrel',7,23),
  r('writing_table',21,18),r('stool',21,19),t('loveseat',23,22),r('potted_fern',26,18),r('standing_lamp',20,24)],windows:[[12,5],[18,5],[11,18],[24,18]]},
 greenhouse:{rooms:[[7,8,25,22],[14,22,17,27]],fixtures:[
  r('writing_table',8,8),t('washstand',21,8),r('standing_lamp',12,8),r('standing_lamp',20,8),
  ...[12,15,18].flatMap(y=>[f('farm_potted_flowers',9,y),r('potted_fern',11,y),t('flower_planter',21,y),f('farm_potted_flowers',23,y)]),
  r('potted_fern',7,22),r('potted_fern',25,22)],windows:[[11,8],[16,8],[24,8]],floors:[{bounds:[8,11,12,19],style:'soil'},{bounds:[20,11,24,19],style:'soil'}]},
 barn:{rooms:[[8,8,25,20],[14,20,17,27]],fixtures:[
  ...[[9,10],[12,10],[9,13],[12,13],[9,16],[12,16]].map(([x,y])=>f('farm_hay_stack',x!,y!)),
  f('farm_hay_bale',9,19),f('farm_hay_bale',12,19),f('workbench',23,10),f('workbench',23,17),
  f('barrel',21,13),f('barrel',24,13),f('barrel',21,19),f('barrel',24,19),r('bench',22,14),r('standing_lamp',13,8),r('standing_lamp',19,8)],windows:[[10,8],[23,8]]},
 guild:{rooms:[[6,5,12,11],[20,5,26,11],[6,18,12,24],[20,18,26,24],...hall],fixtures:[
  ...[6,8,10].map(x=>r('bookshelf',x,5)),r('woven_rug',9,10),r('writing_table',8,8),r('stool',8,9),r('standing_lamp',12,5),
  ...[20,22,24].map(x=>r('bookshelf',x,5)),r('woven_rug',23,10),r('writing_table',22,8),r('stool',22,9),r('standing_lamp',26,5),
  r('writing_table',7,18),r('stool',7,19),r('cupboard',10,18),r('potted_fern',6,24),
  t('loveseat',20,18),t('patterned_rug',23,22),t('armchair',25,21),t('side_table',22,21),t('floor_lamp',26,18),r('potted_fern',26,24)],windows:[[7,5],[21,5],[9,18],[23,18]]},
 smith:{rooms:[[6,5,12,11],[20,5,26,11],[6,18,26,24],...hall],fixtures:[
  r('cupboard',6,5),r('writing_table',10,8),r('standing_lamp',12,5),
  r('writing_table',21,5),r('stool',21,6),r('cupboard',24,5),r('bench',22,10),
  r('hearth',6,18),r('hearth',23,18),f('anvil',9,21),f('workbench',22,21),
  f('barrel',6,23),f('barrel',25,23),r('standing_lamp',13,18),r('standing_lamp',19,18)],windows:[[10,5],[23,5]],floors:[{bounds:[6,18,26,24],style:'stone'}]},
};
const fingerprint=(asset:string)=>{let hash=2166136261;for(const c of asset){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}return ((hash>>>4)%1296).toString(36).padStart(2,'0');};
export function writeWillowInteriorDesigns(){
 const path='packages/assets/content/spaces.json',spaces=JSON.parse(readFileSync(path,'utf8'));
 const registry=bootstrapContentRegistry();
 for(const interior of HEARTH_INTERIORS){
  const design=WILLOW_INTERIOR_DESIGNS[interior.kind]!,space=spaces.find((s:{spaceId:number})=>s.spaceId===interior.spaceId);
  if(['garden-cottage','orchard-cottage','furnisher','guild','carpenter'].includes(interior.kind)) {
    design.rooms=design.rooms.map(b=>b[0]<13&&b[2]===12?[b[0],b[1],11,b[3]]:b);
    design.fixtures=design.fixtures.map(item=>item[1]===12?f(item[0],11,item[2],item[3]):item);
  }
  space.hearthInterior[1]=design.rooms.map(b=>b.map(n=>n.toString(36)).join('')).join(';');
  space.hearthInterior[2]=design.fixtures.map(([kind,x,y,support])=>{
   const old=interior.furniture.find(f=>f.kind===kind&&(f.halfWidth||f.depth))??HEARTH_INTERIORS.flatMap(i=>i.furniture).find(f=>f.kind===kind&&(f.halfWidth||f.depth));
   const object=registry.objects.get(`object:${kind}`)??(old?registry.objects.get(old.definitionId):undefined)
     ??[...registry.objects.values()].find(o=>o.components.sprite?.asset===`prop_cf_${kind}`);
   if(!object?.components.sprite)throw new Error(`No native definition for ${kind}`);
   const token=fingerprint(object.components.sprite.asset)+x.toString(36)+y.toString(36);
   if(support!==undefined)return token+'-'+(support+1).toString(36);
   if(old&&(old.halfWidth||old.depth))return token+old.halfWidth.toString(36)+old.depth.toString(36)+'!'+kind;
   return token;
  }).join(';');
  space.hearthInteriorFloors=design.floors??[];space.hearthInteriorWindows=design.windows;
 }
 writeFileSync(path,JSON.stringify(spaces,null,2)+'\n');
}
if(process.argv[1]?.endsWith('willowharbour-interior-design.ts'))writeWillowInteriorDesigns();
