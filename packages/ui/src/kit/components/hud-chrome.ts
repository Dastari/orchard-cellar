import { containsPoint, type UiRect } from '../../geometry.js';
import { drawOutlinedPixelText, drawPixelText, fitPixelText, measurePixelText } from '../../pixel-ui.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { uiButton, type UiButtonOptions } from './button.js';
import { paintUiSkin, uiSkinFrame } from './art.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiViewport, type UiViewportOptions } from './viewport.js';
import { paintUiHudPlaque, UI_HUD_INK } from './hud-game.js';
function hudButton(options: UiButtonOptions): UiElement {
  const button = uiButton(options);
  return new UiElement({ ...button.hooks, children: [...button.children], onKey(event, element) {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) return true;
    return button.hooks.onKey?.(event, element) ?? false;
  } });
}
/** A small square button in the pack's sm chrome with a glyph face (map zoom). */
function glyphFace(glyph: string): UiButtonOptions['face'] {
  return (element, { context, art, hovered, focused, pressed, disabled }) => {
    const r = element.rect, face = { x: r.x + Math.floor((r.width - 16) / 2), y: r.y + Math.floor((r.height - 16) / 2), width: 16, height: 16 };
    const state = disabled ? 'disabled' : pressed ? 'pressed' : 'idle';
    context.save(); if (disabled) context.globalAlpha *= .5;
    paintUiSkin(context, art.skin.button, `primary.sm.square.${state}`, face);
    paintUiSkin(context, art.skin.icon, glyph, { ...face, y: face.y + (pressed ? 1 : 0) });
    if ((hovered || focused) && !disabled) paintUiSkin(context, art.skin.button, `outline.sm.square.${state}.${focused ? 'white' : 'gold'}`, face);
    context.restore();
  };
}
/** The zone banner's height: the classic location ribbon, tall enough for the large font clear of its folds. */
export const UI_ZONE_BANNER_HEIGHT = 34;
/** The classic zone banner: the 78x21 ribbon stretched through one clean centre column and its middle rows,
 * keeping the 6px top edge and the 8px lower folds at their authored size. */
function paintFlag(context: CanvasRenderingContext2D, art: NonNullable<Parameters<NonNullable<UiElement['hooks']['paint']>>[1]['art']>, r: UiRect): void {
  const entry = art.skin.feedback['banner.base.0'], source = entry && uiSkinFrame(entry); if (!entry || !source) return;
  const columns = [Math.floor(source.width / 2), 1, source.width - Math.floor(source.width / 2) - 1], rows = [6, source.height - 14, 8];
  const width = [columns[0]!, Math.max(0, r.width - columns[0]! - columns[2]!), columns[2]!], height = [rows[0]!, Math.max(0, r.height - rows[0]! - rows[2]!), rows[2]!];
  let sy = source.y, ty = r.y;
  for (let row = 0; row < 3; row++) {
    let sx = source.x, tx = r.x;
    for (let column = 0; column < 3; column++) {
      if (width[column]! > 0 && height[row]! > 0) context.drawImage(entry.asset.image, sx, sy, columns[column]!, rows[row]!, tx, ty, width[column]!, height[row]!);
      sx += columns[column]!; tx += width[column]!;
    }
    sy += rows[row]!; ty += height[row]!;
  }
}
/** Width of the zone banner for a title: the large font plus the ribbon's tails, 156 to 220 wide. */
export function uiZoneFlagWidth(title: string): number { return Math.min(220, Math.max(156, title.length * 9 + 64)); }
/** HUD words drawn straight onto the world: outlined pixel text, no plate. */
function hudLine(kind: string, ink: string): UiElement {
  return new UiElement({ kind, label: ' ', style: { height: uiFixed(11), shrink: 0 },
    paint(element, { context, art }) {
      if (!art || !element.label.trim()) return; const r = element.rect;
      drawOutlinedPixelText(context, art.pixel, fitPixelText(element.label, r.width - 2, 1, art.pixel.font), r.x + 1, r.y + 2, { color: ink, outlineColor: UI_HUD_INK.outline });
    } });
}
export interface UiZoneHeaderModel {
  readonly title: string; readonly subtitle?: string;
  readonly watch?: { readonly time: string; readonly date: string; readonly moon: string };
  readonly onlineCount?: number; readonly collapsed?: boolean;
}
export interface UiZoneHeaderOptions extends UiZoneHeaderModel {
  readonly activateOn?: 'down' | 'up';
  readonly onToggle?: () => void; readonly onPlayers?: () => void; readonly layout?: UiStyle;
}
export interface UiZoneHeaderElement extends UiElement { updateZoneHeader(model: UiZoneHeaderModel): void }
/** Zone identity on the large flag ribbon, the equipped watch and online players as outlined HUD text.
 * `reserve` leaves room between the flag and the player count for a host-drawn moon. */
export function uiZoneHeader(options: UiZoneHeaderOptions & { readonly reserve?: number }): UiZoneHeaderElement {
  let title = options.title, pressed = false;
  const toggle = new UiElement({ id: 'hud.zone', label: `Collapse ${options.title}`, focusable: true, pointerMode: 'capture',
    style: { height: uiFixed(UI_ZONE_BANNER_HEIGHT) },
    measure() { const width = uiZoneFlagWidth(title); return { min: { width: 96, height: UI_ZONE_BANNER_HEIGHT }, preferred: { width, height: UI_ZONE_BANNER_HEIGHT } }; },
    onPointer(event, element) {
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); if (options.activateOn !== 'up') options.onToggle?.(); return true; }
      if (event.type === 'cancel') { pressed = false; return true; }
      if (event.type === 'up' && pressed) { pressed = false; if (options.activateOn === 'up' && containsPoint(element.clip, event.point)) options.onToggle?.(); return true; }
      return pressed;
    },
    onKey(event) { if (!['Enter',' '].includes(event.key)) return false; if (!event.repeat) options.onToggle?.(); return true; },
    paint(element, { context, art, hovered, focused }) {
      if (!art) return; const r = element.rect; paintFlag(context, art, r);
      // The writable face runs 27px in from each tail and from 3px below the top to above the lower folds.
      const text = fitPixelText(title, r.width - 54, 1, art.pixel.headerFont), width = measurePixelText(text, 1, art.pixel.headerFont);
      drawPixelText(context, art.pixel, text, r.x + Math.floor((r.width - width) / 2), r.y + 8, { font: 'header', color: hovered || focused ? '#9e2835' : '#4d2e22' });
    },
  });
  const collapsed = hudButton({ get activateOn() { return options.activateOn ?? 'down'; }, id: 'hud.zone.expand', ariaLabel: 'Expand zone name', label: '', onPress: options.onToggle,
    layout: { width: 'grow', height: uiFixed(24), padding: 0 }, face: (element, { context, art, hovered, focused, pressed }) => paintUiHudPlaque(context, art, element.rect, { icon: 'glyph.next', pressed, lit: hovered || focused }) });
  const online = hudButton({ get activateOn() { return options.activateOn ?? 'down'; }, id: 'hud.online-players', ariaLabel: 'Online players', label: String(options.onlineCount ?? 0), onPress: options.onPlayers,
    layout: { width: uiFixed(30), height: uiFixed(20), padding: 0, shrink: 0, alignSelf: 'center' },
    face: (element, { context, art, hovered, focused }) => {
      const r = element.rect; paintUiSkin(context, art.skin.icon, 'online.base', { x: r.x - 2, y: r.y + 2, width: 16, height: 16 });
      drawOutlinedPixelText(context, art.pixel, String(element.props['label']), r.x + 13, r.y + 7, { color: hovered || focused ? UI_HUD_INK.gold : UI_HUD_INK.cream, outlineColor: UI_HUD_INK.outline });
    } });
  const spacer = uiFlex({ width: uiFixed(Math.max(0, options.reserve ?? 0)), height: uiFixed(1), shrink: 0 }, []);
  const row = uiFlex({ direction: 'row', gap: 2, align: 'center', width: 'grow' }, [toggle, spacer, online]);
  const subtitle = hudLine('text', UI_HUD_INK.gold);
  const watch = hudLine('badge', UI_HUD_INK.cream);
  const root = uiFlex({ gap: 2, ...options.layout }, [collapsed, row, subtitle, watch]);
  const updateZoneHeader = (model: UiZoneHeaderModel) => {
    if (model.title !== title) { title = model.title; toggle.invalidate(); } toggle.label = `Collapse ${model.title}`;
    subtitle.label = model.subtitle ?? ' '; subtitle.setStyle({ visible: Boolean(model.subtitle) && !model.collapsed }); subtitle.invalidateRoot?.(false);
    online.setProps({ label: String(model.onlineCount ?? 0) }); online.label = `Online players · ${model.onlineCount ?? 0}`;
    watch.label = model.watch ? `${model.watch.time} ${model.watch.date} ${model.watch.moon}` : '';
    watch.setStyle({ visible: Boolean(model.watch) && !model.collapsed }); watch.invalidateRoot?.(false);
    collapsed.setStyle({ visible: Boolean(model.collapsed) }); row.setStyle({ visible: !model.collapsed });
  };
  updateZoneHeader(options); return Object.assign(root, { updateZoneHeader });
}
/** Height of a zone header for a model: the flag and one outlined line per subtitle and watch. */
export function uiZoneHeaderHeight(model: UiZoneHeaderModel): number {
  return model.collapsed ? 24 : UI_ZONE_BANNER_HEIGHT + (model.subtitle ? 13 : 0) + (model.watch ? 13 : 0);
}
export interface UiMinimapModel { readonly collapsed?: boolean; readonly zoom: number }
export interface UiMinimapOptions extends UiMinimapModel {
  readonly minZoom?: number; readonly maxZoom?: number;
  readonly activateOn?: 'down' | 'up';
  readonly onToggle?: () => void; readonly onZoom?: (zoom: number) => void;
  readonly render?: UiViewportOptions['render']; readonly content?: UiElement; readonly layout?: UiStyle;
}
export interface UiMinimapElement extends UiElement { updateMinimap(model: UiMinimapModel): void }
/** The minimap in the wood-and-parchment frame, zoom buttons along its foot; collapses to a HUD plaque. */
export function uiMinimap(options: UiMinimapOptions): UiMinimapElement {
  let model: UiMinimapModel = options;
  const zoom = (delta: number) => options.onZoom?.(Math.max(options.minZoom ?? 1, Math.min(options.maxZoom ?? 4, model.zoom + delta)));
  const collapsed = hudButton({ get activateOn() { return options.activateOn ?? 'down'; }, id: 'hud.minimap.expand', ariaLabel: 'Expand minimap', label: '', onPress: options.onToggle,
    layout: { width: 'grow', height: 'grow', padding: 0 }, face: (element, { context, art, hovered, focused, pressed }) => paintUiHudPlaque(context, art, element.rect, { icon: 'glyph.previous', pressed, lit: hovered || focused }) });
  const viewport = options.content ?? (options.render ? uiViewport({ label: 'Minimap terrain', render: options.render }) : uiText('Map data unavailable.'));
  let pressed = false;
  const map = new UiElement({ id: 'hud.minimap', label: 'Collapse minimap', pointerMode: 'capture', focusable: true,
    style: { display: 'stack', width: 'grow', height: 'grow' }, children: [viewport],
    onPointer(event, element) {
      if (event.type === 'down' && event.button === 0) { pressed = true; event.capture(); if (options.activateOn !== 'up') options.onToggle?.(); return true; }
      if (event.type === 'cancel') { pressed = false; return true; }
      if (event.type === 'up' && pressed) { pressed = false; if (options.activateOn === 'up' && containsPoint(element.clip, event.point)) options.onToggle?.(); return true; }
      return pressed;
    },
    onKey(event) { if (!['Enter',' '].includes(event.key)) return false; if (!event.repeat) options.onToggle?.(); return true; },
  });
  const out = hudButton({ get activateOn() { return options.activateOn ?? 'down'; }, id: 'hud.minimap.zoom-out', ariaLabel: 'Zoom out', label: '', onPress: () => zoom(-1),
    layout: { width: uiFixed(24), height: uiFixed(24), padding: 0, shrink: 0 }, face: glyphFace('glyph.minus') });
  const into = hudButton({ get activateOn() { return options.activateOn ?? 'down'; }, id: 'hud.minimap.zoom-in', ariaLabel: 'Zoom in', label: '', onPress: () => zoom(1),
    layout: { width: uiFixed(24), height: uiFixed(24), padding: 0, shrink: 0 }, face: glyphFace('glyph.plus') });
  const label = uiText('', { align: 'center', overflow: 'ellipsis', layout: { width: 'grow' } });
  const frame = new UiElement({ kind: 'hud-minimap', style: { display: 'flex', direction: 'column', gap: 0, width: 'grow', height: 'grow', padding: { left: 12, right: 12, top: 16, bottom: 8 } },
    children: [map, uiFlex({ direction: 'row', width: 'grow', gap: 2, height: uiFixed(24), shrink: 0, align: 'center', justify: 'center' }, [out, label, into])],
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect;
      paintUiSkin(context, art.skin.frame, 'wood', r);
      paintUiSkin(context, art.skin.frame, 'parchment', { x: r.x + 8, y: r.y + 12, width: r.width - 16, height: r.height - 20 });
    } });
  const root = new UiElement({ style: { display: 'stack', ...options.layout }, children: [collapsed, frame],
    onPointer(event, element) { return map.hooks.onPointer?.(event, element) ?? false; },
    onWheel(event) { if (model.collapsed || event.deltaY === 0) return false; zoom(event.deltaY < 0 ? 1 : -1); return true; },
  });
  const updateMinimap = (next: UiMinimapModel) => {
    model = next; collapsed.setStyle({ visible: Boolean(model.collapsed) }); frame.setStyle({ visible: !model.collapsed });
    out.setDisabled(model.zoom <= (options.minZoom ?? 1)); into.setDisabled(model.zoom >= (options.maxZoom ?? 4)); label.setProps({ text: `MAP ${model.zoom}X` });
  };
  updateMinimap(options); return Object.assign(root, { updateMinimap });
}
