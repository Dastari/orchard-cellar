import { UI_TONE_FACES } from '../skin/contrast.js';
import type { UiRect } from '../../geometry.js';
import type { UiStyle } from '../layout/box.js';
import { UiElement } from '../runtime/element.js';
import type { UiScale } from '../tokens.js';
export interface UiViewportOptions {
  readonly id?: string; readonly label: string; readonly layout?: UiStyle;
  /** Host spatial coordinates per logical UI pixel. Does not scale chrome. */
  readonly coordinateScale?: UiScale;
  readonly background?: 'checkerboard' | 'none';
  /** Spatial, graph or simulation content only; controls must be kit children. */
  readonly render: (context: CanvasRenderingContext2D, bounds: UiRect, now: number) => void;
}
export function uiViewport(options: UiViewportOptions): UiElement {
  const scale = options.coordinateScale ?? 1;
  return new UiElement({ id: options.id, kind: 'viewport', label: options.label, props: { background: options.background ?? 'none' },
    style: { width: 'grow', height: 'grow', ...options.layout },
    paint(element, { context, now }) {
      if (options.background === 'checkerboard') {
        const r = element.rect;
        for (let y = r.y + Math.max(0, Math.floor((element.clip.y - r.y) / 16)) * 16; y < Math.min(r.y + r.height, element.clip.y + element.clip.height); y += 16) for (let x = r.x + Math.max(0, Math.floor((element.clip.x - r.x) / 16)) * 16; x < Math.min(r.x + r.width, element.clip.x + element.clip.width); x += 16) {
          context.fillStyle = ((x - r.x) / 16 + (y - r.y) / 16) % 2 ? UI_TONE_FACES.muted.frame.face : UI_TONE_FACES.neutral.frame.face;
          context.fillRect(x, y, Math.min(16, r.x + r.width - x), Math.min(16, r.y + r.height - y));
        }
      }
      context.scale(1 / scale, 1 / scale);
      const r = element.rect;
      options.render(context, { x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale }, now);
    },
  });
}
