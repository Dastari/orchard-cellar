import { createCanvas } from '@napi-rs/canvas';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry } from '@orchard/sim';
import { OverworldUi, type OverworldUiCallbacks, type OverworldUiModel } from './overworld-ui.js';
import type { UiSkin } from './skin.js';
import type { PixelUi } from './pixel-ui.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { UiKitArt } from './kit/components/art.js';
import type { UiRoot } from './kit/runtime/root.js';
import { GameUiRuntime } from './game-host/runtime.js';
import type { QuestLogEntry } from './quest-log.js';

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

const quests: QuestLogEntry[] = Array.from({ length: 24 }, (_, i) => ({ id: `quest${i}`, title: `An important quest ${i}`, summary: 'A detailed description. '.repeat(20), state: 'active', pinned: false, objectives: [], rewards: ['1 GOLD'] }));
function fixture() {
  const handlers = { ...callbacks(), setQuestPinned: vi.fn(), abandonQuest: vi.fn() };
  const ui = new OverworldUi({} as UiSkin, {} as PixelUi, { avatar: art.pixel.panel, missing: art.pixel.panel }, handlers);
  const model: OverworldUiModel = { width: 800, height: 600, connected: true, playerCount: 1, selectedSlot: 0,
    inventory: [], hasBackpack: true, audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null,
    contentRegistry: bootstrapContentRegistry(), quests };
  ui.update(model); const roots = ui.enableRetainedReading(art), runtime = new GameUiRuntime();
  for (const window of ['quests', 'help'] as const) runtime.register({ id: window, root: roots[window], priority: 500,
    active: () => ui.openWindow === window && !ui.blockingUpdatePromptVisible, blocking: () => true });
  cleanup.push(() => { runtime.dispose(); ui.disposeRetainedReading(); });
  return { ui, roots, runtime, handlers, model };
}
function element(root: UiRoot, id: string) { root.arrange(); const node = root.entries().find(entry => entry.element.id === id)?.element; expect(node, id).toBeDefined(); return node!; }
function point(root: UiRoot, id: string) { const node = element(root, id); expect(node.clip.height).toBeGreaterThan(0); return { x: node.clip.x + node.clip.width / 2, y: node.clip.y + node.clip.height / 2 }; }

it('deep-links real quests, retains focus through resize and emits one pinned command per activation', () => {
  const { ui, roots, runtime, handlers, model } = fixture();
  expect(ui.openQuest('missing')).toBe(false); expect(ui.openQuest('quest23')).toBe(true);
  expect(roots.quests.focus.current?.id).toBe('quests.list');
  expect(element(roots.quests, 'quests.list').props['selected']).toEqual(['quest23']);
  const root = roots.quests;
  ui.update({ ...model, width: 360, height: 270, quests: quests.map(q => ({ ...q, pinned: true })) });
  expect(root.focus.current?.id).toBe('quests.list');
  root.focus.set(element(root, 'quests.pin'));
  runtime.key({ key: 'Enter' }); runtime.key({ key: 'Enter', repeat: true });
  expect(handlers.setQuestPinned).toHaveBeenCalledExactlyOnceWith('quest23', false);
  runtime.key({ key: 'Escape' }); expect(ui.openWindow).toBeNull(); expect(root.focus.current).toBeNull();
  ui.handleKeyDown('KeyL', false); expect(ui.openWindow).toBe('quests');
  runtime.key({ key: 'l' }); expect(ui.openWindow).toBeNull();
});

it('keeps guide navigation and parent back policy in the retained host', () => {
  const { ui, roots, runtime, model } = fixture(); ui.openWindow = 'help';
  expect(roots.help.focus.current?.id).toBe('game.help.pages');
  runtime.key({ key: 'e' }); runtime.key({ key: 'q' });
  ui.update({ ...model, width: 360, height: 270 });
  expect(roots.help.focus.current?.id).toBe('game.help.pages');
  runtime.key({ key: 'Escape' }); expect(ui.openWindow).toBe('system');
  ui.openWindow = 'help'; runtime.key({ key: 'x' }); expect(ui.openWindow).toBe('system');
  ui.openWindow = 'help'; runtime.key({ key: 'l' }); expect(ui.openWindow).toBe('quests');
});

it('cancels old modal releases on switch and suppresses a secondary touch before actions or focus', () => {
  const { ui, roots, runtime, handlers } = fixture(); ui.openQuest('quest0');
  const p = point(roots.quests, 'quests.drop');
  runtime.pointer({ type: 'down', point: p, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
  runtime.pointer({ type: 'down', point: p, pointerId: 2, button: 0, pointerType: 'touch', isPrimary: false });
  runtime.pointer({ type: 'up', point: p, pointerId: 2, button: 0, pointerType: 'touch', isPrimary: false });
  expect(handlers.abandonQuest).not.toHaveBeenCalled();
  ui.openWindow = 'help'; runtime.reconcile();
  runtime.pointer({ type: 'up', point: p, pointerId: 1, button: 0, pointerType: 'touch', isPrimary: true });
  expect(handlers.abandonQuest).not.toHaveBeenCalled(); expect(ui.openWindow).toBe('help');
});

it('retires legacy hit targets and draws one shared quest frame', () => {
  const { ui, roots, handlers } = fixture(); ui.openQuest('quest0');
  const p = point(roots.quests, 'quests.drop');
  expect(ui.pointerDown(p, 0)).toBe(true); ui.pointerUp(p, 0);
  expect(handlers.abandonQuest).not.toHaveBeenCalled();
  const context = createCanvas(800, 600).getContext('2d') as unknown as CanvasRenderingContext2D;
  // The legacy skin is intentionally empty: painting legacy frame chrome would fail.
  (ui as unknown as { drawWindow(ctx: CanvasRenderingContext2D, window: 'quests'): void }).drawWindow(context, 'quests');
  const root = roots.quests; ui.disposeRetainedReading(); expect(root.disposed).toBe(true);
});

it('keeps quest actions fully reachable inside the actual short game viewport', () => {
  const { ui, roots, model } = fixture(); ui.openQuest('quest23');
  ui.update({ ...model, width: 320, height: 180 });
  for (const id of ['quests.list', 'quests.pin', 'quests.drop']) {
    const control = element(roots.quests, id);
    expect(control.clip.height).toBe(control.rect.height); expect(control.clip.width).toBe(control.rect.width);
    expect(control.clip.height).toBeGreaterThan(0);
    expect(control.rect.x).toBeGreaterThanOrEqual(0); expect(control.rect.y).toBeGreaterThanOrEqual(0);
    expect(control.rect.x + control.rect.width).toBeLessThanOrEqual(320);
    expect(control.rect.y + control.rect.height).toBeLessThanOrEqual(180);
  }
});
