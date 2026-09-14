import type { StudioCanvasToolBuilder } from './canvas-tool.js';

export type StudioCanvasToolLoader = () => Promise<StudioCanvasToolBuilder>;

export class StudioCanvasToolRegistry {
  readonly #loaders = new Map<string, StudioCanvasToolLoader>();
  readonly #builders = new Map<string, StudioCanvasToolBuilder>();
  readonly #pending = new Map<string, Promise<StudioCanvasToolBuilder | null>>();

  register(toolId: string, loader: StudioCanvasToolLoader): () => void {
    if (!/^[a-z][a-z0-9-]*$/u.test(toolId)) throw new Error(`studio_canvas_tool_id_invalid:${toolId}`);
    if (this.#loaders.has(toolId)) throw new Error(`studio_canvas_tool_duplicate:${toolId}`);
    this.#loaders.set(toolId, loader);
    return () => {
      this.#loaders.delete(toolId);
      this.#builders.delete(toolId);
      this.#pending.delete(toolId);
    };
  }

  builder(toolId: string): StudioCanvasToolBuilder | null {
    return this.#builders.get(toolId) ?? null;
  }

  load(toolId: string): Promise<StudioCanvasToolBuilder | null> {
    const current = this.#builders.get(toolId);
    if (current !== undefined) return Promise.resolve(current);
    const pending = this.#pending.get(toolId);
    if (pending !== undefined) return pending;
    const loader = this.#loaders.get(toolId);
    if (loader === undefined) return Promise.resolve(null);
    const request = loader().then((builder) => {
      if (typeof builder !== 'function') throw new Error(`studio_canvas_tool_builder_invalid:${toolId}`);
      this.#builders.set(toolId, builder);
      this.#pending.delete(toolId);
      return builder;
    }).catch((error: unknown) => {
      this.#pending.delete(toolId);
      throw error;
    });
    this.#pending.set(toolId, request);
    return request;
  }
}

export const defaultStudioCanvasToolRegistry = new StudioCanvasToolRegistry();

export function registerStudioCanvasTool(toolId: string, loader: StudioCanvasToolLoader): () => void {
  return defaultStudioCanvasToolRegistry.register(toolId, loader);
}
