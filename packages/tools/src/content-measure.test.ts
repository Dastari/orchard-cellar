import { describe, expect, it } from 'vitest';
import { CONTENT_INITIAL_PAYLOAD_BUDGET_BYTES, measureContentPack } from './content-measure.js';

describe('content pack measurement', () => {
  it('is deterministic and remains beneath the initial subscription envelope budget', () => {
    const first = measureContentPack();
    expect(measureContentPack()).toEqual(first);
    expect(first.definitionCount).toBeGreaterThan(287);
    expect(first.kindCount).toBeGreaterThanOrEqual(10);
    expect(first.rowEnvelopeJsonBytes).toBeLessThanOrEqual(CONTENT_INITIAL_PAYLOAD_BUDGET_BYTES);
    expect(first.averageRowEnvelopeBytes).toBeGreaterThan(0);
    expect(first.contentHash).toMatch(/^[0-9a-f]{8}$/u);
  });
});
