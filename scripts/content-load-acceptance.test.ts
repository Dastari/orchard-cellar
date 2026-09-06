import { describe, expect, it } from 'vitest';
import {
  measurementDefinitions,
  requireDisposableMeasurementTarget,
  summarizeSamples,
} from './content-load-acceptance.js';

describe('content load acceptance safety and evidence helpers', () => {
  it('accepts only loopback disposable measurement databases', () => {
    expect(() => requireDisposableMeasurementTarget('http://127.0.0.1:3400', 'orchard-content-measure-a1b2c3')).not.toThrow();
    expect(() => requireDisposableMeasurementTarget('http://localhost:3400', 'orchard-content-measure-local01')).not.toThrow();
    expect(() => requireDisposableMeasurementTarget('https://orchard.dastari.net', 'orchard-content-measure-a1b2c3')).toThrow('content_measure_requires_loopback_host');
    expect(() => requireDisposableMeasurementTarget('http://127.0.0.1:3000', 'orchard-content-measure-a1b2c3')).toThrow('content_measure_rejects_live_authority_port');
    expect(() => requireDisposableMeasurementTarget('http://localhost', 'orchard-content-measure-a1b2c3')).toThrow('content_measure_rejects_live_authority_port');
    expect(() => requireDisposableMeasurementTarget('http://127.0.0.1:3400', 'orchard-cellar-world')).toThrow('content_measure_requires_disposable_database_name');
  });

  it('creates 1,000 unique valid balance definitions', () => {
    const definitions = measurementDefinitions();
    expect(definitions).toHaveLength(1_000);
    expect(new Set(definitions.map(({ id }) => id)).size).toBe(1_000);
    expect(JSON.parse(definitions[999]?.json ?? '')).toMatchObject({
      id: 'balance:measurement_0999',
      group: 'measurement.load_acceptance',
      value: 1_000,
    });
  });

  it('summarizes deterministic percentile and byte samples', () => {
    expect(summarizeSamples([4, 1, 3, 2, 5])).toMatchObject({
      samples: [1, 2, 3, 4, 5], min: 1, median: 3, p95: 5, max: 5, mean: 3, total: 15,
    });
  });
});
