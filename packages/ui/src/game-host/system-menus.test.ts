import { createCanvas } from '@napi-rs/canvas';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { OverworldUi, type OverworldUiCallbacks, type OverworldUiModel } from '../overworld-ui.js';
import type { UiSkin } from '../skin.js';
import type { PixelUi } from '../pixel-ui.js';
import { uiTestArt } from '../kit/lab/testing/art.js';
import type { UiKitArt } from '../kit/components/art.js';
import type { UiRoot } from '../kit/runtime/root.js';
import { GameUiRuntime } from './runtime.js';
let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); vi.stubGlobal('document', { createElement: () => createCanvas(1, 1), querySelector: () => null }); });
afterAll(() => vi.unstubAllGlobals());
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(dispose => dispose()));
function callbacks(): OverworldUiCallbacks {
  const noop = vi.fn();
  return {
    selectHotbar: noop, setTimeFraction: noop, shiftDay: noop, cycleWeather: noop,
    cycleWindDirection: noop, toggleLightingEffects: noop,
    setQuestPinned: noop, abandonQuest: noop, setAudioVolume: noop, setAudioBackground: noop,
    signOut: noop, quitToTitle: noop, startDelve: noop, exitDelve: noop,
    toggleFullscreen: noop, checkForClientUpdate: noop, applyClientUpdate: noop,
    toggleOnlinePlayers: noop, moveInventoryItem: noop, quickMoveInventoryItem: noop,
    quickMoveAllInventoryItems: noop, distributeInventoryItem: noop,
    inventoryCursorClick: noop, sortInventoryContainer: noop, inventoryCursorQuickCraft: noop,
    inventoryCursorPickupAll: noop, inventoryCursorSwapHotbar: noop, dropInventoryCursor: noop,
    throwMenuItem: noop, returnInventoryCursor: noop, craftInventoryRecipe: noop,
    ghostFillCraftingRecipe: noop, closeChest: noop, closePlaceable: noop, closeCrafting: noop,
    frameAction: noop,
  };
}
function fixture(overrides: Partial<OverworldUiModel> = {}) {
  const handlers = { ...callbacks(), setNameplatesVisible: vi.fn(), setLightingQuality: vi.fn(), setLightingModel: vi.fn(), setTouchControlPreferences: vi.fn() };
  const ui = new OverworldUi({} as UiSkin, {} as PixelUi, { avatar: art.pixel.panel, missing: art.pixel.panel }, handlers);
  let model: OverworldUiModel = { width: 800, height: 600, connected: true, playerCount: 1, selectedSlot: 0,
    inventory: [], hasBackpack: true, audioVolumes: { master: .8, music: .7, sfx: .6 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null, ...overrides };
  ui.update(model); const root = ui.enableRetainedSystem(art), runtime = new GameUiRuntime();
  runtime.register({ id: 'menus', root, priority: 500, active: () => ui.retainedSystemActive && !ui.blockingUpdatePromptVisible, blocking: () => true });
  cleanup.push(() => { runtime.dispose(); ui.disposeRetainedSystem(); });
  return { ui, root, runtime, handlers, update(next: Partial<OverworldUiModel>) { model = { ...model, ...next }; ui.update(model); } };
}
function element(root: UiRoot, id: string) { root.arrange(); const node = root.entries().find(entry => entry.element.id === id)?.element; expect(node, id).toBeDefined(); return node!; }
function press(root: UiRoot, id: string) { root.focus.set(element(root, id)); root.key({ key: 'Enter' }); }
function point(root: UiRoot, id: string) { const node = element(root, id); expect(node.clip.height, id).toBeGreaterThan(0); return { x: node.clip.x + node.clip.width / 2, y: node.clip.y + node.clip.height / 2 }; }
it('routes the real game menu once on release, retires legacy hits and cancels on scope changes', () => {
  const f = fixture(); f.ui.openWindow = 'system';
  const p = point(f.root, 'game-menu.settings');
  f.runtime.pointer({ type: 'down', point: p, pointerId: 1, button: 0 }); expect(f.ui.openWindow).toBe('system');
  f.runtime.pointer({ type: 'up', point: p, pointerId: 1, button: 0 }); expect(f.ui.openWindow).toBe('settings');
  f.runtime.key({ key: 'Escape' }); expect(f.ui.openWindow).toBe('system');
  f.ui.pointerDown(p, 0); f.ui.pointerUp(p, 0); expect(f.ui.openWindow).toBe('system');
  f.runtime.pointer({ type: 'down', point: p, pointerId: 2, button: 0 }); f.ui.openWindow = 'inventory'; f.ui.openWindow = 'system';
  f.runtime.pointer({ type: 'up', point: p, pointerId: 2, button: 0 }); expect(f.ui.openWindow).toBe('system');
  press(f.root, 'game-menu.settings'); f.runtime.key({ key: 'i' }); expect(f.ui.openWindow).toBe('inventory');
});
it('commits current audio, lighting and touch preferences while preserving focus across resize', () => {
  const f = fixture({ touchControlPreferences: { swapped: true, bottomOffset: 17 } }); f.ui.openWindow = 'settings';
  press(f.root, 'settings.pages:tab:audio'); const slider = element(f.root, 'settings.volume.master');
  f.root.focus.set(slider); f.runtime.key({ key: 'ArrowRight' }); expect(f.handlers.setAudioVolume).toHaveBeenCalledWith('master', .81);
  f.update({ width: 320, height: 180 }); expect(f.root.focus.current).toBe(slider);
  press(f.root, 'settings.mute.master'); expect(f.handlers.setAudioVolume).toHaveBeenCalledWith('master', 0);
  f.update({ audioVolumes: { master: 0, music: .7, sfx: .6 } }); press(f.root, 'settings.mute.master'); expect(f.handlers.setAudioVolume).toHaveBeenCalledWith('master', .8);
  press(f.root, 'settings.pages:tab:video'); f.root.focus.set(element(f.root, 'settings.lighting-mode')); f.runtime.key({ key: 'Enter' }); f.runtime.key({ key: 'Home' }); f.runtime.key({ key: 'Enter' });
  expect(f.handlers.setLightingQuality).toHaveBeenCalledWith('basic'); expect(f.handlers.setLightingModel).not.toHaveBeenCalled();
  press(f.root, 'settings.pages:tab:controls'); press(f.root, 'settings.touch-swap'); expect(f.handlers.setTouchControlPreferences).toHaveBeenCalledWith({ swapped: false, bottomOffset: 17 });
  f.update({ touchControlPreferences: { swapped: false, bottomOffset: 40 } }); f.root.focus.set(element(f.root, 'settings.touch-offset')); f.runtime.key({ key: 'ArrowRight' }); expect(f.handlers.setTouchControlPreferences).toHaveBeenCalledWith({ swapped: false, bottomOffset: 41 });
});
it('guards admin actions and retires a held command when authority disappears', () => {
  const f = fixture({ canAdministerWorld: true }); f.ui.openWindow = 'developer';
  const p = point(f.root, 'developer.next-day'); f.runtime.pointer({ type: 'down', point: p, pointerId: 5, button: 0 });
  f.update({ canAdministerWorld: false }); f.runtime.pointer({ type: 'up', point: p, pointerId: 5, button: 0 }); expect(f.handlers.shiftDay).not.toHaveBeenCalled(); expect(f.ui.openWindow).toBe('system');
  f.update({ canAdministerWorld: true }); f.ui.openWindow = 'developer'; press(f.root, 'developer.next-day'); f.runtime.key({ key: 'Enter', repeat: true }); expect(f.handlers.shiftDay).toHaveBeenCalledExactlyOnceWith(1);
  press(f.root, 'developer.pages:tab:render'); press(f.root, 'developer.lighting-effects'); expect(f.handlers.setLightingModel).toHaveBeenCalledWith('unified'); expect(f.handlers.setLightingQuality).toHaveBeenCalledWith('dynamic');
});
it.each(['system', 'settings', 'developer'] as const)('paints only the shared %s composition in compact and wide layouts with reachable controls', window => {
  const f = fixture({ canAdministerWorld: true }); f.ui.openWindow = window;
  for (const [width, height] of [[320, 180], [800, 600]]) {
    f.update({ width, height }); const frame = element(f.root, window === 'system' ? 'game.menu' : `game.${window}`);
    expect(frame.rect.x).toBeGreaterThanOrEqual(0); expect(frame.rect.y).toBeGreaterThanOrEqual(0); expect(frame.rect.x + frame.rect.width).toBeLessThanOrEqual(width!); expect(frame.rect.y + frame.rect.height).toBeLessThanOrEqual(height!);
    const canvas = createCanvas(width!, height!);
    // Missing legacy art makes any old window paint path fail; shared root uses real kit art.
    (f.ui as unknown as { drawWindow(ctx: CanvasRenderingContext2D, name: string): void }).drawWindow(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, window);
    if (window === 'system') { f.root.focus.set(element(f.root, 'game-menu.quit')); f.root.arrange(); expect(element(f.root, 'game-menu.quit').clip.height).toBe(element(f.root, 'game-menu.quit').rect.height); }
    else {
      press(f.root, window === 'settings' ? 'settings.pages:tab:audio' : 'developer.pages:tab:render');
      const node = element(f.root, window === 'settings' ? 'settings.background.sounds' : 'developer.render-protocol');
      f.root.focus.set(node); f.root.arrange(); expect(node.clip.height).toBe(node.rect.height); expect(node.clip.width).toBe(node.rect.width);
    }
  }
});
it('ignores secondary touch and cancelled releases without closing or duplicating actions', () => {
  const f = fixture(); f.ui.openWindow = 'system'; const p = point(f.root, 'game-menu.settings');
  f.runtime.pointer({ type: 'down', point: p, pointerId: 11, pointerType: 'touch', isPrimary: true, button: 0 });
  f.runtime.pointer({ type: 'down', point: p, pointerId: 12, pointerType: 'touch', isPrimary: false, button: 0 });
  f.runtime.pointer({ type: 'up', point: p, pointerId: 12, pointerType: 'touch', isPrimary: false, button: 0 }); expect(f.ui.openWindow).toBe('system');
  f.runtime.pointer({ type: 'cancel', point: p, pointerId: 11, pointerType: 'touch', isPrimary: true, button: 0 }); expect(f.ui.openWindow).toBe('system');
  f.runtime.pointer({ type: 'up', point: p, pointerId: 11, pointerType: 'touch', isPrimary: true, button: 0 }); expect(f.ui.openWindow).toBe('system');
});

it('retires held exit and update commands when their authoritative availability changes', () => {
  const f = fixture({ delveActive: true, pwaUpdateStatus: 'available' });
  f.ui.handleKeyDown('Escape', false); // Defer the independent update prompt.
  f.ui.openWindow = 'system';
  for (const [id, change] of [['game-menu.exit-delve', { delveActive: false }], ['game-menu.update', { pwaUpdateStatus: 'checking' }]] as const) {
    f.root.focus.set(element(f.root, id)); const p = point(f.root, id);
    f.runtime.pointer({ type: 'down', point: p, pointerId: 21, button: 0 });
    f.update(change); f.runtime.pointer({ type: 'up', point: p, pointerId: 21, button: 0 });
  }
  expect(f.handlers.exitDelve).not.toHaveBeenCalled(); expect(f.handlers.applyClientUpdate).not.toHaveBeenCalled(); expect(f.handlers.checkForClientUpdate).not.toHaveBeenCalled();
});
it('writes real scale, presentation and backend preferences and projects their current values', () => {
  const values = new Map<string, string>(); const dispatchEvent = vi.fn();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal('window', { dispatchEvent });
  try {
    const f = fixture(); f.ui.openWindow = 'settings'; press(f.root, 'settings.pages:tab:video');
    const scale = element(f.root, 'settings.world-scale'); f.root.focus.set(scale); f.runtime.key({ key: 'Enter' }); f.runtime.key({ key: 'End' }); f.runtime.key({ key: 'Enter' });
    expect(values.get('orchard.video.world-scale')).toBe('native');
    press(f.root, 'settings.presentation-cap'); expect(values.get('orchard.video.presentation-cap')).toBe('30hz');
    press(f.root, 'settings.experimental-webgl'); expect([...values.entries()]).toContainEqual(['orchard.video.experimental-webgl', 'true']);
    f.update({}); expect(scale.props['value']).toBe('native'); expect(element(f.root, 'settings.presentation-cap').props['value']).toBe(true); expect(element(f.root, 'settings.experimental-webgl').props['value']).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledTimes(3);
  } finally { vi.stubGlobal('localStorage', undefined); vi.stubGlobal('window', undefined); }
});
