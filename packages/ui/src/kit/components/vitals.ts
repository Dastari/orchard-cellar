import { UiElement } from '../runtime/element.js';
import { uiFixed, type UiStyle } from '../layout/box.js';
import { paintUiSkin, uiSkinFrame } from './art.js';
import type { UiControlSize } from '../tokens.js';
import { uiMeter } from './meter.js';
import { uiTooltip } from './tooltip.js';
export type UiVitalKind = 'health' | 'mana' | 'vigour';
export interface UiVitalValues {
  readonly health: number; readonly maxHealth: number;
  readonly mana?: number; readonly maxMana?: number;
  readonly vigour?: number; readonly maxVigour?: number;
}
export interface UiVitalsOptions {
  readonly id?: string; readonly values: UiVitalValues | (() => UiVitalValues | undefined);
  readonly tooltip?: (kind: UiVitalKind, values: UiVitalValues | undefined) => string;
  readonly vigourDenied?: () => boolean;
  readonly portrait?: UiElement; readonly mirrored?: boolean; readonly size?: UiControlSize; readonly layout?: UiStyle;
  /** `card` is the authored compact vitals card (portrait window and three bars); `classic` is the game HUD's
   * resource frame: the bar frame at 1.5x with stretched fills, mirrored for a target. */
  readonly variant?: 'bars' | 'card' | 'classic';
}
export function uiVitalFraction(current: number | undefined, maximum: number | undefined): number {
  return current === undefined || maximum === undefined || !Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0
    ? 0 : Math.max(0, Math.min(1, current / maximum));
}
/** A compact identity portrait and three individually inspectable resource bars.
 * The host supplies snapshots; the same nodes survive resource updates. */
export function uiVitals(options: UiVitalsOptions): UiElement {
  if (options.variant === 'card') return uiVitalsCard(options);
  if (options.variant === 'classic') return uiVitalsClassic(options);
  const values = () => typeof options.values === 'function' ? options.values() : options.values;
  const scale = options.size === 'lg' ? 3 : options.size === 'md' ? 2 : 1;
  const bars = (['health', 'mana', 'vigour'] as const).map((kind, index) => {
    const meter = uiMeter({ id: options.id ? `${options.id}:${kind}` : undefined, label: kind,
      tone: (['danger', 'info', 'success'] as const)[index], variant: 'resource', reversed: options.mirrored,
      layout: { position: 'absolute', inset: { left: uiFixed((options.mirrored ? 0 : 18) * scale), top: uiFixed((3 + index * 4) * scale) }, width: uiFixed(30 * scale), height: uiFixed(5 * scale) },
      value: () => { const value = values(); return uiVitalFraction(value?.[kind], value?.[(['maxHealth', 'maxMana', 'maxVigour'] as const)[index]!]); } });
    meter.setProps({ resource: kind });
    if (!options.tooltip) return meter;
    const layout = meter.style; meter.setStyle({ position: 'relative', inset: undefined, width: 'grow', height: 'grow' }); meter.focusable = true;
    return uiTooltip(() => options.tooltip!(kind, values()), meter, layout);
  });
  const portrait = options.portrait?.setStyle({ position: 'absolute', inset: { left: uiFixed((options.mirrored ? 33 : 3) * scale), top: uiFixed(3 * scale) }, width: uiFixed(12 * scale), height: uiFixed(13 * scale), shrink: 0 });
  return new UiElement({ id: options.id, kind: 'vitals', style: { display: 'stack', width: uiFixed(48 * scale), height: uiFixed(19 * scale), ...options.layout },
    children: [...(portrait ? [portrait] : []), ...bars],
    paintOverlay(_element, { context }) {
      if (!options.vigourDenied?.()) return;
      const bar = bars[2]!.rect; context.fillStyle = '#d44747';
      for (const [x,y] of [[bar.x,bar.y],[bar.x+bar.width-3,bar.y],[bar.x,bar.y+bar.height-1],[bar.x+bar.width-3,bar.y+bar.height-1]]) context.fillRect(x!,y!,3,1);
      for (const [x,y] of [[bar.x,bar.y],[bar.x+bar.width-1,bar.y],[bar.x,bar.y+bar.height-3],[bar.x+bar.width-1,bar.y+bar.height-3]]) context.fillRect(x!,y!,1,3);
    },
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

const CARD_BAR = { x: 23, y: 10, pitch: 4, span: 21, height: 3 } as const;
/** The authored 48×24 compact vitals card at `size` scale. Its bars ship full, so empty spans are re-inked
 * with the card's track colour; each bar is an inspectable, focusable region with its own tooltip. */
function uiVitalsCard(options: UiVitalsOptions): UiElement {
  const values = () => typeof options.values === 'function' ? options.values() : options.values;
  const scale = options.size === 'lg' ? 3 : options.size === 'md' ? 2 : 1;
  const maxima = ['maxHealth', 'maxMana', 'maxVigour'] as const;
  const fraction = (index: number) => { const value = values(), kind = (['health', 'mana', 'vigour'] as const)[index]!; return uiVitalFraction(value?.[kind], value?.[maxima[index]!]); };
  const bars = (['health', 'mana', 'vigour'] as const).map((kind, index) => {
    const layout: UiStyle = { position: 'absolute', inset: { left: uiFixed((CARD_BAR.x - 1) * scale), top: uiFixed((CARD_BAR.y - 1 + index * CARD_BAR.pitch) * scale) }, width: uiFixed((CARD_BAR.span + 2) * scale), height: uiFixed((CARD_BAR.height + 1) * scale) };
    const bar = new UiElement({ id: options.id ? `${options.id}:${kind}` : undefined, kind: 'meter', label: kind, focusable: Boolean(options.tooltip), props: { resource: kind },
      style: options.tooltip ? { width: 'grow', height: 'grow' } : layout,
      paint(element, { context, focused }) { if (!focused) return; const r = element.rect; context.fillStyle = '#fff6e0'; context.fillRect(r.x, r.y + r.height - 1, r.width, 1); } });
    return options.tooltip ? uiTooltip(() => options.tooltip!(kind, values()), bar, layout) : bar;
  });
  const portrait = options.portrait?.setStyle({ position: 'absolute', inset: { left: uiFixed(3 * scale), top: uiFixed(9 * scale) }, width: uiFixed(13 * scale), height: uiFixed(13 * scale), shrink: 0 });
  return new UiElement({ id: options.id, kind: 'vitals', style: { display: 'stack', width: uiFixed(48 * scale), height: uiFixed(24 * scale), ...options.layout },
    children: [...(portrait ? [portrait] : []), ...bars],
    paintOverlay(_element, { context }) {
      if (!options.vigourDenied?.()) return;
      const bar = bars[2]!.rect; context.fillStyle = '#d44747';
      for (const [x,y] of [[bar.x,bar.y],[bar.x+bar.width-3,bar.y],[bar.x,bar.y+bar.height-1],[bar.x+bar.width-3,bar.y+bar.height-1]]) context.fillRect(x!,y!,3,1);
      for (const [x,y] of [[bar.x,bar.y],[bar.x+bar.width-1,bar.y],[bar.x,bar.y+bar.height-3],[bar.x+bar.width-1,bar.y+bar.height-3]]) context.fillRect(x!,y!,1,3);
    },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect;
      paintUiSkin(context, art.skin.meter, 'kit_vitals_compact.idle.0', r);
      for (let index = 0; index < 3; index++) {
        const filled = Math.round(CARD_BAR.span * fraction(index)); if (filled >= CARD_BAR.span) continue;
        context.fillStyle = '#181425'; context.fillRect(r.x + (CARD_BAR.x + filled) * scale, r.y + (CARD_BAR.y + index * CARD_BAR.pitch) * scale, (CARD_BAR.span - filled) * scale, CARD_BAR.height * scale);
      }
    },
  });
}

/** The classic HUD resource frame: 72x29, the 48x19 bar frame stretched 1.5x. */
export const UI_CLASSIC_VITALS = Object.freeze({ width: 72, height: 29, portrait: { x: 5, y: 5, width: 18, height: 20 }, bars: { x: 27, y: [5, 11, 17], width: 45, height: 8 } });
const CLASSIC_FILLS = { health: 'bar_fill_red.base.0', mana: 'bar_fill_blue.base.0', vigour: 'bar_fill_green.base.0' } as const;
const CLASSIC_TIPS = { health: ['#fee761', '#feae34'], mana: ['#2ce8f5', '#0095e9'], vigour: ['#fee761', '#63c74d'] } as const;
/** Each bar is its authored fill stretched over the track and clipped to the value, with a bright two-tone tip at
 * its leading edge; an undefined resource stays an empty track. Mirrored frames put the portrait on the right and
 * fill their bars from the right. */
function uiVitalsClassic(options: UiVitalsOptions): UiElement {
  const values = () => typeof options.values === 'function' ? options.values() : options.values;
  const g = UI_CLASSIC_VITALS, mirrored = options.mirrored === true, barX = mirrored ? 0 : g.bars.x, maxima = ['maxHealth', 'maxMana', 'maxVigour'] as const;
  const kinds = ['health', 'mana', 'vigour'] as const;
  const fraction = (index: number): number | undefined => { const value = values(), kind = kinds[index]!; return value?.[kind] === undefined ? undefined : uiVitalFraction(value[kind], value[maxima[index]!]); };
  const bars = kinds.map((kind, index) => {
    const layout: UiStyle = { position: 'absolute', inset: { left: uiFixed(barX), top: uiFixed(g.bars.y[index]!) }, width: uiFixed(g.bars.width), height: uiFixed(g.bars.height) };
    const bar = new UiElement({ id: options.id ? `${options.id}:${kind}` : undefined, kind: 'meter', label: kind, focusable: Boolean(options.tooltip), props: { resource: kind },
      style: options.tooltip ? { width: 'grow', height: 'grow' } : layout,
      paint(element, { context, focused }) { if (!focused) return; const r = element.rect; context.fillStyle = '#fff6e0'; context.fillRect(r.x, r.y + r.height - 1, r.width, 1); } });
    return options.tooltip ? uiTooltip(() => options.tooltip!(kind, values()), bar, layout) : bar;
  });
  const portrait = options.portrait?.setStyle({ position: 'absolute', inset: { left: uiFixed(mirrored ? g.width - g.portrait.x - g.portrait.width : g.portrait.x), top: uiFixed(g.portrait.y) },
    width: uiFixed(g.portrait.width), height: uiFixed(g.portrait.height), shrink: 0 });
  return new UiElement({ id: options.id, kind: 'vitals', style: { display: 'stack', width: uiFixed(g.width), height: uiFixed(g.height), ...options.layout },
    children: [...(portrait ? [portrait] : []), ...bars],
    paintOverlay(_element, { context }) {
      if (!options.vigourDenied?.()) return;
      const bar = bars[2]!.rect; context.fillStyle = '#d44747';
      for (const [x,y] of [[bar.x,bar.y],[bar.x+bar.width-3,bar.y],[bar.x,bar.y+bar.height-1],[bar.x+bar.width-3,bar.y+bar.height-1]]) context.fillRect(x!,y!,3,1);
      for (const [x,y] of [[bar.x,bar.y],[bar.x+bar.width-1,bar.y],[bar.x,bar.y+bar.height-3],[bar.x+bar.width-1,bar.y+bar.height-3]]) context.fillRect(x!,y!,1,3);
    },
    paint(element, { context, art }) {
      if (!art) return; const r = element.rect;
      const frame = art.skin.feedback['bar_frame.base.0'], source = frame && uiSkinFrame(frame);
      if (frame && source) {
        context.save(); context.imageSmoothingEnabled = false;
        if (mirrored) { context.translate(r.x * 2 + r.width, 0); context.scale(-1, 1); }
        context.drawImage(frame.asset.image, source.x, source.y, source.width, source.height, r.x, r.y, r.width, r.height); context.restore();
      }
      kinds.forEach((kind, index) => {
        const value = fraction(index), entry = art.skin.feedback[CLASSIC_FILLS[kind]], fill = entry && uiSkinFrame(entry);
        if (value === undefined || !entry || !fill) return;
        const track = { x: r.x + barX, y: r.y + g.bars.y[index]!, width: g.bars.width, height: g.bars.height }, width = Math.round(track.width * value);
        if (width <= 0) return;
        const shown = { x: mirrored ? track.x + track.width - width : track.x, y: track.y, width, height: track.height };
        context.save(); context.beginPath(); context.rect(shown.x, shown.y, shown.width, shown.height); context.clip(); context.imageSmoothingEnabled = false;
        if (mirrored) { context.translate(track.x * 2 + track.width, 0); context.scale(-1, 1); }
        context.drawImage(entry.asset.image, fill.x, fill.y, fill.width, fill.height, track.x, track.y, track.width, track.height); context.restore();
        // The leading-edge tip: 2px wide, inset 2px top and bottom, lighter over its top three rows.
        const tipWidth = 2, full = width >= track.width, tipX = mirrored ? shown.x + (full ? tipWidth : 0) : shown.x + shown.width - tipWidth - (full ? tipWidth : 0);
        const [top, bottom] = CLASSIC_TIPS[kind];
        context.fillStyle = top; context.fillRect(tipX, track.y + 2, tipWidth, 3);
        context.fillStyle = bottom; context.fillRect(tipX, track.y + 5, tipWidth, 1);
      });
    },
  });
}
