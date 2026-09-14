import { expect, it, vi } from 'vitest';
import { DelveUi, type DelveUiModel } from './delve-ui.js';
import { uiTestArt } from './kit/lab/testing/art.js';
const base: DelveUiModel = { width: 640, height: 400, blocked: false,
  run: { roomNumber: 0, roomKind: 'shop', theme: 'cellar', phase: 'reward', wave: 0, maximumWaves: 3, currency: 10 },
  offers: [{ slot: 0, upgradeId: 'unknown', rarity: 'rare', magnitudePermille: 100, cost: 10 }],
};
it('retains focus across identical updates and cancels stale or blocked captured choices', async () => {
  const choose = vi.fn(), leave = vi.fn(), adapter = new DelveUi(await uiTestArt(), choose, leave);
  adapter.update(base);
  const button = adapter.root.entries().find(entry => entry.element.id === 'delve.choose.0')!.element;
  adapter.root.focus.set(button); adapter.update({ ...base }); expect(adapter.root.focus.current).toBe(button);
  const point = { x: button.rect.x + 10, y: button.rect.y + 10 };
  adapter.pointerDown(point, 0); adapter.update({ ...base, run: { ...base.run!, currency: 0 } }); adapter.pointerUp(point, 0);
  adapter.key({ key: '1' }); expect(choose).not.toHaveBeenCalled();
  adapter.update(base); adapter.pointerDown(point, 0); adapter.update({ ...base, blocked: true }); adapter.pointerUp(point, 0);
  expect(adapter.key({ key: 'Escape' })).toBe(false); expect(leave).not.toHaveBeenCalled(); expect(choose).not.toHaveBeenCalled();
  adapter.update(base); adapter.key({ key: '1' }); expect(choose).toHaveBeenCalledExactlyOnceWith(0);
  adapter.key({ key: 'Escape' }); expect(leave).toHaveBeenCalledOnce(); adapter.dispose();
});
it('scrolls touch swipes without activating the captured offer', async () => {
  const choose = vi.fn(), adapter = new DelveUi(await uiTestArt(), choose, vi.fn());
  adapter.update({ ...base, width: 240, height: 200, offers: [0, 1, 2].map(slot => ({ ...base.offers[0]!, slot })) });
  const point = { x: 70, y: 140 };
  adapter.pointerDown(point, 0, 'touch'); adapter.pointerMove({ x: 70, y: 70 }); adapter.pointerUp({ x: 70, y: 70 }, 0);
  expect(adapter.rewards.scrollArea.scroll.y).toBeGreaterThan(0); expect(choose).not.toHaveBeenCalled(); adapter.dispose();
});
