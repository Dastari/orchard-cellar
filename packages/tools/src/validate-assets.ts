import { access } from 'node:fs/promises';

const assetsDirectory = new URL('../../assets/', import.meta.url);

export async function validateAssetSources(): Promise<void> {
  try {
    await access(assetsDirectory);
    console.log('Asset source directory is present.');
  } catch {
    console.log('No authored assets yet; M0 validation passed.');
  }
}

await validateAssetSources();

