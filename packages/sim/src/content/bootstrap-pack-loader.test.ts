import { describe, expect, it } from 'vitest';
import { loadBootstrapPackDefinitions } from './bootstrap-pack-loader.js';
import { contentDefinitionsHash } from './registry.js';

describe('bootstrap content pack loader', () => {
  it('loads the complete committed pack deterministically through one parser boundary', () => {
    const definitions = loadBootstrapPackDefinitions();
    expect(definitions).toHaveLength(921);
    expect(new Set(definitions.map(({ id }) => id)).size).toBe(921);
    expect(contentDefinitionsHash(definitions).slice(0, 8)).toBe('0e741b0f');
    expect(Object.isFrozen(definitions)).toBe(true);
  });
});
