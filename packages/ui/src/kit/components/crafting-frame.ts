import type { ItemStack } from '@orchard/sim';
import { UiElement } from '../runtime/element.js';
import { uiContentFrame, type UiContentFrameElement, type UiContentFrameOptions } from './content-frame.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiSlot, uiInventoryGrid } from './inventory.js';
import { uiRecipeBook, type UiRecipeBookElement, type UiRecipeBookEntry, type UiRecipeStatus } from './recipe-book.js';
import { uiGlyph, uiGlyphButton } from './window.js';
import { uiTooltip } from './tooltip.js';
import { measureUiElement } from '../layout/measure.js';

export interface UiCraftingRecipe {
  readonly id: string; readonly label: string; readonly detail?: string; readonly pattern?: readonly (string | null)[];
  /** Recipe-book presentation: what it makes, whether it can be made here and what it needs. */
  readonly output?: ItemStack; readonly status?: UiRecipeStatus;
  /** Why the recipe cannot be placed (skill rank or missing station), shown visibly in the book. */
  readonly reason?: string;
  readonly ingredients?: readonly { readonly itemKind: string; readonly name: string; readonly need: number; readonly have: number }[];
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
  /** Start with the recipe book open (for example when a recipe link opened the bench). */
  readonly bookOpen?: boolean;
}
export interface UiCraftingFrameElement extends UiContentFrameElement {
  updateCrafting(snapshot: UiCraftingSnapshot): void;
  /** Open or close the recipe book beside the bench. */
  setRecipeBook(open: boolean): void;
  /** Tell the bench how much room it has; the open book replaces the bench when both cannot fit. */
  setCraftingViewport(width: number, height: number): void;
}

const RESULT_HINT = 'Take the result. Shift-click to craft as many as you can.';

/** Approved crafting: the bench window holds only the 3×3 pattern, the result and the carried inventory.
 * Recipes live in a separate two-page recipe book opened from the bench's book button; placing a recipe
 * ghost-fills the pattern. The book and bench share one host root and one input scope. */
export function uiCraftingFrame(options: UiCraftingFrameOptions): UiCraftingFrameElement {
  let snapshot = options.crafting, query = options.recipeFilter ?? '', open = options.bookOpen ?? false, selected = snapshot.selected ?? snapshot.recipes[0]?.id ?? null;
  const grids: UiElement[] = [], results: UiElement[] = [], reasons: UiElement[] = [];
  const toggle = uiGlyphButton({ id: 'crafting.recipe-book', glyph: 'glyph.recipe_book', label: 'Recipe book', onPress: () => setRecipeBook(!open) });
  const frame = uiContentFrame({ ...options, renderPane: pane => {
    const custom = options.renderPane?.(pane); if (custom) return custom;
    // The recipe list is not shown on the bench; the recipe book replaces it.
    if (pane.kind === 'recipe_list') return uiFlex({ id: `pane:${pane.id}`, display: 'none' }, []);
    if ('self' in pane.bind && pane.bind.self === 'crafting') {
      const grid = uiInventoryGrid({ container: options.aliases.crafting ?? 'crafting', count: (pane.columns ?? 3) * (pane.rows ?? 3), columns: pane.columns ?? 3,
        fixedColumns: true, controller: options.controller, artwork: options.artwork, iconAnimation: options.iconAnimation, layout: { width: 'fit' },
        ghost: index => { const itemKind = snapshot.pattern[index]; return itemKind ? { itemKind, quantity: 1 } : null; },
      }); grids.push(grid);
      const result = uiSlot({ label: 'Craft result', activateOn: 'up', artwork: options.artwork, iconAnimation: options.iconAnimation, stack: () => snapshot.output,
        onPress: event => { if (snapshot.output && !snapshot.requirement) options.onCraft(event.shiftKey === true); },
      }); results.push(result);
      // A locked result says why in words under the grid (touch has no hover); the tooltip keeps the full hint.
      const reason = uiText('', { wrap: true, layout: { alignSelf: 'stretch', visible: false } }).setProps({ ink: '#9e2835' }); reasons.push(reason);
      // The window's ribbon already names the bench, so its header only labels the recipe book button.
      return uiFlex({ id: `pane:${pane.id}`, direction: 'column', gap: 4, shrink: 0 }, [
        uiFlex({ direction: 'row', align: 'center', justify: 'end', gap: 4, alignSelf: 'stretch' }, [uiText('Recipe book', { role: 'caption' }), toggle]),
        uiFlex({ direction: 'row', align: 'center', gap: 6 }, [grid, uiGlyph('glyph.play'), uiTooltip(() => snapshot.requirement ?? RESULT_HINT, result)]),
        reason,
      ]);
    }
    return undefined;
  } });
  const entries = (): UiRecipeBookEntry[] => snapshot.recipes.map(recipe => ({ id: recipe.id, name: recipe.label,
    output: recipe.output ?? { itemKind: recipe.id, quantity: 1 }, status: recipe.status ?? 'ready',
    ...(recipe.status === 'station' && recipe.detail ? { station: recipe.detail } : {}), ...(recipe.reason ? { reason: recipe.reason } : {}), ingredients: recipe.ingredients ?? [] }));
  let book: UiRecipeBookElement | null = null;
  const createBook = () => uiRecipeBook({ id: 'crafting.recipes', recipes: entries(), selected, artwork: options.artwork, query,
    onSelect: id => { selected = id; },
    // Choosing the recipe that is already placed keeps it (the host's selection toggles off on a repeat).
    onPlace: id => { if (snapshot.selected !== id) options.onRecipe(id); selected = id; if (crowded) setRecipeBook(false); },
    onQuery: value => { query = value; options.onRecipeFilter(value); },
    onClose: () => setRecipeBook(false) });
  // Desktop sets the book beside the bench; tall narrow screens stack it above. When neither fits (the
  // game's small logical viewports), the open book takes the bench's place and placing a recipe returns to it.
  let crowded = false, viewport = { width: Infinity, height: Infinity };
  const host = new UiElement({ id: 'crafting.host', kind: 'crafting-bench', label: 'Crafting', style: { display: 'flex', direction: 'row', wrap: true, gap: 8, align: 'center', justify: 'center', alignSelf: 'center' }, children: [frame] });
  const applyCrowding = () => {
    let next = false;
    if (book && Number.isFinite(viewport.width + viewport.height)) {
      frame.setStyle({ display: 'flex' });
      const b = measureUiElement(book, viewport).preferred, f = measureUiElement(frame, viewport).preferred;
      next = b.width + 8 + f.width > viewport.width && b.height + 8 + f.height > viewport.height;
    }
    crowded = next; frame.setStyle({ display: crowded ? 'none' : 'flex' });
  };
  const rebuild = () => {
    const current = book;
    book = open ? createBook() : null;
    host.replaceChildren(book ? [book, frame] : [frame]);
    current?.dispose();
    toggle.label = open ? 'Close recipe book' : 'Open recipe book';
    applyCrowding();
  };
  /** The host's viewport, so the open book can take the bench's place when neither fits beside or above it. */
  const setCraftingViewport = (width: number, height: number) => { if (viewport.width === width && viewport.height === height) return; viewport = { width, height }; applyCrowding(); };
  function setRecipeBook(next: boolean): void { if (next === open) return; open = next; rebuild(); }
  const updateCrafting = (next: UiCraftingSnapshot): void => {
    const changed = snapshot.recipes.length !== next.recipes.length || snapshot.recipes.some((row, index) => { const other = next.recipes[index]!;
      return row.id !== other.id || row.label !== other.label || row.status !== other.status || JSON.stringify(row.ingredients) !== JSON.stringify(other.ingredients); });
    snapshot = next; if (next.selected) selected = next.selected;
    for (const grid of grids) grid.invalidate();
    for (const result of results) { result.setDisabled(!next.output || Boolean(next.requirement)); result.invalidate(); }
    const reasonText = next.requirement ? next.requirement.charAt(0) + next.requirement.slice(1).toLowerCase() : '';
    for (const reason of reasons) { if (reason.props['text'] !== reasonText) reason.setProps({ text: reasonText }); reason.setStyle({ visible: Boolean(reasonText) }); }
    if (changed) book?.updateRecipeBook(entries());
  };
  rebuild(); updateCrafting(snapshot);
  return Object.assign(host, { updateCrafting, setRecipeBook, setCraftingViewport, updateState: frame.updateState, updateTiming: frame.updateTiming });
}
