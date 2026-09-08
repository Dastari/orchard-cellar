import { changeExperimentalWebGL, readExperimentalWebGL } from './world-backend-setting.js';
import { widget, type WidgetNode } from './widget.js';
import type { UiRect } from './geometry.js';
import type { OverworldUiLayout, DeveloperTab } from './overworld-ui.js';
export function experimentalWebGLBounds(settingsContent: UiRect, presentationCapButton: UiRect, videoRowHeight: number, _developerContent: UiRect): UiRect {
  void _developerContent;
  return { ...presentationCapButton, x: settingsContent.x + settingsContent.width - 60,
    width: 50, y: presentationCapButton.y + videoRowHeight };
}
export function createExperimentalWebGLNode(): WidgetNode {
  return widget('button', 'window.settings.video.experimental-webgl', {
    onPointer: (event) => {
      if (event.kind !== 'pointer_down' || event.button !== 0) return false;
      changeExperimentalWebGL(!readExperimentalWebGL());
      return true;
    },
  });
}
export function syncExperimentalWebGLNode(node: WidgetNode, videoVisible: boolean, _developerVisible: boolean, _developerTab: DeveloperTab): void {
  void _developerVisible; void _developerTab;
  node.visible = videoVisible; node.enabled = node.visible;
}
export function developerRenderButtons(content: UiRect): { lighting: UiRect; ore: UiRect } {
  return { lighting: { x: content.x + content.width - 48, y: content.y + 32, width: 40, height: 18 },
    ore: { x: content.x + content.width - 48, y: content.y + 67, width: 40, height: 18 } };
}
export function renderProtocolBounds(layout: Pick<OverworldUiLayout, 'orePreviewButton' | 'developerContent'>): UiRect {
  return { ...layout.orePreviewButton,
    x: layout.developerContent.x + 12, width: layout.developerContent.width - 24,
    y: layout.orePreviewButton.y + 30 };
}
