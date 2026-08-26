import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource, FrameKind, UiSizing } from './assets/types.js';

type Region = readonly [x: number, y: number, width: number, height: number];
type Rotation = 0 | 1 | 2 | 3;

interface Crop {
  readonly region: Region;
  readonly rotate?: Rotation;
}

interface UiExtract {
  readonly name: string;
  readonly source: string;
  readonly size: readonly [number, number];
  readonly groups: Readonly<Record<string, readonly Crop[]>>;
  readonly frameKinds: Readonly<Record<string, FrameKind>>;
  readonly uiSizing: UiSizing;
  readonly slice?: readonly [number, number, number, number];
  readonly uiRequiredStates?: readonly string[];
  readonly animationFps?: Readonly<Record<string, number>>;
  readonly animationLoop?: Readonly<Record<string, boolean>>;
  readonly tags: readonly string[];
}

const uiRoot = 'references/Cute_Fantasy_UI/UI';
const r = (x: number, y: number, width: number, height: number, rotate: Rotation = 0): Crop => ({
  region: [x, y, width, height],
  ...(rotate ? { rotate } : {}),
});
const state = (region: Crop): Readonly<Record<string, readonly Crop[]>> => ({ idle: [region] });

/**
 * Audited source coordinates from the native Cute Fantasy UI sheets.
 * Keep semantic IDs stable even if a later audit chooses a neighboring visual.
 */
const extracts: readonly UiExtract[] = [
  {
    name: 'ui_cf_panel_wood', source: `${uiRoot}/UI_Frames.png`, size: [42, 41],
    groups: { base: [r(915, 4, 42, 41)] }, frameKinds: { base: 'state' },
    uiSizing: 'nine_slice', slice: [10, 10, 10, 10], tags: ['ui.panel', 'ui.material.wood'],
  },
  {
    name: 'ui_cf_panel_parchment', source: `${uiRoot}/UI_Frames.png`, size: [32, 32],
    groups: { base: [r(1064, 8, 32, 32)] }, frameKinds: { base: 'state' },
    uiSizing: 'nine_slice', slice: [8, 8, 8, 8], tags: ['ui.panel', 'ui.material.parchment'],
  },
  {
    name: 'ui_cf_book_open', source: `${uiRoot}/Book_UI.png`, size: [224, 133],
    groups: { base: [r(8, 6, 224, 133)] }, frameKinds: { base: 'state' },
    uiSizing: 'fixed', tags: ['ui.book', 'ui.help', 'ui.material.parchment'],
  },
  {
    name: 'ui_cf_frame_thin', source: `${uiRoot}/UI_Frames.png`, size: [28, 31],
    groups: { base: [r(202, 10, 28, 31)] }, frameKinds: { base: 'state' },
    uiSizing: 'nine_slice', slice: [6, 6, 6, 7], tags: ['ui.frame', 'ui.border.thin'],
  },
  {
    name: 'ui_cf_slot', source: `${uiRoot}/UI_Frames.png`, size: [28, 31],
    groups: state(r(10, 10, 28, 31)), frameKinds: { idle: 'state' }, uiRequiredStates: ['idle'],
    uiSizing: 'fixed', tags: ['ui.slot', 'ui.inventory'],
  },
  {
    name: 'ui_cf_button', source: `${uiRoot}/UI_Buttons.png`, size: [32, 16],
    groups: { idle: [r(0, 0, 32, 16)], pressed: [r(32, 0, 32, 16)], disabled: [r(64, 0, 32, 16)] },
    frameKinds: { idle: 'state', pressed: 'state', disabled: 'state' }, uiRequiredStates: ['idle', 'pressed', 'disabled'],
    uiSizing: 'nine_slice', slice: [7, 4, 7, 5], tags: ['ui.button', 'ui.button.neutral'],
  },
  {
    name: 'ui_cf_button_small', source: `${uiRoot}/UI_Buttons.png`, size: [16, 16],
    groups: { idle: [r(96, 0, 16, 16)], pressed: [r(112, 0, 16, 16)], disabled: [r(128, 0, 16, 16)] },
    frameKinds: { idle: 'state', pressed: 'state', disabled: 'state' }, uiRequiredStates: ['idle', 'pressed', 'disabled'],
    uiSizing: 'fixed', tags: ['ui.button', 'ui.button.small'],
  },
  ...([
    ['bronze', 32], ['silver', 80], ['gold', 224],
  ] as const).map(([metal, y]): UiExtract => ({
    name: `ui_cf_coin_${metal}`, source: `${uiRoot}/UI_Buttons.png`, size: [16, 16],
    groups: { base: [r(96, y, 16, 16)] }, frameKinds: { base: 'state' },
    uiSizing: 'fixed', tags: ['ui.currency', 'ui.coin', `ui.material.${metal}`],
  })),
  {
    name: 'ui_cf_button_accent_green', source: `${uiRoot}/UI_Buttons.png`, size: [32, 16],
    groups: { idle: [r(0, 96, 32, 16)], pressed: [r(32, 96, 32, 16)], disabled: [r(64, 96, 32, 16)] },
    frameKinds: { idle: 'state', pressed: 'state', disabled: 'state' }, uiRequiredStates: ['idle', 'pressed', 'disabled'],
    uiSizing: 'nine_slice', slice: [7, 4, 7, 5], tags: ['ui.button', 'ui.intent.confirm'],
  },
  {
    name: 'ui_cf_button_accent_red', source: `${uiRoot}/UI_Buttons.png`, size: [32, 16],
    groups: { idle: [r(0, 240, 32, 16)], pressed: [r(32, 240, 32, 16)], disabled: [r(64, 240, 32, 16)] },
    frameKinds: { idle: 'state', pressed: 'state', disabled: 'state' }, uiRequiredStates: ['idle', 'pressed', 'disabled'],
    uiSizing: 'nine_slice', slice: [7, 4, 7, 5], tags: ['ui.button', 'ui.intent.deny'],
  },
  {
    name: 'ui_cf_selector_neutral', source: `${uiRoot}/UI_Selectors.png`, size: [48, 48],
    groups: state(r(0, 0, 48, 48)), frameKinds: { idle: 'state' }, uiRequiredStates: ['idle'],
    uiSizing: 'corners', tags: ['ui.selector', 'ui.intent.neutral'],
  },
  {
    name: 'ui_cf_selector_confirm', source: `${uiRoot}/UI_Selectors.png`, size: [48, 48],
    groups: state(r(0, 192, 48, 48)), frameKinds: { idle: 'state' }, uiRequiredStates: ['idle'],
    uiSizing: 'corners', tags: ['ui.selector', 'ui.intent.confirm'],
  },
  {
    name: 'ui_cf_selector_deny', source: `${uiRoot}/UI_Selectors.png`, size: [48, 48],
    groups: state(r(0, 384, 48, 48)), frameKinds: { idle: 'state' }, uiRequiredStates: ['idle'],
    uiSizing: 'corners', tags: ['ui.selector', 'ui.intent.deny'],
  },
  {
    name: 'ui_cf_selector_corners', source: `${uiRoot}/UI_Selectors.png`, size: [48, 48],
    groups: state(r(96, 0, 48, 48)), frameKinds: { idle: 'state' }, uiRequiredStates: ['idle'],
    uiSizing: 'corners', tags: ['ui.selector', 'ui.selector.corners'],
  },
  {
    name: 'ui_cf_slider_track', source: `${uiRoot}/UI_Sliders.png`, size: [32, 6],
    groups: { base: [r(8, 85, 32, 6)] }, frameKinds: { base: 'state' },
    uiSizing: 'segmented', tags: ['ui.slider', 'ui.slider.track'],
  },
  {
    name: 'ui_cf_slider_handle', source: `${uiRoot}/UI_Sliders.png`, size: [6, 14],
    groups: state(r(293, 81, 6, 14)), frameKinds: { idle: 'state' }, uiRequiredStates: ['idle'],
    uiSizing: 'fixed', tags: ['ui.slider', 'ui.slider.handle'],
  },
  {
    name: 'ui_cf_bar_frame', source: `${uiRoot}/UI_Bars.png`, size: [48, 19],
    groups: { base: [r(128, 6, 48, 19)] }, frameKinds: { base: 'state' },
    uiSizing: 'fixed', tags: ['ui.bar', 'ui.bar.frame', 'ui.player_resource_frame'],
  },
  ...([
    ['red', 1, 1], ['blue', 33, 1], ['green', 65, 1],
  ] as const).map(([color, x, y]): UiExtract => ({
    name: `ui_cf_bar_fill_${color}`, source: `${uiRoot}/UI_Bars.png`, size: [30, 5],
    groups: { base: [r(x, y, 30, 5)] }, frameKinds: { base: 'state' },
    uiSizing: 'fixed', tags: ['ui.bar', 'ui.bar.fill', `ui.color.${color}`],
  })),
  {
    name: 'ui_cf_bar_fill_gold', source: `${uiRoot}/UI_Sliders.png`, size: [30, 4],
    groups: { base: [r(105, 102, 30, 4)] }, frameKinds: { base: 'state' },
    uiSizing: 'segmented', tags: ['ui.bar', 'ui.bar.fill', 'ui.color.gold'],
  },
  {
    name: 'ui_cf_ribbon', source: `${uiRoot}/UI_Ribbons.png`, size: [64, 20],
    groups: { base: [r(8, 1, 64, 20)] }, frameKinds: { base: 'state' }, uiSizing: 'fixed', tags: ['ui.ribbon'],
  },
  {
    name: 'ui_cf_banner', source: `${uiRoot}/UI_Ribbons.png`, size: [78, 21],
    groups: { base: [r(97, 0, 78, 21)] }, frameKinds: { base: 'state' }, uiSizing: 'fixed', tags: ['ui.banner'],
  },
  {
    name: 'ui_cf_flag', source: `${uiRoot}/UI_Ribbons.png`, size: [78, 23],
    groups: { base: [r(209, 0, 78, 23)] }, frameKinds: { base: 'state' }, uiSizing: 'fixed', tags: ['ui.flag'],
  },
  {
    name: 'ui_cf_bubble', source: `${uiRoot}/UI_Pop_Up.png`, size: [20, 24],
    groups: { base: [r(14, 14, 20, 24)] }, frameKinds: { base: 'state' }, uiSizing: 'fixed', tags: ['ui.speech_bubble'],
  },
  {
    name: 'ui_cf_speech_bubble', source: `${uiRoot}/UI_Frames.png`, size: [28, 31],
    groups: { base: [r(202, 10, 28, 31)] }, frameKinds: { base: 'state' },
    uiSizing: 'nine_slice', slice: [6, 6, 6, 7], tags: ['ui.speech_bubble', 'ui.color.neutral'],
  },
  {
    name: 'ui_cf_speech_bubble_red', source: `${uiRoot}/UI_Frames.png`, size: [28, 31],
    groups: { base: [r(202, 250, 28, 31)] }, frameKinds: { base: 'state' },
    uiSizing: 'nine_slice', slice: [6, 6, 6, 7], tags: ['ui.speech_bubble', 'ui.color.red'],
  },
  {
    name: 'ui_cf_bubble_tail_down', source: `${uiRoot}/UI_Frames.png`, size: [32, 32],
    groups: { base: [r(780, 12, 24, 31)] }, frameKinds: { base: 'state' }, uiSizing: 'fixed', tags: ['ui.speech_bubble', 'ui.tail.down'],
  },
  {
    name: 'ui_cf_bubble_tail_up', source: `${uiRoot}/UI_Frames.png`, size: [32, 32],
    groups: { base: [r(780, 12, 24, 31, 2)] }, frameKinds: { base: 'state' }, uiSizing: 'fixed', tags: ['ui.speech_bubble', 'ui.tail.up', 'derived.rotation'],
  },
  {
    name: 'ui_cf_bubble_tail_left', source: `${uiRoot}/UI_Frames.png`, size: [32, 32],
    groups: { base: [r(726, 12, 30, 26)] }, frameKinds: { base: 'state' }, uiSizing: 'fixed', tags: ['ui.speech_bubble', 'ui.tail.left'],
  },
  {
    name: 'ui_cf_bubble_tail_right', source: `${uiRoot}/UI_Frames.png`, size: [32, 32],
    groups: { base: [r(726, 12, 30, 26, 2)] }, frameKinds: { base: 'state' }, uiSizing: 'fixed', tags: ['ui.speech_bubble', 'ui.tail.right', 'derived.rotation'],
  },
  {
    name: 'ui_cf_bubble_tail_down_red', source: `${uiRoot}/UI_Frames.png`, size: [32, 32],
    groups: { base: [r(780, 252, 24, 31)] }, frameKinds: { base: 'state' }, uiSizing: 'fixed', tags: ['ui.speech_bubble', 'ui.tail.down', 'ui.color.red'],
  },
  {
    name: 'ui_cf_bubble_tail_up_red', source: `${uiRoot}/UI_Frames.png`, size: [32, 32],
    groups: { base: [r(780, 252, 24, 31, 2)] }, frameKinds: { base: 'state' }, uiSizing: 'fixed', tags: ['ui.speech_bubble', 'ui.tail.up', 'ui.color.red', 'derived.rotation'],
  },
  {
    name: 'ui_cf_bubble_tail_left_red', source: `${uiRoot}/UI_Frames.png`, size: [32, 32],
    groups: { base: [r(726, 252, 30, 26)] }, frameKinds: { base: 'state' }, uiSizing: 'fixed', tags: ['ui.speech_bubble', 'ui.tail.left', 'ui.color.red'],
  },
  {
    name: 'ui_cf_bubble_tail_right_red', source: `${uiRoot}/UI_Frames.png`, size: [32, 32],
    groups: { base: [r(726, 252, 30, 26, 2)] }, frameKinds: { base: 'state' }, uiSizing: 'fixed', tags: ['ui.speech_bubble', 'ui.tail.right', 'ui.color.red', 'derived.rotation'],
  },
  {
    name: 'ui_cf_cursor', source: `${uiRoot}/UI_Icons.png`, size: [16, 16],
    groups: state(r(0, 224, 16, 16)), frameKinds: { idle: 'state' }, uiRequiredStates: ['idle'],
    uiSizing: 'fixed', tags: ['ui.cursor', 'ui.pointer'],
  },
  {
    name: 'icon_cf_effect_well_rested', source: `${uiRoot}/UI_Icons.png`, size: [8, 8],
    groups: { base: [r(24, 0, 8, 8)] }, frameKinds: { base: 'state' },
    uiSizing: 'fixed', tags: ['ui.icon', 'effect.well_rested'],
  },
  {
    name: 'icon_cf_effect_winded', source: `${uiRoot}/UI_Icons.png`, size: [8, 8],
    groups: { base: [r(64, 0, 8, 8)] }, frameKinds: { base: 'state' },
    uiSizing: 'fixed', tags: ['ui.icon', 'effect.winded'],
  },
  {
    name: 'icon_cf_effect_orchard_tea',
    source: 'references/Cute_Fantasy/Icons/Outline/Food_Icons_Outline.png', size: [16, 16],
    groups: { base: [r(16, 128, 16, 16)] }, frameKinds: { base: 'state' },
    uiSizing: 'fixed', tags: ['ui.icon', 'item.food', 'effect.orchard_tea'],
  },
  {
    name: 'ui_cf_cursor_click', source: `${uiRoot}/Pointer_Click_Anim.png`, size: [16, 16],
    groups: { click: [r(0, 0, 16, 16), r(16, 0, 16, 16), r(32, 0, 16, 16), r(48, 0, 16, 16)] },
    frameKinds: { click: 'animation' }, animationFps: { click: 12 }, animationLoop: { click: false },
    uiSizing: 'fixed', tags: ['ui.cursor', 'ui.pointer.click'],
  },
  {
    name: 'ui_cf_crosshair', source: `${uiRoot}/UI_Crosshairs.png`, size: [16, 16],
    groups: state(r(0, 0, 16, 16)), frameKinds: { idle: 'state' }, uiRequiredStates: ['idle'],
    uiSizing: 'fixed', tags: ['ui.cursor', 'ui.crosshair'],
  },
];

function nativeHex(image: DecodedPng, x: number, y: number): string | null {
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3] ?? 0;
  if (!alpha) return null;
  const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]
    .map((value) => (value ?? 0).toString(16).padStart(2, '0')).join('');
  return `#${rgb}${alpha === 255 ? '' : alpha.toString(16).padStart(2, '0')}`;
}

function cropPixels(image: DecodedPng, crop: Crop): readonly (readonly (string | null)[])[] {
  const [x, y, width, height] = crop.region;
  if (x < 0 || y < 0 || x + width > image.width || y + height > image.height) {
    throw new Error(`Crop ${crop.region.join(',')} leaves ${image.width}x${image.height}`);
  }
  let pixels = Array.from({ length: height }, (_, py) =>
    Array.from({ length: width }, (_, px) => nativeHex(image, x + px, y + py)));
  for (let turn = 0; turn < (crop.rotate ?? 0); turn += 1) {
    const oldHeight = pixels.length;
    const oldWidth = pixels[0]?.length ?? 0;
    pixels = Array.from({ length: oldWidth }, (_, py) =>
      Array.from({ length: oldHeight }, (_, px) => pixels[oldHeight - 1 - px]?.[py] ?? null));
  }
  return pixels;
}

function placePixels(
  pixels: readonly (readonly (string | null)[])[],
  size: readonly [number, number],
  characterByHex: ReadonlyMap<string, string>,
): string[] {
  const [width, height] = size;
  const sourceWidth = pixels[0]?.length ?? 0;
  const sourceHeight = pixels.length;
  if (sourceWidth > width || sourceHeight > height) throw new Error(`Rotated crop ${sourceWidth}x${sourceHeight} exceeds ${width}x${height}`);
  const originX = Math.floor((width - sourceWidth) / 2);
  const originY = Math.floor((height - sourceHeight) / 2);
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    const hex = pixels[y - originY]?.[x - originX];
    return hex ? characterByHex.get(hex) ?? '.' : '.';
  }).join(''));
}

const rootPath = fileURLToPath(workspaceRoot);
const palette = await loadPalette();
const availableCharacters = Object.keys(palette.colors);
const decoded = new Map<string, DecodedPng>();
for (const source of new Set(extracts.map((entry) => entry.source))) {
  decoded.set(source, decodePng(await readFile(resolve(rootPath, source))));
}

const outputRoot = resolve(rootPath, 'packages/assets/ui');
await mkdir(outputRoot, { recursive: true });
for (const extract of extracts) {
  const image = decoded.get(extract.source)!;
  const pixelsByGroup = Object.fromEntries(Object.entries(extract.groups).map(([group, crops]) => [
    group,
    crops.map((crop) => cropPixels(image, crop)),
  ]));
  const colors = [...new Set(Object.values(pixelsByGroup).flat(2).flatMap((row) => row.filter((hex): hex is string => Boolean(hex))))].sort();
  if (colors.length > availableCharacters.length) throw new Error(`${extract.name} uses ${colors.length} colors; maximum is ${availableCharacters.length}`);
  const characterByHex = new Map(colors.map((hex, index) => [hex, availableCharacters[index]!]));
  const sourcePalette = Object.fromEntries(colors.map((hex) => [characterByHex.get(hex)!, hex]));
  const frames = Object.fromEntries(Object.entries(pixelsByGroup).map(([group, groupFrames]) => [
    group,
    groupFrames.map((pixels) => placePixels(pixels, extract.size, characterByHex)),
  ]));
  const sourceRegions = Object.fromEntries(Object.entries(extract.groups).map(([group, crops]) => [
    group,
    crops.map((crop) => crop.region),
  ]));
  const asset: AssetSource = {
    name: extract.name,
    category: 'ui',
    size: extract.size,
    anchor: [Math.floor(extract.size[0] / 2), Math.floor(extract.size[1] / 2)],
    frames,
    frameKinds: extract.frameKinds,
    ...(extract.animationFps ? { animationFps: extract.animationFps } : {}),
    ...(extract.animationLoop ? { animationLoop: extract.animationLoop } : {}),
    sourcePalette,
    sourcePaletteMode: 'exact',
    approved: true,
    importedFrom: basename(extract.source),
    sourcePath: relative(rootPath, resolve(rootPath, extract.source)).replaceAll('\\', '/'),
    sourceRegions,
    ...(extract.slice ? { slice: extract.slice } : {}),
    uiSizing: extract.uiSizing,
    ...(extract.uiRequiredStates ? { uiRequiredStates: extract.uiRequiredStates } : {}),
    tags: extract.tags,
    placement: { layer: 'ui', builderAvailable: false },
  };
  const outputPath = resolve(outputRoot, `${extract.name}.sprite.json`);
  await writeFile(outputPath, `${JSON.stringify(asset, null, 2)}\n`);
  console.log(`${extract.name}: ${Object.values(frames).reduce((sum, group) => sum + group.length, 0)} frame(s), ${colors.length} native colors`);
}

console.log(`Extracted ${extracts.length} reviewed Cute Fantasy UI assets.`);
