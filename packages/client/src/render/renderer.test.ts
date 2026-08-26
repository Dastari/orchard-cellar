import { describe, expect, it, vi } from 'vitest';
import {
  drawWorldDepthQueue,
  minimumWorldZoom,
  sortWorldDepthItems,
  worldPassCapacity,
  worldPassLayout,
} from './renderer.js';

describe('unified renderer zoom math', () => {
  it('uses an integer sharp pass and a DPR-aware final scale', () => {
    const integer = worldPassLayout(960, 540, 2, 2);
    expect(integer.deviceZoom).toBe(4);
    expect(integer.integerScale).toBe(4);
    expect([integer.width, integer.height]).toEqual([1920, 1080]);

    const fractional = worldPassLayout(960, 540, 2, 2.25);
    expect(fractional.deviceZoom).toBe(4.5);
    expect(fractional.integerScale).toBe(5);
    expect([fractional.width, fractional.height]).toEqual([2134, 1200]);
  });

  it('clamps zoom-out to the island and offscreen budgets', () => {
    expect(minimumWorldZoom(960, 540, 1, 192 * 16)).toBe(1.5);
    const minimum = minimumWorldZoom(1920, 1080, 2, 192 * 16);
    const layout = worldPassLayout(1920, 1080, 2, minimum);
    expect(layout.width).toBeLessThanOrEqual(4096);
    expect(layout.height).toBeLessThanOrEqual(2304);
    expect(1920 / minimum).toBeLessThanOrEqual(192 * 16);
  });

  it('keeps a stable backing allocation through nearby eased zoom frames', () => {
    const first = worldPassCapacity(1_921, 1_081);
    expect(first).toEqual({ width: 2_048, height: 1_152 });
    expect(worldPassCapacity(1_980, 1_110, first.width, first.height)).toEqual(first);
    expect(worldPassCapacity(1_700, 900, first.width, first.height)).toEqual(first);
    expect(worldPassCapacity(2_049, 1_153, first.width, first.height)).toEqual({ width: 2_304, height: 1_296 });
  });

  it('never clips the active world pass at fractional integer-scale thresholds', () => {
    for (const zoom of [0.75, 1, 1.01, 1.25, 1.5, 2, 2.01, 2.25]) {
      const layout = worldPassLayout(1_400, 1_254, 2, zoom);
      expect(layout.width).toBeLessThanOrEqual(4_096);
      expect(layout.height).toBeLessThanOrEqual(2_304);
    }
  });

  it('interleaves depth layers around every sorted world drawable', () => {
    const order: string[] = [];
    const drawRange = vi.fn((minimum: number, maximum: number) => {
      order.push(`weather:${minimum}:${maximum}`);
      return 1;
    });
    const draws = drawWorldDepthQueue([
      { footY: 30, tie: 'house', draw: () => order.push('house') },
      { footY: 20, tie: 'tree', draw: () => order.push('tree') },
      { footY: 30, tie: 'player', draw: () => order.push('player') },
    ], 10, 2, drawRange);
    expect(draws).toBe(4);
    expect(order).toEqual([
      'weather:-Infinity:20',
      'tree',
      'weather:20:40',
      'house',
      'weather:40:40',
      'player',
      'weather:40:Infinity',
    ]);
  });

  it('30§5 composites raised caps above lower actors while wall faces retain foot-Y sorting', () => {
    const items = [
      { footY: 44, elevationLayer: 0, depthPhase: 'entity' as const, tie: 'lower-behind' },
      { footY: 48, elevationLayer: 0, depthPhase: 'boundary' as const, tie: 'lower-wall-face' },
      { footY: 48, elevationLayer: 1, depthPhase: 'entity' as const, tie: 'upper-on-top' },
      { footY: 52, elevationLayer: 0, depthPhase: 'entity' as const, tie: 'lower-in-front' },
      { footY: 48, elevationLayer: 1, depthPhase: 'surface' as const, tie: 'upper-cap' },
    ];
    expect(sortWorldDepthItems(items).map(({ tie }) => tie)).toEqual([
      'lower-behind',
      'lower-wall-face',
      'lower-in-front',
      'upper-cap',
      'upper-on-top',
    ]);
  });

  it('30§5 paints a wall before a lower actor once the actor foot is south of the visible wall', () => {
    expect(sortWorldDepthItems([
      { footY: 80, elevationLayer: 0, depthPhase: 'boundary' as const, tie: 'visible-wall' },
      { footY: 81, elevationLayer: 0, depthPhase: 'entity' as const, tie: 'player-head-must-survive' },
    ]).map(({ tie }) => tie)).toEqual(['visible-wall', 'player-head-must-survive']);
  });
});
