import type { ContainerBinding } from './container-binding.js';
import { widget, type WidgetNode } from './widget.js';

export function barrelWindow(binding: ContainerBinding = 'dev:barrel'): WidgetNode {
  return widget('window', 'window.barrel', { minSize: { width: 132, height: 84 }, props: { title: 'Barrel' }, capturePointer: true })
    .add(widget('inventory_grid', 'grid.barrel', { minSize: { width: 120, height: 60 }, props: { binding, columns: 4, rows: 2 } }));
}

export function craftingWindow(binding: ContainerBinding = 'dev:crafting'): WidgetNode {
  return widget('window', 'window.crafting', { minSize: { width: 180, height: 132 }, props: { title: 'Crafting' }, capturePointer: true })
    .add(widget('row', 'row.crafting').add(
      widget('inventory_grid', 'grid.crafting', { minSize: { width: 90, height: 90 }, props: { binding, columns: 3, rows: 3 } }),
      widget('icon', 'icon.crafting_arrow', { minSize: { width: 16, height: 16 }, props: { asset: 'ui_cf_cursor' } }),
      widget('slot', 'slot.crafting_result', { minSize: { width: 28, height: 31 }, props: { binding, index: 9, role: 'result' } }),
    ), widget('button', 'button.craft', { minSize: { width: 64, height: 16 }, props: { label: 'Craft', recipeId: 'dev_planks' } }));
}

export function packWindow(backpack: ContainerBinding = 'self:backpack', equipment = 'self:equipment'): WidgetNode {
  const paperDoll = widget('inventory_grid', 'grid.paper_doll', { props: { binding: equipment, columns: 3, rows: 3 } })
    .add(...Array.from({ length: 8 }, (_, index) => widget('slot', `slot.equipment.${index}`, {
      minSize: { width: 28, height: 31 }, enabled: false, props: { binding: equipment, index, disabled: true },
    })));
  const backpackGrid = widget('inventory_grid', 'grid.backpack', {
    minSize: { width: 150, height: 120 }, enabled: false,
    props: { binding: backpack, columns: 5, rows: 4, disabled: true, unlockRequirement: 'backpack' },
  });
  const hotbar = widget('inventory_grid', 'grid.hotbar', {
    minSize: { width: 270, height: 31 }, props: { binding: 'self:hotbar', columns: 9, rows: 1 },
  });
  return widget('window', 'window.pack', { minSize: { width: 320, height: 220 }, props: { title: 'Inventory' }, capturePointer: true })
    .add(widget('row', 'row.pack').add(
      paperDoll,
      backpackGrid,
    ), hotbar);
}

export const UI_FIXTURE_ROWS = [
  { containerId: 'player:local:backpack', index: 0, itemKind: 'axe', quantity: 1 },
  { containerId: 'player:local:backpack', index: 1, itemKind: 'wood', quantity: 12 },
  { containerId: 'dev:barrel', index: 3, itemKind: 'apple', quantity: 6 },
] as const;
