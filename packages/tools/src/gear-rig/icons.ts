import { resolve } from 'node:path';
import { MATERIALS, MATERIAL_ICON_COLUMN, type MaterialName, type Ramp } from './materials.js';
import { Raster } from './raster.js';

export type IconSheet = 'weapons' | 'armor' | 'tools' | 'treasure';

const SHEET_FILES: Record<IconSheet, string> = {
  weapons: 'Cute_Fantasy_Icons_Weapons/16x16/Weapons_all_16x16.png',
  armor: 'Cute_Fantasy_Icons_Armor/16x16/Armor_all_16x16.png',
  tools: 'Cute_Fantasy_Icons_Tools/16x16/Tools_all_16x16.png',
  treasure: 'Cute_Fantasy_Icons_Treasure&Keys/16x16/Treasure&Keys_all_16x16.png',
};

/** Ivory/bone ramp built from Kenmi's warm highlights (for bone and horn trims). */
export const BONE: Ramp = ['#5d2c28', '#8a4836', '#e4a672', '#ead4aa', '#fff7d2'];

/** A premium icon reference: sheet row (shape) in a material column. */
export interface IconRef {
  readonly sheet: IconSheet;
  readonly row: number;
  readonly material: MaterialName;
  /** Staff head: recolour the (iron) head ramp into this gem material and gild the collar. */
  readonly staffHead?: MaterialName;
  /** Replace the icon's own material ramp with another ramp (bespoke legendary finishes). */
  readonly finish?: Ramp;
}

export class IconLibrary {
  private constructor(private readonly sheets: Readonly<Record<IconSheet, Raster>>) {}

  static async load(iconRoot: string): Promise<IconLibrary> {
    const entries = await Promise.all(
      (Object.keys(SHEET_FILES) as IconSheet[]).map(async (sheet) => [sheet, await Raster.load(resolve(iconRoot, SHEET_FILES[sheet]))] as const),
    );
    return new IconLibrary(Object.fromEntries(entries) as Record<IconSheet, Raster>);
  }

  rows(sheet: IconSheet): number {
    return this.sheets[sheet].height / 16;
  }

  raw(sheet: IconSheet, row: number, column: number): Raster {
    return this.sheets[sheet].crop(column * 16, row * 16, 16, 16);
  }

  icon(ref: IconRef): Raster {
    if (ref.staffHead) {
      // Staffs are Kenmi mace/torch silhouettes with a gem head: the iron head ramp
      // becomes the gem ramp, the silver collar becomes gold, and a glint is added.
      const gem = MATERIALS[ref.staffHead];
      const iron = MATERIALS.iron;
      const map = new Map<string, string>([
        [iron[4], gem[4]], [iron[3], gem[3]], [iron[2], gem[2]], [iron[1], gem[1]], [iron[0], gem[0]],
        ['#8b9bb4', MATERIALS.gold[2]], ['#5a6988', MATERIALS.gold[1]],
      ]);
      const out = this.raw(ref.sheet, ref.row, MATERIAL_ICON_COLUMN.iron).recolor(map);
      return out;
    }
    const icon = this.raw(ref.sheet, ref.row, MATERIAL_ICON_COLUMN[ref.material]);
    if (!ref.finish) return icon;
    const own = MATERIALS[ref.material];
    return icon.recolor(new Map(own.map((color, index) => [color, ref.finish![index]!] as const)));
  }

  /**
   * Ornateness of an icon shape, measured in the iron column: accent pixels (gold,
   * gems, trims outside the iron and wood ramps) count triple, plus overall
   * silhouette area. Within a family, higher scores go to rarer items.
   */
  ornateness(sheet: IconSheet, row: number): number {
    const icon = this.raw(sheet, row, MATERIAL_ICON_COLUMN.iron);
    const plain = new Set<string>([...MATERIALS.iron, '#000000', '#8a4836', '#bf6f4a', '#e69c69', '#8b9bb4', '#5a6988']);
    let area = 0;
    let accent = 0;
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const color = icon.hex(x, y);
        if (!color) continue;
        area += 1;
        if (!plain.has(color)) accent += 1;
      }
    }
    return accent * 3 + area / 4;
  }
}
