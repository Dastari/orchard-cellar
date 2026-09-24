import type { LoadedAsset } from '../../assets.js';
import { selectAtlasFrame } from '../../sprite.js';
import { drawOutlinedPixelText, drawPixelText } from '../../pixel-ui.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed, uiOffset, type UiStyle } from '../layout/box.js';
import { resolveUiTextContrast, UI_TONE_FACES } from '../skin/contrast.js';
export type UiWorldFeedbackEntry = { readonly id: string; readonly x: number; readonly y: number } & (
  { readonly kind: 'quest'; readonly artwork: LoadedAsset | (() => LoadedAsset | undefined) }
  | { readonly kind: 'damage'; readonly amount: number; readonly critical?: boolean; readonly progress: number;
      /** Production combat keeps its established color and bold critical amount. */
      readonly presentation?: 'combat' }
);
export function uiWorldFeedback(options: { readonly entries?: readonly UiWorldFeedbackEntry[]; readonly layout?: UiStyle } = {}): UiElement {
  const nodes = new Map<string, UiElement>();
  return new UiElement({ kind: 'world-feedback', props: { entries: options.entries ?? [] },
    style: { display: 'stack', width: 'grow', height: 'grow', ...options.layout },
    measure(element, available) {
      const visible = new Set<string>();
      for (const entry of element.props['entries'] as readonly UiWorldFeedbackEntry[]) {
        if (!Number.isFinite(entry.x + entry.y) || (entry.kind === 'damage' && (!Number.isFinite(entry.amount + entry.progress) || entry.progress >= 1))) continue;
        visible.add(entry.id); let node = nodes.get(entry.id);
        if (!node) {
          node = new UiElement({ id: `world-feedback:${entry.id}`, kind: 'world-feedback-entry', props: { entry },
            style: { position: 'absolute' }, animated: entry.kind === 'quest',
            paint(element, { context, art, now, reducedMotion }) {
              const value = element.props['entry'] as UiWorldFeedbackEntry, r = element.rect;
              if (value.kind === 'quest') {
                const asset = typeof value.artwork === 'function' ? value.artwork() : value.artwork;
                const frame = asset && selectAtlasFrame(asset.metadata, 'base', 0); if (!asset || !frame) return;
                const bob = reducedMotion ? 0 : Math.round(Math.sin(now / 260));
                context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, r.x, r.y + 1 + bob, 16, 16);
              } else if (art) {
                const tone = value.critical ? 'warning' : 'neutral';
                const progress = Math.max(0, Math.min(1, value.progress));
                context.save(); context.globalAlpha *= progress < .6 ? 1 : (1 - progress) / .4;
                const label = damageLabel(value);
                if (value.presentation === 'combat') {
                  const color = value.critical ? '#ffd34e' : '#fff1cf';
                  drawPixelText(context, art.pixel, label, r.x + 1, r.y + 1, { color: '#3f2832' });
                  drawPixelText(context, art.pixel, label, r.x, r.y, { color });
                  if (value.critical) drawPixelText(context, art.pixel, label, r.x + 1, r.y, { color });
                } else drawOutlinedPixelText(context, art.pixel, label, r.x + 1, r.y + 1,
                  { color: resolveUiTextContrast(tone).color, outlineColor: UI_TONE_FACES[tone].frame.face });
                context.restore();
              }
            },
          }); element.append(node); nodes.set(entry.id, node);
        }
        const label = entry.kind === 'damage' ? damageLabel(entry) : 'Quest';
        const width = entry.kind === 'quest' ? 16 : label.length * 6 + 2, height = entry.kind === 'quest' ? 18 : 10;
        node.label = label; node.setProps({ entry }, false);
        node.setStyle({ width: uiFixed(width), height: uiFixed(height),
          inset: { left: uiOffset(entry.x - width / 2), top: uiOffset(entry.y - (entry.kind === 'quest' ? 9 : 0)) } });
      }
      for (const [id, node] of nodes) if (!visible.has(id)) { node.dispose(); nodes.delete(id); }
      return { min: { width: 0, height: 0 }, preferred: available };
    },
  });
}
function damageLabel(entry: Extract<UiWorldFeedbackEntry, { kind: 'damage' }>): string {
  return `-${Math.max(1, Math.round(entry.amount))}${entry.critical && entry.presentation !== 'combat' ? '!' : ''}`;
}
