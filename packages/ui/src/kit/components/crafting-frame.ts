import type { ItemStack } from '@orchard/sim';
import type { UiElement } from '../runtime/element.js';
import { uiFixed } from '../layout/box.js';
import { uiContentFrame, type UiContentFrameElement, type UiContentFrameOptions } from './content-frame.js';
import { uiFlex } from './layout.js';
import { uiInput } from './input.js';
import { uiList } from './collections.js';
import { uiText } from './text.js';
import { uiSlot, uiInventoryGrid } from './inventory.js';

export interface UiCraftingRecipe {
  readonly id: string; readonly label: string; readonly detail?: string; readonly pattern?: readonly (string | null)[];
}
export interface UiCraftingSnapshot {
  readonly recipes: readonly UiCraftingRecipe[]; readonly selected: string | null;
  readonly pattern: readonly (string | null)[]; readonly output: ItemStack | null;
  readonly requirement?: string;
}
export interface UiCraftingFrameOptions extends UiContentFrameOptions {
  readonly crafting: UiCraftingSnapshot; readonly recipeFilter?: string;
  readonly onRecipe: (id: string) => void; readonly onRecipeFilter: (query: string) => void;
  readonly onCraft: (all: boolean) => void;
}
export interface UiCraftingFrameElement extends UiContentFrameElement {
  updateCrafting(snapshot: UiCraftingSnapshot): void;
}
/** Crafting uses the authored frame's pane placement and shared inventory authority.
 * Recipe previews are paint-only; the host decides whether a result is craftable. */
export function uiCraftingFrame(options: UiCraftingFrameOptions): UiCraftingFrameElement {
  let snapshot = options.crafting, query = options.recipeFilter ?? '';
  const filtered = () => snapshot.recipes.filter(row => `${row.id} ${row.label}`.toLowerCase().includes(query.trim().toLowerCase()));
  const grids: UiElement[] = [], lists: UiElement[] = [], results: UiElement[] = [], requirements: UiElement[] = [];
  const frame = uiContentFrame({ ...options, renderPane: pane => {
    const custom = options.renderPane?.(pane); if (custom) return custom;
    if (pane.kind === 'recipe_list') {
      const input = uiInput({ label: 'Search recipes', placeholder: 'SEARCH RECIPES', value: options.recipeFilter ?? '', maxLength: 32, onChange: value => { query = value; for (const list of lists) list.setProps({ items: filtered(), active: 0 }); options.onRecipeFilter(value); } });
      const list = uiList({ label: 'Recipes', items: filtered(), key: row => row.id, rowHeight: uiFixed(44),
        render: row => uiText(`${row.id === snapshot.selected ? '> ' : ''}${row.label}${row.detail ? `\n${row.detail}` : ''}`, { maxLines: 3 }),
        onSelect: (_keys, row) => options.onRecipe(row.id), layout: { height: uiFixed(220), shrink: 0 },
      }); lists.push(list);
      return uiFlex({ width: 'grow', gap: 4 }, [input, list]);
    }
    if ('self' in pane.bind && pane.bind.self === 'crafting') {
      const grid = uiInventoryGrid({ container: options.aliases.crafting ?? 'crafting', count: (pane.columns ?? 3) * (pane.rows ?? 3), columns: pane.columns ?? 3,
        fixedColumns: true,
        slotSize: 'sm', controller: options.controller, artwork: options.artwork, iconAnimation: options.iconAnimation,
        ghost: index => { const itemKind = snapshot.pattern[index]; return itemKind ? { itemKind, quantity: 1 } : null; },
      }); grids.push(grid);
      const result = uiSlot({ label: 'Craft result', activateOn: 'up', artwork: options.artwork, iconAnimation: options.iconAnimation, stack: () => snapshot.output,
        onPress: event => { if (snapshot.output && !snapshot.requirement) options.onCraft(event.shiftKey === true); },
      }); results.push(result);
      const requirement = uiText(snapshot.requirement ?? 'Take result · Shift: craft all', { wrap: true }); requirements.push(requirement);
      return uiFlex({ width: 'grow', gap: 4 }, [grid, uiText('RESULT'), result, requirement]);
    }
    return undefined;
  } });
  const updateCrafting = (next: UiCraftingSnapshot): void => {
    const changed = snapshot.selected !== next.selected || snapshot.recipes.length !== next.recipes.length
      || snapshot.recipes.some((row, index) => { const nextRow = next.recipes[index]!;
        return row.id !== nextRow.id || row.label !== nextRow.label || row.detail !== nextRow.detail; });
    snapshot = next;
    for (const grid of grids) grid.invalidate();
    for (const result of results) { result.setDisabled(!next.output || Boolean(next.requirement)); result.invalidate(); }
    for (const text of requirements) {
      const value = next.requirement ?? 'Take result · Shift: craft all';
      if (text.props['text'] !== value) text.setProps({ text: value });
    }
    if (changed) for (const list of lists) list.setProps({ items: filtered() });
  };
  updateCrafting(snapshot);
  return Object.assign(frame, { updateCrafting });
}
