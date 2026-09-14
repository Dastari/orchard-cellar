import { bootstrapContentRegistry } from '@orchard/sim';
import { expect, it, vi } from 'vitest';
import { HomesteadBuildPalette, type HomesteadBuildPaletteModel } from './homestead-build-palette.js';
import { uiTestArt } from './kit/lab/testing/art.js';
const model: HomesteadBuildPaletteModel = { width: 640, height: 480, counts: {}, upgrades: [], upgradeRanks: {}, balanceBronze: 0n,
  entries: [{ itemKind: 'moon_shelter', displayName: 'Moon Shelter', layer: 'prefab', iconAnimation: 'moon' }] };
it('preserves selection until content removes it and retains nodes across identical snapshots', async () => {
  const palette = new HomesteadBuildPalette(await uiTestArt(), {}, vi.fn()); palette.setModel(model);
  expect(palette.selection).toEqual({ kind: 'place', itemKind: 'moon_shelter' });
  const item = palette.root.entries().find(entry => entry.element.kind === 'slot')!.element;
  palette.setModel({ ...model }); expect(palette.root.entries().find(entry => entry.element.kind === 'slot')!.element).toBe(item);
  palette.setModel({ ...model, entries: [] }); expect(palette.selection).toEqual({ kind: 'remove' });
  palette.setModel({ ...model, entries: [{ ...model.entries[0]!, itemKind: 'solar_station' }] });
  expect(palette.selection).toEqual({ kind: 'place', itemKind: 'solar_station' }); palette.dispose();
});
it('purchases only on release and cancels stale affordability or modal-blocked presses', async () => {
  const onPurchase = vi.fn(), palette = new HomesteadBuildPalette(await uiTestArt(), {}, onPurchase);
  const upgrade = Object.values(bootstrapContentRegistry().compiled.upgrades)[0]!;
  const rich = { ...model, upgrades: [upgrade], balanceBronze: 10n ** 15n };
  palette.setModel(rich);
  const button = () => palette.root.entries().find(entry => entry.element.id === `build.upgrade.${upgrade.kind}`)!.element;
  const r = button().clip, point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  expect(palette.pointerDown(point, 0)).toBe(true); expect(onPurchase).not.toHaveBeenCalled();
  palette.pointerUp(point, 0); expect(onPurchase).toHaveBeenCalledExactlyOnceWith(upgrade.kind);
  palette.pointerDown(point, 0); palette.setModel({ ...rich, balanceBronze: 0n }); palette.pointerUp(point, 0); expect(onPurchase).toHaveBeenCalledOnce();
  palette.setModel(rich); palette.pointerDown(point, 0); palette.setModel({ ...rich, blocked: true }); palette.pointerUp(point, 0);
  expect(onPurchase).toHaveBeenCalledOnce(); expect(palette.key({ key: 'Enter' })).toBe(false); palette.dispose();
});
it('keeps its frame inside a phone viewport and scrolls touch gestures without selection', async () => {
  const palette = new HomesteadBuildPalette(await uiTestArt(), {}, vi.fn());
  palette.setModel({ ...model, width: 160, height: 220, entries: Array.from({ length: 40 }, (_, index) => ({ ...model.entries[0]!, itemKind: `item_${index}` })) });
  const r = palette.palette.rect; expect(r.x + r.width).toBeLessThanOrEqual(160); expect(r.y + r.height).toBeLessThanOrEqual(220);
  const selected = palette.selection;
  palette.pointerDown({ x: 40, y: 90 }, 0, 'touch'); palette.pointerMove({ x: 40, y: 50 }); palette.pointerUp({ x: 40, y: 50 }, 0);
  expect(palette.palette.scrollArea.scroll.y).toBeGreaterThan(0); expect(palette.selection).toEqual(selected); palette.dispose();
});
