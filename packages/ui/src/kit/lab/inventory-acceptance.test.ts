import { expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { ui } from '../components/index.js';
import { UiInventoryController, UiInventoryInteractionModel } from '../runtime/inventory.js';
function setup() {
  const model = new UiInventoryInteractionModel({ bag: { id: 'bag', capacity: 4, slots: [{ itemKind: 'wood', quantity: 9 }, { itemKind: 'apple', quantity: 7 }, null, null] }, chest: { id: 'chest', capacity: 4, slots: [null,null,null,null] }, equipment: { id: 'equipment', capacity: 1, slots: [null], restrictions: { 0: { requiredTags: ['gear.head'] } } } });
  const action = vi.fn(), controller = new UiInventoryController(model, action), root = new UiRoot({ scale: 1 }); root.resize(500, 400);
  root.mount(ui.flex({ gap: 8 }, ['bag','chest','equipment'].map(container => ui.inventoryGrid({ container, count: container === 'equipment' ? 1 : 4, controller, columns: 4, slotSize: 'sm' })))); root.arrange();
  const slot = (name: string) => root.entries().find(({ element }) => element.kind === 'slot' && element.label === name)!.element;
  const point = (name: string) => { const r = slot(name).rect; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const pointer = (type: 'down' | 'move' | 'up', name: string, button = 0) => root.pointer({ type, point: point(name), pointerId: 1, button });
  return { model, controller, root, slot, pointer, action };
}
it('picks, splits, places and distributes across separate retained grids with capture', () => {
  const { model, root, pointer } = setup();
  pointer('down','bag/0',2); pointer('up','bag/0',2); expect(model.cursor?.quantity).toBe(5); expect(model.stack({ container: 'bag', index: 0 })?.quantity).toBe(4);
  pointer('down','chest/0'); pointer('move','chest/1'); pointer('up','chest/1'); expect(model.stack({ container: 'chest', index: 0 })?.quantity).toBe(2); expect(model.stack({ container: 'chest', index: 1 })?.quantity).toBe(2); expect(model.cursor?.quantity).toBe(1); root.dispose();
});
it('preserves cursor items on denied equipment drops and supports keyboard quick move', () => {
  const { model, root, slot } = setup(); root.focus.set(slot('bag/0')); root.key({ key: 'Enter' }); expect(model.cursor?.quantity).toBe(9);
  root.focus.set(slot('equipment/0')); root.key({ key: 'Enter' }); expect(model.cursor?.quantity).toBe(9); expect(model.stack({ container: 'equipment', index: 0 })).toBeNull();
  root.focus.set(slot('bag/0')); root.key({ key: 'Enter' }); expect(model.cursor).toBeNull(); root.key({ key: 'Enter', shiftKey: true }); expect(model.stack({ container: 'bag', index: 0 })).toBeNull(); expect(model.stack({ container: 'chest', index: 0 })?.quantity).toBe(9); root.dispose();
});
it('reflows automatic columns and changes slot sizes only in integer steps', () => {
  const root = new UiRoot({ scale: 1 }), grid = ui.inventoryGrid({ container: 'bag', count: 12, columns: 'auto', slotSize: 'auto', layout: { width: 'grow', height: 'grow' } }); root.mount(grid);
  const sizes = new Set<number>();
  for (const width of [160,320,640]) { root.resize(width,300); root.arrange(); const size = Number(grid.props['slotWidth']); sizes.add(size); expect(size % 28).toBe(0); const rows = grid.children;
    for (const cell of rows) { expect(cell.rect.width).toBe(size); expect(cell.rect.x + cell.rect.width).toBeLessThanOrEqual(width); }
  }
  expect(sizes.size).toBeGreaterThan(1); root.dispose();
});
it('packs each inventory and hotbar with the same two-pixel gap in both axes at every UI scale', () => {
  for (const scale of [1,2,3] as const) for (const width of [320,640,960]) for (const size of ['sm','md','lg','auto'] as const) {
    const root = new UiRoot({ scale }); root.resize(width,600);
    const inventory = ui.inventoryGrid({ container: 'bag', count: 12, columns: 4, slotSize: size }), hotbar = ui.hotbar({ container: 'hotbar', slotSize: size });
    root.mount(ui.flex({ width: 'grow', gap: 8 }, [inventory,hotbar])); root.arrange();
    for (const grid of [inventory,hotbar]) {
      const columns = Number(grid.props['columns']), slots = grid.children;
      for (let index = 0; index < slots.length; index++) {
        const r = slots[index]!.rect; expect(r.width / 28).toBe(r.height / 31);
        if (index % columns) { const previous = slots[index - 1]!.rect; expect(r.x - previous.x - previous.width).toBe(2); }
        if (index >= columns) { const previous = slots[index - columns]!.rect; expect(r.y - previous.y - previous.height).toBe(2); }
      }
    }
    root.dispose();
  }
});

it('executes keyboard transactions when no action observer is installed', () => {
  const model = new UiInventoryInteractionModel({ bag: { id: 'bag', capacity: 2, slots: [{ itemKind: 'wood', quantity: 4 }, null] } });
  const controller = new UiInventoryController(model);
  controller.activate({ container: 'bag', index: 0 }); expect(model.cursor?.quantity).toBe(4);
  controller.activate({ container: 'bag', index: 1 }); expect(model.cursor).toBeNull();
  expect(model.stack({ container: 'bag', index: 1 })?.quantity).toBe(4); controller.dispose();
});
