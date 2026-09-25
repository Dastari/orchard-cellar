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

  it('waits for the terrain around the player only when told to (static world S4f)', () => {
    const ready = { connected: true, error: null, identityReady: true, worldReady: true, playerReady: true, profileReady: true };
    // Modes off and shadow pass nothing: every stage is exactly as before.
    expect(worldLoadingStage(ready)).toEqual(worldLoadingStage({ ...ready, terrainReady: true }));
    expect(worldLoadingStage({ ...ready, profileReady: false })).toEqual(worldLoadingStage({ ...ready, profileReady: false, terrainReady: true }));
    const terrain = worldLoadingStage({ ...ready, terrainReady: false });
    expect(terrain).toMatchObject({ title: 'MAPPING THE SHORE', progress: 92 });
    expect(terrain.ready).toBeUndefined();
    // After the player (whose position names the spawn chunk), before the profile.
    expect(worldLoadingStage({ ...ready, playerReady: false, terrainReady: false })).toMatchObject({ progress: 88 });
    expect(worldLoadingStage({ ...ready, profileReady: false, terrainReady: false })).toMatchObject({ progress: 92 });
    expect(worldLoadingStage({ ...ready, error: 'offline', terrainReady: false })).toMatchObject({ error: true });
  });
});
