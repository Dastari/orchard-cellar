import { RenderMetrics } from '@orchard/engine/metrics';

/** Gameplay telemetry state, extracted without changing collection or presentation. */
export const renderMetrics = new RenderMetrics();
export const renderDiagnostics = { enabled: false };
export const renderMetricsSnapshot = () => renderMetrics.snapshot();
