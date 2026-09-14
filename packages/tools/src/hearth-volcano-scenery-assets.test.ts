import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { decodePng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';
const root = resolve(import.meta.dirname, '../../..');
it('preserves complete native volcanic scenery crops, ground contact and translucent shadows', async () => {
  for (const name of ['prop_cf_cinder_blossom_small','prop_cf_cinder_blossom_large','prop_cf_cinder_violet_plant',
    'prop_cf_cinder_column_cluster','prop_cf_cinder_broad_pillar','building_cf_cinder_tower']) {
    const category = name.startsWith('building_') ? 'buildings' : 'props';
    const asset = JSON.parse(await readFile(resolve(root, `packages/assets/${category}/${name}.sprite.json`), 'utf8')) as AssetSource;
    const source = decodePng(await readFile(resolve(root, asset.sourcePath!)));
    const [sx, sy, width, height] = asset.sourceRegions!.base![0]!;
    if (name === 'prop_cf_cinder_blossom_large') {
      expect([sx, sy, width, height]).toEqual([32,0,48,48]);
      expect(asset.anchor).toEqual([22,41]);
    }
    expect(asset.size).toEqual([width, height]); expect(asset.sourcePaletteMode).toBe('exact');
    expect(asset.frameKinds?.base).toBe('state'); expect(asset.frames.base).toHaveLength(1);
    let contactY = -1; const shadows = new Set<string>();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const at = ((sy + y) * source.width + sx + x) * 4, alpha = source.rgba[at + 3]!;
      const key = asset.frames.base![0]![y]![x]!;
      if (alpha === 0) { expect(key).toBe('.'); continue; }
      const color = '#' + [...source.rgba.slice(at, at + (alpha === 255 ? 3 : 4))].map(v => v.toString(16).padStart(2,'0')).join('');
      expect(asset.sourcePalette?.[key], `${name}:${x},${y}`).toBe(color);
      if (alpha === 255) contactY = y; else shadows.add(color);
    }
    expect(contactY).toBe(asset.anchor[1]); expect(asset.anchor[0]).toBeGreaterThanOrEqual(0);
    expect(asset.anchor[0]).toBeLessThan(width); expect(shadows.size).toBe(1);
    expect(asset.bakedShadowColor).toBe([...shadows][0]);
    expect(asset.placement?.builderAvailable).toBe(false);
  }
});
