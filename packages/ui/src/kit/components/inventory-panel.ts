import { itemDefinition, type ItemStack } from '@orchard/sim';
import { UiElement } from '../runtime/element.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { uiFlex } from './layout.js';
import { uiInput } from './input.js';
import { uiIconButton } from './media.js';
import { uiInventoryGrid, type UiInventoryGridOptions } from './inventory.js';

export interface UiInventoryControls {
  readonly filter?: string;
  readonly onFilter?: (value: string) => void;
  readonly onSort?: () => void;
  readonly itemLabel?: (item: ItemStack) => string;
  /** Capacity belongs to the host; filtering never renumbers slot bindings. */
  readonly capacity?: () => number;
}

/** Search and sort surround a tightly packed inventory, preserving the editor
 * and the authority controller when the visible set of cells changes. */
export function uiInventoryPanel(options: UiInventoryGridOptions & UiInventoryControls): UiElement {
  const editor = new CanvasTextEditor({ value: options.filter, maxLength: 32 });
  const cells = (options.cells ?? Array.from({ length: options.count ?? 6 }, (_, index) => ({ id: String(index), index })))
    .map((cell, index) => ({ ...cell, index: cell.index ?? index }));
  const body = uiFlex({ width: 'grow' });
  let previous = '';
  const refresh = () => {
    const query = editor.snapshot().value.trim().toLowerCase();
    const visible = cells.filter(cell => {
      const index = cell.index;
      if (index >= (options.capacity?.() ?? Infinity)) return false;
      if (!query) return true;
      const item = options.controller ? options.controller.model.stack({ container: options.container, index }) : options.stack?.(index);
      return Boolean(item && (item.itemKind.toLowerCase().includes(query)
        || (options.itemLabel?.(item) ?? itemDefinition(item.itemKind)?.displayName ?? '').toLowerCase().includes(query)));
    });
    const key = JSON.stringify(visible.map(cell => cell.index ?? cells.indexOf(cell)));
    if (key === previous) return;
    previous = key;
    for (const child of [...body.children]) child.dispose();
    body.replaceChildren([uiInventoryGrid({ ...options, cells: visible })]);
  };
  const filter = uiInput({ id: options.id ? `${options.id}.filter` : undefined, label: 'Filter items', placeholder: 'FILTER ITEMS', editor,
    clearable: true, size: 'sm', onChange(value) { options.onFilter?.(value); refresh(); },
  });
  const toolbar = uiFlex({ direction: 'row', width: 'grow', gap: 4 }, [filter,
    ...(options.onSort ? [uiIconButton({ lucide: 'sort' }, { id: options.id ? `${options.id}.sort` : undefined, label: 'Sort inventory', size: 'sm', onPress: options.onSort })] : []),
  ]);
  const unsubscribe = options.controller?.subscribe(refresh);
  refresh();
  return new UiElement({ kind: 'inventory-panel', style: { direction: 'column', width: 'grow', gap: 4 }, children: [toolbar, body],
    onDispose() { unsubscribe?.(); },
  });
}
