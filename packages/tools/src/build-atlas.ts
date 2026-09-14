import { clearDeclaredPagePixels, pageShadowSelections, type DeclaredPageAsset } from './assets/omit-atlas-page.js';
import { buildBackdropPages } from './build-backdrop-pages.js';
import { compileEmissiveFrames } from './assets/emissive.js';
import {atlasSourceRevision,ATLAS_CATEGORY_SCHEMA_VERSION} from './assets/source-revision.js';
export {ATLAS_CATEGORY_SCHEMA_VERSION} from './assets/source-revision.js';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compileBakedShadow } from './assets/baked-shadow.js';
import { ATLAS_PAGE_WIDTH, packAtlasPages } from './assets/atlas-pages.js';
import { validateAtlasPages } from './assets/atlas-page-validation.js';
import { framesForAsset, resolveColor } from './assets/pixels.js';
export { expandBlob47 } from './assets/pixels.js';
import { stableAssetId } from './assets/asset-id.js';
import { frameKind, variantTopology } from './assets/frame-kind.js';
import { loadAssets, loadPalette, readJson, workspaceRoot } from './assets/load.js';
import { encodePng, setPixel } from './assets/png.js';
import type { AssetSource, BuiltFrame, BuiltPageAsset, BuiltPageDescriptor, PixelGrid } from './assets/types.js';

interface SeasonSource {
  readonly required: readonly string[];
  readonly spring: Readonly<Record<string, string>>;
  readonly summer: Readonly<Record<string, string>>;
  readonly autumn: Readonly<Record<string, string>>;
  readonly winter: Readonly<Record<string, string>>;
}

type Season = 'spring' | 'summer' | 'autumn' | 'winter';
const seasons: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
const outputRoot = new URL('packages/assets/generated/', workspaceRoot);
const ATLAS_WIDTH = ATLAS_PAGE_WIDTH;
const MISSING_ASSET_NAME = 'system_missing_asset';
const MISSING_ASSET_ID = 0;
export const ASSET_REGISTRY_SCHEMA_VERSION = 4;

interface RegistrySourceRecord {
  readonly assetId: number;
  readonly category: string;
  readonly pageId: string;
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
  readonly pageId: string;
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
    pageId: record.pageId,
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

export async function buildAtlases(): Promise<void> {
  const [assets, palette, seasonSource] = await Promise.all([
    loadAssets(),
    loadPalette(),
    readJson(new URL('packages/assets/seasons.json', workspaceRoot)) as Promise<SeasonSource>,
  ]);
  await mkdir(outputRoot, { recursive: true });

  const categories = [...new Set(assets.map((asset) => asset.category))].sort();
  const revision = atlasSourceRevision(assets,palette,seasonSource);
  const revisionId = stableAssetId(`atlas:${revision}`);
  const metadata: Record<string, unknown> = {
    schemaVersion: 4,
    revision,
    revisionId,
    placeholderAssetId: MISSING_ASSET_ID,
    atlases: {},
    omitAtlases: {},
    pages: {},
    assets: {},
    assetCategories: {},
    assetsById: {},
  };
  const atlasRecords = metadata['atlases'] as Record<string, string>;
  const omitAtlasRecords = metadata['omitAtlases'] as Record<string, string>;
  const pageRecords = metadata['pages'] as Record<string, BuiltPageDescriptor>;
  const assetRecords = metadata['assets'] as Record<string, unknown>;
  const assetCategories = metadata['assetCategories'] as Record<string, string>;
  const assetsById = metadata['assetsById'] as Record<string, string>;
  const markerRecords: Record<string, Record<string, { x: number; y: number; marker: string; shade: number }[][]>> = {};
  const markerAssetPages: Record<string, string> = {};
  const idOwners = new Map<number, string>([[MISSING_ASSET_ID, MISSING_ASSET_NAME]]);

  for (const category of categories) {
    const categoryAssets = assets.filter((asset) => asset.category === category).sort((a, b) => a.name.localeCompare(b.name));
    const pages = packAtlasPages(category, categoryAssets.map((asset) => ({
      name: asset.name, width: asset.size[0], height: asset.size[1],
      frameCount: Object.values(framesForAsset(asset)).reduce((sum, grids) => sum + grids.length, 0),
    })));
    const packedAssets = new Map(pages.flatMap((page) => page.assets.map((asset) => [asset.name, { ...asset, pageId: page.pageId }] as const)));
    const placements = new Map<string, { asset: AssetSource; grid: PixelGrid; frame: BuiltFrame }[]>();
    for (const page of pages) {
      pageRecords[page.pageId] = { width: page.width, height: page.height, decodedBytes: page.width * page.height * 4 };
      placements.set(page.pageId, []);
    }
    for (const asset of categoryAssets) {
      const packed = packedAssets.get(asset.name);
      if (!packed) throw new Error(`Missing packed asset: ${asset.name}`);
      let frameIndex = 0;
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
          const position = packed.frames[frameIndex++];
          if (!position) throw new Error(`Missing packed frame: ${asset.name}`);
          const frame = {
            x: position.x,
            y: position.y,
            width: asset.size[0],
            height: asset.size[1],
            durationTicks: kind === 'animation'
              ? Math.max(1, Math.round(60 / (asset.animationFps?.[groupName] ?? asset.fps ?? 1)))
              : 0,
          };
          placements.get(packed.pageId)!.push({ asset, grid, frame });
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
        pageId: packed.pageId,
        ...(asset.emissiveColors === undefined ? {} : { emissiveFrames: compileEmissiveFrames(asset, palette) }),
        ...(asset.bakedShadowColor === undefined ? {} : { bakedShadow: compileBakedShadow(asset, palette, seasonSource) }),
        anchor: asset.anchor,
        collision: asset.collision ?? [],
        animations,
        animationMeta,
        variants,
        variantMeta,
        states,
        ...(asset.charset && asset.glyphSize && asset.cellSize && asset.columns ? {
          font: {
            charset: asset.charset,
            glyphSize: asset.glyphSize,
            cellSize: asset.cellSize,
            columns: asset.columns,
          },
        } : {}),
        ...(asset.slice ? { slice: asset.slice } : {}),
        ...(asset.uiSizing ? { uiSizing: asset.uiSizing } : {}),
        ...(asset.uiRequiredStates ? { uiRequiredStates: asset.uiRequiredStates } : {}),
        tags: assetTags(asset),
        placement: {
          layer: asset.placement?.layer ?? defaultLayer(category),
          footprint,
          blocksMovement: asset.placement?.blocksMovement ?? Boolean(asset.collision?.length),
          builderAvailable: asset.approved === true && asset.placement?.builderAvailable === true,
        },
      };
      assetCategories[asset.name] = category;
      markerAssetPages[asset.name] = packed.pageId;
      if (Object.values(markerLayers).some((frames) => frames.some((pixels) => pixels.length > 0))) {
        markerRecords[asset.name] = markerLayers;
      }
    }
    for (const page of pages) {
      const shadowSelections = pageShadowSelections(Object.fromEntries(page.assets.map((asset) => [
        asset.name, assetRecords[asset.name] as DeclaredPageAsset,
      ])));
      for (const season of seasons) {
        const rgba = new Uint8Array(page.width * page.height * 4);
        for (const placement of placements.get(page.pageId) ?? []) {
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
        const filename = `atlas_${page.pageId.replace(':', '_')}_${season}.png`;
        await writeFile(new URL(filename, outputRoot), encodePng(page.width, page.height, rgba));
        atlasRecords[`${page.pageId}:${season}`] = filename;
        if (shadowSelections.length > 0) {
          clearDeclaredPagePixels(rgba, page.width, page.height, shadowSelections);
          const omitFilename = filename.replace(/\.png$/, '.omit.png');
          await writeFile(new URL(omitFilename, outputRoot), encodePng(page.width, page.height, rgba));
          omitAtlasRecords[`${page.pageId}:${season}`] = omitFilename;
        }
      }
    }
    await writeFile(new URL(`atlas_${category}.meta.json`, outputRoot), JSON.stringify({
      schemaVersion: ATLAS_CATEGORY_SCHEMA_VERSION,
      revision,
      category,
      assets: Object.fromEntries(categoryAssets.map((asset) => [asset.name, assetRecords[asset.name]])),
    }));
  }
  if (assetsById[String(MISSING_ASSET_ID)] !== MISSING_ASSET_NAME) {
    throw new Error(`Required placeholder asset ${MISSING_ASSET_NAME} is missing`);
  }
  validateAtlasPages(pageRecords, assetRecords as Record<string, BuiltPageAsset>, atlasRecords, seasons);
  // Runtime metadata is fetched before the first frame, so keep it compact and
  // move recolouring pixels behind the only feature that consumes them. The
  // editor still receives the complete asset catalogue from atlas.meta.json;
  // marker overrides lazily fetch atlas.markers.json when requested.
  const runtimeMetadata = { ...metadata };
  delete runtimeMetadata['assets'];
  await writeFile(new URL('atlas.meta.json', outputRoot), JSON.stringify(runtimeMetadata));
  await writeFile(new URL('atlas.markers.json', outputRoot), JSON.stringify({
    schemaVersion: 2,
    revision,
    assetPages: markerAssetPages,
    assets: markerRecords,
  }));
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
  await buildBackdropPages();
  console.log(`Built ${assets.length} assets across ${categories.length} atlas categories (${Object.keys(pageRecords).length} pages per season).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildAtlases();
