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
import { runtimePlayerAppearanceCatalog } from '@orchard/sim';
import { cycleAppearanceValue, type CharacterScreenModel } from './character-screen.js';

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

const appearance = { hairKind: 'hair_1_brown', shirtKind: 'farmer_green', pantsKind: 'farmer_white_brown', shoesKind: 'brown' } as const;
const catalog = runtimePlayerAppearanceCatalog(bootstrapContentRegistry())!;
function character(): CharacterScreenModel {
  return { playerId: 'self', displayName: 'Mara', appearance, appearanceCatalog: catalog,
    baseAttributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, resolvedAttributes: { str: 12, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    health: 8000, maxHealth: 10000, mana: 5000, maxMana: 10000, vigour: 9000, maxVigour: 10000,
    tracks: [{ track: 'combat', experience: 9007199254740993n }], effects: ['Rested'],
    equipment: [] };
}

function fixture() {
  const handlers = { ...callbacks(), setAppearance: vi.fn<(_: CharacterScreenModel['appearance']) => Promise<void>>().mockResolvedValue(undefined) };
  const ui = new OverworldUi({} as UiSkin, {} as PixelUi, { avatar: art.pixel.panel, missing: art.pixel.panel }, handlers);
  let model: OverworldUiModel = { width: 800, height: 600, connected: true, playerCount: 1, selectedSlot: 0,
    inventory: [], hasBackpack: true, audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null,
    contentRegistry: bootstrapContentRegistry(), character: character() };
  ui.update(model); const roots = ui.enableRetainedCharacter(art), runtime = new GameUiRuntime();
  for (const window of ['character', 'statistics'] as const) runtime.register({ id: window, root: roots[window], priority: 500,
    active: () => ui.openWindow === window && ui.retainedCharacterActive && !ui.blockingUpdatePromptVisible, blocking: () => true });
  cleanup.push(() => { runtime.dispose(); ui.disposeRetainedCharacter(); });
  return { ui, roots, runtime, handlers, update(next: Partial<OverworldUiModel>) { model = { ...model, ...next }; ui.update(model); } };
}
function element(root: UiRoot, id: string) { root.arrange(); const node = root.entries().find(entry => entry.element.id === id)?.element; expect(node, id).toBeDefined(); return node!; }
function point(root: UiRoot, id: string) { const node = element(root, id); root.focus.set(node); root.arrange(); expect(node.clip.height).toBe(node.rect.height); return { x: node.clip.x + node.clip.width / 2, y: node.clip.y + node.clip.height / 2 }; }
const hair = 'character.appearance.hairKind.next';
it('routes appearance once through the real parent and cancels old view captures on close and reconnect', () => {
  const f = fixture(); f.ui.openWindow = 'character'; const p = point(f.roots.character, hair);
  f.runtime.pointer({ type: 'down', point: p, pointerId: 1, button: 0 }); expect(f.handlers.setAppearance).not.toHaveBeenCalled();
  f.runtime.pointer({ type: 'up', point: p, pointerId: 1, button: 0 }); expect(f.handlers.setAppearance).toHaveBeenCalledOnce();
  f.runtime.key({ key: 'Enter', repeat: true }); expect(f.handlers.setAppearance).toHaveBeenCalledOnce();
  f.ui.pointerDown(p, 0); f.ui.pointerUp(p, 0); expect(f.handlers.setAppearance).toHaveBeenCalledOnce();
  f.runtime.pointer({ type: 'down', point: p, pointerId: 2, button: 0 }); f.update({ connected: false }); f.update({ connected: true });
  f.runtime.pointer({ type: 'up', point: p, pointerId: 2, button: 0 }); expect(f.handlers.setAppearance).toHaveBeenCalledOnce();
  f.runtime.key({ key: 'Escape' }); expect(f.ui.openWindow).toBeNull();
});
it('retains the rejecting transport contract and follows external appearance authority', async () => {
  const f = fixture(); const next = cycleAppearanceValue(appearance, catalog, 'hairKind', 1);
  f.update({ character: { ...character(), appearance: next } }); f.ui.openWindow = 'character';
  f.roots.character.focus.set(element(f.roots.character, hair)); f.handlers.setAppearance.mockRejectedValueOnce(new Error('rejected'));
  f.runtime.key({ key: 'Enter' }); expect(f.handlers.setAppearance).toHaveBeenLastCalledWith(cycleAppearanceValue(next, catalog, 'hairKind', 1));
  await Promise.resolve(); f.runtime.key({ key: 'Enter' }); expect(f.handlers.setAppearance).toHaveBeenLastCalledWith(cycleAppearanceValue(next, catalog, 'hairKind', 1));
});
it('preserves parent shortcuts, shared navigation and compact bounds without legacy outer chrome', () => {
  const f = fixture(); f.ui.openWindow = 'character'; f.runtime.key({ key: 'k' }); expect(f.ui.openWindow).toBe('skills');
  for (const window of ['character', 'statistics'] as const) {
    f.ui.openWindow = window; f.update({ width: 320, height: 180 }); const root = f.roots[window];
    const host = element(root, `game.${window}.host`); expect(host.rect.x).toBeGreaterThanOrEqual(0); expect(host.rect.y).toBeGreaterThanOrEqual(0); expect(host.rect.x + host.rect.width).toBeLessThanOrEqual(320); expect(host.rect.y + host.rect.height).toBeLessThanOrEqual(180);
    const canvas = createCanvas(320, 180); (f.ui as unknown as { drawWindow(ctx: CanvasRenderingContext2D, name: string): void }).drawWindow(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, window);
    f.runtime.key({ key: 'i' }); expect(f.ui.openWindow).toBe('inventory');
  }
  f.ui.openWindow = 'statistics'; f.roots.statistics.focus.set(element(f.roots.statistics, 'book.tab.character')); f.runtime.key({ key: 'Enter' }); expect(f.ui.openWindow).toBe('character');
});
