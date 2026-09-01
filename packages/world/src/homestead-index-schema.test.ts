import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { emptyTickUpdateCounters, recordTickRowTouch } from './scalability.js';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

function functionSource(name: string): string {
  const start = source.indexOf(`function ${name}(`);
  const next = source.indexOf('\nfunction ', start + 1);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return source.slice(start, next < 0 ? source.length : next);
}

describe('docs/53 T2 indexed homestead lookups', () => {
  it('uses the primary key and residence index without scanning in homesteadForSpace', () => {
    const lookup = functionSource('homesteadForSpace');
    expect(lookup).toContain('homestead.spaceId.find(spaceId)');
    expect(lookup).toContain('homestead.by_residence_space.filter(spaceId)');
    expect(lookup).toContain('spaceId === 0');
    expect(lookup).toContain('homestead.by_residence_space.filter(spaceId - 1)');
    expect(lookup).not.toContain('homestead.iter()');
  });

  it('keeps the topside tent pass but primary-key bounds non-topside collision', () => {
    const collision = functionSource('collisionForSpace');
    expect(collision).toContain('spaceId === TOPSIDE_SPACE_ID');
    expect(collision).toContain('homestead.spaceId.find(spaceId)');
    expect(collision.match(/homestead\.iter\(\)/g)).toHaveLength(1);
  });

  it('reduces a 128-homestead occupied-space tick from 256 row touches to at most 4', () => {
    const before = emptyTickUpdateCounters();
    recordTickRowTouch(before, undefined, 128 * 2);
    const after = emptyTickUpdateCounters();
    recordTickRowTouch(after, undefined, 3 + 1);
    expect(before.rowsTouched).toBe(256);
    expect(after.rowsTouched).toBe(4);
  });
});
