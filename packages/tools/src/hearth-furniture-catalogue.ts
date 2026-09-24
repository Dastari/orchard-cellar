/** Reviewed base catalogue from the Astra furniture catalogue review (wiki: History/Hearth Harbour and Embers).
 * Native crop/placement review is separate; this table supplies names, economy and
 * the shaped crafting pattern (owner request 2026-09-24: logical Minecraft-style
 * shapes, one item per cell) read with HEARTH_FURNITURE_PATTERN_LEGEND. */
export const HEARTH_FURNITURE_PATTERN_LEGEND: Readonly<Record<string, string>> = {
  P: 'plank', S: 'stick', F: 'fiber', T: 'stone', i: 'iron_piece', c: 'copper_piece', U: 'sunflower',
  // Materials foundation (Craft-D2): processed inputs give the townhouse set a real tier.
  G: 'glass_pane', B: 'brick', K: 'compost', C: 'cooking_fire', L: 'linen_cloth', Y: 'wool_cloth', R: 'yarn',
};
export const HEARTH_FURNITURE_CATALOGUE = [
  {
    "suffix": "rustic_stool",
    "displayName": "Timber stool",
    "style": "rustic",
    "pattern": ["PP", "SS"],
    "priceBronze": 80
  },
  {
    "suffix": "rustic_chair",
    "displayName": "Ladder chair",
    "style": "rustic",
    "pattern": ["P..", "PPP", "S.S"],
    "priceBronze": 100
  },
  {
    "suffix": "rustic_bench",
    "displayName": "Timber bench",
    "style": "rustic",
    "pattern": ["PPP", "S.S"],
    "priceBronze": 190
  },
  {
    "suffix": "townhouse_chair",
    "displayName": "Cushioned chair",
    "style": "townhouse",
    "pattern": ["P..", "LLL", "S.S"],
    "priceBronze": 130
  },
  {
    "suffix": "townhouse_loveseat",
    "displayName": "Blue loveseat",
    "style": "townhouse",
    "pattern": ["YYY", "PPP", "P.P"],
    "priceBronze": 290
  },
  {
    "suffix": "townhouse_armchair",
    "displayName": "Hearth armchair",
    "style": "townhouse",
    "pattern": ["P.P", "YYY", "P.P"],
    "priceBronze": 200
  },
  {
    "suffix": "rustic_dining_table",
    "displayName": "Timber dining table",
    "style": "rustic",
    "pattern": ["PPP", "PPP", "S.S"],
    "priceBronze": 220
  },
  {
    "suffix": "rustic_writing_table",
    "displayName": "Writing table",
    "style": "rustic",
    "pattern": ["PPP", "P.S"],
    "priceBronze": 150
  },
  {
    "suffix": "townhouse_dining_table",
    "displayName": "Linen dining table",
    "style": "townhouse",
    "pattern": ["LLL", "PPP", "S.S"],
    "priceBronze": 260
  },
  {
    "suffix": "townhouse_side_table",
    "displayName": "Side table",
    "style": "townhouse",
    "pattern": ["PPP", ".S."],
    "priceBronze": 90
  },
  {
    "suffix": "rustic_bed",
    "displayName": "Single timber bed",
    "style": "rustic",
    "pattern": ["FFF", "PPP"],
    "priceBronze": 280
  },
  {
    "suffix": "townhouse_bed",
    "displayName": "Blue double bed",
    "style": "townhouse",
    "pattern": ["YYY", "FFF", "PPP"],
    "priceBronze": 460
  },
  {
    "suffix": "rustic_chest",
    "displayName": "Timber chest",
    "style": "rustic",
    "pattern": ["PiP", "P.P", "PPP"],
    "priceBronze": 210
  },
  {
    "suffix": "townhouse_wardrobe",
    "displayName": "Tall wardrobe",
    "style": "townhouse",
    "pattern": ["PPP", "iPi", "PPP"],
    "priceBronze": 350
  },
  {
    "suffix": "rustic_bookshelf",
    "displayName": "Narrow bookshelf",
    "style": "rustic",
    "pattern": ["PPP", "SSS", "PPP"],
    "priceBronze": 170
  },
  {
    "suffix": "rustic_cupboard",
    "displayName": "Timber cupboard",
    "style": "rustic",
    "pattern": ["PPP", "PiP", "PPP"],
    "priceBronze": 250
  },
  {
    "suffix": "townhouse_bookcase",
    "displayName": "Wide bookcase",
    "style": "townhouse",
    "pattern": ["PPP", "SPS", "PPP"],
    "priceBronze": 270
  },
  {
    "suffix": "townhouse_cabinet",
    "displayName": "Townhouse cabinet",
    "style": "townhouse",
    "pattern": ["PiP", "PPP", "PiP"],
    "priceBronze": 290
  },
  {
    "suffix": "rustic_woven_rug",
    "displayName": "Woven rug",
    "style": "rustic",
    "pattern": ["FFF", "FFF"],
    "priceBronze": 100
  },
  {
    "suffix": "rustic_runner",
    "displayName": "Hall runner",
    "style": "rustic",
    "pattern": ["FFF"],
    "priceBronze": 110
  },
  {
    "suffix": "townhouse_round_rug",
    "displayName": "Round blue rug",
    "style": "townhouse",
    "pattern": [".R.", "RRR", ".R."],
    "priceBronze": 160
  },
  {
    "suffix": "townhouse_patterned_rug",
    "displayName": "Burgundy rug",
    "style": "townhouse",
    "pattern": ["RRR", "RLR", "RRR"],
    "priceBronze": 240
  },
  {
    "suffix": "rustic_standing_lamp",
    "displayName": "Timber standing lamp",
    "style": "rustic",
    "pattern": [".G.", ".c.", ".S."],
    "priceBronze": 140
  },
  {
    "suffix": "townhouse_floor_lamp",
    "displayName": "Blue floor lamp",
    "style": "townhouse",
    "pattern": ["LGL", ".c.", ".S."],
    "priceBronze": 190
  },
  {
    "suffix": "townhouse_table_lamp",
    "displayName": "Small table lamp",
    "style": "townhouse",
    "pattern": [".G.", ".c.", ".P."],
    "priceBronze": 100
  },
  {
    "suffix": "rustic_hearth",
    "displayName": "Stone hearth",
    "style": "rustic",
    "pattern": ["TTT", "T.T", "TiT"],
    "priceBronze": 460
  },
  {
    "suffix": "rustic_cooking_range",
    "displayName": "Cooking range",
    "style": "rustic",
    "pattern": ["iii", "iCi", "TTT"],
    "priceBronze": 360
  },
  {
    "suffix": "townhouse_washstand",
    "displayName": "Cabinet washstand",
    "style": "townhouse",
    "pattern": [".c.", "TBT", "PPP"],
    "priceBronze": 270
  },
  {
    "suffix": "townhouse_bath",
    "displayName": "Enamel bath",
    "style": "townhouse",
    "pattern": ["ici", "G.G", "iii"],
    "priceBronze": 420
  },
  {
    "suffix": "rustic_potted_fern",
    "displayName": "Potted fern",
    "style": "rustic",
    "pattern": [".U.", "TFT", ".T."],
    "priceBronze": 90
  },
  {
    "suffix": "townhouse_flower_planter",
    "displayName": "Flower planter",
    "style": "townhouse",
    "pattern": ["U.U", "BKB"],
    "priceBronze": 170
  },
  {
    "suffix": "townhouse_wall_mirror",
    "displayName": "Wall mirror",
    "style": "townhouse",
    "pattern": ["PPP", "PGP", "PPP"],
    "priceBronze": 210
  }
] as const;

/** The shaped recipe grid for a catalogue entry: rows of `item:` ids or null. */
export function hearthFurniturePattern(entry: { readonly suffix: string; readonly pattern: readonly string[] }): (`item:${string}` | null)[][] {
  return entry.pattern.map((row) => [...row].map((cell) => {
    if (cell === '.') return null;
    const material = HEARTH_FURNITURE_PATTERN_LEGEND[cell];
    if (material === undefined) throw new Error(`unknown_furniture_pattern_symbol:${entry.suffix}:${cell}`);
    return `item:${material}` as const;
  }));
}
