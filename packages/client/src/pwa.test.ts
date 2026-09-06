import { afterEach, describe, expect, it, vi } from 'vitest';
import { worldLoadingStage } from '@orchard/engine/loading-screen';
import {
  OverworldUi, pwaUpdatePromptLayout,
  type OverworldUiCallbacks, type OverworldUiItemArt, type PixelUi, type UiSkin,
} from '@orchard/ui';
import { WorldUpdateOverlay } from './world-update-overlay.js';
import {
  PWA_UPDATE_CHECK_INTERVAL_MS,
  PwaClient,
  pwaUpdateLabel,
  shouldSuppressGameShellGesture,
} from './pwa.js';

describe('PWA update presentation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('retries failed initial registration on resume and shares concurrent attempts', async () => {
    const registration = Object.assign(new EventTarget(), {
      waiting: null, installing: null, update: vi.fn(async () => undefined),
    });
    const register = vi.fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(registration);
    const serviceWorker = Object.assign(new EventTarget(), { controller: {}, register });
    const document = Object.assign(new EventTarget(), { visibilityState: 'visible', querySelector: () => null });
    const window = Object.assign(new EventTarget(), { setInterval: vi.fn() });
    vi.stubEnv('PROD', true);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { serviceWorker });
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', window);
    const client = new PwaClient();
    await client.start();
    expect(client.status).toBe('error');
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
    await client.start();
    expect(client.status).toBe('current');
    expect(register).toHaveBeenCalledTimes(2);
    expect(window.setInterval).toHaveBeenCalledOnce();
    await client.checkForUpdate();
    expect(registration.update).toHaveBeenCalledOnce();
  });

  it('paints and activates an arriving update while disconnected world readiness blocks normal rendering', async () => {
    const worker = Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn() });
    const registration = Object.assign(new EventTarget(), {
      waiting: null as typeof worker | null,
      installing: null as typeof worker | null,
      update: vi.fn(async () => undefined),
    });
    const serviceWorker = Object.assign(new EventTarget(), {
      controller: {}, register: vi.fn(async () => registration),
    });
    const document = Object.assign(new EventTarget(), { visibilityState: 'visible', querySelector: () => null });
    const reload = vi.fn();
    vi.stubEnv('PROD', true);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { serviceWorker });
    vi.stubGlobal('document', document);
    vi.stubGlobal('window', Object.assign(new EventTarget(), { setInterval: vi.fn() }));
    vi.stubGlobal('location', { reload });
    const client = new PwaClient();
    const ui = new OverworldUi({} as UiSkin, {} as PixelUi, {} as OverworldUiItemArt, {
      applyClientUpdate: () => client.applyUpdate(),
    } as OverworldUiCallbacks);
    const statuses: string[] = [];
    client.subscribe((status) => {
      statuses.push(status);
      ui.setPwaUpdateStatus(status, { width: 360, height: 280 });
    });
    await client.start();
    expect(client.status).toBe('current');

    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));
    registration.waiting = worker;
    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
    expect(client.status).toBe('available');
    expect(reload).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(client.status).toBe('available');

    expect(worldLoadingStage({
      connected: false, error: 'disconnected', identityReady: true,
      worldReady: true, playerReady: true, profileReady: true,
    }).ready).not.toBe(true);
    const context = { translate: vi.fn(), fillRect: vi.fn() };
    const paint = vi.spyOn(ui, 'drawBlockingOverlay').mockImplementation(() => undefined);
    const cursor = vi.spyOn(ui, 'drawCursorOverlay').mockImplementation(() => undefined);
    const renderer = {
      cssWidth: 740, cssHeight: 580,
      compositeWorld: vi.fn(), beginWorld: vi.fn(),
      beginUi: vi.fn(() => context as unknown as CanvasRenderingContext2D), endUi: vi.fn(),
    };
    const overlay = new WorldUpdateOverlay();
    expect(overlay.draw(renderer, ui, { scale: 2, left: 20, top: 20 }, true)).toBe(true);
    expect(renderer.compositeWorld).toHaveBeenCalledOnce();
    expect(renderer.beginWorld).not.toHaveBeenCalled();
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(renderer.beginUi).toHaveBeenCalledWith(2);
    expect(context.translate).toHaveBeenCalledWith(10, 10);
    expect(paint).toHaveBeenCalledOnce();
    expect(cursor).toHaveBeenCalledOnce();
    expect(renderer.endUi).toHaveBeenCalledOnce();
    const refresh = pwaUpdatePromptLayout(360, 280).refreshButton;
    ui.pointerDown({ x: refresh.x + 4, y: refresh.y + 4 }, 0);
    expect(client.status).toBe('updating');
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    // Remove the old modal from the retained image once the decision changes.
    expect(overlay.draw(renderer, ui, { scale: 2, left: 20, top: 20 }, true)).toBe(true);
    expect(renderer.compositeWorld).toHaveBeenCalledTimes(2);
    expect(overlay.draw(renderer, ui, { scale: 2, left: 20, top: 20 }, true)).toBe(false);
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledOnce();
    expect(statuses).toEqual(['unsupported', 'checking', 'current', 'available', 'updating']);
  });
  it('keeps update activation explicit and gives every lifecycle state a concise menu label', () => {
    expect(pwaUpdateLabel('current')).toBe('CHECK UPDATE');
    expect(pwaUpdateLabel('available')).toBe('UPDATE');
    expect(pwaUpdateLabel('updating')).toBe('UPDATING');
    expect(pwaUpdateLabel('error')).toBe('RETRY UPDATE');
    expect(pwaUpdateLabel('unsupported')).toBe('UPDATE UNAVAILABLE');
  });

  it('checks often enough for a long-running installed game session', () => {
    expect(PWA_UPDATE_CHECK_INTERVAL_MS).toBe(5 * 60 * 1_000);
  });

  it('blocks canvas-native gestures without interfering with text editing', () => {
    expect(shouldSuppressGameShellGesture('touchmove', true, false)).toBe(true);
    expect(shouldSuppressGameShellGesture('gesturestart', true, false)).toBe(true);
    expect(shouldSuppressGameShellGesture('wheel', true, false, true)).toBe(true);
    expect(shouldSuppressGameShellGesture('wheel', true, false, false)).toBe(false);
    expect(shouldSuppressGameShellGesture('touchmove', true, true)).toBe(false);
    expect(shouldSuppressGameShellGesture('touchmove', false, false)).toBe(false);
  });
});
