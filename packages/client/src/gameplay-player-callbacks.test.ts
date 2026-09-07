import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTHORITY_TICK_MS } from '@orchard/sim';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import { enqueueGameplayPlayers } from './gameplay-painter-players.js';
const draws = vi.hoisted(() => ({ fishing: vi.fn(), avatar: vi.fn(), horse: vi.fn(), boat: vi.fn(), mounted: vi.fn(), boatAction: vi.fn(), chest: vi.fn(), target: vi.fn(), placeable: vi.fn() }));
vi.mock('@orchard/engine/overworld-art', async original => ({
  ...await original<typeof import('@orchard/engine/overworld-art')>(),
  drawOverworldAvatar: draws.avatar, drawOverworldHorse: draws.horse, drawOverworldBoat: draws.boat,
  drawOverworldMountedAction: draws.mounted, drawOverworldBoatMountedAction: draws.boatAction,
  drawOverworldChest: draws.chest, drawOverworldArcheryTarget: draws.target, drawOverworldPlaceable: draws.placeable,
  avatarAnimationForDirection: () => 'walk', horseShadowBody: () => ({ halfWidth: 8, heightPixels: 20 }),
  actionVisualForDirection: (_art: unknown, kind: string) => kind === 'none' ? null : ({ asset: { metadata: { animations: { bow: [0, 1, 2, 3] } } }, toolAnimation: 'bow' }),
}));
vi.mock('@orchard/engine/fishing-line', () => ({ drawFishingLine: draws.fishing, fishingRodTipOffset: () => ({ x: 2, y: -4 }) }));
vi.mock('@orchard/sim', async original => ({
  ...await original<typeof import('@orchard/sim')>(), runtimeNpcMount: (_registry: unknown, row: { kind: string }) => ({ adapter: row.kind }),
}));
vi.mock('./net/netcode.js', () => ({ AvatarAnimationController: class {
  update(_x: number, _y: number, kind: string, _started: bigint, tick: number) {
    return { channel: kind === 'none' ? 'locomotion' : 'action', locomotionFrame: tick % 6, frame: tick % 4, fallback: false };
  }
} }));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

function fixture() {
  const queue: WorldDepthItem[] = [], callbacks: Array<() => void> = [];
  const identity = { toHexString: () => 'player' };
  const player = { identity, x: 640, y: 1024, facing: 'south', actionKind: 'none', actionStartedTick: 0n, equippedKind: 'empty', equippedLit: true };
  const carried = { carriedBy: identity, kind: 'fruit_press', lit: false };
  const chests = [carried];
  const predicates = vi.spyOn(chests, 'find').mock.calls;
  const input = {
    terrain: { version: 1 }, context: {} as CanvasRenderingContext2D,
    snapshot: { players: [player], identityHex: 'player', profiles: new Map(), playerJumps: new Map(), appearances: new Map(),
      npcs: [] as Array<{ id: bigint; kind: string; rider: typeof identity; facing: string }>, content: { registry: {} },
      fishingCasts: new Map(), chests, combatTargets: [carried], placeables: [carried] },
    remoteDisplay: new Map(), previousRemoteDisplay: new Map(), renderedLocal: null, previousPredicted: null,
    renderTickClock: { renderTick: 0 }, wildlifeProfile: () => ({ variant: 2 }), projectionAt: () => 0,
    renderedPlayerAnchors: new Map(), equippedLightRow: () => null, selectedItem: () => 'empty', liveItemContentDefinition: () => null,
    lightPreviewKind: null, dynamicLighting: false, visible: { left: -1000, top: -1000, right: 100000, bottom: 100000 },
    targetableEntities: [], predicted: { moving: true, facing: 'south' }, liveEquippedItemFacing: () => player.facing, cursorFacing: () => 'south',
    nameplates: [], profileName: () => 'Player', enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queue.push(item),
    avatarAnimations: new Map(), bowChargeStartedAtMs: null, localActionPresentation: { sample: () => null },
    authoredActionArt: { resolve: () => null }, art: { generation: 0, playerRig: { base: { standing: { metadata: { animations: { walk: [0, 1, 2, 3, 4, 5] } } } } } },
    unknownActionKinds: new Set(), currentBowChargeMs: () => 0, horseAnimationFrame: 0, cameraX: 0, cameraY: 0, scale: 1,
    reducedMotionPreference: { matches: false }, frameLightingModel: 'unified', debugEntitiesHidden: false,
    drawSouthFacingReceiver: (_x: number, _y: number, draw: () => void) => { callbacks.push(draw); draw(); draw(); },
  };
  return { input, player, identity, queue, callbacks, predicates, enqueue: () => enqueueGameplayPlayers(input as unknown as Parameters<typeof enqueueGameplayPlayers>[0]) };
}

describe('retained player receiver and carried-object callbacks', () => {
  it('uses one callback and predicate across 600 changing animation/position frames with repeated draws', () => {
    const f = fixture(); let first: WorldDepthItem | undefined, callback: (() => void) | undefined;
    for (let frame = 0; frame <= 600; frame++) {
      f.queue.length = f.callbacks.length = 0;
      f.player.x = frame * 16; f.player.actionKind = frame % 2 ? 'ranged_weapon' : 'none';
      f.input.renderTickClock.renderTick = frame; f.input.cameraX = frame + .25; f.input.cameraY = frame + .75;
      f.input.art = { ...f.input.art, generation: frame }; f.input.scale = frame % 3 + 1;
      f.enqueue(); first ??= f.queue[0]; expect(f.queue[0]).toBe(first); first!.draw();
      callback ??= f.callbacks[0]; expect(f.callbacks[0]).toBe(callback);
      const args = draws.avatar.mock.lastCall!;
      expect(args.slice(0, 5)).toEqual([f.input.context, f.input.art, frame, 64, 'south']);
      expect(args[6]).toBe(frame % 6); expect(args.slice(7, 11)).toEqual([frame + .25, frame + .75, frame % 3 + 1, frame % 2 ? frame % 4 : null]);
      expect(draws.chest.mock.lastCall?.slice(2)).toEqual([frame, 47, frame + .25, frame + .75, frame % 3 + 1]);
    }
    expect(draws.avatar).toHaveBeenCalledTimes(1202); expect(new Set(f.predicates.map(call => call[0])).size).toBe(1);
    expect(draws.target).toHaveBeenCalledTimes(1202); expect(draws.placeable).toHaveBeenCalledTimes(1202);
  });

  it('samples animation before entering the receiver and preserves direct Classic drawing', () => {
    const f = fixture(); f.input.renderTickClock.renderTick = 7; f.player.actionKind = 'ranged_weapon';
    f.input.drawSouthFacingReceiver = (_x, _y, draw) => { f.input.renderTickClock.renderTick = 100; draw(); draw(); };
    f.enqueue(); f.queue[0]!.draw();
    expect(draws.avatar.mock.calls.map(call => [call[6], call[10]])).toEqual([[1, 3], [1, 3]]);
    f.input.frameLightingModel = 'classic'; f.queue.length = 0; f.enqueue(); f.queue[0]!.draw();
    expect(draws.avatar).toHaveBeenCalledTimes(3); expect(draws.avatar.mock.lastCall?.[6]).toBe(4);
  });

  it('keeps the sampled fishing clock while the receiver runs and uses current line geometry', () => {
    const f = fixture(); f.player.actionKind = 'fish_cast'; f.input.renderTickClock.renderTick = 7;
    f.input.snapshot.fishingCasts.set('player', { targetTileX: 5, targetTileY: 6, startedTick: 2n });
    f.input.drawSouthFacingReceiver = (_x, _y, draw) => { f.input.renderTickClock.renderTick = 100; draw(); draw(); };
    f.enqueue(); f.queue[0]!.draw();
    expect(draws.fishing).toHaveBeenCalledTimes(2);
    for (const call of draws.fishing.mock.calls) expect(call[1]).toMatchObject({
      start: { x: 42, y: 60 }, target: { x: 88, y: 104 }, elapsedMs: 5 * AUTHORITY_TICK_MS, pixelScale: 1,
    });
  });

  it('selects the first mount, updates boat/horse action branches and retires hidden players', () => {
    const f = fixture(); f.input.snapshot.npcs.push({ id: 1n, kind: 'horse', rider: f.identity, facing: 'east' }, { id: 2n, kind: 'boat', rider: f.identity, facing: 'west' });
    f.enqueue(); const first = f.queue[0]!; first.draw(); expect(draws.horse).toHaveBeenCalledTimes(2); expect(draws.boat).not.toHaveBeenCalled();
    f.input.snapshot.npcs.reverse(); f.queue.length = 0; f.enqueue(); expect(f.queue[0]).toBe(first); first.draw(); expect(draws.boat).toHaveBeenCalledTimes(2);
    f.player.actionKind = 'ranged_weapon'; f.queue.length = 0; f.enqueue(); first.draw(); expect(draws.boatAction).toHaveBeenCalledTimes(2);
    f.input.snapshot.npcs.reverse(); f.queue.length = 0; f.enqueue(); first.draw(); expect(draws.mounted).toHaveBeenCalledTimes(2);
    f.input.debugEntitiesHidden = true; for (let i = 0; i < 3; i++) f.enqueue();
    f.input.debugEntitiesHidden = false; f.queue.length = 0; f.enqueue(); expect(f.queue[0]).not.toBe(first);
  });
});
