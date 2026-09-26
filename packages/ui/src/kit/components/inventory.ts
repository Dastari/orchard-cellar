import type { ContentRegistry, ItemStack } from '@orchard/sim';
import { EQUIPMENT_SLOTS, HOTBAR_SLOT_COUNT } from '@orchard/sim/inventory-layout';
import { itemDefinition } from '@orchard/sim/item-containers';
import { uiDurabilityFraction } from '../../item-durability.js';
import { containsPoint, type UiRect } from '../../geometry.js';
import type { LoadedAsset } from '../../assets.js';
import { drawOutlinedPixelText } from '../../pixel-ui.js';
import { uiInventorySlotTone } from '../../design-system/inventory.js';
import { UiInventoryController, type UiInventorySlotRef } from '../runtime/inventory.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone, UiControlSize } from '../tokens.js';
import { paintUiSkin, paintUiMissingArt, type UiKitArt } from './art.js';
import { drawUiSkinAsset } from '../../skin.js';
import { uiIcon, type UiIconSource } from './media.js';
import { uiFlex } from './layout.js';
import type { UiButtonModifiers } from './button.js';
import { paintUiSelector } from './window.js';
import { resolveUiSlotIcon, uiItemFrame, uiSlotArt, uiSlotArtPolicy, uiSlotArtRegistry, type UiSlotArt } from './slot-art.js';
import { uiSlotAcceptsItem, type UiSlotRules } from './slot-rules.js';
export { uiItemFrame };
/** The one item slot is the only element that shows or handles an item (wiki Roadmap/Item Slot Component).
 * `slot` is the 28x31 face (x2, x3 for md, lg). `inline` (a bare 16px icon for text rows) and `well` (a large
 * preview) are reserved: their looks await owner approval, so `uiSlot` refuses them until they ship (S6, S10). */
export type UiSlotVariant = 'slot' | 'inline' | 'well';
/** A slot's authored state. Only `selected` and `enabled: false` have an approved look today, the classic
 * selected corners and the 60% disabled face; `locked` blocks input and paints as disabled until the approved
 * locked face ships (S4). `pending` is carried for the controller and not painted. */
export interface UiSlotState {
  readonly enabled?: boolean;
  readonly locked?: { readonly reason: string };
  readonly selected?: boolean;
  readonly pending?: boolean;
}
/** Remaining cooldown, 0..1 of the whole. Reported by uiSlotView; the draining shade awaits approval. */
export interface UiSlotCooldown { readonly fraction: number; readonly seconds?: number }
/** How a slot takes part in drag and drop. Reported by uiSlotView until the slot controller (S2) reads it. */
export interface UiSlotDrag {
  readonly source?: boolean; readonly target?: boolean; readonly split?: boolean; readonly quickMove?: readonly string[];
}
/** Empty-slot placeholder: an equipment silhouette (painted today), or a derived item silhouette or an icon.
 * The item and icon forms are reported by uiSlotView and not painted; their look awaits owner approval. */
export type UiSlotPlaceholderSource = UiSlotPlaceholder | { readonly item: string } | { readonly icon: UiIconSource };
export interface UiSlotOptions {
  readonly id?: string; readonly label?: string; readonly stack?: ItemStack | null | (() => ItemStack | null);
  readonly icon?: UiIconSource;
  /** Item art for the slot to resolve and draw. Preferred over `artwork`, `iconAnimation` and `contentRegistry`,
   * which remain as a shorthand that the slot wraps into the same resolver. */
  readonly art?: UiSlotArt;
  readonly artwork?: Readonly<Record<string, LoadedAsset>>;
  readonly iconAnimation?: (item: ItemStack) => string;
  /** The live content registry for wear bars, so items defined only in published or Studio content get their
   * authored durability. Omitted, the slot falls back to the bootstrap registry. */
  readonly contentRegistry?: () => ContentRegistry | undefined;
  readonly variant?: UiSlotVariant;
  /** What the slot accepts. With a controller, a held stack is shown as refused over a slot these rules refuse,
   * decided by the sim's `slotAcceptsItem` (see `uiSlotAcceptsItem`). */
  readonly rules?: UiSlotRules;
  /** The initial state; change it with `uiSetSlotState`, which updates input blocking at once. */
  readonly state?: UiSlotState;
  readonly cooldown?: () => UiSlotCooldown | null;
  readonly drag?: UiSlotDrag;
  /** Replaces the item icon only: `bounds` is the 16px icon well (uiSlotIconRect). The slot still draws its chrome,
   * stack count, wear bar, hotkey and empty placeholders, the same way on every surface. */
  readonly renderContent?: (context: CanvasRenderingContext2D, bounds: UiRect, item: ItemStack, state: { readonly ghost: boolean }) => void;
  /** Presentation only: a preview never becomes an inventory stack. */
  readonly ghost?: () => ItemStack | null;
  readonly controller?: UiInventoryController; readonly binding?: UiInventorySlotRef;
  readonly tone?: UiTone; readonly hotkey?: string; readonly placeholder?: UiSlotPlaceholderSource;
  readonly disabled?: boolean; readonly selected?: boolean; readonly layout?: UiStyle; readonly onPress?: (event: UiButtonModifiers) => void;
  readonly allowSecondary?: boolean; readonly activateOn?: 'down' | 'up';
}
/** Bare item art at its native size, centred: station emblems, recipe lines, ingredient rows. */
export function uiItemImage(options: { readonly itemKind: string; readonly artwork?: UiSlotOptions['artwork']; readonly label?: string; readonly size?: number }): UiElement {
  const size = options.size ?? 16;
  return new UiElement({ kind: 'item-image', label: options.label ?? itemDefinition(options.itemKind)?.displayName ?? options.itemKind, style: { width: uiFixed(size), height: uiFixed(size), shrink: 0 },
    paint(element, { context }) {
      const asset = options.artwork?.[options.itemKind], source = asset && uiItemFrame(asset, itemDefinition(options.itemKind)?.iconAnimation);
      if (!asset || !source) return;
      const r = element.rect, fit = Math.min(r.width / source.width, r.height / source.height), factor = fit >= 1 ? Math.floor(fit) : fit;
      const width = Math.round(source.width * factor), height = Math.round(source.height * factor);
      context.drawImage(asset.image, source.x, source.y, source.width, source.height, r.x + Math.floor((r.width - width) / 2), r.y + Math.floor((r.height - height) / 2), width, height);
    },
  });
}
/** Equipment slot ids, plus the legacy silhouette names that map onto them. */
export type UiSlotPlaceholder = (typeof EQUIPMENT_SLOTS)[number]['id'] | 'bag' | 'ring' | 'shield' | 'weapon';
const LEGACY_SILHOUETTES: Readonly<Record<string, string>> = { bag: 'backpack', ring: 'watch', shield: 'off_hand', weapon: 'main_hand' };
/** Stack counts and hotkeys: dark ink on a light halo, legible on every slot tone. */
export const UI_SLOT_INKS = Object.freeze({ color: '#3f2832', outlineColor: '#f8ead0' });
/** The 16px icon well of a 28x31 slot (scaled with larger slots): 6px in, 6px down (owner position B, 2026-09-26). */
export function uiSlotIconRect(r: UiRect): UiRect {
  const scale = Math.max(1, Math.floor(Math.min(r.width / 28, r.height / 31))), size = 16 * scale;
  return { x: r.x + Math.floor((r.width - size) / 2), y: r.y + 6 * scale, width: size, height: size };
}
const WEAR_FILLS = { good: 'bar_fill_green.base.0', worn: 'bar_fill_gold.base.0', failing: 'bar_fill_red.base.0' } as const;
/** The wear bar: a dark 3px track 5px in from the sides and 8px above the foot (1px clear below the icon well), filled
 * green, gold then red. */
function paintUiSlotWear(context: CanvasRenderingContext2D, art: UiKitArt, r: UiRect, fraction: number, scale: number): void {
  const track = { x: r.x + 5 * scale, y: r.y + r.height - 8 * scale, width: r.width - 10 * scale, height: 3 * scale };
  context.fillStyle = '#3f2832'; context.fillRect(track.x, track.y, track.width, track.height);
  const width = Math.round(track.width * fraction);
  if (width <= 0) { context.fillStyle = '#c34242'; context.fillRect(track.x, track.y, scale, track.height); return; }
  const fill = art.skin.feedback[WEAR_FILLS[fraction > .5 ? 'good' : fraction > .2 ? 'worn' : 'failing']];
  if (fill) drawUiSkinAsset(context, fill.asset, { ...track, width });
}
/** A slot's derived state: what it would paint and accept right now. */
export interface UiSlotView {
  readonly variant: UiSlotVariant; readonly enabled: boolean; readonly locked: { readonly reason: string } | null;
  readonly selected: boolean; readonly pending: boolean; readonly cooldown: UiSlotCooldown | null;
  readonly placeholder: UiSlotPlaceholderSource | null; readonly rules: UiSlotRules | null; readonly drag: UiSlotDrag | null;
  /** Against the held stack: `accept` or `refuse`, from the controller and the slot's rules; null when nothing is held. */
  readonly dropTarget: 'accept' | 'refuse' | null;
}
const slotViews = new WeakMap<UiElement, () => UiSlotView>();
const slotStates = new WeakMap<UiElement, (state: UiSlotState | undefined) => void>();
/** Changes a slot's state. Enabling or blocking input applies at once (setDisabled), so hit-testing is right even
 * for a slot that is not painted; an unchanged blocking leaves an external setDisabled alone. */
export function uiSetSlotState(element: UiElement, state: UiSlotState | undefined): void {
  const set = slotStates.get(element); if (!set) throw new Error('uiSetSlotState needs a slot made by uiSlot'); set(state);
}
/** The derived state of a slot made by `uiSlot`, or undefined for any other element. */
export function uiSlotView(element: UiElement): UiSlotView | undefined { return slotViews.get(element)?.(); }
const slotStateBlocksInput = (state: UiSlotState | undefined) => state !== undefined && (state.enabled === false || state.locked !== undefined);
export function uiSlot(options: UiSlotOptions): UiElement {
  const variant = options.variant ?? 'slot';
  if (variant !== 'slot') throw new Error(`uiSlot variant '${variant}' awaits owner approval (wiki Roadmap/Item Slot Component)`);
  let unregister: (() => void) | undefined;
  let pressed = false;
  const stack = () => options.controller && options.binding ? options.controller.model.stack(options.binding) : typeof options.stack === 'function' ? options.stack() : options.stack ?? null;
  // One art resolver: the legacy artwork/iconAnimation/contentRegistry options wrap into the same UiSlotArt.
  const slotArt = options.art ?? uiSlotArt({ ...(options.artwork ? { artwork: options.artwork } : {}), ...(options.iconAnimation ? { iconAnimation: options.iconAnimation } : {}), ...(options.contentRegistry ? { contentRegistry: options.contentRegistry } : {}) });
  let current: UiSlotState | undefined = options.state;
  const state = () => current;
  const blocked = (next: UiSlotState | undefined = current) => Boolean(options.disabled) || slotStateBlocksInput(next);
  // Against the held stack: the controller's verdict, narrowed by the slot's own rules through the shared sim rule.
  const dropTarget = (): 'accept' | 'refuse' | null => {
    const cursor = options.controller?.model.cursor;
    if (!cursor || !options.controller || !options.binding) return null;
    const accepts = options.controller.model.canAccept(options.binding) && (options.rules === undefined || uiSlotAcceptsItem(options.rules, cursor.itemKind, uiSlotArtPolicy(slotArt)));
    return accepts ? 'accept' : 'refuse';
  };
  const slot = new UiElement({ id: options.id, kind: 'slot', label: options.label ?? (options.binding ? `${options.binding.container}/${options.binding.index}` : 'Slot'),
    focusable: Boolean(options.controller || options.onPress), disabled: blocked(), pointerMode: 'capture', props: { ...(options.tone ? { tone: options.tone } : {}), binding: options.binding, selected: options.selected ?? current?.selected ?? false },
    style: { width: uiFixed(28), height: uiFixed(31), display: 'stack', padding: 8, shrink: 0, ...options.layout }, children: options.icon ? [uiIcon(options.icon).setStyle({ width: 'grow', height: 'grow' })] : [],
    onPointer(event, element) {
      if (options.controller && options.binding) return options.controller.pointer(event, options.binding);
      if (!options.onPress) return false;
      if (event.type === 'cancel') { pressed = false; return true; }
      if (event.button !== 0 && !(options.allowSecondary && event.button === 2)) return false;
      if (event.type === 'down') { pressed = true; if (options.activateOn === 'down') options.onPress(event); return true; }
      if (event.type === 'up') {
        const activate = pressed && containsPoint(element.rect, event.point) && containsPoint(element.clip, event.point);
        pressed = false; if (activate && options.activateOn !== 'down') options.onPress(event); return true;
      }
      return pressed;
    },
    onKey(event) { if (event.key === 'Escape') { options.controller?.cancel(); return true; } if (!['Enter', ' ', 'ContextMenu'].includes(event.key)) return false;
      if (options.controller && options.binding) options.controller.activate(options.binding, event.key === 'ContextMenu' ? 2 : 0, event.shiftKey); else options.onPress?.({...event,button:event.key==='ContextMenu'?2:0}); return true; },
    onDispose() { unregister?.(); },
    paint(element, { context, art, hovered, focused }) {
      if (!art) return; if (art.missingArt) { paintUiMissingArt(context, element.rect, art); return; }
      context.save(); if (element.disabled) context.globalAlpha *= .6;
      const actual = stack(), ghost = actual ? null : options.ghost?.(), item = actual ?? ghost, r = element.rect, rarity = uiInventorySlotTone(item?.itemKind);
      paintUiSkin(context, art.skin.slot, `slot.${rarity === 'common' ? 'idle' : rarity}.0`, r);
      const scale = Math.max(1, Math.floor(Math.min(r.width / 28, r.height / 31)));
      if (item) {
        // One slot look everywhere (the classic hotbar): the icon in a 16px well, then the stack count,
        // wear bar and hotkey drawn by the slot itself, so a custom icon painter can't change them.
        if (options.renderContent) options.renderContent(context, uiSlotIconRect(r), item, { ghost: Boolean(ghost) });
        else {
          const icon = resolveUiSlotIcon(slotArt, item);
          if (icon) {
            const { image, source } = icon, well = uiSlotIconRect(r), fit = Math.min(well.width / source.width, well.height / source.height);
            const width = Math.max(1, Math.round(source.width * fit)), height = Math.max(1, Math.round(source.height * fit));
            context.save();
            // Crisp pixels at any fit: a smoothed downscale is what made slot icons look faded (owner item 6).
            context.imageSmoothingEnabled = false;
            if (ghost) context.globalAlpha *= .42;
            if (item.lit === false) { context.filter = 'brightness(42%) saturate(55%)'; context.globalAlpha *= .88; }
            context.drawImage(image, source.x, source.y, source.width, source.height, well.x + Math.round((well.width - width) / 2), well.y + Math.round((well.height - height) / 2), width, height);
            context.restore();
          }
        }
        if (!ghost && item.quantity > 1) drawOutlinedPixelText(context, art.pixel, String(item.quantity), r.x + r.width - 5 * scale, r.y + r.height - 15 * scale, { align: 'right', ...UI_SLOT_INKS });
        const durability = uiDurabilityFraction(item.itemKind, item.durability, uiSlotArtRegistry(slotArt));
        if (!ghost && durability !== null) paintUiSlotWear(context, art, r, durability, scale);
      } else if (typeof options.placeholder === 'string') paintUiSkin(context, art.skin.equipment, `silhouette.${LEGACY_SILHOUETTES[options.placeholder] ?? options.placeholder}`, r);
      if (options.hotkey) drawOutlinedPixelText(context, art.pixel, options.hotkey, r.x + 3, r.y + 3, UI_SLOT_INKS);
      // Authored corner selectors: green marks the selected hotbar slot or an accepting drop, red a refused drop, white hover and keyboard focus.
      const target = dropTarget(), selected = Boolean(element.props['selected']) || state()?.selected === true;
      if (selected || (hovered && target === 'accept')) paintUiSelector(context, art.skin.selector, 'confirm', r);
      else if (hovered && target === 'refuse') paintUiSelector(context, art.skin.selector, 'deny', r);
      else if (hovered || focused) paintUiSelector(context, art.skin.selector, 'neutral', r);
      context.restore();
    },
  });
  slotStates.set(slot, (next) => {
    const wasBlocked = blocked(); current = next;
    // Input blocking follows the state as it changes, not when the slot is next painted.
    if (blocked() !== wasBlocked) slot.setDisabled(blocked()); else slot.invalidateRoot?.(false);
  });
  slotViews.set(slot, () => {
    const cooldown = options.cooldown?.() ?? null;
    return Object.freeze({
      variant, enabled: !slot.disabled, locked: current?.locked ?? null,
      selected: Boolean(slot.props['selected']) || current?.selected === true, pending: current?.pending === true,
      cooldown: cooldown === null ? null : { ...cooldown, fraction: Math.min(1, Math.max(0, cooldown.fraction)) },
      placeholder: options.placeholder ?? null, rules: options.rules ?? null, drag: options.drag ?? null, dropTarget: dropTarget(),
    });
  });
  if (options.controller && options.binding) unregister = options.controller.register(slot, options.binding); return slot;
}
export interface UiInventoryCell {
  readonly id: string; readonly index?: number; readonly icon?: UiIconSource; readonly placeholder?: UiSlotOptions['placeholder']; readonly disabled?: boolean;
  /** Per-cell rules and state, passed straight to the cell's slot (see UiSlotOptions). */
  readonly rules?: UiSlotRules; readonly state?: UiSlotOptions['state'];
}
const cellSlotOptions = (cell: UiInventoryCell, art: UiSlotArt | undefined): Pick<UiSlotOptions, 'rules' | 'state' | 'art'> => ({
  ...(cell.rules ? { rules: cell.rules } : {}), ...(cell.state ? { state: cell.state } : {}), ...(art ? { art } : {}),
});
export interface UiInventoryGridOptions {
  readonly id?: string; readonly container: string; readonly cells?: readonly UiInventoryCell[]; readonly count?: number;
  readonly columns?: number | 'auto'; readonly slotSize?: UiControlSize | 'auto'; readonly gap?: 0 | 2 | 4;
  /** Logical recipes must retain their authored rows/columns when compact. */
  readonly fixedColumns?: boolean;
  readonly controller?: UiInventoryController; readonly artwork?: UiSlotOptions['artwork']; readonly layout?: UiStyle; readonly hotkeys?: boolean;
  /** Item art for every cell; preferred over artwork, iconAnimation and contentRegistry. */
  readonly art?: UiSlotArt;
  /** Read-only HUD snapshots do not own an inventory transfer controller. */
  readonly stack?: (index: number) => ItemStack | null;
  readonly ghost?: (index: number) => ItemStack | null;
  readonly onActivate?: (index: number, event: UiButtonModifiers) => void;
  readonly allowSecondary?: boolean; readonly activateOn?: UiSlotOptions['activateOn'];
  readonly iconAnimation?: UiSlotOptions['iconAnimation']; readonly contentRegistry?: UiSlotOptions['contentRegistry'];
  /** Icon only, in the slot's icon well; see UiSlotOptions.renderContent. */
  readonly renderContent?: (context: CanvasRenderingContext2D, bounds: UiRect, item: ItemStack, index: number, state: { readonly ghost: boolean }) => void;
}
export function uiInventoryGrid(options: UiInventoryGridOptions): UiElement {
  const cells: readonly UiInventoryCell[] = options.cells ?? Array.from({ length: options.count ?? 6 }, (_, index) => ({ id: String(index), index }));
  const gap = options.gap ?? 2; let previous = '';
  const grid = new UiElement({ id: options.id, kind: 'inventory-grid', props: { container: options.container }, style: { display: 'grid', columns: 'auto', columnWidth: uiFixed(28), minColumnWidth: uiFixed(28), rowHeight: uiFixed(31), width: 'grow', ...options.layout, gap, columnGap: gap, rowGap: gap },
    measure(element, available) {
      const count = element.children.filter(child => child.visible).length;
      const requested = options.columns === undefined || options.columns === 'auto' ? Infinity : Math.max(1, options.columns);
      let factor = options.slotSize === 'lg' ? 3 : options.slotSize === 'md' ? 2 : 1;
      if (options.slotSize === 'auto' && Number.isFinite(available.height)) for (const candidate of [3, 2, 1]) {
        const width = 28 * candidate, height = 31 * candidate;
        const columns = Math.max(1, Math.min(requested, Math.floor((available.width + gap) / (width + gap))));
        if (Math.ceil(count / columns) * (height + gap) - gap <= available.height && width <= available.width) { factor = candidate; break; }
      }
      const width = 28 * factor, slotHeight = 31 * factor;
      const columns = options.fixedColumns && Number.isFinite(requested) ? requested
        : Math.max(1, Math.min(count || 1, requested, Math.floor((available.width + gap) / (width + gap))));
      const key = `${factor}:${columns}`;
      if (key !== previous) { previous = key; element.setStyle({ columns, columnWidth: uiFixed(width), minColumnWidth: uiFixed(width), rowHeight: uiFixed(slotHeight) });
        for (const child of element.children) child.setStyle({ width: uiFixed(width), height: uiFixed(slotHeight) });
        element.setProps({ columns, slotScale: factor, slotWidth: width, slotHeight }, false);
      }
      const height = Math.max(0, Math.ceil(count / columns) * (slotHeight + gap) - gap);
      return { min: { width: options.fixedColumns ? columns * (width + gap) - gap : Math.min(width, available.width), height: slotHeight }, preferred: { width: columns * (width + gap) - gap, height } };
    }, children: cells.map((cell, index) => uiSlot({ id: options.id ? `${options.id}.slot.${cell.index ?? index}` : undefined, label: `${options.container}/${cell.id}`, binding: { container: options.container, index: cell.index ?? index }, controller: options.controller, ghost: options.ghost ? () => options.ghost!(cell.index ?? index) : undefined, iconAnimation: options.iconAnimation, contentRegistry: options.contentRegistry, renderContent: options.renderContent ? (context, bounds, item, state) => options.renderContent!(context, bounds, item, cell.index ?? index, state) : undefined, activateOn: options.activateOn, allowSecondary: options.allowSecondary, stack: options.stack ? () => options.stack!(cell.index ?? index) : undefined, onPress: options.onActivate ? event => options.onActivate!(cell.index ?? index,event) : undefined, artwork: options.artwork, icon: cell.icon, placeholder: cell.placeholder, disabled: cell.disabled, ...cellSlotOptions(cell, options.art), ...(options.hotkeys ? { hotkey: String((index + 1) % 10) } : {}) })),
  }); return grid;
}
export function uiHotbar(options: UiInventoryGridOptions & { readonly selected?: number | (() => number); readonly digitKeys?: boolean; readonly onSelect?: (index: number) => void }): UiElement {
  const base = uiInventoryGrid({ ...options, count: options.count ?? HOTBAR_SLOT_COUNT, columns: options.columns ?? options.count ?? HOTBAR_SLOT_COUNT, hotkeys: true, activateOn: 'down',
    onActivate: options.controller ? options.onActivate : index => select(index) });
  const controlled = typeof options.selected === 'function' ? options.selected : undefined;
  const applySelection = (index: number) => {
    if (grid.props['selected'] !== index) grid.setProps({ selected: index }, false);
    grid.children.forEach((child, slot) => { if (child.props['selected'] !== (slot === index)) child.setProps({ selected: slot === index }, false); });
  };
  const select = (index: number) => { applySelection(controlled ? controlled() : index); options.onSelect?.(index); };
  const initial = controlled ? controlled() : typeof options.selected === 'number' ? options.selected : 0;
  const grid = new UiElement({ ...base.hooks, children: [...base.children], props: { ...base.props, selected: initial },
    measure(element, available) { if (controlled) applySelection(controlled()); return base.hooks.measure!(element, available); },
    onKey(event) {
      if (options.digitKeys === false || !/^[0-9]$/u.test(event.key) || event.ctrlKey || event.metaKey || event.altKey) return false;
      if (controlled && event.repeat) return true;
      const index = event.key === '0' ? 9 : Number(event.key) - 1; if (index >= grid.children.length) return false; select(index); return true;
    } });
  applySelection(initial); return grid;
}
/** Equipment arranged around the wearer: armour down the left, accessories down the right and
 * both hands beneath the portrait well. Every slot keeps its logical binding. */
export const UI_PAPER_DOLL_LAYOUT = {
  left: ['head', 'neck', 'body', 'backpack'], right: ['hands', 'legs', 'feet', 'watch'], hands: ['main_hand', 'off_hand'],
} as const satisfies Record<string, readonly (typeof EQUIPMENT_SLOTS)[number]['id'][]>;
export function uiPaperDoll(options: UiInventoryGridOptions & { readonly portrait?: UiElement }): UiElement {
  const byIndex = new Map((options.cells ?? EQUIPMENT_SLOTS.map((slot): UiInventoryCell => ({ id: slot.id, index: slot.index }))).map((cell, index) => [cell.index ?? index, cell]));
  const slot = (id: (typeof EQUIPMENT_SLOTS)[number]['id']) => {
    const definition = EQUIPMENT_SLOTS.find(entry => entry.id === id)!, cell = byIndex.get(definition.index);
    if (!cell) return uiFlex({ width: uiFixed(28), height: uiFixed(31), shrink: 0 }, []);
    return uiSlot({ id: options.id ? `${options.id}.slot.${definition.index}` : undefined, label: definition.label.toLowerCase().replace(/(^|\s)\S/gu, letter => letter.toUpperCase()),
      binding: { container: options.container, index: definition.index }, controller: options.controller, artwork: options.artwork, iconAnimation: options.iconAnimation, contentRegistry: options.contentRegistry,
      stack: options.stack ? () => options.stack!(definition.index) : undefined, onPress: options.onActivate ? event => options.onActivate!(definition.index, event) : undefined,
      renderContent: options.renderContent ? (context, bounds, item, state) => options.renderContent!(context, bounds, item, definition.index, state) : undefined,
      placeholder: cell.placeholder ?? id, disabled: cell.disabled, allowSecondary: options.allowSecondary, activateOn: options.activateOn, ...cellSlotOptions(cell, options.art) });
  };
  const column = (ids: readonly (typeof EQUIPMENT_SLOTS)[number]['id'][]) => uiFlex({ direction: 'column', gap: 2, shrink: 0 }, ids.map(slot));
  const well = new UiElement({ kind: 'paper-doll-well', label: 'Character preview', style: { width: uiFixed(72), height: uiFixed(97), display: 'stack', padding: 4, shrink: 0 },
    children: options.portrait ? [options.portrait.setStyle({ width: 'grow', height: 'grow' })] : [],
    paint(element, { context, art }) {
      if (!art || art.missingArt) return;
      const r = element.rect;
      paintUiSkin(context, art.skin.frame, 'thin', r);
    },
  });
  const centre = uiFlex({ direction: 'column', gap: 2, align: 'center', shrink: 0 }, [well, uiFlex({ direction: 'row', gap: 2 }, UI_PAPER_DOLL_LAYOUT.hands.map(slot))]);
  return uiFlex({ id: options.id, direction: 'row', gap: 4, align: 'start', shrink: 0, ...options.layout },
    [column(UI_PAPER_DOLL_LAYOUT.left), centre, column(UI_PAPER_DOLL_LAYOUT.right)]);
}
