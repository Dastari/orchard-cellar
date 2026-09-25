import type { ItemStack } from '@orchard/sim';
import { EQUIPMENT_SLOTS, HOTBAR_SLOT_COUNT } from '@orchard/sim/inventory-layout';
import { itemDefinition } from '@orchard/sim/item-containers';
import { uiDurabilityFraction } from '../../item-durability.js';
import { containsPoint, type UiRect } from '../../geometry.js';
import type { LoadedAsset } from '../../assets.js';
import { selectAtlasFrame } from '../../sprite.js';
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
export interface UiSlotOptions {
  readonly id?: string; readonly label?: string; readonly stack?: ItemStack | null | (() => ItemStack | null);
  readonly icon?: UiIconSource; readonly artwork?: Readonly<Record<string, LoadedAsset>>;
  readonly iconAnimation?: (item: ItemStack) => string;
  /** Replaces stack art/count/durability only; slot chrome and empty placeholders remain shared. */
  readonly renderContent?: (context: CanvasRenderingContext2D, bounds: UiRect, item: ItemStack, state: { readonly ghost: boolean }) => void;
  /** Presentation only: a preview never becomes an inventory stack. */
  readonly ghost?: () => ItemStack | null;
  readonly controller?: UiInventoryController; readonly binding?: UiInventorySlotRef;
  readonly tone?: UiTone; readonly hotkey?: string; readonly placeholder?: UiSlotPlaceholder;
  readonly disabled?: boolean; readonly selected?: boolean; readonly layout?: UiStyle; readonly onPress?: (event: UiButtonModifiers) => void;
  readonly allowSecondary?: boolean; readonly activateOn?: 'down' | 'up';
}
/** Icon frame for an item asset: its declared animation, then the idle or closed pose. */
export function uiItemFrame(asset: LoadedAsset, animation?: string) {
  return selectAtlasFrame(asset.metadata, animation ?? 'base', 0) ?? selectAtlasFrame(asset.metadata, 'base', 0) ?? selectAtlasFrame(asset.metadata, 'idle', 0) ?? selectAtlasFrame(asset.metadata, 'closed', 0);
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
/** The 16px icon well of a 28x31 slot (scaled with larger slots): 6px in, 7px down. */
export function uiSlotIconRect(r: UiRect): UiRect {
  const scale = Math.max(1, Math.floor(Math.min(r.width / 28, r.height / 31))), size = 16 * scale;
  return { x: r.x + Math.floor((r.width - size) / 2), y: r.y + 7 * scale, width: size, height: size };
}
const WEAR_FILLS = { good: 'bar_fill_green.base.0', worn: 'bar_fill_gold.base.0', failing: 'bar_fill_red.base.0' } as const;
/** The wear bar: a dark 3px track 5px in from the sides and 7px above the foot, filled green, gold then red. */
function paintUiSlotWear(context: CanvasRenderingContext2D, art: UiKitArt, r: UiRect, fraction: number, scale: number): void {
  const track = { x: r.x + 5 * scale, y: r.y + r.height - 7 * scale, width: r.width - 10 * scale, height: 3 * scale };
  context.fillStyle = '#3f2832'; context.fillRect(track.x, track.y, track.width, track.height);
  const width = Math.round(track.width * fraction);
  if (width <= 0) { context.fillStyle = '#c34242'; context.fillRect(track.x, track.y, scale, track.height); return; }
  const fill = art.skin.feedback[WEAR_FILLS[fraction > .5 ? 'good' : fraction > .2 ? 'worn' : 'failing']];
  if (fill) drawUiSkinAsset(context, fill.asset, { ...track, width });
}
export function uiSlot(options: UiSlotOptions): UiElement {
  let unregister: (() => void) | undefined;
  let pressed = false;
  const stack = () => options.controller && options.binding ? options.controller.model.stack(options.binding) : typeof options.stack === 'function' ? options.stack() : options.stack ?? null;
  const slot = new UiElement({ id: options.id, kind: 'slot', label: options.label ?? (options.binding ? `${options.binding.container}/${options.binding.index}` : 'Slot'),
    focusable: Boolean(options.controller || options.onPress), disabled: options.disabled, pointerMode: 'capture', props: { ...(options.tone ? { tone: options.tone } : {}), binding: options.binding, selected: options.selected ?? false },
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
          const asset = options.artwork?.[item.itemKind], source = asset && uiItemFrame(asset, options.iconAnimation?.(item) ?? itemDefinition(item.itemKind)?.iconAnimation);
          if (asset && source) {
            const well = uiSlotIconRect(r), fit = Math.min(well.width / source.width, well.height / source.height);
            const width = Math.max(1, Math.round(source.width * fit)), height = Math.max(1, Math.round(source.height * fit));
            context.save();
            // Crisp pixels at any fit: a smoothed downscale is what made slot icons look faded (owner item 6).
            context.imageSmoothingEnabled = false;
            if (ghost) context.globalAlpha *= .42;
            if (item.lit === false) { context.filter = 'brightness(42%) saturate(55%)'; context.globalAlpha *= .88; }
            context.drawImage(asset.image, source.x, source.y, source.width, source.height, well.x + Math.round((well.width - width) / 2), well.y + Math.round((well.height - height) / 2), width, height);
            context.restore();
          }
        }
        if (!ghost && item.quantity > 1) drawOutlinedPixelText(context, art.pixel, String(item.quantity), r.x + r.width - 5 * scale, r.y + r.height - 14 * scale, { align: 'right', ...UI_SLOT_INKS });
        const durability = uiDurabilityFraction(item.itemKind, item.durability);
        if (!ghost && durability !== null) paintUiSlotWear(context, art, r, durability, scale);
      } else if (options.placeholder) paintUiSkin(context, art.skin.equipment, `silhouette.${LEGACY_SILHOUETTES[options.placeholder] ?? options.placeholder}`, r);
      if (options.hotkey) drawOutlinedPixelText(context, art.pixel, options.hotkey, r.x + 3, r.y + 3, UI_SLOT_INKS);
      // Authored corner selectors: green marks the selected hotbar slot or an accepting drop, red a refused drop, white hover and keyboard focus.
      const holding = Boolean(options.controller?.model.cursor), accepted = holding && options.controller && options.binding ? options.controller.model.canAccept(options.binding) : null;
      if (element.props['selected'] || (hovered && accepted === true)) paintUiSelector(context, art.skin.selector, 'confirm', r);
      else if (hovered && accepted === false) paintUiSelector(context, art.skin.selector, 'deny', r);
      else if (hovered || focused) paintUiSelector(context, art.skin.selector, 'neutral', r);
      context.restore();
    },
  });
  if (options.controller && options.binding) unregister = options.controller.register(slot, options.binding); return slot;
}
export interface UiInventoryCell { readonly id: string; readonly index?: number; readonly icon?: UiIconSource; readonly placeholder?: UiSlotOptions['placeholder']; readonly disabled?: boolean }
export interface UiInventoryGridOptions {
  readonly id?: string; readonly container: string; readonly cells?: readonly UiInventoryCell[]; readonly count?: number;
  readonly columns?: number | 'auto'; readonly slotSize?: UiControlSize | 'auto'; readonly gap?: 0 | 2 | 4;
  /** Logical recipes must retain their authored rows/columns when compact. */
  readonly fixedColumns?: boolean;
  readonly controller?: UiInventoryController; readonly artwork?: UiSlotOptions['artwork']; readonly layout?: UiStyle; readonly hotkeys?: boolean;
  /** Read-only HUD snapshots do not own an inventory transfer controller. */
  readonly stack?: (index: number) => ItemStack | null;
  readonly ghost?: (index: number) => ItemStack | null;
  readonly onActivate?: (index: number, event: UiButtonModifiers) => void;
  readonly allowSecondary?: boolean; readonly activateOn?: UiSlotOptions['activateOn'];
  readonly iconAnimation?: UiSlotOptions['iconAnimation'];
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
    }, children: cells.map((cell, index) => uiSlot({ id: options.id ? `${options.id}.slot.${cell.index ?? index}` : undefined, label: `${options.container}/${cell.id}`, binding: { container: options.container, index: cell.index ?? index }, controller: options.controller, ghost: options.ghost ? () => options.ghost!(cell.index ?? index) : undefined, iconAnimation: options.iconAnimation, renderContent: options.renderContent ? (context, bounds, item, state) => options.renderContent!(context, bounds, item, cell.index ?? index, state) : undefined, activateOn: options.activateOn, allowSecondary: options.allowSecondary, stack: options.stack ? () => options.stack!(cell.index ?? index) : undefined, onPress: options.onActivate ? event => options.onActivate!(cell.index ?? index,event) : undefined, artwork: options.artwork, icon: cell.icon, placeholder: cell.placeholder, disabled: cell.disabled, ...(options.hotkeys ? { hotkey: String((index + 1) % 10) } : {}) })),
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
      binding: { container: options.container, index: definition.index }, controller: options.controller, artwork: options.artwork, iconAnimation: options.iconAnimation,
      stack: options.stack ? () => options.stack!(definition.index) : undefined, onPress: options.onActivate ? event => options.onActivate!(definition.index, event) : undefined,
      renderContent: options.renderContent ? (context, bounds, item, state) => options.renderContent!(context, bounds, item, definition.index, state) : undefined,
      placeholder: cell.placeholder ?? id, disabled: cell.disabled, allowSecondary: options.allowSecondary, activateOn: options.activateOn });
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
