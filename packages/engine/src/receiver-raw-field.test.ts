import { afterEach, describe, expect, it, vi } from 'vitest';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { CelestialReceiverScene } from './receiver-lighting.js';
import { TileLightmap } from './lighting.js';
import { WorldLightingRenderer } from './world-lighting-renderer.js';
import type { TerrainArray } from './terrain.js';
import { groundSpriteSource, groundSourceContext, withGroundSpriteSource } from './ground-light-source.js';
import { receiverFrameSource, ReceiverFrameCache, withWorldReceiverLight } from './receiver-frame-source.js';
import { registerWebGLWorldBackend, unregisterWebGLWorldBackend } from './webgl/hooks.js';
import type { WebGLSourceOptions, WebGLWorldPassBackend } from './webgl/world-pass-webgl.js';
import type { AssetFrameSource } from '@orchard/ui';
import { setWorldAssetPresentation } from './world-asset-presentation.js';
const sky = celestialLightingAtCalendar({ continuousDay: 3.5, clockHours: 12, lunarProgress: 0, lunarIllumination: 1 });
afterEach(() => vi.unstubAllGlobals());
describe('raw GPU lighting inputs', () => {
  it('keeps local/coverage storage across 600 moving updates without CPU RGB merges', () => {
    const scene = new CelestialReceiverScene(4), local = vi.fn(() => ({ r: 10, g: 20, b: 30 }));
    const caster = { owner: 1, worldX: 10, worldY: 10, baseHeightSubunits: 0, heightSubunits: 8,
      footprint: { left: -3, top: -3, right: 3, bottom: 3 }, contact: true };
    scene.prepareSplit(sky, [], [caster], 1);
    const first = scene.rawFieldCached(1, 0, 0, 16, 16, 0, 4, local);
    const pixels = first.localPixels, coverage = first.coverage;
    for (let frame = 0; frame < 600; frame++) {
      scene.prepareSplit(sky, [], [{ ...caster, worldX: 10 + frame / 100 }], 1);
      expect(scene.rawFieldCached(1, 0, 0, 16, 16, 0, 4, local)).toBe(first);
    }
    expect(first.localPixels).toBe(pixels); expect(first.coverage).toBe(coverage);
    expect(local).toHaveBeenCalledTimes(256); expect(scene.diagnostics.rgbMerges).toBe(0);
    const revision = first.revision;
    expect(scene.rawFieldCached(2, 0, 0, 16, 16, 0, 4, local).revision).toBe(revision + 1);
    expect(local).toHaveBeenCalledTimes(512);
    // Canvas RGB planes resolve static coverage only; moving bodies are stamps.
    const merged = scene.rasterizeCached(2, 0, 0, 16, 16, 0, 4, local);
    const fixed = scene.coverageSnapshot()[0]!.static;
    expect(coverage.sun.some((value, index) => value !== fixed.sun[index])).toBe(true);
    for (let i = 0; i < 256; i++) {
      const transmission = 1 - fixed.contact[i]! / 255 * 0.18;
      for (const [channel, component] of ['r', 'g', 'b'].entries()) {
        const color = component as 'r' | 'g' | 'b';
        expect(merged.pixels[i * 4 + channel]).toBe(Math.max(
          Math.round(first.diffuse[color] * transmission),
          Math.round(first.sunLight[color] * (1 - fixed.sun[i]! / 255) * transmission),
          Math.round(first.moonLight[color] * (1 - fixed.moon[i]! / 255) * transmission), pixels[i * 4 + channel]!));
      }
    }
    for (let left = 0; left < 20; left++) scene.rawFieldCached(1, left * 100, 0, 16, 16, 0, 4, local);
    const revisited = scene.rawFieldCached(3, 0, 0, 16, 16, 0, 4, () => ({ r: 200, g: 100, b: 50 }));
    expect(revisited.coverage.sun).toBe(coverage.sun);
    expect(revisited.revision).toBeGreaterThan(first.revision);
    expect(revisited.localPixels[0]).toBe(200);
    expect(scene.retainedRasterBytes).toBeLessThanOrEqual(8 * 16 * 16 * 7 + merged.pixels.byteLength + merged.local.byteLength);
    scene.reset(); expect(scene.retainedRasterBytes + scene.retainedCoverageBytes + scene.retainedMaskBytes).toBe(0);
  });
  it('routes immutable receiver/ground sources and releases page textures on every cohort revision', () => {
    const create = vi.fn(() => { throw new Error('unexpected Canvas surface'); });
    vi.stubGlobal('document', { createElement: create });
    const context = {} as CanvasRenderingContext2D;
    const associateSource = vi.fn((source: AssetFrameSource, options: WebGLSourceOptions) => { void options; return source; }), releasePresentation = vi.fn();
    registerWebGLWorldBackend(context, { associateSource, releasePresentation } as unknown as WebGLWorldPassBackend);
    const source = { image: {} as CanvasImageSource, x: 2, y: 3, width: 8, height: 8 };
    const frames = new ReceiverFrameCache(), color = { r: 50, g: 60, b: 70 };
    withWorldReceiverLight(context, frames, color, () => expect(receiverFrameSource(context, source)).toBe(source));
    expect(associateSource).toHaveBeenLastCalledWith(source, { receiverRgb: color }); expect(frames.bytes).toBe(0);
    const world = new WorldLightingRenderer({ width: 20, height: 20, baseDatum: 0 } as TerrainArray);
    world.begin(sky, [], [], new TileLightmap(), 0, 0, 64, 64, 1);
    world.drawReceiver(context, 0, 0, 0, 'flat', () => expect(groundSpriteSource(context, source, 12, 13)).toBe(source));
    expect(associateSource.mock.lastCall?.[1]).toMatchObject({ ground: { worldX: 12, worldY: 13,
      field: { width: 64, height: 64, step: 4 } } });
    expect(world.scene.diagnostics.rgbMerges).toBe(0); expect(create).not.toHaveBeenCalled();
    expect(() => world.compositeGround(context, 1)).toThrow('webgl_accuracy_unverified_ground_composite');
    const pages = { revision: 1, source: () => source.image };
    for (let i = 0; i < 600; i++) setWorldAssetPresentation(context, pages, 'omit-baked-shadow');
    expect(releasePresentation).toHaveBeenCalledOnce(); pages.revision++;
    setWorldAssetPresentation(context, pages, 'omit-baked-shadow'); setWorldAssetPresentation(context);
    expect(releasePresentation).toHaveBeenCalledTimes(3);
    world.reset(); expect(world.bytes).toBe(0); unregisterWebGLWorldBackend(context);
  });
  it('restores a nested source context even when an inner callback throws', () => {
    const outer = {} as CanvasRenderingContext2D, inner = {} as CanvasRenderingContext2D;
    const source = { image: {} as CanvasImageSource, x: 0, y: 0, width: 1, height: 1 };
    withGroundSpriteSource(outer, () => {
      expect(groundSourceContext()).toBe(outer);
      withGroundSpriteSource(inner, () => { throw new Error('nested'); }, () => {
        expect(() => groundSpriteSource(inner, source, 0, 0)).toThrow('nested');
      });
      expect(groundSourceContext()).toBe(outer); return source;
    }, () => groundSpriteSource(outer, source, 0, 0));
    expect(groundSourceContext()).toBeUndefined();
  });
});
