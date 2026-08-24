import { loadGeneratedAsset, type LoadedAsset } from '../render/assets.js';
import { selectAtlasFrame, type AtlasFrame } from '../render/sprite.js';
import { drawNineSlice } from './nine-slice.js';
import type { UiRect } from './geometry.js';

export interface UiSkin {
  readonly panelWood: LoadedAsset;
  readonly panelParchment: LoadedAsset;
  readonly frameThin: LoadedAsset;
  readonly button: LoadedAsset;
  readonly buttonSmall: LoadedAsset;
  readonly buttonConfirm: LoadedAsset;
  readonly buttonDeny: LoadedAsset;
  readonly slot: LoadedAsset;
  readonly selectorNeutral: LoadedAsset;
  readonly selectorConfirm: LoadedAsset;
  readonly selectorDeny: LoadedAsset;
  readonly sliderTrack: LoadedAsset;
  readonly sliderHandle: LoadedAsset;
  readonly barFrame: LoadedAsset;
  readonly barRed: LoadedAsset;
  readonly barGreen: LoadedAsset;
  readonly barBlue: LoadedAsset;
  readonly barGold: LoadedAsset;
  readonly ribbon: LoadedAsset;
  readonly banner: LoadedAsset;
  readonly bubble: LoadedAsset;
  readonly bubbleTailDown: LoadedAsset;
  readonly cursor: LoadedAsset;
  readonly cursorClick: LoadedAsset;
  readonly crosshair: LoadedAsset;
}

const UI_ASSETS = {
  panelWood: 'ui_cf_panel_wood', panelParchment: 'ui_cf_panel_parchment', frameThin: 'ui_cf_frame_thin',
  button: 'ui_cf_button', buttonSmall: 'ui_cf_button_small', buttonConfirm: 'ui_cf_button_accent_green',
  buttonDeny: 'ui_cf_button_accent_red', slot: 'ui_cf_slot', selectorNeutral: 'ui_cf_selector_neutral',
  selectorConfirm: 'ui_cf_selector_confirm', selectorDeny: 'ui_cf_selector_deny', sliderTrack: 'ui_cf_slider_track',
  sliderHandle: 'ui_cf_slider_handle', barFrame: 'ui_cf_bar_frame', barRed: 'ui_cf_bar_fill_red',
  barGreen: 'ui_cf_bar_fill_green', barBlue: 'ui_cf_bar_fill_blue', barGold: 'ui_cf_bar_fill_gold',
  ribbon: 'ui_cf_ribbon', banner: 'ui_cf_banner', bubble: 'ui_cf_bubble', bubbleTailDown: 'ui_cf_bubble_tail_down',
  cursor: 'ui_cf_cursor', cursorClick: 'ui_cf_cursor_click', crosshair: 'ui_cf_crosshair',
} as const;

export async function loadUiSkin(): Promise<UiSkin> {
  const entries = await Promise.all(Object.entries(UI_ASSETS).map(async ([key, name]) => [key, await loadGeneratedAsset(name, 'summer')] as const));
  return Object.fromEntries(entries) as unknown as UiSkin;
}

export function uiAssetFrame(asset: LoadedAsset, state = 'base', frameIndex = 0): AtlasFrame | null {
  return selectAtlasFrame(asset.metadata, state, frameIndex)
    ?? selectAtlasFrame(asset.metadata, 'idle', frameIndex)
    ?? selectAtlasFrame(asset.metadata, 'base', frameIndex);
}

export function drawUiSkinAsset(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  destination: UiRect,
  state = 'base',
  frameIndex = 0,
): void {
  const source = uiAssetFrame(asset, state, frameIndex);
  if (!source) return;
  context.imageSmoothingEnabled = false;
  if (asset.uiSizing === 'nine_slice' && asset.slice) {
    drawNineSlice(context, asset.image, source, destination, asset.slice);
    return;
  }
  context.drawImage(
    asset.image, source.x, source.y, source.width, source.height,
    Math.round(destination.x), Math.round(destination.y), Math.round(destination.width), Math.round(destination.height),
  );
}

export function drawUiSkinNatural(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  x: number,
  y: number,
  state = 'base',
  frameIndex = 0,
): UiRect | null {
  const source = uiAssetFrame(asset, state, frameIndex);
  if (!source) return null;
  const destination = { x: Math.round(x), y: Math.round(y), width: source.width, height: source.height };
  drawUiSkinAsset(context, asset, destination, state, frameIndex);
  return destination;
}
