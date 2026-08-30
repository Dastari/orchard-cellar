import { describe, expect, it } from 'vitest';
import {
  HOMESTEAD_BUILD_PALETTE_ENTRIES,
  homesteadBuildPaletteBounds,
  homesteadBuildPaletteCells,
  homesteadUpgradePaletteCells,
} from './homestead-build-palette.js';

describe('homestead build palette layout', () => {
  it('keeps every buildable plus removal inside its panel', () => {
    const bounds = homesteadBuildPaletteBounds({ width: 640 });
    const cells = homesteadBuildPaletteCells(bounds);
    expect(cells).toHaveLength(HOMESTEAD_BUILD_PALETTE_ENTRIES.length + 1);
    for (const cell of cells) {
      expect(cell.x).toBeGreaterThanOrEqual(bounds.x);
      expect(cell.y).toBeGreaterThanOrEqual(bounds.y);
      expect(cell.x + cell.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(cell.y + cell.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
    for (const cell of homesteadUpgradePaletteCells(bounds)) {
      expect(cell.x).toBeGreaterThanOrEqual(bounds.x);
      expect(cell.y).toBeGreaterThanOrEqual(bounds.y);
      expect(cell.x + cell.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(cell.y + cell.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
  });
});
