import type { PointLight } from './lighting.js';

export interface WorldLightBounds { left: number; top: number; right: number; bottom: number }
export interface ReceiverDamageSource {
  readonly receiverRevision: number;
  /** null means every texel; an inverted rectangle means no changed texels. */
  receiverChangesSince(revision: number): WorldLightBounds | null;
}
export interface ReceiverLocalDamage {
  readonly source: ReceiverDamageSource;
  /** Logical ground Y minus projected lightmap Y at this receiver level. */
  readonly projection: number;
}

const HISTORY = 512, STRIDE = 15, MAX_LIGHTS = 4096;
const empty = (): WorldLightBounds => ({ left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
function clear(bounds: WorldLightBounds): void {
  bounds.left = bounds.top = Infinity; bounds.right = bounds.bottom = -Infinity;
}
function include(bounds: WorldLightBounds, values: Float64Array, offset: number): void {
  bounds.left = Math.min(bounds.left, values[offset]!);
  bounds.top = Math.min(bounds.top, values[offset + 1]!);
  bounds.right = Math.max(bounds.right, values[offset + 2]!);
  bounds.bottom = Math.max(bounds.bottom, values[offset + 3]!);
}

/** Damage is retained across returning camera windows. Snapshot raw light
 * inputs only on a real rebuild: another light can trigger a restamp while a
 * source moves within its quarter-pixel signature bucket. */
export class LocalLightDamage {
  private history = new Float64Array(0);
  private scratch = new Float64Array(0);
  private previous = new Float64Array(0);
  private previousCount = 0;
  private readonly changed = empty();
  private readonly result = empty();
  private latest = 0;
  private oldest = 1;
  get bytes(): number { return this.history.byteLength + this.previous.byteLength + this.scratch.byteLength; }

  reset(revision: number): void {
    if (this.previous.length) this.previous = new Float64Array(0);
    if (this.scratch.length) this.scratch = new Float64Array(0);
    if (this.history.length) this.history = new Float64Array(0);
    this.previousCount = 0; this.latest = revision; this.oldest = revision + 1;
  }
  rebuild(revision: number, lights: readonly PointLight[], left: number, top: number,
    width: number, height: number, allLights: boolean): void {
    if (lights.length > MAX_LIGHTS) { this.reset(revision); return; }
    if (this.scratch.length === 0) this.scratch = new Float64Array(STRIDE);
    if (lights.length * STRIDE > this.previous.length) {
      const next = new Float64Array(Math.ceil(lights.length / 32) * 32 * STRIDE);
      next.set(this.previous); this.previous = next;
    }
    clear(this.changed);
    let unbounded = false;
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i]!, v = this.scratch, offset = i * STRIDE;
      v[0] = light.worldX; v[1] = light.worldY;
      v[2] = light.receiverDirectionWorldY ?? light.worldY; v[3] = light.radiusTiles;
      v[4] = light.color.r; v[5] = light.color.g; v[6] = light.color.b;
      v[7] = light.strengthPerMille ?? 1000;
      v[8] = light.facing === 'up' ? 1 : light.facing === 'right' ? 2 : light.facing === 'down' ? 3 : light.facing === 'left' ? 4 : 0;
      v[9] = light.profile === 'flame' ? 1 : light.profile === 'pulse' ? 2 : 0;
      v[10] = light.elevationLayer ?? 0;
      // Match the flood's shifted/clamped texel origin and strength-dependent
      // reach, including fractional seeds and rounded neighbour distance cost.
      const dx = light.facing === 'right' ? 1 : light.facing === 'left' ? -1 : 0;
      const dy = light.facing === 'down' ? 1 : light.facing === 'up' ? -1 : 0;
      const x = left + (Math.max(0, Math.min(width - 1, (light.worldX - left) / 4 - .5 + dx)) + .5) * 4;
      const y = top + (Math.max(0, Math.min(height - 1, (light.worldY - top) / 4 - .5 + dy)) + .5) * 4;
      const radius = light.radiusTiles * 4, strength = Math.max(0, Math.min(1200, Math.round(v[7]!)));
      const reach = (Math.ceil(Math.max(radius, Math.round(Math.max(.25, radius) * 2) / 2) * strength / 1000) + 1) * 4;
      v[11] = x - reach; v[12] = y - reach; v[13] = x + reach; v[14] = y + reach;
      let different = allLights || i >= this.previousCount;
      for (let j = 0; j < STRIDE; j++) {
        if (!Number.isFinite(v[j])) unbounded = true;
        if (this.previous[offset + j] !== v[j]) different = true;
      }
      if (different) {
        if (i < this.previousCount) include(this.changed, this.previous, offset + 11);
        include(this.changed, v, 11);
      }
      this.previous.set(v, offset);
    }
    for (let i = lights.length; i < this.previousCount; i++) include(this.changed, this.previous, i * STRIDE + 11);
    this.previousCount = lights.length;
    // A changed window/occlusion map can alter every light, but cannot create
    // local RGB outside their old/new support. Keep those invalidations finite.
    this.record(revision, unbounded ? null : this.changed);
  }
  private record(revision: number, bounds: WorldLightBounds | null): void {
    if (this.history.length === 0) this.history = new Float64Array(HISTORY * 5);
    const offset = (revision % HISTORY) * 5;
    this.history[offset] = revision;
    this.history[offset + 1] = bounds?.left ?? -Infinity;
    this.history[offset + 2] = bounds?.top ?? -Infinity;
    this.history[offset + 3] = bounds?.right ?? Infinity;
    this.history[offset + 4] = bounds?.bottom ?? Infinity;
    this.latest = revision; this.oldest = Math.max(this.oldest, revision - HISTORY + 1);
  }
  since(revision: number): WorldLightBounds | null {
    clear(this.result);
    if (revision === this.latest) return this.result;
    if (!Number.isInteger(revision) || revision < this.oldest - 1 || revision > this.latest) return null;
    for (let next = revision + 1; next <= this.latest; next++) {
      const offset = (next % HISTORY) * 5;
      if (this.history[offset] !== next || this.history[offset + 1] === -Infinity) return null;
      include(this.result, this.history, offset + 1);
    }
    return this.result;
  }
}
