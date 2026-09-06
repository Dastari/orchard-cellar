import {
  applyMapDocumentV3Edit,
  createEmptyMapDocument,
  migrateMapDocumentV2,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  MAP_EDITOR_FLOOD_FILL_BATCH_SIZE,
  startMapEditorSurfaceFloodFill,
} from './editor-flood-fill.js';

function flatMap(width: number, height: number) {
  return migrateMapDocumentV2(createEmptyMapDocument({
    id: `flat-${width}x${height}`,
    title: 'Flat fill fixture',
    width,
    height,
    baseSurface: 'grass',
  }));
}

describe('incremental map surface flood fill', () => {
  it('preserves four-connected resolved-surface semantics deterministically', async () => {
    const source = flatMap(5, 4);
    const document = {
      ...source,
      cells: {
        ...source.cells,
        '2,0': { surface: 'sand' as const },
        '2,1': { surface: 'sand' as const },
        '2,2': { surface: 'sand' as const },
        '2,3': { surface: 'sand' as const },
      },
    };
    const task = startMapEditorSurfaceFloodFill(document, { tileX: 0, tileY: 0 }, {
      batchSize: 2,
      yieldControl: async () => undefined,
    });

    const canonical = applyMapDocumentV3Edit(document, {
      kind: 'terrain',
      command: { kind: 'fill_surface', start: { tileX: 0, tileY: 0 }, surface: 'water' },
    });

    expect(await task.result).toEqual(canonical.changed);
    expect(canonical.changed).toEqual([
      { tileX: 0, tileY: 0 }, { tileX: 1, tileY: 0 },
      { tileX: 0, tileY: 1 }, { tileX: 1, tileY: 1 },
      { tileX: 0, tileY: 2 }, { tileX: 1, tileY: 2 },
      { tileX: 0, tileY: 3 }, { tileX: 1, tileY: 3 },
    ]);
  });

  it('bounds and yields worst-case 832x832 work', async () => {
    const document = flatMap(832, 832);
    let yieldCount = 0;
    const task = startMapEditorSurfaceFloodFill(document, { tileX: 0, tileY: 0 }, {
      yieldControl: async () => { yieldCount += 1; },
    });
    const points = await task.result;

    expect(points).not.toBeNull();
    expect(points).toHaveLength(832 * 832);
    expect(task.progress()).toEqual({
      inspected: 832 * 832,
      matched: 832 * 832,
      yields: yieldCount,
    });
    expect(yieldCount).toBeGreaterThanOrEqual(
      Math.floor((832 * 832 - 1) / MAP_EDITOR_FLOOD_FILL_BATCH_SIZE),
    );
  }, 20_000);

  it('cancels at a yield boundary without returning partial points', async () => {
    const document = flatMap(832, 832);
    let yielded = false;
    let release = (): void => { throw new Error('expected flood-fill yield'); };
    const task = startMapEditorSurfaceFloodFill(document, { tileX: 0, tileY: 0 }, {
      yieldControl: () => new Promise((resolve) => {
        yielded = true;
        release = resolve;
      }),
    });

    expect(task.progress().inspected).toBeLessThanOrEqual(MAP_EDITOR_FLOOD_FILL_BATCH_SIZE);
    expect(task.progress().yields).toBe(1);
    expect(yielded).toBe(true);
    task.cancel();
    release();
    expect(await task.result).toBeNull();
    expect(task.progress().matched).toBeLessThan(832 * 832);
  });
});
