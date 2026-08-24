import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stableAssetId } from './assets/asset-id.js';
import { frameKind, variantTopology } from './assets/frame-kind.js';
import { loadAssets, loadPalette, readJson, workspaceRoot } from './assets/load.js';
import { encodePng, hexToRgba, setPixel } from './assets/png.js';
import type { AssetSource, BuiltFrame, PaletteSource, PixelGrid } from './assets/types.js';

interface SeasonSource {
  readonly required: readonly string[];
  readonly spring: Readonly<Record<string, string>>;
  readonly summer: Readonly<Record<string, string>>;
  readonly autumn: Readonly<Record<string, string>>;
  readonly winter: Readonly<Record<string, string>>;
}

type Season = 'spring' | 'summer' | 'autumn' | 'winter';
const seasons: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
const outputRoot = new URL('packages/client/public/generated/', workspaceRoot);
const ATLAS_WIDTH = 512;
const MISSING_ASSET_NAME = 'system_missing_asset';
const MISSING_ASSET_ID = 0;
export const ASSET_REGISTRY_SCHEMA_VERSION = 2;

interface RegistrySourceRecord {
  readonly assetId: number;
  readonly category: string;
  readonly tags: readonly string[];
  readonly placement: Readonly<Record<string, unknown>>;
  readonly animations: Readonly<Record<string, readonly BuiltFrame[]>>;
  readonly animationMeta: Readonly<Record<string, { readonly fps: number; readonly loop: boolean }>>;
  readonly variants: Readonly<Record<string, readonly BuiltFrame[]>>;
  readonly variantMeta: Readonly<Record<string, { readonly topology?: 'blob47' }>>;
  readonly states: Readonly<Record<string, BuiltFrame>>;
}

interface CompactRegistryAsset {
  readonly assetId: number;
  readonly name: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly placement: Readonly<Record<string, unknown>>;
  readonly animations: Readonly<Record<string, unknown>>;
  readonly variants: Readonly<Record<string, unknown>>;
  readonly states: readonly string[];
}

export function compactRegistryAsset(name: string, record: RegistrySourceRecord): CompactRegistryAsset {
  return {
    assetId: record.assetId,
    name,
    category: record.category,
    tags: record.tags,
    placement: record.placement,
    animations: Object.fromEntries(Object.entries(record.animations).map(([animation, frames]) => [animation, {
      frameCount: frames.length,
      fps: record.animationMeta[animation]?.fps ?? 1,
      loop: record.animationMeta[animation]?.loop ?? true,
    }])),
    variants: Object.fromEntries(Object.entries(record.variants).map(([variant, frames]) => [variant, {
      frameCount: frames.length,
      ...(record.variantMeta[variant]?.topology ? { topology: record.variantMeta[variant].topology } : {}),
    }])),
    states: Object.keys(record.states).sort(),
  };
}

type PlacementLayer = 'ground' | 'object' | 'canopy' | 'ui';

function defaultLayer(category: string): PlacementLayer {
  if (category === 'tiles') return 'ground';
  if (category === 'trees') return 'canopy';
  if (category === 'ui') return 'ui';
  return 'object';
}

function assetTags(asset: AssetSource): string[] {
  const groups = Object.entries(framesForAsset(asset));
  return [...new Set([
    ...(asset.tags ?? []),
    `kind.${asset.category}`,
    ...groups.flatMap(([name, frames]) => {
      const kind = frameKind(asset, name, frames);
      const topology = kind === 'variant' ? variantTopology(asset, name, frames) : undefined;
      return [`${kind}.${name}`, ...(topology ? [`topology.${topology}`] : [])];
    }),
    ...(asset.collision?.length ? ['collision.solid'] : []),
    ...(asset.approved === true && asset.placement?.builderAvailable === true ? ['builder.available'] : []),
    ...(asset.approved === true ? ['review.approved'] : ['review.required']),
  ])].sort();
}

async function copyJsonAssets(folder: 'maps' | 'music' | 'sfx'): Promise<void> {
  const source = new URL(`packages/assets/${folder}/`, workspaceRoot);
  const target = new URL(`${folder}/`, outputRoot);
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    await writeFile(new URL(entry.name, target), await readFile(new URL(entry.name, source)));
  }
}

function rotateGrid(grid: PixelGrid, turns: number): string[] {
  let result = [...grid];
  for (let turn = 0; turn < turns; turn += 1) {
    const height = result.length;
    const width = result[0]?.length ?? 0;
    result = Array.from({ length: width }, (_, y) =>
      Array.from({ length: height }, (_, x) => result[height - 1 - x]?.[y] ?? '.').join(''),
    );
  }
  return result;
}

function copyQuadrant(target: string[][], source: PixelGrid, quadrant: number): void {
  const startX = quadrant % 2 === 0 ? 0 : 8;
  const startY = quadrant < 2 ? 0 : 8;
  for (let y = startY; y < startY + 8; y += 1) {
    for (let x = startX; x < startX + 8; x += 1) target[y]![x] = source[y]?.[x] ?? '.';
  }
}

export function expandBlob47(frames: readonly PixelGrid[]): PixelGrid[] {
  const [center, edge, outer, inner, isolated] = frames;
  if (!center || !edge || !outer || !inner || !isolated) throw new Error('blob47 requires five template frames');
  const results: PixelGrid[] = [];
  for (let cardinals = 0; cardinals < 16; cardinals += 1) {
    const north = (cardinals & 1) !== 0;
    const east = (cardinals & 2) !== 0;
    const south = (cardinals & 4) !== 0;
    const west = (cardinals & 8) !== 0;
    const eligible = [north && east, east && south, south && west, west && north];
    const combinations = 1 << eligible.filter(Boolean).length;
    for (let diagonalChoice = 0; diagonalChoice < combinations; diagonalChoice += 1) {
      if (cardinals === 0) {
        results.push(isolated);
        continue;
      }
      let choiceBit = 0;
      const diagonals = eligible.map((allowed) => allowed && (diagonalChoice & (1 << choiceBit++)) !== 0);
      const target = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => '.'));
      const corners = [
        { adjacent: [north, west] as const, diagonal: diagonals[3] ?? false, rotation: 0 },
        { adjacent: [north, east] as const, diagonal: diagonals[0] ?? false, rotation: 1 },
        { adjacent: [south, east] as const, diagonal: diagonals[1] ?? false, rotation: 2 },
        { adjacent: [south, west] as const, diagonal: diagonals[2] ?? false, rotation: 3 },
      ];
      for (let quadrant = 0; quadrant < corners.length; quadrant += 1) {
        const corner = corners[quadrant]!;
        const [first, second] = corner.adjacent;
        let template: PixelGrid = center;
        let rotation = corner.rotation;
        if (!first && !second) template = outer;
        else if (first && second && !corner.diagonal) template = inner;
        else if (!first || !second) {
          template = edge;
          if (quadrant === 0) rotation = !first ? 0 : 3;
          if (quadrant === 1) rotation = !first ? 0 : 1;
          if (quadrant === 2) rotation = !first ? 2 : 1;
          if (quadrant === 3) rotation = !first ? 2 : 3;
        }
        copyQuadrant(target, rotateGrid(template, rotation), quadrant);
      }
      results.push(target.map((row) => row.join('')));
    }
  }
  if (results.length !== 47) throw new Error(`blob47 generated ${results.length} variants`);
  return results;
}

function framesForAsset(asset: AssetSource): Readonly<Record<string, readonly PixelGrid[]>> {
  if (asset.autotile !== 'blob47') return asset.frames;
  const base = asset.frames['base'];
  if (!base) throw new Error(`${asset.name} is missing base frames`);
  return { ...asset.frames, base: expandBlob47(base) };
}

function resolveColor(
  character: string,
  palette: PaletteSource,
  remap: Readonly<Record<string, string>>,
  markers: Readonly<Record<string, string>>,
  sourcePalette: Readonly<Record<string, string>>,
): readonly [number, number, number, number] {
  if (character === '.') return [0, 0, 0, 0];
  const sourceHex = sourcePalette[character];
  if (sourceHex) return hexToRgba(sourceHex);
  const marker = markers[character] ?? palette.markerDefaults[character] ?? character;
  const remapped = remap[marker] ?? marker;
  const hex = palette.colors[remapped];
  if (!hex) throw new Error(`Unknown palette character ${character}`);
  return hexToRgba(hex);
}

export async function buildAtlases(): Promise<void> {
  const [assets, palette, seasonSource] = await Promise.all([
    loadAssets(),
    loadPalette(),
    readJson(new URL('packages/assets/seasons.json', workspaceRoot)) as Promise<SeasonSource>,
  ]);
  await mkdir(outputRoot, { recursive: true });

  const categories = [...new Set(assets.map((asset) => asset.category))].sort();
  const revision = createHash('sha256')
    .update(JSON.stringify({ assets, palette, seasons: seasonSource }))
    .digest('hex')
    .slice(0, 20);
  const revisionId = stableAssetId(`atlas:${revision}`);
  const metadata: Record<string, unknown> = {
    schemaVersion: 3,
    revision,
    revisionId,
    placeholderAssetId: MISSING_ASSET_ID,
    atlases: {},
    assets: {},
    assetsById: {},
  };
  const atlasRecords = metadata['atlases'] as Record<string, string>;
  const assetRecords = metadata['assets'] as Record<string, unknown>;
  const assetsById = metadata['assetsById'] as Record<string, string>;
  const idOwners = new Map<number, string>([[MISSING_ASSET_ID, MISSING_ASSET_NAME]]);

  for (const category of categories) {
    const categoryAssets = assets.filter((asset) => asset.category === category).sort((a, b) => a.name.localeCompare(b.name));
    const placements: { asset: AssetSource; animation: string; grid: PixelGrid; frame: BuiltFrame }[] = [];
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    for (const asset of categoryAssets) {
      const animations: Record<string, BuiltFrame[]> = {};
      const animationMeta: Record<string, { fps: number; loop: boolean }> = {};
      const variants: Record<string, BuiltFrame[]> = {};
      const variantMeta: Record<string, { topology?: 'blob47' }> = {};
      const states: Record<string, BuiltFrame> = {};
      const markerLayers: Record<string, { x: number; y: number; marker: string; shade: number }[][]> = {};
      for (const [groupName, grids] of Object.entries(framesForAsset(asset))) {
        const kind = frameKind(asset, groupName, grids);
        const builtFrames: BuiltFrame[] = [];
        markerLayers[groupName] = [];
        for (const grid of grids) {
          if (x + asset.size[0] > ATLAS_WIDTH) { x = 0; y += rowHeight; rowHeight = 0; }
          const frame = {
            x,
            y,
            width: asset.size[0],
            height: asset.size[1],
            durationTicks: kind === 'animation'
              ? Math.max(1, Math.round(60 / (asset.animationFps?.[groupName] ?? asset.fps ?? 1)))
              : 0,
          };
          placements.push({ asset, animation: groupName, grid, frame });
          builtFrames.push(frame);
          const markerPixels: { x: number; y: number; marker: string; shade: number }[] = [];
          for (const [marker, ramp] of Object.entries(asset.markerRamps ?? {})) {
            ramp.forEach((character, shade) => {
              grid.forEach((row, pixelY) => {
                for (let pixelX = 0; pixelX < row.length; pixelX += 1) {
                  if (row[pixelX] === character) markerPixels.push({ x: frame.x + pixelX, y: frame.y + pixelY, marker, shade });
                }
              });
            });
          }
          markerLayers[groupName].push(markerPixels);
          x += asset.size[0];
          rowHeight = Math.max(rowHeight, asset.size[1]);
        }
        if (kind === 'animation') {
          animations[groupName] = builtFrames;
          animationMeta[groupName] = {
            fps: asset.animationFps?.[groupName] ?? asset.fps ?? 1,
            loop: asset.animationLoop?.[groupName] ?? true,
          };
        } else if (kind === 'variant') {
          variants[groupName] = builtFrames;
          const topology = variantTopology(asset, groupName, grids);
          variantMeta[groupName] = topology ? { topology } : {};
        } else {
          const state = builtFrames[0];
          if (!state) throw new Error(`${asset.name}.${groupName} state has no frame`);
          states[groupName] = state;
        }
      }
      const assetId = asset.name === MISSING_ASSET_NAME ? MISSING_ASSET_ID : stableAssetId(asset.name);
      const collisionOwner = idOwners.get(assetId);
      if (collisionOwner && collisionOwner !== asset.name) {
        throw new Error(`Stable asset id collision: ${collisionOwner} and ${asset.name} both resolve to ${assetId}`);
      }
      idOwners.set(assetId, asset.name);
      assetsById[String(assetId)] = asset.name;
      const footprint = asset.placement?.footprint ?? [
        Math.max(1, Math.ceil(asset.size[0] / 16)),
        Math.max(1, Math.ceil(asset.size[1] / 16)),
      ];
      assetRecords[asset.name] = {
        assetId,
        category,
        anchor: asset.anchor,
        collision: asset.collision ?? [],
        animations,
        animationMeta,
        variants,
        variantMeta,
        states,
        markerLayers,
        ...(asset.charset && asset.glyphSize && asset.cellSize && asset.columns ? {
          font: {
            charset: asset.charset,
            glyphSize: asset.glyphSize,
            cellSize: asset.cellSize,
            columns: asset.columns,
          },
        } : {}),
        ...(asset.slice ? { slice: asset.slice } : {}),
        tags: assetTags(asset),
        placement: {
          layer: asset.placement?.layer ?? defaultLayer(category),
          footprint,
          blocksMovement: asset.placement?.blocksMovement ?? Boolean(asset.collision?.length),
          builderAvailable: asset.approved === true && asset.placement?.builderAvailable === true,
        },
      };
    }
    const height = Math.max(1, y + rowHeight);
    for (const season of seasons) {
      const rgba = new Uint8Array(ATLAS_WIDTH * height * 4);
      for (const placement of placements) {
        for (let pixelY = 0; pixelY < placement.asset.size[1]; pixelY += 1) {
          for (let pixelX = 0; pixelX < placement.asset.size[0]; pixelX += 1) {
            const character = placement.grid[pixelY]?.[pixelX] ?? '.';
            const color = resolveColor(
              character,
              palette,
              seasonSource[season],
              placement.asset.markers ?? {},
              placement.asset.sourcePalette ?? {},
            );
            setPixel(rgba, ATLAS_WIDTH, placement.frame.x + pixelX, placement.frame.y + pixelY, color);
          }
        }
      }
      const filename = `atlas_${category}_${season}.png`;
      await writeFile(new URL(filename, outputRoot), encodePng(ATLAS_WIDTH, height, rgba));
      atlasRecords[`${category}:${season}`] = filename;
    }
  }
  if (assetsById[String(MISSING_ASSET_ID)] !== MISSING_ASSET_NAME) {
    throw new Error(`Required placeholder asset ${MISSING_ASSET_NAME} is missing`);
  }
  await writeFile(new URL('atlas.meta.json', outputRoot), `${JSON.stringify(metadata, null, 2)}\n`);
  const registry = {
    schemaVersion: ASSET_REGISTRY_SCHEMA_VERSION,
    revision,
    revisionId,
    placeholderAssetId: MISSING_ASSET_ID,
    assets: Object.entries(assetRecords)
      .map(([name, value]) => compactRegistryAsset(name, value as RegistrySourceRecord))
      .sort((left, right) => left.assetId - right.assetId),
  };
  await writeFile(new URL('asset-registry.json', outputRoot), `${JSON.stringify(registry, null, 2)}\n`);
  await Promise.all([copyJsonAssets('maps'), copyJsonAssets('music'), copyJsonAssets('sfx')]);
  console.log(`Built ${assets.length} assets across ${categories.length} atlas categories.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildAtlases();
