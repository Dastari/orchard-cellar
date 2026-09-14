import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface BarrelAsset {
  readonly size: readonly [number, number];
  readonly anchor: readonly [number, number];
  readonly frames: Readonly<Record<string, readonly (readonly string[])[]>>;
  readonly sourceRegions: Readonly<Record<string, readonly (readonly number[])[]>>;
}

const barrel = JSON.parse(readFileSync(
  new URL('../../../assets/props/prop_cf_barrel.sprite.json', import.meta.url),
  'utf8',
)) as BarrelAsset;

function opaquePixels(rows: readonly string[]): number {
  return rows.reduce((total, row) => total + [...row].filter((pixel) => pixel !== '.').length, 0);
}

describe('reviewed crafting prop extraction', () => {
  it('keeps both complete tightly-cropped barrel states instead of only their top source cell', () => {
    expect(barrel.size).toEqual([16, 19]);
    expect(barrel.anchor).toEqual([8, 18]);
    expect(barrel.sourceRegions).toMatchObject({
      closed: [[64, 13, 16, 19]],
      open: [[48, 13, 16, 19]],
    });

    for (const state of ['closed', 'open']) {
      const frame = barrel.frames[state]?.[0];
      expect(frame, state).toHaveLength(19);
      expect(frame?.every((row) => row.length === 16), state).toBe(true);
      expect(opaquePixels(frame?.slice(0, 6) ?? []), `${state} rim`).toBeGreaterThan(0);
      expect(opaquePixels(frame?.slice(6) ?? []), `${state} body`).toBeGreaterThan(150);
    }
  });
});
