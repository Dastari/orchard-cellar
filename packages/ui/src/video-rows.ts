import { worldBackendStatus } from './world-backend-setting.js';

/** Compact windows retain the actionable controls and the complete footer. */
export function compactVideoRows(contentHeight: number): boolean { return contentHeight < 160; }
export function videoRowHeight(contentHeight: number): number {
  const reserved = worldBackendStatus().fallbackReason === null ? 40 : 56;
  return Math.max(8, Math.min(27, Math.floor((contentHeight - reserved) / (compactVideoRows(contentHeight) ? 3 : 8))));
}
