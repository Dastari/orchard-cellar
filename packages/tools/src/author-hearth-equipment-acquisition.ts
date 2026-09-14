/** Local deterministic catalogue authoring only; never publishes content. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseItemDefinition,parseContentDefinition,parseDialogueDefinition} from '@orchard/sim';
import {buildHearthEquipmentAcquisition} from './hearth-equipment-acquisition.js';
const directory=resolve(import.meta.dirname,'../../assets/content');
const read=async(name:string)=>JSON.parse(await readFile(resolve(directory,`${name}.json`),'utf8')) as {id:string;[key:string]:unknown}[];
const items=await read('items'),recipes=await read('recipes'),shops=await read('shops'),npcs=await read('npcs');
const pack=buildHearthEquipmentAcquisition(new Map(items.map(raw=>{const item=parseItemDefinition(raw);return [item.id,item];})));
const merge=(existing:{id:string}[],additions:readonly {id:string}[])=>{
 const ids=new Set(additions.map(row=>row.id));
 return [...existing.filter(row=>!ids.has(row.id)),...additions].sort((a,b)=>a.id.localeCompare(b.id));
};
if(!shops.some(shop=>shop.id==='shop:willow_archivist'))shops.push({id:'shop:willow_archivist',kind:'shop',schemaVersion:1,currency:{kind:'bronze'},offers:[]});
if(!npcs.some(npc=>npc.id==='npc:willow_archivist'))throw new Error('missing_willow_archivist');
const nextNpcs=npcs.map(npc=>npc.id==='npc:willow_archivist'?{...npc,shop:'shop:willow_archivist'}:npc);
const dialogues=(await read('dialogues')).map(parseDialogueDefinition);
if(!dialogues.some(dialogue=>dialogue.id==='dialogue:willow_archivist'))throw new Error('missing_archivist_dialogue');
const nextDialogues=dialogues.map(dialogue=>{
 if(dialogue.id!=='dialogue:willow_archivist')return dialogue;
 return {...dialogue,shop:'shop:willow_archivist',nodes:[...dialogue.nodes.filter(node=>node.id!=='equipment_plans'&&node.id!=='shop').map(node=>
  node.id===dialogue.initialNodeId?{...node,choices:[
   {id:'equipment_plans',label:'Show me your utility equipment plans.',nextNodeId:'shop'},
   ...node.choices.filter(choice=>choice.id!=='equipment_plans'),
  ]}:node),{
   id:'shop',speaker:'Iona',body:'These plans suit a peaceful trade. Each pendant uses iron, wood and fibre; no volcanic materials are needed.',
   mode:'shop',frameId:'frame:shop',choices:[{id:'back',label:'Back to our conversation.',nextNodeId:dialogue.initialNodeId}],
  }]};
});
const nextShops=shops.map(shop=>{
 const plans=shop.id==='shop:willow_smith'?pack.smithPlans:shop.id==='shop:willow_archivist'?pack.guildPlans:[];
 if(!plans.length)return shop;
 const offers=shop.offers as {item:string}[];
 return {...shop,offers:[...offers.filter(offer=>!plans.includes(offer.item)),...plans.map(item=>({item}))]};
});
for(const [name,rows] of [['items',merge(items,pack.plans)],['recipes',merge(recipes,pack.recipes)],['shops',nextShops.sort((a,b)=>a.id.localeCompare(b.id))],['npcs',nextNpcs],['dialogues',nextDialogues]] as const){
 await writeFile(resolve(directory,`${name}.json`),JSON.stringify(rows.map(row=>parseContentDefinition(name==='items'?'item':name==='recipes'?'recipe':name==='shops'?'shop':name==='dialogues'?'dialogue':'npc',row)),null,2)+'\n');
}
console.log(JSON.stringify({recipes:pack.recipes.length,plans:pack.plans.length,legendaryUnlocks:pack.legendaryRecipes.length}));
