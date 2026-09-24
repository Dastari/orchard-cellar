/**
 * Material ramps shared by the Kenmi premium icons and the modular worn layers.
 * Index 0 is the deepest shade and 4 the highlight. Each premium icon sheet column
 * is one material; the worn Plate_* layers use indices 1–4 of the same ramps.
 */
export const MATERIALS = {
  silver: ['#424c6e', '#5a6988', '#8b9bb4', '#c0cbdc', '#ffffff'],
  iron: ['#2a2f4e', '#424c6e', '#6c7c9d', '#8e9ab4', '#c0cbdc'],
  bronze: ['#522d28', '#743f39', '#b86f50', '#e4a672', '#ead4aa'],
  gold: ['#8e251d', '#dd5a08', '#feae34', '#fee761', '#fff7d2'],
  jade: ['#134c4c', '#1e6f50', '#33984b', '#5ac54f', '#d3fc7e'],
  frost: ['#00396d', '#0069aa', '#0098dc', '#00cdf9', '#94fdff'],
  ember: ['#8e251d', '#c64524', '#ed7614', '#ffa214', '#ffeb57'],
  ruby: ['#571c27', '#891e2b', '#c42430', '#f5555d', '#f8a0a6'],
  amethyst: ['#3003d9', '#7a09fa', '#db3ffd', '#f389f5', '#fdd2ed'],
  obsidian: ['#272727', '#3d3d3d', '#5d5d5d', '#858585', '#b4b4b4'],
} as const satisfies Record<string, readonly [string, string, string, string, string]>;

export type MaterialName = keyof typeof MATERIALS;
export type Ramp = readonly [string, string, string, string, string];

/** Premium icon sheet column for each material (Armor and Weapons sheets). */
export const MATERIAL_ICON_COLUMN: Readonly<Record<MaterialName, number>> = {
  silver: 0, iron: 1, bronze: 2, gold: 3, jade: 4, frost: 5, ember: 6, ruby: 7, amethyst: 8, obsidian: 9,
};

/** Outline used by every worn Cute Fantasy layer (icons use pure black). */
export const WORN_OUTLINE = '#0e071b';

/** Map a worn layer authored in `from` onto `to`, ramp index for ramp index. */
export function rampSwap(from: Ramp, to: Ramp): Map<string, string> {
  return new Map(from.map((color, index) => [color, to[index]!] as const));
}
