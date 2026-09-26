import { expect, it, vi } from 'vitest';
import { bootstrapContentDefinitions, type FrameContentDefinition } from '@orchard/sim';
import { uiLabInventory } from '../lab/inventory-mock.js';
import { UiRoot } from '../runtime/root.js';
import { uiContentFrame } from './content-frame.js';

// Owner UI fix item 8: side-by-side sections share one top edge, so the EQUIPMENT and
// BACKPACK headings line up instead of the shorter section floating to the middle.
it('tops side-by-side pack sections so their headings line up', () => {
  const definition = bootstrapContentDefinitions().find((entry): entry is FrameContentDefinition => entry.id === 'frame:pack')!;
  const { controller } = uiLabInventory({ activate: vi.fn() });
  const root = new UiRoot({ scale: 1 }); root.resize(960, 540);
  root.mount(uiContentFrame({ definition, controller, aliases: { hotbar: 'hotbar', backpack: 'backpack', equipment: 'equipment' }, registry: { items: new Map(), processes: new Map() } }));
  root.arrange();
  const heading = (label: string) => root.entries().find(({ element }) => element.kind === 'text' && element.label === label)!.element;
  const equipment = heading('EQUIPMENT'), backpack = heading('BACKPACK');
  expect(backpack.rect.x).toBeGreaterThan(equipment.rect.x);
  expect(backpack.rect.y).toBe(equipment.rect.y);
  root.dispose(); controller.dispose();
});
