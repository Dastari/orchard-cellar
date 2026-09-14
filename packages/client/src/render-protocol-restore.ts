import type { RenderMetrics } from '@orchard/engine/metrics';
import type { ProtocolGameplay } from './gameplay-render-protocol.js';

/** Wait for the frame-boundary atlas publication or an explicit fallback before
 * ending the request log. Merely writing the Video preference is not settlement. */
export function waitForProtocolRestore(metrics: RenderMetrics, game: ProtocolGameplay): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.visibilityState !== 'visible') { reject(new Error('render_protocol_restore_tab_hidden')); return; }
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe(); reject(new Error('render_protocol_restore_not_settled'));
    }, 20_000);
    unsubscribe = metrics.observeFrames(() => {
      const state = game.protocolLighting ?? game.diagnostics().lighting;
      if (state.fallbackReason === 'preparing') return;
      clearTimeout(timeout); unsubscribe(); resolve();
    });
  });
}
