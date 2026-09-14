import {planHearthArchitectureEdits} from './hearth-architecture-edits.js';
import {quickMoveItemStack,slotAcceptsItem,stackMetadataMatches,type ContainerSnapshot,type ItemContainerContentResolver} from './item-containers.js';
import type {ContentRegistry} from './content/registry.js';
export type HearthArchitectureInventoryResult={readonly failure:string}|{
  readonly failure:null;readonly containers:Readonly<Record<string,ContainerSnapshot>>;
};
/** Simulate the server-calculated material delta on copies of carried inventory.
 * Equipment/crafting/cursor/storage are never funding sources. Failure exposes
 * no partial result; caller commits this snapshot and construction together. */
export function planHearthArchitectureInventory(
  containers:Readonly<Record<string,ContainerSnapshot>>,
  materialDelta:Readonly<Record<string,number>>,
  content:ItemContainerContentResolver,
  allowedMaterialKinds:ReadonlySet<string>,
):HearthArchitectureInventoryResult {
  const carried=['hotbar','backpack'] as const;
  if(carried.some(id=>containers[id]===undefined))return {failure:'inventory_unavailable'};
  let next:Record<string,ContainerSnapshot>={...containers};
  for(const id of carried) {
    const current=containers[id]!;
    if(current.id!==id||!Number.isInteger(current.capacity)||current.capacity<0||current.capacity>128
      ||current.slots.slice(current.capacity).some(stack=>stack!=null)
      ||current.slots.some(stack=>stack!=null&&(!Number.isSafeInteger(stack.quantity)||stack.quantity<=0)))return {failure:'invalid_inventory'};
    next[id]={...current,slots:Array.from({length:current.capacity},(_,i)=>current.slots[i]??null)};
  }
  const deltas=Object.entries(materialDelta).sort(([a],[b])=>a.localeCompare(b));
  for(const [item,quantity] of deltas) {
    const maximum=content.maxStackFor(item);
    if(!allowedMaterialKinds.has(item)||!Number.isSafeInteger(quantity)||Math.abs(quantity)>8192
      ||maximum===null||!Number.isSafeInteger(maximum)||maximum<1)return {failure:'invalid_material_delta'};
  }
  for(const [item,quantity] of deltas) {
    if(quantity>=0)continue;
    let remaining=-quantity;
    for(const id of carried) {
      const container=next[id]!,slots=[...container.slots];
      for(let index=0;index<container.capacity&&remaining>0;index++) {
        const stack=slots[index];
        if(stack?.itemKind!==item||!stackMetadataMatches(stack,{itemKind:item,quantity:1})
          ||!slotAcceptsItem(container,index,item,content))continue;
        if(!Number.isSafeInteger(stack.quantity)||stack.quantity<1)return {failure:'invalid_inventory'};
        const consumed=Math.min(remaining,stack.quantity);remaining-=consumed;
        slots[index]=consumed===stack.quantity?null:{...stack,quantity:stack.quantity-consumed};
      }
      next[id]={...container,slots};
    }
    if(remaining>0)return {failure:'construction_materials_missing'};
  }
  for(const [item,quantity] of deltas) {
    if(quantity<=0)continue;
    let remaining=quantity;
    const maximum=content.maxStackFor(item)!;
    while(remaining>0) {
      const amount=Math.min(maximum,remaining),sourceId='__architecture_refund';
      if(next[sourceId]!==undefined)return {failure:'invalid_inventory'};
      const result=quickMoveItemStack({...next,[sourceId]:{id:sourceId,capacity:1,slots:[{itemKind:item,quantity:amount}]}},
        {fromContainer:sourceId,fromIndex:0,toContainers:carried},content);
      if(!result.ok||result.movedQuantity!==amount)return {failure:'construction_refund_inventory_full'};
      // Preserve unrelated containers without retaining the temporary source.
      next={...next,hotbar:result.containers.hotbar!,backpack:result.containers.backpack!};
      remaining-=amount;
    }
  }
  return {failure:null,containers:next};
}

/** A single pre-commit decision for geometry, revision and inventory. The
 * reducer must commit both returned snapshots in its database transaction. */
export function planHearthConstructionTransaction(
  registry: Pick<ContentRegistry,'balances'|'items'>,
  editInput: Parameters<typeof planHearthArchitectureEdits>[1],
  containers: Readonly<Record<string,ContainerSnapshot>>,
  content: ItemContainerContentResolver,
) {
  const edit=planHearthArchitectureEdits(registry,editInput);
  if(edit.failure!==null)return edit;
  const inventory=planHearthArchitectureInventory(containers,edit.materialDelta,content,new Set(Object.keys(edit.materialDelta)));
  if(inventory.failure!==null)return inventory;
  return {failure:null,state:edit.state,containers:inventory.containers,materialDelta:edit.materialDelta} as const;
}
