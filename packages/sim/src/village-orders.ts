import type {ContentRegistry} from './content/registry.js';
import type {NpcDefinitionId,NpcVillageOrderContentDefinition} from './content/npc-definition.js';
import {runtimeItemEconomy,runtimeMaxStack,runtimeDurabilityDefinition,runtimeItemHasTag,runtimeItemInventoryCapacity} from './content/runtime.js';
import {estateVintageTier} from './homestead-upgrades.js';
import {planMerchantSale} from './merchant-cart.js';
import type {ContainerSnapshot} from './item-containers.js';

export interface VillageOrderDefinition extends NpcVillageOrderContentDefinition {
  readonly npc: NpcDefinitionId;
  readonly itemKind: string;
}

/** Projects all live order offers from their owning NPC definitions. Stable
 * sortOrder is authored because registry map ordering is not presentation. */
export function villageOrders(registry:ContentRegistry):readonly VillageOrderDefinition[]{
  return [...registry.npcs.values()].flatMap(npc=>npc.retired===true?[]:(npc.commerce?.villageOrders??[]).map(order=>({
    ...order,npc:npc.id,itemKind:order.item.slice('item:'.length),
  }))).sort((left,right)=>left.sortOrder-right.sortOrder||left.id.localeCompare(right.id));
}

export function villageOrderDefinition(registry:ContentRegistry,orderId:string):VillageOrderDefinition|null{
  const matches=villageOrders(registry).filter(order=>order.id===orderId);
  return matches.length===1?matches[0]!:null;
}

const U64_MAX=(1n<<64n)-1n;
export function villageOrderQuote(registry:ContentRegistry,orderId:string,estateVintageRank:number){
  const order=villageOrderDefinition(registry,orderId);
  if(!order||!Number.isInteger(estateVintageRank)||estateVintageRank<0||estateVintageRank>3)return null;
  const item=registry.items.get(order.item),economy=runtimeItemEconomy(registry,order.itemKind);
  // A future direct shop purchase must not silently become an order-bonus loop.
  if(!item||item.retired===true||item.durability!==undefined||!economy||economy.buyPriceBronze!==null
    ||!Number.isSafeInteger(economy.sellPriceBronze)||economy.sellPriceBronze<0)return null;
  let unitPrice=economy.sellPriceBronze;
  if(item.economy?.salePremium==='estate_vintage'){
    const process=[...registry.processes.values()].find(process=>process.retired!==true&&process.adapter==='fermentation'
      &&process.outputs.some(output=>output.item===item.id));
    if(!process)return null;
    unitPrice=estateVintageTier(estateVintageRank,BigInt(process.ticksPerUnit),unitPrice).sellPriceBronze;
  }
  if(!Number.isSafeInteger(unitPrice)||unitPrice<0)return null;
  const saleValueBronze=BigInt(unitPrice)*BigInt(order.quantity),bonusBronze=BigInt(order.bonusBronze);
  return {...order,saleValueBronze,bonusBronze,totalBronze:saleValueBronze+bonusBronze};
}

/** Pure pre-commit plan. Authority must admit the NPC, load current owner-only
 * receipt/inventory/wallet/content and atomically commit all returned changes. */
export function planVillageOrderDelivery(input:{readonly registry:ContentRegistry;readonly expectedContentHash:string;
  readonly orderId:string;readonly estateVintageRank:number;readonly currentRevision:bigint;readonly expectedRevision:bigint;
  readonly balanceBronze:bigint;readonly expectedTotalBronze:bigint;readonly containers:Readonly<Record<string,ContainerSnapshot>>}){
  const fail=(code:string)=>({ok:false as const,code});
  if(input.expectedContentHash!==input.registry.contentHash)return fail('order_content_changed');
  if(input.currentRevision!==input.expectedRevision)return fail('order_changed');
  if(input.currentRevision<0n||input.currentRevision>=U64_MAX)return fail('order_revision_exhausted');
  const quote=villageOrderQuote(input.registry,input.orderId,input.estateVintageRank);
  if(!quote)return fail('order_unavailable');
  if(quote.totalBronze!==input.expectedTotalBronze)return fail('order_quote_changed');
  if(input.balanceBronze<0n||input.balanceBronze>U64_MAX-quote.totalBronze)return fail('wallet_full');
  for(const id of ['hotbar','backpack'] as const){
    const container=input.containers[id];
    if(!container||container.id!==id||!Number.isSafeInteger(container.capacity)||container.capacity<0
      ||container.capacity>container.slots.length)return fail('order_inventory_invalid');
    for(const [index,stack] of container.slots.entries()){
      if(stack===null)continue;
      if(index>=container.capacity)return fail('order_inventory_invalid');
      if(stack.itemKind!==quote.itemKind)continue;
      if(!Number.isSafeInteger(stack.quantity)||stack.quantity<=0||(stack.durability??0)!==0
        ||container.restrictions?.[index]?.readOnly===true)return fail('order_inventory_invalid');
    }
  }
  const registry=input.registry;
  const sale=planMerchantSale(input.containers,[{itemKind:quote.itemKind,quantity:quote.quantity}],{
    economyFor:kind=>runtimeItemEconomy(registry,kind),maxStackFor:kind=>runtimeMaxStack(registry,kind),
    initialDurabilityFor:kind=>runtimeDurabilityDefinition(registry,kind)?.maximum??null,
    hasTag:(kind,tag)=>runtimeItemHasTag(registry,kind,tag),inventoryCapacityFor:kind=>runtimeItemInventoryCapacity(registry,kind),
  },input.containers.backpack!.capacity);
  if(!sale.ok)return fail(sale.code);
  return {ok:true as const,quote,containers:sale.containers,nextRevision:input.currentRevision+1n,
    nextBalanceBronze:input.balanceBronze+quote.totalBronze};
}
