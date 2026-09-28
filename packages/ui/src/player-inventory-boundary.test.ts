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

/** The shared pane and its building blocks. */
const SHARED_PANE_MODULES = new Set([
  'ui/src/kit/components/inventory-panel.ts',
  'ui/src/kit/components/inventory.ts',
  'ui/src/kit/components/content-frame.ts',
]);

/** Modules that read the backpack range without showing it: recipe ingredient counts and the client's capacity
 * projection for the UI model. */
const NOT_DISPLAYS = new Set([
  'ui/src/recipe-book.ts',
  'client/src/backpack-capacity.ts',
]);

/** Signs that a module shows the player's own inventory. */
const SIGNS: Readonly<Record<string, RegExp>> = {
  /** A kit slot grid or panel bound to one of the player's own containers. */
  'player-container-grid': /\buiInventory(?:Grid|Panel)\s*\(\s*\{[^}]*container:\s*'(?:backpack|hotbar|equipment|trade-inventory)'/gu,
  /** Working out which backpack cells to list (the capacity rule or the backpack slot range). */
  'backpack-range': /\b(?:accessibleBackpackCapacity|BACKPACK_SLOT_OFFSET)\b/gu,
  /** The host's own item-slot windows drawing the backpack (legacy, pre-kit). */
  'host-drawn-backpack': /\bthis\.backpackItemSlots\b/gu,
};

/** Every other module that still shows the player's inventory its own way, with its sign counts. Exact: fix a
 * surface and its entry must go (the test fails until it is removed), and nothing may be added. */
const LEGACY: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  // Trade's carried items: a ten-column grid of its own (BUG-067 follow-up PR).
  'ui/src/kit/components/trade.ts': { 'player-container-grid': 1, 'backpack-range': 5 },
  // The merchant's Sell tab lists the backpack as rows (BUG-067 follow-up PR).
  'ui/src/npc-interaction-ui.ts': { 'backpack-range': 4 },
  // The host's pre-kit item-slot windows, unused by the game since every window moved to the kit (BUG-067 cleanup).
  'ui/src/overworld-ui.ts': { 'backpack-range': 4, 'host-drawn-backpack': 25 },
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
    for (const [sign, pattern] of Object.entries(SIGNS)) {
      const count = source.match(pattern)?.length ?? 0;
      if (count) (found[path] ??= {})[sign] = count;
    }
  }
  return found;
}

describe('player inventory pane boundary (BUG-067)', () => {
  it('shows the player\'s inventory only through the shared pane, apart from the listed exceptions', () => {
    expect(offenders()).toEqual(LEGACY);
  });

  it('builds every retained inventory window\'s player pane with the shared component', () => {
    const frame = readFileSync(new URL('./kit/components/content-frame.ts', import.meta.url), 'utf8');
    expect(frame).toMatch(/uiPlayerInventoryPane\(\{/u);
    const menus = readFileSync(new URL('./game-host/inventory-menus.ts', import.meta.url), 'utf8');
    expect(menus).not.toMatch(/uiInventory(?:Grid|Panel)\s*\(/u);
  });
});
