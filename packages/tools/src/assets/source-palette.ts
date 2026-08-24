import { posix } from 'node:path';
import type { AssetSource } from './types.js';

const LICENSED_PACK_ROOTS = [
  'references/Cute_Fantasy',
  'references/Cute_Fantasy_Characters',
  'references/Cute_Fantasy_Desert',
  'references/Cute_Fantasy_Dungeons',
  'references/Cute_Fantasy_Free',
  'references/Cute_Fantasy_Halloween',
  'references/Cute_Fantasy_MilitaryCamp',
  'references/Cute_Fantasy_ShroomLands',
  'references/Cute_Fantasy_UI',
  'references/Cute_Fantasy_Volcano',
] as const;

export function sourcePaletteErrors(asset: AssetSource, allowed: ReadonlySet<string>): string[] {
  if (!asset.sourcePalette) return asset.sourcePaletteMode ? [`${asset.name}: sourcePaletteMode requires sourcePalette`] : [];
  const errors: string[] = [];
  if (asset.approved !== true) errors.push(`${asset.name}: sourcePalette requires an approved asset`);
  if (!asset.importedFrom || !asset.sourcePath) {
    errors.push(`${asset.name}: sourcePalette requires importedFrom and sourcePath provenance`);
  } else {
    const normalized = posix.normalize(asset.sourcePath);
    const root = LICENSED_PACK_ROOTS.find((candidate) => normalized.startsWith(`${candidate}/`));
    if (normalized !== asset.sourcePath || !root) {
      errors.push(`${asset.name}: sourcePalette sourcePath is not an approved Cute Fantasy input`);
    }
    if (posix.basename(normalized) !== asset.importedFrom) {
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
    const [x, y, width, height] = asset.sourceRegion;
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || width > asset.size[0] || height > asset.size[1]) {
      errors.push(`${asset.name}: sourceRegion must fit the authored canvas`);
    }
  }
  return errors;
}
