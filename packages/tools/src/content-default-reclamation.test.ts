import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { bootstrapContentRegistry, bootstrapContentRows } from '@orchard/sim';

it('omits repeated common item quality while preserving the complete runtime catalog', () => {
  const source = JSON.parse(readFileSync(
    new URL('../../assets/content/items.json', import.meta.url), 'utf8',
  )) as readonly { readonly id: string; readonly quality?: string }[];
  expect(source.filter(definition => definition.quality === undefined).length).toBeGreaterThanOrEqual(200);
  expect(source.some(definition => definition.quality === 'common')).toBe(false);
  const runtime = [...bootstrapContentRegistry().items.values()];
  expect(runtime).toHaveLength(source.length);
  expect(runtime.filter(definition => definition.quality === 'common')).toHaveLength(213);
  expect(runtime.every(definition => Object.prototype.propertyIsEnumerable.call(definition, 'quality'))).toBe(true);
  const durableRows = bootstrapContentRows().filter(({ kind }) => kind === 'item');
  expect(durableRows).toHaveLength(source.length);
  expect(durableRows.filter(({ json }) => JSON.parse(String(json)).quality === undefined)).toHaveLength(213);
});
