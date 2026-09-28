import {runtimeRangedWeaponDefinition,runtimeToolDefinition,runtimeVigourDefinition,runtimeWeaponBaseDamageCenti} from './content/runtime.js';
import type {ContentRegistry} from './content/registry.js';
import type {EquippedInventoryEntry} from './equipment-loadout.js';
import {activeEquipmentSlotAccepts,EQUIPMENT_SLOT_OFFSET,isAccessibleCarriedSlot} from './inventory-layout.js';
import {itemContainerContentResolver} from './item-containers.js';

/** Readiness is current equipment, not ownership or permanent progression.
 * Weapons need not be drawn during a conversation; bows need ten carried shots.
 * `backpackCapacity` is the player's accessible backpack capacity (equipped bag and debug slots), the same one the
 * world's bow uses, so a bow counted ready can fire and one that can fire is counted (BUG-068). */
export function hearthExpeditionPreparation(registry:ContentRegistry,inventory:readonly EquippedInventoryEntry[],backpackCapacity:number):{weapon:number;body:number}{
  const content=itemContainerContentResolver(registry);
  const valid=(row:EquippedInventoryEntry)=>{
    const item=registry.items.get(`item:${row.itemKind}`);
    return item!==undefined&&item.retired!==true&&Number.isSafeInteger(row.quantity)&&row.quantity>0&&row.quantity<=item.maxStack
      &&inventory.filter(other=>other.slot===row.slot).length===1
      &&(item.durability===undefined||(Number.isSafeInteger(row.durability)&&(row.durability??0)>0&&(row.durability??0)<=item.durability.max));
  };
  const equipped=(index:number)=>inventory.find(row=>row.slot===EQUIPMENT_SLOT_OFFSET+index&&valid(row)&&activeEquipmentSlotAccepts(index,row.itemKind,content));
  const weapon=equipped(3),body=equipped(9);
  const weaponDefinition=weapon&&registry.items.get(`item:${weapon.itemKind}`);
  const attackKind=weaponDefinition?.combat?.attackKind;
  let ready=weapon!==undefined&&attackKind!==undefined
    &&runtimeWeaponBaseDamageCenti(registry,weapon.itemKind,attackKind)!==null
    &&runtimeToolDefinition(registry,weapon.itemKind)!==null&&runtimeVigourDefinition(registry,weapon.itemKind)!==null;
  if(ready&&attackKind==='ranged'){
    const ranged=runtimeRangedWeaponDefinition(registry,weapon!.itemKind);
    if(ranged===null)return {weapon:0,body:body?1:0};
    const ammunition=ranged.ammunitionItemKind;
    // The cells the bow draws from (BUG-056, BUG-068): the hotbar and the accessible backpack, nothing stranded.
    const shots=inventory.filter(row=>isAccessibleCarriedSlot(row.slot,backpackCapacity)
      &&row.itemKind===ammunition&&valid(row)).reduce((sum,row)=>sum+row.quantity,0);
    ready=shots>=10;
  }
  return {weapon:ready?1:0,body:body?1:0};
}
