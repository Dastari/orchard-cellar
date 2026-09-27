import { expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { UiInventoryController, UiInventoryInteractionModel } from '../runtime/inventory.js';
import { uiInventoryPanel } from './inventory-panel.js';

it('filters by display name without renumbering bindings or losing editing focus', () => {
  const model = new UiInventoryInteractionModel({ bag: { id: 'bag', capacity: 4, slots: [null, { itemKind: 'wood', quantity: 8 }, null, { itemKind: 'apple', quantity: 2 }] } });
  const controller = new UiInventoryController(model), sort = vi.fn();
  const root = new UiRoot({ scale: 1 }); root.resize(320, 240);
  root.mount(uiInventoryPanel({ id: 'bag', container: 'bag', count: 4, columns: 2, controller, onSort: sort,
    itemLabel: item => item.itemKind === 'wood' ? 'Timber logs' : 'Apples',
  })); root.arrange();
  const input = root.entries().find(entry => entry.element.id === 'bag.filter')!.element;
  expect(input.rect.y + input.rect.height).toBeLessThanOrEqual(root.entries().find(entry => entry.element.kind === 'slot')!.element.rect.y);
  root.focus.set(input, 'keyboard'); root.text('timber'); root.arrange();
  expect(root.focus.current).toBe(input);
  const slots = () => root.entries().filter(entry => entry.element.kind === 'slot').map(entry => entry.element);
  expect(slots().map(node => node.props['binding'])).toEqual([{ container: 'bag', index: 1 }]);
  root.focus.set(slots()[0]!, 'keyboard'); root.key({ key: 'Enter' }); root.arrange();
  expect(model.cursor?.quantity).toBe(8); expect(slots()).toHaveLength(0);
  root.focus.set(input, 'keyboard'); root.key({ key: 'a', ctrlKey: true }); root.key({ key: 'Backspace' }); root.arrange();
  expect(slots()).toHaveLength(4);
  const [a,b,c] = slots();
  expect(b!.rect.x - a!.rect.x - a!.rect.width).toBe(2);
  expect(c!.rect.y - a!.rect.y - a!.rect.height).toBe(2);
  root.focus.set(root.entries().find(entry => entry.element.id === 'bag.sort')!.element, 'keyboard'); root.key({ key: 'Enter' });
  expect(sort).toHaveBeenCalledOnce(); root.dispose(); controller.dispose();
});

it('limits host capacity while retaining the authored slot indices', () => {
  const root = new UiRoot({ scale: 1 }); root.resize(320,200);
  root.mount(uiInventoryPanel({ container: 'bag', cells: [{ id: 'first' }, { id: 'second' }, { id: 'last', index: 9 }], capacity: () => 2 })); root.arrange();
  expect(root.entries().filter(entry => entry.element.kind === 'slot').map(entry => entry.element.props['binding']))
    .toEqual([{ container: 'bag', index: 0 }, { container: 'bag', index: 1 }]); root.dispose();
});
