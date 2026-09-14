import type { ContentRegistry } from './content/registry.js';
import { itemContainerContentResolver } from './item-containers.js';
import { activeEquipmentSlotAccepts, EQUIPMENT_SLOT_OFFSET, EQUIPMENT_SLOT_COUNT } from './inventory-layout.js';
import { resolveEquipmentSkillRanks, type EquipmentSkillContribution } from './equipment-skills.js';
import { cappedEquipmentModifiers } from './equipment-budget.js';
import type { Modifier } from './modifiers.js';
import type { SkillRankEffect } from './skill-gear-metadata.js';

export const MAIN_HAND_EQUIPMENT_INDEX = 3;
export const MAIN_HAND_INVENTORY_SLOT = EQUIPMENT_SLOT_OFFSET + MAIN_HAND_EQUIPMENT_INDEX;
export interface EquippedInventoryEntry {
  readonly slot: number; readonly itemKind: string; readonly quantity: number; readonly durability?: number;
}
export function skillEffectContextForItem(registry: ContentRegistry, itemKind: string | undefined): SkillRankEffect['context'] {
  const candidate = itemKind === undefined ? undefined : registry.items.get(`item:${itemKind}`);
  const item = candidate?.retired === true ? undefined : candidate;
  if (item?.combat !== undefined) return 'weapon';
  return item?.tool?.specialization ?? 'global';
}

/** One compilation per action context. Training remains a separate projection;
 * only the delta attributable to gear enters the equipment-only stat budget.
 * Main Hand contributes only while selected; drawing a bow suppresses Off Hand.
 */
export function compileEquipmentLoadout(input: {
  readonly registry: ContentRegistry;
  readonly inventory: readonly EquippedInventoryEntry[];
  readonly selectedSlot: number;
  readonly trainedRanks: Readonly<Record<string,number>>;
  readonly context?: SkillRankEffect['context'];
  readonly bowDrawn?: boolean;
  readonly skillPriority?: readonly string[];
}) {
  const content = itemContainerContentResolver(input.registry);
  const selected = input.inventory.find(row => row.slot === input.selectedSlot);
  const context = input.context ?? skillEffectContextForItem(input.registry, selected?.itemKind);
  const equipped: Modifier[] = [];
  const contributions: EquipmentSkillContribution[] = [];
  const counts = new Map<number,number>();
  for (const row of input.inventory) counts.set(row.slot,(counts.get(row.slot)??0)+1);
  for (const row of input.inventory) {
    const localSlot = row.slot - EQUIPMENT_SLOT_OFFSET;
    if (localSlot < 0 || localSlot >= EQUIPMENT_SLOT_COUNT || row.quantity <= 0
      || !Number.isSafeInteger(row.quantity) || counts.get(row.slot)! > 1
      || !activeEquipmentSlotAccepts(localSlot,row.itemKind,content)) continue;
    const item = input.registry.items.get(`item:${row.itemKind}`)!;
    if (item.retired === true || row.quantity > item.maxStack) continue;
    if (localSlot === MAIN_HAND_EQUIPMENT_INDEX && (row.slot !== input.selectedSlot
      || item.combat === undefined || (item.durability !== undefined && (row.durability ?? 0) <= 0))) continue;
    if (localSlot === 5 && input.bowDrawn === true) continue;
    for (const modifier of item.modifiers ?? []) equipped.push({...modifier,id:`equipment.${row.slot}.${modifier.id}`,source:'equipment'});
    if (item.equip?.skillNode !== undefined && (item.quality === 'rare' || item.quality === 'epic' || item.quality === 'legendary')) {
      contributions.push({sourceId:`equipment.${row.slot}`,nodeId:item.equip.skillNode,quality:item.quality});
    }
  }
  const nodes = [...input.registry.skillTrees.values()].filter(tree => tree.retired !== true).flatMap(tree => tree.nodes);
  const skills = resolveEquipmentSkillRanks(nodes,input.trainedRanks,contributions,input.skillPriority);
  const trained: Modifier[] = [];
  for (const node of nodes) {
    if (node.implemented !== true) continue;
    for (const [index,effect] of (node.effectsPerRank ?? []).entries()) {
      if (effect.context !== 'global' && effect.context !== context) continue;
      const rank = skills.trained[node.id] ?? 0;
      const bonus = skills.bonuses[node.id] ?? 0;
      if (rank > 0) trained.push({id:`skill.${node.id}.${index}`,target:effect.target,layer:'pctAdd',value:rank*effect.value,source:'skill'});
      if (bonus > 0) equipped.push({id:`equipment.skill.${node.id}.${index}`,target:effect.target,layer:'pctAdd',value:bonus*effect.value,source:'equipment'});
    }
  }
  return {skills,modifiers:[...trained,...cappedEquipmentModifiers(equipped)] as readonly Modifier[]};
}
