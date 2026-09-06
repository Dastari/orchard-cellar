import { describe, expect, it, vi } from 'vitest';
import {
  reconcileStudioToolLifecycles,
  shouldActivateStudioCanvasActionWithModifiers,
  shouldHoldStudioSpacePan,
  shouldToggleStudioGrid,
  studioCanvasActionActivation,
} from './app.js';

const key = (overrides: Partial<Parameters<typeof shouldToggleStudioGrid>[0]> = {}) => ({
  key: 'g', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, ...overrides,
});

describe('Studio shell keyboard policy', () => {
  it('reserves unmodified G for the global grid preference', () => {
    expect(shouldToggleStudioGrid(key(), false)).toBe(true);
    expect(shouldToggleStudioGrid(key({ key: 'G' }), false)).toBe(true);
  });

  it('does not steal G from text editors, modified shortcuts, or key repeat', () => {
    expect(shouldToggleStudioGrid(key(), true)).toBe(false);
    expect(shouldToggleStudioGrid(key({ ctrlKey: true }), false)).toBe(false);
    expect(shouldToggleStudioGrid(key({ shiftKey: true }), false)).toBe(false);
    expect(shouldToggleStudioGrid(key({ repeat: true }), false)).toBe(false);
  });

  it('holds unmodified Space only for a spatial pan surface outside text editing', () => {
    const space = { key: ' ', altKey: false, ctrlKey: false, metaKey: false };
    expect(shouldHoldStudioSpacePan(space, false, true)).toBe(true);
    expect(shouldHoldStudioSpacePan(space, true, true)).toBe(false);
    expect(shouldHoldStudioSpacePan(space, false, false)).toBe(false);
    expect(shouldHoldStudioSpacePan({ ...space, ctrlKey: true }, false, true)).toBe(false);
  });

  it('preserves pointer modifiers for Canvas-native action activation', () => {
    expect(studioCanvasActionActivation({
      shiftKey: true,
      altKey: false,
      ctrlKey: true,
      metaKey: false,
    })).toEqual({ shiftKey: true, altKey: false, ctrlKey: true, metaKey: false });
  });

  it('reserves modified Enter or Space for the focused Canvas action', () => {
    const event = { key: 'Enter', shiftKey: true, altKey: false, ctrlKey: false, metaKey: false };
    expect(shouldActivateStudioCanvasActionWithModifiers(event)).toBe(true);
    expect(shouldActivateStudioCanvasActionWithModifiers({ ...event, key: ' ', shiftKey: false,
      metaKey: true })).toBe(true);
    expect(shouldActivateStudioCanvasActionWithModifiers({ ...event, shiftKey: false })).toBe(false);
    expect(shouldActivateStudioCanvasActionWithModifiers({ ...event, key: 'ArrowDown' })).toBe(false);
  });

  it('disposes a keyed tool lifecycle only after it leaves the composed scene', () => {
    const dispose = vi.fn();
    const lifecycle = { key: 'map-canvas:live-island', dispose };
    const mounted = reconcileStudioToolLifecycles(new Map(), [lifecycle]);
    expect(reconcileStudioToolLifecycles(mounted, [{ ...lifecycle }])).toHaveLength(1);
    expect(dispose).not.toHaveBeenCalled();
    expect(reconcileStudioToolLifecycles(mounted, [])).toHaveLength(0);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('rejects duplicate lifecycle keys in split-screen composition', () => {
    const lifecycle = { key: 'duplicate', dispose: vi.fn() };
    expect(() => reconcileStudioToolLifecycles(new Map(), [lifecycle, lifecycle]))
      .toThrow('studio_canvas_tool_lifecycle_duplicate:duplicate');
  });
});
