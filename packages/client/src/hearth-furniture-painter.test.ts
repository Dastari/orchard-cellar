import { describe, expect, it, vi } from 'vitest';
import type { LoadedAsset } from '@orchard/ui';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import type { PointLight } from '@orchard/engine/lighting';
import { drawAuthoredOverworldObject } from '@orchard/engine/overworld-art';
import { LiveContentRegistry } from './content/live-content.js';
import { LiveObjectPresentationCache } from './content/object-presentation.js';
import { enqueueGameplayPlaceables } from './gameplay-painter-placeables.js';
import { enqueueGameplayDecorations } from './gameplay-painter-decorations.js';
vi.mock('@orchard/engine/overworld-art', async importOriginal => ({
  ...await importOriginal<typeof import('@orchard/engine/overworld-art')>(),
  drawAuthoredOverworldObject: vi.fn(() => true),
}));
async function fixture(parentState = '{}', missingParentAsset = false) {
  const content = new LiveContentRegistry('furniture-render-test', null).state;
  const table = { id: 1n, kind: 'furniture_rustic_dining_table', definitionId: 'object:furniture_rustic_dining_table',
    spaceId: 30000, tileX: 5, tileY: 5, stateJson: parentState, open: false, lit: true };
  const lamp = { ...table, id: 2n, kind: 'furniture_townhouse_table_lamp', definitionId: 'object:furniture_townhouse_table_lamp',
    tileY: 4, stateJson: '{"lit":true,"hearthFurnitureSupportId":"1"}' };
  const rug = { ...table, id: 3n, kind: 'furniture_rustic_woven_rug', definitionId: 'object:furniture_rustic_woven_rug', stateJson: '{}' };
  const placeables = Object.assign([lamp, table, rug], { get: (id: bigint) => placeables.find(row => row.id === id) });
  const cache = new LiveObjectPresentationCache(() => {}, async name => {
    if (missingParentAsset && name.includes('dining_table')) return await new Promise<LoadedAsset>(() => {});
    return { name, assetId: 1, image: {}, anchor: [8, 31], frames: { base: [[0, 0, 16, 32]] } } as unknown as LoadedAsset;
  });
  for (const row of placeables) cache.resolve(content, row);
  await vi.waitFor(() => expect(cache.resolve(content, lamp).sprite?.asset).not.toBeNull());
  const queued: WorldDepthItem[] = [], lights: PointLight[] = [], samples: (number | undefined)[] = [];
  const input = {
    snapshot: { content, placeables, players: [], chests: [], combatTargets: [], surfaces: [], hives: [], questWorldItems: [] },
    objectPresentations: cache, animatedOpenChestId: null, closingChestId: null, chestAnimationStartedAtMs: 0,
    context: {}, art: {}, cameraX: 0, cameraY: 0, scale: 1, debugEntitiesHidden: false,
    visible: { left: 0, top: 0, right: 256, bottom: 256 }, lightVisible: { left: 0, top: 0, right: 256, bottom: 256 },
    enqueueWorldDepth: (_x: number, _y: number, item: WorldDepthItem) => queued.push(item),
    drawSouthFacingReceiver: (_x: number, _y: number, draw: () => void) => draw(),
    frameLightingModel: 'unified', projectionAt: () => 0, targetableEntities: [], dynamicLighting: true,
    activeSpaceDefinition: { generator: 'debug_flat', spaceId: 30000 }, pointLights: lights,
    projectedLight: (light: PointLight, sample?: number) => { samples.push(sample); return light; },
  };
  return { input, queued, lights, samples };
}
function render(f: Awaited<ReturnType<typeof fixture>>) {
  vi.mocked(drawAuthoredOverworldObject).mockClear();
  enqueueGameplayPlaceables(f.input as unknown as Parameters<typeof enqueueGameplayPlaceables>[0]);
  for (const item of f.queued) item.draw();
  enqueueGameplayDecorations(f.input as unknown as Parameters<typeof enqueueGameplayDecorations>[0]);
}
describe('actual furniture painter producers', () => {
  it('groups table and lamp art, retains rug surface phase and anchors light to the raised tabletop', async () => {
    const f = await fixture(); render(f);
    expect(f.queued.map(item => [item.tie, item.depthPhase])).toEqual([['placeable:1', 'entity'], ['placeable:3', 'surface']]);
    expect(vi.mocked(drawAuthoredOverworldObject).mock.calls.map(call => [call[1].name, call[4], call[5]])).toEqual([
      ['prop_cf_furniture_rustic_dining_table', 88, 96], ['prop_cf_furniture_townhouse_table_lamp', 88, 76],
      ['prop_cf_furniture_rustic_woven_rug', 88, 96],
    ]);
    expect(f.lights).toHaveLength(1);
    expect(f.lights[0]).toMatchObject({ worldX: 88, worldY: 56, receiverDirectionWorldY: 96, profile: 'steady' });
    expect(f.samples).toEqual([96]);
  });
  it('withholds attached art and light when its parent state is corrupt or its image is still loading', async () => {
    for (const f of [await fixture('broken'), await fixture('{}', true)]) {
      render(f);
      expect(f.queued.map(item => item.tie)).toEqual(['placeable:3']);
      expect(f.lights).toEqual([]);
      expect(vi.mocked(drawAuthoredOverworldObject).mock.calls.map(call => call[1].name)).toEqual(['prop_cf_furniture_rustic_woven_rug']);
    }
  });
});
