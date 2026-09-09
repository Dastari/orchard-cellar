import type { RenderMetricsSnapshot } from '@orchard/engine/metrics';
import { renderMetricsSnapshot } from './gameplay-render-diagnostics.js';
import { worldBackendReason, wrapBackendReason } from '@orchard/ui';

/** Do not sort all diagnostic distributions on every frame while F3 is open. */
export function createDebugMetricsReader(read: () => RenderMetricsSnapshot,
  now: () => number = () => performance.now()): () => RenderMetricsSnapshot {
  let cached: RenderMetricsSnapshot | undefined;
  let sampledAt = -Infinity;
  return () => {
    const timestamp = now();
    if (cached === undefined || timestamp - sampledAt >= 250 || timestamp < sampledAt) {
      cached = read(); sampledAt = timestamp;
    }
    return cached;
  };
}
export const debugMetricsSnapshot = createDebugMetricsReader(renderMetricsSnapshot);

export function frameTimingRows(metrics: RenderMetricsSnapshot): readonly string[] {
  const { presentation } = metrics;
  const fps = presentation.sampleCount > 0 ? presentation.fps.toFixed(1) : '--';
  return [
    `FPS ${fps} (1S)`,
    `FRAME GAP ${presentation.latestFrameMs.toFixed(1)}ms / ${presentation.worstFrameMs.toFixed(1)}ms MAX 5S`,
    `CPU ${metrics.averageFrameMs.toFixed(2)}ms AVG ${metrics.worstFrameMs.toFixed(2)}ms WORST`,
    `RENDERER ${metrics.worldPass.backend === 'webgl2' ? 'WEBGL2' : 'CANVAS'}${metrics.worldPass.fallbackReason === null ? '' : ' (WEBGL FALLBACK)'}`,
    ...(metrics.worldPass.fallbackReason === null ? []
      : wrapBackendReason(`WEBGL ERROR: ${worldBackendReason(metrics.worldPass.fallbackReason)}`, 56, (text) => text.length)),
  ];
}
