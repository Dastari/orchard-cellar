import type { LoadedAsset } from '../render/assets.js';
import { drawPixelText, type PixelUi } from '../render/pixel-ui.js';
import { drawProgressBar, GREEN_PROGRESS_PALETTE, RED_PROGRESS_PALETTE } from './progress-bar.js';
import { Ribbon } from './ribbon.js';
import { drawUiSkinAsset, uiAssetFrame } from './skin.js';

export interface GatewayFrameSkin {
  readonly panelWood: LoadedAsset;
  readonly panelParchment: LoadedAsset;
  readonly banner: LoadedAsset;
}

export interface GatewayFrameArt {
  readonly ui: PixelUi;
  readonly skin: GatewayFrameSkin;
  readonly apple: LoadedAsset;
}

export const GATEWAY_FRAME = {
  panel: { x: 58, y: 25, width: 364, height: 200 },
  parchment: { x: 68, y: 35, width: 344, height: 180 },
  apple: { x: 232, y: 49, width: 16, height: 16 },
  content: { x: 82, y: 87, width: 316, height: 96 },
  progress: { x: 112, y: 126, width: 256, height: 10 },
} as const;

export function drawGatewayFrame(
  context: CanvasRenderingContext2D,
  art: GatewayFrameArt,
  version?: string,
  height: number = GATEWAY_FRAME.panel.height,
): void {
  drawUiSkinAsset(context, art.skin.panelWood, { ...GATEWAY_FRAME.panel, height });
  drawUiSkinAsset(context, art.skin.panelParchment, { ...GATEWAY_FRAME.parchment, height: height - 20 });
  new Ribbon(art.skin.banner, art.ui).draw(context, 'ORCHARD & CELLAR', 240, 21);
  if (version) drawPixelText(context, art.ui, `V${version}`, 402, 41, {
    align: 'right', color: '#91672e',
  });
  const appleFrame = uiAssetFrame(art.apple);
  if (appleFrame !== null) context.drawImage(
    art.apple.image,
    appleFrame.x, appleFrame.y, appleFrame.width, appleFrame.height,
    GATEWAY_FRAME.apple.x, GATEWAY_FRAME.apple.y,
    GATEWAY_FRAME.apple.width, GATEWAY_FRAME.apple.height,
  );
}

export function drawGatewayLoading(
  context: CanvasRenderingContext2D,
  art: GatewayFrameArt,
  title: string,
  progress: number,
  error = false,
  version?: string,
): void {
  drawGatewayFrame(context, art, version);
  drawUiSkinAsset(context, art.skin.panelParchment, GATEWAY_FRAME.content);
  drawPixelText(context, art.ui, title, 240, 105, {
    align: 'center', color: error ? '#a43b2f' : '#5c3528', font: 'header',
  });
  drawProgressBar(
    context,
    GATEWAY_FRAME.progress,
    progress / 100,
    error ? RED_PROGRESS_PALETTE : GREEN_PROGRESS_PALETTE,
  );
  drawPixelText(context, art.ui, `${Math.round(progress)}%`, 240, 148, {
    align: 'center', color: '#6f451f',
  });
}
