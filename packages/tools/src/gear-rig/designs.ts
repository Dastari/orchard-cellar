import { Raster } from './raster.js';
import type { Facing } from './rig.js';
import { WORN_OUTLINE, type Ramp } from './materials.js';

/**
 * Worn gear is authored in colour *roles*, never in final colours, so one design
 * renders in every material:
 *   `.` transparent   `o` outline
 *   `0`–`4` primary material ramp (deep → highlight)
 *   `A`–`E` accent ramp (trim, horns, crowns)
 *   `P`–`T` detail ramp (plumes, feathers, gems)
 */
export type RoleGrid = readonly string[];

export interface RoleRamps {
  readonly primary: Ramp;
  readonly accent: Ramp;
  readonly detail: Ramp;
}

export function paint(grid: RoleGrid, ramps: RoleRamps): Raster {
  const width = Math.max(...grid.map((row) => row.length));
  const out = new Raster(width, grid.length);
  grid.forEach((row, y) => {
    [...row].forEach((role, x) => {
      if (role === '.') return;
      if (role === 'o') return out.set(x, y, WORN_OUTLINE);
      const primary = '01234'.indexOf(role);
      if (primary >= 0) return out.set(x, y, ramps.primary[primary]!);
      const accent = 'ABCDE'.indexOf(role);
      if (accent >= 0) return out.set(x, y, ramps.accent[accent]!);
      const detail = 'PQRST'.indexOf(role);
      if (detail >= 0) return out.set(x, y, ramps.detail[detail]!);
      throw new Error(`Unknown role ${role}`);
    });
  });
  return out;
}

/** A role grid placed relative to the head anchor (top-left of the head box). */
export interface Part {
  readonly grid: RoleGrid;
  readonly dx: number;
  readonly dy: number;
}

export interface HeadDesign {
  readonly name: string;
  /** Closed helmets replace the hair layer entirely. */
  readonly hidesHair: boolean;
  /** Parts are drawn in order; the first part is usually the dome. */
  readonly parts: Readonly<Record<Facing, readonly Part[]>>;
}

// Closed dome: Kenmi's Plate_Helmet_1 silhouette without its horn stubs.
const DOME: Record<Facing, RoleGrid> = {
  down: [
    '...ooooooo...',
    '..o3333222o..',
    '.o334433222o.',
    '.o344433222o.',
    '.o344332212o.',
    '.o3ooo3ooo1o.',
    '.o3ooooooo1o.',
    '.o234ooo432o.',
    '.o222ooo221o.',
    '..oo2ooo2oo..',
    '....ooooo....',
  ],
  right: [
    '...ooooooo..',
    '..o3333222o.',
    '.o33443322o.',
    '.o34443222o.',
    '.o34433221o.',
    '.o33ooo21oo.',
    '.o33ooooooo.',
    '.o23344oo1o.',
    '.o22334oo1o.',
    '..o2233oo2o.',
    '...ooooooo..',
  ],
  up: [
    '...ooooooo...',
    '..o3333222o..',
    '.o334433222o.',
    '.o344433322o.',
    '.o344333322o.',
    '.o333333322o.',
    '.o333333222o.',
    '.o233332221o.',
    '.o222222211o.',
    '..oo22211oo..',
    '....ooooo....',
  ],
};

const dome = (facing: Facing): Part => ({ grid: DOME[facing], dx: 0, dy: 0 });

const HORNS_WIDE: RoleGrid = [
  'oo...............oo',
  'oEo.............oEo',
  'oEo.............oDo',
  'oDDo...........oDCo',
  '.oDDo.........oCCo.',
  '..oDCo.......oCBo..',
  '...oo.........oo...',
];
const HORNS_SIDE: RoleGrid = HORNS_WIDE.map((row) => row.slice(0, 9) + row.slice(10));

const WINGS_WIDE: RoleGrid = [
  'o...................o',
  'oo.................oo',
  'oTo...............oSo',
  'oTTo.............oSSo',
  'oSTTo...........oSSRo',
  '.oSTTo.........oSSRo.',
  'oRSSTT.........SSRRRo',
  '.oRSSo.........oRRQo.',
  '..oRRo.........oQQo..',
  '...oo...........oo...',
];
const WINGS_SIDE: RoleGrid = [
  'o.........o....',
  'oo........oo...',
  'oTo.......oSo..',
  'oTTo......oSSo.',
  'oSTTo.....oSSRo',
  '.oSTTo....oSRo.',
  'oRSSTT....SRRo.',
  '.oRSSo....oRQo.',
  '..oRRo.....oo..',
  '...oo..........',
];

const PLUME_FRONT: RoleGrid = [
  '..ooo..',
  '.oTSSo.',
  'oSTSRRo',
  'oSSRRQo',
  '.oSRQo.',
  '..oRo..',
];
const PLUME_SIDE: RoleGrid = [
  '..ooooo...',
  '.oTSSSSoo.',
  'oSTSSRRRRo',
  'oSSRRRQQQo',
  '.ooRRQQoo.',
  '...ooQo...',
];

const GILT: Record<Facing, RoleGrid> = {
  down: [
    '.............',
    '......E......',
    '......D......',
    '......D......',
    '......C......',
    '.............',
    '.............',
    '..CDE...EDC..',
    '..BCC...CCB..',
  ],
  right: [
    '............',
    '.....E......',
    '.....D......',
    '.....D......',
    '.....C......',
    '............',
    '............',
    '..CDEE......',
    '..BCDE......',
    '...BCD......',
  ],
  up: [
    '.............',
    '......E......',
    '......D......',
    '......D......',
    '......D......',
    '......C......',
    '......C......',
    '......C......',
    '..BCCCCCCBB..',
  ],
};

const CROWN_FRONT: RoleGrid = [
  'o....o....o',
  'oo..oEo..oo',
  'oDo.oDo.oCo',
  'oDDoDTDoDCo',
  'oEDDDDDDCBo',
  'oDDSDDDSCBo',
  'ooooooooooo',
];
const CROWN_SIDE: RoleGrid = [
  'o...o...o.',
  'oo.oEo..oo',
  'oDooDo.oCo',
  'oDDoTDoDCo',
  'oEDDDDDCBo',
  'oDSDDDSCBo',
  'oooooooooo',
];
const CROWN_BACK: RoleGrid = [
  'o....o....o',
  'oo..oDo..oo',
  'oDo.oDo.oCo',
  'oDDoDDDoDCo',
  'oEDDDDDDCBo',
  'oDDDDDDDCBo',
  'ooooooooooo',
];

const perFacing = (build: (facing: Facing) => readonly Part[]): Record<Facing, readonly Part[]> => ({
  down: build('down'),
  right: build('right'),
  up: build('up'),
});

export const HEAD_DESIGNS: readonly HeadDesign[] = [
  {
    name: 'greathelm',
    hidesHair: true,
    parts: perFacing((facing) => [dome(facing)]),
  },
  {
    name: 'horned_warhelm',
    hidesHair: true,
    parts: perFacing((facing) => [
      { grid: facing === 'right' ? HORNS_SIDE : HORNS_WIDE, dx: -3, dy: -4 },
      dome(facing),
    ]),
  },
  {
    name: 'winged_helm',
    hidesHair: true,
    parts: perFacing((facing) => [
      { grid: facing === 'right' ? WINGS_SIDE : WINGS_WIDE, dx: facing === 'right' ? -3 : -4, dy: -5 },
      dome(facing),
      { grid: GILT[facing], dx: 0, dy: 0 },
    ]),
  },
  {
    name: 'plumed_greathelm',
    hidesHair: true,
    parts: perFacing((facing) => [
      facing === 'right' ? { grid: PLUME_SIDE, dx: -1, dy: -5 } : { grid: PLUME_FRONT, dx: 3, dy: -5 },
      dome(facing),
      { grid: GILT[facing], dx: 0, dy: 0 },
    ]),
  },
  {
    name: 'gilded_helm',
    hidesHair: true,
    parts: perFacing((facing) => [dome(facing), { grid: GILT[facing], dx: 0, dy: 0 }]),
  },
  {
    name: 'royal_crown',
    hidesHair: false,
    parts: perFacing((facing) => [
      facing === 'right'
        ? { grid: CROWN_SIDE, dx: 1, dy: -5 }
        : { grid: facing === 'up' ? CROWN_BACK : CROWN_FRONT, dx: 1, dy: -5 },
    ]),
  },
];

/** Shoulder guards sit on top of each visible arm blob (from the hands layer). */
export const PAULDRON: RoleGrid = [
  '.ooo.',
  'oEDCo',
  'oDCBo',
  '.ooo.',
];

/**
 * Capes hang from the shoulders. Facing down they sit behind the body and only
 * the edges and hem show; facing up they cover the back (under the hair or
 * helmet); facing right they trail behind. `A`–`E` is the hem trim.
 */
export const CAPE: Readonly<Record<Facing, Part & { readonly layer: 'behind' | 'over' }>> = {
  down: {
    layer: 'behind',
    dx: 0,
    dy: 8,
    grid: [
      '..ooooooooo..',
      '.o322222221o.',
      'o33222222211o',
      'o33222222211o',
      'o33222222211o',
      'o33222222211o',
      'oEDDDDDDDDCBo',
      '.ooooooooooo.',
    ],
  },
  up: {
    layer: 'over',
    dx: 1,
    dy: 8,
    grid: [
      '..ooooooo..',
      '.o3432221o.',
      'o334322211o',
      'o332322121o',
      'o332322121o',
      'o322322121o',
      'oEDDDDDDCBo',
      '.ooooooooo.',
    ],
  },
  right: {
    layer: 'behind',
    dx: -2,
    dy: 8,
    grid: [
      '....ooo.',
      '...o32o.',
      '..o332o.',
      '.o33221o',
      'o332221o',
      'o332211o',
      'oEDDDCBo',
      '.oooooo.',
    ],
  },
};

/** Facing down, a cape shows as drapes over both shoulders fastened by a clasp. */
export const CAPE_DRAPE: Part = {
  dx: 1,
  dy: 9,
  grid: [
    '.oo.......oo.',
    'o33o.oEo.o21o',
    '.oo...o...oo.',
  ],
};
