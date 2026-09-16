import { expect, it } from 'vitest';
import { EquipmentTooltipDwell, equipmentTooltipRect } from './equipment-tooltip.js';

it('keeps brief hover to a name and resets details when leaving or changing the item', () => {
  const dwell = new EquipmentTooltipDwell();
  expect(dwell.ready('bow', 0)).toBe(false);
  expect(dwell.ready('bow', 599)).toBe(false);
  expect(dwell.ready('bow', 600)).toBe(true);
  expect(dwell.ready(null, 700)).toBe(false);
  expect(dwell.ready('bow', 800)).toBe(false);
  expect(dwell.ready('sword', 1500)).toBe(false);
});

it.each([200, 390, 700])('keeps expanded details above the label/hotbar at viewport width %s', width => {
  const anchor = { x: 10, y: 120, width: 100, height: 16 };
  const rect = equipmentTooltipRect(width, anchor, 390, 200);
  expect(rect.y).toBeGreaterThanOrEqual(4);
  expect(rect.x).toBeGreaterThanOrEqual(4);
  expect(rect.x + rect.width).toBeLessThanOrEqual(width - 4);
  expect(rect.y + rect.height).toBeLessThanOrEqual(anchor.y - 4);
});
