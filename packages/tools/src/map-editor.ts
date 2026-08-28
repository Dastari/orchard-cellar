import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  applyMapEdit,
  compileMapDocument,
  createEmptyMapDocument,
  createTerrainLabDocument,
  MAP_RESIZE_ANCHORS,
  mapDocumentHash,
  parseMapDocument,
  semanticTerrainTraceAt,
  serializeMapDocument,
  validateMapDocument,
  type MapCellPatch,
  type MapDocumentV2,
  type MapFeatureKind,
  type MapPoint,
  type MapResizeAnchor,
  type MapCollisionOverride,
  type MapSurfaceKind,
} from '@orchard/sim';

const [command, ...parameters] = process.argv.slice(2);

function usage(): never {
  throw new Error([
    'Map editor commands:',
    '  create <terrain-lab|empty> <output.json> [width height]',
    '  stroke <input.json> <output.json> <x1> <y1> <x2> <y2> <field> <value>',
    '  contour <input.json> <output.json> <delta> <x,y> <x,y> <x,y> [...]',
    '  resize <input.json> <output.json> <width> <height> <anchor>',
    '  validate <input.json>',
    '  render <input.json> <output.svg>',
    '  inspect <input.json> <x> <y>',
    '  diff <left.json> <right.json>',
  ].join('\n'));
}

function required(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) throw new Error(`Missing ${label}`);
  return value;
}

function integer(value: string | undefined, label: string): number {
  const parsed = Number(required(value, label));
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}

async function readMap(path: string): Promise<MapDocumentV2> {
  return parseMapDocument(await readFile(resolve(path), 'utf8'));
}

async function writeMap(path: string, document: MapDocumentV2): Promise<void> {
  await writeFile(resolve(path), serializeMapDocument(document), 'utf8');
  console.log(`${path} ${mapDocumentHash(document)}`);
}

function patchFrom(field: string, value: string): MapCellPatch {
  if (field === 'elevation') return { elevation: integer(value, 'elevation') };
  if (field === 'surface') return { surface: value as MapSurfaceKind };
  if (field === 'feature') return { feature: value as MapFeatureKind };
  if (field === 'collision') return {
    collision: value as MapCollisionOverride,
    collisionReason: 'headless map command',
  };
  throw new Error(`Unknown stroke field: ${field}`);
}

function point(value: string): MapPoint {
  const [tileX, tileY] = value.split(',').map(Number);
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) throw new Error(`Invalid point ${value}`);
  return { tileX: tileX!, tileY: tileY! };
}

function resizeAnchor(value: string | undefined): MapResizeAnchor {
  const candidate = required(value, 'resize anchor') as MapResizeAnchor;
  if (!MAP_RESIZE_ANCHORS.includes(candidate)) {
    throw new Error(`Resize anchor must be one of: ${MAP_RESIZE_ANCHORS.join(', ')}`);
  }
  return candidate;
}

const SVG_COLORS: Readonly<Record<MapSurfaceKind, string>> = {
  grass: '#3e8948', sand: '#e4a672', stone: '#67718c', cave_floor: '#614142',
  water: '#0789d1', dirt: '#9c6754',
};

function renderMapSvg(document: MapDocumentV2): string {
  const compiled = compileMapDocument(document);
  const scale = 8;
  const rectangles: string[] = [];
  for (let tileY = 0; tileY < compiled.height; tileY += 1) {
    for (let tileX = 0; tileX < compiled.width; tileX += 1) {
      const index = tileY * compiled.width + tileX;
      const elevation = compiled.elevations[index] ?? 0;
      const surface = compiled.surfaces[index] ?? 'grass';
      const lightness = Math.max(0.55, Math.min(1.35, 0.8 + elevation * 0.08));
      rectangles.push(`<rect x="${tileX * scale}" y="${tileY * scale}" width="${scale}" height="${scale}" fill="${SVG_COLORS[surface]}" style="filter:brightness(${lightness})"/>`);
      const east = tileX + 1 < compiled.width ? compiled.elevations[index + 1] : elevation;
      const south = tileY + 1 < compiled.height ? compiled.elevations[index + compiled.width] : elevation;
      if (east !== elevation) rectangles.push(`<path d="M${(tileX + 1) * scale} ${tileY * scale}v${scale}" stroke="#18231d"/>`);
      if (south !== elevation) rectangles.push(`<path d="M${tileX * scale} ${(tileY + 1) * scale}h${scale}" stroke="#18231d"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${compiled.width * scale} ${compiled.height * scale}" shape-rendering="crispEdges">\n${rectangles.join('\n')}\n</svg>\n`;
}

async function run(): Promise<void> {
  if (command === 'create') {
    const kind = required(parameters[0], 'map kind');
    const output = required(parameters[1], 'output path');
    const document = kind === 'terrain-lab' ? createTerrainLabDocument()
      : kind === 'empty' ? createEmptyMapDocument({
        id: 'offline-map', title: 'Offline Map',
        width: parameters[2] === undefined ? 64 : integer(parameters[2], 'width'),
        height: parameters[3] === undefined ? 64 : integer(parameters[3], 'height'),
      }) : usage();
    await writeMap(output, document);
    return;
  }
  if (command === 'stroke') {
    const document = await readMap(required(parameters[0], 'input path'));
    const result = applyMapEdit(document, {
      kind: 'line',
      from: { tileX: integer(parameters[2], 'x1'), tileY: integer(parameters[3], 'y1') },
      to: { tileX: integer(parameters[4], 'x2'), tileY: integer(parameters[5], 'y2') },
      patch: patchFrom(required(parameters[6], 'field'), required(parameters[7], 'value')),
    });
    await writeMap(required(parameters[1], 'output path'), result.document);
    return;
  }
  if (command === 'contour') {
    const document = await readMap(required(parameters[0], 'input path'));
    const result = applyMapEdit(document, {
      kind: 'change_elevation_polygon', delta: integer(parameters[2], 'delta'),
      polygon: parameters.slice(3).map(point),
    });
    await writeMap(required(parameters[1], 'output path'), result.document);
    return;
  }
  if (command === 'resize') {
    const document = await readMap(required(parameters[0], 'input path'));
    const result = applyMapEdit(document, {
      kind: 'resize',
      width: integer(parameters[2], 'width'),
      height: integer(parameters[3], 'height'),
      anchor: resizeAnchor(parameters[4]),
    });
    await writeMap(required(parameters[1], 'output path'), result.document);
    return;
  }
  if (command === 'validate') {
    const document = await readMap(required(parameters[0], 'input path'));
    const issues = validateMapDocument(document);
    console.log(JSON.stringify({ hash: mapDocumentHash(document), issues }, null, 2));
    if (issues.some((issue) => issue.severity === 'error')) process.exitCode = 1;
    return;
  }
  if (command === 'render') {
    const document = await readMap(required(parameters[0], 'input path'));
    await writeFile(resolve(required(parameters[1], 'output path')), renderMapSvg(document), 'utf8');
    console.log(`${parameters[1]} ${mapDocumentHash(document)}`);
    return;
  }
  if (command === 'inspect') {
    const document = await readMap(required(parameters[0], 'input path'));
    console.log(JSON.stringify(semanticTerrainTraceAt(
      document, integer(parameters[1], 'x'), integer(parameters[2], 'y'),
    ), null, 2));
    return;
  }
  if (command === 'diff') {
    const left = await readMap(required(parameters[0], 'left path'));
    const right = await readMap(required(parameters[1], 'right path'));
    const keys = new Set([...Object.keys(left.cells), ...Object.keys(right.cells)]);
    const cells = [...keys].filter((key) => JSON.stringify(left.cells[key]) !== JSON.stringify(right.cells[key])).sort();
    console.log(JSON.stringify({
      left: mapDocumentHash(left), right: mapDocumentHash(right),
      changedCells: cells, transitionCount: right.transitions.length - left.transitions.length,
    }, null, 2));
    return;
  }
  usage();
}

await run();
