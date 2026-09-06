import type { MapDocumentV3, MapValidationIssue } from '@orchard/sim';
import type {
  MapEditorValidationWorkerRequest,
  MapEditorValidationWorkerResponse,
} from './editor-validation-worker.js';

export const MAP_EDITOR_VALIDATION_SUPERSEDED = 'studio_map_validation_superseded';

interface ValidationRequest {
  readonly requestId: number;
  readonly document: MapDocumentV3;
  readonly resolve: (issues: readonly MapValidationIssue[]) => void;
  readonly reject: (error: Error) => void;
}

let worker: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 1;
let active: ValidationRequest | null = null;
let queued: ValidationRequest | null = null;

function dispatch(request: ValidationRequest): void {
  active = request;
  const message: MapEditorValidationWorkerRequest = {
    requestId: request.requestId,
    document: request.document,
  };
  worker!.postMessage(message);
}

function dispatchQueued(): void {
  if (queued === null || worker === null) return;
  const request = queued;
  queued = null;
  dispatch(request);
}

function validationWorker(): Worker | null {
  if (workerUnavailable || typeof Worker === 'undefined') return null;
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./editor-validation-worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<MapEditorValidationWorkerResponse>) => {
      if (active === null || active.requestId !== event.data.requestId) return;
      const completed = active;
      active = null;
      if (event.data.issues !== undefined) completed.resolve(event.data.issues);
      else completed.reject(new Error(event.data.error ?? 'studio_map_validation_worker_failed'));
      dispatchQueued();
    });
    worker.addEventListener('error', (event) => {
      workerUnavailable = true;
      worker?.terminate();
      worker = null;
      active?.reject(new Error(event.message || 'studio_map_validation_worker_failed'));
      queued?.reject(new Error(event.message || 'studio_map_validation_worker_failed'));
      active = null;
      queued = null;
    });
    return worker;
  } catch {
    workerUnavailable = true;
    worker = null;
    return null;
  }
}

export function mapEditorValidationWorkerAvailable(): boolean {
  return !workerUnavailable && typeof Worker !== 'undefined';
}

/**
 * Keeps at most one active and one latest queued full-map validation. Brush
 * edits can arrive faster than an 832x832 validation; superseded queued work
 * is rejected before reaching the worker instead of building an unbounded CPU
 * backlog.
 */
export function loadMapEditorValidation(
  document: MapDocumentV3,
): Promise<readonly MapValidationIssue[]> | null {
  const target = validationWorker();
  if (target === null) return null;
  const requestId = nextRequestId;
  nextRequestId += 1;
  return new Promise((resolve, reject) => {
    const request = { requestId, document, resolve, reject };
    if (active === null) dispatch(request);
    else {
      queued?.reject(new Error(MAP_EDITOR_VALIDATION_SUPERSEDED));
      queued = request;
    }
  });
}
