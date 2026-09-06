import {
  createEmptyMapDocument,
  createLiveIslandMapDocument,
  migrateMapDocumentV2,
} from '@orchard/sim';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAP_EDITOR_TERRAIN_LOADER_DISPOSED,
  MAP_EDITOR_TERRAIN_LOADER_SUPERSEDED,
  MapEditorTerrainLoader,
} from './editor-terrain-loader.js';
import { buildMapEditorTerrain } from './editor-terrain-build.js';
import { buildMapEditorTerrainDerivatives } from './editor-terrain-derivatives.js';
import {
  encodeMapEditorTerrain,
  encodeMapEditorTerrainDerivatives,
} from './editor-terrain-wire.js';

class FakeWorker {
  static instances: FakeWorker[] = [];
  readonly messages: unknown[] = [];
  readonly listeners = new Map<string, (event: { data: unknown; message?: string }) => void>();
  terminated = false;

  constructor() { FakeWorker.instances.push(this); }
  addEventListener(kind: string, listener: (event: { data: unknown; message?: string }) => void): void {
    this.listeners.set(kind, listener);
  }
  postMessage(message: unknown): void { this.messages.push(message); }
  terminate(): void { this.terminated = true; }
  reply(data: unknown): void { this.listeners.get('message')?.({ data }); }
}

describe('map editor terrain loader lifecycle', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('terminates its worker and rejects pending terrain when disposed', async () => {
    const loader = new MapEditorTerrainLoader();
    const pending = loader.load(createLiveIslandMapDocument())!;
    const rejected = expect(pending).rejects.toThrow(MAP_EDITOR_TERRAIN_LOADER_DISPOSED);

    loader.dispose();
    loader.dispose();

    await rejected;
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
    expect(loader.load(createLiveIslandMapDocument())).toBeNull();
  });

  it('does not terminate a newly mounted map loader with the departing loader', async () => {
    const first = new MapEditorTerrainLoader();
    const second = new MapEditorTerrainLoader();
    const firstPending = first.load(createLiveIslandMapDocument())!;
    const secondPending = second.load(createLiveIslandMapDocument())!;
    const firstRejected = expect(firstPending).rejects.toThrow(MAP_EDITOR_TERRAIN_LOADER_DISPOSED);

    first.dispose();

    await firstRejected;
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
    expect(FakeWorker.instances[1]?.terminated).toBe(false);
    const secondMessage = FakeWorker.instances[1]?.messages[0] as { requestId: number };
    FakeWorker.instances[1]?.reply({ requestId: secondMessage.requestId, error: 'second_worker_alive' });
    await expect(secondPending).rejects.toThrow('second_worker_alive');
    second.dispose();
  });

  it('terminates obsolete work before queueing the newest terrain identity', async () => {
    const loader = new MapEditorTerrainLoader();
    const first = loader.load(createLiveIslandMapDocument())!;
    const rejected = expect(first).rejects.toThrow(MAP_EDITOR_TERRAIN_LOADER_SUPERSEDED);

    const second = loader.load(createLiveIslandMapDocument())!;
    await rejected;

    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
    expect(FakeWorker.instances[1]?.terminated).toBe(false);
    const message = FakeWorker.instances[1]?.messages[0] as { requestId: number };
    FakeWorker.instances[1]?.reply({ requestId: message.requestId, error: 'latest_worker_alive' });
    await expect(second).rejects.toThrow('latest_worker_alive');
    loader.dispose();
  });

  it('adopts worker-derived overview, generated base, and influence with the terrain', async () => {
    const document = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'worker-load-result', title: 'Worker load result', width: 8, height: 8,
    }));
    const loader = new MapEditorTerrainLoader();
    const pending = loader.load(document)!;
    const message = FakeWorker.instances[0]?.messages[0] as { requestId: number };
    const terrain = buildMapEditorTerrain(document);
    const encodedTerrain = encodeMapEditorTerrain(terrain);
    const encodedDerivatives = encodeMapEditorTerrainDerivatives(
      buildMapEditorTerrainDerivatives(document, terrain),
      terrain,
    );
    FakeWorker.instances[0]?.reply({
      requestId: message.requestId,
      terrain: encodedTerrain.wire,
      derivatives: encodedDerivatives.wire,
    });

    const result = await pending;
    expect(result.derivatives.generatedBaseTerrain).toBe(result.terrain);
    expect(result.derivatives.overview.width).toBe(document.width);
    expect(result.derivatives.overview.layers.combined).toHaveLength(
      document.width * document.height * 4,
    );
    expect(result.derivatives.terrainOverrideInfluenceRuns).toEqual([]);
    loader.dispose();
  }, 20_000);

  it('fails closed when disposed after a worker reply but before chunked adoption', async () => {
    const document = migrateMapDocumentV2(createEmptyMapDocument({
      id: 'worker-dispose-during-decode', title: 'Dispose during decode', width: 8, height: 8,
    }));
    const loader = new MapEditorTerrainLoader();
    const pending = loader.load(document)!;
    const rejected = expect(pending).rejects.toThrow(MAP_EDITOR_TERRAIN_LOADER_DISPOSED);
    const message = FakeWorker.instances[0]?.messages[0] as { requestId: number };
    const terrain = buildMapEditorTerrain(document);
    FakeWorker.instances[0]?.reply({
      requestId: message.requestId,
      terrain: encodeMapEditorTerrain(terrain).wire,
      derivatives: encodeMapEditorTerrainDerivatives(
        buildMapEditorTerrainDerivatives(document, terrain),
        terrain,
      ).wire,
    });
    loader.dispose();

    await rejected;
    expect(FakeWorker.instances[0]?.terminated).toBe(true);
  });
});
