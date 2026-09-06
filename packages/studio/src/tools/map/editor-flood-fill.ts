import {
  resolvedMapCellAt,
  terrainDocumentForMapV3,
  type MapDocumentV3,
  type MapPoint,
} from '@orchard/sim';

export const MAP_EDITOR_FLOOD_FILL_BATCH_SIZE = 2_048;

export interface MapEditorFloodFillProgress {
  readonly inspected: number;
  readonly matched: number;
  readonly yields: number;
}

export interface MapEditorFloodFillTask {
  readonly result: Promise<readonly MapPoint[] | null>;
  cancel(): void;
  progress(): MapEditorFloodFillProgress;
}

export interface MapEditorFloodFillOptions {
  readonly batchSize?: number;
  readonly yieldControl?: () => Promise<void>;
}

function yieldTask(): Promise<void> {
  if (typeof MessageChannel === 'undefined') {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
  });
}

/** Finds one four-connected resolved-surface region without monopolizing the
 * main thread. Results remain private until complete, so cancellation can
 * never expose a partial terrain command. */
export function startMapEditorSurfaceFloodFill(
  document: MapDocumentV3,
  start: MapPoint,
  options: MapEditorFloodFillOptions = {},
): MapEditorFloodFillTask {
  let cancelled = false;
  let inspected = 0;
  let yields = 0;
  const matched: MapPoint[] = [];
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? MAP_EDITOR_FLOOD_FILL_BATCH_SIZE));
  const yieldControl = options.yieldControl ?? yieldTask;

  const result = (async (): Promise<readonly MapPoint[] | null> => {
    if (start.tileX < 0 || start.tileY < 0
      || start.tileX >= document.width || start.tileY >= document.height) return Object.freeze([]);
    const terrain = terrainDocumentForMapV3(document);
    const source = resolvedMapCellAt(terrain, start.tileX, start.tileY).surface;
    const length = document.width * document.height;
    const visited = new Uint8Array(length);
    const queue = new Int32Array(length);
    let read = 0;
    let written = 1;
    const first = start.tileY * document.width + start.tileX;
    queue[0] = first;
    visited[first] = 1;

    while (read < written) {
      const batchEnd = read + batchSize;
      while (read < written && read < batchEnd) {
        const offset = queue[read]!;
        read += 1;
        inspected += 1;
        const tileX = offset % document.width;
        const tileY = Math.floor(offset / document.width);
        if (resolvedMapCellAt(terrain, tileX, tileY).surface !== source) continue;
        matched.push({ tileX, tileY });
        const enqueue = (candidate: number): void => {
          if (visited[candidate] === 1) return;
          visited[candidate] = 1;
          queue[written] = candidate;
          written += 1;
        };
        if (tileY > 0) enqueue(offset - document.width);
        if (tileX + 1 < document.width) enqueue(offset + 1);
        if (tileY + 1 < document.height) enqueue(offset + document.width);
        if (tileX > 0) enqueue(offset - 1);
      }
      if (cancelled) return null;
      if (read < written) {
        yields += 1;
        await yieldControl();
        if (cancelled) return null;
      }
    }
    return Object.freeze(matched);
  })();

  return Object.freeze({
    result,
    cancel: () => { cancelled = true; },
    progress: () => Object.freeze({ inspected, matched: matched.length, yields }),
  });
}
