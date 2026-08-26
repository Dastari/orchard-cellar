import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, type DecodedPng } from './assets/png.js';
import { workspaceRoot } from './assets/load.js';
import { stableAssetId } from './assets/asset-id.js';

type AssetCategory = 'terrain' | 'character' | 'enemy' | 'animal' | 'vegetation' | 'building' | 'prop' | 'equipment' | 'ui' | 'effect' | 'unknown';
type SplitMode = 'grid' | 'whole' | 'components';

export interface GridRecommendation {
  readonly mode: SplitMode;
  readonly cell: readonly [number, number] | null;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

interface Bounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

interface CatalogCell {
  readonly index: number;
  readonly source: Bounds;
  readonly hash: string;
  readonly alphaCoverage: number;
  readonly opaqueBounds: Bounds | null;
  readonly alphaConnections: readonly string[];
  readonly duplicateOf: number | null;
}

interface BlobCell {
  readonly sourceIndex: number;
  readonly source: Bounds;
  readonly canonicalIndex: number;
  readonly cardinals: number;
  readonly diagonalChoice: number;
  readonly role: string;
  readonly confidence: number;
}

interface CatalogSheet {
  readonly id: string;
  readonly source: string;
  readonly pack: string;
  readonly width: number;
  readonly height: number;
  readonly hash: string;
  readonly duplicateOf: string | null;
  readonly category: AssetCategory;
  readonly animated: boolean;
  readonly recommendation: GridRecommendation;
  readonly cells: readonly CatalogCell[];
  readonly blob47: readonly BlobCell[] | null;
}

interface Catalog {
  readonly version: 1;
  readonly generatedAt: string;
  readonly sourcePattern: string;
  readonly summary: Readonly<Record<string, unknown>>;
  readonly sheets: readonly CatalogSheet[];
}

interface SpacetimeAssetDefinitionRow {
  readonly assetId: number;
  readonly assetKey: string;
  readonly kind: number;
  readonly topology: number;
  readonly variantCount: number;
  readonly footprintWidth: number;
  readonly footprintHeight: number;
  readonly flags: number;
  readonly catalogRevision: number;
}

interface SpacetimeAssetTagRow {
  readonly assetTagId: string;
  readonly assetId: number;
  readonly tag: string;
}

interface AuthoringRegistry {
  readonly version: 1;
  readonly authoritative: false;
  readonly catalogRevision: number;
  readonly storage: {
    readonly visuals: 'reference_pngs';
    readonly authority: 'authoring_review';
    readonly variantResolution: 'catalog_recipe';
  };
  readonly assetDefinitions: readonly SpacetimeAssetDefinitionRow[];
  readonly assetTags: readonly SpacetimeAssetTagRow[];
  readonly aliases: readonly { readonly aliasKey: string; readonly assetId: number }[];
  readonly clientSets: readonly {
    readonly assetId: number;
    readonly assetKey: string;
    readonly source: string;
    readonly sourceHash: string;
    readonly frameSize: readonly [number, number];
    readonly variantCount: number;
    readonly reviewState: 'needs_review';
  }[];
}

const rootPath = fileURLToPath(workspaceRoot);
const referencesPath = resolve(rootPath, 'references');
const defaultOutput = resolve(rootPath, 'build/cute-fantasy-catalog');

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function slash(path: string): string { return path.split(sep).join('/'); }
function round(value: number): number { return Math.round(value * 1_000) / 1_000; }
function sha(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex').slice(0, 20); }

function pixelOffset(image: DecodedPng, x: number, y: number): number { return (y * image.width + x) * 4; }

function pixel(image: DecodedPng, x: number, y: number): readonly [number, number, number, number] {
  const offset = pixelOffset(image, x, y);
  return [image.rgba[offset] ?? 0, image.rgba[offset + 1] ?? 0, image.rgba[offset + 2] ?? 0, image.rgba[offset + 3] ?? 0];
}

function colorKey(color: readonly number[]): string { return color.join(','); }
function colorDistance(left: readonly number[], right: readonly number[]): number {
  return (left[0]! - right[0]!) ** 2 + (left[1]! - right[1]!) ** 2
    + (left[2]! - right[2]!) ** 2 + (left[3]! - right[3]!) ** 2;
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
}

export function inferCategory(source: string): AssetCategory {
  const path = source.toLowerCase();
  if (/\/(tiles?|terrain|floors?|walls?)\//.test(path)) return 'terrain';
  if (/\/(characters?|players?|npcs?)\//.test(path)) return 'character';
  if (/\/(enemies|monsters|bosses)\//.test(path)) return 'enemy';
  if (/\/animals?\//.test(path)) return 'animal';
  if (/\/(trees?|plants?|crops?|mushrooms?)\//.test(path)) return 'vegetation';
  if (/\/(buildings?|houses?)\//.test(path)) return 'building';
  if (/\/(ui|icons?|cursors?|fonts?)\//.test(path)) return 'ui';
  if (/\/(effects?|particles?|animations?|weather effects?)\//.test(path)) return 'effect';
  if (/\/(weapons?|armor|clothes|clothing|hats?|hair|shirts?|pants?|legs?|arms?|tools?)\//.test(path)) return 'equipment';
  if (/\/(props?|decor|decoration|outdoor decoration|furniture|items?|volcano_props)\//.test(path)) return 'prop';
  return 'unknown';
}

export function inferGrid(source: string, width: number, height: number, category = inferCategory(source)): GridRecommendation {
  const lower = source.toLowerCase();
  const reasons: string[] = [];
  if (category === 'building' && !/(interior|tiles|fillers)/.test(lower)) {
    return { mode: 'whole', cell: null, confidence: 0.94, reasons: ['one building variant per source image'] };
  }
  if ((category === 'character' || category === 'enemy') && width % 32 === 0 && height % 32 === 0) {
    return { mode: 'grid', cell: [32, 32], confidence: 0.88, reasons: ['character/enemy sheets use padded 32 px animation cells'] };
  }
  if (width % 16 === 0 && height % 16 === 0) {
    if (category === 'terrain') reasons.push('terrain dimensions align to the canonical 16 px tile grid');
    else reasons.push('dimensions align to the canonical 16 px grid');
    if (/anim|animation|animated/.test(lower)) reasons.push('filename indicates a frame strip');
    return { mode: 'grid', cell: [16, 16], confidence: category === 'terrain' ? 0.98 : 0.72, reasons };
  }
  if (category === 'prop' || category === 'ui' || category === 'effect') {
    return { mode: 'components', cell: null, confidence: 0.64, reasons: ['non-grid sheet likely contains alpha-separated sprites'] };
  }
  return { mode: 'whole', cell: null, confidence: 0.55, reasons: ['no reliable canonical grid inferred'] };
}

function opaqueBounds(image: DecodedPng, originX: number, originY: number, width: number, height: number): Bounds | null {
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixel(image, originX + x, originY + y)[3] < 128) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function alphaConnection(image: DecodedPng, originX: number, originY: number, size: number, side: 'north' | 'east' | 'south' | 'west'): boolean {
  const start = Math.floor(size * 0.375);
  const end = Math.ceil(size * 0.625);
  let opaque = 0;
  for (let step = start; step < end; step += 1) {
    const x = side === 'west' ? 0 : side === 'east' ? size - 1 : step;
    const y = side === 'north' ? 0 : side === 'south' ? size - 1 : step;
    if (pixel(image, originX + x, originY + y)[3] >= 128) opaque += 1;
  }
  return opaque >= Math.ceil((end - start) / 2);
}

function cellsFor(image: DecodedPng, cellWidth: number, cellHeight: number): CatalogCell[] {
  const columns = Math.floor(image.width / cellWidth);
  const rows = Math.floor(image.height / cellHeight);
  const firstByHash = new Map<string, number>();
  return Array.from({ length: columns * rows }, (_, index) => {
    const x = (index % columns) * cellWidth;
    const y = Math.floor(index / columns) * cellHeight;
    const bytes = new Uint8Array(cellWidth * cellHeight * 4);
    let opaque = 0;
    for (let row = 0; row < cellHeight; row += 1) {
      for (let column = 0; column < cellWidth; column += 1) {
        const sourceOffset = pixelOffset(image, x + column, y + row);
        const targetOffset = (row * cellWidth + column) * 4;
        bytes.set(image.rgba.slice(sourceOffset, sourceOffset + 4), targetOffset);
        if ((image.rgba[sourceOffset + 3] ?? 0) >= 128) opaque += 1;
      }
    }
    const hash = sha(bytes);
    const duplicateOf = firstByHash.get(hash) ?? null;
    if (duplicateOf === null) firstByHash.set(hash, index);
    const alphaConnections = cellWidth === cellHeight
      ? (['north', 'east', 'south', 'west'] as const).filter((side) => alphaConnection(image, x, y, cellWidth, side))
      : [];
    return {
      index,
      source: { x, y, width: cellWidth, height: cellHeight },
      hash,
      alphaCoverage: round(opaque / (cellWidth * cellHeight)),
      opaqueBounds: opaqueBounds(image, x, y, cellWidth, cellHeight),
      alphaConnections,
      duplicateOf,
    };
  });
}

function eligibleDiagonalCount(cardinals: number): number {
  const north = (cardinals & 1) !== 0; const east = (cardinals & 2) !== 0;
  const south = (cardinals & 4) !== 0; const west = (cardinals & 8) !== 0;
  return Number(north && east) + Number(east && south) + Number(south && west) + Number(west && north);
}

export function canonicalBlob47Index(cardinals: number, diagonalChoice: number): number {
  let index = diagonalChoice;
  for (let previous = 0; previous < cardinals; previous += 1) index += 1 << eligibleDiagonalCount(previous);
  return index;
}

export function connectionRole(cardinals: number, missingInnerCorners: readonly string[] = []): string {
  const directions = [
    { bit: 1, name: 'north' }, { bit: 2, name: 'east' },
    { bit: 4, name: 'south' }, { bit: 8, name: 'west' },
  ];
  const connected = directions.filter(({ bit }) => (cardinals & bit) !== 0).map(({ name }) => name);
  let role = 'isolated';
  if (connected.length === 1) role = `end_${connected[0]}`;
  else if (cardinals === 5) role = 'straight_vertical';
  else if (cardinals === 10) role = 'straight_horizontal';
  else if (connected.length === 2) role = `corner_${connected.join('_')}`;
  else if (connected.length === 3) role = `t_missing_${directions.find(({ bit }) => (cardinals & bit) === 0)?.name ?? 'unknown'}`;
  else if (connected.length === 4) role = 'center';
  return missingInnerCorners.length > 0 ? `${role}__inner_open_${missingInnerCorners.join('_')}` : role;
}

function analyzeBlob47(image: DecodedPng): BlobCell[] | null {
  if (image.width !== 112 || image.height !== 112) return null;
  const cellSize = 16;
  const centerColors = new Map<string, { color: readonly [number, number, number, number]; count: number }>();
  for (let y = 0; y < 7; y += 1) for (let x = 0; x < 7; x += 1) {
    const color = pixel(image, x * cellSize + 8, y * cellSize + 8);
    const key = colorKey(color);
    const entry = centerColors.get(key);
    centerColors.set(key, { color, count: (entry?.count ?? 0) + 1 });
  }
  const ordered = [...centerColors.values()].sort((left, right) => right.count - left.count);
  const foreground = ordered.find(({ color }) => color[3] >= 128)?.color;
  const background = ordered.find(({ color }) => colorKey(color) !== colorKey(foreground ?? []))?.color;
  if (!foreground || !background) return null;
  const isForeground = (gridX: number, gridY: number, x: number, y: number): boolean => {
    const value = pixel(image, gridX * cellSize + x, gridY * cellSize + y);
    return colorDistance(value, foreground) <= colorDistance(value, background);
  };
  const majority = (values: readonly boolean[]): boolean => values.filter(Boolean).length >= Math.ceil(values.length / 2);
  const byCanonical = new Map<number, BlobCell>();
  for (let gridY = 0; gridY < 7; gridY += 1) for (let gridX = 0; gridX < 7; gridX += 1) {
    const subjectCenter = majority(Array.from({ length: 16 }, (_, index) => isForeground(gridX, gridY, 6 + index % 4, 6 + Math.floor(index / 4))));
    const north = majority([6, 7, 8, 9].map((x) => isForeground(gridX, gridY, x, 0)));
    const east = majority([6, 7, 8, 9].map((y) => isForeground(gridX, gridY, 15, y)));
    const south = majority([6, 7, 8, 9].map((x) => isForeground(gridX, gridY, x, 15)));
    const west = majority([6, 7, 8, 9].map((y) => isForeground(gridX, gridY, 0, y)));
    const cardinals = Number(north) | (Number(east) << 1) | (Number(south) << 2) | (Number(west) << 3);
    const diagonalValues = [
      isForeground(gridX, gridY, 13, 2), isForeground(gridX, gridY, 13, 13),
      isForeground(gridX, gridY, 2, 13), isForeground(gridX, gridY, 2, 2),
    ];
    const eligible = [north && east, east && south, south && west, west && north];
    const cornerNames = ['north_east', 'south_east', 'south_west', 'north_west'];
    const missingInnerCorners: string[] = [];
    let diagonalChoice = 0; let choiceBit = 0;
    for (let diagonal = 0; diagonal < eligible.length; diagonal += 1) {
      if (!eligible[diagonal]) continue;
      if (diagonalValues[diagonal]) diagonalChoice |= 1 << choiceBit;
      else missingInnerCorners.push(cornerNames[diagonal]!);
      choiceBit += 1;
    }
    const canonicalIndex = canonicalBlob47Index(cardinals, diagonalChoice);
    const sourceIndex = gridY * 7 + gridX;
    const candidate: BlobCell = {
      sourceIndex,
      source: { x: gridX * 16, y: gridY * 16, width: 16, height: 16 },
      canonicalIndex,
      cardinals,
      diagonalChoice,
      role: subjectCenter ? connectionRole(cardinals, missingInnerCorners) : 'background_filler',
      confidence: subjectCenter ? 0.96 : 0.9,
    };
    if (!byCanonical.has(canonicalIndex) || (subjectCenter && byCanonical.get(canonicalIndex)?.role === 'background_filler')) {
      byCanonical.set(canonicalIndex, candidate);
    }
  }
  if (byCanonical.size !== 47) return null;
  return [...byCanonical.values()].sort((left, right) => left.canonicalIndex - right.canonicalIndex);
}

function htmlEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function assetKey(source: string): string {
  return source
    .replace(/^references\//, '')
    .replace(/\.png$/i, '')
    .split('/')
    .map((part) => part.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').replaceAll(/^_+|_+$/g, ''))
    .filter(Boolean)
    .join('.');
}

function kindCode(category: AssetCategory): number {
  const codes: Readonly<Record<AssetCategory, number>> = {
    unknown: 0,
    terrain: 1,
    prop: 2,
    building: 3,
    vegetation: 4,
    character: 5,
    animal: 6,
    enemy: 7,
    equipment: 8,
    ui: 9,
    effect: 10,
  };
  return codes[category];
}

function buildAuthoringRegistry(catalog: Catalog): AuthoringRegistry {
  const canonicalSheets = catalog.sheets.filter((sheet) => sheet.duplicateOf === null);
  const revisionBytes = new TextEncoder().encode(canonicalSheets.map((sheet) => `${assetKey(sheet.source)}:${sheet.hash}`).join('\n'));
  const catalogRevision = stableAssetId(sha(revisionBytes));
  const idBySource = new Map<string, number>();
  const keyById = new Map<number, string>();
  for (const sheet of canonicalSheets) {
    const key = assetKey(sheet.source);
    const id = stableAssetId(key);
    const collision = keyById.get(id);
    if (collision && collision !== key) throw new Error(`Stable asset id collision: ${collision} and ${key}`);
    keyById.set(id, key);
    idBySource.set(sheet.source, id);
  }
  const assetDefinitions: SpacetimeAssetDefinitionRow[] = [];
  const assetTags: SpacetimeAssetTagRow[] = [];
  const clientSets: AuthoringRegistry['clientSets'][number][] = [];
  for (const sheet of canonicalSheets) {
    const key = assetKey(sheet.source);
    const id = idBySource.get(sheet.source)!;
    const frameWidth = sheet.recommendation.cell?.[0] ?? sheet.width;
    const frameHeight = sheet.recommendation.cell?.[1] ?? sheet.height;
    const builderEligible = ['terrain', 'prop', 'building', 'vegetation'].includes(sheet.category);
    const topology = sheet.blob47 ? 2 : sheet.recommendation.mode === 'grid' ? 1 : sheet.recommendation.mode === 'components' ? 3 : 0;
    const flags = Number(sheet.animated) | (Number(builderEligible) << 1) | (1 << 2);
    assetDefinitions.push({
      assetId: id,
      assetKey: key,
      kind: kindCode(sheet.category),
      topology,
      variantCount: Math.max(1, sheet.blob47?.length ?? sheet.cells.length),
      footprintWidth: Math.max(1, Math.ceil(frameWidth / 16)),
      footprintHeight: Math.max(1, Math.ceil(frameHeight / 16)),
      flags,
      catalogRevision,
    });
    const tags = [
      `kind.${sheet.category}`,
      'review.required',
      ...(builderEligible ? ['builder.available'] : []),
      ...(sheet.animated ? ['animation'] : []),
      ...(sheet.blob47 ? ['topology.blob47'] : []),
    ];
    for (const tag of tags) assetTags.push({ assetTagId: `${id}:${tag}`, assetId: id, tag });
    clientSets.push({
      assetId: id,
      assetKey: key,
      source: sheet.source,
      sourceHash: sheet.hash,
      frameSize: [frameWidth, frameHeight],
      variantCount: Math.max(1, sheet.blob47?.length ?? sheet.cells.length),
      reviewState: 'needs_review',
    });
  }
  const aliases = catalog.sheets.filter((sheet) => sheet.duplicateOf !== null).map((sheet) => {
    const canonicalId = idBySource.get(sheet.duplicateOf!);
    if (canonicalId === undefined) throw new Error(`Missing canonical duplicate ${sheet.duplicateOf}`);
    return { aliasKey: assetKey(sheet.source), assetId: canonicalId };
  });
  return {
    version: 1,
    authoritative: false,
    catalogRevision,
    storage: {
      visuals: 'reference_pngs',
      authority: 'authoring_review',
      variantResolution: 'catalog_recipe',
    },
    assetDefinitions: assetDefinitions.sort((left, right) => left.assetId - right.assetId),
    assetTags: assetTags.sort((left, right) => left.assetTagId.localeCompare(right.assetTagId)),
    aliases: aliases.sort((left, right) => left.aliasKey.localeCompare(right.aliasKey)),
    clientSets: clientSets.sort((left, right) => left.assetId - right.assetId),
  };
}

function reviewHtml(catalog: Catalog, outputDirectory: string): string {
  const rows = catalog.sheets.map((sheet) => {
    const sourceAbsolute = resolve(rootPath, sheet.source);
    const sourceRelative = slash(relative(outputDirectory, sourceAbsolute));
    const blob = sheet.blob47
      ? `<details><summary>${sheet.blob47.length} identified blob roles</summary><table><tr><th>#</th><th>source</th><th>role</th></tr>${sheet.blob47.map((cell) => `<tr><td>${cell.canonicalIndex}</td><td>${cell.source.x},${cell.source.y}</td><td>${htmlEscape(cell.role)}</td></tr>`).join('')}</table></details>`
      : '';
    return `<article><h2>${htmlEscape(sheet.source)}</h2><p>${sheet.category} · ${sheet.width}×${sheet.height} · ${sheet.recommendation.mode}${sheet.recommendation.cell ? ` ${sheet.recommendation.cell.join('×')}` : ''} · confidence ${sheet.recommendation.confidence}</p><img src="${htmlEscape(sourceRelative)}" alt="${htmlEscape(sheet.source)}">${blob}</article>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cute Fantasy asset catalog</title><style>body{background:#141420;color:#fff6e0;font:14px system-ui;margin:24px}header{position:sticky;top:0;background:#141420;padding:8px 0;z-index:2}article{border-top:1px solid #4a4750;padding:16px 0}img{image-rendering:pixelated;max-width:min(100%,960px);max-height:480px;background:repeating-conic-gradient(#c4bec6 0 25%,#969099 0 50%) 0/16px 16px}table{border-collapse:collapse}td,th{border:1px solid #4a4750;padding:3px 8px;text-align:left}code{color:#ffe98a}</style></head><body><header><h1>Cute Fantasy asset catalog</h1><p><code>${htmlEscape(JSON.stringify(catalog.summary))}</code></p></header>${rows}</body></html>`;
}

async function buildCatalog(outputDirectory: string): Promise<Catalog> {
  const rootEntries = await readdir(referencesPath, { withFileTypes: true });
  const packRoots = rootEntries.filter((entry) => entry.isDirectory() && entry.name.startsWith('Cute_Fantasy')).map((entry) => join(referencesPath, entry.name)).sort();
  const files = (await Promise.all(packRoots.map(async (root) => await walk(root)))).flat().filter((path) => path.toLowerCase().endsWith('.png')).sort();
  const firstSheetByHash = new Map<string, string>();
  const sheets: CatalogSheet[] = [];
  const uniqueCellHashes = new Set<string>();
  for (const path of files) {
    const encoded = await readFile(path);
    const image = decodePng(encoded);
    const source = slash(relative(rootPath, path));
    const hash = sha(encoded);
    const duplicateOf = firstSheetByHash.get(hash) ?? null;
    if (!duplicateOf) firstSheetByHash.set(hash, source);
    const category = inferCategory(source);
    const recommendation = inferGrid(source, image.width, image.height, category);
    const gridCells = recommendation.cell ? cellsFor(image, recommendation.cell[0], recommendation.cell[1]) : [];
    for (const cell of gridCells) uniqueCellHashes.add(cell.hash);
    const animated = /anim|animation|animated/i.test(basename(path)) || (category === 'character' && gridCells.length > 1);
    const blob47 = /blob/i.test(basename(path)) ? analyzeBlob47(image) : null;
    sheets.push({
      id: `${slash(relative(referencesPath, dirname(path))).replaceAll('/', '_').toLowerCase()}_${basename(path, '.png').toLowerCase().replaceAll(/[^a-z0-9]+/g, '_')}`,
      source,
      pack: slash(relative(referencesPath, packRoots.find((root) => path.startsWith(`${root}${sep}`)) ?? referencesPath)).split('/')[0] ?? 'unknown',
      width: image.width,
      height: image.height,
      hash,
      duplicateOf,
      category,
      animated,
      recommendation,
      cells: gridCells,
      blob47,
    });
  }
  const byCategory = Object.fromEntries([...new Set(sheets.map(({ category }) => category))].sort().map((category) => [category, sheets.filter((sheet) => sheet.category === category).length]));
  const catalog: Catalog = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourcePattern: 'references/Cute_Fantasy*/**/*.png',
    summary: {
      packs: packRoots.length,
      sourceFiles: sheets.length,
      uniqueFiles: firstSheetByHash.size,
      duplicateFiles: sheets.length - firstSheetByHash.size,
      recommendedGridSheets: sheets.filter(({ recommendation }) => recommendation.mode === 'grid').length,
      wholeImages: sheets.filter(({ recommendation }) => recommendation.mode === 'whole').length,
      componentSheets: sheets.filter(({ recommendation }) => recommendation.mode === 'components').length,
      animationCandidates: sheets.filter(({ animated }) => animated).length,
      totalGridCells: sheets.reduce((sum, sheet) => sum + sheet.cells.length, 0),
      uniqueGridCells: uniqueCellHashes.size,
      blobSheets: sheets.filter(({ blob47 }) => blob47).length,
      byCategory,
    },
    sheets,
  };
  const authoringRegistry = buildAuthoringRegistry(catalog);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(join(outputDirectory, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`),
    writeFile(join(outputDirectory, 'index.html'), reviewHtml(catalog, outputDirectory)),
    writeFile(join(outputDirectory, 'blob47-recipes.json'), `${JSON.stringify(sheets.filter(({ blob47 }) => blob47).map(({ source, hash, blob47 }) => ({ source, hash, cell: [16, 16], frames: blob47 })), null, 2)}\n`),
    writeFile(join(outputDirectory, 'authoring-registry.json'), `${JSON.stringify(authoringRegistry, null, 2)}\n`),
  ]);
  return catalog;
}

async function main(): Promise<void> {
  const outputDirectory = resolve(rootPath, option('--output') ?? relative(rootPath, defaultOutput));
  const catalog = await buildCatalog(outputDirectory);
  console.log(`Cataloged ${catalog.summary['sourceFiles']} PNGs from ${catalog.summary['packs']} Cute Fantasy roots.`);
  console.log(`Found ${catalog.summary['uniqueFiles']} unique sheets, ${catalog.summary['uniqueGridCells']} unique grid cells, and ${catalog.summary['blobSheets']} blob sheets.`);
  console.log(`Review: ${join(outputDirectory, 'index.html')}`);
  console.log(`Catalog: ${join(outputDirectory, 'catalog.json')}`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
