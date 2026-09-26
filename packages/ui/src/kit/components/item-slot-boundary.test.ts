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

type Rule = 'slot-internals' | 'item-painter' | 'item-art-lookup' | 'item-art-pixels';
const ITEM_ART_MAP_INDEX = /\b(?:artwork|itemArt|itemArtwork)\s*(?:\?\.)?\s*\[/u;
const RULES: Readonly<Record<Exclude<Rule, 'item-art-pixels'>, RegExp>> = {
  /** The slot's own painters and art helpers (legacy ones included), used anywhere outside the slot. */
  'slot-internals': /\b(?:uiItemFrame|uiSlotIconRect|uiItemImage|paintUiSlotFace|resolveUiSlotIcon|drawUiInventorySlot\w*|uiInventorySlotTone|overworldItemArtwork)\b/u,
  /** A painter named like draw*Item*, defined or called. Items dropped in the world are world sprites, not UI,
   * so the engine's drawOverworldItem is not an item-slot painter. */
  'item-painter': /\bdraw(?!Overworld)\w*Item\w*\b/u,
  /** Indexing the item art map by item: resolving item art belongs to UiSlotArt. */
  'item-art-lookup': ITEM_ART_MAP_INDEX,
};
/** Drawing item art for pixels: a drawImage in a file that resolves item art itself. */
const DRAWS_IMAGE = /\bdrawImage\s*\(/u;
const ITEM_ART_SOURCE = new RegExp(`${ITEM_ART_MAP_INDEX.source}|\\bartwork\\.image\\b|\\buiItemFrame\\s*\\(`, 'u');

/**
 * Today's offenders, each with the migration PR that removes it. This list may only shrink: a new file or a new
 * rule fails the test, and so does an entry a file no longer needs, so each migration PR deletes its lines.
 *
 * Audit sites that no lexical scan can see are covered where their art comes from, or wait for the runtime check
 * (plan layer 3): the furniture detail in merchant-panels.ts draws the image npc-interaction-ui.ts looks up; the
 * character doll's renderContent comes from character-screen.ts; Studio's definition preview and reference pickers
 * (shell/definition-preview.ts, definition-fields.ts) show item icons through the generic asset preview (S10).
 */
const ALLOWLIST: Readonly<Record<string, readonly Rule[]>> = {
  // Character paper doll icons painted by the host's drawItem (S5).
  'ui/src/character-screen.ts': ['item-painter'],
  // Furniture detail image looked up for merchant-panels.ts (S6).
  'ui/src/npc-interaction-ui.ts': ['item-art-lookup'],
  // Expedition Rewards window, legacy drawItem rows (S7).
  'ui/src/outdoor-rewards.ts': ['item-painter'],
  // Held stack, spread corners, drawItemIcon and the legacy window painters (S2, S3, S5, S9).
  'ui/src/overworld-ui.ts': ['slot-internals', 'item-painter', 'item-art-lookup', 'item-art-pixels'],
  // The legacy second slot painter, drawUiInventorySlot* (S9).
  'ui/src/design-system/inventory.ts': ['slot-internals', 'item-painter', 'item-art-lookup', 'item-art-pixels'],
  // HUD hotbar renderContent and the main-hand disc (S5).
  'ui/src/game-host/hud.ts': ['item-painter'],
  // Station emblem (uiItemImage) and machine art lookup (S1, S8).
  'ui/src/kit/components/content-frame.ts': ['slot-internals', 'item-art-lookup'],
  // Gateway logo board draws the cask item art (found by this scan; not in the audit).
  'ui/src/kit/components/gateway-game.ts': ['slot-internals', 'item-art-pixels'],
  // Item tooltip icon well (S6).
  'ui/src/kit/components/item-tooltip.ts': ['item-art-pixels'],
  // Merchant rows (S6).
  'ui/src/kit/components/merchant.ts': ['slot-internals', 'item-art-lookup', 'item-art-pixels'],
  // Recipe list rows and ingredients (S6).
  'ui/src/kit/components/recipe-book.ts': ['slot-internals', 'item-art-lookup', 'item-art-pixels'],
  // Skill graph nodes draw skill art from the item art map (S8, uiSlotFace).
  'ui/src/kit/components/skill-graph.ts': ['item-art-lookup', 'item-art-pixels'],
  // Skill emblem passes a skill id as an item (S8).
  'ui/src/kit/components/skills.ts': ['item-art-lookup'],
  // Shop row lab copy of the merchant row (S6 deletes it).
  'ui/src/kit/components/social.ts': ['slot-internals', 'item-art-pixels'],
  // Trade builds its own missing-art fallback for its slots (found by this scan; UiSlotArt owns the fallback, S6).
  'ui/src/kit/components/trade.ts': ['item-art-lookup'],
  // Lab design sheets' station emblem (uiItemImage) (S8).
  'ui/src/kit/lab/design-sheets.ts': ['slot-internals'],
  // Studio Operate inventory builds its own artwork map for a kit grid (S10).
  'studio/src/shell/inventory-preview.ts': ['item-art-lookup'],
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

function offenders(): Map<string, Set<Rule>> {
  const found = new Map<string, Set<Rule>>();
  for (const name of PACKAGES) {
    for (const { path, source } of sources(new URL(`../../../../${name}/src/`, import.meta.url), `${name}/src/`)) {
      if (SLOT_MODULE.has(path)) continue;
      const text = code(source), rules = new Set<Rule>();
      for (const [rule, pattern] of Object.entries(RULES) as [Rule, RegExp][]) if (pattern.test(text)) rules.add(rule);
      if (DRAWS_IMAGE.test(text) && ITEM_ART_SOURCE.test(text)) rules.add('item-art-pixels');
      if (rules.size > 0) found.set(path, rules);
    }
  }
  return found;
}

describe('item slot boundary', () => {
  const found = offenders();

  it('lets no file outside the slot module draw item art or use the slot internals', () => {
    const unexpected = [...found].flatMap(([path, rules]) => [...rules]
      .filter((rule) => !(ALLOWLIST[path] ?? []).includes(rule)).map((rule) => `${path}: ${rule}`));
    expect(unexpected, 'Show items through uiSlot and pass art as UiSlotArt; never add to the allowlist').toEqual([]);
  });

  it('keeps the allowlist exact, so it can only shrink', () => {
    const stale = Object.entries(ALLOWLIST).flatMap(([path, rules]) => rules
      .filter((rule) => !found.get(path)?.has(rule)).map((rule) => `${path}: ${rule}`));
    expect(stale, 'These entries are no longer needed: delete them from the allowlist').toEqual([]);
  });

  it('scans all three packages and finds the slot module itself', () => {
    const all = PACKAGES.flatMap((name) => sources(new URL(`../../../../${name}/src/`, import.meta.url), `${name}/src/`));
    for (const name of PACKAGES) expect(all.some(({ path }) => path.startsWith(`${name}/src/`)), name).toBe(true);
    for (const path of SLOT_MODULE) expect(all.some((entry) => entry.path === path), path).toBe(true);
    // The rules do fire on the slot's own painter, so an empty result is not a broken scan.
    const slot = code(all.find(({ path }) => path === 'ui/src/kit/components/inventory.ts')!.source);
    expect(DRAWS_IMAGE.test(slot) && RULES['slot-internals'].test(slot)).toBe(true);
  });
});
