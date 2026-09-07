import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import { enqueueGameplayPlaceables } from './gameplay-painter-placeables.js';
import { enqueueGameplayNpcs } from './gameplay-painter-npcs.js';

const art = vi.hoisted(() => ({ chest: vi.fn(), target: vi.fn(), placeable: vi.fn(), surface: vi.fn(), hive: vi.fn(), merchant: vi.fn() }));
vi.mock('@orchard/engine/overworld-art', async (original) => ({
  ...await original<typeof import('@orchard/engine/overworld-art')>(),
  drawOverworldChest: art.chest, drawOverworldArcheryTarget: art.target,
  drawOverworldPlaceable: art.placeable, drawOverworldPoiDecoration: art.surface,
  drawOverworldHive: art.hive, drawOverworldMerchant: art.merchant,
  merchantWorldBounds: () => ({ left: 0, right: 16, top: 0, bottom: 16 }),
}));
vi.mock('@orchard/sim', async (original) => ({
  ...await original<typeof import('@orchard/sim')>(),
  runtimePlaceableDefinition: () => ({ blocksMovement: false }),
  runtimeNpcMount: () => null,
}));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

function placeableFixture() {
  const queue: WorldDepthItem[] = [], callbacks: Array<() => void> = [];
  const input = {
    terrain: { version: 1 }, context: {} as CanvasRenderingContext2D, art: { frame: 0 },
    snapshot: {
      content: { registry: {} }, activeChest: { id: 1n },
      chests: [{ id: 1n, tileX: 2, tileY: 3 }],
      combatTargets: [{ id: 2n, x: 640, y: 1024 }],
      placeables: [{ id: 3n, kind: 'fruit_press', tileX: 2, tileY: 3, open: false, lit: false }],
      surfaces: [{ id: 4n, tileX: 2, tileY: 3 }], questWorldItems: [],
      hives: [{ id: 5n, kind: 'wild', variant: 0, tileX: 2, tileY: 3 }],
    },
    animatedOpenChestId: 1n, closingChestId: null, chestAnimationStartedAtMs: 0,
    debugEntitiesHidden: false, visible: { left: -1000, top: -1000, right: 100000, bottom: 100000 },
    enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queue.push(item),
    drawSouthFacingReceiver: (_x: number, _y: number, draw: () => void) => { callbacks.push(draw); draw(); draw(); },
    cameraX: 0, cameraY: 0, scale: 1, projectionAt: () => 0,
    targetableEntities: [], objectPresentations: { resolve: () => ({ authored: false, light: null }) },
    clientProcessorRuntime: () => undefined, frameLightingModel: 'unified',
  };
  return { input, queue, callbacks, enqueue: () => enqueueGameplayPlaceables(input as unknown as Parameters<typeof enqueueGameplayPlaceables>[0]) };
}

describe('retained nested entity receiver callbacks', () => {
  it('keeps all five placeable callbacks while refreshing camera, source, position and animation for 600 frames', () => {
    const f = placeableFixture(); let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    f.enqueue(); f.queue.forEach(item => item.draw());
    const items = [...f.queue], callbacks = [...f.callbacks];
    expect(callbacks).toHaveLength(5);
    for (let frame = 1; frame <= 600; frame++) {
      now = frame; f.queue.length = f.callbacks.length = 0;
      f.input.cameraX = frame; f.input.cameraY = frame + 1; f.input.scale = frame % 3 + 1;
      f.input.art = { frame }; f.input.snapshot.chests[0]!.tileX = frame;
      f.input.snapshot.hives[0]!.variant = frame % 4;
      f.enqueue(); f.queue.forEach(item => item.draw());
      for (let i = 0; i < 5; i++) { expect(f.queue[i]).toBe(items[i]); expect(f.callbacks[i]).toBe(callbacks[i]); }
      expect(art.chest).toHaveBeenLastCalledWith(f.input.context, { frame }, frame * 16 + 8, 64, frame, frame + 1, f.input.scale, Math.floor(now / (1000 / 6)));
      expect(art.target).toHaveBeenLastCalledWith(f.input.context, { frame }, 40, 64, frame, frame + 1, f.input.scale);
      expect(art.hive).toHaveBeenLastCalledWith(f.input.context, { frame }, 'wild', frame % 4, 40, 64, frame, frame + 1, f.input.scale);
    }
    expect(art.placeable).toHaveBeenLastCalledWith(f.input.context, { frame: 600 }, 'fruit_press', false, 0, 4, 40, 64, 600, 601, 1, false, undefined);
    expect(art.surface).toHaveBeenLastCalledWith(f.input.context, { frame: 600 }, 'marlow_tent_table', 40, 64, 600, 601, 1);
    expect(art.chest).toHaveBeenCalledTimes(1202);
  });

  it('samples the chest frame before receiver entry and preserves direct Classic branches', () => {
    const f = placeableFixture(); let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    f.input.drawSouthFacingReceiver = (_x, _y, draw) => { f.callbacks.push(draw); now = 900; draw(); draw(); };
    f.input.frameLightingModel = 'classic'; f.enqueue(); f.queue.forEach(item => item.draw());
    expect(f.callbacks).toHaveLength(2); // Chest and target always use the receiver.
    expect(art.chest.mock.calls.map(call => call[7])).toEqual([0, 0]);
    expect(art.placeable).toHaveBeenCalledTimes(1); expect(art.surface).toHaveBeenCalledTimes(1); expect(art.hive).toHaveBeenCalledTimes(1);
  });

  it('keeps duplicate submissions independent and releases commands on culling and terrain revisions', () => {
    const f = placeableFixture();
    f.input.snapshot.hives.push({ ...f.input.snapshot.hives[0]!, tileX: 7 });
    f.enqueue(); f.queue.forEach(item => item.draw());
    const original = f.queue[4], duplicate = f.queue[5], originalCallback = f.callbacks[4];
    expect(original).not.toBe(duplicate); expect(originalCallback).not.toBe(f.callbacks[5]);
    expect(art.hive.mock.calls.slice(-4).map(call => call[4])).toEqual([40, 40, 120, 120]);
    f.input.snapshot.hives.pop(); f.input.debugEntitiesHidden = true;
    for (let frame = 0; frame < 3; frame++) f.enqueue();
    f.input.debugEntitiesHidden = false; f.queue.length = f.callbacks.length = 0;
    f.enqueue(); f.queue.forEach(item => item.draw());
    expect(f.queue[4]).not.toBe(original); expect(f.callbacks[4]).not.toBe(originalCallback);
    const restored = f.queue[4]; f.input.terrain.version++; f.queue.length = 0; f.enqueue();
    expect(f.queue[4]).not.toBe(restored);
  });

  it('keeps a merchant callback across 600 movement frames and lighting transitions', () => {
    const queue: WorldDepthItem[] = [], callbacks: Array<() => void> = [];
    const npc = { id: 9n, x: 640, y: 1024, health: 10, kind: 'merchant', wanderDirection: 'walk', facing: 'south', moving: true, displayName: '', authorityTick: 0n };
    const input = {
      terrain: { version: 1 }, context: {} as CanvasRenderingContext2D, art: { frame: 0 },
      snapshot: { npcs: [npc], rogueEnemyProfiles: new Map(), merchants: new Map([[9n, {}]]), content: { registry: {} } },
      debugEntitiesHidden: false, npcDisplay: new Map(), npcHitFeedback: new Map(), renderStarted: 0,
      NPC_HIT_HOP_MS: 200, reducedMotionPreference: { matches: false },
      visible: { left: -1000, top: -1000, right: 100000, bottom: 100000 },
      questMarkerForNpc: () => null, questMarkerAnchors: [], targetableEntities: [], nameplates: [],
      projectedWorldY: (_x: number, y: number) => y, projectTargetable: (value: unknown) => value,
      targetableFromVisualBounds: () => ({}), horseAnimationFrame: 0, cameraX: 0, cameraY: 1, scale: 1,
      enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queue.push(item),
      drawSouthFacingReceiver: (_x: number, _y: number, draw: () => void) => { callbacks.push(draw); draw(); },
      frameLightingModel: 'unified',
    };
    let firstItem: WorldDepthItem | undefined, firstCallback: (() => void) | undefined;
    for (let frame = 0; frame <= 600; frame++) {
      queue.length = callbacks.length = 0; input.art = { frame }; input.cameraX = frame; input.horseAnimationFrame = frame;
      npc.x = frame * 16; npc.facing = frame % 2 ? 'east' : 'south';
      input.frameLightingModel = frame % 3 ? 'unified' : 'classic';
      enqueueGameplayNpcs(input as unknown as Parameters<typeof enqueueGameplayNpcs>[0]);
      if (!firstItem) firstItem = queue[0]; else expect(queue[0]).toBe(firstItem);
      queue[0]!.draw();
      if (input.frameLightingModel === 'unified') {
        firstCallback ??= callbacks[0]; expect(callbacks[0]).toBe(firstCallback);
      } else expect(callbacks).toHaveLength(0);
      expect(art.merchant).toHaveBeenLastCalledWith(input.context, { frame }, frame, 64, npc.facing, true, frame + 9, frame, 1, 1, 'merchant', 'walk');
    }
    expect(art.merchant).toHaveBeenCalledTimes(601);
  });
});
