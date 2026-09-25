/** @deprecated Static world S4a renamed this module to chunk-runtime-controller.ts; kept for open branches. */
import { ChunkRuntimeController, type ChunkRuntimeControllerOptions } from './chunk-runtime-controller.js';
export { chunkRuntimeQueries as chunkShadowQueries, type ChunkRuntimeSource as ChunkShadowSource } from './chunk-runtime-controller.js';

/** A diagnostics-only controller: the pre-S4a behaviour under its old name. */
export class ChunkShadowController extends ChunkRuntimeController {
  constructor(options: Omit<ChunkRuntimeControllerOptions, 'buildMode'> = {}) {
    super({ ...options, buildMode: 'shadow' });
  }
}
