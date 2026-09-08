import type { PixelUi } from './pixel-ui.js';
import type { UiSkin } from './skin.js';
import type { UiPoint } from './geometry.js';
import type { OverworldUiLayout } from './overworld-ui.js';
import type { Toggle } from './toggle.js';
import { renderProtocolAction } from './render-protocol-action.js';
import { drawLabel, drawMenuButton } from './overworld-panel-drawing.js';
export interface DeveloperRenderView {
 readonly fonts: PixelUi; readonly skin: UiSkin; readonly pointer: UiPoint; readonly layout: OverworldUiLayout;
 readonly lightingEffectsToggle: Toggle; readonly orePreviewToggle: Toggle;
}
export function drawDeveloperRender(context: CanvasRenderingContext2D, view: DeveloperRenderView): void {
    const { developerContent } = view.layout;
    drawLabel(context, view.fonts, 'UNIFIED SOLVER', developerContent.x + 12,
      view.layout.lightingEffectsButton.y + 5, { color: '#6b4428' });
    drawLabel(context, view.fonts, 'CELLAR ORE VEINS', developerContent.x + 12,
      view.layout.orePreviewButton.y + 5, { color: '#6b4428' });
    view.lightingEffectsToggle.draw(context);
    view.orePreviewToggle.draw(context);
    drawMenuButton(context, view.skin, view.fonts, view.pointer, {
      ...view.layout.orePreviewButton, x: developerContent.x + 12,
      width: developerContent.width - 24, y: view.layout.orePreviewButton.y + 30,
    }, renderProtocolAction.label);
}
