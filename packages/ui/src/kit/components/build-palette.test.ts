import { bootstrapContentRegistry } from '@orchard/sim';
import { expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiBuildPalette, type UiBuildPaletteModel } from './build-palette.js';
import { createCanvas } from '@napi-rs/canvas';
import type { UiElement } from '../runtime/element.js';
import { uiTestArt } from '../lab/testing/art.js';
import { uiSlot } from './inventory.js';
it('keeps construction slots two pixels apart and guards current upgrade affordability', () => {
  const upgrade = Object.values(bootstrapContentRegistry().compiled.upgrades)[0]!;
  const model: UiBuildPaletteModel = { entries: Array.from({ length: 12 }, (_, index) => ({ itemKind: `item_${index}`, displayName: `Item ${index}`, layer: 'prefab', iconAnimation: 'base' })),
    counts: {}, upgrades: [upgrade], upgradeRanks: {}, balanceBronze: 0n, selection: { kind: 'remove' } };
  const onSelect = vi.fn(), onPurchase = vi.fn(), root = new UiRoot({ scale: 1 }); root.resize(320, 300);
  const palette = uiBuildPalette({ model, artwork: {}, onSelect, onPurchase }); root.mount(palette); root.arrange();
  expect(palette.scroll).toEqual({ x: 0, y: 0, maxX: 0, maxY: 0 });
  expect(palette.scrollArea.kind).toBe('scroll-area');
  const slots = root.entries().filter(entry => entry.element.kind === 'slot').map(entry => entry.element);
  expect(slots[1]!.rect.x - slots[0]!.rect.x - slots[0]!.rect.width).toBe(2);
  const secondRow = slots.find(slot => slot.rect.y > slots[0]!.rect.y)!;
  expect(secondRow.rect.y - slots[0]!.rect.y - slots[0]!.rect.height).toBe(2);
  const grid = root.entries().find(entry => entry.element.id === 'build.entries')!.element;
  expect(grid.rect.height).toBe(secondRow.rect.y + secondRow.rect.height - slots[0]!.rect.y);
  root.focus.set(slots[0]!); root.key({ key: 'Enter' }); expect(onSelect).toHaveBeenCalledWith({ kind: 'place', itemKind: 'item_0' });
  palette.updateBuildPalette({ ...model, counts: { item_0: 1 } }); root.arrange();
  expect(root.entries().find(entry => entry.element.id === slots[0]!.id)!.element).toBe(slots[0]);
  expect(root.focus.current).toBe(slots[0]);
  let button = root.entries().find(entry => entry.element.id === `build.upgrade.${upgrade.kind}`)!.element;
  expect(button.disabled).toBe(true);
  palette.updateBuildPalette({ ...model, balanceBronze: 10n ** 15n }); root.arrange();
  button = root.entries().find(entry => entry.element.id === `build.upgrade.${upgrade.kind}`)!.element;
  root.focus.set(button); root.key({ key: 'Enter' }); expect(onPurchase).toHaveBeenCalledExactlyOnceWith(upgrade.kind);
  palette.updateBuildPalette({ ...model, upgradeRanks: { [upgrade.kind]: upgrade.maximumRank }, balanceBronze: 10n ** 15n }); root.arrange();
  expect(root.entries().find(entry => entry.element.id === button.id)!.element.disabled).toBe(true);
  root.dispose();
});

// #219 review: a placement waiting for the server makes the palette slots busy, not disabled. Pending has no approved
// look, so they keep the 60% dimming instead of flashing to the grey disabled face, and ignore input.
it('keeps palette slots dimmed, not grey, while a placement is pending', async () => {
  const model: UiBuildPaletteModel = { entries: [{ itemKind: 'item_0', displayName: 'Item 0', layer: 'prefab', iconAnimation: 'base' }],
    counts: {}, upgrades: [], upgradeRanks: {}, balanceBronze: 0n, selection: { kind: 'remove' } };
  const art = await uiTestArt(), onSelect = vi.fn(), root = new UiRoot({ scale: 1, art }); root.resize(320, 300);
  const palette = uiBuildPalette({ model, artwork: {}, onSelect, onPurchase: vi.fn() }); root.mount(palette); root.arrange();
  const slot = root.entries().find(entry => entry.element.id === 'build.item.item_0')!.element;
  // Paints an element alone at the origin of a slot-sized canvas.
  const paint = (element: UiElement, hooks = element.hooks) => {
    const canvas = createCanvas(28, 31), context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    const placed = Object.assign(Object.create(element) as UiElement, { rect: { x: 0, y: 0, width: 28, height: 31 } });
    hooks.paint!(placed, { context, art, now: 0, focused: false, hovered: false, reducedMotion: false });
    return canvas.toBuffer('image/png');
  };
  const idle = paint(slot);
  palette.updateBuildPalette({ ...model, constructionPending: true }); root.arrange();
  expect(slot.disabled).toBe(true);
  root.focus.set(slot); root.key({ key: 'Enter' }); expect(onSelect).not.toHaveBeenCalled();
  const pending = paint(slot);
  expect(pending).not.toEqual(idle);
  // The idle slot at 60% (the pre-S1 look), not the grey disabled face.
  const reference = uiSlot({ ghost: () => ({ itemKind: 'item_0', quantity: 0 }), artwork: {} });
  expect(pending).toEqual(paint(reference, { paint(element, context) {
    context.context.save(); context.context.globalAlpha *= .6; reference.hooks.paint!(element, context); context.context.restore(); } }));
  expect(pending).not.toEqual(paint(uiSlot({ ghost: () => ({ itemKind: 'item_0', quantity: 0 }), artwork: {}, state: { enabled: false } })));
  palette.updateBuildPalette({ ...model, constructionPending: false }); root.arrange();
  expect(slot.disabled).toBe(false); expect(paint(slot)).toEqual(idle);
  root.dispose();
});
