import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {describe,it,expect,vi} from 'vitest';
import * as sim from '@orchard/sim';
const source=ts.createSourceFile('index.ts',readFileSync(new URL('./index.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
function declaration(name:string){
  for(const node of source.statements){
    if(ts.isFunctionDeclaration(node)&&node.name?.text===name)return node.getText(source);
    if(ts.isVariableStatement(node))for(const row of node.declarationList.declarations){
      if(row.name.getText(source)!==name||!row.initializer||!ts.isCallExpression(row.initializer))continue;
      const callback=row.initializer.arguments.find(ts.isArrowFunction);if(callback)return `const ${name}=${callback.getText(source)};`;
    }
  }throw new Error(name);
}
function fixture(){
  const registry=sim.bootstrapContentRegistry(),owner={toHexString:()=> 'owner'},other={toHexString:()=> 'other'};
  let inventory:Record<string,sim.ContainerSnapshot>={hotbar:{id:'hotbar',capacity:1,slots:[{itemKind:'carrot',quantity:40}]},
    backpack:{id:'backpack',capacity:1,slots:[{itemKind:'potato',quantity:40}]},equipment:{id:'equipment',capacity:0,slots:[]},crafting:{id:'crafting',capacity:0,slots:[]}};
  let wallet={balanceBronze:100n};
  type Receipt={identity:typeof owner;revision:bigint;lastOrderId:string;completedTick:bigint};
  let receipt:Receipt|null=null;
  const npc={id:BigInt(registry.npcs.get('npc:willow_storekeeper')!.runtimeId),spaceId:10};
  const active={npcId:npc.id,dialogueId:'willow_storekeeper',nodeId:'greeting'};
  const position={spaceId:10};let inReach=true,alive=true,locked=false,mounted=false,hands=false;
  const writes:string[]=[],statistics=vi.fn(),receiptRead=vi.fn((identity:typeof owner)=>identity===owner?receipt:null);
  const ctx={sender:owner,senderAuth:{jwt:null},db:{membership:{identity:{find:()=>null}},
    active_dialogue:{identity:{find:()=>active}},player_position:{identity:{find:()=>position}},
    world_merchant:{npcId:{find:()=>({dialogueId:active.dialogueId})}},world_npc:{id:{find:()=>npc}},
    world_clock:{id:{find:()=>({authorityTick:100n})}},
    player_wallet:{identity:{find:()=>wallet,update:(next:typeof wallet)=>{writes.push('wallet');wallet=next;}}},
    player_village_order_receipt:{identity:{find:receiptRead,update:(next:Receipt)=>{writes.push('receipt');receipt=next;}},insert:(next:Receipt)=>{writes.push('receipt');receipt=next;}}}};
  const dependencies={...sim,SenderError:Error,contentRegistry:()=>registry,requireAuthorizedSender:vi.fn(),
    requirePersistentInventoryAvailable:()=>{if(locked)throw new Error('descent_inventory_locked');},
    npcWithinInteractionReach:()=>inReach,advancePlayerStats:()=>({healthCenti:alive?100:0}),
    mountedNpcFor:()=>mounted?{}:null,handsOccupiedFor:()=>hands,villageOrderVintageRank:()=>0,
    loadPlayerInventory:()=>({containers:inventory,rowBySlot:new Map()}),
    writePlayerInventory:(_ctx:unknown,_rows:unknown,_old:unknown,next:typeof inventory)=>{writes.push('inventory');inventory=next;},
    updateEquippedFromInventory:vi.fn(),refreshSenderQuestsFromInventory:vi.fn(),recordPlayerStatistic:statistics};
  const code=ts.transpile(['activeMerchantSession','fulfillVillageOrder','ownVillageOrders'].map(declaration).join('\n')+';return {fulfillVillageOrder,ownVillageOrders};',{target:ts.ScriptTarget.ES2022});
  const api=new Function(...Object.keys(dependencies),code)(...Object.values(dependencies)) as {
    fulfillVillageOrder:(ctx:unknown,args:{orderId:string;expectedRevision:bigint;expectedContentHash:string;expectedTotalBronze:bigint})=>void;
    ownVillageOrders:(ctx:unknown)=>Array<{id:string;revision:bigint;totalBronze:bigint}>};
  const request={orderId:'market_carrots',expectedRevision:0n,expectedContentHash:registry.contentHash,expectedTotalBronze:530n};
  return {ctx,other,npc,position,active,registry,api,writes,statistics,receiptRead,request,
    snapshot:()=>structuredClone({inventory,wallet,receipt:receipt===null?null:{revision:receipt.revision,lastOrderId:receipt.lastOrderId}}),
    deliver:(args=request)=>api.fulfillVillageOrder(ctx,args),set:(key:string)=>{if(key==='range')inReach=false;if(key==='dead')alive=false;if(key==='locked')locked=true;if(key==='mounted')mounted=true;if(key==='hands')hands=true;}};
}
describe('actual village order reducer and private quote view with fake database boundaries',()=>{
  it('removes exact goods and atomically plans currency and one bounded receipt, even with full bags',()=>{
    const f=fixture();f.deliver();const after=f.snapshot();
    expect(after.wallet.balanceBronze).toBe(630n);expect(after.receipt).toEqual({revision:1n,lastOrderId:'market_carrots'});
    expect(after.inventory.hotbar?.slots[0]?.quantity).toBe(20);expect(after.inventory.backpack?.slots[0]?.quantity).toBe(40);
    expect(f.writes).toEqual(['inventory','wallet','receipt']);expect(f.statistics).toHaveBeenCalledTimes(3);
    expect(()=>f.deliver()).toThrow('order_changed');expect(f.snapshot()).toEqual(after);
    f.deliver({...f.request,expectedRevision:1n});expect(f.snapshot().receipt?.revision).toBe(2n);
  });
  it('rejects stale revisions across order types and merchants before all three stores change',()=>{
    const f=fixture();f.deliver();const after=f.snapshot();
    expect(()=>f.deliver({...f.request,orderId:'market_potatoes',expectedTotalBronze:510n})).toThrow('order_changed');
    f.npc.id=BigInt(f.registry.npcs.get('npc:willow_cook')!.runtimeId);f.active.npcId=f.npc.id;
    expect(()=>f.deliver({...f.request,orderId:'pantry_carrots',expectedTotalBronze:518n})).toThrow('order_changed');
    expect(f.snapshot()).toEqual(after);
  });
  it('re-admits live NPC, space, reach, survival and custody before a delivery',()=>{
    for(const [key,error] of [['range','merchant_out_of_range'],['dead','player_not_alive'],['locked','descent_inventory_locked'],['mounted','mounted_action_forbidden'],['hands','hands_occupied']] as const){
      const f=fixture(),before=f.snapshot();f.set(key);expect(()=>f.deliver()).toThrow(error);expect(f.snapshot()).toEqual(before);expect(f.writes).toEqual([]);
    }
    const f=fixture();expect(()=>f.deliver({...f.request,orderId:'inn_vintage',expectedTotalBronze:5350n})).toThrow('order_wrong_merchant');
    f.position.spaceId=11;expect(()=>f.deliver()).toThrow('merchant_out_of_range');expect(f.writes).toEqual([]);
  });
  it('rejects changed content/quotes and shortage without inventory, wallet or receipt writes',()=>{
    for(const args of [{expectedContentHash:'old'},{expectedTotalBronze:1n},{orderId:'market_grapes'}]){
      const f=fixture(),before=f.snapshot();expect(()=>f.deliver({...f.request,...args})).toThrow();expect(f.snapshot()).toEqual(before);expect(f.writes).toEqual([]);
    }
  });
  it('reads only caller receipt state and advances all quote revisions after a delivery',()=>{
    const f=fixture();expect(f.api.ownVillageOrders(f.ctx).every(row=>row.revision===0n)).toBe(true);
    expect(f.writes).toEqual([]);f.deliver();expect(f.api.ownVillageOrders(f.ctx).every(row=>row.revision===1n)).toBe(true);
    expect(f.api.ownVillageOrders({...f.ctx,sender:f.other}).every(row=>row.revision===0n)).toBe(true);
    expect(f.receiptRead).toHaveBeenCalledWith(f.other);
  });
});
it('derives bottle quotes from only the caller estate vintage and receipt',()=>{
  const registry=sim.bootstrapContentRegistry(),owner={toHexString:()=> 'owner'},other={toHexString:()=> 'other'};
  const estateLookup=vi.fn((identity:typeof owner)=>identity===owner?[{spaceId:900}]:[]);
  const upgradeLookup=vi.fn((id:string)=>id==='900:estate_vintage'?{rank:3}:null);
  const receiptLookup=vi.fn((identity:typeof owner)=>identity===owner?{revision:5n}:null);
  const ctx={sender:owner,db:{homestead:{by_owner:{filter:estateLookup}},homestead_upgrade:{id:{find:upgradeLookup}},player_village_order_receipt:{identity:{find:receiptLookup}}}};
  const dependencies={...sim,contentRegistry:()=>registry,firstIndexRow:(rows:unknown[])=>rows[0]??null};
  const code=ts.transpile(['homesteadUpgradeId','villageOrderVintageRank','ownVillageOrders'].map(declaration).join('\n')+';return ownVillageOrders;',{target:ts.ScriptTarget.ES2022});
  const view=new Function(...Object.keys(dependencies),code)(...Object.values(dependencies)) as (ctx:unknown)=>Array<{id:string;revision:bigint;totalBronze:bigint}>;
  expect(view(ctx).find(row=>row.id==='inn_vintage')).toMatchObject({totalBronze:40350n,revision:5n});
  expect(view({...ctx,sender:other}).find(row=>row.id==='inn_vintage')).toMatchObject({totalBronze:5350n,revision:0n});
  expect(estateLookup).toHaveBeenCalledWith(owner);expect(estateLookup).toHaveBeenCalledWith(other);
  expect(upgradeLookup).toHaveBeenCalledExactlyOnceWith('900:estate_vintage');expect(receiptLookup).toHaveBeenCalledWith(other);
});
