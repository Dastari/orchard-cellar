/// <reference lib="webworker" />

import { terrainDocumentForMapV3, validateMapDocument,
  type MapDocumentV3, type MapValidationIssue } from '@orchard/sim';

export interface MapEditorValidationWorkerRequest {
  readonly requestId: number;
  readonly document: MapDocumentV3;
}

export interface MapEditorValidationWorkerResponse {
  readonly requestId: number;
  readonly issues?: readonly MapValidationIssue[];
  readonly error?: string;
}

self.addEventListener('message', (event: MessageEvent<MapEditorValidationWorkerRequest>) => {
  const { requestId, document } = event.data;
  try {
    const response: MapEditorValidationWorkerResponse = {
      requestId,
      issues: validateMapDocument(terrainDocumentForMapV3(document)),
    };
    self.postMessage(response);
  } catch (error) {
    const response: MapEditorValidationWorkerResponse = {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
});
