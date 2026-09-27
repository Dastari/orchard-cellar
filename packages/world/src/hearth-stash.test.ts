import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect} from 'vitest';
import * as sim from '@orchard/sim';
import {hearthStashFrameRestrictions,legacyWorldChestFrameRestrictions} from './content/frame-runtime.js';
it('keeps cache identity and placement catalogs out of runtime consumers',()=>{
  for(const url of [new URL('../../sim/src/hearth-stash-endpoints.ts',import.meta.url),
    new URL('./index.ts',import.meta.url),new URL('../../client/src/overworld-main.ts',import.meta.url)]){
    const runtimeSource=readFileSync(url,'utf8');
    expect(runtimeSource).not.toContain('HEARTH_SUPPLY_CACHE');
    expect(runtimeSource).not.toContain('cinder_landing');
  }
});
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function authority(dependencies:Record<string,unknown>){
  const names=['hearthStashWithinReach','hearthStashSessionAvailable','clearActiveHearthStash','loadHearthStashRows',
    'openHearthStashEndpoint','openHearthStash','openHearthSupplyCache','closeHearthStash','loadOpenMenuInventory','writeOpenMenuInventory','clearActivePlaceable',
    'ownActiveHearthStash','ownHearthStashSlots','moveOpenMenuItem','distributeOpenMenuItem','quickMoveMenuItem',
    'quickMoveAllMenuItems','inventoryCursorClick','inventoryCursorQuickCraft','sortMenuContainer'];
  const definitions=names.map(name=>{
    const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
    if(fn)return fn.getText(source);
    for(const node of source.statements){
      if(!ts.isVariableStatement(node))continue;
      const declaration=node.declarationList.declarations.find(d=>d.name.getText(source)===name);
      if(!declaration?.initializer||!ts.isCallExpression(declaration.initializer))continue;
      const callback=declaration.initializer.arguments.find(ts.isArrowFunction);
      if(callback)return `const ${name}=${callback.getText(source)};`;
    }
    throw new Error(`Missing ${name}`);
  });
  return new Function(...Object.keys(dependencies),ts.transpileModule(definitions.join('\n')+`\nreturn {${names.join(',')}};`,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText)(...Object.values(dependencies));
}
function identity(value:string){return {toHexString:()=>value,isEqual:(other:{toHexString:()=>string})=>other.toHexString()===value};}
type Identity=ReturnType<typeof identity>;
type Slot={id:string;identity:Identity;slot:number;itemKind:string;quantity:number;durability:number;lit:boolean};
function fixture(registry:sim.ContentRegistry=sim.bootstrapContentRegistry()){
  const alice=identity('alice'),bob=identity('bob'),connection=identity('a1');
  const supplyCache=sim.runtimeHearthSupplyCache(registry);
  if(supplyCache===null)throw new Error('missing fixture supply cache');
  const slots=new Map<string,Slot>(),sessions=new Map<string,{identity:Identity;connectionId:Identity}>();
  let locked=false;
  const controls = { installed: true, mounted: false, hands: false, bow: false, recovery: false,
    health: 1000, settledHealth: 1000, cursorFails: false };
  const supplyPrefab:sim.MapPrefabDocumentV2={schemaVersion:2,kind:'map_prefab',id:supplyCache.prefabId,title:'supply cache',
    width:1,height:1,tileSize:16,pivot:{tileX:0,tileY:0},revision:1,assetRegistryRevision:'fixture',tags:['semantic.fixture'],
    collection:{id:'fixture',label:'Fixture',color:'#000000'},behaviors:[{kind:'static'}],
    cells:[{id:'base',tileX:0,tileY:0,elevation:0,collisionMask:0xffff}],placements:[{id:'visual',
      assetId:supplyCache.assetId,assetName:supplyCache.assetName,tileX:0,tileY:0,elevation:0,layer:'object',
      visual:{kind:'state',name:supplyCache.visualState,frameIndex:0},quarterTurns:0,flipX:false}]};
  const supplyDocument:sim.MapDocumentV3={...sim.createLiveIslandMapDocument(),combatRegions:sim.HEARTH_COMBAT_REGIONS,
    prefabs:[supplyPrefab],objects:[{id:supplyCache.objectId,prefabId:supplyPrefab.id,prefabRevision:1,
      tileX:supplyCache.tileX,tileY:supplyCache.tileY,elevation:0,layer:'objects',quarterTurns:0,flipX:false,enabled:true}]};
  const supplyCollision:sim.CollisionMap={width:832,height:832,blocked:new Uint8Array(832*832),
    elevations:new Int16Array(832*832),obstacles:[{left:650*sim.TILE_SIZE_FIXED,right:651*sim.TILE_SIZE_FIXED-1,
      top:202*sim.TILE_SIZE_FIXED,bottom:203*sim.TILE_SIZE_FIXED-1}]};
  let containers:Readonly<Record<string,sim.ContainerSnapshot>>={
    hotbar:{id:'hotbar',capacity:10,slots:Array(10).fill(null)},backpack:{id:'backpack',capacity:20,slots:Array(20).fill(null)},
  };
  const position={spaceId:sim.HEARTH_LOBBY_SPACE_ID,x:8.5*sim.TILE_SIZE_FIXED,y:13.5*sim.TILE_SIZE_FIXED};
  const empty={identity:{find:()=>null,delete:()=>{}},id:{find:()=>null}};
  const ctx={sender:alice,connectionId:connection,senderAuth:{jwt:null},db:{
    player_position:{identity:{find:()=>position}},player_stats:{identity:{find:()=>({healthCenti:controls.health})}},
    bow_charge:{identity:{find:()=>controls.bow?{}:null}},player_seat:empty,
    world_clock:{id:{find:()=>({authorityTick:100n})}},
    player_combat_state:{identity:{find:()=>controls.recovery?{kind:'recovery',readyTick:101n}:null}},
    membership:empty,active_chest:empty,world_chest:empty,active_placeable:empty,active_dialogue:empty,
    active_hearth_stash:{identity:{find:(id:Identity)=>sessions.get(id.toHexString())??null,
      delete:(id:Identity)=>sessions.delete(id.toHexString()),update:(row:{identity:Identity;connectionId:Identity})=>sessions.set(row.identity.toHexString(),row)},
      insert:(row:{identity:Identity;connectionId:Identity})=>sessions.set(row.identity.toHexString(),row)},
    hearth_stash_slot:{by_identity:{filter:(id:Identity)=>[...slots.values()].filter(row=>row.identity.isEqual(id))},
      insert:(row:Slot)=>{slots.set(row.id,row);return row;},id:{update:(row:Slot)=>slots.set(row.id,row)}},
  }};
  let cursorSettlements=0;
  let cursor:sim.ItemStack|null=null;
  const api=authority({...sim,SenderError:Error,contentRegistry:()=>registry,
    hearthStashFrameRestrictions,legacyWorldChestFrameRestrictions,
    activeItemContainerContent:()=>sim.itemContainerContentResolver(registry),refreshSenderQuestsFromInventory:()=>{},
    playerInventoryCursor:()=>cursor,writePlayerInventoryCursor:(_ctx:unknown,_id:unknown,next:sim.ItemStack|null)=>{cursor=next;},activeSpaceDefinition:()=>({generator:'delve_lobby'}),
    TOPSIDE_SPACE_ID:0,collisionForSpace:()=>position.spaceId===0?supplyCollision:sim.hearthLobbyCollision(),requireAuthorizedSender:()=>{},
    compiledLiveIslandRuntime:()=>({document:controls.installed?supplyDocument:null}),
    mountedNpcFor:()=>controls.mounted?{}:null,handsOccupiedFor:()=>controls.hands,
    advancePlayerStats:()=>({healthCenti:controls.settledHealth}),
    requirePersistentInventoryAvailable:()=>{if(locked)throw new Error('descent_inventory_locked');},
    returnInventoryCursorToStorage:()=>{if(controls.cursorFails)throw new Error('cursor_storage_full');cursorSettlements++;},syncLegacyChestGenericMirror:()=>{},
    loadPlayerInventory:()=>({containers,rowBySlot:new Map()}),
    storedStack:(_ctx:unknown,itemKind:string,quantity:number,durability:number,lit:boolean)=>quantity===0?null:{itemKind,quantity,durability,lit},
    sameStoredStack:(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b),
    storedDurability:(_ctx:unknown,_kind:string,value:number|undefined)=>value??0,
    storedLit:(_kind:string,value:boolean|undefined)=>value??true,
    writePlayerInventory:(_ctx:unknown,_rows:unknown,_before:unknown,after:Readonly<Record<string,sim.ContainerSnapshot>>)=>{
      containers={hotbar:after.hotbar!,backpack:after.backpack!};},
    updateEquippedForIdentity:()=>{},
  });
  return {api,ctx,alice,bob,position,slots,sessions,controls,supplyCache,supplyCollision,lock:()=>{locked=true;},cursorSettlements:()=>cursorSettlements,
    setInventory:(value:Readonly<Record<string,sim.ContainerSnapshot>>)=>{containers=value;},
    setCursor:(value:sim.ItemStack|null)=>{cursor=value;},cursor:()=>cursor};
}
describe('private lobby stash authority',()=>{
  it('materializes exactly one owner store and never exposes another owner through views or menu IDs',()=>{
    const f=fixture();f.api.openHearthStash(f.ctx);
    expect(f.slots.size).toBe(20);expect(f.api.ownHearthStashSlots(f.ctx)).toHaveLength(20);
    f.api.openHearthStash(f.ctx);expect(f.slots.size).toBe(20);
    const bob={...f.ctx,sender:f.bob,connectionId:identity('b1')};
    expect(f.api.ownHearthStashSlots(bob)).toEqual([]);expect(f.api.ownActiveHearthStash(bob)).toBeUndefined();
    expect(f.api.loadOpenMenuInventory(bob).containers.stash).toBeUndefined();
    f.api.openHearthStash(bob);expect(f.slots.size).toBe(40);
    expect(f.api.loadOpenMenuInventory(bob).stash.rowsBySlot.get(0).identity).toBe(f.bob);
  });
  it('preserves exact item metadata through shared transfers and refuses a full destination',()=>{
    const f=fixture();f.api.openHearthStash(f.ctx);
    const initial=f.api.loadOpenMenuInventory(f.ctx).containers;
    const stack={itemKind:'torch',quantity:1,durability:73,lit:false};
    f.setInventory({...initial,hotbar:{...initial.hotbar,slots:[stack,...Array(9).fill(null)]}});
    let menu=f.api.loadOpenMenuInventory(f.ctx);
    const moved=sim.moveItemStacks(menu.containers,{fromContainer:'hotbar',fromIndex:0,toContainer:'stash',toIndex:0,quantity:1},sim.BOOTSTRAP_ITEM_CONTAINER_CONTENT);
    expect(moved.ok).toBe(true);if(!moved.ok)throw new Error(moved.code);
    f.api.writeOpenMenuInventory(f.ctx,menu,moved.containers);
    expect(f.slots.get('alice:0')).toMatchObject(stack);
    menu=f.api.loadOpenMenuInventory(f.ctx);
    const back=sim.moveItemStacks(menu.containers,{fromContainer:'stash',fromIndex:0,toContainer:'hotbar',toIndex:0,quantity:1},sim.BOOTSTRAP_ITEM_CONTAINER_CONTENT);
    expect(back.ok).toBe(true);if(!back.ok)throw new Error(back.code);
    f.api.writeOpenMenuInventory(f.ctx,menu,back.containers);
    expect(f.api.loadOpenMenuInventory(f.ctx).containers.hotbar.slots[0]).toEqual(stack);
    const full:Readonly<Record<string,sim.ContainerSnapshot>>={...back.containers,stash:{id:'stash',capacity:20,slots:Array(20).fill({itemKind:'stone',quantity:99})}};
    const failed=sim.quickMoveItemStack(full,{fromContainer:'hotbar',fromIndex:0,toContainers:['stash']},sim.BOOTSTRAP_ITEM_CONTAINER_CONTENT);
    expect(failed.ok).toBe(false);expect(full.hotbar!.slots[0]).toEqual(stack);
  });
  it('rejects stale range, other connection, replaced session and Delve access before writes',()=>{
    const f=fixture();f.api.openHearthStash(f.ctx);const menu=f.api.loadOpenMenuInventory(f.ctx);
    const other={...f.ctx,connectionId:identity('a2')};
    expect(f.api.loadOpenMenuInventory(other).containers.stash).toBeUndefined();
    f.api.openHearthStash(other);expect(f.api.loadOpenMenuInventory(f.ctx).containers.stash).toBeUndefined();
    f.api.closeHearthStash(f.ctx);expect(f.sessions.size).toBe(1);
    f.position.x+=4*sim.TILE_SIZE_FIXED;
    expect(f.api.loadOpenMenuInventory(other).containers.stash).toBeUndefined();
    expect(()=>f.api.writeOpenMenuInventory(other,menu,menu.containers)).toThrow('stash_out_of_reach');
    f.lock();expect(()=>f.api.loadOpenMenuInventory(other)).toThrow('descent_inventory_locked');
    expect(f.slots.size).toBe(20);
  });
  it('rejects unique quest deposits before carried or stored inventory can change',()=>{
    const f=fixture();f.api.openHearthStash(f.ctx);
    const menu=f.api.loadOpenMenuInventory(f.ctx),before=[...f.slots.values()];
    const forged={...menu.containers,stash:{...menu.containers.stash,
      slots:[{itemKind:'marlow_book',quantity:1},...Array(19).fill(null)]}};
    expect(()=>f.api.writeOpenMenuInventory(f.ctx,menu,forged)).toThrow('item_not_tradeable');
    expect([...f.slots.values()]).toEqual(before);
    expect(f.api.loadOpenMenuInventory(f.ctx).containers.hotbar.slots.every((slot:unknown)=>slot===null)).toBe(true);
  });
  it('settles cursor on explicit close and preserves all stored rows during cleanup',()=>{
    const f=fixture();f.api.openHearthStash(f.ctx);const rows=[...f.slots.values()];
    f.api.closeHearthStash(f.ctx);expect(f.cursorSettlements()).toBe(2);
    expect(f.sessions.size).toBe(0);expect([...f.slots.values()]).toEqual(rows);
    f.api.openHearthStash(f.ctx);f.api.clearActivePlaceable(f.ctx,f.alice);
    expect(f.sessions.size).toBe(0);expect([...f.slots.values()]).toEqual(rows);
  });
});

it('opens the same private store at the landing, binds endpoint and connection, and preserves contents when removed',()=>{
  const f=fixture();f.api.openHearthStash(f.ctx);
  const stack={itemKind:'torch',quantity:2,durability:73,lit:false};
  f.slots.set('alice:0',{...f.slots.get('alice:0')!,...stack});
  f.position.spaceId=0;f.position.x=650.5*sim.TILE_SIZE_FIXED;f.position.y=204.5*sim.TILE_SIZE_FIXED;
  expect(f.api.hearthStashSessionAvailable(f.ctx)).toBe(false);
  f.api.openHearthSupplyCache(f.ctx);
  expect(f.slots.size).toBe(20);expect(f.api.loadOpenMenuInventory(f.ctx).containers.stash.slots[0]).toEqual(stack);
  expect(f.sessions.get('alice')).toMatchObject({endpointId:f.supplyCache.endpointId});
  const bob={...f.ctx,sender:f.bob,connectionId:identity('b1')};
  expect(f.api.loadOpenMenuInventory(bob).containers.stash).toBeUndefined();
  const other={...f.ctx,connectionId:identity('a2')};
  expect(f.api.hearthStashSessionAvailable(other)).toBe(false);
  f.api.openHearthSupplyCache(other);f.api.closeHearthStash(f.ctx);
  expect(f.api.hearthStashSessionAvailable(other)).toBe(true);
  const menu=f.api.loadOpenMenuInventory(other),before=[...f.slots.values()];
  f.controls.installed=false;
  expect(()=>f.api.writeOpenMenuInventory(other,menu,menu.containers)).toThrow('stash_out_of_reach');
  expect([...f.slots.values()]).toEqual(before);
  f.api.closeHearthStash(other);expect(f.sessions.size).toBe(0);expect([...f.slots.values()]).toEqual(before);
  f.position.spaceId=sim.HEARTH_LOBBY_SPACE_ID;f.position.x=8.5*sim.TILE_SIZE_FIXED;f.position.y=13.5*sim.TILE_SIZE_FIXED;
  f.api.openHearthStash(f.ctx);expect(f.api.loadOpenMenuInventory(f.ctx).containers.stash.slots[0]).toEqual(stack);
});
it('opens an arbitrarily renamed active authored supply-cache endpoint',()=>{
  const registry=sim.bootstrapContentRegistry(),island=registry.spaces.get('space:island')!;
  const chest=registry.objects.get('object:chest')!,renamedChest={...chest,id:'object:renamed_cache' as const};
  const renamed:sim.SpaceContentDefinition={...island,supplyCache:[
    'renamed_cache',renamedChest.id,'renamed-cache-object','renamed-cache-prefab',2817144658,650,202,650,204,
  ]};
  const spaces=new Map(registry.spaces);spaces.set(renamed.id,renamed);
  const objects=new Map(registry.objects);objects.set(renamedChest.id,renamedChest);
  const f=fixture({...registry,spaces,objects});
  f.position.spaceId=renamed.spaceId;f.position.x=650.5*sim.TILE_SIZE_FIXED;f.position.y=204.5*sim.TILE_SIZE_FIXED;
  f.api.openHearthSupplyCache(f.ctx);
  expect(f.sessions.get('alice')).toMatchObject({endpointId:'renamed_cache'});
});
it('refuses supply access during action/custody conflicts or failed cursor settlement without creating storage',()=>{
  for(const patch of [{mounted:true},{hands:true},{bow:true},{recovery:true},{health:0},{settledHealth:0},{installed:false},{cursorFails:true}]){
    const f=fixture();f.position.spaceId=0;f.position.x=650.5*sim.TILE_SIZE_FIXED;f.position.y=204.5*sim.TILE_SIZE_FIXED;
    Object.assign(f.controls,patch);
    expect(()=>f.api.openHearthSupplyCache(f.ctx)).toThrow();expect(f.slots.size).toBe(0);expect(f.sessions.size).toBe(0);
    expect(f.cursorSettlements()).toBe(0);
  }
  const f=fixture();f.position.spaceId=0;f.position.x=650.5*sim.TILE_SIZE_FIXED;f.position.y=204.5*sim.TILE_SIZE_FIXED;
  f.lock();expect(()=>f.api.openHearthSupplyCache(f.ctx)).toThrow('descent_inventory_locked');expect(f.slots.size).toBe(0);
});

/** Registry whose `frame:hearth_stash` contents pane carries an authored rule. */
function stashRuleRegistry(restriction:Record<string,unknown>):sim.ContentRegistry{
  const rows=sim.bootstrapContentRows().map(row=>{
    if(row.id!=='frame:hearth_stash')return row;
    const frame=JSON.parse(String(row.json)) as {panes:{id:string;restriction?:Record<string,unknown>}[]};
    return {...row,json:JSON.stringify({...frame,panes:frame.panes.map(pane=>pane.id==='contents'
      ?{...pane,restriction:{...pane.restriction,...restriction}}:pane)})};
  });
  const built=sim.buildContentRegistry(rows);
  expect(built.report.errors).toEqual([]);
  return built.registry;
}
describe('BUG-046: the authority applies hearth stash frame slot rules',()=>{
  const apple={itemKind:'apple',quantity:5,durability:0,lit:true};
  const wood={itemKind:'wood',quantity:5,durability:0,lit:true};
  function opened(registry:sim.ContentRegistry){
    const f=fixture(registry);f.api.openHearthStash(f.ctx);
    const initial=f.api.loadOpenMenuInventory(f.ctx).containers;
    f.setInventory({hotbar:{...initial.hotbar,slots:[apple,wood,...Array(8).fill(null)]},backpack:initial.backpack});
    return f;
  }
  const stored=(f:ReturnType<typeof fixture>)=>[...f.slots.values()].map(row=>[row.slot,row.itemKind,row.quantity]);
  it('leaves shipped stash content unrestricted, so live behaviour is unchanged',()=>{
    const f=opened(sim.bootstrapContentRegistry());
    expect(f.api.loadOpenMenuInventory(f.ctx).containers.stash).not.toHaveProperty('restrictions');
    f.api.moveOpenMenuItem(f.ctx,{fromContainer:'hotbar',fromIndex:0,toContainer:'stash',toIndex:0,quantity:5});
    expect(f.slots.get('alice:0')).toMatchObject({itemKind:'apple',quantity:5});
  });
  it('refuses an authored rejectedItems deposit through every insertion reducer before any write',()=>{
    const f=opened(stashRuleRegistry({rejectedItems:['item:apple']}));
    const stash=f.api.loadOpenMenuInventory(f.ctx).containers.stash;
    expect(Object.keys(stash.restrictions)).toHaveLength(20);
    expect(stash.restrictions[0]).toEqual({rejectedKinds:['apple']});
    const before=stored(f);
    expect(()=>f.api.moveOpenMenuItem(f.ctx,{fromContainer:'hotbar',fromIndex:0,toContainer:'stash',toIndex:0,quantity:5}))
      .toThrow('slot_rejects_item');
    expect(()=>f.api.moveOpenMenuItem(f.ctx,{fromContainer:'hotbar',fromIndex:0,toContainer:'stash',toIndex:0,quantity:2}))
      .toThrow('slot_rejects_item');
    expect(()=>f.api.distributeOpenMenuItem(f.ctx,{fromContainer:'hotbar',fromIndex:0,quantity:4,
      targetContainers:['stash','stash'],targetIndexes:[0,1]})).toThrow();
    expect(()=>f.api.quickMoveMenuItem(f.ctx,{fromContainer:'hotbar',fromIndex:0,toContainers:['stash']})).toThrow();
    expect(()=>f.api.quickMoveAllMenuItems(f.ctx,{itemKind:'apple',fromContainers:['hotbar'],toContainers:['stash']})).toThrow();
    f.setCursor({...apple});
    expect(()=>f.api.inventoryCursorClick(f.ctx,{container:'stash',index:0,button:'left'})).toThrow('slot_rejects_item');
    expect(()=>f.api.inventoryCursorClick(f.ctx,{container:'stash',index:0,button:'right'})).toThrow('slot_rejects_item');
    expect(()=>f.api.inventoryCursorQuickCraft(f.ctx,{targetContainers:['stash','stash'],targetIndexes:[0,1],mode:'even'})).toThrow();
    expect(f.cursor()).toEqual(apple);f.setCursor(null);
    expect(stored(f)).toEqual(before);
    expect(f.api.loadOpenMenuInventory(f.ctx).containers.hotbar.slots[0]).toEqual(apple);
    // Items the rule does not name still go in.
    f.api.quickMoveMenuItem(f.ctx,{fromContainer:'hotbar',fromIndex:1,toContainers:['stash']});
    expect(f.slots.get('alice:0')).toMatchObject({itemKind:'wood',quantity:5});
  });
  it('keeps stored items that break a new rule, and lets the owner take them out',()=>{
    const f=opened(stashRuleRegistry({rejectedItems:['item:apple']}));
    f.slots.set('alice:3',{...f.slots.get('alice:3')!,itemKind:'apple',quantity:7,durability:0,lit:true});
    expect(f.api.loadOpenMenuInventory(f.ctx).containers.stash.slots[3]).toMatchObject({itemKind:'apple',quantity:7});
    expect(f.slots.get('alice:3')).toMatchObject({itemKind:'apple',quantity:7});
    f.api.moveOpenMenuItem(f.ctx,{fromContainer:'stash',fromIndex:3,toContainer:'backpack',toIndex:0,quantity:3});
    expect(f.slots.get('alice:3')).toMatchObject({itemKind:'apple',quantity:4});
    f.api.inventoryCursorClick(f.ctx,{container:'stash',index:3,button:'left'});
    expect(f.cursor()).toMatchObject({itemKind:'apple',quantity:4});
    expect(f.slots.get('alice:3')).toMatchObject({itemKind:'empty',quantity:0});
    expect(f.api.loadOpenMenuInventory(f.ctx).containers.backpack.slots[0]).toMatchObject({itemKind:'apple',quantity:3});
  });
  it('applies authored allow lists and required tags as well as deny lists',()=>{
    const allow=opened(stashRuleRegistry({acceptedItems:['item:wood']}));
    expect(()=>allow.api.moveOpenMenuItem(allow.ctx,{fromContainer:'hotbar',fromIndex:0,toContainer:'stash',toIndex:0,quantity:5}))
      .toThrow('slot_rejects_item');
    allow.api.moveOpenMenuItem(allow.ctx,{fromContainer:'hotbar',fromIndex:1,toContainer:'stash',toIndex:0,quantity:5});
    expect(allow.slots.get('alice:0')).toMatchObject({itemKind:'wood',quantity:5});
    const tagged=opened(stashRuleRegistry({rejectedTags:['item.food']}));
    expect(()=>tagged.api.moveOpenMenuItem(tagged.ctx,{fromContainer:'hotbar',fromIndex:0,toContainer:'stash',toIndex:0,quantity:5}))
      .toThrow('slot_rejects_item');
    tagged.api.moveOpenMenuItem(tagged.ctx,{fromContainer:'hotbar',fromIndex:1,toContainer:'stash',toIndex:0,quantity:5});
    expect(tagged.slots.get('alice:0')).toMatchObject({itemKind:'wood',quantity:5});
    const required=opened(stashRuleRegistry({requiredTags:['item.food']}));
    expect(()=>required.api.moveOpenMenuItem(required.ctx,{fromContainer:'hotbar',fromIndex:1,toContainer:'stash',toIndex:0,quantity:5}))
      .toThrow('slot_rejects_item');
    required.api.moveOpenMenuItem(required.ctx,{fromContainer:'hotbar',fromIndex:0,toContainer:'stash',toIndex:0,quantity:5});
    expect(required.slots.get('alice:0')).toMatchObject({itemKind:'apple',quantity:5});
  });
});
