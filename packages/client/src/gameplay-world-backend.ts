import { EXPERIMENTAL_WEBGL_EVENT, readExperimentalWebGL, updateWorldBackendStatus } from '@orchard/ui';
import type { UnifiedRenderer } from '@orchard/engine/renderer';
import type { WorldPassBackend } from '@orchard/engine/world-pass-backend';
import { CanvasWorldPassBackend } from '@orchard/engine/world-pass-canvas';
import type { RenderMetrics, WorldGpuDiagnostics } from '@orchard/engine/metrics';

interface ExperimentalBackend extends WorldPassBackend {
  readonly diagnostics: WorldGpuDiagnostics & { readonly contextLost: boolean; readonly restoreFailure: string | null };
}
type BackendFactory = () => ExperimentalBackend;
type BackendLoader = () => Promise<BackendFactory>;
const loadBackend: BackendLoader = async () => {
  const { WebGLWorldPassBackend } = await import('@orchard/engine/webgl/world-pass-webgl');
  return () => new WebGLWorldPassBackend({ present: 'canvas-copy' });
};
let gameplayBackend: GameplayWorldBackend | undefined;

/** Persistence records the choice; failure latches Canvas for this session. */
export class GameplayWorldBackend {
  private requested = false;
  private generation = 0;
  private pending: BackendFactory | null = null;
  private active: ExperimentalBackend | null = null;
  private preparing = false;
  private reason: string | null = null;
  private disposed = false;
  private backendGeneration = 0;
  constructor(private readonly renderer: UnifiedRenderer, private readonly load: BackendLoader = loadBackend,
    private readonly canvas: () => WorldPassBackend = () => new CanvasWorldPassBackend(),
    private readonly metrics?: RenderMetrics) {
    renderer.beforeWorldFrame = this.begin;
    renderer.afterWorldFrame = () => this.publish();
    renderer.worldBackendFailure = (error) => this.fallback(error, true);
    window.addEventListener(EXPERIMENTAL_WEBGL_EVENT, this.changed);
    window.addEventListener('storage', this.storageChanged);
    this.request(readExperimentalWebGL());
  }
  get fallbackReason(): string | null { return this.reason; }
  request(value: boolean): void {
    if (this.disposed || (this.requested === value && (this.preparing || this.active !== null))) return;
    this.requested = value; const generation = ++this.generation;
    this.pending = null; this.preparing = false;
    if (value && this.reason === null && this.active === null) {
      this.preparing = true;
      void this.load().then((factory) => {
        if (this.disposed || generation !== this.generation) return;
        this.pending = factory;
      }).catch((error: unknown) => {
        if (!this.disposed && generation === this.generation) this.fail(error);
      });
    }
    this.publish();
  }
  /** Retrying the complete frame also covers failures raised by direct painter
   * callbacks against the experimental Canvas compatibility context. */
  fallback(error: unknown, backendOperation = false): boolean {
    if (this.renderer.worldPassBackend !== 'webgl2' || (!backendOperation && !this.renderer.worldPassInProgress)) return false;
    this.fail(error); return true;
  }
  private fail(error: unknown): void {
    this.reason ??= error instanceof Error ? error.message : String(error);
    this.generation++; this.pending = null; this.preparing = false;
    if (this.renderer.worldPassBackend !== 'canvas2d') this.renderer.replaceWorldBackend(this.canvas());
    this.active = null; this.publish();
  }
  private readonly begin = (): void => {
    if (this.disposed) return;
    if (!this.requested && this.active !== null) {
      const cleanupFailure = this.renderer.replaceWorldBackend(this.canvas()); this.active = null;
      if (cleanupFailure !== undefined) { this.fail(cleanupFailure); return; }
    }
    if (this.active?.diagnostics.contextLost) {
      // The next frame boundary is the restoration deadline. A restored
      // backend may continue; a still-lost one cannot submit a complete frame.
      this.fail(new Error('webgl_context_lost')); return;
    }
    if (this.active?.diagnostics.restoreFailure) {
      this.fail(new Error(this.active.diagnostics.restoreFailure)); return;
    }
    const factory = this.pending;
    if (factory !== null && this.requested && this.reason === null) {
      this.pending = null;
      try {
        const candidate = factory();
        const cleanupFailure = this.renderer.replaceWorldBackend(candidate); this.active = candidate;
        this.backendGeneration++;
        if (cleanupFailure !== undefined) { this.fail(cleanupFailure); return; }
      } catch (error) { this.fail(error); return; }
      this.preparing = false;
    }
    this.publish();
  };
  private readonly changed = (event: Event): void => { this.request((event as CustomEvent<boolean>).detail); };
  private readonly storageChanged = (): void => { this.request(readExperimentalWebGL()); };
  private publish(): void {
    updateWorldBackendStatus(this.renderer.worldPassBackend, this.reason, this.preparing);
    this.metrics?.recordWorldBackend(this.renderer.worldPassBackend, this.reason, this.backendGeneration, this.active?.diagnostics ?? null);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.generation++; this.pending = null;
    window.removeEventListener(EXPERIMENTAL_WEBGL_EVENT, this.changed);
    window.removeEventListener('storage', this.storageChanged);
    this.renderer.beforeWorldFrame = undefined; this.renderer.afterWorldFrame = undefined; this.renderer.worldBackendFailure = undefined;
    if (gameplayBackend === this) gameplayBackend = undefined;
  }
}
export function installGameplayWorldBackend(renderer: UnifiedRenderer, metrics?: RenderMetrics): GameplayWorldBackend {
  gameplayBackend = new GameplayWorldBackend(renderer, undefined, undefined, metrics); return gameplayBackend;
}
export function fallbackGameplayWorldBackend(error: unknown): boolean { return gameplayBackend?.fallback(error) ?? false; }
