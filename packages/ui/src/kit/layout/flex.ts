import { layoutUiFlex, type UiAxisSizing } from '../../design-system/layout.js';
import type { UiRect } from '../../geometry.js';
import type { UiElement } from '../runtime/element.js';
import { uiResolveDimension, type UiDimension, type UiStyle } from './box.js';

function sizing(dimension: UiDimension | undefined, natural: number, min: number, max: number, weight?: number): UiAxisSizing | undefined {
  if (dimension === undefined) return undefined;
  if (typeof dimension === 'object') return dimension.mode === 'fixed' ? { mode: 'fixed', size: Math.max(min, Math.min(max, dimension.size)) } : { ...dimension, min, max };
  return { mode: dimension, preferred: natural, min, max, ...(dimension === 'grow' ? { weight: weight ?? 1 } : {}) };
}
export function uiLayoutFlex(bounds: UiRect, children: readonly UiElement[], style: UiStyle): UiRect[] {
  const row = style.direction !== 'column';
  return layoutUiFlex(bounds, children.map((node) => {
    const size = node.measured.preferred, s = node.style;
    const main = row ? s.width : s.height, cross = row ? s.height : s.width;
    const mainMin = uiResolveDimension(row ? s.minWidth : s.minHeight, row ? bounds.width : bounds.height, 0);
    const crossMin = uiResolveDimension(row ? s.minHeight : s.minWidth, row ? bounds.height : bounds.width, 0);
    return { minSize: { width: row ? mainMin : size.width, height: row ? size.height : mainMin },
      basis: uiResolveDimension(s.basis, row ? bounds.width : bounds.height, row ? size.width : size.height),
      main: sizing(main, main === 'grow' ? uiResolveDimension(s.basis, row ? bounds.width : bounds.height, 0) : row ? size.width : size.height, mainMin,
        uiResolveDimension(row ? s.maxWidth : s.maxHeight, row ? bounds.width : bounds.height, Infinity), s.grow),
      cross: sizing(cross, row ? size.height : size.width, crossMin,
        uiResolveDimension(row ? s.maxHeight : s.maxWidth, row ? bounds.height : bounds.width, Infinity)),
      grow: s.grow, shrink: s.shrink ?? (style.overflow === 'scroll' || style.overflow === (row ? 'scroll-x' : 'scroll-y') ? 0 : undefined), alignSelf: s.alignSelf };
  }), { direction: style.direction, gap: style.gap, align: style.align, justify: style.justify, wrap: style.wrap });
}
