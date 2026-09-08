import type { RenderMetricsSnapshot } from '@orchard/engine/metrics';
import { renderMetricsSnapshot } from './gameplay-render-diagnostics.js';

/** F3 timing presentation, mechanically extracted before changing its metrics. */
export function debugMetricsSnapshot(): RenderMetricsSnapshot {
  return renderMetricsSnapshot();
}

export function frameTimingRows(metrics: RenderMetricsSnapshot): readonly string[] {
  return [`FRAME ${metrics.averageFrameMs.toFixed(2)} AVG ${metrics.worstFrameMs.toFixed(2)} WORST`];
}
