/** Compact windows retain the actionable controls and the complete footer. */
export function compactVideoRows(contentHeight: number): boolean { return contentHeight < 160; }
export function videoRowHeight(contentHeight: number): number {
  return Math.max(8, Math.min(27, Math.floor((contentHeight - 40) / (compactVideoRows(contentHeight) ? 4 : 9))));
}
