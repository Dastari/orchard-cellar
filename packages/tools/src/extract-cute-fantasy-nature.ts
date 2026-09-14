import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource, FrameKind } from './assets/types.js';

type Region = readonly [number, number, number, number];

interface Extract {
  readonly name: string;
  readonly source: string;
  readonly frames: readonly Region[];
  readonly fps: number;
  readonly transparentTopLeft?: boolean;
  /** Recolour an authored overlay through two layout-identical reference
   * sheets. This is used for the grass ledge blob: the pack ships the complete
   * 47-neighbour overlay once, while Grass_Tiles_2..4 ship the same grass
   * pixels with variant palettes. The most frequent same-coordinate colour
   * correspondence preserves the authored pixels without inventing frames. */
  readonly paletteRemap?: {
    readonly from: string;
    readonly to: string;
  };
  readonly category?: 'props' | 'trees' | 'tiles';
  readonly size?: readonly [number, number];
  readonly anchor?: readonly [number, number];
  readonly animation?: string;
  readonly frameKind?: FrameKind;
  readonly tags?: readonly string[];
  readonly placement?: AssetSource['placement'];
}

const decorRoot = 'references/art/kenmi/cute-fantasy/core/Outdoor decoration/Outdoor_Decor_Animations';
const waterRoot = `${decorRoot}/Water_Decor_Animations`;
const strip = (count: number, y = 0): readonly Region[] => Array.from(
  { length: count }, (_, frame): Region => [frame * 16, y, 16, 16],
);
const sheet = (columns: number, rows: number): readonly Region[] => Array.from(
  { length: rows }, (_, row) => Array.from(
    { length: columns }, (_unused, column): Region => [column * 16, row * 16, 16, 16],
  ),
).flat();
const framesFromSheet = (
  columns: number,
  frames: readonly number[],
): readonly Region[] => frames.map((frame) => [
  (frame % columns) * 16,
  Math.floor(frame / columns) * 16,
  16,
  16,
]);

/** Convex and one-diagonal-open cells from the pack author's canonical blob
 * preview. The coordinates are selected by neighbour role, not row-major
 * proximity: see build/cute-fantasy-catalog/blob47-recipes.json. */
const grassLedgeBlobFrames: readonly Region[] = framesFromSheet(7, [
  24, 3, 20,
  21, 11,
  44, 29, 40,
  26, 10, 22, 25,
]);
const structuralTerrain = {
  tags: ['terrain.cliff', 'terrain.structural', 'variant.sheet'],
  placement: {
    layer: 'ground', footprint: [1, 1], blocksMovement: true, builderAvailable: false,
  },
} as const;
const surfaceTerrain = {
  tags: ['terrain.surface', 'variant.sheet'],
  placement: {
    layer: 'ground', footprint: [1, 1], blocksMovement: false, builderAvailable: false,
  },
} as const;

const extracts: Extract[] = [];
extracts.push(
  {
    name: 'prop_cf_farm_hay_bale', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Outdoor decoration/Hay_Bales.png',
    frames: [[0, 0, 16, 16]], fps: 1, size: [16, 16], anchor: [8, 15],
    animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_farm_hay_stack', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Outdoor decoration/Hay_Bales.png',
    frames: [[16, 0, 32, 16]], fps: 1, size: [32, 16], anchor: [16, 15],
    animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_farm_potted_flowers', category: 'props',
    source: `${decorRoot}/Flower_Animations/Potted/Flowers_4_Potted_Anim.png`,
    frames: strip(6, 6 * 16), fps: 4, size: [16, 16], anchor: [8, 15],
    animation: 'sway', frameKind: 'animation',
  },
  {
    name: 'prop_cf_farm_grave', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Outdoor decoration/Outdoor_Decor.png',
    frames: [[64, 160, 16, 16]], fps: 1, size: [16, 16], anchor: [8, 15],
    animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_fence_horizontal', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Outdoor decoration/Fence_Big.png',
    frames: [[32, 0, 16, 16]], fps: 1, size: [16, 16], anchor: [8, 15],
    animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_fence_vertical', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Outdoor decoration/Fence_Big.png',
    frames: [[0, 0, 16, 16]], fps: 1, size: [16, 16], anchor: [8, 15],
    animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_fence_corner', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Outdoor decoration/Fence_Big.png',
    frames: [[16, 0, 16, 16]], fps: 1, size: [16, 16], anchor: [8, 15],
    animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_fence_left_end', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Outdoor decoration/Fence_Big.png',
    frames: [[48, 0, 16, 16]], fps: 1, size: [16, 16], anchor: [8, 15],
    animation: 'base', frameKind: 'state',
  },
);
extracts.push(
  {
    name: 'tile_cf_interior_wall', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/core/Buildings/Houses_Interiors/Interior_Walls.png',
    frames: [[48, 0, 16, 16]], fps: 1, animation: 'base', frameKind: 'state',
  },
  {
    name: 'tile_cf_cave_floor', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/core/Tiles/Cave/Cave_Floor_1.png',
    // Full 3×5 floor-transition grammar: a 2×2 diagonal set followed by the
    // 3×3 plain-to-rock ring (whose centre is the dense rock tile).
    frames: Array.from({ length: 5 }, (_, row) => (
      Array.from({ length: 3 }, (_unused, column) => [column * 16, row * 16, 16, 16] as const)
    )).flat(), fps: 1,
    animation: 'base', frameKind: 'variant',
  },
  {
    name: 'tile_cf_cave_floor_2', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/core/Tiles/Cave/Cave_Floor_2.png',
    frames: Array.from({ length: 5 }, (_, row) => (
      Array.from({ length: 3 }, (_unused, column) => [column * 16, row * 16, 16, 16] as const)
    )).flat(), fps: 1,
    animation: 'base', frameKind: 'variant',
  },
  {
    name: 'tile_cf_cave_floor_decoration', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/core/Tiles/Cave/Cave_Floor_Decoration.png',
    frames: strip(3), fps: 1,
    animation: 'base', frameKind: 'variant',
  },
  {
    name: 'tile_cf_cave_floor_middle', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/core/Tiles/Cave/Cave_Floor_Middle.png',
    frames: [[0, 0, 16, 16]], fps: 1, animation: 'base', frameKind: 'state',
  },
  {
    name: 'tile_cf_cave_wall', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/core/Tiles/Cave/Cave_Walls.png',
    // Preserve the complete authored 7x8 topology. The upper rows contain
    // cap/inside corners; rows 6-7 are the projected front wall faces.
    frames: Array.from({ length: 8 }, (_, row) => (
      Array.from({ length: 7 }, (_unused, column) => [column * 16, row * 16, 16, 16] as const)
    )).flat(),
    fps: 1, animation: 'base', frameKind: 'variant', ...structuralTerrain,
  },
  {
    name: 'tile_cf_cave_floor_ladder', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/core/Tiles/Cave/Cave_Floor_Ladder.png',
    frames: [[0, 0, 16, 16]], fps: 1, animation: 'base', frameKind: 'state',
    tags: ['terrain.transition.ladder'], placement: surfaceTerrain.placement,
  },
  {
    name: 'tile_cf_basic_cliff', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/free/Tiles/Cliff_Tile.png',
    frames: sheet(3, 6), fps: 1, animation: 'base', frameKind: 'variant', ...structuralTerrain,
  },
  ...([1, 2, 3, 4] as const).map((variant): Extract => ({
    name: variant === 1 ? 'tile_cf_stone_cliff_variants' : `tile_cf_stone_cliff_${variant}`,
    category: 'tiles',
    source: `references/art/kenmi/cute-fantasy/core/Tiles/Cliff/Stone_Cliff_${variant}_Tile.png`,
    frames: sheet(14, 6), fps: 1, animation: 'base', frameKind: 'variant', ...structuralTerrain,
  })),
  ...([1, 2, 3, 4] as const).map((variant): Extract => ({
    name: `tile_cf_stone_cliff_${variant}_inverse_overlay`,
    category: 'tiles',
    source: `references/art/kenmi/cute-fantasy/core/Tiles/Cliff/Stone_Cliff_${variant}_Tile.png`,
    // The authored 2x2 inverse-corner quartet is separate from the main
    // 3-wide cliff bank and carries each stone variant's own tint.
    frames: [[5 * 16, 1 * 16, 16, 16], [6 * 16, 1 * 16, 16, 16],
      [5 * 16, 2 * 16, 16, 16], [6 * 16, 2 * 16, 16, 16]],
    fps: 1, animation: 'base', frameKind: 'variant', ...structuralTerrain,
  })),
  ...([1, 2, 3, 4] as const).map((variant): Extract => ({
    name: `prop_cf_stone_cliff_${variant}_cave_entrance`, category: 'props',
    source: `references/art/kenmi/cute-fantasy/core/Tiles/Cliff/Stone_Cliff_${variant}_Cave_Entrance.png`,
    frames: [[0, 0, 48, 48]], fps: 1, size: [48, 48], anchor: [24, 47],
    animation: 'base', frameKind: 'state',
    tags: ['terrain.cliff.doorway'],
    placement: { layer: 'object', footprint: [3, 3], blocksMovement: true, builderAvailable: false },
  })),
  ...([1, 2, 3] as const).map((variant): Extract => ({
    name: `tile_cf_desert_cliff${variant === 1 ? '' : `_${variant}`}`, category: 'tiles',
    source: `references/art/kenmi/cute-fantasy/desert/Tiles/Desert_Cliff_Tiles_${variant}.png`,
    frames: sheet(13, 11), fps: 1, animation: 'base', frameKind: 'variant', ...structuralTerrain,
  })),
  ...([1, 2, 3] as const).map((variant): Extract => ({
    name: `tile_cf_desert_waterfall_${variant}`, category: 'tiles',
    source: `references/art/kenmi/cute-fantasy/desert/Tiles/Desert_Cliff_Waterfall_${variant}.png`,
    frames: sheet(18, variant === 1 ? 6 : 5), fps: 1, animation: 'base', frameKind: 'variant',
    tags: ['terrain.transition.waterfall'], placement: surfaceTerrain.placement,
  })),
  {
    name: 'tile_cf_shroomlands_cliff', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/shroomlands/Tiles/ShroomLands_Cliff_Tiles.png',
    frames: sheet(9, 12), fps: 1, animation: 'base', frameKind: 'variant', ...structuralTerrain,
  },
  {
    name: 'tile_cf_shroomlands_waterfall', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/shroomlands/Tiles/ShroomLands_Cliff_Waterfall.png',
    frames: sheet(18, 5), fps: 1, animation: 'base', frameKind: 'variant',
    tags: ['terrain.transition.waterfall'], placement: surfaceTerrain.placement,
  },
  {
    name: 'tile_cf_volcanic_cliff', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/volcano/Tiles/Volcano_Tiles.png',
    // Raised 3-wide rim/wall/foot bank, followed by the four authored inverse
    // corners from the volcanic rock ring. Keep unrelated floors and stairs
    // out of this semantic asset.
    frames: [
      ...Array.from({ length: 5 }, (_, row) => Array.from(
        { length: 3 }, (_unused, column) => [(11 + column) * 16, row * 16, 16, 16] as const,
      )).flat(),
      [1 * 16, 6 * 16, 16, 16], [3 * 16, 6 * 16, 16, 16],
      [1 * 16, 8 * 16, 16, 16], [3 * 16, 8 * 16, 16, 16],
    ],
    fps: 1, animation: 'base', frameKind: 'variant', ...structuralTerrain,
  },
  {
    name: 'tile_cf_volcanic_interior_wall', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/volcano/Tiles/Volcano_Tiles.png',
    // Compact interior edge/face bank plus the matching inverse corners. This
    // deliberately differs from the outdoor extraction above.
    frames: [
      ...Array.from({ length: 5 }, (_, row) => Array.from(
        { length: 3 }, (_unused, column) => [(22 + column) * 16, row * 16, 16, 16] as const,
      )).flat(),
      [1 * 16, 6 * 16, 16, 16], [3 * 16, 6 * 16, 16, 16],
      [1 * 16, 8 * 16, 16, 16], [3 * 16, 8 * 16, 16, 16],
    ],
    fps: 1, animation: 'base', frameKind: 'variant', ...structuralTerrain,
  },
  {
    name: 'tile_cf_volcanic_lavafall', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/volcano/Tiles/Volcano_Lavafall.png',
    frames: sheet(54, 5), fps: 1, animation: 'base', frameKind: 'variant',
    tags: ['terrain.transition.waterfall'], placement: surfaceTerrain.placement,
  },
  {
    name: 'tile_cf_dungeon_1_wall', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/dungeons/Dungeon_1/Dungeon_1.png',
    frames: sheet(13, 13), fps: 1, animation: 'base', frameKind: 'variant', ...structuralTerrain,
  },
  {
    name: 'tile_cf_dungeon_2_wall', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/dungeons/Dungeon_2/Dungeon_2.png',
    frames: sheet(13, 12), fps: 1, animation: 'base', frameKind: 'variant', ...structuralTerrain,
  },
  {
    name: 'tile_cf_rogue_volcanic_floor', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/volcano/Tiles/Volcano_Tiles.png',
    // Repeat the authored 3x3 stone field as one composition instead of
    // stamping one visibly directional cell across the whole room.
    frames: Array.from({ length: 3 }, (_, row) => Array.from(
      { length: 3 }, (_unused, column) => [(column + 1) * 16, row * 16, 16, 16] as const,
    )).flat(),
    fps: 1, animation: 'base', frameKind: 'variant', ...surfaceTerrain,
  },
  {
    name: 'tile_cf_rogue_volcanic_wall', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/volcano/Tiles/Volcano_Tiles.png',
    // The compact blocked-room substrate is a distinct masonry bank; never
    // duplicate the open floor's rects here.
    frames: Array.from({ length: 3 }, (_, row) => Array.from(
      { length: 3 }, (_unused, column) => [(column + 22) * 16, row * 16, 16, 16] as const,
    )).flat(),
    fps: 1, animation: 'base', frameKind: 'variant', ...structuralTerrain,
  },
  {
    name: 'tile_cf_rogue_volcanic_lava', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/volcano/Volcano_Props/Volcano_Rocks.png',
    // Self-contained ember vents read correctly when hazards are isolated.
    frames: [[64, 0, 16, 16], [80, 0, 16, 16], [96, 0, 16, 16], [112, 0, 16, 16]],
    fps: 1, animation: 'base', frameKind: 'variant',
  },
  {
    name: 'tile_cf_rogue_dungeon_floor', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/dungeons/Dungeon_1/Dungeon_1.png',
    // The upper-right 3x3 field is the authored repeatable blue-brick floor.
    frames: Array.from({ length: 3 }, (_, row) => Array.from(
      { length: 3 }, (_unused, column) => [(column + 10) * 16, row * 16, 16, 16] as const,
    )).flat(),
    fps: 1, animation: 'base', frameKind: 'variant', ...surfaceTerrain,
  },
  {
    name: 'tile_cf_rogue_dungeon_wall', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/dungeons/Dungeon_1/Dungeon_1.png',
    // The dark 3x3 masonry family supplies the continuous blocked substrate.
    frames: Array.from({ length: 3 }, (_, row) => Array.from(
      { length: 3 }, (_unused, column) => [(column + 4) * 16, row * 16, 16, 16] as const,
    )).flat(),
    fps: 1, animation: 'base', frameKind: 'variant', ...structuralTerrain,
  },
  {
    name: 'prop_cf_trapdoor', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Tiles/Cave/Cave_Floor_Ladder.png',
    frames: [[0, 0, 16, 16]], fps: 1, animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_cellar_ladder', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Other/Ladder.png',
    frames: [[0, 0, 16, 48]], fps: 1, size: [16, 48], anchor: [8, 47],
    animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_cave_doorway', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Tiles/Cave/Cave_Doorway_1.png',
    // Closed arch, open arch, and collapsed/rubble states are stacked as
    // complete 2x2-tile doorway compositions in the source sheet.
    frames: [[0, 0, 32, 32], [0, 32, 32, 32], [0, 64, 32, 32]],
    fps: 1, size: [32, 32], anchor: [16, 31],
    animation: 'base', frameKind: 'variant',
  },
  {
    name: 'prop_cf_dungeon_doorway', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/dungeons/Dungeon_1/Dungeon_1_Door_Open.png',
    frames: [[0, 0, 32, 32]],
    fps: 1, size: [32, 32], anchor: [16, 31],
    animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_interior_door', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Buildings/House_Decor/Doors.png',
    frames: [[0, 0, 16, 32]], fps: 1, size: [16, 32], anchor: [8, 31],
    animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_interior_bed', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Buildings/House_Decor/Beds.png',
    frames: [[0, 0, 32, 32]], fps: 1, size: [32, 32], anchor: [16, 31],
    animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_interior_bookshelf', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Buildings/House_Decor/BookShelves.png',
    // The sheet alternates 16px narrow shelves with 48px full bookcases.
    // Start after the first narrow shelf instead of combining two unrelated props.
    frames: [[16, 0, 48, 32]], fps: 1, size: [48, 32], anchor: [24, 31],
    animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_interior_table', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Buildings/House_Decor/Tables.png',
    // Tables are packed into 64x64 cells with an 8px horizontal and 24px
    // vertical inset. Cropping from the sheet origin captures only the legs.
    frames: [[8, 24, 48, 32]], fps: 1, size: [48, 32], anchor: [24, 31],
    animation: 'base', frameKind: 'state',
  },
  {
    name: 'prop_cf_cave_support', category: 'props',
    source: 'references/art/kenmi/cute-fantasy/core/Tiles/Cave/Cave_Wall_Support.png',
    frames: [[0, 0, 80, 32]], fps: 1, size: [80, 32], anchor: [40, 31],
    animation: 'base', frameKind: 'state',
  },
);
for (let variant = 1; variant <= 3; variant += 1) {
  extracts.push({
    name: `nature_cf_grass_${String(variant).padStart(2, '0')}`,
    source: `${decorRoot}/Grass_Animations/Grass_${variant}_Anim.png`,
    frames: strip(8), fps: 4,
  });
}
for (let variant = 1; variant <= 15; variant += 1) {
  extracts.push({
    name: `nature_cf_flower_grass_${String(variant).padStart(2, '0')}`,
    source: `${decorRoot}/Grass_Animations/Flower_Grass_${variant}_Anim.png`,
    frames: strip(8), fps: 4,
  });
}
for (let variant = 1; variant <= 5; variant += 1) {
  // Each sheet has ten colour rows. Stagger the selected rows so a grove mixes
  // both flower silhouettes and palettes rather than repeating one colourway.
  const row = (variant * 2 - 1) % 10;
  extracts.push({
    name: `nature_cf_flower_${String(variant).padStart(2, '0')}`,
    source: `${decorRoot}/Flower_Animations/Not_Potted/Flowers_${variant}_Anim.png`,
    frames: strip(6, row * 16), fps: 4,
  });
}
for (let variant = 1; variant <= 8; variant += 1) {
  const count = variant === 7 ? 8 : 6;
  extracts.push({
    name: `nature_cf_mushroom_${String(variant).padStart(2, '0')}`,
    source: `${decorRoot}/Muschroom_Animations/muschroom_${variant}_Anim.png`,
    frames: strip(count), fps: 3,
  });
}
for (let variant = 1; variant <= 14; variant += 1) {
  extracts.push({
    name: `nature_cf_rock_${String(variant).padStart(2, '0')}`,
    source: `${decorRoot}/Rock_Animations/Rock_${variant}_Anim.png`,
    // These strips are destructive/break progress, not ambient motion. The
    // blocked Homestead backdrop uses only the intact authored state.
    frames: [[0, 0, 16, 16]], fps: 1, animation: 'base', frameKind: 'state',
  });
}
for (const [colour, sourceColour] of [['green', 'Green'], ['red', 'Red'], ['purple', 'Purple'], ['brown', 'Brown']] as const) {
  for (const sourceVariant of [1, 3, 5]) {
    const variant = (['green', 'red', 'purple', 'brown'] as const).indexOf(colour) * 3
      + Math.floor((sourceVariant - 1) / 2) + 1;
    extracts.push({
      name: `nature_cf_lily_pad_${String(variant).padStart(2, '0')}`,
      source: `${waterRoot}/Water_Plants/Lillypad_${sourceColour}_${sourceVariant}_Anim.png`,
      frames: strip(8), fps: 4,
    });
  }
}
for (let row = 17; row <= 19; row += 1) {
  for (let column = 5; column <= 8; column += 1) {
    const variant = (row - 17) * 4 + column - 4;
    extracts.push({
      name: `nature_cf_water_flower_${String(variant).padStart(2, '0')}`,
      source: 'references/art/kenmi/cute-fantasy/core/Outdoor decoration/Outdoor_Decor.png',
      frames: [[column * 16, row * 16, 16, 16]], fps: 1,
    });
  }
}
for (let variant = 1; variant <= 5; variant += 1) {
  extracts.push({
    name: `nature_cf_cattail_${String(variant).padStart(2, '0')}`,
    source: `${waterRoot}/Water_Plants/Cattail_${variant}_Anim.png`,
    frames: strip(8), fps: 4,
  });
}
for (let variant = 1; variant <= 2; variant += 1) {
  extracts.push({
    name: `nature_cf_water_grass_${String(variant).padStart(2, '0')}`,
    source: `${waterRoot}/Water_Plants/Water_Grass_${variant}_Anim.png`,
    frames: strip(8), fps: 4,
  });
}
for (const [variant, sourceVariant] of [3, 4, 5, 6, 7, 8, 9, 10, 15, 16].entries()) {
  extracts.push({
    name: `nature_cf_water_rock_${String(variant + 1).padStart(2, '0')}`,
    source: `${waterRoot}/Water_Rocks/Rock_${sourceVariant}_Water_Anim.png`,
    frames: strip(8), fps: 4,
  });
}
extracts.push({
  name: 'nature_cf_fish_shadow_01',
  source: 'references/art/kenmi/cute-fantasy/core/Tiles/Water/Fish_Animated_Tile.png',
  frames: strip(16), fps: 5, transparentTopLeft: true,
});
extracts.push(
  {
    name: 'nature_cf_ocean_surface_01',
    source: 'references/art/kenmi/cute-fantasy/core/Tiles/Water/Water_Middle_Anim_1.png',
    frames: strip(8), fps: 4,
  },
  {
    name: 'nature_cf_ocean_surface_02',
    source: 'references/art/kenmi/cute-fantasy/core/Tiles/Water/Water_Middle_Anim_2.png',
    frames: strip(14), fps: 4,
  },
);
for (const [kind, source] of [
  ['apple', 'Apple_Tree.png'],
  ['pear', 'Pear_Tree.png'],
  ['peach', 'Peach_Tree.png'],
  ['cherry', 'Cherry_Tree.png'],
] as const) {
  extracts.push({
    name: `tree_cf_${kind}_fruiting`,
    category: 'trees',
    source: `references/art/kenmi/cute-fantasy/core/Crops/${source}`,
    frames: [[0, 0, 32, 64]], fps: 1,
    size: [32, 64], anchor: [16, 53],
    animation: 'base', frameKind: 'state',
  });
}
for (const [kind, column] of [['apple', 1], ['pear', 2], ['peach', 3], ['cherry', 4]] as const) {
  extracts.push({
    name: `item_cf_${kind}`,
    source: 'references/art/kenmi/cute-fantasy/core/Crops/Fruit_Trees_Fruit_Objects.png',
    frames: [[column * 16, 0, 16, 16]], fps: 1,
    animation: 'base', frameKind: 'state',
  });
}

function nativeHex(image: DecodedPng, x: number, y: number): string | null {
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3] ?? 0;
  if (alpha === 0) return null;
  const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]
    .map((value) => (value ?? 0).toString(16).padStart(2, '0')).join('');
  return `#${rgb}${alpha === 255 ? '' : alpha.toString(16).padStart(2, '0')}`;
}

for (const variant of [1, 2, 3, 4] as const) {
  extracts.push(
    {
      name: `tile_cf_grass_${variant}_sheet`, category: 'tiles',
      source: `references/art/kenmi/cute-fantasy/core/Tiles/Grass/Grass_Tiles_${variant}.png`,
      frames: sheet(16, 10), fps: 1, animation: 'base', frameKind: 'variant', ...surfaceTerrain,
    },
    {
      name: `tile_cf_grass_${variant}_middle`, category: 'tiles',
      source: `references/art/kenmi/cute-fantasy/core/Tiles/Grass/Grass_${variant}_Middle.png`,
      frames: [[0, 0, 16, 16]], fps: 1, animation: 'base', frameKind: 'state', ...surfaceTerrain,
    },
    ...(['wood', 'stone'] as const).map((material): Extract => ({
      name: `tile_cf_grass_${variant}_ramp_bank_${material}`, category: 'tiles',
      source: `references/art/kenmi/cute-fantasy/core/Tiles/Grass/Grass_Tiles_${variant}.png`,
      // Authored 4-column rows are left rail, repeatable middle, right rail,
      // and a standalone one-lane bank. Rows 6-8 provide crest/treads; row 9
      // is the distinct 2px ground-contact trim used by the base course.
      frames: Array.from({ length: 4 }, (_, row) => Array.from(
        { length: 4 }, (_unused, column) => [
          ((material === 'wood' ? 8 : 12) + column) * 16,
          (6 + row) * 16,
          16,
          16,
        ] as const,
      )).flat(),
      fps: 1, animation: 'base', frameKind: 'variant',
      tags: ['terrain.transition.ramp-bank', `material.${material}`],
      placement: surfaceTerrain.placement,
    })),
    {
      name: `tile_cf_grass_${variant}_ledge`, category: 'tiles',
      source: 'references/art/kenmi/cute-fantasy/core/Tiles/Grass/Grass_Tiles_1_Blob_TEST_1.png',
      // Lip-only alpha overlay: eight convex roles followed by missing SE,
      // SW, NE, NW diagonal roles (the normalized ledge-bank order). The old
      // columns 6-7 crops were bridge/cliff posts and leaked brown pixels into
      // concave corners.
      frames: grassLedgeBlobFrames,
      ...(variant === 1 ? {} : {
        paletteRemap: {
          from: 'references/art/kenmi/cute-fantasy/core/Tiles/Grass/Grass_Tiles_1.png',
          to: `references/art/kenmi/cute-fantasy/core/Tiles/Grass/Grass_Tiles_${variant}.png`,
        },
      }),
      fps: 1, animation: 'base', frameKind: 'variant',
      tags: ['terrain.ledge', 'terrain.edge'], placement: surfaceTerrain.placement,
    },
  );
}

// Preserve the pack author's complete raised-bed example as a reviewed
// reference fixture. Runtime ledges use the normalized 12-role banks above;
// this 7x7 blob proves the intended flat-surface, lip-only composition.
extracts.push({
  name: 'tile_cf_grass_cliff_edge', category: 'tiles',
  source: 'references/art/kenmi/cute-fantasy/core/Tiles/Grass/Grass_Tiles_1_Blob_TEST_1.png',
  frames: sheet(7, 7), fps: 1, animation: 'base', frameKind: 'variant',
  tags: ['terrain.ledge', 'terrain.ledge.example'], placement: surfaceTerrain.placement,
});

for (const variant of [1, 2, 3] as const) extracts.push({
  name: `tile_cf_desert_${variant}_ramp_bank`, category: 'tiles',
  source: `references/art/kenmi/cute-fantasy/desert/Tiles/Desert_Cliff_Tiles_${variant}.png`,
  // Pixel-verified bank at columns 9-12, rows 1-3. The former data selected
  // only columns 9-10 and fabricated a two-wide stair from half the artwork.
  frames: Array.from({ length: 3 }, (_, row) => Array.from(
    { length: 3 }, (_unused, column) => [(9 + column) * 16, (1 + row) * 16, 16, 16] as const,
  )).flat(),
  fps: 1, animation: 'base', frameKind: 'variant',
  tags: ['terrain.transition.ramp-bank'], placement: surfaceTerrain.placement,
});

for (const variant of [1, 2, 3] as const) extracts.push({
  name: `tile_cf_desert_${variant}_ledge`, category: 'tiles',
  source: `references/art/kenmi/cute-fantasy/desert/Tiles/Desert_Cliff_Tiles_${variant}.png`,
  // The source's compact ring at columns 1-3, rows 6-8 is the lip-only bank;
  // the tall bank above it is the opaque cliff course. Columns 4-5 provide
  // the matching four inverse quadrants.
  frames: framesFromSheet(13, [79, 80, 81, 92, 94, 105, 106, 107, 95, 96, 108, 109]),
  fps: 1, animation: 'base', frameKind: 'variant',
  tags: ['terrain.ledge', 'terrain.edge'], placement: surfaceTerrain.placement,
});

extracts.push(
  {
    name: 'tile_cf_shroomlands_ramp_bank', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/shroomlands/Tiles/ShroomLands_Cliff_Tiles.png',
    // Pixel-verified 4-wide bank at columns 5-8, rows 0-2.
    frames: Array.from({ length: 3 }, (_, row) => Array.from(
      { length: 4 }, (_unused, column) => [(5 + column) * 16, row * 16, 16, 16] as const,
    )).flat(),
    fps: 1, animation: 'base', frameKind: 'variant',
    tags: ['terrain.transition.ramp-bank'], placement: surfaceTerrain.placement,
  },
  {
    name: 'tile_cf_shroomlands_ledge', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/shroomlands/Tiles/ShroomLands_Cliff_Tiles.png',
    // The compact dark-rock ring at columns 0-2, rows 6-8 is the authored
    // lip-only bank. The adjacent 2x2 bank is its inverse quartet; the salmon
    // quartet below is ground decoration and is not selected.
    frames: framesFromSheet(9, [54, 55, 56, 63, 65, 72, 73, 74, 57, 58, 66, 67]),
    fps: 1, animation: 'base', frameKind: 'variant',
    tags: ['terrain.ledge', 'terrain.edge'], placement: surfaceTerrain.placement,
  },
  {
    name: 'tile_cf_volcanic_ramp_bank', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/volcano/Tiles/Volcano_Tiles.png',
    // Pixel-verified 3-wide volcanic stair bank: left rail, repeatable tread,
    // right rail at columns 22-24, rows 0-2.
    frames: Array.from({ length: 3 }, (_, row) => Array.from(
      { length: 3 }, (_unused, column) => [(22 + column) * 16, row * 16, 16, 16] as const,
    )).flat(),
    fps: 1, animation: 'base', frameKind: 'variant',
    tags: ['terrain.transition.ramp-bank'], placement: surfaceTerrain.placement,
  },
  {
    name: 'tile_cf_volcanic_ledge', category: 'tiles',
    source: 'references/art/kenmi/cute-fantasy/volcano/Tiles/Volcano_Tiles.png',
    // The lower-left 3x3 rock ring is the lip silhouette. Its neighbouring
    // filled blob supplies four distinct inner-corner quadrants, avoiding the
    // old reuse of convex corners as inset roles.
    frames: [
      ...framesFromSheet(29, [175, 176, 177, 204, 206, 233, 234, 235]),
      ...framesFromSheet(29, [178, 180, 236, 238]),
    ],
    fps: 1, animation: 'base', frameKind: 'variant',
    tags: ['terrain.ledge', 'terrain.edge'], placement: surfaceTerrain.placement,
  },
);

const rootPath = fileURLToPath(workspaceRoot);
const palette = await loadPalette();
const paletteCharacters = Object.keys(palette.colors);
const images = new Map<string, DecodedPng>();
for (const source of new Set(extracts.flatMap((extract) => [
  extract.source,
  ...(extract.paletteRemap ? [extract.paletteRemap.from, extract.paletteRemap.to] : []),
]))) {
  images.set(source, decodePng(await readFile(resolve(rootPath, source))));
}

function paletteCorrespondence(from: DecodedPng, to: DecodedPng): ReadonlyMap<string, string> {
  if (from.width !== to.width || from.height !== to.height) {
    throw new Error(`Palette-reference sheets must have equal dimensions: ${from.width}x${from.height} vs ${to.width}x${to.height}`);
  }
  const counts = new Map<string, Map<string, number>>();
  for (let y = 0; y < from.height; y += 1) {
    for (let x = 0; x < from.width; x += 1) {
      const source = nativeHex(from, x, y);
      const target = nativeHex(to, x, y);
      if (source === null || target === null) continue;
      const candidates = counts.get(source) ?? new Map<string, number>();
      candidates.set(target, (candidates.get(target) ?? 0) + 1);
      counts.set(source, candidates);
    }
  }
  return new Map([...counts].map(([source, candidates]) => [
    source,
    [...candidates].sort(([leftColor, leftCount], [rightColor, rightCount]) => (
      rightCount - leftCount || leftColor.localeCompare(rightColor)
    ))[0]![0],
  ]));
}

for (const extract of extracts) {
  const image = images.get(extract.source)!;
  const remap = extract.paletteRemap === undefined ? null : paletteCorrespondence(
    images.get(extract.paletteRemap.from)!,
    images.get(extract.paletteRemap.to)!,
  );
  const transparentColour = extract.transparentTopLeft ? nativeHex(image, 0, 0) : null;
  const nativeFrames = extract.frames.map(([x, y, width, height]) => Array.from(
    { length: height }, (_, py) => Array.from({ length: width }, (_, px) => {
      const colour = nativeHex(image, x + px, y + py);
      return colour === transparentColour || colour === null ? null : remap?.get(colour) ?? colour;
    }),
  ));
  const colors = [...new Set(nativeFrames.flatMap((frame) => frame.flatMap((row) =>
    row.filter((color): color is string => color !== null))))].sort();
  if (colors.length > paletteCharacters.length) throw new Error(`${extract.name} has too many colors`);
  const characterByColor = new Map(colors.map((color, index) => [color, paletteCharacters[index]!]));
  const frames = nativeFrames.map((pixels) => pixels.map((row) => row.map((color) =>
    color === null ? '.' : characterByColor.get(color) ?? '.').join('')));
  const animation = extract.animation ?? 'sway';
  const frameKind = extract.frameKind ?? 'animation';
  const asset: AssetSource = {
    name: extract.name,
    category: extract.category ?? 'props',
    size: extract.size ?? [16, 16],
    anchor: extract.anchor ?? [8, 15],
    frames: { [animation]: frames },
    frameKinds: { [animation]: frameKind },
    ...(frameKind === 'animation' ? {
      animationFps: { [animation]: extract.fps },
      animationLoop: { [animation]: true },
    } : {}),
    sourcePalette: Object.fromEntries(colors.map((color) => [characterByColor.get(color)!, color])),
    sourcePaletteMode: 'exact',
    approved: true,
    importedFrom: basename(extract.source),
    sourcePath: relative(rootPath, resolve(rootPath, extract.source)).replaceAll('\\', '/'),
    sourceRegions: { [animation]: extract.frames },
    tags: extract.tags ?? ['world.nature', 'decor.ambient', extract.name.includes('fish_shadow') ? 'fishing.indicator' : 'decor.animated'],
    placement: extract.placement ?? { layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
  };
  const outputRoot = resolve(rootPath, `packages/assets/${extract.category ?? 'props'}`);
  await mkdir(outputRoot, { recursive: true });
  const extension = extract.category === 'tiles' ? 'tile' : 'sprite';
  await writeFile(resolve(outputRoot, `${extract.name}.${extension}.json`), `${JSON.stringify(asset, null, 2)}\n`);
}

console.log(`Extracted ${extracts.length} reviewed nature assets.`);
