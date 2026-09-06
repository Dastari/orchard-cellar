/** Reusable numeric signature scratch space. Buckets compare the full tuple,
 * so a hash collision can never alias distinct lighting geometry. */
export class LightingNumericKey {
  private readonly values: number[] = [];
  private readonly bits = new DataView(new ArrayBuffer(8));
  private length = 0;
  hash = 2166136261;
  reset(): this { this.length = 0; this.hash = 2166136261; return this; }
  add(value: number): this {
    this.values[this.length++] = value;
    this.bits.setFloat64(0, value);
    this.hash = Math.imul(this.hash ^ this.bits.getUint32(0), 16777619) >>> 0;
    this.hash = Math.imul(this.hash ^ this.bits.getUint32(4), 16777619) >>> 0;
    return this;
  }
  matches(values: readonly number[]): boolean {
    if (values.length !== this.length) return false;
    for (let i = 0; i < this.length; i++) if (!Object.is(values[i], this.values[i])) return false;
    return true;
  }
  copy(): readonly number[] { return this.values.slice(0, this.length); }
  copyInto(target: number[]): void {
    for (let i = 0; i < this.length; i++) target[i] = this.values[i]!;
    target.length = this.length;
  }
}

/** Stable identities are assigned on first use, never formatted in hot paths. */
export class LightingIdentities {
  private readonly strings = new Map<string, number>();
  private objects = new WeakMap<object, number>();
  private sequence = 0;
  get(value: string | number | object | undefined): number {
    if (value === undefined) return 0;
    if (typeof value === 'number') return value;
    // Separate branches keep WeakMap's object key contract visible to TS.
    if (typeof value === 'string') {
      let id = this.strings.get(value);
      if (id === undefined) {
        if (this.strings.size >= 4096) throw new Error('lighting_identity_budget_exceeded');
        id = ++this.sequence; this.strings.set(value, id);
      }
      return id;
    }
    let id = this.objects.get(value);
    if (id === undefined) { id = ++this.sequence; this.objects.set(value, id); }
    return id;
  }
  reset(): void { this.strings.clear(); this.objects = new WeakMap(); this.sequence = 0; }
}
