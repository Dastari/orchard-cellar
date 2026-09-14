import { describe, expect, it } from 'vitest';
import goldenText from './fixtures/terrain-lab-plans.golden.json?raw';
import { compileMapDocument, semanticTerrainTraceAt } from './map-compiler.js';
import { createTerrainLabDocument, TERRAIN_LAB_GOLDEN_SAMPLES } from './terrain-lab.js';

describe('terrain laboratory', () => {
  it('keeps the pathological shape matrix pinned to semantic JSON plans', () => {
    const document = createTerrainLabDocument();
    const compiled = compileMapDocument(document);
    const plans = Object.fromEntries(Object.entries(TERRAIN_LAB_GOLDEN_SAMPLES).map(([name, point]) => {
      const trace = semanticTerrainTraceAt(document, point.tileX, point.tileY, compiled);
      return [name, {
        elevation: trace.elevation,
        layers: trace.layers.filter((layer) => !layer.role.startsWith('surface.')).map((layer) => ({
          role: layer.role,
          contourLevel: layer.contourLevel,
          frameIndex: layer.frameIndex ?? null,
          blocksMovement: layer.blocksMovement,
          blocksLight: layer.blocksLight,
        })),
      }];
    }));
    const golden = JSON.parse(goldenText) as unknown;
    expect(plans).toEqual(golden);
  });
});
