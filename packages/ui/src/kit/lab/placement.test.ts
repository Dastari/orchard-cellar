import { expect, it } from 'vitest';
import { UI_LAB_SPECIMENS } from './registry.js';
import { UI_LAB_DISTRICTS, uiLabPlacements } from './placement.js';
import { UI_LAB_WORLD } from './camera.js';
import type { UiRect } from '../../geometry.js';
const overlaps = (a: UiRect, b: UiRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
it('keeps every specimen and code card separate, including across district boundaries', () => {
  const rectangles = uiLabPlacements(UI_LAB_SPECIMENS).flatMap(({ specimen, rect, code }) => [{ id: specimen.id, rect }, { id: `${specimen.id}:code`, rect: code }]);
  for (const [index, first] of rectangles.entries()) {
    expect(first.rect.x + first.rect.width, first.id).toBeLessThanOrEqual(UI_LAB_WORLD.width);
    expect(first.rect.y + first.rect.height, first.id).toBeLessThanOrEqual(UI_LAB_WORLD.height);
    for (const second of rectangles.slice(index + 1)) expect(overlaps(first.rect, second.rect), `${first.id} overlaps ${second.id}`).toBe(false);
    for (const [district, rect] of Object.entries(UI_LAB_DISTRICTS)) expect(overlaps(first.rect, { ...rect, width: 1400, height: 64 }), `${first.id} overlaps ${district} heading`).toBe(false);
  }
});
