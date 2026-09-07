import { beforeEach, expect, it, vi } from 'vitest';
import { createGameplayProtocolWorkload } from './gameplay-protocol-workload.js';
import { RenderMetrics } from '@orchard/engine/metrics';
import { celestialLightingAtCalendar } from '@orchard/engine/celestial-lighting';
import type { ProtocolGameplay } from './gameplay-render-protocol.js';

const { settle } = vi.hoisted(() => ({ settle: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./render-protocol-restore.js', () => ({ waitForProtocolRestore: settle }));
vi.mock('@orchard/ui', async (original) => ({ ...await original<typeof import('@orchard/ui')>(),
  atlasPageDiagnostics: () => ({ pages: [{ url: '/generated/atlas_trees_p000_summer.png' }] }) }));
beforeEach(() => { settle.mockReset(); settle.mockResolvedValue(undefined); });

function fixture() {
  type Input = Parameters<typeof createGameplayProtocolWorkload>[0];
  let sky: Input['lightingPreview'] = null, light: Input['lightPreview'] = null, panel: Input['uiWindow'] = 'developer';
  const input: Input = {
    // The suite only reads these renderer dimensions and prepared diagnostics.
    renderer: { cssWidth: 1280, cssHeight: 720, dpr: 1, worldScale: '1x' } as Input['renderer'],
    pass: { renderer: { scene: { diagnostics: { staticCasters: 160 } } } } as Input['pass'],
    cameraX: 500, cameraY: 600, zoom: 2, seed: 59, contentRevision: 'registry',
    mapRevision: 2, mapContentHash: 'map', resourceRevision: 3, playerIdentity: 'local',
    get lightingPreview() { return sky; }, get lightPreview() { return light; }, get uiWindow() { return panel; },
    setLightingPreview(value) { sky = value; }, setLightPreview(value) { light = value; }, setUiWindow(value) { panel = value; },
    pondTies: () => new Set(['decoration:pond']),
  };
  const game = { diagnostics: () => ({ lighting: { model: 'classic', requestedQuality: 'basic' } }),
    setLightingModel: vi.fn(), setLightingQuality: vi.fn() } as unknown as ProtocolGameplay;
  return { input, game };
}
it('pins actual artwork season, closes the panel, measures a real sky RGB step and restores presentation settings', async () => {
  const { input, game } = fixture();
  const workload = await createGameplayProtocolWorkload(input)(new RenderMetrics(), game);
  expect(workload.identity).toMatchObject({ seed: 59, season: 'summer', contentRevision: 'registry:map:2:3' });
  expect(input.uiWindow).toBeNull(); expect(input.lightPreview).toBe('lantern');
  expect(input.lightingPreview?.continuousDay).toBe(10.5);
  workload.begin(); workload.advance(1_000);
  const before = celestialLightingAtCalendar(input.lightingPreview!);
  expect(before.season.from).toBe('summer');
  workload.advance(16_000);
  const after = celestialLightingAtCalendar(input.lightingPreview!);
  expect([before.diffuse, before.sun.illumination, before.moon.illumination])
    .not.toEqual([after.diffuse, after.sun.illumination, after.moon.illumination]);
  expect(workload.source.staticCasters).toBe(160);
  workload.dispose(); workload.dispose();
  expect(input.lightingPreview).toBeNull(); expect(input.lightPreview).toBeNull(); expect(input.uiWindow).toBe('developer');
  expect(game.setLightingModel).toHaveBeenLastCalledWith('classic');
  expect(game.setLightingQuality).toHaveBeenLastCalledWith('basic');
});
it('restores the owner presentation if preflight cannot settle', async () => {
  const { input, game } = fixture(); settle.mockRejectedValueOnce(new Error('test unavailable'));
  await expect(createGameplayProtocolWorkload(input)(new RenderMetrics(), game)).rejects.toThrow('test unavailable');
  expect(input.uiWindow).toBe('developer'); expect(input.lightingPreview).toBeNull(); expect(input.lightPreview).toBeNull();
});
