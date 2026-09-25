import { describe, expect, it, vi } from 'vitest';
import type { TerrainArray } from '@orchard/engine/terrain';
import { WorldItemKind } from '@orchard/engine/painter-depth';
import { createGameplayPainter, sortGameplayWorldDepthItems } from './gameplay-painter.js';
import {lightCasterPainterOrder} from './light-caster-painter-order.js';
import {terrainProjectedDepthAtFoot} from '@orchard/engine/terrain';

function terrainFixture(): TerrainArray {
  return { spaceId: 0, seed: 1, version: 1, width: 4, height: 4,
    biomes: new Uint8Array(16).fill(4), blocked: new Uint8Array(16),
    horseJumpableTerrain: new Uint8Array(16), elevations: new Int16Array(16),
    dirtCliffRoles: new Uint8Array(16), dirtTerraces: new Uint8Array(16) };
}
describe('retained gameplay painter', () => {
  it('matches shadow ownership descriptors to the actual projected enqueue boundary', () => {
    for (const level of [0, 1, 2]) {
      const terrain=terrainFixture();
      terrain.elevations!.fill(level);
      const painter=createGameplayPainter({terrain,context:{} as CanvasRenderingContext2D,
        scale:1,seasonalDynamic:false,projectionAt:(x,y)=>terrainProjectedDepthAtFoot(terrain,x,y),drawWorldReceiver:()=>{}});
      for(const [tie,drawFoot] of [['resource:7',32],['decoration:tent',16]] as const){
        painter.enqueueWorldDepth(24,32,{footY:drawFoot,tie,draw(){}});
        const queued=painter.worldDepthItems.at(-1)!;
        // Prepared queues replace tie with an identity hash and retain the
        // lexical painter key in debugTie.
        expect({...queued,tie:queued.debugTie}).toMatchObject(lightCasterPainterOrder(terrain,24,32,drawFoot,tie));
      }
    }
  });
  it('preserves surface phase so a rug remains underneath a more northern actor', () => {
    const painter = createGameplayPainter({ terrain: terrainFixture(), context: {} as CanvasRenderingContext2D,
      scale: 1, seasonalDynamic: false, projectionAt: () => 0, drawWorldReceiver: () => {} });
    painter.enqueueWorldDepth(24, 24, { footY: 24, tie: 'player:1', draw() {} });
    painter.enqueueWorldDepth(24, 48, { footY: 48, tie: 'placeable:2', depthPhase: 'surface', draw() {} });
    expect(sortGameplayWorldDepthItems(painter.worldDepthItems).map(item => item.depthPhase)).toEqual(['surface', 'entity']);
  });
  it('reuses queues for 600 moving frames without accumulating items or casters', () => {
    const context = { save: vi.fn(), restore: vi.fn(), translate: vi.fn() };
    const input = { terrain: terrainFixture(), context: context as unknown as CanvasRenderingContext2D,
      scale: 1, seasonalDynamic: true, projectionAt: () => 0,
      drawWorldReceiver: (_x: number, _y: number, draw: () => void) => draw() };
    const initial = createGameplayPainter(input);
    const draw = vi.fn();
    for (let frame = 0; frame < 600; frame++) {
      const painter = createGameplayPainter(input);
      expect(painter.worldDepthItems).toBe(initial.worldDepthItems);
      expect(painter.movingCelestialCasters).toBe(initial.movingCelestialCasters);
      expect(painter.worldDepthItems).toHaveLength(0);
      painter.enqueueWorldDepth(24, 32, { footY: 32, tie: 'tree:1', draw });
      painter.enqueueWorldDepth(24, 32, { footY: 32, tie: 'player:1', draw });
      const items = sortGameplayWorldDepthItems(painter.worldDepthItems);
      expect(items).toBe(initial.worldDepthItems);
      expect(items).toHaveLength(2);
      expect(items.map(item => item.kind)).toEqual([WorldItemKind.Player, WorldItemKind.Static]);
      expect(painter.movingCelestialCasters).toHaveLength(1);
      for (const item of items) item.draw();
    }
    expect(draw).toHaveBeenCalledTimes(1200);
    expect(context.save).toHaveBeenCalledTimes(1200);
    expect(context.restore).toHaveBeenCalledTimes(1200);
    const basic = createGameplayPainter({ ...input, seasonalDynamic: false });
    basic.enqueueWorldDepth(24, 32, { footY: 32, tie: 'player:1', draw });
    expect(basic.movingCelestialCasters).toHaveLength(0);
  });
});
