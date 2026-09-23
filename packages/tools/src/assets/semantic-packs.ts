import { createHash } from 'node:crypto';

/** Stable families, independent of catalog order/count and global release revision. */
function semanticFamily(asset: { readonly category: string; readonly name: string }): string {
  const { category, name } = asset;
  const stem = name.replace(/^[a-z]+_cf_/, '');
  let family: string;
  if (category === 'tiles') {
    family = /(?:desert|savanna|shroom|volcanic|dungeon|cave|snow|swamp|beach|hearth|wood|interior|cellar)/.exec(stem)?.[0] ?? 'core';
    return `terrain-${family}`;
  }
  if (category === 'characters') {
    if (/^(npc|enemy|wildlife)_/.test(name)) {
      return `${name.split('_')[0]}-${stem.split('_')[0]}`;
    }
    if (/(?:hair|shirt|pants|shoes)_/.test(stem)) {
      // Standing, mounted and action frames for one cosmetic travel together.
      return `player-${stem.replace(/_(?:idle|running|action)$/, '')}`;
    }
    return 'player-core';
  }
  if (category === 'trees') return `trees-${stem.split('_')[0]}`;
  if (category === 'props') {
    family = stem.split('_')[0]!;
    if (family === 'hearth' || family === 'willow') family += `-${stem.split('_')[1] ?? 'core'}`;
    return `props-${family}`;
  }
  return category;
}

export function contentAddressedFilename(kind: 'atlas' | 'pack', bytes: Uint8Array | string): string {
  return `${kind}-${createHash('sha256').update(bytes).digest('hex')}.${kind === 'atlas' ? 'png' : 'json'}`;
}

export function semanticAtlasPack(asset: { readonly category: string; readonly name: string }): string {
  return semanticFamily(asset).replaceAll('_', '-');
}
