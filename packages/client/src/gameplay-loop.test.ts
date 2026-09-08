import { afterEach, expect, it, vi } from 'vitest';
import { changePresentationCap } from '@orchard/ui';
import { FixedStepLoop } from './loop.js';
import { createGameplayLoop } from './gameplay-loop.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('applies persisted, same-tab and cross-tab cap settings to the active loop', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const window = new EventTarget(); vi.stubGlobal('window', window); vi.stubGlobal('localStorage', storage);
  const rate = vi.spyOn(FixedStepLoop.prototype, 'setPresentationRate');
  createGameplayLoop({ update: () => {}, render: () => {} }, {
    recordRafTimestamp: () => {}, recordFixedUpdate: () => {}, recordCatchUp: () => {},
  });
  expect(rate).toHaveBeenLastCalledWith(0);
  changePresentationCap('30hz'); expect(rate).toHaveBeenLastCalledWith(30);
  storage.setItem('orchard.video.presentation-cap', 'off'); window.dispatchEvent(new Event('storage'));
  expect(rate).toHaveBeenLastCalledWith(0);
  storage.setItem('orchard.video.presentation-cap', '30hz'); window.dispatchEvent(new Event('storage'));
  expect(rate).toHaveBeenLastCalledWith(30);
});

it('connects document visibility to the active presentation counter', () => {
  const window = new EventTarget(), document = new EventTarget();
  vi.stubGlobal('window', window); vi.stubGlobal('document', document);
  const resetPresentation = vi.fn();
  createGameplayLoop({ update: () => {}, render: () => {} }, {
    recordRafTimestamp: () => {}, recordFixedUpdate: () => {}, recordCatchUp: () => {}, resetPresentation,
  });
  document.dispatchEvent(new Event('visibilitychange'));
  document.dispatchEvent(new Event('visibilitychange'));
  expect(resetPresentation).toHaveBeenCalledTimes(2);
});
