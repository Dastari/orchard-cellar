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
      try {
        const results = [];
        const modes = overrides.mode ? [overrides.mode] : ['basic', 'classic', 'dynamic'] as const;
        for (const mode of modes) {
          renderProtocolAction.label = `CAPTURING ${mode.toUpperCase()}`;
          results.push(await captureGameplayProtocol(metrics, game, {
            mode, commit: import.meta.env['VITE_RENDER_COMMIT'] ?? '',
            device: navigator.userAgent, scenario: 'live-gameplay-0.5.0-recovery', ...overrides,
          }));
        }
        api.result = { captures: results };
        lastJson = JSON.stringify(api.result, null, 2);
        return api.result;
      } catch (error) {
        api.error = error instanceof Error ? error.message : String(error);
        renderProtocolAction.label = 'CAPTURE FAILED — RETRY';
        throw error;
      } finally { busy = false; }
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
