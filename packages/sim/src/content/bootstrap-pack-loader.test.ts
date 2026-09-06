import { describe, expect, it } from 'vitest';
import { loadBootstrapPackDefinitions } from './bootstrap-pack-loader.js';
import { contentDefinitionsHash } from './registry.js';

describe('bootstrap content pack loader', () => {
  it('loads the complete committed pack deterministically through one parser boundary', () => {
    const definitions = loadBootstrapPackDefinitions();
    expect(definitions).toHaveLength(531);
    expect(new Set(definitions.map(({ id }) => id)).size).toBe(531);
    expect(contentDefinitionsHash(definitions).slice(0, 8)).toBe('dfdf555b');
    expect(Object.isFrozen(definitions)).toBe(true);
  });
});
