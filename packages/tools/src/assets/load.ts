import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetSource, PaletteSource } from './types.js';

export const workspaceRoot = new URL('../../../../', import.meta.url);
export const assetsRoot = new URL('packages/assets/', workspaceRoot);

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
}

export async function readJson(path: URL | string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

export async function loadPalette(): Promise<PaletteSource> {
  return await readJson(new URL('palette.json', assetsRoot)) as PaletteSource;
}

export async function loadAssets(): Promise<AssetSource[]> {
  const files = (await walk(new URL('.', assetsRoot).pathname))
    .filter((path) => path.endsWith('.sprite.json') || path.endsWith('.tile.json'))
    .sort();
  return await Promise.all(files.map(async (path) => await readJson(path) as AssetSource));
}

