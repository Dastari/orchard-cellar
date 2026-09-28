import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Owner decision 2026-09-28 (BUG-067): "EVERY interface/dialog that shows players inventory should use that same
 * player inventory... so its consistent." The player's inventory is shown only through the shared pane
 * (`uiPlayerInventoryPane`, built by the content frame for every retained inventory window). This scans every
 * non-test source file of the game UI and client and fails when a new place lists or draws the player's inventory
 * any other way. Known exceptions are listed exactly and may only shrink.
 */
const PACKAGES = ['ui', 'client'] as const;

/** The shared pane, the shared footer hotbar and the kit slot they are made of. */
const SHARED_PANE_MODULES = new Set([
  'ui/src/kit/components/inventory-panel.ts',
  'ui/src/kit/components/inventory.ts',
]);

/** Modules that read the backpack range without showing it: recipe ingredient counts and the client's capacity
 * projection for the UI model. */
const NOT_DISPLAYS = new Set([
  'ui/src/recipe-book.ts',
  'client/src/backpack-capacity.ts',
]);

/** A player container named in a slot grid's options: the player's own bag, hotbar or equipment. */
const PLAYER_CONTAINER = /container:\s*(?:'(?:backpack|hotbar|equipment|trade-inventory)'|[\w.?]*aliases\??\.(?:backpack|hotbar|equipment)\b)/u;

/** Each call of a raw slot grid (grid, panel or hotbar) whose options name a player container. */
function rawPlayerGrids(source: string): number {
  let count = 0;
  for (const match of source.matchAll(/\bui(?:InventoryGrid|InventoryPanel|Hotbar)\s*\(/gu)) {
    let depth = 0, index = match.index + match[0].length - 1;
    for (; index < source.length; index++) {
      if (source[index] === '(') depth++;
      else if (source[index] === ')' && --depth === 0) break;
    }
    if (PLAYER_CONTAINER.test(source.slice(match.index, index))) count++;
  }
  return count;
}

/** Signs that a module shows the player's own inventory. */
const SIGNS: Readonly<Record<string, (source: string) => number>> = {
  /** A raw kit grid, panel or hotbar bound to one of the player's own containers (not the shared pane or hotbar). */
  'player-container-grid': rawPlayerGrids,
  /** Working out which backpack cells to list (the capacity rule or the backpack slot range). */
  'backpack-range': source => source.match(/\b(?:accessibleBackpackCapacity|BACKPACK_SLOT_OFFSET)\b/gu)?.length ?? 0,
  /** The host's own item-slot windows drawing the backpack (legacy, pre-kit). */
  'host-drawn-backpack': source => source.match(/\bthis\.backpackItemSlots\b/gu)?.length ?? 0,
};

/** Every other module with a sign, and exactly how many. Exact both ways: a new sign fails, and so does a fixed one
 * until its count here goes down. */
const EXCEPTIONS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  // The content frame's Studio preview draws authored panes as plain grids (the game windows use the shared pane).
  'ui/src/kit/components/content-frame.ts': { 'player-container-grid': 1 },
  // Studio's game-surface specimen of the HUD's hotbar and vitals row: the HUD, not an inventory window.
  'ui/src/kit/components/game-surface.ts': { 'player-container-grid': 1 },
  // Trade maps the shared pane's cells to its inventory slots to offer them (the pane draws them).
  'ui/src/kit/components/trade.ts': { 'backpack-range': 6 },
  // The merchant's Sell tab maps the shared pane's cells to inventory slots (the pane draws them) ...
  'ui/src/kit/components/merchant.ts': { 'backpack-range': 4 },
  // ... and the NPC window works out which carried slots and how many cells that pane shows.
  'ui/src/npc-interaction-ui.ts': { 'backpack-range': 6 },
  // The host's gesture source reads backpack capacity; its slot table (Uncapped Storage step 2) replaced the host-drawn
  // backpack slot arrays.
  'ui/src/overworld-ui.ts': { 'backpack-range': 2 },
};

function sources(dir: URL, prefix: string): { readonly path: string; readonly source: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) return entry.name === 'lab' ? [] : sources(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')
      ? [{ path: `${prefix}${entry.name}`, source: readFileSync(new URL(entry.name, dir), 'utf8') }] : [];
  });
}

function offenders(): Record<string, Record<string, number>> {
  const found: Record<string, Record<string, number>> = {};
  for (const name of PACKAGES) for (const { path, source } of sources(new URL(`../../${name}/src/`, import.meta.url), `${name}/src/`)) {
    if (SHARED_PANE_MODULES.has(path) || NOT_DISPLAYS.has(path)) continue;
    for (const [sign, count] of Object.entries(SIGNS).map(([sign, measure]) => [sign, measure(source)] as const)) {
      if (count) (found[path] ??= {})[sign] = count;
    }
  }
  return found;
}

describe('player inventory pane boundary (BUG-067)', () => {
  it('shows the player\'s inventory only through the shared pane, apart from the listed exceptions', () => {
    expect(offenders()).toEqual(EXCEPTIONS);
  });

  it('builds every retained inventory window\'s player pane with the shared component', () => {
    const frame = readFileSync(new URL('./kit/components/content-frame.ts', import.meta.url), 'utf8');
    expect(frame).toMatch(/uiPlayerInventoryPane\(\{/u);
    expect(frame).toMatch(/uiPlayerHotbar\(\{/u);
    const menus = readFileSync(new URL('./game-host/inventory-menus.ts', import.meta.url), 'utf8');
    expect(menus).not.toMatch(/uiInventory(?:Grid|Panel)\s*\(/u);
  });
});
