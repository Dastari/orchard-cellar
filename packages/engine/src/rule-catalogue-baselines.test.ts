import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import baseline from './rule-catalogue-baselines.json' with { type: 'json' };
import { ruleBaselineOutputs } from './rule-catalogue-baselines.js';

describe(`pre-migration resolver golden baselines (${baseline.source})`, () => {
  const outputs = ruleBaselineOutputs(baseline.assetNames);
  it('keeps the entire baseline inventory', () => {
    expect(Object.keys(outputs)).toEqual(Object.keys(baseline.hashes));
  });
  for (const [family, expected] of Object.entries(baseline.hashes)) it(family, () => {
    expect(createHash('sha256').update(JSON.stringify(outputs[family])).digest('hex')).toBe(expected);
  });
});
