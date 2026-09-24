import { createCanvas } from '@napi-rs/canvas';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { OverworldUi, type OverworldUiCallbacks, type OverworldUiModel } from './overworld-ui.js';
import type { UiSkin } from './skin.js';
import type { PixelUi } from './pixel-ui.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { UiKitArt } from './kit/components/art.js';
import type { UiRoot } from './kit/runtime/root.js';
import { GameUiRuntime } from './game-host/runtime.js';

let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); vi.stubGlobal('document', { createElement: () => createCanvas(1, 1), querySelector: () => null }); });
afterAll(() => vi.unstubAllGlobals());
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(dispose => dispose()));
function fixture() {
  const begin = vi.fn(), refresh = vi.fn();
  const callbacks = new Proxy({ startDelve: begin, applyClientUpdate: refresh }, { get(target, key) { return target[key as keyof typeof target] ?? (() => {}); } }) as unknown as OverworldUiCallbacks;
  const ui = new OverworldUi({} as UiSkin, {} as PixelUi, { avatar: art.pixel.panel, missing: art.pixel.panel }, callbacks);
  let model: OverworldUiModel = { width: 320, height: 180, connected: true, interactionSessionKey: 'player:generation1', playerCount: 1, selectedSlot: 0,
    inventory: [], hasBackpack: true, audioVolumes: { master: 1, music: 1, sfx: 1 }, canAdministerWorld: false,
    dateLabel: 'SPRING 1', timeLabel: '06:00', timeFraction: 0, raining: false, weatherMode: 'auto', prompt: null, toast: null };
  ui.update(model); const roots = ui.enableRetainedOverlays(art), runtime = new GameUiRuntime();
  runtime.register({ id: 'confirmation', root: roots.confirmation, priority: 700, active: () => ui.retainedConfirmationActive && !ui.blockingUpdatePromptVisible, blocking: () => true });
  runtime.register({ id: 'update', root: roots.update, priority: 1200, active: () => ui.blockingUpdatePromptVisible, blocking: () => true });
  cleanup.push(() => { runtime.dispose(); ui.disposeRetainedOverlays(); });
  return { ui, roots, runtime, begin, refresh, update(next: Partial<OverworldUiModel>) { model = { ...model, ...next }; ui.update(model); } };
}
function point(root: UiRoot, id: string) {
  root.arrange(); const node = root.entries().find(entry => entry.element.id === id)?.element;
  expect(node, id).toBeDefined(); root.focus.set(node!); root.arrange();
  expect(node!.clip).toEqual(node!.rect);
  return { x: node!.rect.x + node!.rect.width / 2, y: node!.rect.y + node!.rect.height / 2 };
}
it('updates PWA decisions synchronously without a render tick and retains Later for the same availability interval', () => {
  const f = fixture(); f.ui.setPwaUpdateStatus('available', { width: 320, height: 180 });
  expect(f.ui.blockingUpdatePromptVisible).toBe(true);
  const p = point(f.roots.update, 'update-ready.later');
  f.runtime.pointer({ type: 'down', point: p, pointerId: 1, button: 0 });
  expect(f.ui.blockingUpdatePromptVisible).toBe(true);
  f.runtime.pointer({ type: 'up', point: p, pointerId: 1, button: 0 });
  expect(f.ui.blockingUpdatePromptVisible).toBe(false); expect(f.refresh).not.toHaveBeenCalled();
  f.ui.setPwaUpdateStatus('available'); expect(f.ui.blockingUpdatePromptVisible).toBe(false);
  f.ui.setPwaUpdateStatus('checking'); f.ui.setPwaUpdateStatus('available');
  expect(f.ui.blockingUpdatePromptVisible).toBe(true);
  f.runtime.key({ key: 'Enter' }); f.runtime.key({ key: 'Enter', repeat: true });
  expect(f.refresh).toHaveBeenCalledOnce();
  f.ui.handleKeyDown('Enter', false); f.ui.pointerDown(point(f.roots.update, 'update-ready.refresh'), 0);
  expect(f.refresh).toHaveBeenCalledOnce();
});
it('routes one confirmation command and closes the actual parent before start, with stale reconnect capture cancelled', () => {
  const f = fixture(); f.ui.openWindow = 'delve-confirmation';
  const button = f.roots.confirmation.entries().find(entry => entry.element.id === 'delve-confirmation.begin')!.element;
  const p = point(f.roots.confirmation, button.id);
  f.runtime.pointer({ type: 'down', point: p, pointerId: 1, button: 0 });
  f.update({ connected: false }); f.update({ connected: true, interactionSessionKey: 'player:generation2' });
  f.runtime.pointer({ type: 'up', point: p, pointerId: 1, button: 0 }); expect(f.begin).not.toHaveBeenCalled();
  f.begin.mockImplementation(() => expect(f.ui.openWindow).toBeNull());
  f.runtime.key({ key: 'e' }); f.runtime.key({ key: 'e', repeat: true }); expect(f.begin).toHaveBeenCalledOnce();
});
it('update modal takeover cancels a held confirmation and compact painting uses the shared host', () => {
  const f = fixture(); f.ui.openWindow = 'delve-confirmation';
  const button = f.roots.confirmation.entries().find(entry => entry.element.id === 'delve-confirmation.begin')!.element;
  const p = point(f.roots.confirmation, button.id);
  f.runtime.pointer({ type: 'down', point: p, pointerId: 4, button: 0 });
  f.ui.setPwaUpdateStatus('available'); f.runtime.reconcile();
  f.runtime.pointer({ type: 'up', point: p, pointerId: 4, button: 0 });
  expect(f.begin).not.toHaveBeenCalled(); expect(f.refresh).not.toHaveBeenCalled();
  const context = createCanvas(320, 180).getContext('2d') as unknown as CanvasRenderingContext2D;
  f.ui.drawBlockingOverlay(context);
  f.ui.setPwaUpdateStatus('current');
  (f.ui as unknown as { drawWindow(ctx: CanvasRenderingContext2D, name: string): void }).drawWindow(context, 'delve-confirmation');
  f.update({ delveActive: true }); expect(f.ui.retainedConfirmationActive).toBe(false);
});
