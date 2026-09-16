import { centeredFixedSceneLayout } from '@orchard/engine/display';
import type { LoadingScreenStage } from '@orchard/engine/loading-screen';
import type { UnifiedRenderer } from '@orchard/engine/renderer';
import { drawGatewayLoading, drawOrchardBackdrop, type LoadedAsset, type PixelUi, type UiSkin } from '@orchard/ui';

/** Continue the startup gateway in the world's render loop. This also restores
 * loading after an initial offline/update dialog without restarting a RAF loop. */
export function drawInitialWorldLoading(
  renderer: Pick<UnifiedRenderer, 'beginUi' | 'endUi' | 'cssWidth' | 'cssHeight'>,
  assets: { readonly ui: PixelUi; readonly skin: UiSkin; readonly apple: LoadedAsset },
  stage: LoadingScreenStage,
  version: string,
): void {
  const context = renderer.beginUi(1);
  context.save();
  try {
    drawOrchardBackdrop(context, renderer.cssWidth, renderer.cssHeight);
    const scene = centeredFixedSceneLayout(renderer.cssWidth, renderer.cssHeight);
    context.translate(scene.x, scene.y);
    context.scale(scene.scale, scene.scale);
    drawGatewayLoading(context, assets, stage.title, stage.progress, stage.error === true, version);
  } finally {
    context.restore();
    renderer.endUi();
  }
}
