import type { UiRect } from './geometry.js';

/** A brief hover shows only the item name; deliberate inspection adds details. */
export class EquipmentTooltipDwell {
  private key: string | null = null;
  private startedAt = 0;
  ready(key: string | null, now: number): boolean {
    if (key !== this.key) { this.key = key; this.startedAt = now; }
    return key !== null && now - this.startedAt >= 600;
  }
}

export function equipmentTooltipRect(
  viewportWidth: number, anchor: UiRect, width: number, height: number,
): UiRect {
  const boundedWidth = Math.max(0, Math.min(width, viewportWidth - 8));
  const boundedHeight = Math.max(0, Math.min(height, anchor.y - 8));
  return {
    x: Math.max(4, Math.round((viewportWidth - boundedWidth) / 2)),
    y: Math.max(4, anchor.y - boundedHeight - 4),
    width: boundedWidth, height: boundedHeight,
  };
}
