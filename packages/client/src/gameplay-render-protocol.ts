import { ProtocolWorkloadBuffer } from './render-protocol-workload.js';
import { installProtocolWorkloadProbe } from './render-protocol-workload-probe.js';
import type { createGameplayProtocolWorkload, GameplayProtocolWorkload } from './gameplay-protocol-workload.js';
import { installProtocolAssetRequests } from './render-protocol-asset-requests.js';
import { ProtocolSkySteps } from './render-protocol-sky-steps.js';
import { waitForProtocolRestore } from './render-protocol-restore.js';
import type { gameplayProtocolLighting } from './gameplay-protocol-lighting.js';
import { atlasPageDiagnostics, type HudDisplayCacheDiagnostics } from '@orchard/ui';
import type { RenderMetrics } from '@orchard/engine/metrics';
import { RenderProtocolBuffer, protocolDistribution } from '@orchard/engine/render-protocol-buffer';
import { startRenderProtocolWalk } from './render-protocol-walk.js';
import { installRenderCanvasProbe } from './render-canvas-probe.js';

export type ProtocolMode = 'basic' | 'classic' | 'dynamic';
export interface GameplayDiagnosticState {
  readonly display: { readonly dpr: number; readonly cssWidth: number;
    readonly cssHeight: number; readonly worldZoom: number; readonly uiScale: number;
    readonly worldScale: '1x' | '2x' | 'native'; readonly backend: 'canvas2d' | 'webgl2';
    readonly worldPassFallbackReason: string | null;
    readonly presentationCap: 'off' | '30hz'; readonly hudCache?: HudDisplayCacheDiagnostics };
  readonly lighting: { readonly requestedQuality: 'basic' | 'dynamic';
    readonly effectiveQuality: 'basic' | 'dynamic'; readonly model: 'classic' | 'unified';
    readonly fallbackReason: string | null; readonly retainedSurfaceBytes: number };
  readonly world: { readonly residentGroundChunks: number; readonly spaceId: number };
}
export interface ProtocolGameplay {
  readonly prepareProtocolWorkload?: ReturnType<typeof createGameplayProtocolWorkload>;
  readonly protocolLighting?: ReturnType<typeof gameplayProtocolLighting>;
  diagnostics(): GameplayDiagnosticState;
  snapshot(): { readonly connected: boolean; readonly clock: unknown; readonly environment: unknown };
  setLightingQuality(quality: 'basic' | 'dynamic'): void;
  setLightingModel(model: 'classic' | 'unified'): void;
}
export interface ProtocolOptions {
  readonly mode: ProtocolMode;
  readonly commit: string;
  readonly device: string;
  readonly scenario: string;
  readonly signal?: AbortSignal;
  readonly walking?: boolean;
  readonly workload?: GameplayProtocolWorkload;
  readonly assetRequestLog?: ReturnType<typeof installProtocolAssetRequests>;
}
function ready(game: ProtocolGameplay, mode: ProtocolMode): boolean {
  const world = game.snapshot(), state = game.diagnostics();
  return world.connected && world.clock != null && world.environment != null
    && state.world.residentGroundChunks > 0 && state.lighting.fallbackReason === null
    && state.lighting.effectiveQuality === (mode === 'basic' ? 'basic' : 'dynamic')
    && (mode === 'basic' || state.lighting.model === (mode === 'classic' ? 'classic' : 'unified'));
}

/** HUD reuse counters are evidence, not a viewport/policy change. */
export function sameProtocolDisplay(before: GameplayDiagnosticState['display'] | undefined,
  after: GameplayDiagnosticState['display']): boolean {
  return before !== undefined && JSON.stringify({ ...before, hudCache: undefined }) === JSON.stringify({ ...after, hudCache: undefined });
}

/** Active rAF protocol. Hidden tabs, loading frames, changes of viewport/mode,
 * and buffer overflow invalidate the sample; elapsed wall time is never used
 * as a substitute for an active frame. The owner supplies device identity. */
export async function captureGameplayProtocol(metrics: RenderMetrics, game: ProtocolGameplay, options: ProtocolOptions) {
  if (!options.commit || !options.device || !options.scenario) throw new Error('render_protocol_metadata_required');
  if (document.visibilityState !== 'visible') throw new Error('render_protocol_tab_hidden');
  const initial = game.diagnostics();
  const buffer = new RenderProtocolBuffer();
  const skySteps = new ProtocolSkySteps();
  const workload = options.workload ? new ProtocolWorkloadBuffer(options.workload.identity) : null;
  let workloadProbe: ReturnType<typeof installProtocolWorkloadProbe> | null = null;
  const assetRequests = options.assetRequestLog ?? installProtocolAssetRequests(() => game.protocolLighting ?? game.diagnostics().lighting);
  const assetRequestScope = { startedAt: performance.now(), restoreStartedAt: null as number | null,
    endedAt: null as number | null, restorationSettled: false,
    note: 'Image.src assignment after request queue admission, including preparation and restoration; effective quality is recorded independently of requested quality' };
  const longTasks: number[] = [];
  const gpuTimes: number[] = [];
  let gpuGeneration = -1, gpuSequence = 0, gpuSupported = false, gpuDisjointStart = 0, gpuDisjointEnd = 0;
  let sampleStart = Infinity, sampleEnd = Infinity;
  const longTasksSupported = typeof PerformanceObserver !== 'undefined'
    && PerformanceObserver.supportedEntryTypes.includes('longtask');
  const consume = (entries: readonly PerformanceEntry[]) => {
    for (const entry of entries) {
      if (entry.startTime >= sampleStart && entry.startTime < sampleEnd) longTasks.push(entry.duration);
    }
  };
  const observer = longTasksSupported ? new PerformanceObserver((list) => consume(list.getEntries())) : null;
  let disposeProbe = () => {};
  let stopWalking = () => {};
  let unsubscribe = () => {};
  let cancel = () => {};
  const startedAt = new Date().toISOString();
  const matched: { state?: GameplayDiagnosticState } = {};
  let result;
  let failed = false, failure: unknown;
  try {
    disposeProbe = installRenderCanvasProbe();
    options.workload?.begin();
    if (options.workload) workloadProbe = installProtocolWorkloadProbe(options.workload.source);
    game.setLightingModel(options.mode === 'classic' ? 'classic' : 'unified');
    game.setLightingQuality(options.mode === 'basic' ? 'basic' : 'dynamic');
    observer?.observe({ type: 'longtask' });
    await new Promise<void>((resolve, reject) => {
      let warmStart: number | null = null;
      // Wall timeout rejects a stalled capture; it never completes a sample.
      const timeout = setTimeout(() => reject(new Error('render_protocol_no_active_frames')), 90_000);
      cancel = () => { clearTimeout(timeout); };
      const abort = () => reject(new Error('render_protocol_aborted'));
      options.signal?.addEventListener('abort', abort, { once: true });
      const visibility = () => { if (document.visibilityState !== 'visible') reject(new Error('render_protocol_tab_hidden')); };
      document.addEventListener('visibilitychange', visibility);
      const priorCancel = cancel;
      cancel = () => { priorCancel(); options.signal?.removeEventListener('abort', abort); document.removeEventListener('visibilitychange', visibility); };
      unsubscribe = metrics.observeFrames((frame) => {
        try {
          if (options.signal?.aborted) throw new Error('render_protocol_aborted');
          if (document.visibilityState !== 'visible') throw new Error('render_protocol_tab_hidden');
          if (!Number.isFinite(frame.timestamp)) return;
          if (warmStart === null) {
            if (frame.renderItems === 0 || !ready(game, options.mode)) return;
            warmStart = frame.timestamp;
            if (options.walking !== false) stopWalking = startRenderProtocolWalk();
            matched.state = game.diagnostics();
            sampleStart = warmStart + 5_000; sampleEnd = sampleStart + 30_000;
          }
          if (frame.renderItems === 0) throw new Error('render_protocol_loading_frame');
          const telemetry = metrics.worldBackendTelemetry, gpu = telemetry.gpu;
          gpuSupported ||= gpu?.gpuTimingAvailable ?? false;
          if (gpu !== null) {
            if (telemetry.generation !== gpuGeneration) { gpuGeneration = telemetry.generation; gpuSequence = 0; }
            if (frame.timestamp < sampleStart) gpuDisjointStart = gpu.gpuDisjointSamples;
            gpuDisjointEnd = gpu.gpuDisjointSamples;
            if (gpu.gpuCompletedSamples > gpuSequence && gpu.gpuTimeMs !== null
              && frame.timestamp >= sampleStart && frame.timestamp < sampleEnd) gpuTimes.push(gpu.gpuTimeMs);
            gpuSequence = gpu.gpuCompletedSamples;
          }
          skySteps.observe(frame, game.protocolLighting?.skyRgbRevision ?? null,
            frame.timestamp >= sampleStart && frame.timestamp < sampleEnd);
          options.workload?.advance(frame.timestamp);
          if (frame.timestamp < sampleStart) return;
          if (frame.timestamp >= sampleEnd) { resolve(); return; }
          buffer.record(frame);
          if (workloadProbe !== null) workload?.record(workloadProbe.read(), frame.renderItems, frame.timestamp);
        } catch (error) { reject(error); }
      });
    });
    unsubscribe(); cancel();
    consume(observer?.takeRecords() ?? []);
    const final = game.diagnostics();
    if (!ready(game, options.mode) || !sameProtocolDisplay(matched.state?.display, final.display)
      || final.world.spaceId !== matched.state?.world.spaceId) throw new Error('render_protocol_scene_changed');
    if (buffer.count < 2) throw new Error('render_protocol_insufficient_frames');
    result = {
      schemaVersion: 2, startedAt, mode: options.mode, commit: options.commit,
      device: options.device, userAgent: navigator.userAgent, platform: navigator.platform,
      resolution: { width: screen.width, height: screen.height }, display: final.display,
      browserZoom: { visualViewportScale: visualViewport?.scale ?? 1,
        note: 'Browser UI zoom must be recorded by the driver; DPR alone cannot identify it.' },
      worldScale: final.display.worldScale, backend: final.display.backend, scenario: options.scenario,
      presentationCap: final.display.presentationCap,
      worldPassFallbackReason: final.display.worldPassFallbackReason,
      worldPass: metrics.worldBackendTelemetry,
      gpu: { supported: gpuSupported, samplesMs: gpuTimes, ...protocolDistribution(gpuTimes),
        disjointSamples: Math.max(0, gpuDisjointEnd - gpuDisjointStart),
        scope: 'nonblocking completed world-pass timer queries observed during the active sample; excludes Canvas final present and HUD; unavailable is not zero GPU time' },
      protocol: { warmupMs: 5_000, sampleMs: 30_000, activeRaf: true,
        walking: options.walking !== false, walkingPath: 'right/down/left/up, 625 ms per leg; authority collision applies',
        counterScope: 'whole-client Canvas 2D from first rAF after prior submission through current submission, including skipped-rAF work, HUD and offscreen construction; earlier async work and WebGL submissions excluded; GPU batch/resource counts are separate worldPass diagnostics',
        tintReuses: 'exact tinted-frame cache hits; surface recycling reported separately' },
      workload: workload?.report() ?? { qualified: false, issues: ['workload_witness_unavailable'] },
      densityEvidence: options.workload?.densityEvidence ?? null,
      skySteps: { supported: game.protocolLighting !== undefined, ...skySteps.report() },
      assetRequests: options.assetRequestLog ? undefined : assetRequests.requests, assetRequestScope,
      before: matched.state, after: final, assets: atlasPageDiagnostics(), ...buffer.report(),
      longTasks: { supported: longTasksSupported, atLeast50Ms: longTasks.filter((value) => value >= 50).length,
        ...protocolDistribution(longTasks) },
    };
  } catch (error) { failed = true; failure = error; } finally {
    unsubscribe(); cancel(); observer?.disconnect(); disposeProbe(); stopWalking(); workloadProbe?.dispose();
    try {
      assetRequestScope.restoreStartedAt = performance.now();
      game.setLightingModel(initial.lighting.model);
      game.setLightingQuality(initial.lighting.requestedQuality);
      await waitForProtocolRestore(metrics, game);
      assetRequestScope.restorationSettled = true;
    } catch (error) {
      if (!failed) { failed = true; failure = error; }
    } finally {
      assetRequestScope.endedAt = performance.now();
      if (!options.assetRequestLog) assetRequests.dispose();
    }
  }
  if (failed) throw failure;
  if (assetRequests.overflow) throw new Error('render_protocol_asset_requests_overflow');
  return result!;
}
