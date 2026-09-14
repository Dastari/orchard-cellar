import { expect, it } from 'vitest';
import { ProtocolWorkloadBuffer, compareProtocolWorkloads, type ProtocolWorkloadFrame } from './render-protocol-workload.js';
const identity = { seed: 59, season: 'summer', contentRevision: 'abc', route: 'pond-cap-square-v1' };
function capture(overrides: Partial<ProtocolWorkloadFrame> = {}, count = 300) {
  const buffer = new ProtocolWorkloadBuffer(identity);
  for (let i = 0; i < 120; i++) buffer.record({ ...identity, assetSeason: 'summer', cameraX: 0, cameraY: 0,
    viewportWidth: 640, viewportHeight: 360, playerX: 200 + i, playerY: 200, playerDrawn: true,
    capRuns: 4, ponds: 1, carriedLights: 1, staticCasters: 160, ...overrides }, count);
  return buffer.report();
}
it('qualifies visible walking in populated content and compares item counts symmetrically', () => {
  const baseline = capture();
  expect(baseline.qualified).toBe(true);
  expect(compareProtocolWorkloads(baseline, capture({}, 306)).comparable).toBe(true);
  expect(compareProtocolWorkloads(capture({}, 306), baseline).comparable).toBe(true);
  expect(compareProtocolWorkloads(baseline, capture({}, 307)).comparable).toBe(false);
});
it.each([
  [{ playerX: 10 }, 'local_player_not_visible'],
  [{ playerX: 200 }, 'local_player_not_walking'],
  [{ playerDrawn: false }, 'local_player_not_visible'],
  [{ season: 'spring' }, 'seed_season_or_content_changed'],
  [{ assetSeason: 'spring' }, 'asset_season_mismatch'],
  [{ capRuns: 0 }, 'no_cliff_cap_runs'],
  [{ ponds: 0 }, 'no_pond'],
  [{ carriedLights: 0 }, 'no_carried_light'],
  [{ staticCasters: 149 }, 'fewer_than_150_static_casters'],
  [{ playerX: Number.NaN }, 'invalid_frame_evidence'],
] as const)('rejects unsuitable workload evidence %j', (overrides, issue) => {
  expect(capture(overrides).issues).toContain(issue);
});

it('rejects a different measured route even when the driver reuses the same route name', () => {
  expect(compareProtocolWorkloads(capture(), capture({ cameraX: 8 })).issues).toContain('different_measured_cameraX_route');
});
