import type { CelestialSource } from './celestial-lighting.js';
import { LightingNumericKey } from './lighting-numeric-key.js';

export interface DirectionalCaster {
  readonly owner: string | number;
  readonly worldX: number;
  readonly worldY: number;
  readonly baseHeightSubunits: number;
  readonly heightSubunits: number;
  readonly footprint: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  /** Frame-local clean body coverage. The foot is measured in that frame. */
  readonly silhouette?: { readonly width: number; readonly height: number; readonly opaque: Uint8Array; readonly anchorX: number; readonly anchorY: number };
  readonly contact: boolean;
}
export interface DirectionalShadowMask {
  readonly left: number; readonly top: number;
  readonly width: number; readonly height: number;
  readonly coverage: Uint8Array;
  /** Summed coverage supports constant-cost area sampling at any texel size. */
  readonly integral: Uint32Array;
}
export const directionalMaskBytes = (mask: DirectionalShadowMask | null): number => mask === null ? 0 : mask.coverage.byteLength + mask.integral.byteLength;
export const MAX_DIRECTIONAL_SHADOW_PIXELS = 192;
type Point = readonly [number, number];

/** Baked-shadow padding may extend below the visible trunk/feet. Ground the
 * caster on clean body coverage while leaving the artwork's draw anchor intact. */
export function groundedSpriteCaster(input: {
  readonly owner: string | number; readonly worldX: number; readonly worldY: number;
  readonly baseHeightSubunits: number; readonly pixelsPerHeightSubunit: number;
  readonly anchor: readonly [number, number];
  readonly mask: { readonly width: number; readonly height: number; readonly opaque: Uint8Array };
  readonly footprint: DirectionalCaster['footprint']; readonly contact: boolean;
}): DirectionalCaster | null {
  const last = input.mask.opaque.lastIndexOf(1);
  if (last < 0) return null;
  const bottom = Math.floor(last / input.mask.width) + 1;
  return { owner: input.owner, worldX: input.worldX, worldY: input.worldY + bottom - input.anchor[1],
    baseHeightSubunits: input.baseHeightSubunits, heightSubunits: Math.max(1, Math.round(bottom / input.pixelsPerHeightSubunit)),
    footprint: input.footprint, contact: input.contact,
    silhouette: { ...input.mask, anchorX: input.anchor[0], anchorY: bottom } };
}

/** Quantize geometry, not just its cache key, so identical keys are identical. */
export function directionalGeometryKey(source: CelestialSource): number | null {
  if (source.intensity <= 0 || source.altitude <= 0) return null;
  const heading = Math.round(Math.atan2(source.direction[1], source.direction[0]) * 180 / Math.PI);
  const altitude = Math.max(1, Math.round(source.altitude * 180 / Math.PI));
  return (heading + 180) * 181 + altitude;
}
export function directionalGeometry(source: CelestialSource) {
  const key = directionalGeometryKey(source);
  if (key === null) return null;
  const heading = Math.floor(key / 181) - 180, altitude = key % 181;
  const angle = heading * Math.PI / 180;
  return { key, x: -Math.cos(angle), y: -Math.sin(angle), tangent: Math.tan(altitude * Math.PI / 180) };
}

function fillPolygon(mask: DirectionalShadowMask, polygon: readonly Point[]): void {
  const minY = Math.max(mask.top, Math.floor(Math.min(...polygon.map((p) => p[1]))));
  const maxY = Math.min(mask.top + mask.height - 1, Math.ceil(Math.max(...polygon.map((p) => p[1]))));
  for (let y = minY; y <= maxY; y++) {
    const intersections: number[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5)) {
        intersections.push(a[0] + (y + 0.5 - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const start = Math.max(mask.left, Math.ceil(intersections[i]! - 0.5));
      const end = Math.min(mask.left + mask.width - 1, Math.floor(intersections[i + 1]! - 0.5));
      if (end >= start) mask.coverage.fill(255, (y - mask.top) * mask.width + start - mask.left, (y - mask.top) * mask.width + end - mask.left + 1);
    }
  }
}

/** Convex volume footprint swept between its base and top projection. */
function convexHull(points: readonly Point[]): Point[] {
  const ordered = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (list: readonly Point[]) => {
    const result: Point[] = [];
    for (const point of list) {
      while (result.length > 1 && cross(result[result.length - 2]!, result[result.length - 1]!, point) <= 0) result.pop();
      result.push(point);
    }
    result.pop(); return result;
  };
  return [...half(ordered), ...half(ordered.reverse())];
}

/** Project onto one logical receiver height. Higher caps cannot receive a
 * lower caster's shadow. Camera and screen projection never enter this math. */
export function projectDirectionalCaster(caster: DirectionalCaster, source: CelestialSource, receiverHeightSubunits: number, pixelsPerHeightSubunit: number): DirectionalShadowMask | null {
  const geometry = directionalGeometry(source);
  const topHeight = caster.baseHeightSubunits + caster.heightSubunits;
  if (geometry === null || caster.heightSubunits <= 0 || receiverHeightSubunits >= topHeight) return null;
  const offset = (height: number) => Math.min(MAX_DIRECTIONAL_SHADOW_PIXELS, Math.max(0, height - receiverHeightSubunits) * pixelsPerHeightSubunit / geometry.tangent);
  const project = (x: number, y: number, height: number): Point => [x + geometry.x * offset(height), y + geometry.y * offset(height)];
  const polygons: Point[][] = [];
  const body = caster.silhouette;
  if (body === undefined) {
    const f = caster.footprint;
    const corners: Point[] = [[f.left, f.top], [f.right, f.top], [f.right, f.bottom], [f.left, f.bottom]];
    polygons.push(convexHull(corners.flatMap(([x, y]) => [project(x, y, Math.max(receiverHeightSubunits, caster.baseHeightSubunits)), project(x, y, topHeight)])));
  } else {
    // A billboard body is a vertical ribbon with a one-pixel ground thickness.
    // Swept row spans preserve transparent gaps and avoid stretched pixel holes.
    const bodyHeight = Math.max(1, body.anchorY);
    for (let y = 0; y < Math.min(body.height, body.anchorY); y++) {
      const high = caster.baseHeightSubunits + (body.anchorY - y) / bodyHeight * caster.heightSubunits;
      const low = Math.max(receiverHeightSubunits, caster.baseHeightSubunits + (body.anchorY - y - 1) / bodyHeight * caster.heightSubunits);
      if (high <= receiverHeightSubunits) continue;
      for (let x = 0; x < body.width;) {
        if (!body.opaque[y * body.width + x]) { x++; continue; }
        const start = x;
        while (x < body.width && body.opaque[y * body.width + x]) x++;
        const left = start - body.anchorX, right = x - body.anchorX;
        polygons.push(convexHull([
          project(left, -0.5, high), project(right, -0.5, high),
          project(left, 0.5, high), project(right, 0.5, high),
          project(left, -0.5, low), project(right, -0.5, low),
          project(left, 0.5, low), project(right, 0.5, low),
        ]));
      }
    }
  }
  if (polygons.length === 0) return null;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const polygon of polygons) for (const [x, y] of polygon) {
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  left = Math.floor(left) - 2; top = Math.floor(top) - 2;
  const width = Math.max(1, Math.ceil(right) + 2 - left), height = Math.max(1, Math.ceil(bottom) + 2 - top);
  if (width * height > 1024 * 1024) throw new Error('directional_caster_mask_too_large');
  const mask = { left, top, width, height, coverage: new Uint8Array(width * height), integral: new Uint32Array((width + 1) * (height + 1)) };
  for (const polygon of polygons) fillPolygon(mask, polygon);
  const firm = mask.coverage.slice(), horizontal = new Uint8Array(width * height);
  // Small separable tent filter, built once with the geometry. Keep the origin
  // firm and gradually soften toward the tip; no per-frame Canvas blur pass.
  const weights = [1, 2, 3, 2, 1];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -2; k <= 2; k++) if (x + k >= 0 && x + k < width) sum += firm[y * width + x + k]! * weights[k + 2]!;
    horizontal[y * width + x] = Math.round(sum / 9);
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -2; k <= 2; k++) if (y + k >= 0 && y + k < height) sum += horizontal[(y + k) * width + x]! * weights[k + 2]!;
    const index = y * width + x;
    // Only the two-to-ten-pixel contact band uses the distance curve. Beyond
    // it the original clamp is exactly one; inside it the clamp is zero.
    // Half-integer texel centres cannot lie exactly on either circle.
    const dx = left + x + .5, dy = top + y + .5;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= 100) mask.coverage[index] = Math.round(sum / 9);
    else if (distanceSquared <= 4) mask.coverage[index] = firm[index]!;
    else {
      const blend = (Math.hypot(dx, dy) - 2) / 8;
      mask.coverage[index] = Math.round(firm[index]! * (1 - blend) + sum / 9 * blend);
    }
  }
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += mask.coverage[y * width + x]!;
      mask.integral[(y + 1) * (width + 1) + x + 1] = row + mask.integral[y * (width + 1) + x + 1]!;
    }
  }
  return mask;
}

/** Geometry cache is independent of camera, source intensity, and world foot.
 * Moving instances reuse the same local mask and translate it at sampling. */
export class DirectionalShadowCache {
  private readonly entries = new Map<number, { readonly signature: readonly number[]; readonly mask: DirectionalShadowMask | null }[]>();
  private readonly signature = new LightingNumericKey();
  private entryCount = 0;
  private identities = new WeakMap<object, number>();
  private identitySequence = 0;
  private bytesValue = 0;
  builds = 0;
  constructor(readonly budgetBytes = 8 * 1024 * 1024) {}
  get bytes(): number { return this.bytesValue; }
  get(caster: DirectionalCaster, source: CelestialSource, height: number, pixelsPerHeightSubunit: number): DirectionalShadowMask | null {
    const geometry = directionalGeometryKey(source);
    if (geometry === null) return null;
    const body = caster.silhouette;
    let id = 0;
    if (body !== undefined) {
      id = this.identities.get(body.opaque) ?? ++this.identitySequence;
      this.identities.set(body.opaque, id);
    }
    const f = caster.footprint;
    const key = this.signature.reset().add(id).add(body?.width ?? 0).add(body?.height ?? 0)
      .add(body?.anchorX ?? 0).add(body?.anchorY ?? 0).add(caster.heightSubunits)
      .add(height - caster.baseHeightSubunits).add(pixelsPerHeightSubunit).add(geometry)
      .add(f.left).add(f.top).add(f.right).add(f.bottom);
    const bucket = this.entries.get(key.hash);
    if (bucket !== undefined) for (const entry of bucket) if (key.matches(entry.signature)) {
      this.entries.delete(key.hash); this.entries.set(key.hash, bucket); return entry.mask;
    }
    const mask = projectDirectionalCaster(caster, source, height, pixelsPerHeightSubunit);
    const bytes = directionalMaskBytes(mask);
    if (bytes > this.budgetBytes) throw new Error('directional_shadow_budget_exceeded');
    while (this.bytesValue + bytes > this.budgetBytes || this.entryCount >= 4096) {
      const key = this.entries.keys().next().value;
      if (key === undefined) break;
      for (const entry of this.entries.get(key)!) { this.bytesValue -= directionalMaskBytes(entry.mask); this.entryCount--; }
      this.entries.delete(key);
    }
    const entry = { signature: key.copy(), mask };
    const current = this.entries.get(key.hash);
    if (current === undefined) this.entries.set(key.hash, [entry]); else current.push(entry);
    this.entryCount++; this.bytesValue += bytes; this.builds++;
    return mask;
  }
  reset(): void { this.entries.clear(); this.entryCount = 0; this.identities = new WeakMap(); this.identitySequence = 0; this.bytesValue = 0; this.builds = 0; }
}

export function sampleDirectionalMask(mask: DirectionalShadowMask | null, caster: DirectionalCaster, x: number, y: number, sampleSize = 1): number {
  if (mask === null) return 0;
  const localX = x - caster.worldX - mask.left, localY = y - caster.worldY - mask.top;
  const half = sampleSize / 2;
  if (localX + half <= 0 || localY + half <= 0 || localX - half >= mask.width || localY - half >= mask.height) return 0;
  // Bilinear evaluation of the prefix integral is the exact area integral of
  // piecewise-constant mask pixels, including fractional caster translation.
  const integralAt = (px: number, py: number): number => {
    const cx = Math.max(0, Math.min(mask.width, px)), cy = Math.max(0, Math.min(mask.height, py));
    const x0 = Math.floor(cx), y0 = Math.floor(cy), x1 = Math.min(mask.width, x0 + 1), y1 = Math.min(mask.height, y0 + 1);
    const fx = cx - x0, fy = cy - y0, stride = mask.width + 1, sums = mask.integral;
    return (sums[y0 * stride + x0]! * (1 - fx) + sums[y0 * stride + x1]! * fx) * (1 - fy)
      + (sums[y1 * stride + x0]! * (1 - fx) + sums[y1 * stride + x1]! * fx) * fy;
  };
  const area = integralAt(localX + half, localY + half) - integralAt(localX - half, localY + half)
    - integralAt(localX + half, localY - half) + integralAt(localX - half, localY - half);
  return Math.max(0, Math.min(1, area / (sampleSize * sampleSize * 255)));
}
