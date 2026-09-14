/// <reference lib="webworker" />

import type { MapDocumentV3, TilesetContentDefinition } from '@orchard/sim';
import { buildMapEditorTerrain } from './editor-terrain-build.js';
import { buildMapEditorTerrainDerivatives } from './editor-terrain-derivatives.js';
import {
  encodeMapEditorTerrain,
  encodeMapEditorTerrainDerivatives,
  type MapEditorTerrainDerivativesWire,
  type MapEditorTerrainWire,
} from './editor-terrain-wire.js';
import {
  OFFLINE_TERRAIN_AUTHORING_PALETTE,
  liveTerrainAuthoringPalette,
} from './terrain-authoring-palette.js';

interface MapEditorTerrainWorkerRequest {
  readonly requestId: number;
  readonly document: MapDocumentV3;
  readonly tilesetDefinitions?: readonly TilesetContentDefinition[];
  readonly tilesetContentKey?: string;
}

export interface MapEditorTerrainWorkerResponse {
  readonly requestId: number;
  readonly terrain?: MapEditorTerrainWire;
  readonly derivatives?: MapEditorTerrainDerivativesWire;
  readonly error?: string;
}

self.addEventListener('message', (event: MessageEvent<MapEditorTerrainWorkerRequest>) => {
  const { requestId, document, tilesetDefinitions, tilesetContentKey } = event.data;
  try {
    const palette = tilesetDefinitions === undefined
      ? OFFLINE_TERRAIN_AUTHORING_PALETTE
      : liveTerrainAuthoringPalette(tilesetDefinitions, tilesetContentKey ?? 'worker');
    const terrain = buildMapEditorTerrain(document, palette);
    const encoded = encodeMapEditorTerrain(terrain);
    const derivatives = encodeMapEditorTerrainDerivatives(
      buildMapEditorTerrainDerivatives(document, terrain, palette),
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
