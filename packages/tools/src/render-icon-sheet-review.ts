import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { decodePng, encodePng, setPixel } from './assets/png.js';

const input = process.argv[2];
const columns = Number(process.argv[3]);
const rows = Number(process.argv[4]);
const output = process.argv[5];
if (!input || !output || !Number.isInteger(columns) || !Number.isInteger(rows) || columns <= 0 || rows <= 0) {
  throw new Error('Usage: render-icon-sheet-review <input.png> <columns> <rows> <output.png>');
}

const source = decodePng(await readFile(resolve(input)));
if (source.width % columns !== 0 || source.height % rows !== 0) {
  throw new Error(`${input} is not evenly divisible by a ${columns}x${rows} grid`);
}

const glyphs: Readonly<Record<string, readonly string[]>> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  ',': ['000', '000', '000', '010', '100'],
};

const scale = 4;
const gutter = 8;
const labelHeight = 10;
const sourceCellWidth = source.width / columns;
const sourceCellHeight = source.height / rows;
const cellWidth = sourceCellWidth * scale + gutter;
const cellHeight = sourceCellHeight * scale + gutter + labelHeight;
const width = columns * cellWidth;
const height = rows * cellHeight;
const rgba = new Uint8Array(width * height * 4);

for (let offset = 0; offset < rgba.length; offset += 4) {
  rgba[offset] = 26;
  rgba[offset + 1] = 20;
  rgba[offset + 2] = 29;
  rgba[offset + 3] = 255;
}

function drawLabel(text: string, originX: number, originY: number): void {
  let cursorX = originX;
  for (const character of text) {
    const glyph = glyphs[character];
    if (glyph === undefined) continue;
    for (let y = 0; y < glyph.length; y += 1) for (let x = 0; x < 3; x += 1) {
      if (glyph[y]?.[x] !== '1') continue;
      setPixel(rgba, width, cursorX + x, originY + y, [246, 226, 197, 255]);
    }
    cursorX += 4;
  }
}

for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
  const destinationX = column * cellWidth + gutter / 2;
  const destinationY = row * cellHeight + gutter / 2;
  for (let y = 0; y < sourceCellHeight; y += 1) for (let x = 0; x < sourceCellWidth; x += 1) {
    const sourceOffset = ((row * sourceCellHeight + y) * source.width + column * sourceCellWidth + x) * 4;
    for (let scaleY = 0; scaleY < scale; scaleY += 1) for (let scaleX = 0; scaleX < scale; scaleX += 1) {
      setPixel(rgba, width, destinationX + x * scale + scaleX, destinationY + y * scale + scaleY, [
        source.rgba[sourceOffset] ?? 0,
        source.rgba[sourceOffset + 1] ?? 0,
        source.rgba[sourceOffset + 2] ?? 0,
        source.rgba[sourceOffset + 3] ?? 0,
      ]);
    }
  }
  drawLabel(`${column},${row}`, destinationX, destinationY + sourceCellHeight * scale + 3);
}

await mkdir(dirname(resolve(output)), { recursive: true });
await writeFile(resolve(output), encodePng(width, height, rgba));
console.log(resolve(output));
