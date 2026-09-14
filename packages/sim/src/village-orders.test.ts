import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import {villageOrders,villageOrderQuote,planVillageOrderDelivery} from './village-orders.js';
import type {ContainerSnapshot} from './item-containers.js';
import type {NpcContentDefinition} from './content/npc-definition.js';
const registry=bootstrapContentRegistry();
const inventory=(quantity=20):Record<string,ContainerSnapshot>=>({
  hotbar:{id:'hotbar',capacity:2,slots:[{itemKind:'carrot',quantity:Math.min(10,quantity)},null]},
  backpack:{id:'backpack',capacity:1,slots:[quantity>10?{itemKind:'carrot',quantity:quantity-10}:null]},
  equipment:{id:'equipment',capacity:0,slots:[]},crafting:{id:'crafting',capacity:1,slots:[{itemKind:'carrot',quantity:99}]},
});
const input=(containers=inventory())=>({registry,expectedContentHash:registry.contentHash,orderId:'market_carrots',estateVintageRank:0,currentRevision:0n,expectedRevision:0n,balanceBronze:100n,expectedTotalBronze:530n,containers});
describe('repeatable peaceful order pre-commit plan',()=>{
  it('preserves normal sale value and adds exactly350bronze, including all vintage ranks',()=>{
    expect(villageOrders(registry).map(order=>villageOrderQuote(registry,order.id,0)?.totalBronze)).toEqual([530n,510n,530n,518n,494n,626n,5350n]);
    expect([0,1,2,3].map(rank=>villageOrderQuote(registry,'inn_vintage',rank)?.totalBronze)).toEqual([5350n,10350n,20350n,40350n]);
    expect(villageOrderQuote(registry,'inn_vintage',4)).toBeNull();
  });
  it('consumes one exact delivery on copies and returns a receipt revision and full wallet delta',()=>{
    const before=inventory(25),copy=structuredClone(before),result=planVillageOrderDelivery(input(before));
    expect(result.ok).toBe(true);if(!result.ok)return;
    expect(before).toEqual(copy);expect(result.nextRevision).toBe(1n);expect(result.nextBalanceBronze).toBe(630n);
    expect(result.containers.hotbar?.slots[0]).toBeNull();expect(result.containers.backpack?.slots[0]).toMatchObject({itemKind:'carrot',quantity:5});
    expect(result.containers.crafting).toBe(before.crafting);
    expect(planVillageOrderDelivery({...input(before),currentRevision:result.nextRevision})).toEqual({ok:false,code:'order_changed'});
  });
  it('rejects missing goods, stale content, overflow and inaccessible or read-only custody without a partial plan',()=>{
    expect(planVillageOrderDelivery(input(inventory(19)))).toMatchObject({ok:false,code:'sale_quantity_missing'});
    expect(planVillageOrderDelivery({...input(),expectedContentHash:'stale'})).toMatchObject({ok:false,code:'order_content_changed'});
    expect(planVillageOrderDelivery({...input(),balanceBronze:(1n<<64n)-1n})).toMatchObject({ok:false,code:'wallet_full'});
    expect(planVillageOrderDelivery({...input(),currentRevision:(1n<<64n)-1n,expectedRevision:(1n<<64n)-1n})).toMatchObject({ok:false,code:'order_revision_exhausted'});
    const blocked=inventory();blocked.hotbar={...blocked.hotbar!,restrictions:{0:{readOnly:true}}};expect(planVillageOrderDelivery(input(blocked))).toMatchObject({ok:false,code:'order_inventory_invalid'});
    const overflow=inventory();overflow.backpack={...overflow.backpack!,capacity:0};expect(planVillageOrderDelivery(input(overflow))).toMatchObject({ok:false,code:'order_inventory_invalid'});
  });
  it('requires a fresh quote after vintage changes and permits a legitimate next delivery revision',()=>{
    const bottles=inventory();bottles.hotbar={id:'hotbar',capacity:1,slots:[{itemKind:'bottles',quantity:1}]};
    const quoted={...input(bottles),orderId:'inn_vintage',estateVintageRank:1,expectedTotalBronze:5350n};
    expect(planVillageOrderDelivery(quoted)).toEqual({ok:false,code:'order_quote_changed'});
    expect(bottles.hotbar.slots[0]?.quantity).toBe(1);
    const accepted=planVillageOrderDelivery({...quoted,expectedTotalBronze:10350n});
    expect(accepted.ok).toBe(true);
    expect(planVillageOrderDelivery({...input(),currentRevision:1n,expectedRevision:1n}).ok).toBe(true);
  });
  it('withdraws an order when live content retires or makes its goods directly purchasable',()=>{
    const retired={...registry,items:new Map(registry.items)};retired.items.set('item:carrot',{...registry.items.get('item:carrot')!,retired:true});
    expect(villageOrderQuote(retired,'market_carrots',0)).toBeNull();
    const buyableItems=new Map(registry.items);
    const carrot=registry.items.get('item:carrot')!;
    buyableItems.set(carrot.id,{...carrot,economy:{...carrot.economy!,buy:1}});
    const buyable={...registry,items:buyableItems};
    expect(villageOrderQuote(buyable,'market_carrots',0)).toBeNull();
  });
  it('follows arbitrary authored NPC, item and order identities instead of legacy names',()=>{
    const sourceItem=registry.items.get('item:carrot')!,sourceNpc=registry.npcs.get('npc:willow_storekeeper')!;
    const items=new Map(registry.items),npcs=new Map<string,NpcContentDefinition>();
    for(const [id,npc] of registry.npcs){const {commerce,...withoutCommerce}=npc;void commerce;npcs.set(id,withoutCommerce);}
    items.set('item:sunroot',{...sourceItem,id:'item:sunroot'});
    npcs.set('npc:harvest_curator',{...sourceNpc,id:'npc:harvest_curator',runtimeId:'99001',commerce:{villageOrders:[{
      id:'sunroot_crate',title:'Sunroot crate',item:'item:sunroot',quantity:4,bonusBronze:17,sortOrder:0,
    }]}});
    const authored={...registry,items,npcs,compiled:{...registry.compiled,itemEconomy:{
      ...registry.compiled.itemEconomy,sunroot:registry.compiled.itemEconomy.carrot!,
    }}};
    expect(villageOrders(authored)).toEqual([expect.objectContaining({id:'sunroot_crate',npc:'npc:harvest_curator',itemKind:'sunroot'})]);
    expect(villageOrderQuote(authored,'sunroot_crate',0)).toMatchObject({saleValueBronze:36n,bonusBronze:17n,totalBronze:53n});
    expect(villageOrderQuote(authored,'market_carrots',0)).toBeNull();
  });
});
