import { coinPurseFromBronze } from '@orchard/sim';
import { containsPoint, type UiRect } from '../../geometry.js';
import { drawOutlinedPixelText, drawPixelText, fitPixelText, measurePixelText } from '../../pixel-ui.js';
import { selectAtlasFrame } from '../../sprite.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import type { UiLoadedSkinFamily } from '../skin/load.js';
import { paintUiSkin, uiSkinFrame } from './art.js';
import { uiFlex } from './layout.js';
import { uiViewport, type UiViewportOptions } from './viewport.js';
import { uiGlyphButton } from './window.js';

/** HUD text sits directly on the world: pixel glyphs with a dark plum outline, never a panel. */
export const UI_HUD_INK = Object.freeze({ outline: '#3f2832', gold: '#ffe36e', cream: '#fff0cf', tan: '#e7c9a0', done: '#8fdc6a' });

/** Pointer and key hooks for a HUD control that activates on release inside its clip. */
function pressable(onPress: () => void) {
  let pressed = false;
  return {
    onPointer(event: Parameters<NonNullable<UiElement['hooks']['onPointer']>>[0], element: UiElement) {
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); element.invalidateRoot?.(false); return true; }
      if (event.type === 'up' && pressed) { pressed = false; event.release(); element.invalidateRoot?.(false); if (containsPoint(element.clip, event.point)) onPress(); return true; }
      if (event.type === 'cancel') { pressed = false; event.release(); return true; }
      return pressed;
    },
    onKey(event: { readonly key: string; readonly repeat?: boolean }) { if (event.key !== 'Enter' && event.key !== ' ') return false; if (!event.repeat) onPress(); return true; },
  };
}

/** The large authored flag ribbon, its crest extended by one clean centre column. */
function paintFlag(context: CanvasRenderingContext2D, family: UiLoadedSkinFamily, key: string, r: UiRect): void {
  const entry = family[key], source = entry && uiSkinFrame(entry); if (!entry || !source) return;
  const left = Math.floor(source.width / 2), right = source.width - left - 1, middle = Math.max(0, r.width - left - right);
  context.drawImage(entry.asset.image, source.x, source.y, left, source.height, r.x, r.y, left, source.height);
  if (middle) context.drawImage(entry.asset.image, source.x + left, source.y, 1, source.height, r.x + left, r.y, middle, source.height);
  context.drawImage(entry.asset.image, source.x + left + 1, source.y, right, source.height, r.x + left + middle, r.y, right, source.height);
}

export interface UiHudZoneOptions {
  readonly title: () => string; readonly moon?: () => string; readonly online?: () => number;
  readonly onPlayers?: () => void; readonly onToggle?: () => void;
}
/** Zone name on the large flag in the reading font, with the moon and online players beside it. */
export function uiHudZone(options: UiHudZoneOptions): UiElement {
  const flag: UiElement = new UiElement({ id: 'hud.zone', kind: 'hud-zone-flag', label: 'Zone', focusable: Boolean(options.onToggle), pointerMode: options.onToggle ? 'capture' : 'passthrough',
    style: { height: uiFixed(23), shrink: 0 },
    measure() { const width = Math.max(96, options.title().length * 9 + 60); return { min: { width: 96, height: 23 }, preferred: { width, height: 23 } }; },
    ...(options.onToggle ? pressable(options.onToggle) : {}),
    paint(element, { context, art }) {
      if (!art) return;
      const r = element.rect; paintFlag(context, art.skin.feedback, 'flag.base.0', r);
      const title = options.title(), width = measurePixelText(title, 1, art.pixel.headerFont);
      drawPixelText(context, art.pixel, title, r.x + Math.floor((r.width - width) / 2), r.y + 3, { font: 'header', color: '#3f2832' });
    },
  });
  const moon = options.moon ? new UiElement({ kind: 'hud-moon', label: 'Moon phase', style: { width: uiFixed(24), height: uiFixed(24), shrink: 0 },
    paint(element, { context, art }) {
      const phase = options.moon!(), entry = art?.skin.feedback[`moon.${phase}`], source = entry && uiSkinFrame(entry);
      if (!entry || !source) return;
      context.drawImage(entry.asset.image, source.x, source.y, source.width, source.height, element.rect.x, element.rect.y, 24, 24);
    } }) : null;
  const players = options.online ? new UiElement({ id: 'hud.online-players', kind: 'button', label: 'Online players', focusable: true, pointerMode: 'capture',
    style: { width: uiFixed(30), height: uiFixed(20), shrink: 0 },
    ...pressable(() => options.onPlayers?.()),
    paint(element, { context, art, hovered, focused }) {
      if (!art) return;
      const r = element.rect; paintUiSkin(context, art.skin.icon, 'online.base', { x: r.x - 2, y: r.y + 2, width: 16, height: 16 });
      drawOutlinedPixelText(context, art.pixel, String(options.online!()), r.x + 13, r.y + 7, { color: hovered || focused ? UI_HUD_INK.gold : UI_HUD_INK.cream, outlineColor: UI_HUD_INK.outline });
    } }) : null;
  return uiFlex({ direction: 'row', gap: 4, align: 'center' }, [flag, ...(moon ? [moon] : []), ...(players ? [players] : [])]);
}

export interface UiHudMinimapOptions {
  readonly render: UiViewportOptions['render']; readonly zoom: () => number; readonly minZoom?: number; readonly maxZoom?: number;
  readonly onZoom: (zoom: number) => void; readonly layout?: UiStyle;
}
/** The minimap in the old wood-and-parchment frame, zoom pills along its foot. */
export function uiHudMinimap(options: UiHudMinimapOptions): UiElement {
  const zoom = (delta: number) => options.onZoom(Math.max(options.minZoom ?? 1, Math.min(options.maxZoom ?? 4, options.zoom() + delta)));
  const label = new UiElement({ kind: 'text', label: 'Map zoom', style: { width: uiFixed(40), height: uiFixed(16) },
    paint(element, { context, art }) {
      if (!art) return; const text = `MAP ${options.zoom()}X`, r = element.rect;
      drawPixelText(context, art.pixel, text, r.x + Math.floor((r.width - measurePixelText(text, 1, art.pixel.font)) / 2), r.y + 5, { color: '#3f2832' });
    } });
  const map = uiViewport({ label: 'Minimap', render: options.render, layout: { width: 'grow', height: 'grow' } });
  return new UiElement({ id: 'hud.minimap', kind: 'hud-minimap', label: 'Minimap', style: { display: 'flex', direction: 'column', gap: 2, padding: { left: 12, right: 12, top: 16, bottom: 12 }, width: uiFixed(128), height: uiFixed(112), ...options.layout },
    children: [map, uiFlex({ direction: 'row', align: 'center', justify: 'center', gap: 2, shrink: 0 }, [
      uiGlyphButton({ id: 'hud.minimap.zoom-out', glyph: 'glyph.minus', label: 'Zoom out', onPress: () => zoom(-1) }), label,
      uiGlyphButton({ id: 'hud.minimap.zoom-in', glyph: 'glyph.plus', label: 'Zoom in', onPress: () => zoom(1) }),
    ])],
    onWheel(event) { if (!event.deltaY) return false; zoom(event.deltaY < 0 ? 1 : -1); return true; },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect;
      paintUiSkin(context, art.skin.frame, 'wood', r);
      paintUiSkin(context, art.skin.frame, 'parchment', { x: r.x + 8, y: r.y + 12, width: r.width - 16, height: r.height - 20 });
    },
  });
}

export interface UiHudQuest { readonly id: string; readonly title: string; readonly objectives: readonly { readonly label: string; readonly progress: string; readonly complete: boolean }[] }
export interface UiHudQuestTrackerOptions {
  readonly quests: () => readonly UiHudQuest[]; readonly collapsed: () => boolean;
  readonly onToggle: () => void; readonly onOpen: (id: string) => void; readonly width?: number;
}
/** Pinned quests as outlined text on the world: gold header, cream titles, tan objectives. */
export function uiHudQuestTracker(options: UiHudQuestTrackerOptions): UiElement {
  const width = options.width ?? 150;
  const header = new UiElement({ id: 'hud.quests.toggle', kind: 'button', label: 'Quests', focusable: true, pointerMode: 'capture', style: { width: uiFixed(width), height: uiFixed(14), shrink: 0 },
    ...pressable(options.onToggle),
    paint(element, { context, art, hovered, focused }) {
      if (!art) return; const r = element.rect, collapsed = options.collapsed();
      paintUiSkin(context, art.skin.feedback, collapsed ? 'quest_chevron.collapsed' : 'quest_chevron.expanded', { x: r.x + r.width - 12, y: r.y - 1, width: 16, height: 16 });
      drawOutlinedPixelText(context, art.pixel, 'QUESTS', r.x + r.width - 16, r.y + 3, { align: 'right', color: hovered || focused ? UI_HUD_INK.cream : UI_HUD_INK.gold, outlineColor: UI_HUD_INK.outline });
    } });
  const list = new UiElement({ id: 'hud.quests.list', kind: 'hud-quest-list', label: 'Pinned quests', focusable: true, pointerMode: 'capture', style: { width: uiFixed(width), shrink: 0 },
    measure() {
      if (options.collapsed()) return { min: { width, height: 0 }, preferred: { width, height: 0 } };
      const lines = options.quests().reduce((sum, quest) => sum + 1 + quest.objectives.length, 0) + Math.max(0, options.quests().length - 1) * .5;
      return { min: { width, height: 0 }, preferred: { width, height: Math.ceil(lines * 11) } };
    },
    onPointer(event, element) {
      if (event.type !== 'up') return event.type === 'down';
      let y = element.rect.y;
      for (const quest of options.quests()) { const height = (1 + quest.objectives.length) * 11; if (event.point.y < y + height) { options.onOpen(quest.id); return true; } y += height + 5; }
      return true;
    },
    onKey(event) { const first = options.quests()[0]; if ((event.key === 'Enter' || event.key === ' ') && first) { options.onOpen(first.id); return true; } return false; },
    paint(element, { context, art }) {
      if (!art || options.collapsed()) return;
      const r = element.rect, font = art.pixel.font; let y = r.y;
      for (const quest of options.quests()) {
        drawOutlinedPixelText(context, art.pixel, fitPixelText(quest.title.toUpperCase(), r.width - 2, 1, font), r.x + r.width, y, { align: 'right', color: UI_HUD_INK.cream, outlineColor: UI_HUD_INK.outline });
        y += 11;
        for (const objective of quest.objectives) {
          const progress = objective.complete ? 'Done' : objective.progress, text = fitPixelText(objective.label, r.width - measurePixelText(progress, 1, font) - 8, 1, font);
          const ink = objective.complete ? UI_HUD_INK.done : UI_HUD_INK.tan;
          drawOutlinedPixelText(context, art.pixel, `${text} ${progress}`, r.x + r.width, y, { align: 'right', color: ink, outlineColor: UI_HUD_INK.outline });
          y += 11;
        }
        y += 5;
      }
    },
  });
  return uiFlex({ id: 'hud.quests', direction: 'column', gap: 2, align: 'end' }, [header, list]);
}

export interface UiHudPlayerCardOptions {
  readonly portrait: (context: CanvasRenderingContext2D, bounds: UiRect) => void;
  readonly vitals: () => { readonly health: number; readonly mana: number; readonly vigour: number; readonly hunger: number } | undefined;
  readonly hungerLabel?: () => string; readonly onOpen?: () => void;
}
/** The authored compact vitals card at 2×: framed portrait and three bars, with hunger above it. */
export function uiHudPlayerCard(options: UiHudPlayerCardOptions): UiElement {
  const card = new UiElement({ id: 'hud.player', kind: 'button', label: 'Character', focusable: Boolean(options.onOpen), pointerMode: options.onOpen ? 'capture' : 'passthrough',
    style: { width: uiFixed(96), height: uiFixed(48), shrink: 0 },
    ...(options.onOpen ? pressable(options.onOpen) : {}),
    paint(element, { context, art, hovered, focused }) {
      if (!art) return;
      const r = element.rect, values = options.vitals();
      // The authored card (48×24, drawn at 2×) ships with full bars; empty spans are re-inked with its track colour.
      paintUiSkin(context, art.skin.meter, 'kit_vitals_compact.idle.0', r);
      const face = { x: r.x + 6, y: r.y + 18, width: 26, height: 26 };
      context.save(); context.beginPath(); context.rect(face.x, face.y, face.width, face.height); context.clip();
      // Rig frames are 32×40 with the head from row 15: at 2× that puts the face in the card's window.
      options.portrait(context, { x: face.x + 13 - 32, y: face.y - 28, width: 64, height: 80 }); context.restore();
      const fractions = [values?.health ?? 0, values?.mana ?? 0, values?.vigour ?? 0];
      fractions.forEach((fraction, index) => {
        const start = 23, span = 21, filled = Math.round(span * Math.max(0, Math.min(1, fraction)));
        if (filled >= span) return;
        context.fillStyle = '#181425'; context.fillRect(r.x + (start + filled) * 2, r.y + (10 + index * 4) * 2, (span - filled) * 2, 6);
      });
      if (hovered || focused) { context.fillStyle = '#fff6e0'; context.fillRect(r.x + 6, r.y + r.height, 26, 1); }
    },
  });
  const hunger = new UiElement({ id: 'hud.hunger', kind: 'meter', label: 'Hunger', style: { width: uiFixed(96), height: uiFixed(10), shrink: 0 },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect, value = Math.max(0, Math.min(1, options.vitals()?.hunger ?? 0));
      context.fillStyle = UI_HUD_INK.outline; context.fillRect(r.x, r.y + 2, 6, 6);
      context.fillStyle = '#feae34'; context.fillRect(r.x + 1, r.y + 3 + Math.round(4 * (1 - value)), 4, Math.round(4 * value));
      drawOutlinedPixelText(context, art.pixel, options.hungerLabel?.() ?? `HUNGER ${Math.round(value * 100)}`, r.x + 10, r.y + 1, { color: value < .25 ? '#f6757a' : UI_HUD_INK.cream, outlineColor: UI_HUD_INK.outline });
    } });
  return uiFlex({ direction: 'column', gap: 2, shrink: 0 }, [hunger, card]);
}

/** Coins on a parchment plate with the pack button: the purse is also the inventory shortcut. */
export function uiHudPurse(options: { readonly balance: () => bigint; readonly onOpen: () => void }): UiElement {
  const coins = new UiElement({ kind: 'hud-coins', label: 'Purse', style: { height: uiFixed(16), shrink: 0 },
    measure() { const purse = coinPurseFromBronze(options.balance()); const width = [purse.gold, purse.silver, purse.bronze].reduce((sum: number, value) => sum + 14 + String(value).length * 6 + 4, 0); return { min: { width, height: 16 }, preferred: { width, height: 16 } }; },
    paint(element, { context, art }) {
      if (!art) return; const purse = coinPurseFromBronze(options.balance()); let x = element.rect.x;
      for (const [coin, value] of [['gold', purse.gold], ['silver', purse.silver], ['bronze', purse.bronze]] as const) {
        paintUiSkin(context, art.skin.icon, `coin.${coin}`, { x, y: element.rect.y + 1, width: 14, height: 14 });
        drawPixelText(context, art.pixel, String(value), x + 15, element.rect.y + 5, { color: '#3f2832' }); x += 14 + String(value).length * 6 + 4;
      }
    } });
  const bag = new UiElement({ id: 'hud.purse.inventory', kind: 'button', label: 'Inventory (I)', focusable: true, pointerMode: 'capture', style: { width: uiFixed(20), height: uiFixed(20), shrink: 0 },
    ...pressable(options.onOpen),
    paint(element, { context, art, hovered, focused }) {
      if (!art) return; const r = element.rect;
      paintUiSkin(context, art.skin.icon, 'hud.backpack', { x: r.x + 2, y: r.y + 1 + (hovered || focused ? -1 : 0), width: 16, height: 16 });
    } });
  return new UiElement({ id: 'hud.purse', kind: 'hud-purse', label: 'Purse', style: { display: 'flex', direction: 'row', gap: 4, align: 'center', padding: { left: 8, right: 6, top: 4, bottom: 4 }, shrink: 0 },
    children: [coins, bag],
    paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.frame, 'thin', element.rect); } });
}

/** Square HUD shortcut: the pack's peach face, a symbol and its hotkey in the corner. */
export function uiHudAction(options: { readonly id: string; readonly label: string; readonly hotkey?: string; readonly icon: string; readonly onPress: () => void }): UiElement {
  let pressed = false;
  const element: UiElement = new UiElement({ id: options.id, kind: 'button', label: options.hotkey ? `${options.label} (${options.hotkey})` : options.label, focusable: true, pointerMode: 'capture',
    style: { width: uiFixed(28), height: uiFixed(31), shrink: 0 },
    onPointer(event) {
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); element.invalidateRoot?.(false); return true; }
      if (event.type === 'up' && pressed) { pressed = false; event.release(); element.invalidateRoot?.(false); if (containsPoint(element.clip, event.point)) options.onPress(); return true; }
      if (event.type === 'cancel') { pressed = false; event.release(); return true; }
      return pressed;
    },
    onKey(event) { if (event.key !== 'Enter' && event.key !== ' ') return false; options.onPress(); return true; },
    paint(_element, { context, art, hovered, focused }) {
      if (!art) return; const r = element.rect;
      paintUiSkin(context, art.skin.slot, 'slot.idle.0', r);
      paintUiSkin(context, art.skin.icon, options.icon, { x: r.x + 6, y: r.y + 7 + (pressed ? 1 : 0), width: 16, height: 16 });
      if (options.hotkey) drawOutlinedPixelText(context, art.pixel, options.hotkey, r.x + 3, r.y + 3, { color: '#fff6e0', outlineColor: '#b86f50' });
      if (hovered || focused) {
        const entry = art.skin.selector['selector_neutral.idle.0'], frame = entry && selectAtlasFrame(entry.asset.metadata, entry.entry.group, 0);
        if (entry && frame) for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const)
          context.drawImage(entry.asset.image, frame.x + 11 + cx * 16, frame.y + 10 + cy * 18, 10, 10, cx ? r.x + r.width - 8 : r.x - 2, cy ? r.y + r.height - 8 : r.y - 2, 10, 10);
      }
    },
  });
  return element;
}
