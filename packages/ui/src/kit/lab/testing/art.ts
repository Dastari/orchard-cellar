/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { vi } from 'vitest';
import type { LoadedAsset } from '../../../assets.js';
import type { AtlasFrame } from '../../../sprite.js';
import { UI_ICON_NAMES, type UiIconSet } from '../../../skin.js';
import { UI_LUCIDE_FILES } from '../../skin/lucide.js';
import { createUiSkinLoader } from '../../skin/load.js';
import type { UiKitArt } from '../../components/art.js';
interface Source {
  readonly name: string; readonly size: readonly [number, number]; readonly frames: Readonly<Record<string, readonly (readonly string[])[]>>;
  readonly sourcePalette?: Readonly<Record<string, string>>; readonly charset?: string;
  readonly glyphSize?: readonly [number, number]; readonly cellSize?: readonly [number, number]; readonly columns?: number;
}
const assets = new Map<string, LoadedAsset>();
export function uiTestAsset(name: string, category = name.startsWith('font_') ? 'fonts' : 'ui'): LoadedAsset {
  const cached = assets.get(name); if (cached) return cached;
  const source = JSON.parse(readFileSync(new URL(`../../../../../assets/${category}/${name}.${category === 'tiles' ? 'tile' : 'sprite'}.json`, import.meta.url), 'utf8')) as Source;
  const palette = source.sourcePalette ?? (JSON.parse(readFileSync(new URL('../../../../../assets/palette.json', import.meta.url), 'utf8')) as { colors: Record<string, string> }).colors;
  const count = Object.values(source.frames).reduce((sum, frames) => sum + frames.length, 0);
  const canvas = createCanvas(source.size[0], source.size[1] * count), context = canvas.getContext('2d');
  const animations: Record<string, AtlasFrame[]> = {}; let offset = 0;
  for (const [group, frames] of Object.entries(source.frames)) {
    animations[group] = [];
    for (const frame of frames) {
      for (let y = 0; y < source.size[1]; y++) for (let x = 0; x < source.size[0]; x++) {
        const key = frame[y]![x]!; if (key === '.') continue;
        const color = palette[key]; if (!color) throw new Error(`Missing test art palette ${name}/${key}`);
        context.fillStyle = color; context.fillRect(x, y + offset, 1, 1);
      }
      animations[group]!.push({ x: 0, y: offset, width: source.size[0], height: source.size[1], durationTicks: 5 }); offset += source.size[1];
    }
  }
  const asset: LoadedAsset = { assetId: assets.size + 1, name, image: canvas as unknown as CanvasImageSource, anchor: [0, 0], collision: [], tags: [], placement: { layer: 'ui', footprint: [1, 1], blocksMovement: false, builderAvailable: false }, atlasRevision: 1,
    metadata: { image: name, animations },
    font: source.charset ? { charset: source.charset, glyphSize: source.glyphSize!, cellSize: source.cellSize!, columns: source.columns! } : undefined };
  assets.set(name, asset); return asset;
}
export async function uiTestArt(): Promise<UiKitArt> {
  vi.stubGlobal('document', { createElement: (tag: string) => { if (tag !== 'canvas') throw new Error(`Unexpected test DOM: ${tag}`); return createCanvas(1, 1); } });
  const skin = await createUiSkinLoader(async name => uiTestAsset(name))(['frame', 'button', 'book', 'icon', 'slot', 'meter', 'cursor', 'feedback', 'slider', 'toggle', 'selector', 'equipment']);
  const entries = await Promise.all(UI_ICON_NAMES.map(async name => {
    const image = await loadImage(readFileSync(new URL(`../../../../public/ui/lucide/${UI_LUCIDE_FILES[name]}`, import.meta.url)));
    return [name, { image: image as unknown as CanvasImageSource, width: image.width, height: image.height }] as const;
  }));
  return { skin, pixel: { font: uiTestAsset('font_5x7'), headerFont: uiTestAsset('font_8x12'), panel: uiTestAsset('ui_cf_panel_wood') }, icons: Object.fromEntries(entries) as UiIconSet };
}
