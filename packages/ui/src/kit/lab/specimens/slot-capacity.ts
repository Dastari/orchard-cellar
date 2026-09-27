import { uiLabInventory } from '../inventory-mock.js';
import type { UiLabSpecimen } from '../registry.js';

/** Item slot S4 (wiki Roadmap/Item Slot Component): a backpack's cells past its capacity show the approved disabled
 * face (render 01 B) instead of being hidden, and a slot gated by a skill, pack or level shows the locked face (01 C). */
export const slotCapacitySpecimen: UiLabSpecimen = {
  id: 'slot-capacity', title: 'Backpack capacity and locked slots', district: 'inventory', size: { width: 360, height: 280 },
  matrix: { capacity: [8, 20] },
  build(ui, props, mock) {
    const { controller, artwork, containers } = uiLabInventory(mock);
    const capacity = Number(props['capacity'] ?? 8);
    containers['backpack'] = { ...containers['backpack']!, capacity: 20 };
    return ui.frame({ header: { title: 'Backpack' }, layout: { width: 'grow', height: 'grow', gap: 6, padding: 8 }, children: [
      ui.inventoryPanel({ container: 'backpack', count: 20, columns: 5, controller, artwork, capacity: () => capacity, showFilter: false }),
      ui.flex({ direction: 'row', gap: 4, align: 'center' }, [
        ui.slot({ artwork, state: { locked: { reason: 'Needs Smithing 3' } } }),
        ui.slot({ artwork, stack: { itemKind: 'pickaxe', quantity: 1 }, state: { locked: { reason: 'Needs Mining 2' } } }),
        ui.text('Locked: needs a skill, pack or level', { role: 'caption' }),
      ]),
    ] });
  },
};
