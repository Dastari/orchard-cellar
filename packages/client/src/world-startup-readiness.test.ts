import { describe, expect, it } from 'vitest';
import { collisionBootstrapReady } from './world-startup-readiness.js';

describe('collisionBootstrapReady', () => {
  const ready = {
    connected: true,
    identityReady: true,
    worldSeedReady: true,
    clockReady: true,
    environmentReady: true,
    playerReady: true,
  } as const;

  it('waits for every authority bootstrap dependency', () => {
    expect(collisionBootstrapReady(ready)).toBe(true);
    for (const key of Object.keys(ready) as (keyof typeof ready)[]) {
      expect(collisionBootstrapReady({ ...ready, [key]: false })).toBe(false);
    }
  });
});
