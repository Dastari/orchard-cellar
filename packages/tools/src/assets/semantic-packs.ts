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
    return playerCorePack(name);
  }
  if (category === 'trees') return `trees-${stem.split('_')[0]}`;
  if (category === 'props') {
    family = stem.split('_')[0]!;
    if (family === 'hearth' || family === 'willow') family += `-${stem.split('_')[1] ?? 'core'}`;
    return `props-${family}`;
  }
  return category;
}

/**
 * Static world S6: the former `player-core` pack (seven 2 MiB pages, about 27 MB decoded), split so a
 * client loads only what it draws. The standing and mounted frames of the default outfit (the
 * `player_cf_hair`-style names without a cosmetic suffix) join that cosmetic's own pack.
 */
const DEFAULT_OUTFIT_PACKS: Readonly<Record<string, string>> = {
  hair: 'player-hair-1-brown', farmer_shirt: 'player-shirt-farmer-green',
  farmer_pants: 'player-pants-farmer-white-brown', shoes: 'player-shoes-brown',
};
function playerCorePack(name: string): string {
  // The body every player draws: standing, mounted and action frames (loaded at startup).
  if (/^(?:player|rider|action)_cf_(?:base|hands)$/.test(name) || name === 'avatar_base') return 'player-body';
  const outfit = /^(?:player|rider)_cf_(hair|farmer_shirt|farmer_pants|shoes)$/.exec(name)?.[1];
  if (outfit !== undefined) return DEFAULT_OUTFIT_PACKS[outfit]!;
  // Torch and lantern: the held sheets and their hands.
  if (/^(?:tool|hands)_cf_(?:torch|lantern)_/.test(name)) return 'player-held-light';
  // One pack per swing or cast sheet, and one per tool kind for the tiered tool sheets.
  const action = /^tool_cf_(?:iron_|wooden_)?(axe|hoe|pickaxe|sword|bow|fishing_rod|watering_can)_action$/.exec(name)?.[1];
  if (action !== undefined) return `player-action-${action}`;
  const tiered = /^tool_(?:wood|stone|copper|iron|silver|gold)_(axe|hoe|pickaxe)$/.exec(name)?.[1];
  if (tiered !== undefined) return `player-tools-${tiered}`;
  if (/^wearable_cf_/.test(name)) return 'player-wearable-plate';
  // Humanoid actors (angels, goblins, knights, orcs): one pack per family.
  const actor = /^actor_cf_([a-z]+)_/.exec(name)?.[1];
  if (actor !== undefined) return `actor-${actor}`;
  if (/^horse_cf_/.test(name)) return 'mount-horse';
  if (/^avatar_cf_/.test(name)) return 'player-avatar-legacy';
  return 'player-core';
}

export function contentAddressedFilename(kind: 'atlas' | 'pack', bytes: Uint8Array | string): string {
  return `${kind}-${createHash('sha256').update(bytes).digest('hex')}.${kind === 'atlas' ? 'png' : 'json'}`;
}

export function semanticAtlasPack(asset: { readonly category: string; readonly name: string }): string {
  return semanticFamily(asset).replaceAll('_', '-');
}
