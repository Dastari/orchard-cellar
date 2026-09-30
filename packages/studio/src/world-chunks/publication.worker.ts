/// <reference lib="webworker" />
/**
 * Materialises a Studio chunk publication off the main thread (tens of seconds and about a gigabyte
 * for the whole island). One request per worker; the blobs are transferred back.
 */
import type { LiveMapPublicationInput } from './publication.js';
import { materializeLiveMapPublication } from './publication-materialize.js';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<LiveMapPublicationInput>) => {
  try {
    const publication = materializeLiveMapPublication(event.data, phase => self.postMessage({ kind: 'phase', phase }));
    self.postMessage({ kind: 'done', publication }, publication.blobs.map(blob => blob.bytes.buffer as ArrayBuffer));
  } catch (error) {
    self.postMessage({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
