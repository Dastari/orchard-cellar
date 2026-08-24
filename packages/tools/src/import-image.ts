import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetsRoot, loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng } from './assets/png.js';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function srgb(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function oklab(red: number, green: number, blue: number): readonly [number, number, number] {
  const r = srgb(red); const g = srgb(green); const b = srgb(blue);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lRoot = Math.cbrt(l); const mRoot = Math.cbrt(m); const sRoot = Math.cbrt(s);
  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  ];
}

const input = process.argv[2];
const name = option('--name');
const size = option('--size');
const cropOption = option('--crop');
const crop = cropOption ?? '0,0';
const sourceSizeOption = option('--source-size');
const frameGridOption = option('--frame-grid');
const frameStrideOption = option('--frame-stride');
const animationNamesOption = option('--animation-names');
const frameOrderOption = option('--frame-order');
const fpsOption = option('--fps');
const category = option('--category') ?? 'tiles';
if (!input || !name || !size) throw new Error('Usage: assets:import <png> --size WxH --name foo [--crop x,y] [--category tiles]');
const [targetWidth, targetHeight] = size.split('x').map(Number);
const [cropX, cropY] = crop.split(',').map(Number);
if (!targetWidth || !targetHeight || cropX === undefined || cropY === undefined) throw new Error('Invalid size or crop');
const outputWidth = targetWidth;
const outputHeight = targetHeight;

const inputPath = isAbsolute(input) ? input : resolve(fileURLToPath(workspaceRoot), input);
const [decoded, palette] = await Promise.all([decodePng(await readFile(inputPath)), loadPalette()]);
const [sourceWidth, sourceHeight] = sourceSizeOption
  ? sourceSizeOption.split('x').map(Number)
  : cropOption ? [targetWidth, targetHeight] : [decoded.width - cropX, decoded.height - cropY];
if (!sourceWidth || !sourceHeight) throw new Error('Invalid source size');
const inputFrameWidth = sourceWidth;
const inputFrameHeight = sourceHeight;
const paletteLabs = Object.entries(palette.colors).map(([character, hex]) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return { character, lab: oklab((value >>> 16) & 255, (value >>> 8) & 255, value & 255) };
});
function buildFrame(originX: number, originY: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < outputHeight; y += 1) {
    let row = '';
    for (let x = 0; x < outputWidth; x += 1) {
      const sourceX = Math.min(decoded.width - 1, originX + Math.floor((x + 0.5) * inputFrameWidth / outputWidth));
      const sourceY = Math.min(decoded.height - 1, originY + Math.floor((y + 0.5) * inputFrameHeight / outputHeight));
      const offset = (sourceY * decoded.width + sourceX) * 4;
      if ((decoded.rgba[offset + 3] ?? 0) < 128) { row += '.'; continue; }
      const sourceLab = oklab(decoded.rgba[offset] ?? 0, decoded.rgba[offset + 1] ?? 0, decoded.rgba[offset + 2] ?? 0);
      let nearest = paletteLabs[0]!;
      let distance = Number.POSITIVE_INFINITY;
      for (const candidate of paletteLabs) {
        const next = (sourceLab[0] - candidate.lab[0]) ** 2 + (sourceLab[1] - candidate.lab[1]) ** 2 + (sourceLab[2] - candidate.lab[2]) ** 2;
        if (next < distance) { nearest = candidate; distance = next; }
      }
      row += nearest.character;
    }
    rows.push(row);
  }
  const cleanedRows = rows.map((row) => [...row]);
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const character = cleanedRows[y]?.[x] ?? '.';
      if (character === '.') continue;
      const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const;
      if (neighbors.some(([nx, ny]) => cleanedRows[ny]?.[nx] === character)) continue;
      const replacement = neighbors.map(([nx, ny]) => cleanedRows[ny]?.[nx] ?? '.').find((candidate) => candidate !== '.') ?? '.';
      cleanedRows[y]![x] = replacement;
    }
  }
  return cleanedRows.map((row) => row.join(''));
}

let frames: Readonly<Record<string, readonly string[][]>> = { base: [buildFrame(cropX, cropY)] };
if (frameGridOption) {
  const [frameColumns, frameRows] = frameGridOption.split('x').map(Number);
  const [strideX, strideY] = (frameStrideOption ?? `${inputFrameWidth}x${inputFrameHeight}`).split('x').map(Number);
  const animationNames = animationNamesOption?.split(',').filter(Boolean) ?? [];
  if (!frameColumns || !frameRows || !strideX || !strideY || (animationNames.length !== 1 && animationNames.length !== frameRows)) {
    throw new Error('--frame-grid requires CxR, --frame-stride WxH, and either one flattened animation name or one name per row');
  }
  if (animationNames.length === 1) {
    const gridFrames = Array.from({ length: frameColumns * frameRows }, (_, index) => {
      const column = index % frameColumns;
      const row = Math.floor(index / frameColumns);
      return buildFrame(cropX + column * strideX, cropY + row * strideY);
    });
    const frameOrder = frameOrderOption?.split(',').map(Number) ?? gridFrames.map((_, index) => index);
    if (frameOrder.some((index) => !Number.isInteger(index) || index < 0 || index >= gridFrames.length)) {
      throw new Error('--frame-order contains an index outside the source frame grid');
    }
    frames = { [animationNames[0]!]: frameOrder.map((index) => gridFrames[index]!) };
  } else {
    if (frameOrderOption) throw new Error('--frame-order is only supported with one flattened animation name');
    frames = Object.fromEntries(animationNames.map((animation, row) => [
      animation,
      Array.from({ length: frameColumns }, (_, column) => buildFrame(cropX + column * strideX, cropY + row * strideY)),
    ]));
  }
}
const source = {
  name,
  category,
  size: [targetWidth, targetHeight],
  anchor: [Math.floor(targetWidth / 2), targetHeight - 1],
  frames,
  ...(fpsOption ? { fps: Number(fpsOption) } : {}),
  approved: false,
  importedFrom: basename(input),
};
const directory = new URL(`${category}/`, assetsRoot);
await mkdir(directory, { recursive: true });
const suffix = category === 'tiles' ? 'tile' : 'sprite';
const output = new URL(`${name}.${suffix}.json`, directory);
await writeFile(output, `${JSON.stringify(source, null, 2)}\n`);
console.log(`Wrote palette-snapped draft ${fileURLToPath(output)}`);
