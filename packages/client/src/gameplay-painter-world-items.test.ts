import { bootstrapContentRows, buildContentRegistry, FIXED_UNITS_PER_PIXEL } from '@orchard/sim';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueGameplayResources } from './gameplay-painter-resources.js';

const drawOverworldItem = vi.hoisted(() => vi.fn());

vi.mock('@orchard/engine/overworld-art', async original => ({
  ...await original<typeof import('@orchard/engine/overworld-art')>(),
  drawOverworldItem,
}));

function itemDefinition(itemKind: string, retired = false) {
  const source = buildContentRegistry(bootstrapContentRows()).registry.items.get('item:wood')!;
  return {
    ...source,
    id: `item:${itemKind}` as `item:${string}`,
    displayName: 'Moon Lantern',
    icon: { asset: 'item_cf_moon_lantern', animation: 'glow' },
    light: {
      color: [101, 151, 241] as const,
      radiusTiles: 5,
      profile: 'steady' as const,
      offsetY: -3,
    },
    ...(retired ? { retired: true } : {}),
  };
}

function renderWorldItem(registry: ReturnType<typeof buildContentRegistry>['registry'], itemKind: string) {
  const queued: WorldDepthItem[] = [];
  const pointLights: unknown[] = [];
  const worldItem = {
    id: 41n,
    itemKind,
    quantity: 1,
    x: 10 * FIXED_UNITS_PER_PIXEL,
    y: 12 * FIXED_UNITS_PER_PIXEL,
    droppedAtTick: 10n,
    durability: 0,
    lit: true,
  };
  enqueueGameplayResources({
    debugEntitiesHidden: false,
    snapshot: {
      content: { registry },
      clock: { authorityTick: 12n },
      crops: [],
      worldItems: [worldItem],
    },
    worldResourcesIncludingPersonalQuest: () => [],
    homesteadSurroundingResources: () => [],
    liveMapSuppressesGeneratedResource: () => false,
    seed: 1,
    visible: { left: 0, top: 0, right: 320, bottom: 320 },
    windTrees: [],
    renderWeather: {},
    weatherVisualTick: 0,
    enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queued.push(item),
    context: {},
    art: {
      itemIcons: {
        wood: { id: 'stale-same-slug-art' },
        moon_lantern: { id: 'authored-moon-lantern-art' },
      },
    },
    cameraX: 0,
    cameraY: 0,
    scale: 1,
    visualTickClock: { renderTick: 7 },
    treeShakeRemaining: new Map(),
    resourceGlanceRemaining: new Map(),
    effectPhase: 0,
    dynamicLighting: true,
    lightVisible: { left: 0, top: 0, right: 320, bottom: 320 },
    pointLights,
    projectedLight: (light: import('@orchard/engine/lighting').PointLight) => light,
  } as unknown as Parameters<typeof enqueueGameplayResources>[0]);
  return { queued, pointLights };
}

describe('authored ground item presentation', () => {
  beforeEach(() => drawOverworldItem.mockClear());

  it('renders an arbitrarily named active item with its authored art key and light', () => {
    const definition = itemDefinition('moon_lantern');
    const registry = buildContentRegistry([
      { id: definition.id, kind: definition.kind, json: definition },
    ]).registry;
    const rendered = renderWorldItem(registry, 'moon_lantern');

    expect(rendered.queued).toHaveLength(1);
    expect(rendered.pointLights).toEqual([expect.objectContaining({
      worldX: 10,
      worldY: 9,
      radiusTiles: 5,
      color: { r: 101, g: 151, b: 241 },
      profile: 'steady',
    })]);
    rendered.queued[0]!.draw();
    expect(drawOverworldItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'moon_lantern',
      10,
      12,
      expect.any(Number),
      0,
      0,
      1,
      true,
    );
  });

  it('skips retained same-slug artwork when the live item is retired or missing', () => {
    const retired = itemDefinition('wood', true);
    const retiredRegistry = buildContentRegistry([
      { id: retired.id, kind: retired.kind, json: retired },
    ]).registry;

    for (const registry of [retiredRegistry, buildContentRegistry([]).registry]) {
      const rendered = renderWorldItem(registry, 'wood');
      expect(rendered.queued).toHaveLength(0);
      expect(rendered.pointLights).toHaveLength(0);
    }
    expect(drawOverworldItem).not.toHaveBeenCalled();
  });
});
