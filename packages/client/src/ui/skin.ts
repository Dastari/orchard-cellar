import { loadGeneratedAsset, type LoadedAsset } from "../render/assets.js";
import { selectAtlasFrame, type AtlasFrame } from "../render/sprite.js";
import { drawNineSlice, snapRectForContext } from "./nine-slice.js";
import { insetRect, type UiRect } from "./geometry.js";

export const UI_ICON_NAMES = [
  "undo",
  "redo",
  "save",
  "load",
  "export",
  "import",
  "randomize",
  "grid",
  "height",
  "collision",
  "autoEdges",
] as const;
export type UiIconName = (typeof UI_ICON_NAMES)[number];

export interface UiIconAsset {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

export interface UiSkin {
  readonly panelWood: LoadedAsset;
  readonly panelParchment: LoadedAsset;
  readonly bookOpen: LoadedAsset;
  readonly frameThin: LoadedAsset;
  readonly button: LoadedAsset;
  readonly buttonSmall: LoadedAsset;
  readonly buttonSmallConfirm: LoadedAsset;
  readonly buttonConfirm: LoadedAsset;
  readonly buttonDeny: LoadedAsset;
  readonly buttonWideChamfered: LoadedAsset;
  readonly buttonWideSquare: LoadedAsset;
  readonly buttonWidePill: LoadedAsset;
  readonly buttonSmallChamfered: LoadedAsset;
  readonly buttonSmallSquare: LoadedAsset;
  readonly buttonSmallPill: LoadedAsset;
  readonly buttonGlyphs: LoadedAsset;
  readonly iconCatalog: LoadedAsset;
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
  readonly speechBubbleBeige: LoadedAsset;
  readonly speechBubbleWhite: LoadedAsset;
  readonly speechBubbleGreen: LoadedAsset;
  readonly speechBubbleBlue: LoadedAsset;
  readonly speechBubbleYellow: LoadedAsset;
  readonly speechBubbleRed: LoadedAsset;
  readonly speechBubblePurple: LoadedAsset;
  readonly chatIcon: LoadedAsset;
  readonly craftingIcon: LoadedAsset;
  readonly backpackIcon: LoadedAsset;
  readonly onlinePlayersIcon: LoadedAsset;
  readonly questTrackerChevron: LoadedAsset;
  readonly bookTab: LoadedAsset;
  readonly cursor: LoadedAsset;
  readonly cursorClick: LoadedAsset;
  readonly crosshair: LoadedAsset;
  readonly effectWellRested: LoadedAsset;
  readonly effectWinded: LoadedAsset;
  readonly effectOrchardTea: LoadedAsset;
  /** Small, permissively licensed interface symbols shared by editor and game
   * chrome. These remain separate SVG assets so they stay crisp at UI scale. */
  readonly icons: Readonly<Record<UiIconName, UiIconAsset>>;
}

const UI_ASSETS = {
  panelWood: "ui_cf_panel_wood",
  panelParchment: "ui_cf_panel_parchment",
  bookOpen: "ui_cf_book_open",
  frameThin: "ui_cf_frame_thin",
  button: "ui_cf_button",
  buttonSmall: "ui_cf_button_small",
  buttonSmallConfirm: "ui_cf_button_small_accent_green",
  buttonConfirm: "ui_cf_button_accent_green",
  buttonDeny: "ui_cf_button_accent_red",
  buttonWideChamfered: "ui_cf_button_wide_chamfered",
  buttonWideSquare: "ui_cf_button_wide_square",
  buttonWidePill: "ui_cf_button_wide_pill",
  buttonSmallChamfered: "ui_cf_button_small_chamfered",
  buttonSmallSquare: "ui_cf_button_small_square",
  buttonSmallPill: "ui_cf_button_small_pill",
  buttonGlyphs: "ui_cf_button_glyphs",
  iconCatalog: "ui_cf_icon_catalog",
  coinGold: "ui_cf_coin_gold",
  coinSilver: "ui_cf_coin_silver",
  coinBronze: "ui_cf_coin_bronze",
  slot: "ui_cf_slot",
  equipmentSlotIcons: "ui_cf_equipment_slot_icons",
  selectorNeutral: "ui_cf_selector_neutral",
  selectorConfirm: "ui_cf_selector_confirm",
  selectorDeny: "ui_cf_selector_deny",
  sliderTrack: "ui_cf_slider_track",
  sliderHandle: "ui_cf_slider_handle",
  barFrame: "ui_cf_bar_frame",
  barRed: "ui_cf_bar_fill_red",
  barGreen: "ui_cf_bar_fill_green",
  barBlue: "ui_cf_bar_fill_blue",
  barGold: "ui_cf_bar_fill_gold",
  ribbon: "ui_cf_ribbon",
  banner: "ui_cf_banner",
  bubble: "ui_cf_bubble",
  speechBubbleBeige: "ui_cf_speech_bubble_tail_beige",
  speechBubbleWhite: "ui_cf_speech_bubble_tail_white",
  speechBubbleGreen: "ui_cf_speech_bubble_tail_green",
  speechBubbleBlue: "ui_cf_speech_bubble_tail_blue",
  speechBubbleYellow: "ui_cf_speech_bubble_tail_yellow",
  speechBubbleRed: "ui_cf_speech_bubble_tail_red",
  speechBubblePurple: "ui_cf_speech_bubble_tail_purple",
  chatIcon: "ui_cf_icon_chat",
  craftingIcon: "ui_cf_icon_crafting",
  backpackIcon: "ui_cf_icon_backpack",
  onlinePlayersIcon: "ui_cf_icon_online_players",
  questTrackerChevron: "ui_cf_quest_tracker_chevron",
  bookTab: "ui_cf_book_tab",
  cursor: "ui_cf_cursor",
  cursorClick: "ui_cf_cursor_click",
  crosshair: "ui_cf_crosshair",
  effectWellRested: "icon_cf_effect_well_rested",
  effectWinded: "icon_cf_effect_winded",
  effectOrchardTea: "icon_cf_effect_orchard_tea",
} as const;

const UI_ICON_FILES: Readonly<Record<UiIconName, string>> = {
  undo: "undo-2.svg",
  redo: "redo-2.svg",
  save: "save.svg",
  load: "folder-open.svg",
  export: "file-up.svg",
  import: "file-down.svg",
  randomize: "shuffle.svg",
  grid: "grid-3x3.svg",
  height: "layers.svg",
  collision: "shield-x.svg",
  autoEdges: "wand-sparkles.svg",
};

const uiIconPromises = new Map<UiIconName, Promise<UiIconAsset>>();

async function loadUiIcon(name: UiIconName): Promise<UiIconAsset> {
  const existing = uiIconPromises.get(name);
  if (existing !== undefined) return await existing;
  const promise = new Promise<UiIconAsset>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ image, width: 24, height: 24 });
    image.onerror = () => reject(new Error(`Unable to load UI icon ${name}`));
    image.src = `/ui/lucide/${UI_ICON_FILES[name]}`;
  });
  uiIconPromises.set(name, promise);
  return await promise;
}

export async function loadUiSkin(): Promise<UiSkin> {
  const [entries, iconEntries] = await Promise.all([
    Promise.all(
      Object.entries(UI_ASSETS).map(
        async ([key, name]) =>
          [key, await loadGeneratedAsset(name, "summer")] as const,
      ),
    ),
    Promise.all(
      UI_ICON_NAMES.map(
        async (name) => [name, await loadUiIcon(name)] as const,
      ),
    ),
  ]);
  return {
    ...Object.fromEntries(entries),
    icons: Object.fromEntries(iconEntries),
  } as unknown as UiSkin;
}

export function drawUiIconAsset(
  context: CanvasRenderingContext2D,
  icon: UiIconAsset,
  destination: UiRect,
  opacity = 1,
): void {
  context.save();
  context.globalAlpha *= opacity;
  context.imageSmoothingEnabled = true;
  context.drawImage(
    icon.image,
    0,
    0,
    icon.width,
    icon.height,
    Math.round(destination.x),
    Math.round(destination.y),
    Math.round(destination.width),
    Math.round(destination.height),
  );
  context.restore();
}

export function uiAssetFrame(
  asset: LoadedAsset,
  state = "base",
  frameIndex = 0,
): AtlasFrame | null {
  return (
    selectAtlasFrame(asset.metadata, state, frameIndex) ??
    selectAtlasFrame(asset.metadata, "idle", frameIndex) ??
    selectAtlasFrame(asset.metadata, "base", frameIndex)
  );
}

/** Safe content area inside a skinned frame's authored border. `padding`
 * supplies even breathing room beyond the border itself. */
export function uiSkinContentRect(
  asset: Pick<LoadedAsset, "slice">,
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
  state = "base",
  frameIndex = 0,
): void {
  const requested = selectAtlasFrame(asset.metadata, state, frameIndex);
  const source = uiAssetFrame(asset, state, frameIndex);
  if (!source) return;
  context.imageSmoothingEnabled = false;
  if (asset.uiSizing === "nine_slice" && asset.slice) {
    drawNineSlice(context, asset.image, source, destination, asset.slice);
  } else if (asset.uiSizing === "segmented") {
    const cap = asset.slice?.[0] ?? Math.max(1, Math.floor(source.height / 3));
    const fittedCap = Math.min(cap, Math.floor(destination.width / 2));
    const sourceCenterWidth = Math.max(1, source.width - cap * 2);
    const destinationCenterWidth = Math.max(
      0,
      destination.width - fittedCap * 2,
    );
    if (fittedCap > 0) {
      const left = snapRectForContext(context, {
        x: destination.x,
        y: destination.y,
        width: fittedCap,
        height: destination.height,
      });
      const right = snapRectForContext(context, {
        x: destination.x + destination.width - fittedCap,
        y: destination.y,
        width: fittedCap,
        height: destination.height,
      });
      context.drawImage(
        asset.image,
        source.x,
        source.y,
        cap,
        source.height,
        left.x,
        left.y,
        left.width,
        left.height,
      );
      context.drawImage(
        asset.image,
        source.x + source.width - cap,
        source.y,
        cap,
        source.height,
        right.x,
        right.y,
        right.width,
        right.height,
      );
    }
    if (destinationCenterWidth > 0) {
      const center = snapRectForContext(context, {
        x: destination.x + fittedCap,
        y: destination.y,
        width: destinationCenterWidth,
        height: destination.height,
      });
      if (center.width > 0 && center.height > 0)
        context.drawImage(
          asset.image,
          source.x + cap,
          source.y,
          sourceCenterWidth,
          source.height,
          center.x,
          center.y,
          center.width,
          center.height,
        );
    }
  } else {
    const snapped = snapRectForContext(context, destination);
    context.drawImage(
      asset.image,
      source.x,
      source.y,
      source.width,
      source.height,
      snapped.x,
      snapped.y,
      snapped.width,
      snapped.height,
    );
  }
  // Not every licensed UI sprite supplies a disabled frame (slots notably do
  // not). Give every skinned control a consistent fallback rather than making
  // each composition invent its own treatment.
  if (state === "disabled" && requested === null) {
    const snapped = snapRectForContext(context, destination);
    const inset = Math.max(
      2,
      Math.min(
        4,
        Math.floor(Math.min(snapped.width, snapped.height) / 7),
      ),
    );
    context.save();
    context.fillStyle = "#332c2a99";
    context.fillRect(
      snapped.x + inset,
      snapped.y + inset,
      Math.max(1, snapped.width - inset * 2),
      Math.max(1, snapped.height - inset * 2),
    );
    context.fillStyle = "#d8b68b55";
    for (
      let x = snapped.x + inset + 2;
      x < snapped.x + snapped.width - inset;
      x += 6
    ) {
      context.fillRect(
        x,
        snapped.y + snapped.height - inset - 2,
        2,
        1,
      );
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
  drawUiSkinAsset(context, skin.button, destination, "idle");
}

/** Draws the compact HUD plate used by the wallet and other one-line status
 * readouts, returning its safe content rectangle for clipped, aligned text. */
export function drawThinHudPanel(
  context: CanvasRenderingContext2D,
  skin: Pick<UiSkin, "frameThin">,
  destination: UiRect,
  padding = 2,
): UiRect {
  drawUiSkinAsset(context, skin.frameThin, destination);
  return uiSkinContentRect(skin.frameThin, destination, padding);
}

export function drawUiSkinNatural(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  x: number,
  y: number,
  state = "base",
  frameIndex = 0,
): UiRect | null {
  const source = uiAssetFrame(asset, state, frameIndex);
  if (!source) return null;
  const destination = {
    x: Math.round(x),
    y: Math.round(y),
    width: source.width,
    height: source.height,
  };
  drawUiSkinAsset(context, asset, destination, state, frameIndex);
  return destination;
}
