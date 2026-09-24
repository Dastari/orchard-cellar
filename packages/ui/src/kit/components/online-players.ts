import { drawPixelText, measurePixelText } from '../../pixel-ui.js';
import { scrollUiElement } from '../layout/scroll.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { UiElement } from '../runtime/element.js';
import { uiButton } from './button.js';
import { uiFlex, uiScrollArea } from './layout.js';
import { uiText } from './text.js';
import { uiTooltip } from './tooltip.js';
import { uiNameplate } from './feedback-game.js';
import { uiGlyphButton, uiWindow, type UiWindowElement } from './window.js';
export interface UiOnlinePlayer {
  readonly id: string; readonly label: string; readonly idle?: boolean; readonly manageable?: boolean;
  /** Presentation parts of the label: the nameplate name, the caption beside it and the status at the right. */
  readonly name?: string; readonly self?: boolean; readonly caption?: string; readonly status?: string;
  /** Whether the whisper glyph is offered for this row (never for yourself). */
  readonly whisper?: boolean;
}
export interface UiOnlinePlayersOptions {
  readonly id?: string; readonly players: readonly UiOnlinePlayer[];
  readonly onCycleRole?: (id: string) => void; readonly onRemove?: (id: string) => void;
  readonly onWhisper?: (id: string) => void;
  readonly removeActionLabel?: string;
  readonly onClose: () => void; readonly layout?: UiStyle;
  /** Tallest the player list may grow before it scrolls; the window fits the rest. */
  readonly listMaxHeight?: number;
}
const INK = '#3f2832', MUTED = '#8a5a44';
/** One line of caption ink that measures its own text (so a fitted row never inflates). */
function caption(text: () => string, options: { readonly grow?: boolean } = {}): UiElement {
  return new UiElement({ kind: 'text', label: '', style: { height: uiFixed(10), shrink: options.grow ? 1 : 0, grow: options.grow ? 1 : 0, minWidth: uiFixed(0) },
    measure() { const value = text(); return { min: { width: 0, height: 10 }, preferred: { width: options.grow ? 0 : value.length * 6, height: 10 } }; },
    paint(element, { context, art }) {
      if (!art) return; const value = text(); if (!value) return;
      context.save(); context.beginPath(); context.rect(element.rect.x, element.rect.y, element.rect.width, element.rect.height + 2); context.clip();
      drawPixelText(context, art.pixel, value, options.grow ? element.rect.x : element.rect.x + element.rect.width - measurePixelText(value, 1, art.pixel.font), element.rect.y + 1, { color: options.grow ? INK : MUTED });
      context.restore();
    } });
}
/** The ONLINE window: each row is a nameplate, its caption (you or homestead role), idle status and
 * the row's actions. Host authority supplies labels and permission. Updating players retains rows,
 * focus and scroll; management and whisper actions are keyboard reachable. */
export function uiOnlinePlayers(options: UiOnlinePlayersOptions): UiWindowElement & { setListMaxHeight(height: number): void } {
  const rows = new Map<string, { row: UiElement; button: UiElement; remove: UiElement; whisper: UiElement; plate: UiElement; plateName: string; plateKind: string; player: UiOnlinePlayer }>();
  const list = uiScrollArea({ id: options.id ? `${options.id}:list` : undefined, width: 'grow', height: 'fit', gap: 4,
    maxHeight: uiFixed(options.listMaxHeight ?? 220) });
  const empty = uiText('No players online.', { wrap: true, layout: { width: 'grow' } });
  const body = uiFlex({ direction: 'column', gap: 4, width: uiFixed(240), maxWidth: { mode: 'percent', fraction: 1 } }, [list]);
  const frame = uiWindow({ id: options.id, title: 'ONLINE', onClose: options.onClose, layout: { direction: 'column' }, children: [body] });
  Object.assign(frame.hooks, { onDismiss: () => options.onClose() });
  // The window takes focus when it opens (without a ring), so no row tooltip covers the roster until you move.
  frame.focusable = true;
  frame.setProps({ players: options.players, singlePointer: true, touchScroll: true, focusChrome: true });
  if (options.layout) frame.setStyle(options.layout);
  const sync = (element: UiElement): void => {
    const players = element.props['players'] as readonly UiOnlinePlayer[];
    frame.setWindowTitle(`ONLINE  ${players.length}`);
    const ids = new Set(players.map(player => player.id));
    for (const [id, entry] of rows) if (!ids.has(id)) { entry.row.dispose(); rows.delete(id); }
    const children: UiElement[] = [];
    const anyManageable = players.some(player => player.manageable), anyWhisper = Boolean(options.onWhisper) && players.some(player => player.whisper);
    for (const player of players) {
      let entry = rows.get(player.id);
      if (!entry) {
        const current = () => rows.get(player.id)?.player ?? player;
        const status = new UiElement({ kind: 'online-status', style: { width: uiFixed(4), height: uiFixed(10), shrink: 0 },
          paint(node, { context }) {
            const idle = current().idle; if (idle === undefined) return;
            context.fillStyle = idle ? '#d7a928' : '#4f8f42';
            context.fillRect(node.rect.x + (node.rect.width - 4) / 2, node.rect.y + (node.rect.height - 4) / 2, 4, 4);
          },
        });
        const plateSlot = uiFlex({ direction: 'row', shrink: 0 }, []);
        const button = uiButton({ id: `${element.id}:player:${player.id}`, label: player.label, tone: 'primary',
          onPress: () => { if (current().manageable) options.onCycleRole?.(player.id); },
          layout: { width: 'grow', height: uiFixed(16), padding: 0, minWidth: uiFixed(0) },
          children: [uiFlex({ direction: 'row', gap: 6, align: 'center', width: 'grow', height: 'grow' }, [
            plateSlot, caption(() => current().caption ?? '', { grow: true }), caption(() => current().status ?? ''), status])],
          // A quiet row: hover and focus lift the line instead of drawing button chrome.
          face: (node, { context, hovered, focused, pressed }) => {
            if (!(hovered || focused || pressed)) return;
            const r = node.rect; context.fillStyle = pressed ? 'rgba(184, 111, 80, 0.45)' : 'rgba(228, 166, 114, 0.45)'; context.fillRect(r.x - 2, r.y, r.width + 4, r.height);
            if (focused) { context.fillStyle = '#fff6e0'; context.fillRect(r.x, r.y + r.height - 1, r.width, 1); }
          } });
        button.focusGroup = `${element.id}:rows`;
        const pointer = button.hooks.onPointer!;
        let drag: { pointerId: number; y: number; start: number; moved: boolean } | null = null;
        Object.assign(button.hooks, { onPointer: (event: Parameters<typeof pointer>[0], node: UiElement) => {
          // Touch uses the root's single primary scroll arbitration; retain mouse row dragging.
          if (event.type === 'down' && event.button === 0 && event.pointerType !== 'touch') drag = { pointerId: event.pointerId, y: event.point.y, start: list.scroll.y, moved: false };
          if (event.type === 'move' && drag?.pointerId === event.pointerId && (drag.moved || Math.abs(event.point.y - drag.y) >= 4)) {
            drag.moved = true; scrollUiElement(list, list.scroll.x, drag.start + drag.y - event.point.y); return true;
          }
          if ((event.type === 'up' || event.type === 'cancel') && drag?.pointerId === event.pointerId) {
            const moved = drag?.moved; drag = null;
            if (moved) return pointer({ ...event, type: 'cancel' }, node);
          }
          return pointer(event, node);
        }, onContextMenu: () => { if (current().manageable) options.onRemove?.(player.id); return true; } });
        const whisper = uiGlyphButton({ id: `${element.id}:whisper:${player.id}`, glyph: 'hud.chat', chrome: 'none', hideWhenDisabled: true, label: `Whisper ${player.name ?? player.label}`,
          onPress: () => { if (current().whisper) options.onWhisper?.(player.id); } });
        whisper.focusGroup = `${element.id}:rows`;
        const remove = uiGlyphButton({ id: `${element.id}:remove:${player.id}`, glyph: 'glyph.cross.red', chrome: 'none', hideWhenDisabled: true,
          label: `${options.removeActionLabel ?? 'Remove'} ${player.label}`, onPress: () => { if (current().manageable) options.onRemove?.(player.id); } });
        remove.focusGroup = `${element.id}:rows`;
        const row = uiFlex({ direction: 'row', gap: 4, align: 'center', width: 'grow', height: uiFixed(16), shrink: 0, padding: { left: 2, right: 2 } }, [
          uiTooltip(() => current().manageable ? `${current().label} · Activate to cycle role; right-click or Remove to ${(options.removeActionLabel ?? 'remove').toLowerCase()}.` : current().label,
            button, { width: 'grow', height: uiFixed(16), minWidth: uiFixed(0) }), whisper, remove,
        ]);
        entry = { row, button, remove, whisper, plate: plateSlot, plateName: '', plateKind: '', player }; rows.set(player.id, entry);
      }
      entry.player = player;
      const name = player.name ?? player.label, kind = player.self ? 'self' : 'player';
      if (entry.plateName !== name || entry.plateKind !== kind) {
        entry.plateName = name; entry.plateKind = kind;
        for (const child of [...entry.plate.children]) child.dispose();
        entry.plate.replaceChildren([uiNameplate({ name, kind })]);
      }
      if (entry.button.props['label'] !== player.label) entry.button.setProps({ label: player.label });
      entry.button.label = player.manageable ? `${player.label} · Cycle role` : player.label;
      entry.remove.label = `${options.removeActionLabel ?? 'Remove'} ${player.label}`;
      entry.whisper.label = `Whisper ${name}`;
      // Action columns stay aligned: a column exists when any row offers it; rows without it keep the space.
      const removeDisplay = anyManageable ? 'flex' : 'none';
      if (entry.remove.style.display !== removeDisplay) entry.remove.setStyle({ display: removeDisplay });
      if (entry.remove.disabled !== !player.manageable) entry.remove.setDisabled(!player.manageable);
      const whisperDisplay = anyWhisper ? 'flex' : 'none';
      if (entry.whisper.style.display !== whisperDisplay) entry.whisper.setStyle({ display: whisperDisplay });
      if (entry.whisper.disabled !== !player.whisper) entry.whisper.setDisabled(!player.whisper);
      children.push(entry.row);
    }
    if (!players.length) children.push(empty);
    if (children.length !== list.children.length || children.some((child, index) => list.children[index] !== child)) list.replaceChildren(children);
  };
  // Callers project the latest players through setProps; rows are reconciled there so an echo retains them.
  const setProps = frame.setProps.bind(frame);
  frame.setProps = (props, affectsLayout) => { setProps(props, affectsLayout); if ('players' in props) sync(frame); return frame; };
  sync(frame);
  return Object.assign(frame, { setListMaxHeight(height: number) { list.setStyle({ maxHeight: uiFixed(Math.max(0, height)) }); } });
}
