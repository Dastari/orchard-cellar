import { fileURLToPath } from 'node:url';
import { assetsRoot, loadAssets, loadPalette, readJson } from './assets/load.js';
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
    }
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
  if (errors.length > 0) throw new Error(`Asset validation failed:\n${errors.join('\n')}`);
  console.log(`Validated ${assets.length} authored assets, 55 palette colors, and four seasonal remaps.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await validateAssetSources();
