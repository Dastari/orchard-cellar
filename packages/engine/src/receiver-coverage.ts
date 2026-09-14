import { sampleDirectionalMask, type DirectionalCaster, type DirectionalShadowMask } from './directional-shadows.js';

export interface PreparedCaster {
  caster: DirectionalCaster;
  sun: DirectionalShadowMask | null;
  moon: DirectionalShadowMask | null;
}
export interface ReceiverCoverageBounds {
  readonly left: number; readonly top: number; readonly width: number;
  readonly height: number; readonly receiverHeight: number; readonly step: number;
}
export interface ReceiverCoverageChannels {
  readonly sun: Uint8Array; readonly moon: Uint8Array; readonly contact: Uint8Array;
}
export function createReceiverCoverage(size: number): ReceiverCoverageChannels {
  return { sun: new Uint8Array(size), moon: new Uint8Array(size), contact: new Uint8Array(size) };
}
export function copyReceiverCoverage(target: ReceiverCoverageChannels, source: ReceiverCoverageChannels): void {
  target.sun.set(source.sun); target.moon.set(source.moon); target.contact.set(source.contact);
}
export function contactCoverage(caster: DirectionalCaster, x: number, y: number, height: number): number {
  if (!caster.contact || height !== caster.baseHeightSubunits) return 0;
  const f = caster.footprint;
  const centerX = caster.worldX + (f.left + f.right) / 2, centerY = caster.worldY + (f.top + f.bottom) / 2;
  const distance = Math.hypot((x - centerX) / Math.max(1, (f.right - f.left) / 2 + 1), (y - centerY) / Math.max(1, (f.bottom - f.top) / 2 + 1));
  return Math.max(0, Math.min(1, (1 - distance) / 0.4));
}
function blitMask(target: Uint8Array, caster: DirectionalCaster, mask: DirectionalShadowMask | null, bounds: ReceiverCoverageBounds): void {
  if (mask === null) return;
  const { left, top, width, height, step } = bounds;
  const minX = Math.max(0, Math.floor((caster.worldX + mask.left - left) / step));
  const minY = Math.max(0, Math.floor((caster.worldY + mask.top - top) / step));
  const maxX = Math.min(width, Math.ceil((caster.worldX + mask.left + mask.width - left) / step));
  const maxY = Math.min(height, Math.ceil((caster.worldY + mask.top + mask.height - top) / step));
  for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
    const index = y * width + x;
    target[index] = Math.max(target[index]!, Math.round(sampleDirectionalMask(mask, caster, left + (x + 0.5) * step, top + (y + 0.5) * step, step) * 255));
  }
}
/** Blit only the supplied cohort; moving updates never touch the static arrays. */
export function blitReceiverCoverage(target: ReceiverCoverageChannels, items: readonly PreparedCaster[], bounds: ReceiverCoverageBounds): void {
  const { left, top, width, height, receiverHeight, step } = bounds;
  for (const item of items) {
    blitMask(target.sun, item.caster, item.sun, bounds); blitMask(target.moon, item.caster, item.moon, bounds);
    const caster = item.caster;
    if (!caster.contact || receiverHeight !== caster.baseHeightSubunits) continue;
    const f = caster.footprint;
    const minX = Math.max(0, Math.floor((caster.worldX + f.left - 1 - left) / step));
    const maxX = Math.min(width, Math.ceil((caster.worldX + f.right + 1 - left) / step));
    const minY = Math.max(0, Math.floor((caster.worldY + f.top - 1 - top) / step));
    const maxY = Math.min(height, Math.ceil((caster.worldY + f.bottom + 1 - top) / step));
    for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
      const index = y * width + x;
      target.contact[index] = Math.max(target.contact[index]!, Math.round(contactCoverage(caster, left + (x + 0.5) * step, top + (y + 0.5) * step, receiverHeight) * 255));
    }
  }
}
