import { installProtocolAssetRequests } from './render-protocol-asset-requests.js';
import { compareProtocolWorkloads } from './render-protocol-workload.js';
import { waitForProtocolRestore } from './render-protocol-restore.js';
import { renderProtocolAction } from '@orchard/ui';
import type { RenderMetrics } from '@orchard/engine/metrics';
import { captureGameplayProtocol, type ProtocolGameplay, type ProtocolOptions } from './gameplay-render-protocol.js';

interface ProtocolWindow extends Window {
  __orchardOverworld?: ProtocolGameplay;
  __orchardRenderProtocol?: {
    run(options?: Partial<ProtocolOptions>): Promise<unknown>;
    result: unknown;
    error: string | null;
  };
}
/** The developer Render panel is available to touch clients as well as desktop.
 * ClipboardItem receives the pending Blob while the user gesture is active,
 * which supports Safari's asynchronous clipboard permission model. */
export function installGameplayProtocol(metrics: RenderMetrics): void {
  const target = window as ProtocolWindow;
  let busy = false;
  let lastJson: string | null = null;
  const api = {
    result: null as unknown,
    error: null as string | null,
    async run(overrides: Partial<ProtocolOptions> = {}): Promise<unknown> {
      if (busy) throw new Error('render_protocol_already_running');
      const game = target.__orchardOverworld;
      if (game === undefined) throw new Error('render_protocol_gameplay_unavailable');
      busy = true; api.error = null; api.result = null; lastJson = null;
      let assetRequestLog: ReturnType<typeof installProtocolAssetRequests> | undefined;
      let workload: Awaited<ReturnType<NonNullable<ProtocolGameplay['prepareProtocolWorkload']>>> | undefined;
      let failed = false, failure: unknown;
      try {
        assetRequestLog = installProtocolAssetRequests(() => game.protocolLighting ?? game.diagnostics().lighting);
        workload = overrides.workload ?? await game.prepareProtocolWorkload?.(metrics, game);
        const results = [];
        const modes = overrides.mode ? [overrides.mode] : ['basic', 'classic', 'dynamic'] as const;
        for (const mode of modes) {
          renderProtocolAction.label = `CAPTURING ${mode.toUpperCase()}`;
          results.push(await captureGameplayProtocol(metrics, game, {
            mode, commit: import.meta.env['VITE_RENDER_COMMIT'] ?? '',
            device: navigator.userAgent, scenario: 'perf59-season-matched-sunset-walking-v1',
            workload, ...overrides, assetRequestLog,
          }));
        }
        const comparisons = [];
        for (let i = 1; i < results.length; i++) {
          const before = results[0]!, after = results[i]!;
          comparisons.push({ left: before.mode, right: after.mode,
            ...('identity' in before.workload && 'identity' in after.workload
              ? compareProtocolWorkloads(before.workload, after.workload)
              : { comparable: false, issues: ['workload_witness_unavailable'] }) });
        }
        api.result = { captures: results, comparisons, assetRequests: assetRequestLog.requests };
      } catch (error) { failed = true; failure = error; } finally {
        try {
          if (workload && workload !== overrides.workload) {
            workload.dispose(); await waitForProtocolRestore(metrics, game);
          }
        } catch (error) { if (!failed) { failed = true; failure = error; } }
        assetRequestLog?.dispose(); busy = false;
      }
      if (failed || assetRequestLog?.overflow) {
        api.error = failed ? failure instanceof Error ? failure.message : String(failure) : 'render_protocol_asset_requests_overflow';
        api.result = null; renderProtocolAction.label = 'CAPTURE FAILED — RETRY';
        throw new Error(api.error);
      }
      lastJson = JSON.stringify(api.result, null, 2);
      return api.result;
    },
  };
  target.__orchardRenderProtocol = api;
  renderProtocolAction.run = () => {
    if (busy) return;
    if (lastJson !== null) {
      void navigator.clipboard.writeText(lastJson).then(() => {
        renderProtocolAction.label = 'COPIED — RUN AGAIN'; lastJson = null;
      }).catch(() => { renderProtocolAction.label = 'COPY JSON AGAIN'; });
      return;
    }
    const pending = api.run();
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const blob = pending.then((result) => new Blob([JSON.stringify(result, null, 2)], { type: 'text/plain' }));
      void navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]).then(() => {
        renderProtocolAction.label = 'COPIED — RUN AGAIN'; lastJson = null;
      }).catch(() => {
        if (api.error === null) renderProtocolAction.label = 'COPY CAPTURE JSON';
      });
    }
    void pending.then(() => {
      if (lastJson !== null) renderProtocolAction.label = 'COPY CAPTURE JSON';
    }).catch(() => {});
  };
}
