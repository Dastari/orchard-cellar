import { describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, type TimingProjection } from '@orchard/sim';
import { timingLabels, drawTimingPane } from './timing.js';
import * as pixel from '../../pixel-ui.js';
import * as skin from '../../skin.js';
import * as storage from '../../storage-frame.js';
import { drawContentFrame, layoutContentFrame } from '../../content-frame.js';

const timing: TimingProjection = { status: 'running', reason: null, stage: null, progress: 0.5,
  remainingActiveTicks: 1_180n, nextTransitionTick: 2_000n, confidence: 'exact' };
describe('kit timing presentation', () => {
  it('formats only when displayed precision changes and labels estimates', () => {
    expect(timingLabels(timing)).toEqual({ status: 'IN PROGRESS', time: '0:59 LEFT' });
    expect(timingLabels({ ...timing, remainingActiveTicks: 1_179n })).toBe(timingLabels(timing));
    expect(timingLabels({ ...timing, confidence: 'estimated' }).time).toBe('~0:59 LEFT');
    expect(timingLabels({ ...timing, status: 'awaiting-settlement' })).toEqual({ status: 'COLLECT TO CONFIRM', time: 'ESTIMATED' });
    expect(timingLabels({ ...timing, status: 'paused', reason: 'dry' }).time).toBe('');
  });

  it.each(['furnace', 'cooking', 'press', 'fermentation', 'barrel'])('renders %s status, countdown and meter from its authored binding', kind => {
    const registry = bootstrapContentRegistry();
    const frame = registry.frames.get(`frame:${kind}`)!;
    const pane = frame.panes.find(pane => 'timing' in pane.bind);
    expect(pane).toBeDefined();
    const layout = layoutContentFrame({ width: 480, height: 270 }, frame,
      { entity: 'placeable', backpack: 'backpack', hotbar: 'hotbar' }, registry);
    const text = vi.spyOn(pixel, 'drawPixelTextInRect').mockReturnValue({} as ReturnType<typeof pixel.drawPixelTextInRect>);
    const asset = vi.spyOn(skin, 'drawUiSkinAsset').mockImplementation(() => {});
    vi.spyOn(storage, 'drawStorageFrameChrome').mockImplementation(() => {});
    try {
      const art = { skin: {} as skin.UiSkin, fonts: {} as pixel.PixelUi };
      drawContentFrame({} as CanvasRenderingContext2D, layout, { timing },
        { ...art, drawSlot: () => {}, drawButtons: false, drawResizeHandles: false });
      expect(text.mock.calls.some(call => call[2] === 'IN PROGRESS')).toBe(true);
      expect(text.mock.calls.some(call => call[2] === '0:59 LEFT')).toBe(true);
      expect(asset.mock.calls.some(call => call[2].height === 4 && call[2].width > 0)).toBe(true);
      expect(() => drawTimingPane({} as CanvasRenderingContext2D, { x: 0, y: 0, width: 116, height: 44 }, { ...timing, progress: 0 }, art)).not.toThrow();
    } finally { vi.restoreAllMocks(); }
  });
});
