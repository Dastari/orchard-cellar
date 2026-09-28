import { uiLabInventory } from '../inventory-mock.js';
import { uiSetSlotState } from '../../components/inventory.js';
import type { UiLabSpecimen } from '../registry.js';

/** Item slot S4 (wiki Roadmap/Item Slot Component): a slot gated by a skill, pack or level shows the approved locked face
 * (render 01 C), empty and with an item. It is hovered although it takes no input, so its red corners show. */
export const slotLockedSpecimen: UiLabSpecimen = {
  id: 'slot-locked', title: 'Locked slots', district: 'inventory', size: { width: 280, height: 90 },
  build(ui, _props, mock) {
    const { artwork } = uiLabInventory(mock);
    const empty = ui.slot({ artwork, state: { locked: { reason: 'Needs Smithing 3' } } });
    let locked = true;
    return ui.frame({ header: { title: 'Locked' }, layout: { width: 'grow', height: 'grow', gap: 6, padding: 8 }, children: [
      ui.flex({ direction: 'row', gap: 4, align: 'center' }, [
        empty,
        ui.slot({ artwork, stack: { itemKind: 'pickaxe', quantity: 1 }, state: { locked: { reason: 'Needs Mining 2' } } }),
        ui.button({ label: 'Toggle lock', size: 'sm', onPress: () => { locked = !locked; uiSetSlotState(empty, locked ? { locked: { reason: 'Needs Smithing 3' } } : undefined); mock.activate('toggle-lock'); } }),
      ]),
    ] });
  },
};
