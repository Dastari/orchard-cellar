import type { ItemStack } from '@orchard/sim';
import { itemDefinition } from '@orchard/sim/item-containers';
import { containsPoint } from '../../geometry.js';
import { drawPixelText, fitPixelText } from '../../pixel-ui.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { paintUiSkin, uiSkinFrame, uiElementUpperCase } from './art.js';
import type { UiLoadedSkinFamily } from '../skin/load.js';
import { uiFrame } from './frame.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiButton } from './button.js';
import { uiInput } from './input.js';
import { uiItemFrame, uiSlot, type UiSlotOptions } from './inventory.js';
import { uiGlyph, uiGlyphButton } from './window.js';

export type UiRecipeStatus = 'ready' | 'missing' | 'station' | 'locked';
export interface UiRecipeBookEntry {
  readonly id: string; readonly name: string; readonly output: ItemStack; readonly status: UiRecipeStatus;
  /** Station the recipe needs, when it is not the open one. */
  readonly station?: string;
  /** Why the recipe cannot be placed yet; shown on its page in warning ink. */
  readonly reason?: string;
  readonly ingredients: readonly { readonly itemKind: string; readonly name: string; readonly need: number; readonly have: number }[];
}
export interface UiRecipeBookOptions {
  readonly id?: string; readonly recipes: readonly UiRecipeBookEntry[]; readonly selected?: string | null;
  readonly artwork?: UiSlotOptions['artwork']; readonly query?: string;
  readonly onSelect: (id: string) => void; readonly onPlace: (id: string) => void;
  readonly onQuery?: (query: string) => void; readonly onClose?: () => void;
  readonly layout?: UiStyle;
}
const INK = '#3f2832', MUTED = '#9e5f45', GOOD = '#265c42', BAD = '#9e2835';
const ROWS_PER_PAGE = 7;

/** One recipe line on the left page: output icon, name and a ready check. */
function recipeRow(entry: UiRecipeBookEntry, selected: () => boolean, options: UiRecipeBookOptions): UiElement {
  return new UiElement({ id: options.id ? `${options.id}.recipe.${entry.id}` : undefined, kind: 'recipe-row', label: entry.name, focusable: true, pointerMode: 'capture',
    style: { height: uiFixed(16), shrink: 0, alignSelf: 'stretch' },
    onPointer(event, element) { if (event.type === 'up' && containsPoint(element.clip, event.point)) { options.onSelect(entry.id); return true; } return event.type === 'down'; },
    onKey(event) { if (event.key === 'Enter' || event.key === ' ') { options.onSelect(entry.id); return true; } return false; },
    paint(element, { context, art, hovered, focused }) {
      if (!art) return;
      const r = element.rect, active = selected();
      if (active || hovered || focused) { context.fillStyle = active ? '#e4a672' : 'rgba(228, 166, 114, 0.45)'; context.fillRect(r.x, r.y, r.width, r.height); }
      if (focused) { context.fillStyle = '#fff6e0'; context.fillRect(r.x, r.y + r.height - 1, r.width, 1); }
      const asset = options.artwork?.[entry.output.itemKind], source = asset && uiItemFrame(asset, itemDefinition(entry.output.itemKind)?.iconAnimation);
      if (asset && source) context.drawImage(asset.image, source.x, source.y, source.width, source.height, r.x + 1, r.y, 16, 16);
      const ink = entry.status === 'locked' ? MUTED : INK;
      const label = fitPixelText(uiElementUpperCase(element) ? entry.name.toUpperCase() : entry.name, r.width - 34, 1, art.pixel.font);
      drawPixelText(context, art.pixel, label, r.x + 20, r.y + 4, { color: ink });
      if (entry.status === 'ready') paintUiSkin(context, art.skin.icon, 'glyph.check', { x: r.x + r.width - 14, y: r.y, width: 16, height: 16 });
    },
  });
}

/** Ingredient line on the right page, with have/need counts in success or danger ink. */
function ingredientRow(ingredient: UiRecipeBookEntry['ingredients'][number], options: UiRecipeBookOptions): UiElement {
  return new UiElement({ kind: 'recipe-ingredient', label: `${ingredient.name} ${ingredient.have}/${ingredient.need}`, style: { height: uiFixed(16), shrink: 0, alignSelf: 'stretch' },
    paint(element, { context, art }) {
      if (!art) return;
      const r = element.rect, asset = options.artwork?.[ingredient.itemKind], source = asset && uiItemFrame(asset, itemDefinition(ingredient.itemKind)?.iconAnimation);
      if (asset && source) context.drawImage(asset.image, source.x, source.y, source.width, source.height, r.x, r.y, 16, 16);
      const count = `${ingredient.have}/${ingredient.need}`, countWidth = count.length * 6 - 1;
      const name = uiElementUpperCase(element) ? ingredient.name.toUpperCase() : ingredient.name;
      drawPixelText(context, art.pixel, fitPixelText(name, r.width - 24 - countWidth, 1, art.pixel.font), r.x + 19, r.y + 4, { color: INK });
      drawPixelText(context, art.pixel, count, r.x + r.width - countWidth, r.y + 4, { color: ingredient.have >= ingredient.need ? GOOD : BAD });
    },
  });
}

export interface UiRecipeBookElement extends UiElement {
  /** Refresh recipes in place; the search field, its focus and the current page survive. */
  updateRecipeBook(recipes: readonly UiRecipeBookEntry[]): void;
}
export function uiRecipeBook(options: UiRecipeBookOptions): UiRecipeBookElement {
  let page = 0, query = options.query ?? '', recipes = options.recipes, selected = options.selected ?? options.recipes[0]?.id ?? null;
  const selectedId = () => selected;
  const visible = () => recipes.filter(entry => entry.name.toLowerCase().includes(query.trim().toLowerCase()));
  // Selection is the book's own state; choosing a line only turns the right-hand page.
  const choose = (id: string) => { selected = id; refresh(); options.onSelect(id); };
  const rowOptions = { ...options, onSelect: choose };
  const list = uiFlex({ direction: 'column', gap: 0, height: uiFixed(ROWS_PER_PAGE * 16), shrink: 0 }, []);
  const pager = uiText('', { align: 'center', layout: { width: 'grow' } });
  const right = uiFlex({ direction: 'column', gap: 4, width: uiFixed(128), shrink: 0 }, []);
  const detail = (entry: UiRecipeBookEntry | null): UiElement[] => entry ? [
    uiFlex({ direction: 'row', gap: 6, align: 'center' }, [
      uiSlot({ label: entry.name, stack: entry.output, artwork: options.artwork }),
      uiFlex({ direction: 'column', gap: 2, width: uiFixed(94) }, [
        uiText(entry.name, { wrap: true, maxLines: 2 }),
        uiText(entry.output.quantity > 1 ? `Makes ${entry.output.quantity}` : 'Makes 1', { role: 'caption' }),
      ]),
    ]),
    uiText('NEEDS', { role: 'label' }),
    ...entry.ingredients.map(ingredient => ingredientRow(ingredient, options)),
    ...((entry.status === 'locked' || entry.status === 'station') ? [uiText(entry.reason ?? (entry.station ? `Use a ${entry.station}` : 'Not available yet'), { wrap: true, layout: { alignSelf: 'stretch' } }).setProps({ ink: '#9e2835' })]
      : entry.station ? [uiText(`Use a ${entry.station}`, { wrap: true })] : []),
    uiFlex({ direction: 'row', justify: 'end', alignSelf: 'stretch' }, [
      uiButton({ id: options.id ? `${options.id}.place` : undefined, label: 'Place in grid', tone: 'primary', size: 'md', disabled: entry.status === 'locked' || entry.status === 'station', onPress: () => options.onPlace(entry.id) }),
    ]),
  ] : [uiText('Choose a recipe to see what it needs.', { wrap: true, textCase: 'as-authored' })];
  let shown = '';
  const refresh = () => {
    const rows = visible(), pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE)); page = Math.min(page, pages - 1);
    for (const child of [...list.children]) child.dispose();
    list.replaceChildren(rows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE).map(entry => recipeRow(entry, () => entry.id === selectedId(), rowOptions)));
    pager.setProps({ text: `${page + 1} / ${pages}` });
    // The detail page only rebuilds when its recipe or that recipe's needs change, keeping button presses alive.
    const entry = recipes.find(recipe => recipe.id === selectedId()) ?? null, key = JSON.stringify(entry);
    if (key !== shown) { shown = key; const previous = [...right.children]; right.replaceChildren(detail(entry)); for (const child of previous) child.dispose(); }
  };
  const search = uiInput({ id: options.id ? `${options.id}.search` : undefined, label: 'Search recipes', placeholder: 'Search', value: query, maxLength: 24, clearable: true, leading: uiGlyph('glyph.search'),
    onChange(value) { query = value; page = 0; refresh(); options.onQuery?.(value); } });
  const turn = (step: number) => { page = Math.max(0, page + step); refresh(); };
  const left = uiFlex({ direction: 'column', gap: 4, width: uiFixed(128), shrink: 0 }, [
    search, list,
    uiFlex({ direction: 'row', align: 'center', alignSelf: 'stretch' }, [
      uiGlyphButton({ glyph: 'glyph.previous', chrome: 'none', label: 'Previous page', onPress: () => turn(-1) }), pager,
      uiGlyphButton({ glyph: 'glyph.next', chrome: 'none', label: 'Next page', onPress: () => turn(1) }),
    ]),
  ]);
  refresh();
  // Books close with a page tab standing on the top edge, the pack's icon-tab idiom.
  const close = options.onClose ? uiBookTabClose({ label: 'Close recipe book', onPress: options.onClose }) : null;
  close?.setStyle({ position: 'absolute', inset: { right: 24, top: 0 } });
  // Two 128px leaves either side of a 24px spine, inside the book's 16px margins.
  const book = uiFrame({ id: options.id, style: 'book', padding: 16, layout: { direction: 'row', gap: 24, width: uiFixed(312), height: uiFixed(196), ...options.layout }, children: [left, right] });
  book.setProps({ label: 'Recipe book' });
  // The tab rises 16px above the cover; its foot tucks behind the book's top edge.
  // Chrome offsets resolve against the content box, so the cover sits in a padded column and the tab stays unclipped.
  const element = new UiElement({ kind: 'recipe-book', label: 'Recipe book', props: { textCase: 'upper' }, style: { display: 'stack' }, children: [...(close ? [close] : []), uiFlex({ direction: 'column', padding: { top: 24 } }, [book])],
    onKey(event) { if (event.key === 'PageDown') { turn(1); return true; } if (event.key === 'PageUp') { turn(-1); return true; } return false; } });
  return Object.assign(element, { updateRecipeBook(next: readonly UiRecipeBookEntry[]) { recipes = next; refresh(); } });
}

/** Draws an upright page tab `height` px tall whose foot sits at `bottom`: the rounded head keeps
 * its authored rows and the plain body band repeats downward, so tabs can stand taller than the sprite. */
export function paintUiBookTab(context: CanvasRenderingContext2D, family: UiLoadedSkinFamily, key: string, x: number, bottom: number, height: number): void {
  const entry = family[key], source = entry && uiSkinFrame(entry); if (!entry || !source) return;
  const head = key.endsWith('_raised') ? 5 : 8, band = source.height - 1;
  const top = bottom - height;
  context.drawImage(entry.asset.image, source.x, source.y + (key.endsWith('_raised') ? 0 : 3), source.width, head, x, top, source.width, head);
  context.drawImage(entry.asset.image, source.x, source.y + band, source.width, 1, x, top + head, source.width, Math.max(0, height - head));
}

/** Upright page tab with a red cross on the book's top edge; it lifts when hovered or focused. */
export function uiBookTabClose(options: { readonly label: string; readonly onPress: () => void; readonly id?: string }): UiElement {
  let pressed = false;
  return new UiElement({ id: options.id, kind: 'button', label: options.label, focusable: true, pointerMode: 'capture',
    style: { width: uiFixed(20), height: uiFixed(28), shrink: 0 },
    onPointer(event, element) {
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); element.invalidateRoot?.(false); return true; }
      if (event.type === 'up' && pressed) { pressed = false; event.release(); element.invalidateRoot?.(false); if (containsPoint(element.clip, event.point)) options.onPress(); return true; }
      if (event.type === 'cancel') { pressed = false; event.release(); return true; }
      return pressed;
    },
    onKey(event) { if (event.key === 'Enter' || event.key === ' ') { options.onPress(); return true; } return false; },
    paint(element, { context, art, hovered, focused }) {
      if (!art) return;
      // The foot tucks 4px behind the cover; hovering or focusing lifts the tab three pixels.
      const r = element.rect, raised = (hovered || focused) && !pressed, height = raised ? r.height : r.height - 3;
      paintUiBookTab(context, art.skin.book, raised ? 'tab.cream_raised' : 'tab.cream', r.x, r.y + r.height, height);
      paintUiSkin(context, art.skin.icon, 'glyph.cross.red', { x: r.x + 2, y: r.y + r.height - height + 3, width: 16, height: 16 });
    },
  });
}
