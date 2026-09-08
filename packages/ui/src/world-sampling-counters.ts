/** Opt-in submission counters. Only backend-owned world contexts participate;
 * HUD, page preparation and final presentation are excluded. */
export const WORLD_SAMPLING_COUNTER_IDS = ['draws', 'nonInteger', 'nearestNonInteger', 'smoothed', 'nonAxisAligned'] as const;
export type WorldSamplingCounts = Record<(typeof WORLD_SAMPLING_COUNTER_IDS)[number], number>;
const contexts = new WeakSet<object>();
export const worldSamplingProbe = { enabled: false, producer: 'direct-world', overflow: false,
  producers: new Map<string, WorldSamplingCounts>() };
export function registerWorldSamplingContext(context: object): void { contexts.add(context); }
export function unregisterWorldSamplingContext(context: object): void { contexts.delete(context); }
export function isWorldSamplingContext(context: object): boolean { return worldSamplingProbe.enabled && contexts.has(context); }
export function resetWorldSamplingCounters(): void {
  if (!worldSamplingProbe.enabled) return;
  for (const values of worldSamplingProbe.producers.values()) for (const id of WORLD_SAMPLING_COUNTER_IDS) values[id] = 0;
}
export function setWorldSamplingProducer(producer: string): string {
  const previous = worldSamplingProbe.producer;
  worldSamplingProbe.producer = producer;
  return previous;
}
function integerRatio(source: number, destination: number): boolean {
  source = Math.abs(source);
  if (!(source > 0 && destination > 0)) return false;
  const ratio = Math.max(source / destination, destination / source);
  return Number.isFinite(ratio) && Math.abs(ratio - Math.round(ratio)) < 1e-9;
}
export function countWorldSampling(context: object, sw: number, sh: number, dw: number, dh: number,
  a: number, b: number, c: number, d: number, smooth: boolean): void {
  if (!isWorldSamplingContext(context)) return;
  const name = worldSamplingProbe.producer;
  let counts = worldSamplingProbe.producers.get(name);
  if (!counts) {
    if (worldSamplingProbe.producers.size >= 64) { worldSamplingProbe.overflow = true; return; }
    counts = { draws: 0, nonInteger: 0, nearestNonInteger: 0, smoothed: 0, nonAxisAligned: 0 };
    worldSamplingProbe.producers.set(name, counts);
  }
  const nonInteger = !integerRatio(sw, Math.abs(dw) * Math.hypot(a, b))
    || !integerRatio(sh, Math.abs(dh) * Math.hypot(c, d));
  counts.draws++;
  if (nonInteger) { counts.nonInteger++; if (!smooth) counts.nearestNonInteger++; }
  if (smooth) counts.smoothed++;
  if (!((Math.abs(a) < 1e-9 && Math.abs(d) < 1e-9) || (Math.abs(b) < 1e-9 && Math.abs(c) < 1e-9))) counts.nonAxisAligned++;
}
