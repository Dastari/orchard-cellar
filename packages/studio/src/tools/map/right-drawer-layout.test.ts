import { describe, expect, it } from 'vitest';
import { mapRightDrawerCards } from './right-drawer-layout.js';

describe('map right drawer floating cards', () => {
  const drawer = { x: 1_140, y: 20, width: 260, height: 620 };

  it('gives Layers the full inset drawer when selection is empty', () => {
    expect(mapRightDrawerCards(drawer, false)).toEqual({
      selection: null,
      layers: { x: 1_144, y: 24, width: 252, height: 612 },
    });
  });

  it('separates Selection above Layers with a stable non-overlapping gap', () => {
    const cards = mapRightDrawerCards(drawer, true);
    expect(cards.selection).toEqual({ x: 1_144, y: 24, width: 252, height: 320 });
    expect(cards.layers).toEqual({ x: 1_144, y: 352, width: 252, height: 284 });
    expect(cards.selection!.y + cards.selection!.height).toBeLessThan(cards.layers.y);
  });

  it('keeps both cards within a short drawer without negative geometry', () => {
    const cards = mapRightDrawerCards({ ...drawer, height: 180 }, true);
    expect(cards.selection).toMatchObject({ width: 252, height: 79 });
    expect(cards.layers).toMatchObject({ width: 252, height: 85 });
  });
});
