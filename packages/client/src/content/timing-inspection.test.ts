import { expect, it, vi } from 'vitest';
import { TimingInspectionIndex } from './timing-inspection.js';
it('builds spatial buckets once per revision, not once per hover render', () => {
  const index = new TimingInspectionIndex<number>();
  const entries = vi.fn(function* () { for (let i = 0; i < 10_000; i++) yield { value: i,
    bounds: { left: i * 16, right: i * 16 + 16, top: 0, bottom: 16 } }; });
  for (let i = 0; i < 1_000; i++) expect(index.pick('one', entries, i * 16 + 8, 8)).toBe(i);
  expect(entries).toHaveBeenCalledTimes(1);
  expect(index.pick('two', entries, 8, 8)).toBe(0);
  expect(entries).toHaveBeenCalledTimes(2);
});
