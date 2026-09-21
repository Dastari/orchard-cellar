import type { StudioCanvasToolBuilder } from '../../shell/canvas-tool.js';
import { studioLiveContentSnapshot, studioLiveContentStatusSurface } from '../../shell/live-content-readiness.js';
/** The lab owns a retained kit root over the complete canvas. Its camera and
 * inspector must share that root, rather than the legacy drawer compositor. */
export const buildUiLabCanvasTool: StudioCanvasToolBuilder = (context) => {
  const content = studioLiveContentSnapshot(context.controller.liveAdapter());
  return content.mode === 'loading' || content.mode === 'unavailable'
    ? studioLiveContentStatusSurface(content)
    : { standalone: 'ui-lab' };
};
