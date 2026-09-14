import type { MapDocumentV3 } from '@orchard/sim';
import type { TerrainArray } from '@orchard/engine/terrain';
import type { MapEditorTerrainWorkerResponse } from './editor-terrain-worker.js';
import type { MapEditorTerrainDerivatives } from './editor-terrain-derivatives.js';
import {
  decodeMapEditorTerrainAsync,
  decodeMapEditorTerrainDerivativesAsync,
} from './editor-terrain-wire.js';
import {
  OFFLINE_TERRAIN_AUTHORING_PALETTE,
  type TerrainAuthoringPalette,
} from './terrain-authoring-palette.js';

export const MAP_EDITOR_TERRAIN_LOADER_DISPOSED = 'studio_map_terrain_loader_disposed';
export const MAP_EDITOR_TERRAIN_LOADER_SUPERSEDED = 'studio_map_terrain_loader_superseded';

interface PendingTerrainRequest {
  readonly resolve: (result: MapEditorTerrainLoadResult) => void;
  readonly reject: (error: Error) => void;
  readonly palette: TerrainAuthoringPalette;
}

export interface MapEditorTerrainLoadResult {
  readonly terrain: TerrainArray;
  readonly derivatives: MapEditorTerrainDerivatives;
}

/** One worker belongs to one retained map renderer. This makes route teardown
 * deterministic and prevents a departing map screen from terminating work
 * started by a newly mounted map. */
export class MapEditorTerrainLoader {
  #worker: Worker | null = null;
  #workerUnavailable = false;
  #nextRequestId = 1;
  #disposed = false;
  readonly #pending = new Map<number, PendingTerrainRequest>();

  /** Returns null only where module workers are unavailable; callers retain a
   * deferred compatibility path for tests and non-browser render hosts. */
  load(
    document: MapDocumentV3,
    palette: TerrainAuthoringPalette = OFFLINE_TERRAIN_AUTHORING_PALETTE,
  ): Promise<MapEditorTerrainLoadResult> | null {
    // A worker cannot interrupt a synchronous terrain compilation once it has
    // started. Replacing it is the only reliable way to prevent rapid brush
    // edits from queueing obsolete full-map jobs ahead of the current map.
    if (this.#pending.size > 0) {
      this.#worker?.terminate();
      this.#worker = null;
      this.rejectPending(MAP_EDITOR_TERRAIN_LOADER_SUPERSEDED);
    }
    const activeWorker = this.worker();
    if (activeWorker === null) return null;
    const requestId = this.#nextRequestId;
    this.#nextRequestId += 1;
    return new Promise<MapEditorTerrainLoadResult>((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject, palette });
      activeWorker.postMessage({ requestId, document,
        ...(palette.mode === 'live' ? {
          tilesetDefinitions: palette.definitions,
          tilesetContentKey: palette.contentKey,
        } : {}) });
    });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#worker?.terminate();
    this.#worker = null;
    this.rejectPending(MAP_EDITOR_TERRAIN_LOADER_DISPOSED);
  }

  private rejectPending(message: string): void {
    for (const request of this.#pending.values()) request.reject(new Error(message));
    this.#pending.clear();
  }

  private worker(): Worker | null {
    if (this.#disposed || this.#workerUnavailable || typeof Worker === 'undefined') return null;
    if (this.#worker !== null) return this.#worker;
    try {
      this.#worker = new Worker(new URL('./editor-terrain-worker.ts', import.meta.url), { type: 'module' });
      this.#worker.addEventListener('message', (event: MessageEvent<MapEditorTerrainWorkerResponse>) => {
        const request = this.#pending.get(event.data.requestId);
        if (request === undefined) return;
        if (event.data.terrain === undefined || event.data.derivatives === undefined) {
          this.#pending.delete(event.data.requestId);
          request.reject(new Error(event.data.error ?? 'studio_map_terrain_worker_failed'));
          return;
        }
        const shouldContinue = (): boolean => !this.#disposed
          && this.#pending.get(event.data.requestId) === request;
        void decodeMapEditorTerrainAsync(event.data.terrain, shouldContinue).then(async (decodedTerrain) => {
          const terrain = request.palette.mode === 'live'
            ? { ...decodedTerrain, tilesets: request.palette.resolver } : decodedTerrain;
          const decodedDerivatives = await decodeMapEditorTerrainDerivativesAsync(
            event.data.derivatives!,
            terrain,
            shouldContinue,
          );
          const derivatives = request.palette.mode === 'live'
            ? { ...decodedDerivatives, generatedBaseTerrain: {
              ...decodedDerivatives.generatedBaseTerrain,
              tilesets: request.palette.resolver,
            } } : decodedDerivatives;
          return { terrain, derivatives };
        }).then((result) => {
          if (this.#pending.get(event.data.requestId) !== request) return;
          this.#pending.delete(event.data.requestId);
          request.resolve(result);
        }, (error: unknown) => {
          if (this.#pending.get(event.data.requestId) !== request) return;
          this.#pending.delete(event.data.requestId);
          request.reject(error instanceof Error ? error : new Error(String(error)));
        });
      });
      this.#worker.addEventListener('error', (event) => {
        this.#workerUnavailable = true;
        this.#worker?.terminate();
        this.#worker = null;
        this.rejectPending(event.message || 'studio_map_terrain_worker_failed');
      });
      return this.#worker;
    } catch {
      this.#workerUnavailable = true;
      this.#worker = null;
      return null;
    }
  }
}
