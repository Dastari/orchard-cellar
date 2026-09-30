import type { LiveMapPublicationInput, LiveMapPublicationPhase, MaterializedLiveMapPublication } from './publication.js';

type WorkerMessage =
  | { readonly kind: 'phase'; readonly phase: LiveMapPublicationPhase }
  | { readonly kind: 'done'; readonly publication: MaterializedLiveMapPublication }
  | { readonly kind: 'error'; readonly message: string };

/** Runs `materializeLiveMapPublication` in a dedicated worker, terminated when it answers. */
export function materializeLiveMapPublicationInWorker(input: LiveMapPublicationInput,
  onPhase: (phase: LiveMapPublicationPhase) => void): Promise<MaterializedLiveMapPublication> {
  const worker = new Worker(new URL('./publication.worker.ts', import.meta.url), { type: 'module', name: 'studio-chunk-publication' });
  return new Promise<MaterializedLiveMapPublication>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.kind === 'phase') { onPhase(message.phase); return; }
      worker.terminate();
      if (message.kind === 'done') resolve(message.publication);
      else reject(new Error(message.message));
    };
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message || 'chunk_publication_worker_failed')); };
    worker.postMessage(input);
  });
}
