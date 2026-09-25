import { describe, expect, it, vi } from 'vitest';
import type { PixelUi, UiSkin } from '@orchard/ui';
import {
  ConnectionRecoveryOverlay, TERRAIN_GAP_GRACE_MS, WORLD_GAP_GRACE_MS, connectionRecoveryLayout, worldGapPresentation,
} from './connection-recovery-overlay.js';

function overlay() { return new ConnectionRecoveryOverlay({} as PixelUi, {} as UiSkin); }
const viewport = { width: 257, height: 555, scale: 2, left: 12, top: 24 };

describe('canvas connection recovery', () => {
  it.each(['reconnecting', 'offline', 'sign-in-required', 'content-incompatible'] as const)('activates only the visible %s button once', state => {
    const ui = overlay();
    const action = vi.fn();
    const { button } = connectionRecoveryLayout(viewport);
    expect(ui.activate({ x: button.x + 2, y: button.y + 2 }, viewport, state, action)).toBe(true);
    expect(action).toHaveBeenCalledExactlyOnceWith(state === 'sign-in-required' ? 'sign-in' : 'retry');
    expect(ui.activate({ x: button.x - 1, y: button.y }, viewport, state, action)).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
    expect(ui.primaryAction(state)).toBe(state === 'sign-in-required' ? 'sign-in' : 'retry');
  });

  it.each([{ width: 257, height: 555 }, { width: 320, height: 180 }, { width: 160, height: 138 }])(
    'keeps shared paint/hit geometry within a small viewport $width x $height', size => {
      const { frame, button } = connectionRecoveryLayout(size);
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.x + frame.width).toBeLessThanOrEqual(size.width);
      expect(frame.y + frame.height).toBeLessThanOrEqual(size.height);
      expect(button.x).toBeGreaterThanOrEqual(frame.x);
      expect(button.y).toBeGreaterThanOrEqual(frame.y);
      expect(button.x + button.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(button.y + button.height).toBeLessThanOrEqual(frame.y + frame.height);
    },
  );

  function rendererFixture() {
    const events: string[] = [];
    const context = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), fillRect: vi.fn(() => events.push('background')) };
    const renderer = {
      cssWidth: 538, cssHeight: 1158,
      compositeWorld: vi.fn(() => events.push('world')),
      beginUi: vi.fn(() => { events.push('begin'); return context as unknown as CanvasRenderingContext2D; }),
      endUi: vi.fn(() => events.push('end')),
    };
    return { events, context, renderer };
  }

  it('restores the retained world before every disconnected modal frame, with matching UI coordinates', () => {
    const ui = overlay();
    const { events, context, renderer } = rendererFixture();
    const draw = vi.spyOn(ui, 'draw').mockImplementation(() => { events.push('modal'); });
    for (let frame = 0; frame < 3; frame += 1) expect(ui.composite(renderer, viewport, 'offline', true)).toBe(true);
    expect(events).toEqual(Array.from({ length: 3 }, () => ['world', 'begin', 'modal', 'end']).flat());
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.translate).toHaveBeenCalledWith(6, 12);
    expect(renderer.beginUi).toHaveBeenCalledWith(2);
    expect(draw).toHaveBeenCalledWith(context, viewport, 'offline');
  });

  it('paints an opaque base without a world frame and always releases renderer state', () => {
    const ui = overlay();
    const { events, context, renderer } = rendererFixture();
    vi.spyOn(ui, 'draw').mockImplementation(() => { events.push('modal'); throw new Error('paint'); });
    expect(() => ui.composite(renderer, viewport, 'sign-in-required', false)).toThrow('paint');
    expect(events).toEqual(['begin', 'background', 'modal', 'end']);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 269, 579);
    expect(renderer.compositeWorld).not.toHaveBeenCalled();
  });

  it('yields both rendering and all activation paths to the update prompt or hidden recovery', () => {
    const ui = overlay();
    const { renderer } = rendererFixture();
    const { button } = connectionRecoveryLayout(viewport);
    const point = { x: button.x + 2, y: button.y + 2 };
    const action = vi.fn();
    for (const state of ['reconnecting', 'offline', 'sign-in-required', 'content-incompatible'] as const) {
      expect(ui.composite(renderer, viewport, state, true, true)).toBe(false);
      expect(ui.activate(point, viewport, state, action, true)).toBe(false);
      expect(ui.primaryAction(state, true)).toBeNull();
    }
    expect(ui.composite(renderer, viewport, null, true)).toBe(false);
    expect(ui.activate(point, viewport, null, action)).toBe(false);
    expect(renderer.beginUi).not.toHaveBeenCalled();
    expect(renderer.compositeWorld).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });
});

describe('world gap presentation (BUG-040)', () => {
  it('shows the gateway loading screen only before the first world frame', () => {
    expect(worldGapPresentation(null, false, false, 0, 60_000)).toEqual({ kind: 'initial-loading' });
  });

  it('keeps the last world frame while a healthy connection re-syncs, then a neutral note without RETRY', () => {
    expect(worldGapPresentation(null, true, false, 1_000, 1_000)).toEqual({ kind: 'retained-world' });
    expect(worldGapPresentation(null, true, false, 1_000, 1_000 + WORLD_GAP_GRACE_MS - 1)).toEqual({ kind: 'retained-world' });
    expect(worldGapPresentation(null, true, false, 1_000, 1_000 + WORLD_GAP_GRACE_MS)).toEqual({ kind: 'resyncing' });
  });

  it('keeps error stages on the gateway screen with their own message and refresh action, even mid-session', () => {
    expect(worldGapPresentation(null, true, true, 1_000, 1_000)).toEqual({ kind: 'initial-loading' });
    expect(worldGapPresentation(null, true, true, 1_000, 1_000 + WORLD_GAP_GRACE_MS * 10)).toEqual({ kind: 'initial-loading' });
  });

  it.each(['reconnecting', 'offline', 'sign-in-required', 'content-incompatible'] as const)(
    'shows an explicit %s state at once, with or without a world frame', (state) => {
      expect(worldGapPresentation(state, true, false, 1_000, 1_000)).toEqual({ kind: 'recovery', state });
      expect(worldGapPresentation(state, false, false, 1_000, 1_000)).toEqual({ kind: 'recovery', state });
    });

  it('shows a topside arrival waiting for terrain as a light note over the retained world (static world S4f)', () => {
    expect(worldGapPresentation(null, true, false, 1_000, 1_000, WORLD_GAP_GRACE_MS, true)).toEqual({ kind: 'retained-world' });
    expect(worldGapPresentation(null, true, false, 1_000, 1_000 + TERRAIN_GAP_GRACE_MS, WORLD_GAP_GRACE_MS, true))
      .toEqual({ kind: 'resyncing', reason: 'terrain' });
    // Never the gateway loading screen once a world frame exists; before it, the loading screen shows the terrain stage.
    expect(worldGapPresentation(null, false, false, 1_000, 60_000, WORLD_GAP_GRACE_MS, true)).toEqual({ kind: 'initial-loading' });
    // A connection problem still wins.
    expect(worldGapPresentation('offline', true, false, 1_000, 60_000, WORLD_GAP_GRACE_MS, true)).toEqual({ kind: 'recovery', state: 'offline' });
    // Without a terrain wait nothing changes.
    expect(worldGapPresentation(null, true, false, 1_000, 1_000 + TERRAIN_GAP_GRACE_MS)).toEqual({ kind: 'retained-world' });
  });
});
