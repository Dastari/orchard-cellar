import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { paintUiSkin } from './art.js';
import type { UiControlSize } from '../tokens.js';
import { uiMeter } from './meter.js';
export type UiVitalKind = 'health' | 'mana' | 'vigour';
export interface UiVitalValues {
  readonly health: number; readonly maxHealth: number;
  readonly mana?: number; readonly maxMana?: number;
  readonly vigour?: number; readonly maxVigour?: number;
}
export interface UiVitalsOptions {
  readonly id?: string; readonly values: UiVitalValues | (() => UiVitalValues | undefined);
  readonly portrait?: UiElement; readonly mirrored?: boolean; readonly size?: UiControlSize; readonly layout?: UiStyle;
}
export function uiVitalFraction(current: number | undefined, maximum: number | undefined): number {
  return current === undefined || maximum === undefined || !Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0
    ? 0 : Math.max(0, Math.min(1, current / maximum));
}
/** A compact identity portrait and three individually inspectable resource bars.
 * The host supplies snapshots; the same nodes survive resource updates. */
export function uiVitals(options: UiVitalsOptions): UiElement {
  const values = () => typeof options.values === 'function' ? options.values() : options.values;
  const scale = options.size === 'lg' ? 3 : options.size === 'md' ? 2 : 1;
  const bars = (['health', 'mana', 'vigour'] as const).map((kind, index) => {
    const meter = uiMeter({ id: options.id ? `${options.id}:${kind}` : undefined, label: kind,
      tone: (['danger', 'info', 'success'] as const)[index], variant: 'resource', reversed: options.mirrored,
      layout: { position: 'absolute', inset: { left: uiFixed((options.mirrored ? 0 : 18) * scale), top: uiFixed((3 + index * 4) * scale) }, width: uiFixed(30 * scale), height: uiFixed(5 * scale) },
      value: () => { const value = values(); return uiVitalFraction(value?.[kind], value?.[(['maxHealth', 'maxMana', 'maxVigour'] as const)[index]!]); } });
    meter.setProps({ resource: kind }); return meter;
  });
  const portrait = options.portrait?.setStyle({ position: 'absolute', inset: { left: uiFixed((options.mirrored ? 33 : 3) * scale), top: uiFixed(3 * scale) }, width: uiFixed(12 * scale), height: uiFixed(13 * scale), shrink: 0 });
  return new UiElement({ id: options.id, kind: 'vitals', style: { display: 'stack', width: uiFixed(48 * scale), height: uiFixed(19 * scale), ...options.layout },
    children: [...(portrait ? [portrait] : []), ...bars],
    paint(element, { context, art }) {
      if (!art) return;
      context.save();
      const r = element.rect;
      if (options.mirrored) { context.translate(r.x * 2 + r.width, 0); context.scale(-1, 1); }
      paintUiSkin(context, art.skin.feedback, 'bar_frame.base.0', r);
      context.restore();
    },
  });
}
