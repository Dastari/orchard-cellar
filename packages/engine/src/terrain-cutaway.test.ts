import { describe, expect, it } from 'vitest';
import {
  terrainCutawayCenterY,
  terrainCutawayOverlapsRect,
  terrainCutawayReceiverOccludes,
  terrainCutawayStippleCoverage,
  type TerrainCutawayFocus,
} from './terrain-cutaway.js';

const localFocus: TerrainCutawayFocus = {
  worldX: 100,
  projectedFootY: 120,
  depth: {
    footY: 120,
    depthOffset: 0,
    elevationLayer: 0,
    depthPhase: 'entity',
    tie: 'player:local',
  },
};

describe('local-player terrain cutaway', () => {
  it('only receives terrain that the shared painter order places over the local player', () => {
    expect(terrainCutawayReceiverOccludes({
      footY: 121,
      elevationLayer: 0,
      depthPhase: 'boundary',
      tie: 'near-wall-face',
    }, localFocus)).toBe(true);
    expect(terrainCutawayReceiverOccludes({
      footY: 119,
      elevationLayer: 0,
      depthPhase: 'boundary',
      tie: 'far-wall-face',
    }, localFocus)).toBe(false);
    expect(terrainCutawayReceiverOccludes({
      footY: 80,
      elevationLayer: 1,
      depthPhase: 'surface',
      tie: 'mountain-cap',
    }, localFocus)).toBe(true);
  });

  it('uses a body-centred ellipse and rejects non-overlapping terrain', () => {
    expect(terrainCutawayCenterY(localFocus)).toBe(107);
    expect(terrainCutawayOverlapsRect(localFocus, {
      left: 96, top: 96, right: 112, bottom: 112,
    })).toBe(true);
    expect(terrainCutawayOverlapsRect(localFocus, {
      left: 130, top: 96, right: 146, bottom: 112,
    })).toBe(false);
  });

  it('keeps a sparse centre and increasingly solid stipple toward the rim', () => {
    expect(terrainCutawayStippleCoverage(0.2)).toBe(0.125);
    expect(terrainCutawayStippleCoverage(0.6)).toBe(0.25);
    expect(terrainCutawayStippleCoverage(0.75)).toBe(0.5);
    expect(terrainCutawayStippleCoverage(0.95)).toBe(0.75);
  });
});
