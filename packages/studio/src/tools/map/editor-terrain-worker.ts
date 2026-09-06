/// <reference lib="webworker" />

import type { MapDocumentV3 } from '@orchard/sim';
import { buildMapEditorTerrain } from './editor-terrain-build.js';
import { buildMapEditorTerrainDerivatives } from './editor-terrain-derivatives.js';
import {
  encodeMapEditorTerrain,
  encodeMapEditorTerrainDerivatives,
  type MapEditorTerrainDerivativesWire,
  type MapEditorTerrainWire,
} from './editor-terrain-wire.js';

interface MapEditorTerrainWorkerRequest {
  readonly requestId: number;
  readonly document: MapDocumentV3;
}

export interface MapEditorTerrainWorkerResponse {
  readonly requestId: number;
  readonly terrain?: MapEditorTerrainWire;
  readonly derivatives?: MapEditorTerrainDerivativesWire;
  readonly error?: string;
}

self.addEventListener('message', (event: MessageEvent<MapEditorTerrainWorkerRequest>) => {
  const { requestId, document } = event.data;
  try {
    const terrain = buildMapEditorTerrain(document);
    const encoded = encodeMapEditorTerrain(terrain);
    const derivatives = encodeMapEditorTerrainDerivatives(
      buildMapEditorTerrainDerivatives(document, terrain),
      terrain,
    );
    const response: MapEditorTerrainWorkerResponse = {
      requestId,
      terrain: encoded.wire,
      derivatives: derivatives.wire,
    };
    self.postMessage(response, [...encoded.transfer, ...derivatives.transfer]);
  } catch (error) {
    const response: MapEditorTerrainWorkerResponse = {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
});
