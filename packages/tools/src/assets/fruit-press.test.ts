import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AssetSource } from './types.js';

const press = JSON.parse(readFileSync(new URL(
  '../../../assets/props/prop_basket_press.sprite.json', import.meta.url,
), 'utf8')) as AssetSource;

describe('bench fruit press artwork', () => {
  it('preserves the existing asset identity, canvas, anchor, and collision', () => {
    expect(press.name).toBe('prop_basket_press');
    expect(press.size).toEqual([32, 32]);
    expect(press.anchor).toEqual([16, 31]);
    expect(press.collision).toEqual([[0, 1, 2, 1]]);
  });

  it('stores only contents pixels in the five fruit states, sharing one empty body', () => {
    expect(Object.keys(press.frames).sort()).toEqual([
      'base', 'contents_apple', 'contents_cherry', 'contents_grape', 'contents_peach', 'contents_pear',
    ]);
    const base = press.frames.base![0]!;
    const palettes = new Set<string>();
    for (const name of Object.keys(press.frames).filter((name) => name !== 'base')) {
      const overlay = press.frames[name]![0]!;
      let fruitPixels = 0;
      let juicePixels = 0;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        if (overlay[y]![x] === '.') continue;
        expect(base[y]![x]).not.toBe('.');
        const inBasket = y >= 14 && y <= 15 && x >= 10 && x < 20;
        const inBucket = y === 26 && x >= 21 && x < 25;
        expect(inBasket || inBucket, `${name}: changes machinery at ${x},${y}`).toBe(true);
        if (inBasket) fruitPixels++;
        if (inBucket) juicePixels++;
      }
      expect(fruitPixels).toBeGreaterThan(0);
      expect(juicePixels).toBeGreaterThan(0);
      expect(fruitPixels + juicePixels).toBeLessThan(32);
      palettes.add([...new Set(overlay.join('').replaceAll('.', ''))].sort().join(''));
    }
    expect(palettes.size).toBe(5);
  });
});
