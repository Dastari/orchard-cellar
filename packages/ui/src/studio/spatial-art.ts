import { loadPixelUi, type PixelUi } from '../pixel-ui.js';
import { loadUiGeneratedSkin, loadUiIconSet, type UiIconName, type UiSkin, type UiGeneratedSkinAssetKey } from '../skin.js';
/** Assets used by the engine-backed map viewport, independent of kit chrome. */
export interface StudioSpatialArt { readonly fonts: PixelUi; readonly skin: UiSkin }
const STUDIO_CANVAS_SKIN_KEYS = Object.freeze([
  'panelWood', 'panelParchment', 'frameThin',
  'buttonWideChamfered', 'buttonWideSquare', 'buttonWidePill',
  'buttonSmallChamfered', 'buttonSmallSquare', 'buttonSmallPill',
  'buttonGlyphs', 'iconCatalog', 'slot', 'ribbon',
  'selectorNeutral', 'selectorConfirm', 'selectorDeny',
] as const satisfies readonly UiGeneratedSkinAssetKey[]);

/** Exact semantic icon preload manifest for the sole-Canvas Studio shell.
 * Exported so the Studio package can verify its own public asset copy. */
export const STUDIO_SPATIAL_UI_ICONS = Object.freeze([
  'visibility', 'eyeOff', 'layers', 'map', 'landPlot', 'box', 'gamepad', 'trees', 'pointer',
  'lock', 'unlock', 'height', 'collision',
] as const satisfies readonly UiIconName[]);

async function loadStudioCanvasSkin(): Promise<UiSkin> {
  const skin = await loadUiGeneratedSkin(STUDIO_CANVAS_SKIN_KEYS);
  // This deliberately narrow skin is private to the adapter. Every primitive
  // below reads only keys in STUDIO_CANVAS_SKIN_ASSETS, avoiding unrelated
  // game icons while retaining the exact generated atlas assets used by UI Lab.
  return skin as unknown as UiSkin;
}

export async function loadStudioSpatialArt(): Promise<StudioSpatialArt> {
  const [fonts, skin, icons] = await Promise.all([
    loadPixelUi(), loadStudioCanvasSkin(), loadUiIconSet(STUDIO_SPATIAL_UI_ICONS),
  ]);
  return Object.freeze({ fonts, skin: { ...skin, icons } as UiSkin });
}
