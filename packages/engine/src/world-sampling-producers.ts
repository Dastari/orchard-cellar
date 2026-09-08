import { setWorldSamplingProducer, worldSamplingProbe } from '@orchard/ui';
import type { WorldDepthItem } from './renderer.js';
const producers = new WeakMap<object, string>();
/** Stable identity prefixes retain the original producer labels without
 * collecting entity IDs or allocating a label on every submitted frame. */
export function drawSamplingWorldItem(item: WorldDepthItem): void {
  if (!worldSamplingProbe.enabled) { item.draw(); return; }
  const identity = item.sortIdentity ?? item;
  let producer = producers.get(identity);
  if (producer === undefined) {
    const name = item.sortIdentity?.debug ?? item.debugTie ?? String(item.tie);
    const separator = name.indexOf(':');
    producer = separator < 0 ? 'legacy-depth-item' : name.slice(0, separator);
    producers.set(identity, producer);
  }
  const previous = setWorldSamplingProducer(producer);
  try { item.draw(); } finally { setWorldSamplingProducer(previous); }
}

export function drawSamplingWeatherRange(draw: (low: number, high: number) => number, low: number, high: number): number {
  if (!worldSamplingProbe.enabled) return draw(low, high);
  const previous = setWorldSamplingProducer('weather-depth');
  try { return draw(low, high); } finally { setWorldSamplingProducer(previous); }
}
