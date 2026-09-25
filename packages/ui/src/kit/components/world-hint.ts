import type { LoadedAsset } from '../../assets.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, uiOffset, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { paintUiSkin } from './art.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiSprite } from './media.js';
export interface UiWorldHint {
  readonly x: number; readonly y: number; readonly title: string; readonly lines: readonly string[];
  readonly tone: UiTone; readonly progress?: number; readonly artwork?: LoadedAsset;
  /** Per-line ink roles; without them the line count picks the classic order. */
  readonly roles?: readonly UiWorldHintRole[];
}
export type UiWorldHintRole = 'subtitle' | 'status' | 'muted';
export interface UiWorldHintOptions { readonly hint?: UiWorldHint | null; readonly layout?: UiStyle }
/** The classic hover card inks: dark title, then a brown class line, the green status and muted odds/detail. */
export const UI_WORLD_HINT_INKS = Object.freeze({ title: '#2b1d0e', subtitle: '#8a5a2b', status: '#315c35', muted: '#836f58' });
function lineInks(count: number): readonly string[] {
  // Mining and fishing read class, status, odds; crops and machines read status, time, detail.
  return count >= 3 ? [UI_WORLD_HINT_INKS.subtitle, UI_WORLD_HINT_INKS.status, UI_WORLD_HINT_INKS.muted] : [UI_WORLD_HINT_INKS.status, UI_WORLD_HINT_INKS.subtitle, UI_WORLD_HINT_INKS.muted];
}
/** A projected anchor is data; the kit owns wrapping, frame geometry and clipping. The card is the classic
 * wood-rimmed parchment panel: an icon well on the left (the object's art, or the crop timer filling with its
 * progress), a dark caps title and role-coloured detail lines. */
export function uiWorldHint(options: UiWorldHintOptions = {}): UiElement {
  let key = '', artwork: LoadedAsset | undefined, panel: UiElement | undefined, meter: UiElement | undefined;
  return new UiElement({ kind: 'world-hint', props: { hint: options.hint ?? null },
    style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout },
    measure(element, available) {
      const hint = element.props['hint'] as UiWorldHint | null;
      if (!hint || !Number.isFinite(hint.x + hint.y)) { panel?.setStyle({ visible: false }); return { min: { width: 0, height: 0 }, preferred: available }; }
      const compact = available.width < 280 || available.height < 160;
      const next = JSON.stringify([hint.title, hint.lines, hint.roles, hint.tone, hint.progress !== undefined, compact, Boolean(hint.artwork)]);
      if (!panel || key !== next || artwork !== hint.artwork) {
        panel?.dispose(); key = next; artwork = hint.artwork;
        const fill = hint.tone === 'danger' ? '#e43b44' : hint.tone === 'warning' ? '#feae34' : '#63c74d';
        // Timing reads as the crop timer filling in the icon well; only a card that shows the object's own art
        // carries its progress as a slim track instead.
        const timer = !hint.artwork && hint.progress !== undefined;
        meter = hint.progress === undefined ? undefined : new UiElement({ kind: 'meter', label: 'Progress', props: { value: hint.progress },
          style: timer ? { width: uiFixed(16), height: uiFixed(16), shrink: 0 } : { height: uiFixed(4), alignSelf: 'stretch', shrink: 0 },
          paint(element, { context, art }) {
            const r = element.rect, value = Math.max(0, Math.min(1, Number(element.props['value']) || 0));
            if (timer) { if (art) paintUiSkin(context, art.skin.feedback, `crop_timer.base.${Math.min(15, Math.floor(value * 16))}`, r); return; }
            context.fillStyle = '#6b4423'; context.fillRect(r.x, r.y, r.width, r.height);
            context.fillStyle = '#c9a57a'; context.fillRect(r.x + 1, r.y + 1, r.width - 2, r.height - 2);
            context.fillStyle = fill; context.fillRect(r.x + 1, r.y + 1, Math.round((r.width - 2) * value), r.height - 2);
          } });
        const inked = (text: string, ink: string) => uiText(text.toUpperCase(), { wrap: true, layout: { alignSelf: 'stretch' } }).setProps({ ink });
        const inks = hint.roles?.map(role => UI_WORLD_HINT_INKS[role]) ?? lineInks(hint.lines.length);
        const icon = hint.artwork
          ? uiSprite(hint.artwork, { label: hint.title, animation: 'base', playing: false, layout: { width: uiFixed(16), height: uiFixed(16), shrink: 0 }, fit: 'contain' })
          : timer ? meter : undefined;
        panel = new UiElement({ kind: 'world-hover', label: hint.title,
          style: { display: 'flex', direction: 'row', gap: 4, align: 'center', padding: { left: 6, right: 8, top: 6, bottom: 6 }, position: 'absolute', height: 'fit', anchor: { target: 'top_left', self: 'bottom' } },
          children: [...(icon ? [icon] : []), uiFlex({ direction: 'column', gap: compact ? 0 : 2, grow: 1, shrink: 1, alignSelf: 'stretch', justify: 'center' }, [
            inked(hint.title, UI_WORLD_HINT_INKS.title), ...hint.lines.map((line, index) => inked(line, inks[Math.min(index, inks.length - 1)]!)), ...(meter && !timer ? [meter] : [])])],
          paint(element, { context, art }) { if (art) paintUiSkin(context, art.skin.feedback, 'panel_classic.base.0', element.rect); } });
        element.append(panel);
      }
      if (meter && meter.props['value'] !== hint.progress) { meter.setProps({ value: hint.progress }, false); panel.invalidate(); }
      const chars = Math.max(hint.title.length, ...hint.lines.map(line => line.length));
      const width = Math.min(220, Math.max(96, chars * 6 + (hint.artwork || hint.progress !== undefined ? 36 : 15)));
      panel.setStyle({ visible: true, width: uiFixed(Math.max(0, Math.min(width, available.width))), maxHeight: uiFixed(available.height),
        inset: { left: uiOffset(hint.x), top: uiOffset(hint.y) } });
      return { min: { width: 0, height: 0 }, preferred: available };
    },
  });
}
