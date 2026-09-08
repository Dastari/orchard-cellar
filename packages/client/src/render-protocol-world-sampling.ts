import { WORLD_SAMPLING_COUNTER_IDS, worldSamplingProbe } from '@orchard/ui';
import { protocolDistribution } from '@orchard/engine/render-protocol-buffer';

/** Allocated before warmup; at most64 producer groups and16,384 submitted
 * frames. Samples copy into fixed storage; the registry grows only when a
 * previously unseen producer group appears. */
export class ProtocolWorldSamplingBuffer {
  private readonly width = WORLD_SAMPLING_COUNTER_IDS.length;
  private readonly values: Uint32Array;
  private readonly names: string[] = [];
  private readonly indices = new Map<string, number>();
  private count = 0;
  constructor(readonly capacity = 16_384) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Invalid sampling capacity');
    this.values = new Uint32Array(capacity * 64 * this.width);
  }
  record(): void {
    if (worldSamplingProbe.overflow) throw new Error('render_protocol_world_sampling_overflow');
    if (this.count >= this.capacity) throw new Error('render_protocol_world_sampling_buffer_overflow');
    for (const [name, counts] of worldSamplingProbe.producers) {
      let index = this.indices.get(name);
      if (index === undefined) {
        if (this.names.length >= 64) throw new Error('render_protocol_world_sampling_producers_overflow');
        index = this.names.length; this.indices.set(name, index); this.names.push(name);
      }
      let offset = (index * this.capacity + this.count) * this.width;
      for (const id of WORLD_SAMPLING_COUNTER_IDS) this.values[offset++] = counts[id];
    }
    this.count++;
  }
  report() {
    return { supported: worldSamplingProbe.enabled, frameCount: this.count,
      scope: 'Backend-owned world drawImage submissions only; excludes HUD, presentation and CPU page construction. Painter identity prefixes, weather-depth, ground-cache and direct-world are producer groups. Direct-world is an explicitly unattributed remainder, never silently omitted.',
      ratioRule: 'Source/destination extent or its reciprocal is integral on each transformed axis; translation does not affect ratio. Non-axis-aligned transforms and smoothing are reported independently.',
      producers: Object.fromEntries(this.names.map((name, producer) => [name,
        Object.fromEntries(WORLD_SAMPLING_COUNTER_IDS.map((id, column) => {
          const values = Array.from({ length: this.count }, (_, frame) => this.values[(producer * this.capacity + frame) * this.width + column]!);
          return [id, { ...protocolDistribution(values), total: values.reduce((a, b) => a + b, 0) }];
        })),
      ])),
    };
  }
}
