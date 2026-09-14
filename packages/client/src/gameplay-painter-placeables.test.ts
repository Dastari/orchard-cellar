import {
  bootstrapContentRegistry,
  fenceJoinMask,
  runtimeObjectProcessor,
  type ContentRegistry,
} from '@orchard/sim';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import type { LoadedAsset } from '@orchard/ui';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { enqueueGameplayPlaceables } from './gameplay-painter-placeables.js';
import type { ObjectPresentation } from './content/object-presentation.js';

const artDraw = vi.hoisted(() => ({
  authored: vi.fn<(...args: unknown[]) => boolean>(() => true),
  legacy: vi.fn<(...args: unknown[]) => void>(),
}));

vi.mock('@orchard/engine/overworld-art', async importOriginal => ({
  ...await importOriginal<typeof import('@orchard/engine/overworld-art')>(),
  drawAuthoredOverworldObject: artDraw.authored,
  drawOverworldPlaceable: artDraw.legacy,
}));

const authoredAsset = { name: 'authored-machine' } as unknown as LoadedAsset;
type PresentationResolveMock = Mock<(content: unknown, row: unknown) => ObjectPresentation>;

function registryWithRenamedMachine(retired = false): ContentRegistry {
  const registry = bootstrapContentRegistry();
  const source = registry.objects.get('object:furnace')!;
  const definition = {
    ...source,
    id: 'object:moon_machine' as const,
    ...(retired ? { retired: true as const } : {}),
  };
  return {
    ...registry,
    objects: new Map(registry.objects).set(definition.id, definition),
  };
}

function placeable(
  definitionId: string | undefined,
  kind = 'furnace',
  id = 41n,
) {
  return {
    id, kind, definitionId, stateJson: '{"lit":true}',
    tileX: 2, tileY: 3, open: true, lit: true, smeltStartTick: 9n,
  };
}

function paint(
  registry: ContentRegistry,
  rows: readonly ReturnType<typeof placeable>[],
  resolve: PresentationResolveMock = vi.fn(() => ({
    definitionId: 'object:moon_machine',
    authored: true,
    stateJsonValid: true,
    state: { open: true, lit: true },
    sprite: {
      assetName: 'authored-machine', asset: authoredAsset, animation: 'open-burn', scale: 1.25,
    },
    light: null,
    collision: { blocksMovement: true, occludesLight: true },
  })),
  clientProcessorRuntime: Mock = vi.fn(() => null),
) {
  const queue: WorldDepthItem[] = [];
  const placeables = Object.assign([...rows], {
    get: (id: bigint) => rows.find((row) => row.id === id),
  });
  enqueueGameplayPlaceables({
    snapshot: {
      content: { registry }, placeables, players: [], chests: [], combatTargets: [],
      surfaces: [], hives: [], questWorldItems: [], activeChest: null,
      activePlaceable: null, openPlaceableSlots: new Map(),
    },
    animatedOpenChestId: null,
    closingChestId: null,
    chestAnimationStartedAtMs: 0,
    debugEntitiesHidden: false,
    visible: { left: 0, top: 0, right: 256, bottom: 256 },
    enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queue.push(item),
    drawSouthFacingReceiver: (_x: number, _y: number, draw: () => void) => draw(),
    context: {}, art: { itemIcons: { furnace: { name: 'stale-exact-kind' } } },
    cameraX: 0, cameraY: 0, scale: 1, projectionAt: () => 0,
    targetableEntities: [], objectPresentations: { resolve }, clientProcessorRuntime,
    frameLightingModel: 'classic',
  } as unknown as Parameters<typeof enqueueGameplayPlaceables>[0]);
  return { queue, resolve };
}

describe('live placeable rendering authority', () => {
  beforeEach(() => {
    artDraw.authored.mockClear();
    artDraw.authored.mockReturnValue(true);
    artDraw.legacy.mockClear();
  });

  it('draws an arbitrary active definition only through its authored sprite and state animation', () => {
    const row = placeable('object:moon_machine');
    const rendered = paint(registryWithRenamedMachine(), [row]);
    expect(rendered.queue).toHaveLength(1);
    rendered.queue[0]!.draw();
    expect(rendered.resolve).toHaveBeenCalledWith(expect.anything(), row);
    expect(artDraw.authored).toHaveBeenCalledWith(
      expect.anything(), authoredAsset, 'open-burn', expect.any(Number),
      40, 64, 0, 0, 1, 1.25, undefined,
    );
    expect(artDraw.legacy).not.toHaveBeenCalled();
  });

  it('fails explicit missing and retired definition ids closed before presentation lookup', () => {
    for (const [registry, id] of [
      [registryWithRenamedMachine(), 'object:not_published'],
      [registryWithRenamedMachine(true), 'object:moon_machine'],
    ] as const) {
      const rendered = paint(registry, [placeable(id)]);
      expect(rendered.queue).toHaveLength(0);
      expect(rendered.resolve).not.toHaveBeenCalled();
    }
    expect(artDraw.authored).not.toHaveBeenCalled();
    expect(artDraw.legacy).not.toHaveBeenCalled();
  });

  it('skips unloaded or invalid authored art without resurrecting exact-kind legacy art', () => {
    const registry = registryWithRenamedMachine();
    const unloaded = paint(registry, [placeable('object:moon_machine')], vi.fn(() => ({
      definitionId: 'object:moon_machine', authored: true, stateJsonValid: true, state: {},
      sprite: { assetName: 'authored-machine', asset: null, animation: 'base', scale: 1 },
      light: null, collision: null,
    })));
    unloaded.queue[0]!.draw();
    expect(artDraw.authored).not.toHaveBeenCalled();
    expect(artDraw.legacy).not.toHaveBeenCalled();

    artDraw.authored.mockReturnValueOnce(false);
    const invalidFrame = paint(registry, [placeable('object:moon_machine')]);
    invalidFrame.queue[0]!.draw();
    expect(artDraw.authored).toHaveBeenCalledOnce();
    expect(artDraw.legacy).not.toHaveBeenCalled();
  });

  it('retains blank-definition legacy rendering by kind', () => {
    const row = placeable('', 'legacy_press');
    const rendered = paint(bootstrapContentRegistry(), [row], vi.fn(() => ({
      definitionId: 'object:legacy_press', authored: false,
      stateJsonValid: true, state: { open: true, lit: true },
      sprite: null, light: null, collision: null,
    })));
    rendered.queue[0]!.draw();
    expect(artDraw.authored).not.toHaveBeenCalled();
    expect(artDraw.legacy).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'legacy_press', true, 0,
      expect.any(Number), 40, 64, 0, 0, 1, true, undefined,
    );
  });

  it('passes authored fence joins and fruit-press contents through the authored painter', () => {
    const registry = bootstrapContentRegistry();
    const left = placeable('object:fence', 'fence', 51n);
    const right = { ...placeable('object:fence', 'fence', 52n), tileX: 3 };
    const fencePaint = paint(registry, [left, right]);
    fencePaint.queue[0]!.draw();
    expect(artDraw.authored.mock.calls[0]?.[3]).toBe(fenceJoinMask(
      2, 3, (tileX, tileY) => tileX === 3 && tileY === 3,
    ));

    artDraw.authored.mockClear();
    const press = {
      ...placeable('object:fruit_press', 'fruit_press', 61n),
      processStartTick: 10n,
      processInputKind: 'apple',
    };
    const pressPaint = paint(
      registry,
      [press],
      undefined,
      vi.fn(() => runtimeObjectProcessor(registry, press)),
    );
    pressPaint.queue[0]!.draw();
    expect(artDraw.authored.mock.calls[0]?.at(-1)).toBe('contents_apple');
    expect(artDraw.legacy).not.toHaveBeenCalled();
  });
});
