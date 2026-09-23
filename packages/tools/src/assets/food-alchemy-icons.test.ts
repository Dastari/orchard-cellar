import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { workspaceRoot } from './load.js';
import { decodePng, hexToRgba } from './png.js';
import type { AssetSource } from './types.js';

type Entry = { item: string; asset: string; source: string; crop: [number, number, number, number]; sha256: string; reviewStatus: string; resolution?: { status: string; asset: string; sourcePR: number } };
type Delivery = { asset: string; path: string; sourcePR: number; sourceCommit: string; sha256: string; item?: string; frameCounts?: Record<string, number> };
const manifest = JSON.parse(readFileSync(new URL('docs/food-alchemy-p0/icon-imports.json', workspaceRoot), 'utf8')) as {
  imports: Entry[]; artNeeded: { id: string; delivery: { asset: string; sourcePR: number; reviewStatus: string } }[];
  deliveryInventory: { schemaVersion: number; sourceHeads: Record<string, string>; assets: Delivery[] };
};
const ready = manifest.imports.filter(e => e.reviewStatus === 'native_import_reviewed');
const readAsset = (entry: Entry): AssetSource => JSON.parse(readFileSync(new URL(`packages/assets/ui/${entry.asset}.sprite.json`, workspaceRoot), 'utf8')) as AssetSource;

describe('approved food/alchemy P0 intake', () => {
  it('maps every ready row once, without treating missing artwork as an approved import', () => {
    expect(manifest.imports).toHaveLength(215);
    expect(new Set(manifest.imports.map(e => e.asset)).size).toBe(215);
    expect(new Set(manifest.imports.map(e => e.item)).size).toBe(215);
    expect(manifest.artNeeded).toHaveLength(35);
    expect(ready).toHaveLength(205);
    for (const entry of manifest.imports.filter(e => e.reviewStatus !== 'native_import_reviewed')) {
      const path = new URL(`packages/assets/ui/${entry.asset}.sprite.json`, workspaceRoot);
      // Separate art PRs may supply reviewed replacements under the stable key.
      if (existsSync(path)) {
        const replacement = readAsset(entry);
        expect(replacement.approved).toBe(true);
        expect(replacement.sourcePath === entry.source && JSON.stringify(replacement.sourceRegion) === JSON.stringify(entry.crop)).toBe(false);
      }
    }
    const missing = new Set(manifest.artNeeded.map(e => e.id));
    for (const entry of manifest.imports) expect(missing.has(entry.item)).toBe(false);
  });

  it('delivers every planned item and preserves the exact independently reviewed asset files', () => {
    const deliveries = manifest.deliveryInventory.assets;
    expect(manifest.deliveryInventory.schemaVersion).toBe(1);
    expect(deliveries).toHaveLength(258);
    expect(new Set(deliveries.map(e => e.asset)).size).toBe(258);
    const icons = deliveries.filter(e => e.item !== undefined);
    expect(icons).toHaveLength(250);
    expect(new Set(icons.map(e => e.item))).toEqual(new Set([
      ...manifest.imports.map(e => e.item), ...manifest.artNeeded.map(e => e.id),
    ]));
    for (const entry of deliveries) {
      expect(entry.sourceCommit).toBe(manifest.deliveryInventory.sourceHeads[String(entry.sourcePR)]);
      const bytes = readFileSync(new URL(entry.path, workspaceRoot));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
      const asset = JSON.parse(bytes.toString()) as AssetSource;
      expect(asset.name).toBe(entry.asset);
      expect(asset.approved).toBe(true);
      if (entry.item !== undefined) {
        expect(asset.category).toBe('ui');
        expect(asset.size).toEqual([16, 16]);
        expect(asset.anchor).toEqual([8, 15]);
      }
      if (entry.sourcePR !== 90) expect(asset.sourcePalette).toBeUndefined();
    }
    for (const held of manifest.imports.filter(e => e.reviewStatus !== 'native_import_reviewed')) {
      const delivery = icons.find(e => e.item === held.item)!;
      expect(held.resolution).toEqual({ status: 'bespoke_replacement_reviewed', asset: held.asset, sourcePR: delivery.sourcePR });
      expect(delivery.sourcePR).toBe(held.item === 'item:raw_game' ? 91 : 95);
    }
    for (const needed of manifest.artNeeded) {
      const delivery = icons.find(e => e.item === needed.id)!;
      expect(needed.delivery).toEqual({ asset: delivery.asset, sourcePR: delivery.sourcePR, reviewStatus: 'bespoke_art_reviewed' });
    }
  });

  it('retains all eight prop state groups, 48 frames and four-frame five-fps loops', () => {
    const props = manifest.deliveryInventory.assets.filter(e => e.item === undefined);
    expect(props).toHaveLength(8);
    let total = 0;
    for (const entry of props) {
      const asset = JSON.parse(readFileSync(new URL(entry.path, workspaceRoot), 'utf8')) as AssetSource;
      expect(asset.category).toBe('props');
      expect(Object.fromEntries(Object.entries(asset.frames).map(([group, frames]) => [group, frames.length])))
        .toEqual(entry.frameCounts);
      for (const [group, frames] of Object.entries(asset.frames)) {
        total += frames.length;
        if (asset.frameKinds?.[group] === 'animation') {
          expect(frames).toHaveLength(4);
          expect(asset.animationFps?.[group]).toBe(5);
          expect(asset.animationLoop?.[group]).toBe(true);
        } else expect(frames).toHaveLength(1);
      }
    }
    expect(total).toBe(48);
  });

  it.each(ready)('retains inspectable native pixels for $item', entry => {
    const asset = readAsset(entry);
    expect(asset.name).toBe(entry.asset);
    expect(asset.size).toEqual([16, 16]);
    expect(asset.anchor).toEqual([8, 15]);
    expect(asset.sourcePath).toBe(entry.source);
    expect(asset.sourceRegion).toEqual(entry.crop);
    expect(asset.sourcePaletteMode).toBe('exact');
    expect(asset.approved).toBe(entry.reviewStatus === 'native_import_reviewed');
    expect(asset.category).toBe('ui');
    expect(asset.placement).toEqual({ layer: 'ui', builderAvailable: false });
    expect(asset.frames.base).toHaveLength(1);
    const grid = asset.frames.base![0]!;
    expect(grid).toHaveLength(16);
    for (const row of grid) {
      expect(row).toHaveLength(16);
      for (const char of row) if (char !== '.') expect(asset.sourcePalette?.[char]).toMatch(/^#[a-f0-9]{6}([a-f0-9]{2})?$/);
    }
  });

  const localSourcesPresent = ready.every(e => existsSync(new URL(e.source, workspaceRoot)));
  it.skipIf(!localSourcesPresent)('matches every nontransparent source RGBA pixel without palette snapping or scaling', () => {
    const sources = new Map<string, ReturnType<typeof decodePng>>();
    for (const entry of ready) {
      if (!sources.has(entry.source)) {
        const bytes = readFileSync(new URL(entry.source, workspaceRoot));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
        sources.set(entry.source, decodePng(bytes));
      }
      const source = sources.get(entry.source)!;
      const asset = readAsset(entry);
      const [x, y] = entry.crop;
      expect(x + 16).toBeLessThanOrEqual(source.width);
      expect(y + 16).toBeLessThanOrEqual(source.height);
      for (let dy = 0; dy < 16; dy++) for (let dx = 0; dx < 16; dx++) {
        const offset = ((y + dy) * source.width + x + dx) * 4;
        const pixel = source.rgba.subarray(offset, offset + 4);
        const char = asset.frames.base![0]![dy]![dx]!;
        if (pixel[3] === 0) expect(char).toBe('.');
        else expect([...hexToRgba(asset.sourcePalette![char]!)]).toEqual([...pixel]);
      }
    }
  });
});
