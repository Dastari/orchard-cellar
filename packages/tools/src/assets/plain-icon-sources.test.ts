import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadAssets, workspaceRoot } from './load.js';
import { decodePng } from './png.js';
import { plainItemIconImport } from './plain-item-icon-sources.js';

describe('plain imported icon variants', () => {
  it('selects plain produce and gem cells before extraction without changing world nodes or approved tools', () => {
    const input = { name: 'item_cf_crop_onion', source: 'Crops_2.png',
      groups: { base: [[96, 176, 16, 16] as const] }, tags: ['crop.onion'] };
    const onion = plainItemIconImport(input);
    expect(onion.source).toContain('/No Outline/Food_Icons_NO_Outline.png');
    expect(onion.groups.base).toEqual([[32, 144, 16, 16]]);
    expect(onion.tags).toBe(input.tags);
    expect(input.source).toBe('Crops_2.png');
    const gem = plainItemIconImport({ ...input, name: 'item_cf_amethyst_ore' });
    expect(gem.source).toContain('/No Outline/Resources_Icons_NO_Outline.png');
    expect(gem.groups.base).toEqual([[64, 48, 16, 16]]);
    for (const name of ['resource_cf_ore_amethyst', 'crop_cf_onion', 'sign_cf_crop_onion', 'icon_tool_wood_axe']) {
      const other = { ...input, name };
      expect(plainItemIconImport(other)).toBe(other);
    }
    expect(() => plainItemIconImport({ ...input, groups: { base: [[0, 0, 32, 16] as const] } }))
      .toThrow('one native 16x16 base frame');
  });

  it('uses the reviewed plain crop and gem cells even when the old sheet filename did not mention outlines', async () => {
    const expected = JSON.parse(await readFile(new URL('./fixtures/plain-item-icon-sources.json', import.meta.url), 'utf8')) as {
      readonly asset: string; readonly sourcePath: string; readonly sourceRegion: readonly number[];
    }[];
    const assets = new Map((await loadAssets()).map((asset) => [asset.name, asset]));
    expect(expected).toHaveLength(54);
    expect(new Set(expected.map(({ asset }) => asset)).size).toBe(expected.length);
    for (const entry of expected) {
      const asset = assets.get(entry.asset);
      expect(asset, entry.asset).toBeDefined();
      expect(asset?.sourcePath, entry.asset).toBe(entry.sourcePath);
      expect(asset?.sourceRegions?.base, entry.asset).toEqual([entry.sourceRegion]);
    }
    // Native tool artwork was separately approved; this crop/gem correction
    // must never redirect any of the 24 tool icons to imported outline sheets.
    for (const material of ['wood', 'stone', 'copper', 'gold', 'silver', 'iron']) {
      for (const tool of ['axe', 'hoe', 'pickaxe', 'shovel']) {
        const name = `icon_tool_${material}_${tool}`;
        expect(assets.get(name)?.sourcePath, name).toBe(`art/custom/tool-progression/${name}.png`);
      }
    }
  });

  it.skipIf(process.env['ORCHARD_TEST_LICENSED_ART'] === '0')('uses available plain sheets and retains exact authored crop pixels', async () => {
    const assets = (await loadAssets()).filter((asset) => asset.sourcePath !== undefined
      && (asset.name.startsWith('icon_') || asset.name.startsWith('item_')));
    const images = new Map<string, ReturnType<typeof decodePng>>();
    let reviewed = 0;
    for (const asset of assets) {
      const source = asset.sourcePath!;
      if (source.includes('/Outline/') || /\/sheet-16-outline\.png$/.test(source)) {
        const alternatives = [
          source.replace('/Outline/', '/No Outline/').replace('_Icons_Outline.png', '_Icons_NO_Outline.png'),
          ...['no-outline', 'without-outline', 'classic'].map((variant) => source.replace('sheet-16-outline', `sheet-16-${variant}`)),
        ].filter((candidate) => candidate !== source);
        for (const candidate of alternatives) {
          expect(await access(new URL(candidate, workspaceRoot)).then(() => true, () => false),
            `${asset.name} has an available plain source: ${candidate}`).toBe(false);
        }
        continue;
      }
      if (!/NO_Outline|no-outline|without-outline|sheet-16-classic/.test(source)) continue;
      // Older already-plain imports can predate retained crop provenance.
      if (asset.sourceRegions === undefined && asset.sourceRegion === undefined) continue;
      let image = images.get(source);
      if (image === undefined) {
        image = decodePng(await readFile(new URL(source, workspaceRoot)));
        images.set(source, image);
      }
      for (const [group, frames] of Object.entries(asset.frames)) {
        const regions = asset.sourceRegions?.[group] ?? (asset.sourceRegion === undefined ? [] : [asset.sourceRegion]);
        expect(regions, asset.name).toHaveLength(frames.length);
        frames.forEach((rows, index) => {
          const [x, y] = regions[index]!;
          rows.forEach((row, dy) => [...row].forEach((character, dx) => {
            const offset = ((y + dy) * image!.width + x + dx) * 4;
            const rgba = [...image!.rgba.slice(offset, offset + 4)];
            const expected = rgba[3] === 0 ? undefined : `#${rgba.slice(0, rgba[3] === 255 ? 3 : 4)
              .map((value) => value.toString(16).padStart(2, '0')).join('')}`;
            expect(character === '.' ? undefined : asset.sourcePalette?.[character], asset.name).toBe(expected);
          }));
        });
      }
      reviewed += 1;
    }
    expect(reviewed).toBeGreaterThan(0);
  });
});
