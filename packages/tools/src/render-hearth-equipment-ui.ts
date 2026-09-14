/** Offline native gameplay UI study; no authority connection or publication. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';
import { decodePng } from './assets/png.js';
const root=resolve(import.meta.dirname,'../../..');
const danger=process.argv.find(arg=>arg.startsWith('--danger='))?.slice(9)??'';
const seals=process.argv.find(arg=>arg.startsWith('--seals='))?.slice(8)??'';
const orders=process.argv.includes('--orders')||process.argv.includes('--orders-review')||process.argv.includes('--orders-pending');
const orderReview=process.argv.includes('--orders-review')||process.argv.includes('--orders-pending');
const orderPending=process.argv.includes('--orders-pending');
const expeditionContract=process.argv.includes('--prepare-contract')?'prepare':process.argv.includes('--outpost-contract')?'outpost':process.argv.includes('--basalt-contract')?'basalt':'';
const furnishContract=process.argv.includes('--furnish-contract');
const intro=process.argv.includes('--intro')||furnishContract||expeditionContract!==''||orders;
const rowan=process.argv.includes('--rowan')||furnishContract;
const skills=process.argv.includes('--skills');
const rewards=process.argv.includes('--rewards');
const stash=process.argv.includes('--stash');
const ferry=process.argv.includes('--ferry');
const compact=process.argv.includes('--compact');
const furniture=process.argv.includes('--furniture');
const expansion=process.argv.includes('--expansion');
const constructionReview=process.argv.includes('--construction-review');
const construction=process.argv.includes('--construction')||constructionReview;
const furnishing=process.argv.includes('--furnishing')||expansion||construction;
const seating=process.argv.includes('--seating');
const rewardState=process.argv.includes('--full-bags')?'full-bags':process.argv.includes('--delve')?'delve':'ready';
const output=resolve(root,process.argv.slice(2).find(argument=>!argument.startsWith('--'))
 ?? `output/doc60/equipment-${stash?'stash':ferry?'ferry':rewards?'rewards':skills?'skills':'inventory'}.png`);
const settings={width:(furnishing||orders||seals||(danger&&!compact))?960:compact?1080:1440,height:(furnishing||orders||seals||(danger&&!compact))?540:810,uiWidth:(furnishing||orders||seals||(danger&&!compact))?320:compact?360:480,uiHeight:(furnishing||orders||seals||(danger&&!compact))?180:270,scale:3,danger,seals,skills,rewards,rewardState,ferry,stash,furniture,furnishing,seating,expansion,construction,constructionReview,intro,rowan,furnishContract,expeditionContract,orders,orderReview,orderPending};
const scene=`
import { villageOrders,villageOrderQuote,bootstrapContentRegistry,hearthFurnitureDefinition,compileEquipmentLoadout,MAIN_HAND_INVENTORY_SLOT } from '/packages/sim/src/index.ts';
import { HomesteadBuildPalette,homesteadBuildPaletteCells,constructionToolRect } from '/packages/ui/src/homestead-build-palette.ts';
import { NpcInteractionUi,npcInteractionLayout } from '/packages/ui/src/npc-interaction-ui.ts';
import { OverworldUi,overworldUiLayout } from '/packages/ui/src/overworld-ui.ts';
import {drawHearthSeatedGroup} from '/packages/engine/src/hearth-seating-scene.ts';
import {HEARTH_FURNITURE_SHAPES} from '/packages/sim/src/index.ts';
import { loadOverworldArt,DEFAULT_PLAYER_APPEARANCE } from '/packages/engine/src/overworld-art.ts';
try {
 const settings=${JSON.stringify(settings)};
 const art=await loadOverworldArt();
 const registry=bootstrapContentRegistry();
 const inventory=[{slot:0,itemKind:'axe',quantity:1,durability:250},{slot:1,itemKind:'wood',quantity:25},
 {slot:10,itemKind:'hearth_legendary_sword',quantity:1,durability:250},
 {slot:11,itemKind:'hearth_legendary_body',quantity:1},{slot:12,itemKind:'hearth_prospector_pendant',quantity:1},
 {slot:30,itemKind:'hearth_wayfarer_pendant',quantity:1},{slot:31,itemKind:'hearth_rare_head',quantity:1},
 {slot:32,itemKind:'watch',quantity:1},{slot:33,itemKind:'hearth_rare_sword',quantity:1,durability:190},
 {slot:34,itemKind:'backpack',quantity:1},{slot:35,itemKind:'hearth_rare_shield',quantity:1},
 {slot:36,itemKind:'hearth_legendary_hands',quantity:1},{slot:37,itemKind:'hearth_rare_legs',quantity:1},
 {slot:38,itemKind:'hearth_rare_feet',quantity:1},{slot:39,itemKind:'hearth_rare_body',quantity:1}];
 const trainedRanks={blade_training:5,battle_conditioning:4,archery_basics:5,measured_stride:4};
 const skillPriority=['blade_training','battle_conditioning'];
 const loadout=compileEquipmentLoadout({registry,inventory,selectedSlot:MAIN_HAND_INVENTORY_SLOT,trainedRanks,skillPriority});
 const callbacks=new Proxy({}, {get:(_target,key)=>key==='claimOutdoorReward'?()=>Promise.reject(new Error('reward_inventory_full')):()=>{}});
 const ui=new OverworldUi(art.uiSkin,art.ui,{missing:art.missingItem,avatar:art.avatar,...art.itemIcons},callbacks);
 const model={width:settings.uiWidth,height:settings.uiHeight,connected:true,playerCount:1,selectedSlot:MAIN_HAND_INVENTORY_SLOT,
 inventory,hasBackpack:true,contentRegistry:registry,balanceBronze:10000n,audioVolumes:{master:1,music:1,sfx:1},canAdministerWorld:false,
 dateLabel:'SPRING 1',timeLabel:'12:00',timeFraction:.5,moonPhase:'full_moon',raining:false,weatherMode:'auto',prompt:null,toast:null,
 skills:{nodes:registry.compiled.skillNodes,ranks:Object.entries(trainedRanks).map(([nodeId,rank])=>({nodeId,rank})),
 tracks:['combat','explorer','farming'].map(track=>({track,experience:10000n,spentPoints:10,bonusPoints:0,respecCount:0})),balanceBronze:10000n,equipmentSkills:loadout.skills,skillPriority}};
 model.outdoorRewards=[{id:'study',title:'Ash shore',experience:24,valid:true,items:[{itemKind:'basalt',label:'Basalt',quantity:6},{itemKind:'ashwood',label:'Ashwood',quantity:4},{itemKind:'cinder_ore',label:'Cinder Ore',quantity:2},{itemKind:'emberglass',label:'Emberglass',quantity:1}]}];
 model.outdoorRewardCount=1;model.delveActive=settings.rewardState==='delve';
 if(settings.stash){model.activeFrameId='frame:hearth_stash';model.openStashInventory=[{slot:0,itemKind:'torch',quantity:1,durability:73,lit:false},{slot:19,itemKind:'hearth_rare_bow',quantity:1,durability:120}];}
 ui.openWindow=settings.stash?'content':settings.ferry?'ferry':settings.rewards?'outdoor-rewards':settings.skills?'skills':'inventory';ui.update(model);
 if(settings.ferry)ui.openFerry('orchard');
 if(settings.rewards&&settings.rewardState==='full-bags'){ui.handleKeyDown('Enter',false);for(let i=0;i<5;i++)await Promise.resolve();}
 if(settings.skills) {ui.skillTree.selectTrack('combat');ui.skillTree.selectedNodeId='blade_training';}
 else if(!settings.stash&&!settings.rewards&&!settings.ferry) {const slot=overworldUiLayout(settings.uiWidth,settings.uiHeight).backpackSlots[0];ui.pointerMove({x:slot.x+8,y:slot.y+8});}
 if(settings.danger){ui.openWindow=null;model.dangerNotice=settings.danger;model.zoneName='Overworld';ui.update(model);ui.pointerMove({x:-100,y:-100});}
 const canvas=document.createElement('canvas');canvas.width=settings.width;canvas.height=settings.height;
 const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.scale(settings.scale,settings.scale);ctx.fillStyle='#3f7550';ctx.fillRect(0,0,settings.uiWidth,settings.uiHeight);ui.draw(ctx);
 if(settings.seals){
  const shop=new NpcInteractionUi(art.uiSkin,art.ui,{missing:art.missingItem,avatar:art.avatar,...art.itemIcons},{...callbacks,unlockHearthLegendaryRecipe:async()=>{}});
  const model={width:settings.uiWidth,height:settings.uiHeight,npcId:BigInt(registry.npcs.get('npc:willow_archivist').runtimeId),
   dialogueId:'willow_archivist',shopId:'willow_archivist',nodeId:'shop',balanceBronze:1000n,inventory:[],contentRegistry:registry,sealSessionKey:'offline',knownRecipeIds:[]};
  shop.update(model);
  if(settings.seals!=='shop')shop.handleKeyDown('KeyL',false);
  if(settings.seals==='page2')shop.handleKeyDown('ArrowRight',false);
  if(['review','pending','learned'].includes(settings.seals))shop.handleKeyDown('Digit1',false);
  if(['pending','learned'].includes(settings.seals)){shop.handleKeyDown('Enter',false);await Promise.resolve();}
  if(settings.seals==='learned')shop.update({...model,knownRecipeIds:['hearth_legendary_body']});
  ctx.fillStyle='#3f7550';ctx.fillRect(0,0,settings.uiWidth,settings.uiHeight);shop.draw(ctx);
 }
 if(settings.intro){
  const dialogue=new NpcInteractionUi(art.uiSkin,art.ui,{missing:art.missingItem,avatar:art.avatar,...art.itemIcons},{...callbacks,fulfillVillageOrder:async()=>{}});
  const npcId=settings.orders?'npc:willow_storekeeper':settings.expeditionContract?(settings.expeditionContract==='prepare'?'npc:willow_smith':'npc:willow_archivist'):settings.rowan?'npc:willow_carpenter':'npc:willow_harbour_guide';
  dialogue.update({width:settings.uiWidth,height:settings.uiHeight,npcId:BigInt(registry.npcs.get(npcId).runtimeId),
    dialogueId:npcId.slice(4),nodeId:settings.orders?'greeting':settings.expeditionContract?'hearth_'+settings.expeditionContract+'_request':settings.furnishContract?'hearth_furnish_request':settings.rowan?'hearth_carpenter_accepted':'hearth_arrival_accepted',
    balanceBronze:0n,inventory:[],touchControls:true,contentRegistry:registry,orderSessionKey:'offline',
    villageOrders:settings.orders?villageOrders(registry).filter(order=>order.npc===npcId).map(order=>({...villageOrderQuote(registry,order.id,0),npcId:BigInt(registry.npcs.get(npcId).runtimeId),revision:0n,contentHash:registry.contentHash})):[],
    quests:[{questId:'hearth_willowharbour_arrival',state:(settings.rowan||settings.expeditionContract)?'turned_in':'complete'},
      ...(settings.expeditionContract==='outpost'||settings.expeditionContract==='basalt'?[{questId:'hearth_prepare_expedition',state:'turned_in'}]:[]),
      ...(settings.expeditionContract==='basalt'?[{questId:'hearth_clear_ash_shore',state:'turned_in'}]:[]),
      ...(settings.rowan?[{questId:'hearth_meet_carpenter',state:settings.furnishContract?'turned_in':'complete'}]:[])]});
  if(settings.orders){dialogue.handleKeyDown('Digit1',false);if(settings.orderReview)dialogue.handleKeyDown('Digit1',false);if(settings.orderPending){dialogue.handleKeyDown('Enter',false);await Promise.resolve();}}
  ctx.fillStyle='#3f7550';ctx.fillRect(0,0,settings.uiWidth,settings.uiHeight);dialogue.draw(ctx);
 }
 if(settings.furniture){
  const shop=new NpcInteractionUi(art.uiSkin,art.ui,{missing:art.missingItem,avatar:art.avatar,...art.itemIcons},callbacks);
  shop.update({width:settings.uiWidth,height:settings.uiHeight,npcId:1n,dialogueId:'willow_furnisher',shopId:'willow_furnisher',nodeId:'shop',balanceBronze:10000n,inventory:[],contentRegistry:registry});
  shop.setFilterText('Wall Mirror Plan');
  const layout=npcInteractionLayout(settings.uiWidth,settings.uiHeight,true);
  shop.pointerDown({x:layout.list.x+5,y:layout.list.y+5},0);
  ctx.fillStyle='#3f7550';ctx.fillRect(0,0,settings.uiWidth,settings.uiHeight);shop.draw(ctx);
 }
 if(settings.furnishing){
  const palette=new HomesteadBuildPalette(art.uiSkin,art.ui,art.itemIcons);
  const entries=[...registry.objects.values()].filter(d=>d.retired!==true&&d.components.placement&&hearthFurnitureDefinition(registry,d.components.placement.item.slice(5))?.definition.id===d.id)
   .map(d=>({itemKind:d.components.placement.item.slice(5),displayName:d.displayName,layer:'prop',iconAnimation:'base'}));
  if(entries.length!==32)throw new Error('Expected full base catalogue, got '+entries.length);
  const model={width:320,height:180,furnishing:true,entries,counts:{},upgrades:[],upgradeRanks:{},balanceBronze:10000n,residenceRank:0,residenceOwner:true};
  palette.setModel(model);
  if(settings.construction){
    const bounds=palette.bounds;palette.pointerDown({x:bounds.x+bounds.width-40,y:bounds.y+10},0);
    if(settings.constructionReview){
      const tool=constructionToolRect(palette.bounds,4);palette.pointerDown({x:tool.x+10,y:tool.y+10},0);
      palette.setModel({...model,constructionCanApply:true,constructionStatus:{footprint:4,
        materials:['USE 16 WOOD','USE 4 STONE','RETURN 2 COPPER PIECE'],notice:'REACH, SPACE AND BAGS CHECKED ON APPLY'}});
    }
  }
  else {
  const index=settings.expansion?entries.length+3:entries.findIndex(e=>e.itemKind.includes('dining_table'));
  const cell=homesteadBuildPaletteCells(palette.bounds,entries.length,4)[index];
  palette.pointerDown({x:cell.x+1,y:cell.y+1},0);
  }
  ctx.fillStyle='#3f7550';ctx.fillRect(0,0,320,180);palette.draw(ctx);
 }
 if(settings.seating){
  ctx.fillStyle='#b18057';ctx.fillRect(0,0,settings.uiWidth,settings.uiHeight);
  const seats=Object.values(HEARTH_FURNITURE_SHAPES).filter(shape=>shape.seatPoseOffsetPixels!==undefined);
  for(const [index,seatShape] of seats.entries())for(let frame=0;frame<2;frame++){
   const kind=seatShape.id;
   const seat={id:String(index),shape:HEARTH_FURNITURE_SHAPES[kind],tileX:2+index*5,tileY:4+frame*7};
   if(!drawHearthSeatedGroup(ctx,art,seat,DEFAULT_PLAYER_APPEARANCE,0,0,1,frame))throw new Error('Seat draw unavailable '+kind);
  }
 }
 await fetch('/__login-result',{method:'POST',body:JSON.stringify({png:canvas.toDataURL('image/png'),seed:0,resources:0,decorations:0,draws:0})});
} catch(error) {await fetch('/__login-result',{method:'POST',body:JSON.stringify({error:String(error),stack:error?.stack})});}
`;
let finish: (value: string) => void = () => undefined;
const result = new Promise<string>((resolveResult) => { finish = resolveResult; });
const server = await createServer({
 root, configFile: false, publicDir: resolve(root, 'packages/client/public'),
 server: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error',
 plugins: [{ name: 'offline-login-island', configureServer(server) {
  server.middlewares.use((request, response, next) => {
   if (request.url === '/__login-island') {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><html><body><script type="module" src="/__login-scene.js"></script></body></html>');
   } else if (request.url === '/__login-scene.js') {
    response.setHeader('Content-Type', 'text/javascript'); response.end(scene);
   } else if (request.url === '/__login-result' && request.method === 'POST') {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => { finish(Buffer.concat(chunks).toString('utf8')); response.end('ok'); });
   } else next();
  });
 } }],
});
const profile = await mkdtemp(resolve(tmpdir(), 'orchard-login-art-'));
await server.listen();
const address = server.httpServer?.address();
if (address === null || address === undefined || typeof address === 'string') throw new Error('preview address unavailable');
const chrome = spawn(process.env['CHROME_BIN'] ?? '/usr/bin/google-chrome', [
 '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
 `--user-data-dir=${profile}`, `http://127.0.0.1:${address.port}/__login-island`,
], { stdio: 'ignore' });
let timer: ReturnType<typeof setTimeout> | undefined;
try {
 const payload = JSON.parse(await Promise.race([result, new Promise<never>((_resolve, reject) => {
  timer = setTimeout(() => reject(new Error('Offline render timed out')), 120_000);
 })])) as { png?: string; error?: string; stack?: string; seed: number; resources: number; decorations: number; draws: number };
 if (payload.error !== undefined || payload.png === undefined) throw new Error(payload.stack ?? payload.error ?? 'render missing');
 const png = Buffer.from(payload.png.slice('data:image/png;base64,'.length), 'base64');
 const decoded = decodePng(png);
 if (decoded.width !== settings.width || decoded.height !== settings.height) throw new Error('render dimensions invalid');
 await mkdir(dirname(output), { recursive: true });
 await writeFile(output, png);
 const atlas = JSON.parse(await readFile(resolve(root, 'packages/client/public/generated/atlas.meta.json'), 'utf8')) as { revision: string };
 const sourcePaths = ['packages/ui/src/hearth-seal-flow.ts','packages/ui/src/hearth-seal-panel.ts','packages/sim/src/hearth-seal-exchange.ts','packages/sim/src/village-orders.ts','packages/ui/src/village-order-flow.ts','packages/ui/src/village-order-panel.ts','packages/assets/content/quests.json','packages/assets/content/dialogues.json','packages/assets/content/npcs.json','packages/engine/src/hearth-seating-scene.ts','packages/sim/src/character-animation.ts','packages/ui/src/homestead-build-palette.ts','packages/ui/src/npc-interaction-ui.ts','packages/ui/src/furniture-shop-details.ts','packages/assets/content/recipes.json','packages/assets/content/shops.json','packages/tools/src/render-hearth-equipment-ui.ts','packages/ui/src/overworld-ui.ts','packages/ui/src/item-slot.ts','packages/ui/src/content-frame.ts','packages/sim/src/content/frame-definition.ts','packages/assets/content/frames.json','packages/ui/src/skill-tree-ui.ts','packages/ui/src/equipment-description.ts','packages/ui/src/outdoor-rewards.ts','packages/ui/src/ferry-menu.ts','packages/sim/src/equipment-loadout.ts','packages/assets/content/items.json','packages/client/public/generated/atlas.meta.json'];
 const sourceSha256 = Object.fromEntries(await Promise.all(sourcePaths.map(async (path) => [
  path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'),
 ])));
 const provenance = { format: 'orchard-hearth-equipment-ui-study-v1', ...settings, seed: payload.seed,
  generator: seals?'offline native Iona seal exchange fixture':orders?'offline native NPC order panel fixture':expeditionContract?'offline authored expedition contract offer':furnishContract?'offline authored furnishing contract offer':intro ? 'offline authored introduction dialogue with admitted acceptance complete' : seating ? 'offline six-seat native pose fixture' : furnishing ? 'offline collapsed furnishing palette fixture' : furniture ? 'offline authored furniture shop fixture' : 'offline authored equipment fixture',
  renderer: seals?'NpcInteractionUi':intro ? 'NpcInteractionUi' : seating ? 'drawHearthSeatedGroup / drawOverworldAvatar' : furnishing ? 'HomesteadBuildPalette' : furniture ? 'NpcInteractionUi' : 'OverworldUi / SkillTreeUi',
  atlasRevision: atlas.revision, sourceSha256, decorations: payload.decorations, resources: payload.resources, draws: payload.draws,
  players: 0, liveData: false, imageSha256: createHash('sha256').update(png).digest('hex'),
  rgbaSha256: createHash('sha256').update(decoded.rgba).digest('hex'),
  reproduce: `npx tsx packages/tools/src/render-hearth-equipment-ui.ts${danger?' --danger='+danger:''}${seals?' --seals='+seals:''}${orders?(orderPending?' --orders-pending':orderReview?' --orders-review':' --orders'):expeditionContract?' --'+expeditionContract+'-contract':furnishContract?' --furnish-contract':intro?' --intro':''}${rowan?' --rowan':''}${constructionReview?' --construction-review':construction?' --construction':''}${expansion?' --expansion':''}${seating?' --seating':''}${furnishing?' --furnishing':''}${furniture?' --furniture':''}${stash?' --stash':''}${skills?' --skills':''}${rewards?' --rewards':''}${ferry?' --ferry':''}${compact?' --compact':''}${rewardState==='full-bags'?' --full-bags':rewardState==='delve'?' --delve':''}`,
 };
 const provenancePath = output.replace(/\.png$/, '.provenance.json');
 await mkdir(dirname(provenancePath), { recursive: true });
 await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
 console.log(JSON.stringify({ output, ...provenance }, null, 2));
} finally {
 if (timer !== undefined) clearTimeout(timer);
 chrome.kill(); await server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
