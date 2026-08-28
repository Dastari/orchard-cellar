import { describe, expect, it } from 'vitest';
import { questTrackerBounds } from './quest-tracker.js';

describe('quest tracker layout', () => {
  it('stays against the right edge and collapses to its header', () => {
    const model = {
      width: 480,
      entries: [{
        id: 'book',
        title: 'A Very Important Book',
        complete: false,
        objectives: ['0/1 Pick up the book'],
      }],
    } as const;
    const expanded = questTrackerBounds(model, false);
    const collapsed = questTrackerBounds(model, true);
    expect(expanded.x + expanded.width).toBe(472);
    expect(expanded.height).toBeGreaterThan(collapsed.height);
    expect(collapsed.height).toBe(12);
    expect(expanded.width).toBe(170);
  });
});
