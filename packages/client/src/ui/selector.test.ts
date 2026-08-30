import { describe, expect, it } from 'vitest';
import {
  AUTHORED_SELECTOR_COUNT,
  authoredSelectorCellIndex,
} from './selector.js';

describe('authored selector family', () => {
  it('keeps every 4×20 source cell addressable and clamps unsafe input', () => {
    expect(AUTHORED_SELECTOR_COUNT).toBe(80);
    expect(authoredSelectorCellIndex({ column: 0, row: 0 })).toBe(0);
    expect(authoredSelectorCellIndex({ column: 3, row: 19 })).toBe(79);
    expect(authoredSelectorCellIndex({ column: 99, row: 99 })).toBe(79);
    expect(authoredSelectorCellIndex({ column: -4, row: -2 })).toBe(0);
  });
});
