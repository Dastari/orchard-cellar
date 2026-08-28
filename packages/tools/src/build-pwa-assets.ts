import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encodePng, hexToRgba, setPixel } from './assets/png.js';

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
const SKY = color('#83bbcf');
const SKY_LIGHT = color('#c8ecf4');
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

function drawCloud(rgba: Uint8Array, width: number, x: number, y: number, unit: number): void {
  fillRect(rgba, width, x + unit, y, unit * 3, unit, SKY_LIGHT);
  fillRect(rgba, width, x, y + unit, unit * 5, unit * 2, SKY_LIGHT);
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

function splashPng(width: number, height: number): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  fill(rgba, width, height, SKY);
  const horizon = Math.round(height * 0.44);
  fillRect(rgba, width, 0, horizon, width, height - horizon, GRASS);
  const unit = Math.max(2, Math.round(Math.min(width, height) / 180));
  for (let x = 0; x < width; x += unit * 7) {
    const rise = ((x / (unit * 7)) % 3) * unit;
    fillRect(rgba, width, x, horizon - unit - rise, unit * 2, unit * 2 + rise, GRASS_DARK);
  }
  drawCloud(rgba, width, Math.round(width * 0.1), Math.round(height * 0.12), unit * 3);
  drawCloud(rgba, width, Math.round(width * 0.78), Math.round(height * 0.19), unit * 2);
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
    await writeFile(path.join(splashRoot, `${key}.png`), splashPng(width, height));
  }
}

console.log(`Built ${7 + generatedSizes.size} PWA images in ${path.relative(workspace, outputRoot)}`);
