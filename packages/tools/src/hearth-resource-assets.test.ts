import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { decodePng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';
const root = resolve(import.meta.dirname, '../../..');
it('preserves complete native gathering crops and aligns their opaque contact baseline', async () => {
  for (const [name, rect, anchor] of [
    ['basalt',[0,112,32,32],[16,23]], ['cinder',[16,16,16,32],[8,29]],
    ['emberglass',[0,16,16,32],[8,29]], ['ashwood',[0,0,48,64],[25,52]],
  ] as const) {
    const asset = JSON.parse(await readFile(resolve(root, `packages/assets/props/resource_cf_hearth_${name}.sprite.json`), 'utf8')) as AssetSource;
    const source = decodePng(await readFile(resolve(root, asset.sourcePath!)));
    const [sx,sy,w,h] = rect;
    expect(asset.size).toEqual([w,h]); expect(asset.anchor).toEqual(anchor);
    expect(asset.sourceRegions).toEqual({ base: [rect] });
    expect(asset.bakedShadowColor).toBe(name === 'cinder' || name === 'emberglass' ? '#00000064' : '#00000028');
    expect(asset.placement?.builderAvailable).toBe(false);
    let contactY = -1;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      const rgba = source.rgba.slice(((sy+y)*source.width+sx+x)*4, ((sy+y)*source.width+sx+x)*4+4);
      const symbol = asset.frames.base![0]![y]![x]!;
      if (rgba[3] === 0) { expect(symbol).toBe('.'); continue; }
      if (rgba[3] === 255) contactY = Math.max(contactY,y);
      const hex = '#' + [...rgba].slice(0,rgba[3]===255?3:4).map(value=>value.toString(16).padStart(2,'0')).join('');
      expect(asset.sourcePalette?.[symbol], `${name}:${x},${y}`).toBe(hex);
    }
    expect(contactY).toBe(anchor[1]);
  }
});
