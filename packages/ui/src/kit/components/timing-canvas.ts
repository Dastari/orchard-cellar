import type { TimingProjection } from '@orchard/sim';
import { AUTHORITY_HZ } from '@orchard/sim/net-timing';
import { drawPixelTextInRect, type PixelUi } from '../../pixel-ui.js';
import { drawUiSkinAsset, type UiSkin } from '../../skin.js';
import type { UiRect } from '../../geometry.js';
import { resolveUiTextContrast } from '../skin/contrast.js';

export interface TimingLabels { readonly status: string; readonly time: string }
const labels = new Map<string, TimingLabels>();
const reasons: Readonly<Record<string, string>> = {
  'needs-input': 'ADD INPUTS', 'no-fuel': 'NEEDS FUEL', 'output-full': 'OUTPUT FULL',
  'fire-out': 'FIRE OUT', unsealed: 'SEAL TO START', 'invalid-batch': 'CHECK BATCH',
  'invalid-duration': 'TIMING UNAVAILABLE', 'start-pending': 'START PENDING',
  dry: 'PAUSED: NEEDS WATER', dormant: 'DORMANT UNTIL SPRING', harvest: 'READY TO HARVEST',
  'active-growth': 'GROWING', regrowing: 'REGROWING', ripening: 'RIPENING',
  'fully-grown': 'FULLY GROWN', 'growth-paused': 'GROWTH PAUSED',
  'anchor-unavailable': 'TIMING UNAVAILABLE', 'checkpoint-unavailable': 'TIMING UNAVAILABLE',
  'catch-up-pending': 'AWAITING UPDATE', 'transition-pending': 'AWAITING UPDATE',
  depleted: 'DEPLETED', tree_immature: 'TREE STILL GROWING',
};

/** Bounded shared cache: format at displayed precision, not once per frame or object. */
export function timingLabels(timing: TimingProjection): TimingLabels {
  const seconds = timing.remainingActiveTicks === null ? null
    : (timing.remainingActiveTicks + BigInt(AUTHORITY_HZ - 1)) / BigInt(AUTHORITY_HZ);
  const key = `${timing.status}:${timing.reason}:${timing.confidence}:${seconds}`;
  const cached = labels.get(key);
  if (cached) return cached;
  const status = timing.reason !== null && reasons[timing.reason] !== undefined ? reasons[timing.reason]!
    : timing.status === 'awaiting-settlement' ? 'COLLECT TO CONFIRM'
      : timing.status === 'ready' ? 'READY'
        : timing.status === 'running' ? 'IN PROGRESS'
          : timing.status === 'paused' ? 'PAUSED' : timing.status === 'blocked' ? 'BLOCKED' : 'IDLE';
  const showTime = seconds !== null && timing.status === 'running';
  const suffix = timing.reason === 'active-growth' && timing.confidence === 'estimated' ? 'GROWTH' : 'LEFT';
  const time = !showTime ? timing.status === 'awaiting-settlement' ? 'ESTIMATED' : ''
    : `${timing.confidence === 'estimated' ? '~' : ''}${seconds / 60n}:${String(seconds % 60n).padStart(2, '0')} ${suffix}`;
  const result = Object.freeze({ status, time });
  if (labels.size >= 64) labels.delete(labels.keys().next().value!);
  labels.set(key, result);
  return result;
}

/** Kit-owned canvas bridge for authored frames and the game's existing HUD.
 * Geometry, typography, contrast and meter drawing live here, not in consumers. */
export function drawTimingPane(context: CanvasRenderingContext2D, rect: UiRect,
  timing: TimingProjection, art: { readonly skin: UiSkin; readonly fonts: PixelUi }): void {
  const text = timingLabels(timing);
  const color = resolveUiTextContrast('neutral').color;
  drawPixelTextInRect(context, art.fonts, text.status, { ...rect, height: 12 },
    { color, align: 'center', overflow: 'ellipsis' });
  drawPixelTextInRect(context, art.fonts, text.time, { ...rect, y: rect.y + 16, height: 12 },
    { color, align: 'center', overflow: 'ellipsis' });
  const track = { x: rect.x + 2, y: rect.y + 34, width: Math.max(0, rect.width - 4), height: 6 };
  drawUiSkinAsset(context, art.skin.sliderTrack, track, 'base', 2);
  const width = Math.round(Math.max(0, track.width - 2) * Math.max(0, Math.min(1, timing.progress)));
  if (width > 0) drawUiSkinAsset(context, art.skin.sliderFill,
    { x: track.x + 1, y: track.y + 1, width, height: 4 }, 'base', 2);
}

export function drawTimingTooltip(context: CanvasRenderingContext2D, rect: UiRect, title: string,
  timing: TimingProjection, art: { readonly skin: UiSkin; readonly fonts: PixelUi }, detail?: string): void {
  drawUiSkinAsset(context, art.skin.panelParchment, rect, 'base', 2);
  drawPixelTextInRect(context, art.fonts, title.toUpperCase(),
    { x: rect.x + 6, y: rect.y + 6, width: rect.width - 12, height: 12 },
    { color: resolveUiTextContrast('neutral').color, align: 'center', overflow: 'ellipsis' });
  drawTimingPane(context, { x: rect.x + 6, y: rect.y + 22, width: rect.width - 12, height: 44 }, timing, art);
  if (detail) drawPixelTextInRect(context, art.fonts, detail,
    { x: rect.x + 6, y: rect.y + 68, width: rect.width - 12, height: 12 },
    { color: resolveUiTextContrast('neutral').color, align: 'center', overflow: 'ellipsis' });
}
