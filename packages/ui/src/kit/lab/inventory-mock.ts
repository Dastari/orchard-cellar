import { resolveFramePaneSlots } from '../../content-frame.js';
import type { UiContentFrameOptions } from '../components/content-frame.js';
import { EQUIPMENT_SLOT_COUNT, EQUIPMENT_SLOT_RESTRICTIONS, HOTBAR_SLOT_COUNT, itemDefinition, slotAcceptsItem, type ContainerSnapshot } from '@orchard/sim';
import type { LoadedAsset } from '../../assets.js';
import { UiInventoryController, UiInventoryInteractionModel } from '../runtime/inventory.js';
import type { UiLabMocks } from './registry.js';
import type { UiElement } from '../runtime/element.js';
export const UI_LAB_ITEM_KINDS = ['wood','plank','stone','iron_ore','iron_bar','apple','grape','axe','pickaxe','torch','lantern','watch','helm','tunic','backpack','chest','barrel','workbench','furnace','cooking_fire','orchard_tea','beetroot','raw_beef','cooked_beef','must','pomace','bottles'] as const;
export function uiLabInventory(mock: UiLabMocks, status?: UiElement, empty = false, frame?: Pick<UiContentFrameOptions, 'definition' | 'aliases' | 'registry'>) {
  const containers: Record<string, ContainerSnapshot> = {
    backpack: { id: 'backpack', capacity: 12, slots: empty ? [] : [{ itemKind: 'wood', quantity: 9 }, { itemKind: 'wood', quantity: 4 }, { itemKind: 'apple', quantity: 7 }, { itemKind: 'grape', quantity: 6 }, { itemKind: 'helm', quantity: 1 }, { itemKind: 'watch', quantity: 1 }, { itemKind: 'axe', quantity: 1 }] },
    entity: { id: 'entity', capacity: 12, slots: empty ? [] : [{ itemKind: 'iron_ore', quantity: 12 }, { itemKind: 'wood', quantity: 18 }, { itemKind: 'iron_bar', quantity: 2 }] },
    hotbar: { id: 'hotbar', capacity: HOTBAR_SLOT_COUNT, slots: empty ? [] : [{ itemKind: 'axe', quantity: 1 }, { itemKind: 'pickaxe', quantity: 1 }, { itemKind: 'torch', quantity: 8 }] },
    equipment: { id: 'equipment', capacity: EQUIPMENT_SLOT_COUNT, slots: [], restrictions: EQUIPMENT_SLOT_RESTRICTIONS },
    crafting: { id: 'crafting', capacity: 10, slots: [] },
  };
  if (frame && !empty && frame.aliases.entity) {
    if (frame.definition.id === 'frame:cooking') containers[frame.aliases.entity] = { id: frame.aliases.entity, capacity: 2, slots: [{ itemKind: 'raw_beef', quantity: 4 }, { itemKind: 'cooked_beef', quantity: 2 }] };
    else if (frame.definition.id === 'frame:press') containers[frame.aliases.entity] = { id: frame.aliases.entity, capacity: 3, slots: [{ itemKind: 'apple', quantity: 4 }, { itemKind: 'must', quantity: 2 }, { itemKind: 'pomace', quantity: 2 }] };
    else if (frame.definition.id === 'frame:fermentation') containers[frame.aliases.entity] = { id: frame.aliases.entity, capacity: 2, slots: [{ itemKind: 'must', quantity: 6 }, { itemKind: 'bottles', quantity: 2 }] };
    else if (frame.definition.id === 'frame:barrel') containers[frame.aliases.entity] = { id: frame.aliases.entity, capacity: 10, slots: [{ itemKind: 'beetroot', quantity: 8 }] };
  }
  if (frame) for (const pane of frame.definition.panes) for (const binding of resolveFramePaneSlots(pane, frame.aliases, frame.registry)) {
    const previous = containers[binding.containerId] ?? { id: binding.containerId, capacity: 0, slots: [] };
    containers[binding.containerId] = { ...previous, capacity: Math.max(previous.capacity, binding.index + 1),
      restrictions: { ...previous.restrictions, ...(binding.restriction ? { [binding.index]: binding.restriction } : {}) } };
  }
  if (frame) for (const [id, container] of Object.entries(containers)) containers[id] = { ...container,
    slots: container.slots.map((stack, index) => stack && !container.restrictions?.[index]?.readOnly && !slotAcceptsItem(container, index, stack.itemKind) ? null : stack) };
  const model = new UiInventoryInteractionModel(containers, null, { backpack: ['entity'], entity: ['backpack'], equipment: ['backpack'], hotbar: ['backpack'] });
  const controller = new UiInventoryController(model, result => { status?.setProps({ text: result.status }); mock.activate(result.status); });
  const artwork: Record<string, LoadedAsset> = {};
  for (const kind of UI_LAB_ITEM_KINDS) { const name = itemDefinition(kind)?.iconKey; if (!name) continue; mock.requestAsset?.(name); Object.defineProperty(artwork, kind, { enumerable: true, get: () => mock.assets?.get(name) }); }
  return { model, controller, artwork, containers };
}
