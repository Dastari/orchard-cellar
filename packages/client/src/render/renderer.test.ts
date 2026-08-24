import { describe, expect, it, vi } from 'vitest';
import { drawWorldDepthQueue, minimumWorldZoom, worldPassLayout } from './renderer.js';

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
    expect(minimumWorldZoom(960, 540, 1, 192 * 16)).toBe(0.313);
    const minimum = minimumWorldZoom(1920, 1080, 2, 192 * 16);
    const layout = worldPassLayout(1920, 1080, 2, minimum);
    expect(layout.width).toBeLessThanOrEqual(4096);
    expect(layout.height).toBeLessThanOrEqual(2304);
    expect(1920 / minimum).toBeLessThanOrEqual(192 * 16);
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
});
