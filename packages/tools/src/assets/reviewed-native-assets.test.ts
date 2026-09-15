import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import expected from './fixtures/reviewed-native-assets.json' with { type: 'json' };
import { workspaceRoot } from './load.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, entry]) => [key, canonical(entry)]));
  }
  return value;
}

// Public CI cannot read the original licensed vendor sheets. Pin the reviewed
// imported pixels AND provenance/placement metadata instead. Updating these
// fingerprints requires running the original-source tests on the licensed host.
it('preserves the reviewed native imports independently of private vendor sheets', async () => {
  expect(Object.keys(expected).length).toBeGreaterThan(100);
  for (const [path, hash] of Object.entries(expected)) {
    const source: unknown = JSON.parse(await readFile(new URL(path, workspaceRoot), 'utf8'));
    expect(createHash('sha256').update(JSON.stringify(canonical(source))).digest('hex'), path).toBe(hash);
  }
});
