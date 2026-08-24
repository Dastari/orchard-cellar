import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateAssetSources } from './validate-assets.js';

const assetsDirectory = fileURLToPath(new URL('../../assets/', import.meta.url));
let validationTimer: NodeJS.Timeout | undefined;

console.log(`Watching authored assets in ${assetsDirectory}`);
watch(assetsDirectory, { recursive: true }, () => {
  clearTimeout(validationTimer);
  validationTimer = setTimeout(() => void validateAssetSources(), 100);
});
