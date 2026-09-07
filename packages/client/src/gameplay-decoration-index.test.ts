import { describe, expect, it } from 'vitest';
import { worldPointVisible } from '@orchard/engine/camera';
import { GameplayDecorationIndex } from './gameplay-decoration-index.js';
import type { RuntimeSurvivalDecoration } from './gameplay-painter-inputs.js';

function decoration(id: number, tileX: number, tileY: number): RuntimeSurvivalDecoration {
  return { id, kind: 'camp_pond', tileX, tileY, variant: 0, animationOffset: 0 };
}

describe('retained decoration query', () => {
  it('preserves the full-loop visible sequence across fractional windows, cells, negatives and suppression spellings', () => {
    const source = Array.from({ length: 2000 }, (_, id) => decoration(id, (id * 37 % 180) - 40, (id * 71 % 180) - 40));
    const hidden = ['4', 'decoration-9', 'decoration:15'];
    const index = new GameplayDecorationIndex(source, hidden);
    for (let step = 0; step < 300; step++) {
      const left = step * 3.37 - 400, top = step * 2.71 - 350;
      const visible = { left, top, right: left + 640, bottom: top + 360 };
      const expected = source.filter(d => ![4, 9, 15].includes(d.id)
        && worldPointVisible(d.tileX * 16 + 8, (d.tileY + 1) * 16, visible));
      const actual = index.query(visible).map(i => source[i]!).filter(d => worldPointVisible(d.tileX * 16 + 8, (d.tileY + 1) * 16, visible));
      expect(actual).toEqual(expected);
    }
  });
  it('includes offscreen light candidates and reuses the same query storage within a cell window', () => {
    const source = [decoration(0, 0, 0), decoration(1, 40, 0), decoration(2, -20, 0)];
    const index = new GameplayDecorationIndex(source, []);
    const view = { left: 0, top: 0, right: 100, bottom: 100 };
    expect(index.query(view)).toEqual([0]);
    const lights = { left: -400, top: -100, right: 700, bottom: 200 };
    const result = index.query(view, lights);
    expect(result).toEqual([0, 1, 2]);
    expect(index.query({ ...view, left: 1 }, lights)).toBe(result);
    expect(index.diagnostics).toEqual({ indexed: 3, queries: 2, queryReuses: 1 });
  });
});
