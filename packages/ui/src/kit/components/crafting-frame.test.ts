import { expect, it, vi } from 'vitest';
import { bootstrapContentDefinitions, type FrameContentDefinition } from '@orchard/sim';
import { UiRoot } from '../runtime/root.js';
import { uiCraftingFrame, type UiCraftingSnapshot } from './crafting-frame.js';
import { uiLabInventory } from '../lab/inventory-mock.js';

it('retains recipe search while updating locks, forwards Shift craft and keeps ghosts out of authority', () => {
  const definition = bootstrapContentDefinitions().find((entry): entry is FrameContentDefinition => entry.id === 'frame:crafting')!;
  const { controller } = uiLabInventory({ activate: vi.fn() }), craft = vi.fn(), select = vi.fn(), filter = vi.fn();
  const initial: UiCraftingSnapshot = { recipes: [{ id: 'planks', label: '4 Wooden planks', detail: 'READY' }], selected: 'planks', pattern: ['wood'], output: { itemKind: 'plank', quantity: 4 }, requirement: 'SKILL REQUIRED' };
  const frame = uiCraftingFrame({ definition, aliases: { crafting: 'crafting', backpack: 'backpack', hotbar: 'hotbar' }, registry: { items: new Map(), processes: new Map() }, controller,
    crafting: initial, onRecipe: select, onRecipeFilter: filter, onCraft: craft,
  });
  const root = new UiRoot({ scale: 1 }); root.resize(640,480); root.mount(frame); frame.setRecipeBook(true); root.arrange();
  const result = root.entries().find(e => e.element.label === 'Craft result')!.element;
  expect(result.disabled).toBe(true); expect(controller.model.stack({ container: 'crafting', index: 0 })).toBeNull();
  const input = root.entries().find(e => e.element.label === 'Search recipes')!.element;
  root.focus.set(input, 'keyboard'); root.text('plank'); root.key({ key: 'ArrowLeft' });
  frame.updateCrafting({ ...initial, requirement: undefined }); root.arrange();
  expect(result.disabled).toBe(false); expect(root.focus.current).toBe(input);
  root.text('X'); expect(filter).toHaveBeenLastCalledWith('planXk');
  root.key({ key: 'a', ctrlKey: true }); root.key({ key: 'Backspace' }); root.arrange();
  root.focus.set(result, 'keyboard'); root.key({ key: 'Enter', shiftKey: true }); expect(craft).toHaveBeenCalledWith(true);
  const place = root.entries().find(e => e.element.label === 'Place in grid')!.element;
  root.focus.set(place, 'keyboard'); root.key({ key: 'Enter' }); expect(select).toHaveBeenCalledWith('planks');
  root.dispose(); controller.dispose();
});
