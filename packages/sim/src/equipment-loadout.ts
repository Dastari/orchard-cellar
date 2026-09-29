import type { ContentRegistry } from './content/registry.js';
import { itemContainerContentResolver } from './item-containers.js';
import { activeEquipmentSlotAccepts, EQUIPMENT_SLOT_COUNT } from './inventory-layout.js';
import { resolveEquipmentSkillRanks, type EquipmentSkillContribution } from './equipment-skills.js';
import { cappedEquipmentModifiers } from './equipment-budget.js';
import type { Modifier } from './modifiers.js';
import type { SkillRankEffect } from './skill-gear-metadata.js';
import { isMainHandSelectedSlot, MAIN_HAND_EQUIPMENT_INDEX, MAIN_HAND_SELECTED_SLOT, selectedSlotCell } from './container-addressing.js';

export { MAIN_HAND_EQUIPMENT_INDEX } from './container-addressing.js';
/** Legacy name for `MAIN_HAND_SELECTED_SLOT`: a named selected-slot value, not layout arithmetic. */
export const MAIN_HAND_INVENTORY_SLOT = MAIN_HAND_SELECTED_SLOT;
/** One carried cell as the sim rules read it (Uncapped Storage step 5): a container plus its u32 index, never a global
 * slot, so no container's size moves another's cells. The world's `player_container_cell` rows and the client's
 * `PlayerCellStack` rows both fit it as they are. */
export interface CarriedCellEntry {
  readonly container: string; readonly index: number;
  readonly itemKind: string; readonly quantity: number; readonly durability?: number;
}
/** Identity of a cell within one player's carried rows. */
export function carriedCellKey(cell: { readonly container: string; readonly index: number }): string {
  return `${cell.container}:${cell.index}`;
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
  /** The player's carried cells; only the equipment cells and the selected cell are read. */
  readonly inventory: readonly CarriedCellEntry[];
  readonly selectedSlot: number;
  readonly trainedRanks: Readonly<Record<string,number>>;
  readonly context?: SkillRankEffect['context'];
  readonly bowDrawn?: boolean;
  readonly skillPriority?: readonly string[];
}) {
  const content = itemContainerContentResolver(input.registry);
  const selectedCell = selectedSlotCell(input.selectedSlot);
  const selected = selectedCell === null ? undefined
    : input.inventory.find(row => row.container === selectedCell.container && row.index === selectedCell.index);
  const context = input.context ?? skillEffectContextForItem(input.registry, selected?.itemKind);
  const equipped: Modifier[] = [];
  const contributions: EquipmentSkillContribution[] = [];
  const counts = new Map<string,number>();
  for (const row of input.inventory) counts.set(carriedCellKey(row),(counts.get(carriedCellKey(row))??0)+1);
  // Equipment index order, whatever order the cells arrive in, so the compiled modifiers never depend on row order.
  const byIndex = [...input.inventory].sort((left, right) => left.index - right.index);
  for (const row of byIndex) {
    const index = row.index;
    if (row.container !== 'equipment' || !Number.isInteger(index) || index < 0 || index >= EQUIPMENT_SLOT_COUNT
      || row.quantity <= 0 || !Number.isSafeInteger(row.quantity) || counts.get(carriedCellKey(row))! > 1
      || !activeEquipmentSlotAccepts(index,row.itemKind,content)) continue;
    const item = input.registry.items.get(`item:${row.itemKind}`)!;
    if (item.retired === true || row.quantity > item.maxStack) continue;
    if (index === MAIN_HAND_EQUIPMENT_INDEX && (!isMainHandSelectedSlot(input.selectedSlot)
      || item.combat === undefined || (item.durability !== undefined && (row.durability ?? 0) <= 0))) continue;
    if (index === 5 && input.bowDrawn === true) continue;
    for (const modifier of item.modifiers ?? []) equipped.push({...modifier,id:`equipment.${index}.${modifier.id}`,source:'equipment'});
    if (item.equip?.skillNode !== undefined && (item.quality === 'rare' || item.quality === 'epic' || item.quality === 'legendary')) {
      contributions.push({sourceId:`equipment.${index}`,nodeId:item.equip.skillNode,quality:item.quality});
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
