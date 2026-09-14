import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, hexToRgba, setPixel, type DecodedPng } from './assets/png.js';

interface SpriteSource {
  readonly frames: Readonly<Record<string, readonly (readonly string[])[]>>;
}

interface PaletteSource {
  readonly colors: Readonly<Record<string, string>>;
}

const workspace = path.resolve(import.meta.dirname, '../../..');
const outputRoot = path.join(workspace, 'packages/client/public/pwa');
const iconRoot = path.join(outputRoot, 'icons');
const splashRoot = path.join(outputRoot, 'splash');
const apple = JSON.parse(await readFile(path.join(workspace, 'packages/assets/ui/icon_resource_fruit.sprite.json'), 'utf8')) as SpriteSource;
const palette = JSON.parse(await readFile(path.join(workspace, 'packages/assets/palette.json'), 'utf8')) as PaletteSource;
const appleFrame = apple.frames.base?.[0];
if (appleFrame === undefined) throw new Error('icon_resource_fruit has no base frame');
const appleRows: readonly string[] = appleFrame;

type Rgba = readonly [number, number, number, number];
const color = (hex: string): Rgba => hexToRgba(hex);
const GRASS = color('#65954f');
const GRASS_DARK = color('#4f8343');
const GRASS_LIGHT = color('#79a85e');

function fill(rgba: Uint8Array, width: number, height: number, fillColor: Rgba): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) setPixel(rgba, width, x, y, fillColor);
  }
}

function fillRect(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  fillColor: Rgba,
): void {
  for (let row = 0; row < rectHeight; row += 1) {
    for (let column = 0; column < rectWidth; column += 1) {
      setPixel(rgba, width, x + column, y + row, fillColor);
    }
  }
}

function drawApple(rgba: Uint8Array, width: number, height: number, scale: number): void {
  const spriteWidth = appleRows[0]?.length ?? 16;
  const spriteHeight = appleRows.length;
  const left = Math.floor((width - spriteWidth * scale) / 2);
  const top = Math.floor((height - spriteHeight * scale) / 2);
  for (let sourceY = 0; sourceY < spriteHeight; sourceY += 1) {
    const row = appleRows[sourceY]!;
    for (let sourceX = 0; sourceX < spriteWidth; sourceX += 1) {
      const symbol = row[sourceX];
      if (symbol === undefined || symbol === '.') continue;
      const hex = palette.colors[symbol];
      if (hex === undefined) throw new Error(`Apple uses unknown palette symbol ${symbol}`);
      fillRect(rgba, width, left + sourceX * scale, top + sourceY * scale, scale, scale, color(hex));
    }
  }
}

function iconPng(size: number, maskable: boolean): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  fill(rgba, size, size, GRASS);
  const detail = Math.max(1, Math.floor(size / 64));
  fillRect(rgba, size, detail * 7, size - detail * 12, detail * 3, detail, GRASS_DARK);
  fillRect(rgba, size, size - detail * 13, detail * 9, detail * 2, detail * 3, GRASS_LIGHT);
  const desired = size * (maskable ? 0.5 : 0.68);
  const scale = Math.max(1, Math.floor(desired / 16));
  drawApple(rgba, size, size, scale);
  return encodePng(size, size, rgba);
}

function transparentApplePng(size: number): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  drawApple(rgba, size, size, Math.max(1, Math.floor(size / 16)));
  return encodePng(size, size, rgba);
}

/** Center-cover the same island image as account/loading views without any
 * interpolated source colors. Tint matches rgba(16,24,19,0.18) in those views. */
export function pwaSplashBackground(source: DecodedPng, width: number, height: number): Uint8Array {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || source.width < 1 || source.height < 1 || source.rgba.length !== source.width * source.height * 4) {
    throw new Error('Invalid PWA splash dimensions');
  }
  const rgba = new Uint8Array(width * height * 4);
  const scale = Math.max(width / source.width, height / source.height);
  const tint = [16, 24, 19] as const;
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.max(0, Math.min(source.height - 1, Math.floor((y + 0.5 - height / 2) / scale + source.height / 2)));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.max(0, Math.min(source.width - 1, Math.floor((x + 0.5 - width / 2) / scale + source.width / 2)));
      const from = (sourceY * source.width + sourceX) * 4;
      const to = (y * width + x) * 4;
      const opacity = source.rgba[from + 3]! / 255 * 0.82;
      for (let channel = 0; channel < 3; channel += 1) {
        rgba[to + channel] = Math.round(source.rgba[from + channel]! * opacity + tint[channel]! * (1 - opacity));
      }
      rgba[to + 3] = 255;
    }
  }
  return rgba;
}

function splashPng(source: DecodedPng, width: number, height: number): Buffer {
  const rgba = pwaSplashBackground(source, width, height);
  const scale = Math.max(4, Math.floor(Math.min(width, height) * 0.18 / 16));
  drawApple(rgba, width, height, scale);
  return encodePng(width, height, rgba);
}

/** CSS viewport dimensions and DPRs used by iPhone/iPad Home Screen apps.
 * Both orientations are emitted below from these canonical portrait entries. */
const launchViewports = [
  [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3],
  [414, 896, 2], [414, 896, 3], [390, 844, 3], [428, 926, 3],
  [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3],
  [768, 1024, 2], [834, 1112, 2], [834, 1194, 2], [1024, 1366, 2],
  [820, 1180, 2], [744, 1133, 2], [1032, 1376, 2],
] as const;

export async function buildPwaAssets(): Promise<void> {
  const island = decodePng(await readFile(path.join(workspace, 'packages/client/public/ui/island-background.png')));
  await Promise.all([mkdir(iconRoot, { recursive: true }), mkdir(splashRoot, { recursive: true })]);
  await Promise.all([
    writeFile(path.join(iconRoot, 'favicon-16.png'), transparentApplePng(16)),
    writeFile(path.join(iconRoot, 'favicon-32.png'), transparentApplePng(32)),
    writeFile(path.join(iconRoot, 'apple-touch-icon.png'), iconPng(180, false)),
    writeFile(path.join(iconRoot, 'apple-192.png'), iconPng(192, false)),
    writeFile(path.join(iconRoot, 'apple-512.png'), iconPng(512, false)),
    writeFile(path.join(iconRoot, 'apple-maskable-192.png'), iconPng(192, true)),
    writeFile(path.join(iconRoot, 'apple-maskable-512.png'), iconPng(512, true)),
  ]);

  const generatedSizes = new Set<string>();
  for (const [cssWidth, cssHeight, dpr] of launchViewports) {
    for (const [width, height] of [[cssWidth * dpr, cssHeight * dpr], [cssHeight * dpr, cssWidth * dpr]] as const) {
      const key = `${width}x${height}`;
      if (generatedSizes.has(key)) continue;
      generatedSizes.add(key);
      await writeFile(path.join(splashRoot, `${key}.png`), splashPng(island, width, height));
    }
  }

  console.log(`Built ${7 + generatedSizes.size} PWA images in ${path.relative(workspace, outputRoot)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildPwaAssets();
