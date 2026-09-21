/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { UI_SHAPES, UI_SIZES, UI_TEXT_ROLES, UI_TONES } from '../tokens.js';
import { UI_SKIN_MANIFEST, uiButtonSkin, uiToneFrameSkin, type UiSkinEntry } from './manifest.js';
import { UI_TONE_FACES, resolveUiTextContrast, uiContrastRatio, uiRelativeLuminance } from './contrast.js';
import { createUiSkinLoader } from './load.js';
import { UI_LUCIDE_FILES } from './lucide.js';
import { UI_ICON_CATALOG } from './icon-catalog.js';
import type { LoadedAsset } from '../../assets.js';

interface Source {
  size: [number, number]; uiSizing: string; slice?: number[];
  frames: Record<string, string[][]>; frameKinds: Record<string, string>;
  sourcePalette: Record<string, string>;
}
function source(name: string): Source {
  return JSON.parse(readFileSync(new URL(`../../../../assets/ui/${name}.sprite.json`, import.meta.url), 'utf8')) as Source;
}
function fakeAsset(name: string): LoadedAsset { return { name } as LoadedAsset; }

describe('kit skin contract', () => {
  it('keeps every kit extract addressable from the skin manifest', () => {
    const recipes = JSON.parse(readFileSync(new URL('../../../../tools/src/kit-ui-extracts.json', import.meta.url), 'utf8')) as Array<{ name: string }>;
    const names = new Set(Object.values(UI_SKIN_MANIFEST).flatMap((family) => Object.values(family).map(({ asset }) => asset)));
    for (const recipe of recipes) expect(names.has(recipe.name), recipe.name).toBe(true);
  });
  it('resolves every manifest entry to real, explicitly classified art with exact sizing', () => {
    for (const family of Object.values(UI_SKIN_MANIFEST)) for (const entry of Object.values(family)) {
      const art = source(entry.asset);
      expect(art.frames[entry.group]?.[entry.index], entry.asset).toBeDefined();
      expect(art.frameKinds[entry.group], entry.asset).toBeDefined();
      expect(art.size).toEqual(entry.size);
      const crop = (entry as UiSkinEntry).crop;
      if (crop) { const [x, y, width, height] = crop; expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0); expect(width).toBeGreaterThan(0); expect(height).toBeGreaterThan(0); expect(x + width).toBeLessThanOrEqual(art.size[0]); expect(y + height).toBeLessThanOrEqual(art.size[1]); }

      expect(art.uiSizing).toBe(entry.sizing);
      expect(art.slice).toEqual((entry as UiSkinEntry).slice);
    }
  });
  it('covers every tone, control size, shape, and state without absent variants', () => {
    for (const tone of UI_TONES) for (const size of UI_SIZES) for (const shape of UI_SHAPES) {
      for (const state of ['idle', 'pressed', 'disabled'] as const) {
        expect(uiButtonSkin(tone, size, shape, state)).toBeDefined();
      }
    }
  });
  it('derives contrast from the actual authored face for every tone and text role', () => {
    for (const tone of UI_TONES) for (const role of UI_TEXT_ROLES) {
      for (const surface of ['frame', 'button_idle', 'button_pressed', 'button_disabled'] as const) {
        const sample = UI_TONE_FACES[tone][surface];
        const entry = surface === 'frame' ? uiToneFrameSkin(tone)
          : uiButtonSkin(tone, 'md', 'square', surface === 'button_idle' ? 'idle' : surface === 'button_pressed' ? 'pressed' : 'disabled');
        const art = source(entry.asset);
        const [x, y] = sample.sample;
        expect(art.sourcePalette[art.frames[entry.group]![entry.index]![y]![x]!]).toBe(sample.face);
        const contrast = resolveUiTextContrast(tone, role, surface);
        expect(contrast.ratio).toBeCloseTo(uiContrastRatio(sample.face, contrast.color));
        expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('implements the luminance transfer function and rejects invalid face colours', () => {
    expect(uiContrastRatio('#000000', '#ffffff')).toBe(21);
    expect(uiRelativeLuminance('#808080')).toBeCloseTo(0.21586, 5);
    expect(() => uiRelativeLuminance('#123')).toThrow();
  });
  it('gives all 624 icon cells unique searchable names and identifies transparency', () => {
    expect(UI_ICON_CATALOG).toHaveLength(624);
    expect(new Set(UI_ICON_CATALOG.map(({ name }) => name)).size).toBe(624);
    const entry = UI_SKIN_MANIFEST.icon['icon_catalog.catalog.0'];
    const frames = source(entry.asset).frames.catalog!;
    for (const cell of UI_ICON_CATALOG) {
      expect(cell.index).toBe(cell.row * 39 + cell.column);
      expect(cell.kind === 'empty').toBe(frames[cell.index]!.every((row) => /^\.+$/u.test(row)));
    }
  });
  it('keeps every shared Lucide symbol licensed and in sync with its runtime manifest', () => {
    const manifest = JSON.parse(readFileSync(new URL('./lucide-manifest.json', import.meta.url), 'utf8')) as Array<{
      name: string; file: string; license: string; attribution: string; source: string;
    }>;
    expect(Object.fromEntries(manifest.map(({ name, file }) => [name, file]))).toEqual(UI_LUCIDE_FILES);
    for (const entry of manifest) {
      expect(entry.license).toBe('ISC');
      expect(entry.attribution).toBe('Lucide contributors');
      expect(entry.source).toMatch(/^https:\/\/lucide.dev\/icons\//u);
      expect(readFileSync(new URL(`../../../public/ui/lucide/${entry.file}`, import.meta.url), 'utf8')).toContain('<svg');
    }
    expect(readFileSync(new URL('../../../public/ui/lucide/LICENSE.txt', import.meta.url), 'utf8')).toContain('ISC');
  });
  it('loads only requested families and shares concurrent asset requests', async () => {
    const load = vi.fn(async (name: string) => fakeAsset(name));
    const loader = createUiSkinLoader(load);
    expect(await loader([])).toEqual({});
    expect(load).not.toHaveBeenCalled();
    const [first, second] = await Promise.all([loader(['button']), loader(['button', 'button'])]);
    expect(first.button).toBe(second.button);
    expect(load).toHaveBeenCalledTimes(6);
    expect(Object.keys(first)).toEqual(['button']);
    expect(Object.isFrozen(first.button)).toBe(true);
  });
  it('retries rejected art, including the generated loader placeholder', async () => {
    const load = vi.fn(async (name: string) => fakeAsset(name));
    load.mockResolvedValueOnce(fakeAsset('placeholder'));
    const loader = createUiSkinLoader(load);
    await expect(loader(['slot'])).rejects.toThrow('Missing kit art');
    await expect(loader(['slot'])).resolves.toHaveProperty('slot');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
