import { readExperimentalWebGL, worldBackendStatus } from './world-backend-setting.js';
import { renderProtocolBounds } from './world-render-controls.js';
import { drawPixelTextInRect } from './pixel-ui.js';
import type { PixelUi } from './pixel-ui.js';
import type { UiSkin } from './skin.js';
import type { UiPoint } from './geometry.js';
import type { OverworldUiLayout } from './overworld-ui.js';
import type { Toggle } from './toggle.js';
import { renderProtocolAction } from './render-protocol-action.js';
import { drawMenuButton } from './overworld-panel-drawing.js';
export interface DeveloperRenderView {
 readonly fonts: PixelUi; readonly skin: UiSkin; readonly pointer: UiPoint; readonly layout: OverworldUiLayout;
 readonly lightingEffectsToggle: Toggle; readonly orePreviewToggle: Toggle;
}
export function drawDeveloperRender(context: CanvasRenderingContext2D, view: DeveloperRenderView): void {
    const { developerContent } = view.layout;
    for (const [label, bounds] of [['UNIFIED SOLVER', view.layout.lightingEffectsButton],
      ['CELLAR ORE VEINS', view.layout.orePreviewButton]] as const) {
      drawPixelTextInRect(context, view.fonts, label, { x: developerContent.x + 12, y: bounds.y,
        width: Math.max(0, bounds.x - developerContent.x - 16), height: bounds.height },
      { verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
    }
    view.lightingEffectsToggle.draw(context);
    view.orePreviewToggle.draw(context);
    const enabled = readExperimentalWebGL();
    const label = developerContent.width < 280 ? 'WEBGL*' : 'EXPERIMENTAL: WEBGL RENDERER';
    drawMenuButton(context, view.skin, view.fonts, view.pointer, view.layout.experimentalWebGLButton,
      `${label}: ${enabled ? 'ON' : 'OFF'}`, { tone: enabled ? 'green' : 'peach' });
    drawMenuButton(context, view.skin, view.fonts, view.pointer, renderProtocolBounds(view.layout), renderProtocolAction.label);
    const backend = worldBackendStatus();
    const hint = backend.fallbackReason !== null
      ? `CANVAS: ${backend.fallbackReason.replace(/^webgl_/, '').replaceAll('_', ' ').toUpperCase()}`
      : backend.preparing ? 'PREPARING EXPERIMENTAL WEBGL...'
        : backend.backend === 'webgl2' ? 'EXPERIMENTAL WEBGL ACTIVE' : '* EXPERIMENTAL WEBGL RENDERER';
    drawPixelTextInRect(context, view.fonts, hint, { x: developerContent.x + 10,
      y: developerContent.y + developerContent.height - 17, width: developerContent.width - 20, height: 10 },
    { align: 'center', color: '#8c6c54', overflow: 'ellipsis' });
}
