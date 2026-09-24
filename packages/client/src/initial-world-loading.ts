import type { LoadingScreenStage } from '@orchard/engine/loading-screen';
import type { UnifiedRenderer } from '@orchard/engine/renderer';
import { drawOrchardBackdrop, type LoadedAsset } from '@orchard/ui';
import { GameGatewayLoading, gameGatewayLayout, type UiKitArt } from '@orchard/ui/game';

const views = new WeakMap<object, { readonly art: UiKitArt; readonly version: string; readonly view: GameGatewayLoading }>();
export function disposeInitialWorldLoading(renderer: object): void {
  views.get(renderer)?.view.dispose(); views.delete(renderer);
}
/** Continue the shared startup composition inside the existing world loop. */
export function drawInitialWorldLoading(
  renderer: Pick<UnifiedRenderer, 'beginUi' | 'endUi' | 'cssWidth' | 'cssHeight'>,
  assets: { readonly kitArt: UiKitArt; readonly apple: LoadedAsset; readonly cask?: LoadedAsset },
  stage: LoadingScreenStage,
  version: string,
  safe: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number } = {left:0,right:0,top:0,bottom:0},
): void {
  let retained = views.get(renderer);
  if (!retained || retained.art !== assets.kitArt || retained.version !== version) {
    retained?.view.dispose();
    retained = { art: assets.kitArt, version, view: new GameGatewayLoading(assets.kitArt, { emblem: assets.apple, cask: assets.cask, version }) };
    views.set(renderer,retained);
  }
  const context = renderer.beginUi(1);
  context.save();
  try {
    drawOrchardBackdrop(context, renderer.cssWidth, renderer.cssHeight);
    const scene = gameGatewayLayout(Math.max(1,renderer.cssWidth-safe.left-safe.right),Math.max(1,renderer.cssHeight-safe.top-safe.bottom));
    context.translate(safe.left,safe.top); context.scale(scene.scale,scene.scale);
    retained.view.setBounds(scene.frame,scene.width,scene.height); retained.view.update(stage); retained.view.draw(context);
  } finally { context.restore(); renderer.endUi(); }
}
