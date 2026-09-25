// Runs before main.ts with no heavy imports, so the previous page's frame is back on
// screen within the first few frames instead of after the game's module graph loads
// (owner UI item 5). The loading screen's first real frame replaces it.
import { canvasHostViewport } from '@orchard/engine/display';
import { gatewayFrameStarted, paintGatewayHandoff, takeGatewayHandoff } from '@orchard/engine/gateway-handoff';

const handoff = takeGatewayHandoff(globalThis.sessionStorage);
const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (handoff !== null && canvas !== null) {
  void paintGatewayHandoff(canvas, handoff, { ...canvasHostViewport(canvas), dpr: Math.max(1, devicePixelRatio) },
    () => !gatewayFrameStarted());
}
