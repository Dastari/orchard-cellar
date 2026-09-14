import { bootstrapContentRegistry, FIXED_UNITS_PER_PIXEL } from '@orchard/sim';
import type { ContentRegistry } from '@orchard/sim';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import type { LoadedAsset } from '@orchard/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueGameplayPlayers } from './gameplay-painter-players.js';

const engine = vi.hoisted(() => ({
  actionVisualForDirection: vi.fn(() => null),
  avatarAnimationForDirection: vi.fn(() => 'idle'),
  drawAuthoredOverworldObject: vi.fn(() => true),
  drawOverworldAvatar: vi.fn(),
  drawOverworldPlaceable: vi.fn(),
}));

vi.mock('@orchard/engine/overworld-art', async original => ({
  ...await original<typeof import('@orchard/engine/overworld-art')>(),
  ...engine,
}));

const identity = { toHexString: () => 'abc' };
const authoredAsset = { id: 'authored-portable-beacon' } as unknown as LoadedAsset;

function carriedRow(definitionId: string) {
  return {
    id: 91n,
    kind: 'portable_beacon',
    definitionId,
    stateJson: '{}',
    carriedBy: identity,
    lit: false,
    smeltStartTick: 9n,
  };
}

function renderCarried(
  registry: ContentRegistry,
  definitionId: string,
  resolve = vi.fn(() => ({
    authored: true,
    stateJsonValid: true,
    sprite: { asset: authoredAsset, animation: 'burn', scale: 1.5 },
  })),
) {
  const queue: WorldDepthItem[] = [];
  const placeable = carriedRow(definitionId);
  const player = {
    identity,
    spaceId: 0,
    x: 2 * FIXED_UNITS_PER_PIXEL,
    y: 3 * FIXED_UNITS_PER_PIXEL,
    facing: 'down',
    actionKind: 'none',
    actionStartedTick: 0n,
    equippedKind: 'empty',
    equippedLit: true,
  };
  const standing = {
    metadata: {
      animations: { idle: Array.from({ length: 6 }, () => ({})) },
      animationMeta: { idle: { fps: 8 } },
    },
  };
  enqueueGameplayPlayers({
    debugEntitiesHidden: false,
    snapshot: {
      identityHex: 'abc',
      players: [player],
      placeables: [placeable],
      npcs: [],
      profiles: new Map([['abc', { online: true }]]),
      playerJumps: new Map(),
      appearances: new Map(),
      content: { registry },
      chests: [],
      combatTargets: [],
      fishingCasts: new Map(),
    },
    remoteDisplay: new Map(),
    previousRemoteDisplay: new Map(),
    alpha: 1,
    wildlifeProfile: () => null,
    renderTickClock: { renderTick: 10 },
    renderedLocal: { x: player.x, y: player.y },
    projectionAt: () => 0,
    renderedPlayerAnchors: new Map(),
    equippedLightRow: () => null,
    selectedItem: () => 'empty',
    liveItemContentDefinition: () => null,
    lightPreviewKind: null,
    dynamicLighting: false,
    lightVisible: { left: 0, top: 0, right: 320, bottom: 320 },
    visualTickClock: { renderTick: 10 },
    pointLights: [],
    projectedLight: (light: unknown) => light,
    visible: { left: 0, top: 0, right: 320, bottom: 320 },
    targetableEntities: [],
    predicted: { position: { x: player.x, y: player.y }, facing: 'down', moving: false },
    liveEquippedItemFacing: () => 'down',
    cursorFacing: () => null,
    previousPredicted: { position: { x: player.x, y: player.y } },
    nameplates: [],
    profileName: () => 'Player',
    enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queue.push(item),
    avatarAnimations: new Map(),
    bowChargeStartedAtMs: null,
    localActionPresentation: { sample: () => null, complete: vi.fn() },
    authoredActionArt: { resolve: () => undefined },
    art: {
      itemIcons: { portable_beacon: { id: 'stale-exact-kind-art' } },
      playerRig: { base: { standing } },
    },
    unknownActionKinds: new Set(),
    currentBowChargeMs: () => 0,
    context: {},
    horseAnimationFrame: 0,
    cameraX: 0,
    cameraY: 0,
    scale: 1,
    reducedMotionPreference: { matches: true },
    frameLightingModel: 'classic',
    drawSouthFacingReceiver: (_x: number, _y: number, draw: () => void) => draw(),
    objectPresentations: { resolve },
  } as unknown as Parameters<typeof enqueueGameplayPlayers>[0]);
  return { queue, placeable, resolve };
}

function arbitraryRegistry(): ContentRegistry {
  const registry = bootstrapContentRegistry();
  const itemSource = registry.items.get('item:furnace')!;
  const objectSource = registry.objects.get('object:furnace')!;
  const item = { ...itemSource, id: 'item:portable_beacon' as const };
  const object = {
    ...objectSource,
    id: 'object:totally_unrelated_machine' as const,
    components: {
      ...objectSource.components,
      placement: { ...objectSource.components.placement!, item: item.id },
      sprite: { ...objectSource.components.sprite!, asset: 'prop_cf_portable_beacon' },
    },
  };
  return {
    ...registry,
    items: new Map(registry.items).set(item.id, item),
    objects: new Map(registry.objects).set(object.id, object),
  };
}

describe('authored carried-placeable presentation', () => {
  beforeEach(() => {
    for (const mock of Object.values(engine)) mock.mockClear();
  });

  it.each(['object:totally_unrelated_machine', ''])(
    'draws arbitrary item/object ids through authored art with definitionId=%j',
    (definitionId) => {
      const rendered = renderCarried(arbitraryRegistry(), definitionId);
      expect(rendered.queue).toHaveLength(1);
      expect(rendered.queue[0]).toMatchObject({ tie: 'player:abc', footY: 3 });
      expect(rendered.resolve).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: rendered.placeable.id,
          kind: 'portable_beacon',
          definitionId,
          lit: true,
          stateJson: '{"lit":true}',
        }),
      );
      rendered.queue[0]!.draw();
      expect(engine.drawAuthoredOverworldObject).toHaveBeenCalledWith(
        expect.anything(), authoredAsset, 'burn', expect.any(Number),
        2, 3 - 17, 0, 0, 1, 1.5,
      );
      expect(engine.drawOverworldPlaceable).not.toHaveBeenCalled();
    },
  );

  it('does not render stale exact-kind art for a retired or missing live object', () => {
    const registry = arbitraryRegistry();
    const definition = registry.objects.get('object:totally_unrelated_machine')!;
    const retiredRegistry = {
      ...registry,
      objects: new Map(registry.objects).set(definition.id, { ...definition, retired: true }),
    };
    const missingRegistry = { ...registry, objects: new Map() };

    for (const candidate of [retiredRegistry, missingRegistry]) {
      const resolve = vi.fn(() => ({
        authored: true,
        stateJsonValid: true,
        sprite: { asset: authoredAsset, animation: 'burn', scale: 1.5 },
      }));
      const rendered = renderCarried(candidate, definition.id, resolve);
      expect(rendered.queue).toHaveLength(1);
      rendered.queue[0]!.draw();
      expect(resolve).not.toHaveBeenCalled();
    }
    expect(engine.drawAuthoredOverworldObject).not.toHaveBeenCalled();
    expect(engine.drawOverworldPlaceable).not.toHaveBeenCalled();
  });
});
