import { describe, expect, it, vi } from 'vitest';
import type { PixelUi } from '../../render/pixel-ui.js';
import type { UiSkin } from '../skin.js';
import {
  FANTASY_BUTTON_GLYPHS,
  FANTASY_BUTTON_SHAPES,
  FANTASY_BUTTON_TONES,
  FANTASY_ICON_CATALOG,
  FANTASY_ICON_CATALOG_COLUMNS,
  FANTASY_ICON_CATALOG_ROWS,
  FANTASY_ICON_FAMILIES,
  FantasyCanvasButton,
  fantasyButtonFrame,
  fantasyButtonGlyphFrame,
  fantasyButtonGlyphRect,
  fantasyButtonHoverGroup,
  fantasyIconCellIndex,
  fantasyIconFrameIndex,
} from './fantasy-controls.js';

describe('Cute Fantasy control families', () => {
  it('models colors as stable variants of the same three shapes', () => {
    expect(FANTASY_BUTTON_TONES).toHaveLength(9);
    expect(FANTASY_BUTTON_SHAPES).toEqual(['chamfered', 'square', 'pill']);
    expect(fantasyButtonFrame('peach', 'idle')).toEqual({ group: 'idle', variantIndex: 0 });
    expect(fantasyButtonFrame('red', 'pressed')).toEqual({ group: 'pressed', variantIndex: 5 });
    expect(fantasyButtonFrame('white', 'disabled')).toEqual({ group: 'disabled', variantIndex: 8 });
  });

  it('addresses every glyph and the authored hover-outline states', () => {
    expect(FANTASY_BUTTON_GLYPHS).toHaveLength(31);
    expect(fantasyButtonGlyphFrame('peach', 'cross')).toEqual({ group: 'palette_0', variantIndex: 16 });
    expect(fantasyButtonGlyphFrame('red', 'cross')).toEqual({ group: 'palette_11', variantIndex: 16 });
    expect(fantasyButtonHoverGroup('gold', 'pressed')).toBe('hover_gold_pressed');
    expect(fantasyButtonGlyphRect({ x: 10, y: 20, width: 64, height: 22 }, 'idle', true))
      .toEqual({ x: 14, y: 23, width: 16, height: 16 });
    expect(fantasyButtonGlyphRect({ x: 10, y: 20, width: 16, height: 16 }, 'pressed'))
      .toEqual({ x: 12, y: 23, width: 12, height: 12 });
  });

  it('keeps the whole 39×16 icon sheet addressable', () => {
    expect(FANTASY_ICON_CATALOG).toHaveLength(624);
    expect(FANTASY_ICON_CATALOG_COLUMNS).toBe(39);
    expect(FANTASY_ICON_CATALOG_ROWS).toBe(16);
    expect(fantasyIconCellIndex({ column: 0, row: 0 })).toBe(0);
    expect(fantasyIconCellIndex({ column: 38, row: 15 })).toBe(623);
    expect(fantasyIconCellIndex({ column: 99, row: 99 })).toBe(623);
  });

  it('cycles authored multi-level icons and keeps outline references in range', () => {
    const heart = FANTASY_ICON_FAMILIES.find((entry) => entry.id === 'heart')!;
    expect(fantasyIconFrameIndex(heart, 0)).toBe(0);
    expect(fantasyIconFrameIndex(heart, 200)).toBe(1);
    expect(fantasyIconFrameIndex(heart, 400)).toBe(2);
    expect(fantasyIconFrameIndex(heart, 600)).toBe(0);
    expect(fantasyIconFrameIndex(heart, 0, 2)).toBe(2);
    for (const family of FANTASY_ICON_FAMILIES) {
      expect(family.frames.every((frame) => frame >= 0 && frame < FANTASY_ICON_CATALOG.length)).toBe(true);
      if (family.outline !== undefined) expect(family.outline).toBeLessThan(FANTASY_ICON_CATALOG.length);
    }
    const mail = FANTASY_ICON_FAMILIES.find((entry) => entry.id === 'mail')!;
    expect(mail.frames).toEqual([fantasyIconCellIndex({ column: 14, row: 1 })]);
    expect(mail.outline).toBe(fantasyIconCellIndex({ column: 26, row: 1 }));
  });

  it('retains press feedback without changing the legacy button component', () => {
    const onPress = vi.fn();
    const button = new FantasyCanvasButton({
      id: 'fantasy.cross',
      skin: {} as UiSkin,
      fonts: {} as PixelUi,
      glyph: 'cross',
      onPress,
    });
    button.press(100);
    expect(onPress).toHaveBeenCalledOnce();
    button.enabled = false;
    button.press(200);
    expect(onPress).toHaveBeenCalledOnce();
  });
});
