import { afterEach, expect, it, vi } from 'vitest';
import { GroundChunkCache } from '@orchard/engine/ground-cache';
import type { TerrainArray } from '@orchard/engine/terrain';
import { createGameplayPainter } from './gameplay-painter.js';
import { installProtocolWorkloadProbe } from './render-protocol-workload-probe.js';

afterEach(() => vi.restoreAllMocks());
it('observes projected player positions and actual cap draws, then removes both hooks', () => {
  const terrain: TerrainArray = { spaceId: 0, seed: 59, version: 1, width: 4, height: 4,
    biomes: new Uint8Array(16).fill(4), blocked: Array<boolean>(16).fill(false),
    horseJumpableTerrain: Array<boolean>(16).fill(false), elevations: new Int16Array(16),
    dirtCliffRoles: new Uint8Array(16), dirtTerraces: new Uint8Array(16) };
  const context = {} as CanvasRenderingContext2D;
  const drawRun = vi.spyOn(GroundChunkCache.prototype, 'drawProjectedRun').mockImplementation(() => {});
  const probe = installProtocolWorkloadProbe({ playerTie: 'player:local', pondTies: new Set(['decoration:pond']),
    season: 'summer', assetSeason: 'summer', contentRevision: '1', cameraElapsedMs: 42, cameraX: 0, cameraY: 0,
    worldWidth: 640, worldHeight: 360, carriedLight: true, staticCasters: 160 });
  try {
    const input = { terrain, context, scale: 2, seasonalDynamic: false,
      projectionAt: () => 8, drawWorldReceiver: () => {} };
    const painter = createGameplayPainter(input);
    painter.enqueueWorldDepth(40, 56, { footY: 56, tie: 'player:local', draw() {} });
    painter.enqueueWorldDepth(100, 120, { footY: 120, tie: 'decoration:pond', draw() {} });
    new GroundChunkCache().drawProjectedRun(context, {} as Parameters<GroundChunkCache['drawProjectedRun']>[1], terrain,
      0, 1, 0, 0, 0, 0, 2);
    expect(probe.read()).toMatchObject({ seed: 59, cameraElapsedMs: 42, playerX: 40, playerY: 48, playerDrawn: true,
      viewportWidth: 320, viewportHeight: 180, capRuns: 1, ponds: 1, carriedLights: 1, staticCasters: 160 });
    createGameplayPainter(input);
    expect(probe.read()).toMatchObject({ playerDrawn: false, capRuns: 0, ponds: 0, carriedLights: 0 });
  } finally { probe.dispose(); probe.dispose(); }
  expect(GroundChunkCache.prototype.drawProjectedRun).toBe(drawRun);
});
