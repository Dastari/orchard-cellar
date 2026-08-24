import { basename } from 'node:path';
import type { AssetSource } from './types.js';

export function sourcePaletteErrors(asset: AssetSource, allowed: ReadonlySet<string>): string[] {
  if (!asset.sourcePalette) return asset.sourcePaletteMode ? [`${asset.name}: sourcePaletteMode requires sourcePalette`] : [];
  const errors: string[] = [];
  if (asset.approved !== true) errors.push(`${asset.name}: sourcePalette requires an approved asset`);
  if (!asset.importedFrom || !asset.sourcePath) {
    errors.push(`${asset.name}: sourcePalette requires importedFrom and sourcePath provenance`);
  } else {
    if (!asset.sourcePath.startsWith('references/Cute_Fantasy')) {
      errors.push(`${asset.name}: sourcePalette sourcePath is not an approved Cute Fantasy input`);
    }
    if (basename(asset.sourcePath) !== asset.importedFrom) {
      errors.push(`${asset.name}: sourcePath basename does not match importedFrom`);
    }
  }
  if (asset.sourcePaletteMode !== 'exact') errors.push(`${asset.name}: sourcePalette must declare exact mode`);
  const used = new Set(Object.values(asset.frames).flatMap((frames) => frames.flatMap((grid) => grid.flatMap((row) => [...row]))));
  used.delete('.');
  for (const [character, hex] of Object.entries(asset.sourcePalette)) {
    if (!allowed.has(character)) errors.push(`${asset.name}: sourcePalette overrides unknown character ${character}`);
    if (!/^#[0-9a-f]{6}$/i.test(hex)) errors.push(`${asset.name}: sourcePalette ${character} has invalid hex ${hex}`);
    if (!used.has(character)) errors.push(`${asset.name}: sourcePalette contains unused character ${character}`);
  }
  for (const character of used) {
    if (!asset.sourcePalette[character]) errors.push(`${asset.name}: exact sourcePalette is missing used character ${character}`);
  }
  if (asset.sourceRegion) {
    const [, , width, height] = asset.sourceRegion;
    if (width <= 0 || height <= 0 || width > asset.size[0] || height > asset.size[1]) {
      errors.push(`${asset.name}: sourceRegion must fit the authored canvas`);
    }
  }
  return errors;
}
