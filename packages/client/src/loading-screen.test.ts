import { describe, expect, it } from 'vitest';
import { worldLoadingStage } from './loading-screen.js';

describe('world loading presentation', () => {
  it('advances through connection, world, player, and profile readiness', () => {
    const base = { connected: false, error: null, identityReady: false, worldReady: false, playerReady: false, profileReady: false };
    expect(worldLoadingStage(base)).toMatchObject({ progress: 58 });
    expect(worldLoadingStage({ ...base, connected: true })).toMatchObject({ progress: 68 });
    expect(worldLoadingStage({ ...base, connected: true, identityReady: true })).toMatchObject({ progress: 78 });
    expect(worldLoadingStage({ ...base, connected: true, identityReady: true, worldReady: true })).toMatchObject({ progress: 88 });
    expect(worldLoadingStage({ ...base, connected: true, identityReady: true, worldReady: true, playerReady: true })).toMatchObject({ progress: 95 });
    expect(worldLoadingStage({ connected: true, error: null, identityReady: true, worldReady: true, playerReady: true, profileReady: true }))
      .toMatchObject({ progress: 100, ready: true });
  });

  it('presents connection failure as a terminal themed state', () => {
    expect(worldLoadingStage({ connected: false, error: 'offline', identityReady: false, worldReady: false, playerReady: false, profileReady: false }))
      .toMatchObject({ progress: 100, error: true });
  });
});
