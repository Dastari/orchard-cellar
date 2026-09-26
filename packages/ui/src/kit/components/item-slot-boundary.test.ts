import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The item slot is the only thing that shows or handles items (wiki Roadmap/Item Slot Component, owner requirement
 * 2026-09-26). This scans every non-test source file of the game UI, the client and Studio and fails when code
 * outside the slot module draws item art or reaches for the slot's internals.
 */
const PACKAGES = ['ui', 'client', 'studio'] as const;

/** The slot module: the one component, its art resolver and its rules. */
const SLOT_MODULE = new Set([
  'ui/src/kit/components/inventory.ts',
  'ui/src/kit/components/slot-art.ts',
  'ui/src/kit/components/slot-rules.ts',
]);

type Rule = 'slot-internals' | 'item-painter' | 'item-art-lookup' | 'item-icon-asset' | 'item-art-pixels';
const ITEM_ART_MAP_INDEX = /\b(?:artwork|itemArt|itemArtwork)\s*(?:\?\.)?\s*\[/gu;
const ITEM_ICON_ASSET = /\.iconKey\b|\bicon\.asset\b/gu;
const RULES: Readonly<Record<Exclude<Rule, 'item-art-pixels'>, RegExp>> = {
  /** The slot's own painters and art helpers (legacy ones included), used anywhere outside the slot. */
  'slot-internals': /\b(?:uiItemFrame|uiSlotIconRect|uiItemImage|paintUiSlotFace|resolveUiSlotIcon|drawUiInventorySlot\w*|uiInventorySlotTone|overworldItemArtwork)\b/gu,
  /** A painter named like draw*Item*, defined or called. Items dropped in the world are world sprites, not UI,
   * so the engine's drawOverworldItem (that exact name only) is not an item-slot painter. */
  'item-painter': /\b(?!drawOverworldItem\b)draw\w*Item\w*\b/gu,
  /** Indexing the item art map by item: resolving item art belongs to UiSlotArt. */
  'item-art-lookup': ITEM_ART_MAP_INDEX,
  /** Resolving an item's icon asset from its definition (iconKey, icon.asset), whatever the art map is called
   * (for example the lab's assets.get(itemDefinition(kind)?.iconKey)). */
  'item-icon-asset': ITEM_ICON_ASSET,
};
/** Drawing item art for pixels: each drawImage in a file that resolves item art itself. */
const DRAWS_IMAGE = /\bdrawImage\s*\(/gu;
const ITEM_ART_SOURCE = new RegExp(`${ITEM_ART_MAP_INDEX.source}|${ITEM_ICON_ASSET.source}|\\bartwork\\.image\\b|\\buiItemFrame\\s*\\(`, 'u');

/** Not offenders, for one rule only: these load item art into the maps slots are given, or author the icon
 * field, and never draw. Kept exact like the allowlist: an entry the file no longer needs fails. */
const ART_SOURCES: Readonly<Record<string, Rule>> = {
  // The client's content art loader: fills the item art map the game hands to slots.
  'client/src/content/content-art-sync.ts': 'item-icon-asset',
  // Lab art mocks: fill the item art maps the lab hands to slots.
  'ui/src/kit/lab/inventory-mock.ts': 'item-icon-asset',
  'ui/src/kit/lab/game-mock.ts': 'item-icon-asset',
  // The item editor copies an icon asset name into a new item definition (content data, not art).
  'studio/src/tools/items/model.ts': 'item-icon-asset',
};

/**
 * Today's offenders: sites per file and rule, each file with the migration PR that removes it. The counts may only
 * shrink: a new file, a new rule or a higher count fails, and so does a count higher than the file now needs, so
 * each migration PR lowers or deletes its lines. `item-art-pixels` counts every drawImage in a file that resolves
 * item art itself, so it also counts that file's other images until the file is migrated.
 *
 * The furniture detail in merchant-panels.ts draws the image npc-interaction-ui.ts looks up, so that lookup stands for
 * it. The character doll's renderContent comes from character-screen.ts.
 */
const ALLOWLIST: Readonly<Record<string, Counts>> = {
  // Character paper doll icons painted by the host's drawItem (S5).
  'ui/src/character-screen.ts': { 'item-painter': 2 },
  // Furniture detail image looked up for merchant-panels.ts (S6).
  'ui/src/npc-interaction-ui.ts': { 'item-art-lookup': 1 },
  // Expedition Rewards window, legacy drawItem rows (S7).
  'ui/src/outdoor-rewards.ts': { 'item-painter': 2 },
  // Held stack, spread corners, drawItemIcon and the legacy window painters (S2, S3, S5, S9).
  'ui/src/overworld-ui.ts': { 'slot-internals': 15, 'item-painter': 52, 'item-art-lookup': 2, 'item-art-pixels': 3 },
  // The legacy second slot painter, drawUiInventorySlot* (S9).
  'ui/src/design-system/inventory.ts': { 'slot-internals': 5, 'item-painter': 2, 'item-art-lookup': 1, 'item-art-pixels': 2 },
  // HUD hotbar renderContent and the main-hand disc (S5).
  'ui/src/game-host/hud.ts': { 'item-painter': 3 },
  // Page-row icon well (unused by callers) (S8, uiSlotFace).
  'ui/src/kit/components/character-book.ts': { 'item-icon-asset': 3, 'item-art-pixels': 1 },
  // Station emblem (uiItemImage) and machine art lookup (S1, S8).
  'ui/src/kit/components/content-frame.ts': { 'slot-internals': 2, 'item-art-lookup': 1 },
  // Gateway logo board draws the cask item art (found by this scan; S6, uiSlot well).
  'ui/src/kit/components/gateway-game.ts': { 'slot-internals': 3, 'item-art-pixels': 4 },
  // Item tooltip icon well (S6).
  'ui/src/kit/components/item-tooltip.ts': { 'item-art-pixels': 1 },
  // Merchant rows (S6).
  'ui/src/kit/components/merchant.ts': { 'slot-internals': 2, 'item-art-lookup': 1, 'item-art-pixels': 1 },
  // Recipe list rows and ingredients (S6).
  'ui/src/kit/components/recipe-book.ts': { 'slot-internals': 3, 'item-art-lookup': 2, 'item-art-pixels': 4 },
  // Skill graph nodes draw skill art from the item art map (S8, uiSlotFace).
  'ui/src/kit/components/skill-graph.ts': { 'item-art-lookup': 1, 'item-art-pixels': 1 },
  // Skill emblem passes a skill id as an item (S8).
  'ui/src/kit/components/skills.ts': { 'item-art-lookup': 1 },
  // Shop row lab copy of the merchant row (S6 deletes it).
  'ui/src/kit/components/social.ts': { 'slot-internals': 2, 'item-art-pixels': 5 },
  // Trade builds its own missing-art fallback for its slots (found by this scan; UiSlotArt owns the fallback, S6).
  'ui/src/kit/components/trade.ts': { 'item-art-lookup': 3 },
  // Lab design sheets: station emblem (uiItemImage) and item art resolved through assets.get(...iconKey); the one
  // drawImage is an NPC portrait, counted because the file resolves item art (S6, S8).
  'ui/src/kit/lab/design-sheets.ts': { 'slot-internals': 2, 'item-icon-asset': 3, 'item-art-pixels': 1 },
  // Studio definition preview and reference pickers show item icons through the asset preview (S10).
  'studio/src/shell/definition-preview.ts': { 'item-icon-asset': 1 },
  // Studio Operate inventory builds its own artwork map for a kit grid (S10).
  'studio/src/shell/inventory-preview.ts': { 'item-art-lookup': 1, 'item-icon-asset': 1 },
};

function sources(directory: URL, prefix: string): { readonly path: string; readonly source: string }[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'dist' ? []
      : sources(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts') || entry.name.endsWith('.d.ts')) return [];
    return [{ path: `${prefix}${entry.name}`, source: readFileSync(new URL(entry.name, directory), 'utf8') }];
  });
}

/** Comments may name the painters they replace; only code counts. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/(^|[^:'"`\\])\/\/.*$/gmu, '$1');
}

type Counts = Partial<Record<Rule, number>>;
const count = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].length;

/** Sites per file and rule, outside the slot module and without the art sources' exempt rule. */
function offenders(): Map<string, Counts> {
  const found = new Map<string, Counts>();
  for (const name of PACKAGES) {
    for (const { path, source } of sources(new URL(`../../../../${name}/src/`, import.meta.url), `${name}/src/`)) {
      if (SLOT_MODULE.has(path)) continue;
      const text = code(source), counts: Counts = {};
      for (const [rule, pattern] of Object.entries(RULES) as [Rule, RegExp][]) {
        const sites = count(text, pattern);
        if (sites > 0 && ART_SOURCES[path] !== rule) counts[rule] = sites;
      }
      if (ITEM_ART_SOURCE.test(text) && count(text, DRAWS_IMAGE) > 0) counts['item-art-pixels'] = count(text, DRAWS_IMAGE);
      if (Object.keys(counts).length > 0) found.set(path, counts);
    }
  }
  return found;
}

describe('item slot boundary', () => {
  const found = offenders();
  const entries = (counts: ReadonlyMap<string, Counts> | Readonly<Record<string, Counts>>) =>
    (counts instanceof Map ? [...counts] : Object.entries(counts)).flatMap(([path, rules]) =>
      (Object.entries(rules) as [Rule, number][]).map(([rule, sites]) => ({ key: `${path}: ${rule}`, sites })));

  it('lets no file outside the slot module add an item-art site', () => {
    const allowed = new Map(entries(ALLOWLIST).map(({ key, sites }) => [key, sites]));
    const grown = entries(found).filter(({ key, sites }) => sites > (allowed.get(key) ?? 0))
      .map(({ key, sites }) => `${key}: ${allowed.get(key) ?? 0} -> ${sites}`);
    expect(grown, 'Show items through uiSlot and pass art as UiSlotArt; never raise the allowlist').toEqual([]);
  });

  it('keeps the allowlist counts exact, so they can only shrink', () => {
    const actual = new Map(entries(found).map(({ key, sites }) => [key, sites]));
    const shrunk = entries(ALLOWLIST).filter(({ key, sites }) => (actual.get(key) ?? 0) < sites)
      .map(({ key, sites }) => `${key}: ${sites} -> ${actual.get(key) ?? 0}`);
    expect(shrunk, 'Fewer sites than recorded: lower (or delete) these allowlist counts').toEqual([]);
  });

  it('keeps the art-source exemptions exact', () => {
    const stale = Object.entries(ART_SOURCES).flatMap(([path, rule]) => {
      const name = path.split('/')[0]!, relative = path.slice(name.length + '/src/'.length);
      const file = sources(new URL(`../../../../${name}/src/`, import.meta.url), `${name}/src/`).find((entry) => entry.path === path);
      return file && count(code(file.source), RULES[rule as Exclude<Rule, 'item-art-pixels'>]) > 0 ? [] : [`${relative}: ${rule}`];
    });
    expect(stale, 'These exemptions are no longer needed: delete them').toEqual([]);
  });

  it('scans all three packages and finds the slot module itself', () => {
    const all = PACKAGES.flatMap((name) => sources(new URL(`../../../../${name}/src/`, import.meta.url), `${name}/src/`));
    for (const name of PACKAGES) expect(all.some(({ path }) => path.startsWith(`${name}/src/`)), name).toBe(true);
    for (const path of SLOT_MODULE) expect(all.some((entry) => entry.path === path), path).toBe(true);
    // The rules do fire on the slot's own painter, so an empty result is not a broken scan.
    const slot = code(all.find(({ path }) => path === 'ui/src/kit/components/inventory.ts')!.source);
    expect(count(slot, DRAWS_IMAGE) > 0 && count(slot, RULES['slot-internals']) > 0).toBe(true);
    // Only the exact world-sprite painter is exempt from the painter rule.
    expect(count('drawOverworldItem(); drawOverworldItemIcon(); drawItemIcon();', RULES['item-painter'])).toBe(2);
  });
});
