import type { UiRect } from '../../geometry.js';
import type { UiLabDistrict, UiLabSpecimen } from './registry.js';
const MIGRATION_LANE_WIDTH = 1800;
export const UI_LAB_DISTRICTS: Readonly<Record<UiLabDistrict, UiRect>> = {
  inventory: { x: 40, y: 7800, width: 5000, height: 2400 }, books: { x: 5300, y: 7800, width: 4000, height: 2200 }, 'frame-designer': { x: 5300, y: 10300, width: 4000, height: 3000 },
  forms: { x: 5900, y: 40, width: 3000, height: 2800 }, patterns: { x: 5900, y: 3100, width: 3000, height: 2900 }, feedback: { x: 5900, y: 6200, width: 3000, height: 1400 },
  foundations: { x: 40, y: 40, width: 1500, height: 620 }, frames: { x: 40, y: 740, width: 2300, height: 1180 },
  controls: { x: 40, y: 2020, width: 2300, height: 500 }, actors: { x: 40, y: 3130, width: 2400, height: 1000 },
  playground: { x: 3100, y: 40, width: 1400, height: 1000 }, migration: { x: 9500, y: 40, width: MIGRATION_LANE_WIDTH * 3, height: 8000 },
  authored: { x: 40, y: 4400, width: 5000, height: 3000 },
};
export interface UiLabPlacement { readonly specimen: UiLabSpecimen; readonly rect: UiRect; readonly code: UiRect }
export function uiLabPlacements(specimens: readonly UiLabSpecimen[]): UiLabPlacement[] {
  const migrationHeights = [0, 0, 0], placements: UiLabPlacement[] = [];
  const offsets = new Map<UiLabDistrict, { x: number; y: number; height: number }>();
  for (const specimen of specimens) {
    const district = UI_LAB_DISTRICTS[specimen.district], offset = offsets.get(specimen.district) ?? { x: 0, y: 0, height: 0 };
    const size = specimen.size === 'content' ? { width: 640, height: 420 } : specimen.size;
    const lane = migrationHeights.indexOf(Math.min(...migrationHeights));
    if (specimen.district === 'migration') { offset.x = lane * MIGRATION_LANE_WIDTH; offset.y = migrationHeights[lane]!; offset.height = 0; }
    else if (offset.x && offset.x + size.width + 640 > district.width) { offset.x = 0; offset.y += offset.height + 80; offset.height = 0; }
    const rect = { x: district.x + offset.x, y: district.y + offset.y + 80, ...size };
    placements.push({ specimen, rect, code: { x: rect.x + size.width + 24, y: rect.y, width: 560, height: size.height } });
    if (specimen.district === 'migration') migrationHeights[lane] = offset.y + size.height + 80;
    offset.x += size.width + 640; offset.height = Math.max(offset.height, size.height); offsets.set(specimen.district, offset);
  }
  return placements;
}
