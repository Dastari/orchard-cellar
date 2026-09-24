import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldLightingRenderer } from './world-lighting-renderer.js';
import { TileLightmap } from './lighting.js';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import type { TerrainArray } from './terrain.js';
import { lightingOwner, terrainLightingOwner } from './lighting-owner.js';

const terrain = { width: 20, height: 20, baseDatum: 0 } as TerrainArray;
afterEach(() => vi.unstubAllGlobals());
describe('retained receiver uploads', () => {
  it('retains ImageData and uploads only changed raster generations over 600 frames', () => {
    let allocations = 0;
    vi.stubGlobal('ImageData', class {
      readonly data: Uint8ClampedArray; constructor(readonly width: number, readonly height: number) {
        allocations++; this.data = new Uint8ClampedArray(width * height * 4);
      }
    });
    const upload = vi.fn();
    const create = vi.fn(() => ({ width: 0, height: 0, getContext: () => ({ putImageData: upload }) }));
    vi.stubGlobal('document', { createElement: create });
    const context = { save: vi.fn(), restore: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const renderer = new WorldLightingRenderer(terrain), local = new TileLightmap();
    const sky = celestialLightingAtCalendar({ clockHours: 12, continuousDay: 3.5, lunarProgress: 0, lunarIllumination: 1 });
    for (let i = 0; i < 600; i++) {
      renderer.begin(sky, [], [], local, 0, 0, 100, 100, 1);
      renderer.compositeGround(context, 1);
    }
    expect(allocations).toBe(1); expect(create).toHaveBeenCalledOnce(); expect(upload).toHaveBeenCalledOnce();
    expect(renderer.scene.diagnostics.staticCoverageBuilds).toBe(1);
    expect(renderer.scene.diagnostics.rgbMerges).toBe(1);
    const retainedImage = upload.mock.calls[0]![0];
    local.reset();
    renderer.begin(sky, [], [], local, 0, 0, 100, 100, 1); renderer.compositeGround(context, 1);
    expect(upload).toHaveBeenCalledTimes(2); expect(upload.mock.calls[1]![0]).toBe(retainedImage);
    // Camera travel inside one 64 px snapped window reuses the retained plane.
    renderer.begin(sky, [], [], local, 60, 0, 100, 100, 1); renderer.compositeGround(context, 1);
    expect(upload).toHaveBeenCalledTimes(2);
    // A different window can have the same raster revision; pixels identity prevents a stale upload.
    renderer.begin(sky, [], [], local, 64, 0, 100, 100, 1); renderer.compositeGround(context, 1);
    expect(upload).toHaveBeenCalledTimes(3); expect(allocations).toBe(1);
    renderer.begin(sky, [], [], local, 0, 0, 100, 100, 1); renderer.compositeGround(context, 1);
    expect(upload).toHaveBeenCalledTimes(4); expect(allocations).toBe(1);
    const replacement = new TileLightmap(); replacement.reset();
    expect(replacement.receiverRevision).toBe(local.receiverRevision);
    renderer.begin(sky, [], [], replacement, 0, 0, 100, 100, 1); renderer.compositeGround(context, 1);
    expect(upload).toHaveBeenCalledTimes(5); expect(allocations).toBe(1);
    const caster = { owner: lightingOwner(50, 50), worldX: 50, worldY: 50, baseHeightSubunits: 0,
      heightSubunits: 4, footprint: { left: -3, right: 3, top: -2, bottom: 1 }, contact: true };
    // Switching back to the first lightmap is one legitimate local change.
    renderer.begin(sky, [], [], local, 0, 0, 100, 100, 1); renderer.compositeGround(context, 1);
    const coverageBefore = renderer.scene.diagnostics.staticCoverageBuilds;
    const mergesBefore = renderer.scene.diagnostics.rgbMerges;
    const planeUploads = () => upload.mock.calls.filter(([image]) => image === retainedImage).length;
    const planeBefore = planeUploads(), uploadBefore = upload.mock.calls.length;
    for (let frame = 0; frame < 600; frame++) {
      renderer.begin(sky, [], [{ ...caster, worldX: 50 + frame / 1000 }], local, 0, 0, 100, 100, 1);
      renderer.compositeGround(context, 1);
    }
    // Walking never re-merges or re-uploads the plane. One stamp surface is
    // uploaded once, then again only when the rounded foot crosses x = 50.5.
    expect(renderer.scene.diagnostics.staticCoverageBuilds).toBe(coverageBefore);
    expect(renderer.scene.diagnostics.rgbMerges).toBe(mergesBefore);
    expect(planeUploads()).toBe(planeBefore);
    expect(upload.mock.calls.length - uploadBefore).toBe(2);
    expect(create).toHaveBeenCalledTimes(2); expect(allocations).toBe(2);
    const stampDraws = (context.drawImage as ReturnType<typeof vi.fn>).mock.calls.filter(([image]) => image === create.mock.results[1]!.value);
    expect(stampDraws).toHaveLength(600);
    expect(stampDraws[0]!.slice(5)).not.toEqual(stampDraws[599]!.slice(5));
    renderer.reset(); expect(renderer.bytes).toBe(0);
    expect(create.mock.results[0]!.value.width).toBe(0); expect(create.mock.results[1]!.value.width).toBe(0);
  });
  it('uses exact rounded-foot identities and a disjoint weak terrain namespace', () => {
    expect(lightingOwner(10.1, 20.1)).toBe(lightingOwner(10.2, 20.2));
    expect(lightingOwner(-10, 20)).not.toBe(lightingOwner(10, -20));
    const owners = new Set<number>();
    for (let x = -32; x < 32; x++) for (let y = -32; y < 32; y++) owners.add(lightingOwner(x, y));
    expect(owners.size).toBe(4096);
    const mask = {};
    expect(terrainLightingOwner(mask)).toBe(terrainLightingOwner(mask));
    expect(terrainLightingOwner(mask)).toBeLessThan(0);
    expect(terrainLightingOwner({})).not.toBe(terrainLightingOwner(mask));
    expect(() => lightingOwner(Number.NaN, 0)).toThrow('directional_owner_coordinates_out_of_range');
  });
});
