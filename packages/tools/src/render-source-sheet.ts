import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, resolve } from 'node:path';
import { workspaceRoot } from './assets/load.js';
import { decodePng, encodePng, hexToRgba, setPixel } from './assets/png.js';

const [sourceArg, cellArg = '16x16', scaleArg = '4', rowsArg = '6'] = process.argv.slice(2);
if (!sourceArg) {
  throw new Error('Usage: tsx src/render-source-sheet.ts <source.png> [cell-width>x<cell-height>] [scale] [rows-per-page]');
}

const cellMatch = /^(\d+)x(\d+)$/.exec(cellArg);
if (!cellMatch) throw new Error(`Invalid cell size ${cellArg}; expected e.g. 16x16`);
const cellWidth = Number(cellMatch[1]);
const cellHeight = Number(cellMatch[2]);
const scale = Number(scaleArg);
const rowsPerPage = Number(rowsArg);
if (![cellWidth, cellHeight, scale, rowsPerPage].every(Number.isSafeInteger)) throw new Error('Dimensions must be integers');
if (Math.min(cellWidth, cellHeight, scale, rowsPerPage) < 1) throw new Error('Dimensions must be positive');

const rootPath = fileURLToPath(workspaceRoot);
const inputPath = resolve(rootPath, sourceArg);
const decoded = decodePng(await readFile(inputPath));
if (decoded.width % cellWidth || decoded.height % cellHeight) {
  throw new Error(`${decoded.width}x${decoded.height} is not divisible by ${cellWidth}x${cellHeight}`);
}

const columns = decoded.width / cellWidth;
const rows = decoded.height / cellHeight;
const gutter = 2;
const margin = 8;
const pageWidth = margin * 2 + columns * cellWidth * scale + (columns - 1) * gutter;
const checkerLight = hexToRgba('#d9c49a');
const checkerDark = hexToRgba('#969099');
const divider = hexToRgba('#352a33');
const outputRoot = resolve(rootPath, 'build/review');
await mkdir(outputRoot, { recursive: true });

for (let pageStart = 0; pageStart < rows; pageStart += rowsPerPage) {
  const pageRows = Math.min(rowsPerPage, rows - pageStart);
  const pageHeight = margin * 2 + pageRows * cellHeight * scale + (pageRows - 1) * gutter;
  const rgba = new Uint8Array(pageWidth * pageHeight * 4);

  for (let y = 0; y < pageHeight; y += 1) {
    for (let x = 0; x < pageWidth; x += 1) {
      const checker = (Math.floor(x / 8) + Math.floor(y / 8)) % 2;
      setPixel(rgba, pageWidth, x, y, checker ? checkerDark : checkerLight);
    }
  }

  for (let pageRow = 0; pageRow < pageRows; pageRow += 1) {
    const sourceRow = pageStart + pageRow;
    for (let column = 0; column < columns; column += 1) {
      const originX = margin + column * (cellWidth * scale + gutter);
      const originY = margin + pageRow * (cellHeight * scale + gutter);
      for (let cellY = 0; cellY < cellHeight; cellY += 1) {
        for (let cellX = 0; cellX < cellWidth; cellX += 1) {
          const sourceOffset = ((sourceRow * cellHeight + cellY) * decoded.width + column * cellWidth + cellX) * 4;
          const alpha = decoded.rgba[sourceOffset + 3] ?? 0;
          if (!alpha) continue;
          const color = [
            decoded.rgba[sourceOffset] ?? 0,
            decoded.rgba[sourceOffset + 1] ?? 0,
            decoded.rgba[sourceOffset + 2] ?? 0,
            alpha,
          ] as const;
          for (let scaleY = 0; scaleY < scale; scaleY += 1) {
            for (let scaleX = 0; scaleX < scale; scaleX += 1) {
              setPixel(rgba, pageWidth, originX + cellX * scale + scaleX, originY + cellY * scale + scaleY, color);
            }
          }
        }
      }
    }

    if (pageRow < pageRows - 1) {
      const y = margin + (pageRow + 1) * cellHeight * scale + pageRow * gutter;
      for (let x = 0; x < pageWidth; x += 1) setPixel(rgba, pageWidth, x, y, divider);
    }
  }

  const stem = basename(inputPath, '.png').replaceAll(/[^a-zA-Z0-9_-]/g, '-');
  const outputPath = resolve(outputRoot, `${stem}-rows-${String(pageStart).padStart(2, '0')}-${String(pageStart + pageRows - 1).padStart(2, '0')}.png`);
  await writeFile(outputPath, encodePng(pageWidth, pageHeight, rgba));
  console.log(`${outputPath} (rows ${pageStart}-${pageStart + pageRows - 1}, columns 0-${columns - 1})`);
}
