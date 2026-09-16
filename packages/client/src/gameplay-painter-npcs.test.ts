import { bootstrapContentRegistry, buildContentRegistry, FIXED_UNITS_PER_PIXEL } from '@orchard/sim';
import { authoredNpcArt, loadAuthoredNpcArt } from '@orchard/engine/authored-npc-art';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import type { LoadedAsset } from '@orchard/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueGameplayNpcs } from './gameplay-painter-npcs.js';

const engine = vi.hoisted(() => ({
  drawOverworldMerchant: vi.fn(),
  merchantWorldBounds: vi.fn(() => ({ left: 22, top: 30, right: 42, bottom: 48 })),
  drawOverworldBoat: vi.fn(),
  drawOverworldHorse: vi.fn(),
  drawOverworldRogueEnemy: vi.fn(),
  drawOverworldWildlife: vi.fn(),
  drawAuthoredOverworldWildlife: vi.fn(),
  horseWorldBounds: vi.fn(),
  rogueEnemyWorldBounds: vi.fn(),
  wildlifeWorldBounds: vi.fn(),
  authoredWildlifeWorldBounds: vi.fn(() => ({ left: 22, top: 30, right: 42, bottom: 48 })),
  authoredWildlifeShadowBody: vi.fn(),
}));

vi.mock('@orchard/engine/overworld-art', async original => ({
  ...await original<typeof import('@orchard/engine/overworld-art')>(),
  ...engine,
}));

const source = bootstrapContentRegistry().npcs.get('npc:fisherman_fin')!;

function fishingDefinition(retired = false) {
  return {
    ...source,
    id: 'npc:river_sage' as const,
    runtimeKind: 'river_sage',
    displayName: 'River Sage',
    actorAsset: 'npc_cf_river_sage',
    ...(retired ? { retired: true } : {}),
  };
}

function worldNpc() {
  return {
    id: 72n,
    kind: 'river_sage',
    displayName: 'River Sage',
    x: 2 * FIXED_UNITS_PER_PIXEL,
    y: 3 * FIXED_UNITS_PER_PIXEL,
    facing: 'down',
    moving: false,
    rider: undefined,
    wanderDirection: 'fish_cast',
    authorityTick: 100n,
    health: 100,
  };
}

function renderNpc(
  registry: ReturnType<typeof buildContentRegistry>['registry'],
  art: object,
  options: { readonly npc?: ReturnType<typeof worldNpc>; readonly wildlifeSpecies?: string;
    readonly previous?: { x: number; y: number }; readonly current?: { x: number; y: number };
    readonly alpha?: number; readonly cameraX?: number; readonly cameraY?: number;
  } = {},
) {
  const queued: WorldDepthItem[] = [];
  const targetableEntities: unknown[] = [];
  const nameplates: unknown[] = [];
  const npc = options.npc ?? worldNpc();
  enqueueGameplayNpcs({
    debugEntitiesHidden: false,
    snapshot: {
      content: { registry },
      npcs: [npc],
      merchants: options.wildlifeSpecies === undefined
        ? new Map([[npc.id, { npcId: npc.id, shopId: 'shop:any' }]]) : new Map(),
      rogueEnemyProfiles: new Map(),
      outdoorEnemyProfiles: new Map(),
      clock: { authorityTick: 105n },
    },
    npcDisplay: new Map(options.current ? [[npc.id, options.current]] : []),
    previousNpcDisplay: new Map(options.previous ? [[npc.id, options.previous]] : []),
    alpha: options.alpha ?? 1,
    renderStarted: 1_000,
    npcHitFeedback: new Map(),
    NPC_HIT_HOP_MS: 100,
    reducedMotionPreference: { matches: true },
    visible: { left: 0, top: 0, right: 320, bottom: 320 },
    questMarkerForNpc: () => null,
    questMarkerAnchors: [],
    projectedWorldY: (_x: number, y: number) => y,
    targetableEntities,
    projectTargetable: (target: unknown) => target,
    enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queued.push(item),
    context: { save: vi.fn(), restore: vi.fn(), filter: 'none' },
    art,
    horseAnimationFrame: 4,
    cameraX: options.cameraX ?? 0,
    cameraY: options.cameraY ?? 0,
    scale: 1,
    targetableFromVisualBounds: (target: unknown) => target,
    nameplates,
    frameLightingModel: 'classic',
    drawSouthFacingReceiver: (_x: number, _y: number, draw: () => void) => draw(),
    wildlifeProfile: () => options.wildlifeSpecies === undefined
      ? null : { species: options.wildlifeSpecies, variant: 2 },
    npcTargetDimensions: () => ({ halfWidth: 8, height: 16 }),
    NPC_HIT_FLASH_MS: 100,
  } as unknown as Parameters<typeof enqueueGameplayNpcs>[0]);
  return { queued, targetableEntities, nameplates };
}

describe('authored NPC painter authority', () => {
  beforeEach(() => {
    for (const mock of Object.values(engine)) mock.mockClear();
  });

  it('renders an arbitrarily renamed legacy row with semantic fishing-cycle frames', async () => {
    const definition = fishingDefinition();
    const registry = buildContentRegistry([
      { id: definition.id, kind: definition.kind, json: definition },
    ]).registry;
    const art = {};
    await loadAuthoredNpcArt(art, [definition], async () => ({ id: 'river-art' }) as unknown as LoadedAsset);

    const rendered = renderNpc(registry, art);

    expect(rendered.queued).toHaveLength(1);
    expect(engine.merchantWorldBounds).toHaveBeenCalledWith(
      art, 2, 3, 'down', false, expect.any(Number), 'river_sage', 'fish_cast', true,
    );
    rendered.queued[0]!.draw();
    expect(engine.drawOverworldMerchant).toHaveBeenCalledWith(
      expect.anything(), art, 2, 3, 'down', false, expect.any(Number), 0, 0, 1,
      'river_sage', 'fish_cast', true,
    );
    expect(rendered.targetableEntities).toHaveLength(1);
    expect(rendered.nameplates).toHaveLength(1);
  });

  it('does not revive retained same-slug art for a retired or missing live NPC', async () => {
    const active = fishingDefinition();
    const art = {};
    const staleArt = { id: 'stale-river-art' } as unknown as LoadedAsset;
    await loadAuthoredNpcArt(art, [active], async () => staleArt);
    expect(authoredNpcArt(art, 'river_sage')).toBe(staleArt);
    const retired = fishingDefinition(true);
    const retiredRegistry = buildContentRegistry([
      { id: retired.id, kind: retired.kind, json: retired },
    ]).registry;

    for (const registry of [retiredRegistry, buildContentRegistry([]).registry]) {
      const rendered = renderNpc(registry, art);
      expect(rendered.queued).toHaveLength(0);
      expect(rendered.targetableEntities).toHaveLength(0);
      expect(rendered.nameplates).toHaveLength(0);
    }
    expect(engine.merchantWorldBounds).not.toHaveBeenCalled();
    expect(engine.drawOverworldMerchant).not.toHaveBeenCalled();
  });

  it('renders a wildlife row through an arbitrarily renamed active creature presentation', () => {
    const cow = bootstrapContentRegistry().creatures.get('creature:cow')!;
    const renamed = {
      ...cow,
      id: 'creature:moon_grazer' as const,
      presentation: { asset: 'moon_grazer', animation: 'frog', target: [14, 23] as const },
    };
    const registry = buildContentRegistry([
      { id: renamed.id, kind: renamed.kind, json: renamed },
    ]).registry;
    const npc = { ...worldNpc(), kind: 'moon_grazer', displayName: 'Moon Grazer' };
    const rendered = renderNpc(registry, {}, { npc, wildlifeSpecies: 'cow' });

    expect(rendered.queued).toHaveLength(1);
    expect(engine.authoredWildlifeWorldBounds).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({
        assetFamily: 'moon_grazer', animationProfile: 'frog',
        targetBounds: { halfWidth: 14, height: 23 },
      }), 2, 'fish_cast', 2, 3, 'down', false, expect.any(Number), false,
    );
    rendered.queued[0]!.draw();
    expect(engine.drawAuthoredOverworldWildlife).toHaveBeenCalled();
  });

  it('fails neutral when a retained wildlife row has no active creature definition', () => {
    const cow = bootstrapContentRegistry().creatures.get('creature:cow')!;
    const retired = { ...cow, id: 'creature:retired_cow' as const, retired: true };
    for (const registry of [
      buildContentRegistry([{ id: retired.id, kind: retired.kind, json: retired }]).registry,
      buildContentRegistry([]).registry,
    ]) {
      const rendered = renderNpc(registry, {}, { wildlifeSpecies: 'cow' });
      expect(rendered.queued).toHaveLength(0);
      expect(rendered.targetableEntities).toHaveLength(0);
    }
    expect(engine.drawAuthoredOverworldWildlife).not.toHaveBeenCalled();
  });
});


describe('NPC render-frame interpolation', () => {
  it.each([0, 0.25, 0.5, 0.75, 1])('keeps diagonal NPC motion aligned with the camera at alpha %s', async alpha => {
    const registry = bootstrapContentRegistry();
    const art = {};
    const npc = { ...worldNpc(), kind: 'sheep', moving: true, wanderDirection: 'walk' };
    const previous = { x: 64 * FIXED_UNITS_PER_PIXEL, y: 80 * FIXED_UNITS_PER_PIXEL };
    const current = { x: 68 * FIXED_UNITS_PER_PIXEL, y: 84 * FIXED_UNITS_PER_PIXEL };
    const cameraX = 10 + 4 * alpha, cameraY = 20 + 4 * alpha;
    engine.drawAuthoredOverworldWildlife.mockClear();
    const result = renderNpc(registry, art, { npc, wildlifeSpecies: 'sheep', previous, current, alpha, cameraX, cameraY });
    for (const item of result.queued) item.draw();
    const call = engine.drawAuthoredOverworldWildlife.mock.calls[0]!;
    expect(Number(call[5]) - Number(call[10])).toBe(54);
    expect(Number(call[6]) - Number(call[11])).toBe(60);
  });
});
