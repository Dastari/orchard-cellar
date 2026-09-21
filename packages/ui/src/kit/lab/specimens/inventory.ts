import { uiLabInventory } from '../inventory-mock.js';
import type { UiLabSpecimen } from '../registry.js';
export const inventorySpecimen: UiLabSpecimen = {
  id: 'inventory-transactions', title: 'Inventory transactions and equipment', district: 'inventory', size: { width: 1040, height: 900 }, matrix: { columns: ['auto', 4], slotSize: ['auto'] },
  build(ui, props, mock) {
    const status = ui.text('Left pick/place. Right split. Drag to distribute. Shift move. Double-click collect.');
    const { controller, artwork } = uiLabInventory(mock, status, Boolean(props['empty']));
    return ui.frame({ header: { title: 'Inventory transactions' }, resizable: { handles: 'all', min: { width: 96, height: 120 } }, layout: { width: 'grow', height: 'grow', gap: 8 }, children: [
      ui.scrollArea({ gap: 8, width: 'grow', height: 'grow' }, [status, ui.text('Backpack'), ui.inventoryGrid({ container: 'backpack', count: 12, controller, artwork, columns: props['columns'] as 'auto' | number, slotSize: 'auto' }),
        ui.text('Storage'), ui.inventoryGrid({ container: 'entity', count: 12, controller, artwork, columns: 'auto', slotSize: 'auto' }), ui.text('Restricted equipment'), ui.paperDoll({ container: 'equipment', controller, artwork }),
        ui.hotbar({ container: 'hotbar', count: 9, controller, artwork }), ui.button({ label: 'Cancel drag', onPress: () => { controller.cancel(); mock.activate('cancel'); } }),
      ]), ui.cursor({ controller, artwork }),
    ] });
  },
};
