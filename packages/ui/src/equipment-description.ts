import {
  activeEquipmentSlotAccepts, compileEquipmentLoadout, EQUIPMENT_SLOTS, EQUIPMENT_SLOT_OFFSET,
  itemContainerContentResolver, MAIN_HAND_INVENTORY_SLOT,
  type ContentRegistry, type EquippedInventoryEntry, type Modifier,
} from '@orchard/sim';
const labels: Partial<Record<Modifier['target'],string>> = {
  attackPower:'MELEE POWER',rangedPower:'RANGED POWER',maxHealth:'MAX HEALTH',maxVigour:'MAX VIGOUR',
  criticalChance:'CRITICAL CHANCE',armor:'ARMOR',armorPct:'DAMAGE REDUCTION',
  toolVigourCost:'ACTION VIGOUR COST',sprintVigourCost:'SPRINT VIGOUR COST',swingSpeed:'ATTACK INTERVAL',
};
function modifierLabel(mod:Modifier):string {
  const unit=mod.target==='criticalChance' ? ' POINTS' : mod.layer==='pctAdd' || mod.target==='armorPct' ? '%' : '';
  return `${mod.value>=0?'+':''}${Number((mod.value/100).toFixed(2))}${unit} ${labels[mod.target]??mod.target.toUpperCase()}`;
}
/** The same preview serves inventory and purchase/crafting cards. It never
 * changes the player's trained ranks, selected item or inventory custody. */
export function equipmentDescriptionLines(
  registry:ContentRegistry, itemKind:string, inventory:readonly EquippedInventoryEntry[], selectedSlot:number,
  trainedRanks:Readonly<Record<string,number>>, skillPriority:readonly string[] = [],
): readonly string[] | null {
  const item=registry.items.get(`item:${itemKind}`);
  if (item===undefined || item.retired===true || (item.combat===undefined && !item.tags.includes('item.armor')
    && !item.tags.includes('item.shield') && item.equip?.slot!=='neck')) return null;
  const content=itemContainerContentResolver(registry);
  const slot=EQUIPMENT_SLOTS.find(slot=>activeEquipmentSlotAccepts(slot.index,itemKind,content));
  if (slot===undefined) return null;
  const globalSlot=EQUIPMENT_SLOT_OFFSET+slot.index;
  const previous=inventory.find(row=>row.slot===globalSlot);
  const previousItem=previous===undefined?undefined:registry.items.get(`item:${previous.itemKind}`);
  const previewInventory=[...inventory.filter(row=>row.slot!==globalSlot),{
    slot:globalSlot,itemKind,quantity:1,...(item.durability===undefined?{}:{durability:item.durability.max}),
  }];
  const previewSelected=slot.id==='main_hand'?MAIN_HAND_INVENTORY_SLOT:selectedSlot;
  const before=compileEquipmentLoadout({registry,inventory,selectedSlot:previewSelected,trainedRanks,skillPriority});
  const after=compileEquipmentLoadout({registry,inventory:previewInventory,selectedSlot:previewSelected,trainedRanks,skillPriority});
  const lines=[item.displayName.toUpperCase(),`${item.quality.toUpperCase()} / ${slot.label}`];
  if (item.combat!==undefined) {
    const old=previousItem?.combat;
    const change=old?.attackKind===item.combat.attackKind?` (CURRENT ${old.baseDamageCenti/100})`:'';
    lines.push(`BASE DAMAGE ${item.combat.baseDamageCenti/100}${change}`);
    lines.push('BONUSES APPLY WHEN EQUIPPED AND SELECTED');
  }
  lines.push(...(item.modifiers??[]).map(modifierLabel));
  if (item.equip?.skillNode!==undefined) {
    const id=item.equip.skillNode;
    const node=[...registry.skillTrees.values()].flatMap(tree=>tree.nodes).find(node=>node.id===id);
    lines.push(`+1 ${node?.name.toUpperCase()??id.toUpperCase()}`);
    const trained=after.skills.trained[id]??0;
    if (trained===0) lines.push('INACTIVE: TRAIN THIS SKILL FIRST');
    else {
      lines.push(`${trained} TRAINED + ${after.skills.bonuses[id]??0} GEAR = ${after.skills.effective[id]} EFFECTIVE (MAX ${after.skills.maximums[id]})`);
      lines.push(`ON EQUIP: ${before.skills.effective[id]} → ${after.skills.effective[id]} EFFECTIVE`);
    }
  }
  if (previousItem!==undefined && previousItem.id!==item.id) lines.push(`REPLACES ${previousItem.displayName.toUpperCase()}`);
  if (item.tags.includes('item.armor')) lines.push('APPEARANCE: STANDARD OUTFIT');
  return lines;
}
