import { selectAtlasFrame } from '../../sprite.js';
import type { LoadedAsset } from '../../assets.js';
import { UiElement } from '../runtime/element.js';
import { uiFixed } from '../layout/box.js';
import { paintUiSkin } from './art.js';
import { uiFlex } from './layout.js';
import { uiText } from './text.js';
import { uiMeter } from './meter.js';
import { uiWindowEmblem } from './window.js';

/** Per-station mood for the machine well: the one place a station departs from shared chrome. */
export type UiStationMood = 'forge' | 'hearth' | 'orchard' | 'cellar' | 'pantry' | 'workshop';
const MOODS: Readonly<Record<UiStationMood, { readonly floor: string; readonly glow: string | null }>> = {
  forge: { floor: '#5d3a2e', glow: 'rgba(247, 118, 34, 0.16)' },
  hearth: { floor: '#5d3a2e', glow: 'rgba(254, 174, 52, 0.16)' },
  orchard: { floor: '#b86f50', glow: null },
  cellar: { floor: '#3f2832', glow: null },
  pantry: { floor: '#9e5f45', glow: null },
  workshop: { floor: '#9e5f45', glow: null },
};

export interface UiStationMachineOptions {
  readonly label: string; readonly asset: () => LoadedAsset | undefined;
  /** Animation to show; `active` switches to the running pose. */
  readonly idle: string; readonly running?: string; readonly active: () => boolean;
  readonly mood: UiStationMood;
}
/** The machine itself, drawn at 2× in a lit well: furnaces glow when burning, presses show fruit. */
export function uiStationMachine(options: UiStationMachineOptions): UiElement {
  return new UiElement({ kind: 'station-machine', label: options.label, get animated() { return options.active() && Boolean(options.running); },
    style: { width: uiFixed(72), height: uiFixed(80), shrink: 0 },
    paint(element, { context, art, now, reducedMotion }) {
      if (!art) return;
      const r = element.rect, mood = MOODS[options.mood], active = options.active();
      paintUiSkin(context, art.skin.frame, 'thin', r);
      const inner = { x: r.x + 4, y: r.y + 4, width: r.width - 8, height: r.height - 9 };
      context.fillStyle = mood.floor; context.fillRect(inner.x, inner.y + inner.height - 10, inner.width, 10);
      if (active && mood.glow) {
        // Stepped pixel halo around the fire mouth, flickering one step unless motion is reduced.
        const cx = r.x + Math.floor(r.width / 2), cy = inner.y + inner.height - 22, flicker = reducedMotion ? 0 : Math.floor(now / 180) % 2;
        context.fillStyle = mood.glow;
        for (const [w, h] of [[44, 30], [34, 38], [24, 44]] as const) context.fillRect(cx - w / 2 - flicker, cy - h / 2, w + flicker * 2, h);
      }
      const asset = options.asset(); if (!asset) return;
      const group = active && options.running ? options.running : options.idle;
      const count = asset.metadata.animations[group]?.length ?? 1;
      const frame = selectAtlasFrame(asset.metadata, group, reducedMotion ? 0 : Math.floor(now / 140) % count) ?? selectAtlasFrame(asset.metadata, options.idle, 0);
      if (!frame) return;
      const scale = Math.max(1, Math.floor(Math.min(inner.width / frame.width, inner.height / frame.height)));
      const width = frame.width * scale, height = frame.height * scale;
      context.drawImage(asset.image, frame.x, frame.y, frame.width, frame.height, r.x + Math.floor((r.width - width) / 2), inner.y + inner.height - height - 2, width, height);
    },
  });
}

/** A labelled single slot column entry, such as ORE or FUEL. */
export function uiStationSlot(label: string, slot: UiElement): UiElement {
  return uiFlex({ direction: 'column', gap: 2, align: 'center', shrink: 0 }, [uiText(label, { role: 'label', align: 'center' }), slot]);
}

export interface UiStationLayoutOptions {
  /** The machine's own art, shown with the live status in the station's top-left corner. */
  readonly emblem?: UiElement;
  readonly inputs: readonly UiElement[]; readonly outputs: readonly UiElement[];
  readonly machine: UiElement; readonly progress: number | (() => number);
  readonly status: string | (() => string);
  /** Station controls such as SEAL or COLLECT, kept under the status line. */
  readonly actions?: readonly UiElement[];
}
/** Inputs → machine → outputs, with progress and the timing line under the machine. */
export function uiStationLayout(options: UiStationLayoutOptions): UiElement {
  const status = uiText(typeof options.status === 'function' ? options.status() : options.status, { wrap: true, maxLines: 2, layout: { grow: 1 } });
  return uiFlex({ direction: 'column', gap: 6, align: 'center', shrink: 0 }, [
    uiFlex({ direction: 'row', gap: 6, align: 'center', alignSelf: 'stretch' }, [...(options.emblem ? [uiWindowEmblem(options.emblem)] : []), status]),
    uiFlex({ direction: 'row', gap: 8, align: 'center' }, [
      uiFlex({ direction: 'column', gap: 4, shrink: 0 }, options.inputs),
      uiFlex({ direction: 'column', gap: 4, align: 'center', shrink: 0 }, [options.machine, uiMeter({ label: 'Progress', value: options.progress, tone: 'warning', layout: { width: uiFixed(72) } })]),
      uiFlex({ direction: 'column', gap: 4, shrink: 0 }, options.outputs),
    ]),
    ...(options.actions?.length ? [uiFlex({ direction: 'row', gap: 4, justify: 'center' }, options.actions)] : []),
  ]);
}
