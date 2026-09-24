import type { LoadedAsset } from '../../assets.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, uiOffset, type UiStyle } from '../layout/box.js';
import type { UiTone } from '../tokens.js';
import { uiFrame } from './frame.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiSprite } from './media.js';
import { uiMeter } from './meter.js';
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
        meter = hint.progress === undefined ? undefined : uiMeter({ label: 'Progress', value: hint.progress, tone: hint.tone, layout: { width: 'grow' } });
        panel = uiFrame({ tone: hint.tone, padding: compact ? 4 : undefined,
          header: compact ? undefined : { title: hint.title, content: uiText(hint.title, { role: 'label', wrap: true, layout: { width: 'grow' } }) },
          layout: { position: 'absolute', width: uiFixed(280), height: 'fit', gap: compact ? 0 : undefined, anchor: { target: 'top_left', self: 'bottom' } },
          children: [...(compact ? [uiText(hint.title, { role: 'label', wrap: true, layout: { width: 'grow' } })] : []), uiFlex({ direction: 'row', width: 'grow', gap: compact ? 4 : 8 }, [
            ...(hint.artwork ? [uiSprite(hint.artwork, { label: hint.title, animation: 'base', playing: false, layout: { width: uiFixed(16), height: uiFixed(16), shrink: 0 }, fit: 'contain' })] : []),
            uiFlex({ width: 'grow', gap: compact ? 0 : 4 }, hint.lines.map(line => uiText(line, { wrap: true }))),
          ]), ...(meter ? [meter] : [])],
        }); element.append(panel);
      }
      if (meter && meter.props['value'] !== hint.progress) meter.setProps({ value: hint.progress }, false);
      panel.setStyle({ visible: true, width: uiFixed(Math.max(0, Math.min(280, available.width))), maxHeight: uiFixed(available.height),
        inset: { left: uiOffset(hint.x), top: uiOffset(hint.y) } });
      return { min: { width: 0, height: 0 }, preferred: available };
    },
  });
}
