import { loadGeneratedAsset, type LoadedAsset } from '../render/assets.js';
import { selectAtlasFrame, type AtlasFrame } from '../render/sprite.js';
import { drawNineSlice, snapRectForContext } from './nine-slice.js';
import { insetRect, type UiRect } from './geometry.js';

export interface UiSkin {
  readonly panelWood: LoadedAsset;
  readonly panelParchment: LoadedAsset;
  readonly bookOpen: LoadedAsset;
  readonly frameThin: LoadedAsset;
  readonly button: LoadedAsset;
  readonly buttonSmall: LoadedAsset;
  readonly buttonConfirm: LoadedAsset;
  readonly buttonDeny: LoadedAsset;
  readonly coinGold: LoadedAsset;
  readonly coinSilver: LoadedAsset;
  readonly coinBronze: LoadedAsset;
  readonly slot: LoadedAsset;
  readonly equipmentSlotIcons: LoadedAsset;
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
  readonly speechBubble: LoadedAsset;
  readonly speechBubbleRed: LoadedAsset;
  readonly bubbleTailDown: LoadedAsset;
  readonly bubbleTailUp: LoadedAsset;
  readonly bubbleTailLeft: LoadedAsset;
  readonly bubbleTailRight: LoadedAsset;
  readonly bubbleTailDownRed: LoadedAsset;
  readonly bubbleTailUpRed: LoadedAsset;
  readonly bubbleTailLeftRed: LoadedAsset;
  readonly bubbleTailRightRed: LoadedAsset;
  readonly cursor: LoadedAsset;
  readonly cursorClick: LoadedAsset;
  readonly crosshair: LoadedAsset;
  readonly effectWellRested: LoadedAsset;
  readonly effectWinded: LoadedAsset;
  readonly effectOrchardTea: LoadedAsset;
}

const UI_ASSETS = {
  panelWood: 'ui_cf_panel_wood', panelParchment: 'ui_cf_panel_parchment', bookOpen: 'ui_cf_book_open', frameThin: 'ui_cf_frame_thin',
  button: 'ui_cf_button', buttonSmall: 'ui_cf_button_small', buttonConfirm: 'ui_cf_button_accent_green',
  buttonDeny: 'ui_cf_button_accent_red', coinGold: 'ui_cf_coin_gold', coinSilver: 'ui_cf_coin_silver',
  coinBronze: 'ui_cf_coin_bronze', slot: 'ui_cf_slot', equipmentSlotIcons: 'ui_cf_equipment_slot_icons', selectorNeutral: 'ui_cf_selector_neutral',
  selectorConfirm: 'ui_cf_selector_confirm', selectorDeny: 'ui_cf_selector_deny', sliderTrack: 'ui_cf_slider_track',
  sliderHandle: 'ui_cf_slider_handle', barFrame: 'ui_cf_bar_frame', barRed: 'ui_cf_bar_fill_red',
  barGreen: 'ui_cf_bar_fill_green', barBlue: 'ui_cf_bar_fill_blue', barGold: 'ui_cf_bar_fill_gold',
  ribbon: 'ui_cf_ribbon', banner: 'ui_cf_banner', bubble: 'ui_cf_bubble',
  speechBubble: 'ui_cf_speech_bubble', speechBubbleRed: 'ui_cf_speech_bubble_red',
  bubbleTailDown: 'ui_cf_bubble_tail_down', bubbleTailUp: 'ui_cf_bubble_tail_up',
  bubbleTailLeft: 'ui_cf_bubble_tail_left', bubbleTailRight: 'ui_cf_bubble_tail_right',
  bubbleTailDownRed: 'ui_cf_bubble_tail_down_red', bubbleTailUpRed: 'ui_cf_bubble_tail_up_red',
  bubbleTailLeftRed: 'ui_cf_bubble_tail_left_red', bubbleTailRightRed: 'ui_cf_bubble_tail_right_red',
  cursor: 'ui_cf_cursor', cursorClick: 'ui_cf_cursor_click', crosshair: 'ui_cf_crosshair',
  effectWellRested: 'icon_cf_effect_well_rested', effectWinded: 'icon_cf_effect_winded',
  effectOrchardTea: 'icon_cf_effect_orchard_tea',
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

/** Safe content area inside a skinned frame's authored border. `padding`
 * supplies even breathing room beyond the border itself. */
export function uiSkinContentRect(
  asset: Pick<LoadedAsset, 'slice'>,
  destination: UiRect,
  padding = 2,
): UiRect {
  const [left, top, right, bottom] = asset.slice ?? [0, 0, 0, 0];
  return insetRect(destination, {
    left: left + padding,
    top: top + padding,
    right: right + padding,
    bottom: bottom + padding,
  });
}

export function drawUiSkinAsset(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  destination: UiRect,
  state = 'base',
  frameIndex = 0,
): void {
  const requested = selectAtlasFrame(asset.metadata, state, frameIndex);
  const source = uiAssetFrame(asset, state, frameIndex);
  if (!source) return;
  context.imageSmoothingEnabled = false;
  if (asset.uiSizing === 'nine_slice' && asset.slice) {
    drawNineSlice(context, asset.image, source, destination, asset.slice);
  } else if (asset.uiSizing === 'segmented') {
    const cap = asset.slice?.[0] ?? Math.max(1, Math.floor(source.height / 3));
    const fittedCap = Math.min(cap, Math.floor(destination.width / 2));
    const sourceCenterWidth = Math.max(1, source.width - cap * 2);
    const destinationCenterWidth = Math.max(0, destination.width - fittedCap * 2);
    if (fittedCap > 0) {
      const left = snapRectForContext(context, {
        x: destination.x, y: destination.y, width: fittedCap, height: destination.height,
      });
      const right = snapRectForContext(context, {
        x: destination.x + destination.width - fittedCap, y: destination.y,
        width: fittedCap, height: destination.height,
      });
      context.drawImage(asset.image, source.x, source.y, cap, source.height,
        left.x, left.y, left.width, left.height);
      context.drawImage(asset.image, source.x + source.width - cap, source.y, cap, source.height,
        right.x, right.y, right.width, right.height);
    }
    if (destinationCenterWidth > 0) {
      const center = snapRectForContext(context, {
        x: destination.x + fittedCap, y: destination.y,
        width: destinationCenterWidth, height: destination.height,
      });
      if (center.width > 0 && center.height > 0) context.drawImage(
        asset.image, source.x + cap, source.y, sourceCenterWidth, source.height,
        center.x, center.y, center.width, center.height,
      );
    }
  } else {
    context.drawImage(
      asset.image, source.x, source.y, source.width, source.height,
      Math.round(destination.x), Math.round(destination.y), Math.round(destination.width), Math.round(destination.height),
    );
  }
  // Not every licensed UI sprite supplies a disabled frame (slots notably do
  // not). Give every skinned control a consistent fallback rather than making
  // each composition invent its own treatment.
  if (state === 'disabled' && requested === null) {
    const inset = Math.max(2, Math.min(4, Math.floor(Math.min(destination.width, destination.height) / 7)));
    context.save();
    context.fillStyle = '#332c2a99';
    context.fillRect(
      Math.round(destination.x + inset),
      Math.round(destination.y + inset),
      Math.max(1, Math.round(destination.width - inset * 2)),
      Math.max(1, Math.round(destination.height - inset * 2)),
    );
    context.fillStyle = '#d8b68b55';
    for (let x = destination.x + inset + 2; x < destination.x + destination.width - inset; x += 6) {
      context.fillRect(Math.round(x), Math.round(destination.y + destination.height - inset - 2), 2, 1);
    }
    context.restore();
  }
}

/** Compact, single-border plate for one-line labels such as item tooltips. */
export function drawUiLabelPlate(
  context: CanvasRenderingContext2D,
  skin: UiSkin,
  destination: UiRect,
): void {
  drawUiSkinAsset(context, skin.button, destination, 'idle');
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
