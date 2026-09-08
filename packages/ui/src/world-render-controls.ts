import { changeExperimentalWebGL, readExperimentalWebGL } from './world-backend-setting.js';
import { widget, type WidgetNode } from './widget.js';
import type { UiRect } from './geometry.js';
import type { OverworldUiLayout, DeveloperTab } from './overworld-ui.js';
function developerRenderRow(content: UiRect, index: number): UiRect {
  const step = Math.max(8, Math.min(30, Math.floor((content.height - 40) / 4)));
  return { x: content.x + content.width - 48, y: content.y + 23 + index * step,
    width: 40, height: Math.min(18, step) };
}
export function experimentalWebGLBounds(developerContent: UiRect): UiRect {
  const row = developerRenderRow(developerContent, 2);
  return { ...row, x: developerContent.x + 12, width: developerContent.width - 24 };
}
export function createExperimentalWebGLNode(): WidgetNode {
  return widget('button', 'window.developer.render.experimental-webgl', {
    onPointer: (event) => {
      if (event.kind !== 'pointer_down' || event.button !== 0) return false;
      changeExperimentalWebGL(!readExperimentalWebGL());
      return true;
    },
  });
}
export function syncExperimentalWebGLNode(node: WidgetNode, developerVisible: boolean, developerTab: DeveloperTab): void {
  node.visible = developerVisible && developerTab === 'render'; node.enabled = node.visible;
}
export function developerRenderButtons(content: UiRect): { lighting: UiRect; ore: UiRect } {
  return { lighting: developerRenderRow(content, 0), ore: developerRenderRow(content, 1) };
}
export function renderProtocolBounds(layout: Pick<OverworldUiLayout, 'orePreviewButton' | 'developerContent'>): UiRect {
  const content = layout.developerContent, row = developerRenderRow(content, 3);
  return { ...row, x: content.x + 12, width: content.width - 24 };
}
