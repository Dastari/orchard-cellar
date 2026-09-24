import type { RgbColor } from './lighting.js';
import type { PreparedCaster, ReceiverCoverageBounds, ReceiverCoverageChannels } from './receiver-coverage.js';

/** A moving body's ground shadow at native pixel resolution. RGB holds the
 * multiply factor that turns the already-lit ground into its shadowed value;
 * alpha is zero wherever the actor casts nothing. Offsets are whole pixels
 * from the rounded anchor, so the shape never re-samples while an actor walks. */
export interface ActorShadowStamp {
  anchorX: number; anchorY: number;
  offsetX: number; offsetY: number;
  width: number; height: number;
  /** Pooled storage; only the first width * height * 4 bytes are current. */
  pixels: Uint8ClampedArray<ArrayBuffer>;
  /** Changes whenever the current bytes change; drawers re-upload on change. */
  revision: number;
  signature: unknown[];
}
export interface ActorShadowSky { readonly diffuse: RgbColor; readonly sun: RgbColor; readonly moon: RgbColor }
interface Box { left: number; top: number; right: number; bottom: number; items: PreparedCaster[] }

const CONTACT_LOSS = 0.18;
let stampRevision = 0;

function casterBox(item: PreparedCaster, receiverHeight: number): Box | null {
  const { caster } = item;
  const x = Math.round(caster.worldX), y = Math.round(caster.worldY);
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const mask of [item.sun, item.moon]) {
    if (mask === null) continue;
    left = Math.min(left, x + mask.left); top = Math.min(top, y + mask.top);
    right = Math.max(right, x + mask.left + mask.width); bottom = Math.max(bottom, y + mask.top + mask.height);
  }
  if (caster.contact && receiverHeight === caster.baseHeightSubunits) {
    const f = caster.footprint;
    const radiusX = (f.right - f.left) / 2 + 1, radiusY = (f.bottom - f.top) / 2 + 1;
    const centerX = x + (f.left + f.right) / 2, centerY = y + (f.top + f.bottom) / 2;
    left = Math.min(left, Math.floor(centerX - radiusX)); right = Math.max(right, Math.ceil(centerX + radiusX));
    top = Math.min(top, Math.floor(centerY - radiusY)); bottom = Math.max(bottom, Math.ceil(centerY + radiusY));
  }
  return left < right && top < bottom ? { left, top, right, bottom, items: [item] } : null;
}

/** Overlapping bodies share one stamp, so their shadows merge by maximum
 * coverage exactly like the static field instead of multiplying twice. */
function cluster(boxes: Box[]): Box[] {
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      if (a.left >= b.right || b.left >= a.right || a.top >= b.bottom || b.top >= a.bottom) continue;
      a.left = Math.min(a.left, b.left); a.top = Math.min(a.top, b.top);
      a.right = Math.max(a.right, b.right); a.bottom = Math.max(a.bottom, b.bottom);
      a.items.push(...b.items); boxes.splice(j, 1); merged = true; break;
    }
  }
  return boxes;
}

function bilinear(channel: Uint8Array | Uint8ClampedArray, bounds: ReceiverCoverageBounds, x: number, y: number, stride: number, offset: number): number {
  const fx = Math.max(0, Math.min(bounds.width - 1, (x - bounds.left) / bounds.step - 0.5));
  const fy = Math.max(0, Math.min(bounds.height - 1, (y - bounds.top) / bounds.step - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(bounds.width - 1, x0 + 1), y1 = Math.min(bounds.height - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0, w = bounds.width;
  const a = channel[(y0 * w + x0) * stride + offset]!, b = channel[(y0 * w + x1) * stride + offset]!;
  const c = channel[(y1 * w + x0) * stride + offset]!, d = channel[(y1 * w + x1) * stride + offset]!;
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

function sameSignature(stamp: ActorShadowStamp | undefined, signature: readonly unknown[]): boolean {
  if (stamp === undefined || stamp.signature.length !== signature.length) return false;
  for (let i = 0; i < signature.length; i++) if (!Object.is(stamp.signature[i], signature[i])) return false;
  return true;
}

/** Resolve moving shadows against the retained static field. Each pixel is
 * the ratio between the maximum-light resolve with and without the actor, so
 * local light still fills an actor shadow and a body already inside a tree's
 * shadow does not darken it twice. `pool` is reused and returned trimmed. */
export function buildActorShadowStamps(input: {
  readonly casters: readonly PreparedCaster[];
  readonly receiverHeight: number;
  readonly bounds: ReceiverCoverageBounds;
  readonly coverage: ReceiverCoverageChannels;
  /** Plane local RGB, four bytes per coverage cell. */
  readonly local: Uint8ClampedArray;
  readonly sky: ActorShadowSky;
  /** Anything else that changes the output bytes (field and RGB revisions). */
  readonly context: readonly unknown[];
  readonly pool: ActorShadowStamp[];
}): ActorShadowStamp[] {
  const { casters, receiverHeight, bounds, coverage, local, sky, pool } = input;
  const boxes: Box[] = [];
  const planeRight = bounds.left + bounds.width * bounds.step, planeBottom = bounds.top + bounds.height * bounds.step;
  for (const item of casters) {
    const box = casterBox(item, receiverHeight);
    if (box === null) continue;
    box.left = Math.max(box.left, Math.floor(bounds.left)); box.top = Math.max(box.top, Math.floor(bounds.top));
    box.right = Math.min(box.right, Math.ceil(planeRight)); box.bottom = Math.min(box.bottom, Math.ceil(planeBottom));
    if (box.left < box.right && box.top < box.bottom) boxes.push(box);
  }
  const clusters = cluster(boxes);
  for (let index = 0; index < clusters.length; index++) {
    const box = clusters[index]!, first = box.items[0]!.caster;
    const anchorX = Math.round(first.worldX), anchorY = Math.round(first.worldY);
    const signature: unknown[] = [box.left, box.top, box.right, box.bottom, ...input.context];
    for (const item of box.items) {
      const c = item.caster, f = c.footprint;
      signature.push(item.sun, item.moon, Math.round(c.worldX), Math.round(c.worldY), c.contact, c.baseHeightSubunits,
        f.left, f.top, f.right, f.bottom);
    }
    let stamp = pool[index];
    const reuse = sameSignature(stamp, signature);
    const width = box.right - box.left, height = box.bottom - box.top;
    if (stamp === undefined) {
      stamp = { anchorX: 0, anchorY: 0, offsetX: 0, offsetY: 0, width: 0, height: 0,
        pixels: new Uint8ClampedArray(width * height * 4), revision: 0, signature: [] };
      pool[index] = stamp;
    }
    // The drawn anchor follows the actor's interpolated feet, independently of
    // whether its pixel content needs to change.
    stamp.anchorX = first.worldX; stamp.anchorY = first.worldY;
    stamp.offsetX = box.left - anchorX; stamp.offsetY = box.top - anchorY;
    if (reuse) continue;
    if (stamp.pixels.length < width * height * 4) stamp.pixels = new Uint8ClampedArray(width * height * 4);
    stamp.width = width; stamp.height = height; stamp.signature = signature; stamp.revision = ++stampRevision;
    const pixels = stamp.pixels;
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
      const worldX = box.left + px, worldY = box.top + py, out = (py * width + px) * 4;
      let sunA = 0, moonA = 0, contactA = 0;
      for (const item of box.items) {
        const c = item.caster, x = Math.round(c.worldX), y = Math.round(c.worldY);
        const sun = item.sun, moon = item.moon;
        if (sun !== null) {
          const mx = worldX - x - sun.left, my = worldY - y - sun.top;
          if (mx >= 0 && my >= 0 && mx < sun.width && my < sun.height) sunA = Math.max(sunA, sun.coverage[my * sun.width + mx]!);
        }
        if (moon !== null) {
          const mx = worldX - x - moon.left, my = worldY - y - moon.top;
          if (mx >= 0 && my >= 0 && mx < moon.width && my < moon.height) moonA = Math.max(moonA, moon.coverage[my * moon.width + mx]!);
        }
        if (c.contact && receiverHeight === c.baseHeightSubunits) {
          const f = c.footprint;
          const distance = Math.hypot((worldX + 0.5 - x - (f.left + f.right) / 2) / Math.max(1, (f.right - f.left) / 2 + 1),
            (worldY + 0.5 - y - (f.top + f.bottom) / 2) / Math.max(1, (f.bottom - f.top) / 2 + 1));
          contactA = Math.max(contactA, Math.max(0, Math.min(1, (1 - distance) / 0.4)) * 255);
        }
      }
      pixels[out + 3] = 0;
      if (sunA === 0 && moonA === 0 && contactA === 0) continue;
      const sampleX = worldX + 0.5, sampleY = worldY + 0.5;
      const sunS = bilinear(coverage.sun, bounds, sampleX, sampleY, 1, 0);
      const moonS = bilinear(coverage.moon, bounds, sampleX, sampleY, 1, 0);
      const contactS = bilinear(coverage.contact, bounds, sampleX, sampleY, 1, 0);
      const litT = 1 - contactS / 255 * CONTACT_LOSS, shadowT = 1 - Math.max(contactS, contactA) / 255 * CONTACT_LOSS;
      const litSun = 1 - sunS / 255, shadowSun = 1 - Math.max(sunS, sunA) / 255;
      const litMoon = 1 - moonS / 255, shadowMoon = 1 - Math.max(moonS, moonA) / 255;
      let darkens = false;
      for (let channel = 0; channel < 3; channel++) {
        const key = channel === 0 ? 'r' : channel === 1 ? 'g' : 'b';
        const localLight = bilinear(local, bounds, sampleX, sampleY, 4, channel);
        const lit = Math.max(sky.diffuse[key] * litT, sky.sun[key] * litSun * litT, sky.moon[key] * litMoon * litT, localLight);
        const shadowed = Math.max(sky.diffuse[key] * shadowT, sky.sun[key] * shadowSun * shadowT, sky.moon[key] * shadowMoon * shadowT, localLight);
        const factor = lit <= 0 ? 255 : Math.round(Math.min(1, shadowed / lit) * 255);
        pixels[out + channel] = factor;
        darkens ||= factor < 255;
      }
      if (darkens) pixels[out + 3] = 255;
    }
  }
  pool.length = clusters.length;
  return pool;
}
