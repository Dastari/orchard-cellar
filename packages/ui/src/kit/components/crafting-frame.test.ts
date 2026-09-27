import { expect, it, vi } from 'vitest';
import { bootstrapContentDefinitions, type FrameContentDefinition } from '@orchard/sim';
import { UiRoot } from '../runtime/root.js';
import { uiCraftingFrame, type UiCraftingSnapshot } from './crafting-frame.js';
import { uiLabInventory } from '../lab/inventory-mock.js';
import { createCanvas } from '@napi-rs/canvas';
import { itemDefinition } from '@orchard/sim';
import type { UiElement } from '../runtime/element.js';
import type { UiRect } from '../../geometry.js';
import { drawOutlinedPixelText } from '../../pixel-ui.js';
import { uiTestArt, uiTestAsset } from '../lab/testing/art.js';
import { paintUiSkin } from './art.js';
import { UI_SLOT_INKS, uiItemFrame, uiSlotIconRect } from './inventory.js';

it('retains recipe search while updating locks, forwards Shift craft and keeps ghosts out of authority', () => {
  const definition = bootstrapContentDefinitions().find((entry): entry is FrameContentDefinition => entry.id === 'frame:crafting')!;
  const { controller } = uiLabInventory({ activate: vi.fn() }), craft = vi.fn(), select = vi.fn(), filter = vi.fn();
  const initial: UiCraftingSnapshot = { recipes: [{ id: 'planks', label: '4 Wooden planks', detail: 'READY' }], selected: null, pattern: ['wood'], output: { itemKind: 'plank', quantity: 4 }, requirement: 'SKILL REQUIRED' };
  const frame = uiCraftingFrame({ definition, aliases: { crafting: 'crafting', backpack: 'backpack', hotbar: 'hotbar' }, registry: { items: new Map(), processes: new Map() }, controller,
    crafting: initial, onRecipe: select, onRecipeFilter: filter, onCraft: craft,
  });
  const root = new UiRoot({ scale: 1 }); root.resize(1280,720); root.mount(frame); frame.setRecipeBook(true); root.arrange(); root.arrange();
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
  // Placing the recipe that is already selected asks the authority again (BUG-037): a refused first
  // placement must not turn every later press into a silent no-op.
  frame.updateCrafting({ ...initial, requirement: undefined, selected: 'planks' }); root.arrange();
  const again = root.entries().find(e => e.element.label === 'Place in grid')!.element;
  root.focus.set(again, 'keyboard'); root.key({ key: 'Enter' }); expect(select).toHaveBeenCalledTimes(2);
  expect(select).toHaveBeenLastCalledWith('planks');
  root.dispose(); controller.dispose();
});

it('lets the recipe book take the bench\'s place on small screens and returns to the bench after placing', () => {
  const definition = bootstrapContentDefinitions().find((entry): entry is FrameContentDefinition => entry.id === 'frame:crafting')!;
  const { controller } = uiLabInventory({ activate: vi.fn() }), select = vi.fn();
  const snapshot: UiCraftingSnapshot = { recipes: [{ id: 'planks', label: '4 Wooden planks', status: 'ready', output: { itemKind: 'plank', quantity: 4 }, ingredients: [] }], selected: null, pattern: [], output: null };
  const frame = uiCraftingFrame({ definition, aliases: { crafting: 'crafting', backpack: 'backpack', hotbar: 'hotbar' }, registry: { items: new Map(), processes: new Map() }, controller,
    crafting: snapshot, onRecipe: select, onRecipeFilter: vi.fn(), onCraft: vi.fn() });
  // The game's desktop logical viewport: neither side by side nor stacked fits both.
  const root = new UiRoot({ scale: 1 }); root.resize(480, 270); root.mount(frame); frame.setCraftingViewport(480, 270); root.arrange();
  const bench = frame.children.find(child => child.kind !== 'recipe-book' && child.id !== 'crafting.recipes')!;
  frame.setRecipeBook(true); root.arrange(); root.arrange();
  expect(bench.style.display).toBe('none');
  const book = root.entries().find(e => e.element.id === 'crafting.recipes')!.element;
  expect(book.rect.y).toBeGreaterThanOrEqual(0); expect(book.rect.y + book.rect.height).toBeLessThanOrEqual(270);
  const place = root.entries().find(e => e.element.label === 'Place in grid')!.element;
  root.focus.set(place, 'keyboard'); root.key({ key: 'Enter' }); root.arrange(); root.arrange();
  expect(select).toHaveBeenCalledWith('planks');
  expect(root.entries().some(e => e.element.id === 'crafting.recipes')).toBe(false); expect(bench.style.display).toBe('flex');
  // Roomy screens keep the book beside or above the bench.
  root.resize(1280, 720); frame.setCraftingViewport(1280, 720); frame.setRecipeBook(true); root.arrange(); root.arrange(); expect(bench.style.display).toBe('flex');
  root.dispose(); controller.dispose();
});

it('shows why a locked recipe cannot be placed, on its book page and under the bench grid', () => {
  const definition = bootstrapContentDefinitions().find((entry): entry is FrameContentDefinition => entry.id === 'frame:crafting')!;
  const { controller } = uiLabInventory({ activate: vi.fn() });
  const snapshot: UiCraftingSnapshot = { recipes: [
    { id: 'lantern', label: 'Lantern', status: 'locked', reason: 'Requires tinkering rank 2', output: { itemKind: 'lantern', quantity: 1 }, ingredients: [] },
    { id: 'chest', label: 'Chest', status: 'station', detail: 'WORKBENCH', reason: 'Requires a workbench within 2 tiles', output: { itemKind: 'chest', quantity: 1 }, ingredients: [] }],
    selected: 'lantern', pattern: [], output: { itemKind: 'lantern', quantity: 1 }, requirement: 'REQUIRES TINKERING RANK 2' };
  const frame = uiCraftingFrame({ definition, aliases: { crafting: 'crafting', backpack: 'backpack', hotbar: 'hotbar' }, registry: { items: new Map(), processes: new Map() }, controller,
    crafting: snapshot, onRecipe: vi.fn(), onRecipeFilter: vi.fn(), onCraft: vi.fn() });
  const root = new UiRoot({ scale: 1 }); root.resize(1280, 720); root.mount(frame); frame.setCraftingViewport(1280, 720); frame.setRecipeBook(true); root.arrange(); root.arrange();
  const labels = () => root.entries().map(e => e.element.label);
  // Once on the book page (the recipe's reason) and once under the bench grid (the host's requirement).
  expect(labels().filter(label => label === 'Requires tinkering rank 2')).toHaveLength(2);
  expect(root.entries().find(e => e.element.label === 'Place in grid')!.element.disabled).toBe(true);
  const chest = root.entries().find(e => e.element.label.startsWith('Chest') && e.element.focusable)!.element;
  root.focus.set(chest, 'keyboard'); root.key({ key: 'Enter' }); root.arrange();
  expect(labels()).toContain('Requires a workbench within 2 tiles');
  root.dispose(); controller.dispose();
});

// #219 review: a result whose recipe needs a skill the player lacks is a disabled slot, painted with the approved
// disabled look: the pack's grey face with the item at 50% and its count (owner decision 2026-09-27, render 01 B).
it('paints a craft result with an unmet requirement as the grey face with the item at 50%', async () => {
  const definition = bootstrapContentDefinitions().find((entry): entry is FrameContentDefinition => entry.id === 'frame:crafting')!;
  const name = itemDefinition('plank')!.iconKey!, plank = uiTestAsset(name, name.startsWith('item_') || name.startsWith('prop_') ? 'props' : 'ui');
  const art = await uiTestArt(), crafting: UiCraftingSnapshot = { recipes: [], selected: null, pattern: [], output: { itemKind: 'plank', quantity: 4 }, requirement: 'Needs Woodworking 2' };
  const frame = uiCraftingFrame({ definition, aliases: { crafting: 'crafting', backpack: 'backpack', hotbar: 'hotbar' }, registry: { items: new Map(), processes: new Map() },
    artwork: { plank }, crafting, onRecipe: vi.fn(), onRecipeFilter: vi.fn(), onCraft: vi.fn() });
  const root = new UiRoot({ scale: 1, art }); root.resize(1280, 720); root.mount(frame); root.arrange(); root.arrange();
  const result = root.entries().find(entry => entry.element.label === 'Craft result')!.element;
  const paint = (draw: (context: CanvasRenderingContext2D, r: UiRect) => void) => {
    const canvas = createCanvas(28, 31), context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    draw(context, { x: 0, y: 0, width: 28, height: 31 }); return canvas.toBuffer('image/png');
  };
  const slot = (element: UiElement) => paint((context, rect) => element.hooks.paint!(Object.assign(Object.create(element) as UiElement, { rect }),
    { context, art, now: 0, focused: false, hovered: false, reducedMotion: false }));
  const approved = paint((context, r) => {
    paintUiSkin(context, art.skin.slot, 'slot.disabled.0', r);
    const source = uiItemFrame(plank)!, well = uiSlotIconRect(r), fit = Math.min(well.width / source.width, well.height / source.height);
    const width = Math.max(1, Math.round(source.width * fit)), height = Math.max(1, Math.round(source.height * fit));
    context.save(); context.imageSmoothingEnabled = false; context.globalAlpha *= .5;
    context.drawImage(plank.image, source.x, source.y, source.width, source.height, well.x + Math.round((well.width - width) / 2), well.y + Math.round((well.height - height) / 2), width, height); context.restore();
    drawOutlinedPixelText(context, art.pixel, '4', 23, 16, { align: 'right', ...UI_SLOT_INKS });
  });
  expect(result.disabled).toBe(true);
  expect(slot(result)).toEqual(approved);
  // Once the requirement is met the result is the ordinary, pressable slot again.
  frame.updateCrafting({ ...crafting, requirement: undefined }); root.arrange();
  expect(result.disabled).toBe(false); expect(slot(result)).not.toEqual(approved);
  root.dispose();
});
