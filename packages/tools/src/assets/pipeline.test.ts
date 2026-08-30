import { describe, expect, it } from 'vitest';
import { expandBlob47 } from '../build-atlas.js';
import { loadAssets } from './load.js';
import { blendPixel, decodePng, encodePng, hexToRgba } from './png.js';

describe('asset pipeline', () => {
  it('encodes and decodes exact RGBA PNG pixels', () => {
    const pixels = new Uint8Array([255, 0, 0, 255, 0, 128, 255, 64]);
    expect(decodePng(encodePng(2, 1, pixels))).toEqual({ width: 2, height: 1, rgba: pixels });
  });

  it('parses exact licensed RGB and RGBA palette entries', () => {
    expect(hexToRgba('#123456')).toEqual([18, 52, 86, 255]);
    expect(hexToRgba('#12345628')).toEqual([18, 52, 86, 40]);
  });

  it('alpha-composites licensed shadows in review images', () => {
    const pixels = new Uint8Array([80, 160, 80, 255]);
    blendPixel(pixels, 1, 0, 0, [0, 0, 0, 40]);
    expect([...pixels]).toEqual([67, 135, 67, 255]);
  });

  it('expands five templates to the canonical 47 blob variants', () => {
    const grid = Array.from({ length: 16 }, () => 'cccccccccccccccc');
    const variants = expandBlob47([grid, grid, grid, grid, grid]);
    expect(variants).toHaveLength(47);
    expect(variants.every((variant) => variant.length === 16 && variant.every((row) => row.length === 16))).toBe(true);
  });

  it('keeps the full mature acacia canopy inside its authored source cell', async () => {
    const assets = await loadAssets();
    const acacia = assets.find((asset) => asset.name === 'tree_cf_acacia_mature');
    expect(acacia?.size).toEqual([80, 64]);
    const frame = acacia?.frames['base']?.[0] ?? [];
    expect(frame).toHaveLength(64);
    expect(frame.every((row) => row.length === 80)).toBe(true);
    expect(frame.every((row) => row[0] === '.' && row.at(-1) === '.')).toBe(true);
  });

  it('extracts each butterfly colour as one 8px two-state animation', async () => {
    const assets = await loadAssets();
    const butterflies = assets.filter((asset) => asset.name.startsWith('wildlife_cf_butterfly_'));
    expect(butterflies).toHaveLength(8);
    for (const butterfly of butterflies) {
      expect(butterfly.size).toEqual([8, 8]);
      expect(butterfly.frames['flutter']).toHaveLength(2);
      expect(butterfly.frames['flutter']?.every((frame) => (
        frame.length === 8 && frame.every((row) => row.length === 8)
      ))).toBe(true);
    }
  });

  it('extracts one furnace state per 16x32 frame', async () => {
    const assets = await loadAssets();
    const furnace = assets.find((asset) => asset.name === 'prop_cf_furnace');
    expect(furnace?.size).toEqual([16, 32]);
    expect(furnace?.anchor).toEqual([8, 31]);
    expect(furnace?.frames['off']).toHaveLength(1);
    expect(furnace?.frames['burn']).toHaveLength(5);
    expect(Object.values(furnace?.frames ?? {}).flat().every((frame) => (
      frame.length === 32 && frame.every((row) => row.length === 16)
    ))).toBe(true);
  });

  it('keeps the full 16x32 authored height for every crop growth stage', async () => {
    const assets = await loadAssets();
    const crops = assets.filter((asset) => asset.tags?.includes('crop.growing') === true);
    expect(crops).toHaveLength(22);
    for (const crop of crops) {
      expect(crop.size).toEqual([16, 32]);
      expect(crop.anchor).toEqual([8, 31]);
      expect(crop.frames['base']).toHaveLength(4);
      expect(crop.frames['base']?.every((frame) => (
        frame.length === 32 && frame.every((row) => row.length === 16)
      ))).toBe(true);
    }
  });

  it('imports the complete NPC, faction, enemy, profession, and companion sheet library', async () => {
    const assets = await loadAssets();
    const actors = assets.filter((asset) => asset.tags?.some((tag) => (
      tag === 'actor.npc' || tag === 'actor.faction' || tag === 'actor.enemy'
    )) === true);
    const effects = assets.filter((asset) => asset.tags?.includes('actor.effect') === true);
    expect(actors.length).toBeGreaterThanOrEqual(74);
    expect(effects).toHaveLength(9);
    expect(actors.every((asset) => Object.values(asset.frames).every((frames) => frames.length > 0))).toBe(true);
    expect(assets.find((asset) => asset.name === 'npc_cf_farmer_bob')?.frames).toMatchObject({
      walk_down: expect.any(Array),
      chop_down: expect.any(Array),
      water_down: expect.any(Array),
    });
    expect(assets.find((asset) => asset.name === 'enemy_cf_skeleton_swordman')?.frames).toMatchObject({
      attack_down: expect.any(Array),
      special_down: expect.any(Array),
      hurt_down: expect.any(Array),
      defeat: expect.any(Array),
    });
    expect(assets.find((asset) => asset.name === 'enemy_cf_shroomling_blue')?.frames).toHaveProperty('state_26');
  });
});
