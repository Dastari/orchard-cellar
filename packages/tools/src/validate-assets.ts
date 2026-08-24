import { fileURLToPath } from 'node:url';
import { assetsRoot, loadAssets, loadPalette, readJson } from './assets/load.js';
import { frameKind, variantTopology } from './assets/frame-kind.js';
import type { AssetSource, PixelGrid } from './assets/types.js';

interface SeasonSource {
  readonly required: readonly string[];
  readonly spring: Readonly<Record<string, string>>;
  readonly summer: Readonly<Record<string, string>>;
  readonly autumn: Readonly<Record<string, string>>;
  readonly winter: Readonly<Record<string, string>>;
}

const seasonNames = ['spring', 'summer', 'autumn', 'winter'] as const;
const outlineCharacters = new Set(['0', '1', '9', 'f', 'j', 'o', 't', 'y', 'D', 'Q', 'R', 'S']);
const audioPatches = new Set(['flute', 'pad', 'pluck', 'bass', 'bells', 'strings', 'accordion', 'woodblock', 'shaker']);
const ambienceTimes = new Set(['dawn', 'day', 'dusk', 'night']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readFolder(folder: string, suffix: string): Promise<unknown[]> {
  const root = new URL(`${folder}/`, assetsRoot);
  const files = (await readdir(root)).filter((name) => name.endsWith(suffix)).sort();
  return await Promise.all(files.map(async (name) => await readJson(new URL(name, root))));
}

function validateSongs(songs: readonly unknown[], errors: string[]): void {
  for (const value of songs) {
    if (!isRecord(value) || typeof value['name'] !== 'string') { errors.push('music: invalid song object'); continue; }
    const name = value['name'];
    if (typeof value['bpm'] !== 'number' || value['bpm'] < 72 || value['bpm'] > 96) errors.push(`${name}: bpm must be 72-96`);
    if (typeof value['swing'] !== 'number' || value['swing'] < 0 || value['swing'] > 0.12) errors.push(`${name}: swing must be 0-0.12`);
    if (value['loopBars'] !== 48 && value['loopBars'] !== 64 && value['loopBars'] !== 96) errors.push(`${name}: theme loop must be 48, 64, or 96 bars`);
    if (!Array.isArray(value['channels']) || !isRecord(value['patterns'])) { errors.push(`${name}: channels/patterns missing`); continue; }
    for (const channel of value['channels']) {
      if (!isRecord(channel) || typeof channel['patch'] !== 'string' || !audioPatches.has(channel['patch'])) errors.push(`${name}: channel uses a patch outside the closed set`);
      if (!isRecord(channel) || !Array.isArray(channel['patterns'])) continue;
      for (const patternName of channel['patterns']) if (typeof patternName !== 'string' || !value['patterns'][patternName]) errors.push(`${name}: missing pattern ${String(patternName)}`);
    }
    for (const [patternName, patternValue] of Object.entries(value['patterns'])) {
      if (!isRecord(patternValue) || typeof patternValue['steps'] !== 'number' || !Array.isArray(patternValue['notes'])) { errors.push(`${name}:${patternName} invalid pattern`); continue; }
      for (const note of patternValue['notes']) {
        if (!Array.isArray(note) || note.length !== 3 || typeof note[0] !== 'number' || typeof note[1] !== 'string' || typeof note[2] !== 'number'
          || note[0] < 0 || note[2] <= 0 || note[0] + note[2] > patternValue['steps']) errors.push(`${name}:${patternName} invalid note`);
      }
    }
  }
}

function validateSfx(sources: readonly unknown[], errors: string[]): void {
  for (const value of sources) {
    if (!isRecord(value) || typeof value['name'] !== 'string') { errors.push('sfx: invalid source object'); continue; }
    const name = value['name'];
    if (!isRecord(value['synth']) || !isRecord(value['jitter'])) { errors.push(`${name}: synth/jitter missing`); continue; }
    for (const field of ['pitch', 'decay', 'gainDb']) {
      const range = value['jitter'][field];
      if (!Array.isArray(range) || range.length !== 2 || !range.every((entry) => typeof entry === 'number')) errors.push(`${name}: jitter.${field} must be a numeric range`);
    }
    if (value['bus'] !== 'sfx' && value['bus'] !== 'ambience') errors.push(`${name}: invalid audio bus`);
    if (typeof value['synth']['frequencyHz'] !== 'number' || value['synth']['frequencyHz'] <= 0) errors.push(`${name}: invalid frequency`);
    if (value['schedule'] !== undefined) {
      if (!isRecord(value['schedule'])) { errors.push(`${name}: schedule must be an object`); continue; }
      const time = value['schedule']['time'];
      const season = value['schedule']['season'];
      if (time !== undefined && (!Array.isArray(time) || time.some((entry) => typeof entry !== 'string' || !ambienceTimes.has(entry)))) errors.push(`${name}: invalid ambience time`);
      if (season !== undefined && (!Array.isArray(season) || season.some((entry) => typeof entry !== 'string' || !seasonNames.includes(entry as typeof seasonNames[number])))) errors.push(`${name}: invalid ambience season`);
    }
  }
}

function validateMaps(maps: readonly unknown[], errors: string[]): void {
  for (const value of maps) {
    if (!isRecord(value) || typeof value['name'] !== 'string' || !Array.isArray(value['size']) || value['size'].length !== 2 || !isRecord(value['layers']) || !isRecord(value['legend'])) {
      errors.push('maps: invalid map header'); continue;
    }
    const [width, height] = value['size'];
    if (typeof width !== 'number' || typeof height !== 'number') { errors.push(`${value['name']}: invalid map size`); continue; }
    for (const layer of ['ground', 'detail', 'canopy']) {
      const rows = value['layers'][layer];
      if (!Array.isArray(rows) || rows.length !== height || rows.some((row) => typeof row !== 'string' || row.length !== width)) errors.push(`${value['name']}:${layer} dimensions must match ${width}x${height}`);
      if (Array.isArray(rows)) for (const row of rows) if (typeof row === 'string') for (const character of row) if (value['legend'][character] === undefined) errors.push(`${value['name']}:${layer} unknown legend character ${character}`);
    }
    if (value['name'] === 'estate') {
      const objects = Array.isArray(value['objects']) ? value['objects'] : [];
      const visibleTrees = new Set(objects.flatMap((object) => isRecord(object) && object['asset'] === 'tree_apple_fruiting'
        && typeof object['x'] === 'number' && typeof object['y'] === 'number' ? [`${object['x']},${object['y']}`] : []));
      const collisionTrees = new Set<string>();
      for (const y of [17, 22, 27, 32, 37]) for (const x of [12, 16, 20]) collisionTrees.add(`${x},${y}`);
      if (visibleTrees.size !== collisionTrees.size || [...collisionTrees].some((position) => !visibleTrees.has(position))) {
        errors.push('estate: every orchard collision tile must have one visible tree object');
      }
    }
  }
}

function validateCanonicalSize(asset: AssetSource, errors: string[]): void {
  const [width, height] = asset.size;
  if (asset.category === 'tiles' && (width !== 16 || height !== 16)) errors.push(`${asset.name}: tiles must be 16x16`);
  if (asset.category === 'characters' && (width !== 16 || height !== 32)) errors.push(`${asset.name}: characters must be 16x32`);
  if (asset.category === 'trees') {
    const valid = (width === 16 && (height === 16 || height === 32)) || (width === 48 && height === 64);
    if (!valid) errors.push(`${asset.name}: tree size is not a canonical growth-stage size`);
  }
  if (asset.category === 'buildings' && (width % 16 !== 0 || height % 16 !== 0)) {
    errors.push(`${asset.name}: buildings must use 16px multiples`);
  }
  if (asset.anchor[0] < 0 || asset.anchor[1] < 0 || asset.anchor[0] >= width || asset.anchor[1] >= height) {
    errors.push(`${asset.name}: anchor must be inside the asset`);
  }
}

function validateOrphans(asset: AssetSource, grid: PixelGrid, animation: string, frameIndex: number, errors: string[]): void {
  if (asset.lintAllow?.includes('sparkle')) return;
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = grid[y]?.[x];
      if (!value || value === '.') continue;
      const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const;
      if (!neighbors.some(([nx, ny]) => grid[ny]?.[nx] === value)) {
        errors.push(`${asset.name}:${animation}[${frameIndex}] orphan ${value} at ${x},${y}`);
      }
    }
  }
}

function validateGrid(
  asset: AssetSource,
  grid: PixelGrid,
  animation: string,
  frameIndex: number,
  allowed: ReadonlySet<string>,
  errors: string[],
): void {
  const [width, height] = asset.size;
  if (grid.length !== height) errors.push(`${asset.name}:${animation}[${frameIndex}] expected ${height} rows, got ${grid.length}`);
  for (let row = 0; row < grid.length; row += 1) {
    if (grid[row]?.length !== width) errors.push(`${asset.name}:${animation}[${frameIndex}] row ${row} must be ${width} characters`);
    for (const character of grid[row] ?? '') {
      if (character !== '.' && !allowed.has(character)) errors.push(`${asset.name}:${animation}[${frameIndex}] unknown palette character ${character}`);
    }
  }
  validateOrphans(asset, grid, animation, frameIndex, errors);
  if (asset.category === 'characters') {
    let boundary = 0;
    let outlined = 0;
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < (grid[y]?.length ?? 0); x += 1) {
        const character = grid[y]?.[x] ?? '.';
        if (character === '.') continue;
        const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const;
        const exposed = neighbors.some(([nx, ny]) => (grid[ny]?.[nx] ?? '.') === '.');
        if (!exposed) continue;
        boundary += 1;
        if (outlineCharacters.has(character)) outlined += 1;
      }
    }
    if (boundary === 0 || outlined / boundary < 0.5) {
      errors.push(`${asset.name}:${animation}[${frameIndex}] character outline coverage is below 50%`);
    }
  }
}

export async function validateAssetSources(): Promise<void> {
  const errors: string[] = [];
  const [assets, palette, seasonSource] = await Promise.all([
    loadAssets(),
    loadPalette(),
    readJson(new URL('seasons.json', assetsRoot)) as Promise<SeasonSource>,
  ]);
  const [songs, sfx, maps] = await Promise.all([
    readFolder('music', '.song.json'),
    readFolder('sfx', '.sfx.json'),
    readFolder('maps', '.map.json'),
  ]);
  if (Object.keys(palette.colors).length !== 55) errors.push('palette.json must contain the binding 55 colors');
  for (const [character, hex] of Object.entries(palette.colors)) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) errors.push(`palette ${character}: invalid hex ${hex}`);
    if (hex.toLowerCase() === '#000000' || hex.toLowerCase() === '#ffffff') errors.push(`palette ${character}: pure black/white is forbidden`);
  }
  const allowed = new Set([...Object.keys(palette.colors), ...Object.keys(palette.markerDefaults)]);
  const names = new Set<string>();
  for (const asset of assets) {
    if (names.has(asset.name)) errors.push(`${asset.name}: duplicate asset name`);
    names.add(asset.name);
    validateCanonicalSize(asset, errors);
    for (const [animation, frames] of Object.entries(asset.frames)) {
      if (frames.length === 0) errors.push(`${asset.name}:${animation} must have at least one frame`);
      frames.forEach((grid, index) => validateGrid(asset, grid, animation, index, allowed, errors));
      const kind = frameKind(asset, animation, frames);
      if (kind === 'state' && frames.length !== 1) errors.push(`${asset.name}:${animation} state must contain exactly one frame`);
      if (kind === 'animation' && asset.animationFps?.[animation] === undefined && asset.fps === undefined) {
        errors.push(`${asset.name}:${animation} animation must declare fps or animationFps`);
      }
      const topology = variantTopology(asset, animation, frames);
      if (topology === 'blob47' && kind !== 'variant') errors.push(`${asset.name}:${animation} blob47 topology must be a variant`);
      if (topology === 'blob47' && asset.autotile !== 'blob47' && frames.length !== 47) {
        errors.push(`${asset.name}:${animation} expanded blob47 variant must contain 47 frames`);
      }
    }
    for (const name of Object.keys(asset.frameKinds ?? {})) if (!asset.frames[name]) errors.push(`${asset.name}: frameKinds references missing group ${name}`);
    for (const name of Object.keys(asset.variantTopologies ?? {})) if (!asset.frames[name]) errors.push(`${asset.name}: variantTopologies references missing group ${name}`);
    for (const name of Object.keys(asset.animationLoop ?? {})) if (!asset.frames[name]) errors.push(`${asset.name}: animationLoop references missing group ${name}`);
    if (asset.autotile === 'blob47' && asset.frames['base']?.length !== 5) {
      errors.push(`${asset.name}: blob47 source must contain five template frames`);
    }
  }
  for (const season of seasonNames) {
    for (const character of seasonSource.required) {
      const target = seasonSource[season][character];
      if (!target || !palette.colors[target]) errors.push(`seasons.json ${season}: missing valid mapping for ${character}`);
    }
  }
  validateSongs(songs, errors);
  validateSfx(sfx, errors);
  validateMaps(maps, errors);
  if (errors.length > 0) throw new Error(`Asset validation failed:\n${errors.join('\n')}`);
  console.log(`Validated ${assets.length} art assets, ${songs.length} songs, ${sfx.length} SFX, ${maps.length} maps, 55 palette colors, and four seasonal remaps.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await validateAssetSources();
import { readdir } from 'node:fs/promises';
