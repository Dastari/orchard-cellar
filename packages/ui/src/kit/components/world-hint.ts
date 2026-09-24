import type { LoadedAsset } from '../../assets.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, uiOffset, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { paintUiDarkFrame } from './feedback-game.js';
import { UI_ITEM_INKS } from '../tokens.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiSprite } from './media.js';
export interface UiWorldHint {
  readonly x: number; readonly y: number; readonly title: string; readonly lines: readonly string[];
  readonly tone: UiTone; readonly progress?: number; readonly artwork?: LoadedAsset;
}
export interface UiWorldHintOptions { readonly hint?: UiWorldHint | null; readonly layout?: UiStyle }
/** A projected anchor is data; the kit owns wrapping, frame geometry and clipping. */
export function uiWorldHint(options: UiWorldHintOptions = {}): UiElement {
  let key = '', artwork: LoadedAsset | undefined, panel: UiElement | undefined, meter: UiElement | undefined;
  return new UiElement({ kind: 'world-hint', props: { hint: options.hint ?? null },
    style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout },
    measure(element, available) {
      const hint = element.props['hint'] as UiWorldHint | null;
      if (!hint || !Number.isFinite(hint.x + hint.y)) { panel?.setStyle({ visible: false }); return { min: { width: 0, height: 0 }, preferred: available }; }
      const compact = available.width < 280 || available.height < 160;
      const next = JSON.stringify([hint.title, hint.lines, hint.tone, hint.progress !== undefined, compact]);
      if (!panel || key !== next || artwork !== hint.artwork) {
        panel?.dispose(); key = next; artwork = hint.artwork;
        // The approved dark hover card: gold title, cream lines, an optional item and a thin progress bar.
        const fill = hint.tone === 'danger' ? '#e43b44' : hint.tone === 'warning' ? '#feae34' : '#63c74d';
        meter = hint.progress === undefined ? undefined : new UiElement({ kind: 'meter', label: 'Progress', props: { value: hint.progress }, style: { height: uiFixed(4), alignSelf: 'stretch', shrink: 0 },
          paint(element, { context }) { const r = element.rect, value = Math.max(0, Math.min(1, Number(element.props['value']) || 0)); context.fillStyle = '#3a3150'; context.fillRect(r.x, r.y, r.width, r.height); context.fillStyle = fill; context.fillRect(r.x, r.y, Math.round(r.width * value), r.height); } });
        const inked = (text: string, ink: string) => uiText(text, { wrap: true, layout: { alignSelf: 'stretch' } }).setProps({ ink });
        panel = new UiElement({ kind: 'world-hover', label: hint.title, props: { itemInks: true },
          style: { display: 'flex', direction: 'column', gap: compact ? 2 : 4, padding: 6, position: 'absolute', height: 'fit', anchor: { target: 'top_left', self: 'bottom' } },
          children: [uiFlex({ direction: 'row', gap: 4, align: 'center', alignSelf: 'stretch' }, [
            ...(hint.artwork ? [uiSprite(hint.artwork, { label: hint.title, animation: 'base', playing: false, layout: { width: uiFixed(16), height: uiFixed(16), shrink: 0 }, fit: 'contain' })] : []),
            inked(hint.title, UI_ITEM_INKS.flavour)]),
            ...hint.lines.map(line => inked(line, UI_ITEM_INKS.body)), ...(meter ? [meter] : [])],
          paint(element, { context, art }) { paintUiDarkFrame(element, context, art); } });
        element.append(panel);
      }
      if (meter && meter.props['value'] !== hint.progress) meter.setProps({ value: hint.progress }, false);
      const width = Math.min(160, Math.max(72, Math.max(hint.title.length + (hint.artwork ? 3 : 0), ...hint.lines.map(line => line.length)) * 6 + 13));
      panel.setStyle({ visible: true, width: uiFixed(Math.max(0, Math.min(width, available.width))), maxHeight: uiFixed(available.height),
        inset: { left: uiOffset(hint.x), top: uiOffset(hint.y) } });
      return { min: { width: 0, height: 0 }, preferred: available };
    },
  });
}
