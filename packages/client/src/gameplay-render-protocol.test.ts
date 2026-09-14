import { afterEach, expect, it, vi } from 'vitest';
import { RenderMetrics } from '@orchard/engine/metrics';
import { captureGameplayProtocol, type GameplayDiagnosticState, type ProtocolGameplay } from './gameplay-render-protocol.js';

vi.mock('./render-canvas-probe.js', () => ({ installRenderCanvasProbe: () => () => {} }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('captures sky bursts separately and keeps effective-quality attribution through frame-boundary restoration', async () => {
  vi.useFakeTimers();
  class Image { value = ''; get src() { return this.value; } set src(value: string) { this.value = value; } }
  vi.stubGlobal('HTMLImageElement', Image);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('navigator', { userAgent: 'unit test', platform: 'unit test' });
  vi.stubGlobal('screen', { width: 1280, height: 720 });
  vi.stubGlobal('visualViewport', null);
  vi.stubGlobal('PerformanceObserver', undefined);
  const metrics = new RenderMetrics();
  const lighting = { requestedQuality: 'basic' as 'basic' | 'dynamic', effectiveQuality: 'basic' as 'basic' | 'dynamic',
    model: 'unified' as 'unified' | 'classic', fallbackReason: null as string | null, skyRgbRevision: 1 };
  const display: GameplayDiagnosticState['display'] = { dpr: 1, cssWidth: 1280, cssHeight: 720,
    worldZoom: 2, uiScale: 2, worldScale: '1x', backend: 'canvas2d', presentationCap: 'off', worldPassFallbackReason: null };
  const game: ProtocolGameplay = {
    protocolLighting: lighting,
    diagnostics: () => ({ display, lighting: { ...lighting, retainedSurfaceBytes: 0 },
      world: { residentGroundChunks: 4, spaceId: 1 } }),
    snapshot: () => ({ connected: true, clock: {}, environment: {} }),
    setLightingModel(model) { lighting.model = model; },
    setLightingQuality(quality) {
      lighting.requestedQuality = quality;
      lighting.fallbackReason = 'preparing';
      new Image().src = `/generated/atlas_trees_p000_summer${quality === 'dynamic' ? '.omit' : ''}.png`;
    },
  };
  const submit = (time: number, duration: number) => {
    metrics.recordRafTimestamp(time); metrics.recordStage('lightingReceiver', duration); metrics.record(duration, 300);
  };
  const pending = captureGameplayProtocol(metrics, game, { mode: 'dynamic', commit: 'unit-test',
    device: 'unit test', scenario: 'unit test', walking: false });
  lighting.effectiveQuality = 'dynamic'; lighting.fallbackReason = null;
  submit(0, 1); submit(5_000, 1);
  lighting.skyRgbRevision++; submit(5_016, 12); submit(5_032, 2); submit(35_000, 1);
  await Promise.resolve();
  expect(lighting.requestedQuality).toBe('basic');
  // Requested Basic still presents Dynamic until its next publication frame.
  lighting.effectiveQuality = 'basic'; lighting.fallbackReason = null; submit(35_016, 1);
  const result = await pending;
  expect(result.frameCount).toBe(3);
  expect(result.skySteps.firstFrame.frame).toMatchObject({ count: 1, p95: 12 });
  expect(result.assetRequests!.map(({ effectiveQuality, requestedQuality }) => [effectiveQuality, requestedQuality]))
    .toEqual([['basic', 'dynamic'], ['dynamic', 'basic']]);
  expect(result.assetRequestScope.restorationSettled).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
