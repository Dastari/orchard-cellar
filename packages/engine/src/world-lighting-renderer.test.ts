import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoadedAsset } from '@orchard/ui';
import { WorldShadowAssets, WorldLightingRenderer, celestialCastersFromOcclusion, lightingOwner } from './world-lighting-renderer.js';
import { LightCoordinateMapper } from './light-coordinate-mapper.js';
import type { TerrainArray } from './terrain.js';
import type { LightOcclusionMap } from './light-occlusion.js';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim';
import { groundSpriteSource } from './ground-light-source.js';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { TileLightmap } from './lighting.js';
import { inheritWorldAssetPresentation, setWorldAssetPresentation, worldAssetFrameSource, worldAssetPresentationKey } from './world-asset-presentation.js';

const terrain = { width: 20, height: 20, baseDatum: 0 } as TerrainArray;
afterEach(() => vi.unstubAllGlobals());
describe('world lighting lifecycle', () => {
  it('reuses one warm flame halo and releases it with the lighting renderer', () => {
    const surface = { width: 0, height: 0, getContext: () => ({
      createRadialGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
    }) };
    const create = vi.fn(() => surface); vi.stubGlobal('document', { createElement: create });
    const world = new WorldLightingRenderer(terrain);
    const context = { save: vi.fn(), restore: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const light = { worldX: 10, worldY: 20, radiusTiles: 5, color: { r: 255, g: 142, b: 62 }, profile: 'flame' as const };
    world.compositeFlameGlows(context, [{ ...light, profile: 'steady' }], 2);
    expect(create).not.toHaveBeenCalled();
    for (let i = 0; i < 600; i++) world.compositeFlameGlows(context, [light], 2);
    expect(create).toHaveBeenCalledOnce(); expect(world.bytes).toBe(64 * 64 * 4);
    expect(context.drawImage).toHaveBeenLastCalledWith(surface, -20, 0, 80, 80);
    world.reset(); expect(world.bytes).toBe(0); expect(surface.width).toBe(0);
  });
  it('filters a newly encountered world/ground frame without changing presentation or waiting for poses', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: vi.fn(), clearRect: vi.fn() }) }) });
    const frame = { x: 0, y: 0, width: 2, height: 1, durationTicks: 0 };
    const future = { ...frame, x: 2 };
    const asset = { image: {}, name: 'tent', metadata: { animations: { base: [frame, future] } },
      bakedShadow: { color: '#00000064', frames: { base: [frame, future].map(() => ({ width: 2, height: 1, pixelCount: 1, spans: [0, 0, 1] })) } } } as unknown as LoadedAsset;
    const assets = new WorldShadowAssets(), world = {} as CanvasRenderingContext2D, ground = {} as CanvasRenderingContext2D;
    assets.beginFrame(); setWorldAssetPresentation(world, assets.cache, 'omit-baked-shadow');
    const key = worldAssetPresentationKey(world);
    inheritWorldAssetPresentation(world, ground);
    expect(worldAssetFrameSource(ground, asset, frame)?.image).not.toBe(asset.image);
    expect(assets.cache.bytes).toBe(8); expect(assets.cache.builds).toBe(1);
    expect(assets.cache.source(asset, future, 'omit-baked-shadow')).toBeNull();
    assets.beginFrame();
    expect(worldAssetFrameSource(world, asset, future)?.image).not.toBe(asset.image);
    expect(assets.cache.builds).toBe(2); expect(worldAssetPresentationKey(world)).toBe(key);
    expect(worldAssetPresentationKey(ground)).toBe(key);
    assets.reset(); setWorldAssetPresentation(world);
    expect(worldAssetFrameSource(world, asset, frame)?.image).toBe(asset.image);
    expect(assets.cache.bytes).toBe(0);
  });
  it('updates interpolated feet even when the rounded owner/geometry signature is unchanged', () => {
    const world = new WorldLightingRenderer(terrain), map = new TileLightmap();
    const sky = celestialLightingAtCalendar({ clockHours: 12, continuousDay: 3.5, lunarProgress: 0, lunarIllumination: 1 });
    const caster = { owner: 'foot:10:20', worldX: 10.1, worldY: 20.1, baseHeightSubunits: 0, heightSubunits: 5,
      footprint: { left: -4, right: 4, top: -3, bottom: 1 }, contact: true };
    const prepare = vi.spyOn(world.scene, 'prepare');
    world.begin(sky, [caster], 'same', map, 0, 0, 100, 100);
    const moved = { ...caster, worldX: 10.2, worldY: 20.2 };
    world.begin(sky, [moved], 'same', map, 0, 0, 100, 100);
    expect(prepare.mock.calls[1]![1][0]).toBe(moved);
    world.reset();
  });
  it('lights flat artwork across its world rectangle without an anchor tint, then restores scope', () => {
    const world = new WorldLightingRenderer(terrain);
    const context = {} as CanvasRenderingContext2D;
    const source = { image: {} as CanvasImageSource, x: 0, y: 0, width: 48, height: 48 };
    const lit = { ...source, image: {} as CanvasImageSource };
    const ground = vi.spyOn(world, 'groundSource').mockReturnValue(lit);
    world.drawReceiver(context, 64, 96, 2, 'flat', () => {
      expect(groundSpriteSource(context, source, 40, 49)).toBe(lit);
    });
    expect(ground).toHaveBeenCalledWith(source, 40, 49, 2);
    expect(groundSpriteSource(context, source, 40, 49)).toBe(source);
    expect(world.frames.allocations).toBe(0);
    expect(() => world.drawReceiver(context, 64, 96, 2, 'flat', () => { throw new Error('draw failed'); })).toThrow('draw failed');
    expect(groundSpriteSource(context, source, 40, 49)).toBe(source);
  });
  it('has no retained surfaces before Dynamic and handles an empty declared set', async () => {
    const create = vi.fn(); vi.stubGlobal('document', { createElement: create });
    const world = new WorldLightingRenderer(terrain), assets = new WorldShadowAssets();
    expect(world.bytes).toBe(0); expect(assets.cache.bytes).toBe(0);
    expect(assets.prepare([])).toBe(false);
    await Promise.resolve(); expect(assets.prepare([])).toBe(true);
    world.reset(); assets.reset(); expect(create).not.toHaveBeenCalled();
  });
  it('does not publish stale preparation after Basic or a streamed revision change', async () => {
    const surface = () => ({width:0,height:0,getContext:()=>({drawImage:vi.fn(),clearRect:vi.fn()})});
    vi.stubGlobal('document', { createElement: surface });
    const frame = {x:0,y:0,width:2,height:1,durationTicks:0};
    const asset = { image:{}, name:'tree', atlasRevision:1, metadata:{animations:{base:[frame]}},
      bakedShadow:{color:'#00000028',frames:{base:[{width:2,height:1,pixelCount:1,spans:[0,0,1]}]}} } as unknown as LoadedAsset;
    const assets = new WorldShadowAssets();
    assets.prepare([asset]); assets.reset(); await Promise.resolve();
    expect(assets.cache.bytes).toBe(0);
    expect(assets.prepare([asset])).toBe(false); await Promise.resolve();
    expect(assets.prepare([asset])).toBe(true); expect(assets.cache.bytes).toBe(8);
    const revision = {...asset,image:{},atlasRevision:2} as LoadedAsset;
    expect(assets.prepare([revision])).toBe(false); await Promise.resolve();
    expect(assets.prepare([revision])).toBe(true);
    assets.reset(); expect(assets.cache.bytes).toBe(0);
  });
  it('reports an oversized complete set without enabling partial omission', async () => {
    const frame = {x:0,y:0,width:4096,height:4096,durationTicks:0};
    const asset = { image:{}, name:'large', metadata:{animations:{base:[frame]}},
      bakedShadow:{color:'#00000028',frames:{base:[{width:4096,height:4096,pixelCount:1,spans:[0,0,1]}]}} } as unknown as LoadedAsset;
    const assets = new WorldShadowAssets(); assets.prepare([asset]); await Promise.resolve();
    expect(assets.prepare([asset])).toBe(false); expect(assets.failure).toBe('budget-exceeded'); expect(assets.cache.bytes).toBe(0);
  });
  it('grounds clean artwork and converts elevated projected contacts back to logical space', () => {
    const mapper = new LightCoordinateMapper(terrain), x=64,y=96,level=2;
    const projected = mapper.projectedY(y,level);
    const map = {trunkOccluders:[{footX:x,footY:projected,elevationLayer:level,
      obstacle:{left:60*FIXED_UNITS_PER_PIXEL,right:68*FIXED_UNITS_PER_PIXEL,top:0,bottom:0},
      receiver:{left:x-1,top:projected-3,width:2,height:4,opaque:new Uint8Array([1,1,1,1,1,1,0,0])}}]} as unknown as LightOcclusionMap;
    const [caster] = celestialCastersFromOcclusion(map,mapper,0,0,128,128);
    expect(caster?.owner).toBe(lightingOwner(x,y)); expect(caster?.worldY).toBe(y);
    expect(caster?.baseHeightSubunits).toBe(8); expect(caster?.silhouette?.anchorY).toBe(3);
    expect(celestialCastersFromOcclusion(map,mapper,1000,1000,1100,1100)).toEqual([]);
  });
});
