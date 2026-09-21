import { expect, it, vi } from 'vitest';
import { UiRoot } from '../runtime/root.js';
import { uiDelveRewards, type UiDelveRewardsModel } from './delve.js';

const model: UiDelveRewardsModel = {
  run: { roomNumber: 2, roomKind: 'shop', theme: 'cellar', phase: 'reward', wave: 0, maximumWaves: 3, currency: 10 },
  offers: [0, 1, 2].map(slot => ({ slot, upgradeId: `unknown-${slot}`, rarity: 'rare', magnitudePermille: 100, cost: slot * 10 })),
};
it('uses current affordability for keyboard and pointer choices and only lets shops leave', () => {
  const onChoose = vi.fn(), onLeaveShop = vi.fn();
  const rewards = uiDelveRewards({ model, onChoose, onLeaveShop });
  const root = new UiRoot({ scale: 1 }); root.resize(640, 400); root.mount(rewards); root.arrange();
  expect(rewards.scroll).toEqual({ x: 0, y: 0, maxX: 0, maxY: 0 });
  const button = root.entries().find(entry => entry.element.id === 'delve.choose.0')!.element;
  root.focus.set(button);
  root.key({ key: '3' }); expect(onChoose).not.toHaveBeenCalled();
  root.key({ key: '2' }); expect(onChoose).toHaveBeenLastCalledWith(1);
  root.key({ key: 'Escape' }); expect(onLeaveShop).toHaveBeenCalledOnce();
  rewards.updateDelveRewards({ ...model, run: { ...model.run, currency: 0, roomKind: 'combat' } }); root.arrange();
  const next = root.entries().find(entry => entry.element.id === 'delve.choose.0')!.element; root.focus.set(next);
  onChoose.mockClear(); root.key({ key: '2' }); root.key({ key: 'Escape' });
  expect(onChoose).not.toHaveBeenCalled(); expect(onLeaveShop).toHaveBeenCalledOnce();
  const point = { x: next.rect.x + next.rect.width / 2, y: next.rect.y + next.rect.height / 2 };
  root.pointer({ type: 'down', point, button: 0, pointerId: 1 }); expect(onChoose).not.toHaveBeenCalled();
  root.pointer({ type: 'up', point, button: 0, pointerId: 1 }); expect(onChoose).toHaveBeenLastCalledWith(0);
  root.dispose();
});
it('contains the frame and scrolls reward choices on short and narrow viewports', () => {
  for (const [width, height] of [[640, 400], [240, 200], [120, 160]] as const) {
    const root = new UiRoot({ scale: 1 }); root.resize(width, height);
    const rewards = uiDelveRewards({ model, onChoose: vi.fn(), onLeaveShop: vi.fn() }); root.mount(rewards); root.arrange();
    const frame = root.entries().find(entry => entry.element.id === 'delve.rewards.frame')!.element;
    expect(frame.rect.x).toBeGreaterThanOrEqual(0); expect(frame.rect.y).toBeGreaterThanOrEqual(0);
    expect(frame.rect.x + frame.rect.width).toBeLessThanOrEqual(width);
    expect(frame.rect.y + frame.rect.height).toBeLessThanOrEqual(height);
    if (width <= 240) expect(rewards.scrollArea.scroll.maxY).toBeGreaterThan(0);
    root.dispose();
  }
});
