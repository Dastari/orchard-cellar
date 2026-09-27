import type { ItemStack } from '@orchard/sim';
import { BOOTSTRAP_ITEM_CONTAINER_CONTENT, quickCraftCursorStack } from '@orchard/sim/item-containers';
import { UiSlotController, UiSlotGestures, type UiSlotRef, type UiSlotSpreadMode } from '../../components/slot-controller.js';
import type { UiElement } from '../../runtime/element.js';
import { uiLabInventory } from '../inventory-mock.js';
import type { UiLabSpecimen } from '../registry.js';

/** The approved drag feedback (owner decisions 2026-09-27, wiki Roadmap/Item Slot Component render 02), drawn by the
 * kit: refusers dim while a stack is held, the held stack wears the pack cross over a refusing slot, a refused drop
 * flashes, and a spread marks its targets. The furnace refuses ore in its fuel slot and takes nothing in its output. */
export const dragFeedbackSpecimen: UiLabSpecimen = {
  id: 'slot-drag-feedback', title: 'Item slot drag feedback', district: 'inventory', size: { width: 360, height: 220 },
  matrix: { state: ['carrying', 'refusing', 'refused-frame-1', 'refused-frame-2', 'spread'] },
  build(ui, props, mock) {
    const { artwork } = uiLabInventory(mock);
    const state = String(props['state'] ?? 'carrying'), spreading = state === 'spread';
    const slots: Record<string, (ItemStack | null)[]> = {
      furnace: [null, null, { itemKind: 'iron_bar', quantity: 2 }],
      bag: [spreading ? null : { itemKind: 'iron_ore', quantity: 4 }, null, null, { itemKind: 'wood', quantity: 3 }, null],
    };
    let cursor: ItemStack | null = spreading ? { itemKind: 'apple', quantity: 12 } : { itemKind: 'iron_ore', quantity: 12 };
    let preview: { readonly targets: readonly UiSlotRef[]; readonly mode: UiSlotSpreadMode } | null = null;
    const container = (id: string) => ({ id, capacity: slots[id]!.length, slots: slots[id]! });
    const previewed = () => {
      if (preview === null || preview.targets.length < 2) return null;
      const result = quickCraftCursorStack({ furnace: container('furnace'), bag: container('bag') }, cursor, { mode: preview.mode, targets: preview.targets }, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
      return result.ok ? result : null;
    };
    const accepts = (ref: UiSlotRef, kind: string) => ref.container === 'bag'
      || (ref.index === 0 && kind === 'iron_ore') || (ref.index === 1 && (kind === 'wood' || kind === 'coal'));
    const gestures = new UiSlotGestures({
      cursor: () => cursor, has: ref => ref.index < (slots[ref.container]?.length ?? 0),
      stack: ref => previewed()?.containers[ref.container]?.slots[ref.index] ?? slots[ref.container]?.[ref.index] ?? null,
      accepts, maxStack: () => 64, quickMoveSources: () => ['bag'], slotAt: () => null,
    }, {
      click: (ref) => {
        const stack = slots[ref.container]![ref.index] ?? null;
        if (cursor !== null && (!accepts(ref, cursor.itemKind) || stack !== null)) return false;
        slots[ref.container]![ref.index] = cursor; cursor = stack; mock.activate('click'); return true;
      },
      previewSpread: (targets, mode) => { preview = { targets: [...targets], mode }; },
      cancelSpread: () => { preview = null; },
      spread: () => { const result = previewed(); if (result) { slots['furnace'] = [...result.containers['furnace']!.slots]; slots['bag'] = [...result.containers['bag']!.slots]; cursor = result.cursor; } preview = null; mock.activate('spread'); },
      quickMove: () => mock.activate('quick-move'), quickMoveAll: () => mock.activate('quick-move-all'), collect: () => mock.activate('collect'),
      drop: () => mock.activate('drop'), return: () => mock.activate('return'),
    });
    // The held stack as drawn stays the whole stack while a spread is previewed (the preview never changes `cursor`).
    const controller = new UiSlotController(gestures, { displayedCursor: () => cursor, contains: () => true });
    const furnace = ui.inventoryGrid({ container: 'furnace', count: 3, columns: 3, controller, artwork, layout: { width: 'fit' } });
    const bag = ui.inventoryGrid({ container: 'bag', count: 5, columns: 5, controller, artwork, layout: { width: 'fit' } });
    if (state === 'refused-frame-1') controller.refuse([{ container: 'furnace', index: 1 }], 0);
    if (state === 'refused-frame-2') controller.refuse([{ container: 'furnace', index: 1 }], -150);
    if (spreading) {
      const at = (index: number) => ({ x: index * 30, y: 0 }), ref = (index: number) => ({ container: 'bag', index });
      gestures.begin(ref(0), at(0), 0); gestures.move(at(1), ref(1)); gestures.move(at(2), ref(2));
    }
    // The pointer: over the ore slot while carrying, the fuel slot while refused, the last spread target while spreading.
    const pointer = (slot: UiElement) => ({ x: slot.rect.x + 20, y: slot.rect.y + 22 });
    const under = () => spreading ? bag.children[2]! : state === 'carrying' ? furnace.children[0]! : furnace.children[1]!;
    return ui.frame({ header: { title: 'Carrying at a furnace' }, layout: { width: 'grow', height: 'grow', gap: 8, padding: 8 }, children: [
      ui.text('Furnace: ore, fuel, output'), furnace, ui.text('Bag'), bag,
      ui.heldStack({ controller, artwork, point: () => pointer(under()) }),
    ] });
  },
};
