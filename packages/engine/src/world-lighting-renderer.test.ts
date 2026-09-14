import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldLightingRenderer, celestialCastersFromOcclusion, lightingOwner } from './world-lighting-renderer.js';
import { LightCoordinateMapper } from './light-coordinate-mapper.js';
import type { TerrainArray } from './terrain.js';
import type { LightOcclusionMap } from './light-occlusion.js';
import { FIXED_UNITS_PER_PIXEL } from '@orchard/sim';
import { groundSpriteSource } from './ground-light-source.js';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { TileLightmap } from './lighting.js';

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

  it('updates interpolated feet even when the rounded owner/geometry signature is unchanged', () => {
    const world = new WorldLightingRenderer(terrain), map = new TileLightmap();
    const sky = celestialLightingAtCalendar({ clockHours: 12, continuousDay: 3.5, lunarProgress: 0, lunarIllumination: 1 });
    const caster = { owner: 'foot:10:20', worldX: 10.1, worldY: 20.1, baseHeightSubunits: 0, heightSubunits: 5,
      footprint: { left: -4, right: 4, top: -3, bottom: 1 }, contact: true };
    const prepare = vi.spyOn(world.scene, 'prepareSplit');
    world.begin(sky, [], [caster], map, 0, 0, 100, 100);
    const moved = { ...caster, worldX: 10.2, worldY: 20.2 };
    world.begin(sky, [], [moved], map, 0, 0, 100, 100);
    expect(prepare.mock.calls[1]![2][0]).toBe(moved);
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
    expect(ground).toHaveBeenCalledWith(source, 40, 49, 2, undefined);
    expect(groundSpriteSource(context, source, 40, 49)).toBe(source);
    expect(world.frames.allocations).toBe(0);
    expect(() => world.drawReceiver(context, 64, 96, 2, 'flat', () => { throw new Error('draw failed'); })).toThrow('draw failed');
    expect(groundSpriteSource(context, source, 40, 49)).toBe(source);
  });
  it('has no retained surfaces before Dynamic and releases empty lighting', () => {
    const create = vi.fn(); vi.stubGlobal('document', { createElement: create });
    const world = new WorldLightingRenderer(terrain);
    expect(world.bytes).toBe(0);
    world.reset(); expect(world.bytes).toBe(0); expect(create).not.toHaveBeenCalled();
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
    expect(caster?.contact).toBe(true);
    const noContact={...map,trunkOccluders:map.trunkOccluders.map(item=>({...item,contactEnabled:false}))};
    const [floating]=celestialCastersFromOcclusion(noContact,mapper,0,0,128,128);
    expect(floating?.contact).toBe(false);
    expect(floating?.silhouette).toEqual(caster?.silhouette);
    expect(celestialCastersFromOcclusion(map,mapper,1000,1000,1100,1100)).toEqual([]);
  });
});
