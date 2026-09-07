import { describe, expect, it, vi } from 'vitest';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import { enqueueGameplayNpcs } from './gameplay-painter-npcs.js';

const calls = vi.hoisted(() => ({ draw: vi.fn(), effect: vi.fn() }));
vi.mock('@orchard/engine/overworld-art', async original => ({
  ...await original<typeof import('@orchard/engine/overworld-art')>(),
  drawOverworldWildlife: calls.draw, wildlifeWorldBounds: () => null, wildlifeShadowBody: () => undefined,
}));
vi.mock('@orchard/sim', async original => ({
  ...await original<typeof import('@orchard/sim')>(), runtimeNpcMount: () => undefined, survivalBiomeAt: () => 'grassland',
}));
vi.mock('./gameplay-painter-effects.js', () => ({
  drawWildlifeHitFlash: (context: CanvasRenderingContext2D, flashing: () => boolean, draw: () => void) => {
    calls.effect(context, flashing, draw, flashing()); draw();
  },
}));
type Inputs = Parameters<typeof enqueueGameplayNpcs>[0];

describe('wildlife retained callbacks', () => {
  it('reuses all effect callbacks and refreshes interpolated position, variant, activity and flash state', () => {
    const queue: WorldDepthItem[] = [], context = {} as CanvasRenderingContext2D;
    const npc = { id: 7n, x: 160, y: 320, health: 100, facing: 'south', moving: false,
      wanderDirection: 'idle', displayName: '', kind: 'cow' };
    const input = { terrain: { version: 1 }, context,
      snapshot: { npcs: [npc], rogueEnemyProfiles: new Map(), merchants: new Map(), content: { registry: {} } },
      npcDisplay: new Map(), npcHitFeedback: new Map([[7n, 0]]), renderStarted: 0,
      NPC_HIT_HOP_MS: 200, NPC_HIT_FLASH_MS: 100, reducedMotionPreference: { matches: false },
      visible: { left: -1000, right: 1000, top: -1000, bottom: 1000 },
      questMarkerForNpc: () => null, targetableEntities: [], nameplates: [],
      projectTargetable: (value: unknown) => value, targetableFromVisualBounds: () => ({}), npcTargetDimensions: () => ({}),
      wildlifeProfile: () => ({ species: 'cow', variant: 1 }), frameLightingModel: 'unified',
      drawSouthFacingReceiver: (_x: number, _y: number, draw: () => void) => draw(),
      art: {}, horseAnimationFrame: 0, cameraX: 0, cameraY: 0, scale: 1,
      enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queue.push(item),
    } as unknown as Inputs;
    enqueueGameplayNpcs(input); const first = queue[0]!; first.draw();
    const [, predicate, raw] = calls.effect.mock.calls[0]!;
    for (let frame = 1; frame <= 600; frame++) {
      queue.length = 0;
      enqueueGameplayNpcs({ ...input, renderStarted: frame,
        npcDisplay: new Map([[7n, { x: 160 + frame, y: 320 + frame, facing: 'east' }]]) as Inputs['npcDisplay'],
        horseAnimationFrame: frame, cameraX: frame / 4,
      });
      expect(queue[0]).toBe(first); queue[0]!.draw();
      expect(calls.effect).toHaveBeenLastCalledWith(context, predicate, raw, frame < 100);
    }
    expect(calls.draw).toHaveBeenLastCalledWith(context, {}, 'cow', 1, 'idle', 47.5, 57.5, 'east', false, 607, 150, 0, 1, false);
    expect(first.footY).toBe(57.5);
  });
});
