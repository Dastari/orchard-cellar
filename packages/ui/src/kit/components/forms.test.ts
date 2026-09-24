import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { SystemMenus, type SystemMenuModel } from '../../game-host/system-menus.js';
import { uiTestArt } from '../lab/testing/art.js';
import { UiRoot } from '../runtime/root.js';
import type { UiRootPointer } from '../runtime/input.js';
import type { UiKitArt } from './art.js';
import { uiSlider } from './forms.js';

let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(dispose => dispose()));
function productionMenu(window: 'settings' | 'developer') {
  const volume = vi.fn(), time = vi.fn();
  const menu = new SystemMenus(art, { action: vi.fn(), close: vi.fn(), back: vi.fn(), key: () => false,
    volume, mute: vi.fn(), background: vi.fn(), nameplates: vi.fn(), lighting: vi.fn(), worldScale: vi.fn(),
    presentationCap: vi.fn(), experimentalWebGL: vi.fn(), touch: vi.fn(), time });
  const model: SystemMenuModel = { window, width: 320, height: 180, frame: { x: 4, y: 4, width: 312, height: 172 },
    audioVolumes: { master: .8, music: .7, sfx: .6 }, canAdministerWorld: true,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: .2, weatherMode: 'auto', raining: false };
  menu.update(model); cleanup.push(() => menu.dispose());
  const root = menu.root;
  const node = (id: string) => root.entries().find(entry => entry.element.id === id)!.element;
  if (window === 'settings') { root.focus.set(node('settings.pages:tab:audio')); root.key({ key: 'Enter' }); }
  const slider = node(window === 'settings' ? 'settings.volume.master' : 'developer.time');
  root.focus.set(slider); root.arrange();
  expect(slider.clip.height).toBe(slider.rect.height);
  const point = { x: slider.rect.x + slider.rect.width * .35, y: slider.rect.y + slider.rect.height / 2 };
  const pointer = (type: UiRootPointer['type'], overrides: Partial<UiRootPointer> = {}) => root.pointer({ type, point, pointerId: 1,
    pointerType: 'touch', isPrimary: true, button: 0, ...overrides });
  return { root, menu, model, slider, point, pointer, changed: window === 'settings' ? volume : time };
}

it.each(['settings', 'developer'] as const)('vertical touch scroll through the production %s slider sends no command', window => {
  const f = productionMenu(window);
  // The scrolling ancestor of the slider (settings also scrolls its tab column on short screens).
  const scroll = f.root.entries().find(entry => entry.element.kind === 'scroll-area' && entry.element.scroll.maxY > 0 && f.slider.isDescendantOf(entry.element))!.element;
  const before = scroll.scroll.y;
  f.pointer('down');
  expect(f.changed).not.toHaveBeenCalled();
  f.pointer('move', { point: { x: f.point.x, y: f.point.y - 12 } });
  f.pointer('up', { point: { x: f.point.x, y: f.point.y - 12 } });
  expect(scroll.scroll.y).toBeGreaterThan(before);
  expect(f.changed).not.toHaveBeenCalled();
});

it.each(['settings', 'developer'] as const)('production %s slider distinguishes a touch tap from an intentional horizontal drag', window => {
  const f = productionMenu(window);
  f.pointer('down'); expect(f.changed).not.toHaveBeenCalled();
  f.pointer('up'); expect(f.changed).toHaveBeenCalledTimes(1);
  f.changed.mockClear(); f.menu.update(f.model);
  f.pointer('down', { pointerId: 2 }); expect(f.changed).not.toHaveBeenCalled();
  f.pointer('move', { pointerId: 2, point: { x: f.point.x + 18, y: f.point.y } });
  expect(f.changed).toHaveBeenCalledTimes(1);
  f.pointer('up', { pointerId: 2, point: { x: f.point.x + 18, y: f.point.y } });
  expect(f.changed).toHaveBeenCalledTimes(1);
});

it('secondary-first release cannot commit a pending slider tap and cancellation leaves no command', () => {
  const f = productionMenu('settings');
  f.pointer('down');
  f.pointer('down', { pointerId: 2, isPrimary: false, point: { x: f.point.x + 60, y: f.point.y } });
  f.pointer('up', { pointerId: 2, isPrimary: false });
  expect(f.changed).not.toHaveBeenCalled();
  f.pointer('cancel'); expect(f.changed).not.toHaveBeenCalled();
  f.pointer('up'); expect(f.changed).not.toHaveBeenCalled();
  f.pointer('down', { pointerId: 3 }); f.pointer('up', { pointerId: 3 });
  expect(f.changed).toHaveBeenCalledTimes(1);
});

it('pending developer time touch does not write after authorization or window scope is removed', () => {
  const f = productionMenu('developer');
  f.pointer('down'); f.menu.update({ ...f.model, canAdministerWorld: false });
  f.pointer('move'); f.pointer('up'); expect(f.changed).not.toHaveBeenCalled();
  f.menu.update(f.model);
  // The view was rebuilt on authorization removal: address its current slider.
  const slider = f.root.entries().find(entry => entry.element.id === 'developer.time')!.element;
  f.root.focus.set(slider); f.root.arrange();
  const point = { x: slider.rect.x + slider.rect.width * .35, y: slider.rect.y + slider.rect.height / 2 };
  f.pointer('down', { pointerId: 4, point }); f.menu.update({ ...f.model, window: null });
  f.pointer('up', { pointerId: 4, point }); expect(f.changed).not.toHaveBeenCalled();
});

it('slider retains immediate desktop dragging and keyboard/wheel controls while outside touch release cancels a tap', () => {
  const root = new UiRoot({ scale: 1 }), onChange = vi.fn();
  cleanup.push(() => root.dispose()); root.resize(320, 80);
  const slider = uiSlider({ label: 'Volume', min: 0, max: 1, step: .01, value: .8, onChange }); root.mount(slider); root.arrange();
  const point = { x: 70, y: 16 };
  root.pointer({ type: 'down', point, pointerId: 1, pointerType: 'mouse', button: 0 });
  expect(onChange).toHaveBeenCalledTimes(1);
  root.pointer({ type: 'move', point: { x: 110, y: 16 }, pointerId: 1, pointerType: 'mouse', button: 0 });
  expect(onChange).toHaveBeenCalledTimes(2);
  root.pointer({ type: 'up', point, pointerId: 1, pointerType: 'mouse', button: 0 });
  expect(onChange).toHaveBeenCalledTimes(2);
  onChange.mockClear();
  root.pointer({ type: 'down', point, pointerId: 2, pointerType: 'touch', button: 0 });
  root.pointer({ type: 'up', point: { x: 330, y: 40 }, pointerId: 2, pointerType: 'touch', button: 0 });
  expect(onChange).not.toHaveBeenCalled();
  root.focus.set(slider); root.key({ key: 'End' }); expect(onChange).toHaveBeenLastCalledWith(1);
  root.wheel({ point, deltaX: 0, deltaY: 1 }); expect(onChange).toHaveBeenLastCalledWith(.99);
});
