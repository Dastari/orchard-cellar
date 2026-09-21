import { bootstrapContentRegistry } from '@orchard/sim';
import { expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiBuildPalette, type UiBuildPaletteModel } from './build-palette.js';
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
  root.focus.set(slots[0]!); root.key({ key: 'Enter' }); expect(onSelect).toHaveBeenCalledWith({ kind: 'place', itemKind: 'item_0' });
  let button = root.entries().find(entry => entry.element.id === `build.upgrade.${upgrade.kind}`)!.element;
  expect(button.disabled).toBe(true);
  palette.updateBuildPalette({ ...model, balanceBronze: 10n ** 15n }); root.arrange();
  button = root.entries().find(entry => entry.element.id === `build.upgrade.${upgrade.kind}`)!.element;
  root.focus.set(button); root.key({ key: 'Enter' }); expect(onPurchase).toHaveBeenCalledExactlyOnceWith(upgrade.kind);
  palette.updateBuildPalette({ ...model, upgradeRanks: { [upgrade.kind]: upgrade.maximumRank }, balanceBronze: 10n ** 15n }); root.arrange();
  expect(root.entries().find(entry => entry.element.id === button.id)!.element.disabled).toBe(true);
  root.dispose();
});
