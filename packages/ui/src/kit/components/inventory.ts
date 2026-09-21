import { EQUIPMENT_SLOTS, HOTBAR_SLOT_COUNT, itemDefinition, type ItemStack } from '@orchard/sim';
import { uiDurabilityFraction } from '../../item-durability.js';
import { containsPoint } from '../../geometry.js';
import type { LoadedAsset } from '../../assets.js';
import { selectAtlasFrame } from '../../sprite.js';
import { drawOutlinedPixelText } from '../../pixel-ui.js';
import { uiInventorySlotTone } from '../../design-system/inventory.js';
import { UiInventoryController, type UiInventorySlotRef } from '../runtime/inventory.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiTone, UiControlSize } from '../tokens.js';
import { resolveUiTextContrast, UI_TONE_FACES } from '../skin/contrast.js';
import { paintUiSkin, paintUiMissingArt, uiElementTone } from './art.js';
import { uiIcon, type UiIconSource } from './media.js';
import { uiFlex } from './layout.js';
import type { UiButtonModifiers } from './button.js';
export interface UiSlotOptions {
  readonly id?: string; readonly label?: string; readonly stack?: ItemStack | null | (() => ItemStack | null);
  readonly icon?: UiIconSource; readonly artwork?: Readonly<Record<string, LoadedAsset>>;
  readonly iconAnimation?: (item: ItemStack) => string;
  /** Presentation only: a preview never becomes an inventory stack. */
  readonly ghost?: () => ItemStack | null;
  readonly controller?: UiInventoryController; readonly binding?: UiInventorySlotRef;
  readonly tone?: UiTone; readonly hotkey?: string; readonly placeholder?: 'bag' | 'head' | 'ring' | 'body' | 'shield' | 'legs' | 'weapon';
  readonly disabled?: boolean; readonly selected?: boolean; readonly layout?: UiStyle; readonly onPress?: (event: UiButtonModifiers) => void;
  readonly allowSecondary?: boolean; readonly activateOn?: 'down' | 'up';
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
      context.save(); if (element.disabled) context.globalAlpha *= .42;
      const actual = stack(), ghost = actual ? null : options.ghost?.(), item = actual ?? ghost, r = element.rect, rarity = uiInventorySlotTone(item?.itemKind), tone = uiElementTone(element);
      paintUiSkin(context, art.skin.slot, `slot.${rarity === 'common' ? 'idle' : rarity}.0`, r);
      const scale = Math.max(1, Math.floor(Math.min(r.width / 28, r.height / 31)));
      if (item) {
        const asset = options.artwork?.[item.itemKind], source = asset && (selectAtlasFrame(asset.metadata, options.iconAnimation?.(item) ?? itemDefinition(item.itemKind)?.iconAnimation ?? 'base', 0) ?? selectAtlasFrame(asset.metadata, 'idle', 0) ?? selectAtlasFrame(asset.metadata, 'closed', 0));
        if (asset && source) { const fit = Math.min((r.width - 8) / source.width, (r.height - 10) / source.height); const factor = fit >= 1 ? Math.min(scale, Math.floor(fit)) : Math.max(0, fit); const width = Math.max(1, Math.round(source.width * factor)), height = Math.max(1, Math.round(source.height * factor));
          context.save();
          if (ghost) context.globalAlpha *= .42;
          if (item.lit === false) context.globalAlpha *= .45;
          context.drawImage(asset.image, source.x, source.y, source.width, source.height, r.x + Math.floor((r.width - width) / 2), r.y + Math.floor((r.height - height) / 2), width, height);
          context.restore(); }
        if (!ghost && item.quantity > 1) drawOutlinedPixelText(context, art.pixel, String(item.quantity), r.x + r.width - 3, r.y + r.height - 10, { align: 'right', color: resolveUiTextContrast(tone).color, outlineColor: UI_TONE_FACES[tone].frame.face });
        const durability = uiDurabilityFraction(item.itemKind, item.durability);
        if (!ghost && durability !== null) { context.fillStyle = UI_TONE_FACES[durability > .5 ? 'success' : durability > .2 ? 'warning' : 'danger'].frame.face; context.fillRect(r.x + 4, r.y + r.height - 4, Math.floor((r.width - 8) * durability), 2); }
      } else if (options.placeholder) paintUiSkin(context, art.skin.equipment, `grey.${options.placeholder}`, r);
      if (options.hotkey) drawOutlinedPixelText(context, art.pixel, options.hotkey, r.x + 3, r.y + 3, { color: resolveUiTextContrast(tone).color, outlineColor: UI_TONE_FACES[tone].frame.face });
      if (hovered || focused || element.props['selected']) { const accepted = options.controller && options.binding && options.controller.model.canAccept(options.binding); context.strokeStyle = resolveUiTextContrast(accepted ? 'success' : tone).color; context.lineWidth = 1; context.strokeRect(r.x + 1.5, r.y + 1.5, Math.max(0, r.width - 3), Math.max(0, r.height - 3)); }
      context.restore();
    },
  });
  if (options.controller && options.binding) unregister = options.controller.register(slot, options.binding); return slot;
}
export interface UiInventoryCell { readonly id: string; readonly index?: number; readonly icon?: UiIconSource; readonly placeholder?: UiSlotOptions['placeholder']; readonly disabled?: boolean }
export interface UiInventoryGridOptions {
  readonly id?: string; readonly container: string; readonly cells?: readonly UiInventoryCell[]; readonly count?: number;
  readonly columns?: number | 'auto'; readonly slotSize?: UiControlSize | 'auto'; readonly gap?: 0 | 2 | 4;
  readonly controller?: UiInventoryController; readonly artwork?: UiSlotOptions['artwork']; readonly layout?: UiStyle; readonly hotkeys?: boolean;
  /** Read-only HUD snapshots do not own an inventory transfer controller. */
  readonly stack?: (index: number) => ItemStack | null;
  readonly ghost?: (index: number) => ItemStack | null;
  readonly onActivate?: (index: number, event: UiButtonModifiers) => void;
  readonly allowSecondary?: boolean; readonly activateOn?: UiSlotOptions['activateOn'];
  readonly iconAnimation?: UiSlotOptions['iconAnimation'];
}
export function uiInventoryGrid(options: UiInventoryGridOptions): UiElement {
  const cells: readonly UiInventoryCell[] = options.cells ?? Array.from({ length: options.count ?? 6 }, (_, index) => ({ id: String(index), index }));
  const gap = options.gap ?? 2; let previous = '';
  const grid = new UiElement({ id: options.id, kind: 'inventory-grid', props: { container: options.container }, style: { display: 'grid', columns: 'auto', columnWidth: uiFixed(28), minColumnWidth: uiFixed(28), rowHeight: uiFixed(31), width: 'grow', ...options.layout, gap, columnGap: gap, rowGap: gap },
    measure(element, available) {
      const requested = options.columns === undefined || options.columns === 'auto' ? Infinity : Math.max(1, options.columns);
      let factor = options.slotSize === 'lg' ? 3 : options.slotSize === 'md' ? 2 : 1;
      if (options.slotSize === 'auto' && Number.isFinite(available.height)) for (const candidate of [3, 2, 1]) {
        const width = 28 * candidate, height = 31 * candidate;
        const columns = Math.max(1, Math.min(requested, Math.floor((available.width + gap) / (width + gap))));
        if (Math.ceil(cells.length / columns) * (height + gap) - gap <= available.height && width <= available.width) { factor = candidate; break; }
      }
      const width = 28 * factor, slotHeight = 31 * factor;
      const columns = Math.max(1, Math.min(cells.length || 1, requested, Math.floor((available.width + gap) / (width + gap))));
      const key = `${factor}:${columns}`;
      if (key !== previous) { previous = key; element.setStyle({ columns, columnWidth: uiFixed(width), minColumnWidth: uiFixed(width), rowHeight: uiFixed(slotHeight) });
        for (const child of element.children) child.setStyle({ width: uiFixed(width), height: uiFixed(slotHeight) });
        element.setProps({ columns, slotScale: factor, slotWidth: width, slotHeight }, false);
      }
      const height = Math.max(0, Math.ceil(cells.length / columns) * (slotHeight + gap) - gap);
      return { min: { width: Math.min(width, available.width), height: slotHeight }, preferred: { width: columns * (width + gap) - gap, height } };
    }, children: cells.map((cell, index) => uiSlot({ id: options.id ? `${options.id}.slot.${cell.index ?? index}` : undefined, label: `${options.container}/${cell.id}`, binding: { container: options.container, index: cell.index ?? index }, controller: options.controller, ghost: options.ghost ? () => options.ghost!(cell.index ?? index) : undefined, iconAnimation: options.iconAnimation, activateOn: options.activateOn, allowSecondary: options.allowSecondary, stack: options.stack ? () => options.stack!(cell.index ?? index) : undefined, onPress: options.onActivate ? event => options.onActivate!(cell.index ?? index,event) : undefined, artwork: options.artwork, icon: cell.icon, placeholder: cell.placeholder, disabled: cell.disabled, ...(options.hotkeys ? { hotkey: String((index + 1) % 10) } : {}) })),
  }); return grid;
}
export function uiHotbar(options: UiInventoryGridOptions & { readonly selected?: number; readonly onSelect?: (index: number) => void }): UiElement {
  const base = uiInventoryGrid({ ...options, count: options.count ?? HOTBAR_SLOT_COUNT, columns: options.columns ?? options.count ?? HOTBAR_SLOT_COUNT, hotkeys: true, activateOn: 'down',
    onActivate: options.controller ? options.onActivate : index => select(index) });
  const select = (index: number) => { grid.setProps({ selected: index }, false); grid.children.forEach((child, slot) => child.setProps({ selected: slot === index }, false)); options.onSelect?.(index); };
  const grid = new UiElement({ ...base.hooks, children: [...base.children], props: { ...base.props, selected: options.selected ?? 0 }, onKey(event) {
    if (!/^[0-9]$/u.test(event.key) || event.ctrlKey || event.metaKey || event.altKey) return false;
    const index = event.key === '0' ? 9 : Number(event.key) - 1; if (index >= grid.children.length) return false; select(index); return true;
  } });
  grid.children.forEach((child, index) => child.setProps({ selected: index === (options.selected ?? 0) }, false)); return grid;
}
export function uiPaperDoll(options: UiInventoryGridOptions & { readonly portrait?: UiElement }): UiElement {
  const placeholders: Partial<Record<(typeof EQUIPMENT_SLOTS)[number]['id'], UiSlotOptions['placeholder']>> = {
    head: 'head', body: 'body', watch: 'ring', main_hand: 'weapon', backpack: 'bag', off_hand: 'shield', legs: 'legs',
  };
  const source: readonly UiInventoryCell[] = options.cells ?? EQUIPMENT_SLOTS.map(slot => ({ id: slot.id, index: slot.index }));
  const cells = source.flatMap((cell, index) => {
    const slot = EQUIPMENT_SLOTS.find(slot => slot.index === (cell.index ?? index));
    if (slot === undefined) return [];
    return [{ ...cell, index: slot.index, placeholder: cell.placeholder ?? placeholders[slot.id],
      disabled: cell.disabled ?? ('acceptedKinds' in slot
        && Array.isArray(slot.acceptedKinds) && slot.acceptedKinds.length === 0) }];
  });
  const equipment = uiInventoryGrid({ ...options, columns: options.columns ?? 3, cells });
  return options.portrait ? uiFlex({ direction: 'row', gap: 8, width: 'grow', ...options.layout }, [options.portrait, equipment]) : equipment;
}
