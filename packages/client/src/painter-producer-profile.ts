import { protocolDistribution } from '@orchard/engine/render-protocol-buffer';

export const PAINTER_PRODUCER_IDS = [
  'setup', 'decorations', 'resources', 'projectiles', 'placeables', 'npcs', 'players',
] as const;
export type PainterProducerId = typeof PAINTER_PRODUCER_IDS[number];
let active: PainterProducerProfile | null = null;

/** Opt-in attribution of the completed painter frame. No per-frame allocations;
 * the permanent wrapper adds one null check per producer while disabled. */
export class PainterProducerProfile {
  private readonly current = new Float64Array(PAINTER_PRODUCER_IDS.length);
  private readonly values: Float64Array;
  private count = 0;
  private began = false;
  constructor(readonly capacity = 16_384) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Invalid painter profile capacity');
    this.values = new Float64Array(capacity * PAINTER_PRODUCER_IDS.length);
  }
  begin(): void { this.current.fill(0); this.began = true; }
  add(index: number, duration: number): void { this.current[index] = this.current[index]! + duration; }
  record(): void {
    if (!this.began) throw new Error('painter_profile_frame_not_started');
    if (this.count === this.capacity) throw new Error('painter_profile_overflow');
    this.values.set(this.current, this.count++ * PAINTER_PRODUCER_IDS.length);
    this.began = false;
  }
  report() {
    return { frames: this.count, scope: 'wall-clock producer durations in completed active-rAF samples; opt-in timing overhead is included; main input/result transfers are outside these intervals',
      producers: PAINTER_PRODUCER_IDS.map((id, index) => ({ id,
        ...protocolDistribution(Array.from({ length: this.count }, (_, row) => this.values[row * PAINTER_PRODUCER_IDS.length + index]!)) })),
    };
  }
}

export function profilePainterProducer<I, R>(id: PainterProducerId, build: (input: I) => R): (input: I) => R {
  const index = PAINTER_PRODUCER_IDS.indexOf(id);
  return function profiledPainterProducer(input: I): R {
    const profile = active;
    if (profile === null) return build(input);
    if (index === 0) profile.begin();
    const start = performance.now();
    try { return build(input); }
    finally { profile.add(index, performance.now() - start); }
  };
}

export function installPainterProducerProfile() {
  if (active !== null) throw new Error('painter_profile_already_installed');
  const profile = new PainterProducerProfile();
  active = profile;
  return { record: () => profile.record(), report: () => profile.report(),
    dispose() { if (active === profile) active = null; } };
}
