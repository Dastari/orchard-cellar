export const CONTENT_LOAD_ROWS = 1_000;
export const CONTENT_LOAD_OBSERVERS = 20;
export const MODULE_REGISTRY_BUDGET_MS = 30;
export const BROWSER_REGISTRY_BUDGET_MS = 50;
export const CONTENT_TRANSACTION_BUDGET_MS = 1_000;
export const INITIAL_SUBSCRIPTION_BUDGET_BYTES = 500_000;

export interface WireCounter {
  inbound: number;
  outbound: number;
}

export interface SampleSummary {
  readonly samples: readonly number[];
  readonly min: number;
  readonly median: number;
  readonly p95: number;
  readonly max: number;
  readonly mean: number;
  readonly total: number;
}

export function requireDisposableMeasurementTarget(host: string, database: string): void {
  if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/?$/u.test(host)) {
    throw new Error('content_measure_requires_loopback_host');
  }
  const target = new URL(host);
  if ((target.port === '' && target.protocol === 'http:') || target.port === '3000') {
    throw new Error('content_measure_rejects_live_authority_port');
  }
  if (!/^orchard-content-measure-[a-z0-9][a-z0-9-]{5,48}$/u.test(database)) {
    throw new Error('content_measure_requires_disposable_database_name');
  }
}

export function summarizeSamples(values: readonly number[]): SampleSummary {
  if (values.length === 0) throw new Error('content_measure_requires_samples');
  const samples = values.map((value) => Math.round(value * 100) / 100).sort((a, b) => a - b);
  const at = (fraction: number): number => samples[Math.min(samples.length - 1, Math.ceil(samples.length * fraction) - 1)] ?? 0;
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    samples,
    min: samples[0] ?? 0,
    median: at(0.5),
    p95: at(0.95),
    max: samples.at(-1) ?? 0,
    mean: Math.round(total / samples.length * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

export function resetWireCounter(counter: WireCounter): void {
  counter.inbound = 0;
  counter.outbound = 0;
}

export function measurementDefinitions(count = CONTENT_LOAD_ROWS): readonly {
  readonly id: string;
  readonly kind: 'balance';
  readonly json: string;
}[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(4, '0');
    const definition = {
      id: `balance:measurement_${suffix}`,
      kind: 'balance' as const,
      schemaVersion: 1,
      group: 'measurement.load_acceptance',
      value: index + 1,
      unit: 'count',
      description: `Disposable load-acceptance row ${suffix}.`,
    };
    return { id: definition.id, kind: definition.kind, json: JSON.stringify(definition) };
  });
}
