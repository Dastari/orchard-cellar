import {
  CROP_KINDS,
  FENCE_JOIN_EAST,
  FENCE_JOIN_NORTH,
  FENCE_JOIN_SOUTH,
  FENCE_JOIN_WEST,
  FIXED_UNITS_PER_PIXEL,
  HORSE_JUMP_DURATION_TICKS,
  ITEM_DEFINITIONS,
  SURVIVAL_ORE_KINDS,
  itemDefinition,
  type Direction,
  type TreeGrowthStage,
  type WildlifeSpecies,
} from "@orchard/sim";
import { loadGeneratedAsset, type LoadedAsset } from "./render/assets.js";
import {
  drawPixelText,
  loadPixelUi,
  measurePixelText,
  type PixelUi,
} from "./render/pixel-ui.js";
import { selectAtlasFrame, type AtlasFrame } from "./render/sprite.js";
import { loadUiSkin, type UiSkin } from "./ui/skin.js";

/** The same cosmetic source extracted at matching locomotion, mount, and tool poses. */
interface CharacterPartArt {
  readonly standing: LoadedAsset;
  readonly mounted: LoadedAsset;
  readonly action: LoadedAsset;
}

interface PlayerRigArt {
  readonly base: CharacterPartArt;
  readonly hands: CharacterPartArt;
  readonly hair: Readonly<Record<string, CharacterPartArt>>;
  readonly shirts: Readonly<Record<string, CharacterPartArt>>;
  readonly pants: Readonly<Record<string, CharacterPartArt>>;
  readonly shoes: Readonly<Record<string, CharacterPartArt>>;
}

interface HeldLightArt {
  readonly idle: LoadedAsset;
  readonly running: LoadedAsset;
  readonly idleHands: LoadedAsset;
  readonly runningHands: LoadedAsset;
}

export interface PlayerAppearanceVisual {
  readonly hairKind: string;
  readonly shirtKind: string;
  readonly pantsKind: string;
  readonly shoesKind: string;
}

export const DEFAULT_PLAYER_APPEARANCE: PlayerAppearanceVisual = {
  hairKind: "hair_1_brown",
  shirtKind: "farmer_green",
  pantsKind: "farmer_white_brown",
  shoesKind: "brown",
};

export interface OverworldArt {
  readonly avatar: LoadedAsset;
  readonly avatarAxe: LoadedAsset;
  readonly horse: LoadedAsset;
  readonly mountedHorse: LoadedAsset;
  readonly wildlife: Readonly<Record<string, readonly LoadedAsset[]>>;
  readonly mountedHorses: readonly LoadedAsset[];
  readonly beeHive: LoadedAsset;
  readonly beeNest: LoadedAsset;
  readonly playerRig: PlayerRigArt;
  readonly merchantNpc: LoadedAsset;
  readonly heldLights: Readonly<Record<"torch" | "lantern", HeldLightArt>>;
  readonly actionAssets: Readonly<Record<string, LoadedAsset>>;
  readonly oreNodes: Readonly<Record<string, LoadedAsset>>;
  readonly oreItems: Readonly<Record<string, LoadedAsset>>;
  readonly itemIcons: Readonly<Record<string, LoadedAsset>>;
  readonly crops: Readonly<Record<string, LoadedAsset>>;
  readonly cropTimer: LoadedAsset;
  readonly poiDecorations: Readonly<Record<string, LoadedAsset>>;
  readonly natureDecorations: Readonly<Record<string, readonly LoadedAsset[]>>;
  readonly oceanSurfaceDecorations: readonly LoadedAsset[];
  readonly fruitItems: Readonly<Record<string, LoadedAsset>>;
  readonly rockStone: LoadedAsset;
  readonly woodFloor: LoadedAsset;
  readonly interiorWall: LoadedAsset;
  readonly caveFloor: LoadedAsset;
  readonly caveFloor2: LoadedAsset;
  readonly caveFloorDecoration: LoadedAsset;
  readonly caveFloorMiddle: LoadedAsset;
  readonly caveWall: LoadedAsset;
  readonly caveSupport: LoadedAsset;
  readonly grass: LoadedAsset;
  readonly grassCliffEdge: LoadedAsset;
  readonly grassCliffRamp: LoadedAsset;
  readonly stoneCliffInverseOverlay: LoadedAsset;
  readonly dirtTerrace: LoadedAsset;
  readonly dirtCliffEdge: LoadedAsset;
  readonly dirtCliffRamp: LoadedAsset;
  readonly farmland: LoadedAsset;
  readonly farmlandWet: LoadedAsset;
  readonly farmlandGrassInset: LoadedAsset;
  readonly grassTuft: LoadedAsset;
  readonly water: LoadedAsset;
  readonly freshwater: LoadedAsset;
  readonly freshwaterInset: LoadedAsset;
  readonly waterfall: LoadedAsset;
  readonly waterfallFlow: LoadedAsset;
  readonly waterRockFlow: LoadedAsset;
  readonly beach: LoadedAsset;
  readonly beachInset: LoadedAsset;
  readonly desert: LoadedAsset;
  readonly desertShore: LoadedAsset;
  readonly desertShoreInset: LoadedAsset;
  readonly desertGrass: LoadedAsset;
  readonly desertGrassEdge: LoadedAsset;
  readonly desertGrassInset: LoadedAsset;
  readonly savannaGrassInset: LoadedAsset;
  readonly cliff: LoadedAsset;
  readonly cliff2: LoadedAsset;
  readonly cliff3: LoadedAsset;
  readonly coastalCliffOverlay: LoadedAsset;
  readonly cliff4: LoadedAsset;
  readonly desertCliff: LoadedAsset;
  readonly iconAxe: LoadedAsset;
  readonly iconHoe: LoadedAsset;
  readonly iconPickaxe: LoadedAsset;
  readonly iconWateringCan: LoadedAsset;
  readonly iconBow: LoadedAsset;
  readonly iconShovel: LoadedAsset;
  readonly iconHammer: LoadedAsset;
  readonly iconSword: LoadedAsset;
  readonly itemArrow: LoadedAsset;
  readonly itemWood: LoadedAsset;
  readonly itemPlank: LoadedAsset;
  readonly itemStick: LoadedAsset;
  readonly itemStone: LoadedAsset;
  readonly itemTorch: LoadedAsset;
  readonly itemLantern: LoadedAsset;
  readonly itemOrchardTea: LoadedAsset;
  readonly chest: LoadedAsset;
  readonly archeryTarget: LoadedAsset;
  readonly missingItem: LoadedAsset;
  readonly rainStreak: LoadedAsset;
  readonly rainSplash: LoadedAsset;
  readonly cloudShadow: LoadedAsset;
  readonly windGust: LoadedAsset;
  readonly oakLeaf: LoadedAsset;
  readonly birchLeaf: LoadedAsset;
  readonly spruceLeaf: LoadedAsset;
  readonly waterRipples: LoadedAsset;
  readonly treeFruiting: LoadedAsset;
  readonly treeMature: LoadedAsset;
  readonly fruitTrees: Readonly<Record<string, LoadedAsset>>;
  readonly treeOak: LoadedAsset;
  readonly treeBirch: LoadedAsset;
  readonly treeSpruce: LoadedAsset;
  readonly treeAcacia: LoadedAsset;
  readonly treePalm: LoadedAsset;
  readonly treeSapling: LoadedAsset;
  readonly treeYoung: LoadedAsset;
  readonly treeOakSapling: LoadedAsset;
  readonly treeOakYoung: LoadedAsset;
  readonly treeBirchSapling: LoadedAsset;
  readonly treeBirchYoung: LoadedAsset;
  readonly treeSpruceSapling: LoadedAsset;
  readonly treeSpruceYoung: LoadedAsset;
  readonly treeStumpSmall: LoadedAsset;
  readonly treeStumpMedium: LoadedAsset;
  readonly treeStump: LoadedAsset;
  readonly treeBirchStumpSmall: LoadedAsset;
  readonly treeBirchStumpMedium: LoadedAsset;
  readonly treeBirchStump: LoadedAsset;
  readonly treeSpruceStumpSmall: LoadedAsset;
  readonly treeSpruceStumpMedium: LoadedAsset;
  readonly treeSpruceStump: LoadedAsset;
  readonly treeFruitStumpSmall: LoadedAsset;
  readonly treeFruitStumpMedium: LoadedAsset;
  readonly treeFruitStump: LoadedAsset;
  readonly treeAcaciaStump: LoadedAsset;
  readonly treePalmStump: LoadedAsset;
  readonly cactus: LoadedAsset;
  readonly ui: PixelUi;
  readonly uiSkin: UiSkin;
}

async function loadCharacterPart(
  standingName: string,
  mountedName: string,
  actionName: string,
): Promise<CharacterPartArt> {
  const [standing, mounted, action] = await Promise.all([
    loadGeneratedAsset(standingName, "summer"),
    loadGeneratedAsset(mountedName, "summer"),
    loadGeneratedAsset(actionName, "summer"),
  ]);
  return { standing, mounted, action };
}

async function loadCharacterPartMap(
  entries: readonly (readonly [string, string, string, string])[],
): Promise<Readonly<Record<string, CharacterPartArt>>> {
  return Object.fromEntries(
    await Promise.all(
      entries.map(async ([kind, standing, mounted, action]) => [
        kind,
        await loadCharacterPart(standing, mounted, action),
      ]),
    ),
  ) as Readonly<Record<string, CharacterPartArt>>;
}

async function loadPlayerRig(): Promise<PlayerRigArt> {
  const [base, hands, hair, shirts, pants, shoes] = await Promise.all([
    loadCharacterPart("player_cf_base", "rider_cf_base", "action_cf_base"),
    loadCharacterPart("player_cf_hands", "rider_cf_hands", "action_cf_hands"),
    loadCharacterPartMap([
      [
        "hair_1_brown",
        "player_cf_hair",
        "rider_cf_hair",
        "action_cf_hair_1_brown",
      ],
      [
        "hair_2_black",
        "player_cf_hair_2_black",
        "rider_cf_hair_2_black",
        "action_cf_hair_2_black",
      ],
      [
        "hair_3_blonde",
        "player_cf_hair_3_blonde",
        "rider_cf_hair_3_blonde",
        "action_cf_hair_3_blonde",
      ],
      [
        "hair_4_ginger",
        "player_cf_hair_4_ginger",
        "rider_cf_hair_4_ginger",
        "action_cf_hair_4_ginger",
      ],
      [
        "hair_5_grey",
        "player_cf_hair_5_grey",
        "rider_cf_hair_5_grey",
        "action_cf_hair_5_grey",
      ],
      [
        "hair_6_brown",
        "player_cf_hair_6_brown",
        "rider_cf_hair_6_brown",
        "action_cf_hair_6_brown",
      ],
    ]),
    loadCharacterPartMap([
      [
        "farmer_green",
        "player_cf_farmer_shirt",
        "rider_cf_farmer_shirt",
        "action_cf_shirt_farmer_green",
      ],
      [
        "farmer_blue",
        "player_cf_shirt_farmer_blue",
        "rider_cf_shirt_farmer_blue",
        "action_cf_shirt_farmer_blue",
      ],
      [
        "farmer_orange",
        "player_cf_shirt_farmer_orange",
        "rider_cf_shirt_farmer_orange",
        "action_cf_shirt_farmer_orange",
      ],
      [
        "farmer_purple",
        "player_cf_shirt_farmer_purple",
        "rider_cf_shirt_farmer_purple",
        "action_cf_shirt_farmer_purple",
      ],
      [
        "farmer_red",
        "player_cf_shirt_farmer_red",
        "rider_cf_shirt_farmer_red",
        "action_cf_shirt_farmer_red",
      ],
      [
        "farmer_white_brown",
        "player_cf_shirt_farmer_white_brown",
        "rider_cf_shirt_farmer_white_brown",
        "action_cf_shirt_farmer_white_brown",
      ],
    ]),
    loadCharacterPartMap([
      [
        "farmer_white_brown",
        "player_cf_farmer_pants",
        "rider_cf_farmer_pants",
        "action_cf_pants_farmer_white_brown",
      ],
      [
        "farmer_black",
        "player_cf_pants_farmer_black",
        "rider_cf_pants_farmer_black",
        "action_cf_pants_farmer_black",
      ],
      [
        "farmer_blue",
        "player_cf_pants_farmer_blue",
        "rider_cf_pants_farmer_blue",
        "action_cf_pants_farmer_blue",
      ],
      [
        "farmer_green",
        "player_cf_pants_farmer_green",
        "rider_cf_pants_farmer_green",
        "action_cf_pants_farmer_green",
      ],
      [
        "farmer_red",
        "player_cf_pants_farmer_red",
        "rider_cf_pants_farmer_red",
        "action_cf_pants_farmer_red",
      ],
    ]),
    loadCharacterPartMap([
      ["brown", "player_cf_shoes", "rider_cf_shoes", "action_cf_shoes_brown"],
      [
        "black",
        "player_cf_shoes_black",
        "rider_cf_shoes_black",
        "action_cf_shoes_black",
      ],
      [
        "blue",
        "player_cf_shoes_blue",
        "rider_cf_shoes_blue",
        "action_cf_shoes_blue",
      ],
      [
        "green",
        "player_cf_shoes_green",
        "rider_cf_shoes_green",
        "action_cf_shoes_green",
      ],
      [
        "red",
        "player_cf_shoes_red",
        "rider_cf_shoes_red",
        "action_cf_shoes_red",
      ],
    ]),
  ]);
  return { base, hands, hair, shirts, pants, shoes };
}

async function loadOreArt(
  prefix: "resource_cf_ore_" | "item_cf_",
  suffix: "" | "_ore",
): Promise<Readonly<Record<string, LoadedAsset>>> {
  return Object.fromEntries(
    await Promise.all(
      SURVIVAL_ORE_KINDS.map(async (resourceKind) => {
        const oreKind = resourceKind.slice("ore_".length);
        const key =
          prefix === "resource_cf_ore_" ? resourceKind : `${oreKind}_ore`;
        return [
          key,
          await loadGeneratedAsset(`${prefix}${oreKind}${suffix}`, "summer"),
        ];
      }),
    ),
  ) as Readonly<Record<string, LoadedAsset>>;
}

async function loadNumberedWildlife(
  species: string,
  count: number,
): Promise<readonly LoadedAsset[]> {
  return await Promise.all(
    Array.from({ length: count }, (_, variant) =>
      loadGeneratedAsset(
        `wildlife_cf_${species}_${String(variant + 1).padStart(2, "0")}`,
        "summer",
      ),
    ),
  );
}

async function loadWildlifeArt(): Promise<
  Readonly<Record<string, readonly LoadedAsset[]>>
> {
  const entries: readonly (readonly [string, number])[] = [
    ["horse", 5],
    ["cow", 9],
    ["sheep", 9],
    ["pig", 16],
    ["chicken", 18],
    ["rooster", 1],
    ["duck", 5],
    ["goose", 6],
    ["swan", 3],
    ["frog", 6],
    ["mouse", 4],
    ["butterfly", 1],
    ["bee", 1],
    ["camel", 3],
    ["scarab", 4],
    ["vulture", 4],
    ["snail", 4],
  ];
  const loaded = await Promise.all(
    entries.map(
      async ([species, count]) =>
        [species, await loadNumberedWildlife(species, count)] as const,
    ),
  );
  for (const animation of [
    "idle",
    "look",
    "submerged",
    "dive",
    "emerge",
    "bubbles",
  ]) {
    loaded.push([
      `capybara_${animation}`,
      await Promise.all(
        Array.from({ length: 2 }, (_, variant) =>
          loadGeneratedAsset(
            `wildlife_cf_capybara_${String(variant + 1).padStart(2, "0")}_${animation}`,
            "summer",
          ),
        ),
      ),
    ]);
  }
  return Object.fromEntries(loaded);
}

async function loadNatureDecorationArt(): Promise<
  Readonly<Record<string, readonly LoadedAsset[]>>
> {
  const entries: readonly (readonly [string, string, number])[] = [
    ["nature_grass", "grass", 3],
    ["nature_flower_grass", "flower_grass", 15],
    ["nature_flower", "flower", 5],
    ["nature_mushroom", "mushroom", 8],
    ["nature_rock", "rock", 14],
    ["nature_lily_pad", "lily_pad", 12],
    ["nature_water_flower", "water_flower", 12],
    ["nature_cattail", "cattail", 5],
    ["nature_water_grass", "water_grass", 2],
    ["nature_water_rock", "water_rock", 10],
    ["nature_fish_shadow", "fish_shadow", 1],
    ["nature_desert_grass", "desert_grass", 3],
    ["nature_desert_fern", "desert_fern", 1],
    ["nature_desert_bush", "desert_bush", 2],
    ["nature_desert_plant", "desert_plant", 3],
    ["nature_desert_rock", "desert_rock", 4],
  ];
  return Object.fromEntries(
    await Promise.all(
      entries.map(async ([kind, assetKind, count]) => [
        kind,
        await Promise.all(
          Array.from({ length: count }, (_, variant) =>
            loadGeneratedAsset(
              `nature_cf_${assetKind}_${String(variant + 1).padStart(2, "0")}`,
              "summer",
            ),
          ),
        ),
      ]),
    ),
  );
}

async function loadFruitTreeArt(): Promise<
  Readonly<Record<string, LoadedAsset>>
> {
  return Object.fromEntries(
    await Promise.all(
      ["apple", "pear", "peach", "cherry"].map(async (kind) => [
        `tree_${kind}`,
        await loadGeneratedAsset(`tree_cf_${kind}_fruiting`, "summer"),
      ]),
    ),
  );
}

async function loadFruitItemArt(): Promise<
  Readonly<Record<string, LoadedAsset>>
> {
  return Object.fromEntries(
    await Promise.all(
      ["apple", "pear", "peach", "cherry"].map(async (kind) => [
        kind,
        await loadGeneratedAsset(`item_cf_${kind}`, "summer"),
      ]),
    ),
  );
}

async function loadItemIconArt(): Promise<
  Readonly<Record<string, LoadedAsset>>
> {
  const registry = await Promise.all(
    Object.entries(ITEM_DEFINITIONS).map(
      async ([kind, definition]) =>
        [kind, await loadGeneratedAsset(definition.iconKey, "summer")] as const,
    ),
  );
  const fenceVariants = await Promise.all(
    [
      ["fence_horizontal", "prop_cf_fence_horizontal"],
      ["fence_vertical", "prop_cf_fence_vertical"],
      ["fence_corner", "prop_cf_fence_corner"],
      ["fence_left_end", "prop_cf_fence_left_end"],
    ].map(
      async ([kind, asset]) =>
        [kind!, await loadGeneratedAsset(asset!, "summer")] as const,
    ),
  );
  const questIcons = await Promise.all(
    [
      ['quest_offer', 'icon_cf_quest_offer'],
      ['quest_complete', 'icon_cf_quest_complete'],
    ].map(async ([kind, asset]) => [kind!, await loadGeneratedAsset(asset!, 'summer')] as const),
  );
  return Object.fromEntries([...registry, ...fenceVariants, ...questIcons]);
}

async function loadCropArt(): Promise<Readonly<Record<string, LoadedAsset>>> {
  return Object.fromEntries(await Promise.all(CROP_KINDS.map(async (kind) => [
    kind,
    await loadGeneratedAsset(`crop_cf_${kind}`, 'summer'),
  ] as const)));
}

export async function loadOverworldArt(): Promise<OverworldArt> {
  const [
    avatar,
    avatarAxe,
    axeActionTool,
    swordActionTool,
    pickaxeActionTool,
    hoeActionTool,
    wateringCanActionTool,
    bowActionTool,
    horse,
    mountedHorse,
    wildlife,
    natureDecorations,
    oceanSurfaceDecorations,
    fruitTrees,
    fruitItems,
    mountedHorses,
    beeHive,
    beeNest,
    playerRig,
    merchantNpc,
    torchIdle,
    torchRunning,
    torchIdleHands,
    torchRunningHands,
    lanternIdle,
    lanternRunning,
    lanternIdleHands,
    lanternRunningHands,
    oreNodes,
    oreItems,
    rockStone,
    itemStone,
    poiFlowersPink,
    poiFlowersGold,
    poiStump,
    poiFallenLog,
    poiRockSmall,
    campTent,
    homesteadTentMarker,
    homesteadTentLarge,
    campfire,
    campRoundStool,
    campBench,
    campStumpSeat,
    campChair,
    campFishingRod,
    campPond,
    woodFloor,
    interiorWall,
    caveFloor,
    caveFloor2,
    caveFloorDecoration,
    caveFloorMiddle,
    caveWall,
    trapdoor,
    cellarLadder,
    interiorDoor,
    interiorBed,
    interiorBookshelf,
    interiorTable,
    caveSupport,
    grass,
    grassCliffEdge,
    grassCliffRamp,
    stoneCliffInverseOverlay,
    dirtTerrace,
    dirtCliffEdge,
    dirtCliffRamp,
    farmland,
    farmlandWet,
    farmlandGrassInset,
    grassTuft,
    water,
    freshwater,
    freshwaterInset,
    waterfall,
    waterfallFlow,
    waterRockFlow,
    beach,
    beachInset,
    desert,
    desertShore,
    desertShoreInset,
    desertGrass,
    desertGrassEdge,
    desertGrassInset,
    savannaGrassInset,
    cliff,
    cliff2,
    cliff3,
    coastalCliffOverlay,
    cliff4,
    desertCliff,
    iconAxe,
    iconHoe,
    iconPickaxe,
    iconWateringCan,
    iconBow,
    iconShovel,
    iconHammer,
    iconSword,
    itemArrow,
    itemWood,
    itemPlank,
    itemStick,
    itemTorch,
    itemLantern,
    itemOrchardTea,
    chest,
    archeryTarget,
    missingItem,
    rainStreak,
    rainSplash,
    cloudShadow,
    windGust,
    oakLeaf,
    birchLeaf,
    spruceLeaf,
    waterRipples,
    treeFruiting,
    treeMature,
    treeOak,
    treeBirch,
    treeSpruce,
    treeAcacia,
    treePalm,
    treeSapling,
    treeYoung,
    treeOakSapling,
    treeOakYoung,
    treeBirchSapling,
    treeBirchYoung,
    treeSpruceSapling,
    treeSpruceYoung,
    treeStumpSmall,
    treeStumpMedium,
    treeStump,
    treeBirchStumpSmall,
    treeBirchStumpMedium,
    treeBirchStump,
    treeSpruceStumpSmall,
    treeSpruceStumpMedium,
    treeSpruceStump,
    treeFruitStumpSmall,
    treeFruitStumpMedium,
    treeFruitStump,
    treeAcaciaStump,
    treePalmStump,
    cactus,
    ui,
    uiSkin,
    itemIcons,
    crops,
    cropTimer,
  ] = await Promise.all([
    loadGeneratedAsset("avatar_cf_farmer", "summer"),
    loadGeneratedAsset("avatar_cf_farmer_axe", "summer"),
    loadGeneratedAsset("tool_cf_iron_axe_action", "summer"),
    loadGeneratedAsset("tool_cf_iron_sword_action", "summer"),
    loadGeneratedAsset("tool_cf_iron_pickaxe_action", "summer"),
    loadGeneratedAsset("tool_cf_iron_hoe_action", "summer"),
    loadGeneratedAsset("tool_cf_watering_can_action", "summer"),
    loadGeneratedAsset("tool_cf_wooden_bow_action", "summer"),
    loadGeneratedAsset("horse_cf_bramble", "summer"),
    loadGeneratedAsset("horse_cf_bramble_mounted", "summer"),
    loadWildlifeArt(),
    loadNatureDecorationArt(),
    Promise.all([
      loadGeneratedAsset("nature_cf_ocean_surface_01", "summer"),
      loadGeneratedAsset("nature_cf_ocean_surface_02", "summer"),
    ]),
    loadFruitTreeArt(),
    loadFruitItemArt(),
    Promise.all(
      Array.from({ length: 5 }, (_, variant) =>
        loadGeneratedAsset(
          `wildlife_cf_horse_mounted_${String(variant + 1).padStart(2, "0")}`,
          "summer",
        ),
      ),
    ),
    loadGeneratedAsset("prop_cf_bee_hive", "summer"),
    loadGeneratedAsset("prop_cf_bee_nest", "summer"),
    loadPlayerRig(),
    loadGeneratedAsset("npc_cf_bartender_bruno", "summer"),
    loadGeneratedAsset("tool_cf_torch_idle", "summer"),
    loadGeneratedAsset("tool_cf_torch_running", "summer"),
    loadGeneratedAsset("hands_cf_torch_idle", "summer"),
    loadGeneratedAsset("hands_cf_torch_running", "summer"),
    loadGeneratedAsset("tool_cf_lantern_idle", "summer"),
    loadGeneratedAsset("tool_cf_lantern_running", "summer"),
    loadGeneratedAsset("hands_cf_lantern_idle", "summer"),
    loadGeneratedAsset("hands_cf_lantern_running", "summer"),
    loadOreArt("resource_cf_ore_", ""),
    loadOreArt("item_cf_", "_ore"),
    loadGeneratedAsset("resource_cf_rock_stone", "summer"),
    loadGeneratedAsset("item_cf_stone", "summer"),
    loadGeneratedAsset("prop_cf_flowers_pink", "summer"),
    loadGeneratedAsset("prop_cf_flowers_gold", "summer"),
    loadGeneratedAsset("prop_cf_poi_stump", "summer"),
    loadGeneratedAsset("prop_cf_poi_fallen_log", "summer"),
    loadGeneratedAsset("prop_cf_poi_rock_small", "summer"),
    loadGeneratedAsset("prop_cf_camp_tent", "summer"),
    loadGeneratedAsset("prop_cf_homestead_tent_marker", "summer"),
    loadGeneratedAsset("prop_cf_homestead_tent_large", "summer"),
    loadGeneratedAsset("prop_cf_campfire", "summer"),
    loadGeneratedAsset("prop_cf_camp_round_stool", "summer"),
    loadGeneratedAsset("prop_cf_camp_bench", "summer"),
    loadGeneratedAsset("prop_cf_camp_stump_seat", "summer"),
    loadGeneratedAsset("prop_cf_camp_chair", "summer"),
    loadGeneratedAsset("prop_cf_camp_fishing_rod", "summer"),
    loadGeneratedAsset("prop_cf_pond", "summer"),
    loadGeneratedAsset("tile_cf_wood_floor", "summer"),
    loadGeneratedAsset("tile_cf_interior_wall", "summer"),
    loadGeneratedAsset("tile_cf_cave_floor", "summer"),
    loadGeneratedAsset("tile_cf_cave_floor_2", "summer"),
    loadGeneratedAsset("tile_cf_cave_floor_decoration", "summer"),
    loadGeneratedAsset("tile_cf_cave_floor_middle", "summer"),
    loadGeneratedAsset("tile_cf_cave_wall", "summer"),
    loadGeneratedAsset("prop_cf_trapdoor", "summer"),
    loadGeneratedAsset("prop_cf_cellar_ladder", "summer"),
    loadGeneratedAsset("prop_cf_interior_door", "summer"),
    loadGeneratedAsset("prop_cf_interior_bed", "summer"),
    loadGeneratedAsset("prop_cf_interior_bookshelf", "summer"),
    loadGeneratedAsset("prop_cf_interior_table", "summer"),
    loadGeneratedAsset("prop_cf_cave_support", "summer"),
    loadGeneratedAsset("tile_cf_grass", "summer"),
    loadGeneratedAsset("tile_cf_grass_cliff_edge", "summer"),
    loadGeneratedAsset("tile_cf_grass_cliff_ramp", "summer"),
    loadGeneratedAsset("tile_cf_stone_cliff_inverse_overlay", "summer"),
    loadGeneratedAsset("tile_cf_path", "summer"),
    loadGeneratedAsset("tile_cf_grass_dirt_cliff_edge", "summer"),
    loadGeneratedAsset("tile_cf_grass_dirt_cliff_ramp", "summer"),
    loadGeneratedAsset("tile_cf_farmland", "summer"),
    loadGeneratedAsset("tile_cf_farmland_wet", "summer"),
    loadGeneratedAsset("tile_cf_farmland_grass_inset", "summer"),
    loadGeneratedAsset("tile_cf_grass_tuft", "summer"),
    loadGeneratedAsset("tile_cf_water", "summer"),
    loadGeneratedAsset("tile_cf_freshwater", "summer"),
    loadGeneratedAsset("tile_cf_freshwater_inset", "summer"),
    loadGeneratedAsset("tile_cf_waterfall", "summer"),
    loadGeneratedAsset("tile_cf_waterfall_flow", "summer"),
    loadGeneratedAsset("tile_cf_water_rock_flow", "summer"),
    loadGeneratedAsset("tile_cf_beach", "summer"),
    loadGeneratedAsset("tile_cf_beach_inset", "summer"),
    loadGeneratedAsset("tile_cf_desert", "summer"),
    loadGeneratedAsset("tile_cf_desert_shore", "summer"),
    loadGeneratedAsset("tile_cf_desert_shore_inset", "summer"),
    loadGeneratedAsset("tile_cf_desert_grass", "summer"),
    loadGeneratedAsset("tile_cf_desert_grass_edge", "summer"),
    loadGeneratedAsset("tile_cf_desert_grass_inset", "summer"),
    loadGeneratedAsset("tile_cf_savanna_grass_inset", "summer"),
    loadGeneratedAsset("tile_cf_stone_cliff_variants", "summer"),
    loadGeneratedAsset("tile_cf_stone_cliff_2", "summer"),
    loadGeneratedAsset("tile_cf_stone_cliff_3", "summer"),
    loadGeneratedAsset("tile_cf_stone_cliff_3_overlay", "summer"),
    loadGeneratedAsset("tile_cf_stone_cliff_4", "summer"),
    loadGeneratedAsset("tile_cf_desert_cliff", "summer"),
    loadGeneratedAsset("icon_cf_axe", "summer"),
    loadGeneratedAsset("icon_cf_hoe", "summer"),
    loadGeneratedAsset("icon_cf_pickaxe", "summer"),
    loadGeneratedAsset("icon_cf_watering_can", "summer"),
    loadGeneratedAsset("icon_cf_bow", "summer"),
    loadGeneratedAsset("icon_cf_shovel", "summer"),
    loadGeneratedAsset("icon_cf_hammer", "summer"),
    loadGeneratedAsset("icon_cf_sword", "summer"),
    loadGeneratedAsset("item_cf_arrow", "summer"),
    loadGeneratedAsset("item_cf_wood", "summer"),
    loadGeneratedAsset("item_cf_plank", "summer"),
    loadGeneratedAsset("item_cf_stick", "summer"),
    loadGeneratedAsset("item_cf_torch", "summer"),
    loadGeneratedAsset("item_cf_lantern", "summer"),
    loadGeneratedAsset("icon_cf_effect_orchard_tea", "summer"),
    loadGeneratedAsset("prop_cf_chest", "summer"),
    loadGeneratedAsset("prop_cf_archery_target", "summer"),
    loadGeneratedAsset("system_missing_asset", "summer"),
    loadGeneratedAsset("effect_cf_rain_streak", "summer"),
    loadGeneratedAsset("effect_cf_rain_splash", "summer"),
    loadGeneratedAsset("effect_cf_cloud_shadow", "summer"),
    loadGeneratedAsset("effect_cf_wind_gust", "summer"),
    loadGeneratedAsset("effect_cf_leaf_oak", "summer"),
    loadGeneratedAsset("effect_cf_leaf_birch", "summer"),
    loadGeneratedAsset("effect_cf_leaf_spruce", "summer"),
    loadGeneratedAsset("tile_cf_water_ripples", "summer"),
    loadGeneratedAsset("tree_cf_fruit_fruiting", "summer"),
    loadGeneratedAsset("tree_cf_fruit_mature", "summer"),
    loadGeneratedAsset("tree_cf_oak_mature", "summer"),
    loadGeneratedAsset("tree_cf_birch_mature", "summer"),
    loadGeneratedAsset("tree_cf_spruce_mature", "summer"),
    loadGeneratedAsset("tree_cf_acacia_mature", "summer"),
    loadGeneratedAsset("tree_cf_palm_mature", "summer"),
    loadGeneratedAsset("tree_cf_fruit_small", "summer"),
    loadGeneratedAsset("tree_cf_fruit_medium", "summer"),
    loadGeneratedAsset("tree_cf_oak_sapling", "summer"),
    loadGeneratedAsset("tree_cf_oak_young", "summer"),
    loadGeneratedAsset("tree_cf_birch_sapling", "summer"),
    loadGeneratedAsset("tree_cf_birch_young", "summer"),
    loadGeneratedAsset("tree_cf_spruce_sapling", "summer"),
    loadGeneratedAsset("tree_cf_spruce_young", "summer"),
    loadGeneratedAsset("tree_cf_oak_stump_small", "summer"),
    loadGeneratedAsset("tree_cf_oak_stump_medium", "summer"),
    loadGeneratedAsset("tree_cf_oak_stump", "summer"),
    loadGeneratedAsset("tree_cf_birch_stump_small", "summer"),
    loadGeneratedAsset("tree_cf_birch_stump_medium", "summer"),
    loadGeneratedAsset("tree_cf_birch_stump", "summer"),
    loadGeneratedAsset("tree_cf_spruce_stump_small", "summer"),
    loadGeneratedAsset("tree_cf_spruce_stump_medium", "summer"),
    loadGeneratedAsset("tree_cf_spruce_stump", "summer"),
    loadGeneratedAsset("tree_cf_fruit_stump_small", "summer"),
    loadGeneratedAsset("tree_cf_fruit_stump_medium", "summer"),
    loadGeneratedAsset("tree_cf_fruit_stump", "summer"),
    loadGeneratedAsset("tree_cf_acacia_stump", "summer"),
    loadGeneratedAsset("tree_cf_palm_stump", "summer"),
    loadGeneratedAsset("resource_cf_cactus", "summer"),
    loadPixelUi(),
    loadUiSkin(),
    loadItemIconArt(),
    loadCropArt(),
    loadGeneratedAsset('ui_cf_crop_timer', 'summer'),
  ]);
  return {
    avatar,
    avatarAxe,
    horse,
    mountedHorse,
    wildlife,
    mountedHorses,
    beeHive,
    beeNest,
    playerRig,
    merchantNpc,
    heldLights: {
      torch: {
        idle: torchIdle,
        running: torchRunning,
        idleHands: torchIdleHands,
        runningHands: torchRunningHands,
      },
      lantern: {
        idle: lanternIdle,
        running: lanternRunning,
        idleHands: lanternIdleHands,
        runningHands: lanternRunningHands,
      },
    },
    actionAssets: {
      swing_axe: axeActionTool,
      swing_sword: swordActionTool,
      swing_pickaxe: pickaxeActionTool,
      swing_hoe: hoeActionTool,
      water: wateringCanActionTool,
      ranged_weapon: bowActionTool,
    },
    oreNodes,
    oreItems,
    itemIcons,
    crops,
    cropTimer,
    rockStone,
    woodFloor,
    interiorWall,
    caveFloor,
    caveFloor2,
    caveFloorDecoration,
    caveFloorMiddle,
    caveWall,
    caveSupport,
    poiDecorations: {
      poi_flowers_pink: poiFlowersPink,
      poi_flowers_gold: poiFlowersGold,
      poi_stump: poiStump,
      poi_fallen_log: poiFallenLog,
      poi_rock_small: poiRockSmall,
      camp_tent: campTent,
      homestead_tent_marker: homesteadTentMarker,
      homestead_tent_large: homesteadTentLarge,
      camp_campfire: campfire,
      camp_round_stool: campRoundStool,
      camp_bench: campBench,
      camp_stump_seat: campStumpSeat,
      camp_chair: campChair,
      camp_pond: campPond,
      camp_fishing_rod: campFishingRod,
      camp_rock: poiRockSmall,
      camp_flowers: poiFlowersPink,
      residence_trapdoor: trapdoor,
      residence_door: interiorDoor,
      residence_bed: interiorBed,
      residence_bookshelf: interiorBookshelf,
      marlow_tent_table: interiorTable,
      cellar_ladder: cellarLadder,
      cellar_support: caveSupport,
    },
    natureDecorations,
    oceanSurfaceDecorations,
    fruitTrees,
    fruitItems,
    grass,
    grassCliffEdge,
    grassCliffRamp,
    stoneCliffInverseOverlay,
    dirtTerrace,
    dirtCliffEdge,
    dirtCliffRamp,
    farmland,
    farmlandWet,
    farmlandGrassInset,
    grassTuft,
    water,
    freshwater,
    freshwaterInset,
    waterfall,
    waterfallFlow,
    waterRockFlow,
    beach,
    beachInset,
    desert,
    desertShore,
    desertShoreInset,
    desertGrass,
    desertGrassEdge,
    desertGrassInset,
    savannaGrassInset,
    cliff,
    cliff2,
    cliff3,
    coastalCliffOverlay,
    cliff4,
    desertCliff,
    iconAxe,
    iconHoe,
    iconPickaxe,
    iconWateringCan,
    iconBow,
    iconShovel,
    iconHammer,
    iconSword,
    itemArrow,
    itemWood,
    itemPlank,
    itemStick,
    itemStone,
    itemTorch,
    itemLantern,
    itemOrchardTea,
    chest,
    archeryTarget,
    missingItem,
    rainStreak,
    rainSplash,
    cloudShadow,
    windGust,
    oakLeaf,
    birchLeaf,
    spruceLeaf,
    waterRipples,
    treeFruiting,
    treeMature,
    treeOak,
    treeBirch,
    treeSpruce,
    treeAcacia,
    treePalm,
    treeSapling,
    treeYoung,
    treeOakSapling,
    treeOakYoung,
    treeBirchSapling,
    treeBirchYoung,
    treeSpruceSapling,
    treeSpruceYoung,
    treeStumpSmall,
    treeStumpMedium,
    treeStump,
    treeBirchStumpSmall,
    treeBirchStumpMedium,
    treeBirchStump,
    treeSpruceStumpSmall,
    treeSpruceStumpMedium,
    treeSpruceStump,
    treeFruitStumpSmall,
    treeFruitStumpMedium,
    treeFruitStump,
    treeAcaciaStump,
    treePalmStump,
    cactus,
    ui,
    uiSkin,
  };
}

export function isOverworldRoad(tileX: number, tileY: number): boolean {
  const vertical =
    tileX > 0 && tileX < 79 && (tileX % 16 === 15 || tileX % 16 === 0);
  const horizontal =
    tileY > 0 && tileY < 79 && (tileY % 16 === 15 || tileY % 16 === 0);
  return vertical || horizontal;
}

function frame(
  asset: LoadedAsset,
  animation = "base",
  index = 0,
): AtlasFrame | null {
  return selectAtlasFrame(asset.metadata, animation, index);
}

function drawAnchored(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  animation: string,
  frameIndex: number,
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  flipX = false,
  dimmed = false,
): void {
  const source = frame(asset, animation, frameIndex);
  if (source === null) return;
  const anchorX = flipX ? source.width - 1 - asset.anchor[0] : asset.anchor[0];
  const x = Math.round((worldX - cameraX - anchorX) * zoom);
  const y = Math.round((worldY - cameraY - asset.anchor[1]) * zoom);
  context.save();
  if (dimmed) {
    context.filter = "brightness(42%) saturate(55%)";
    context.globalAlpha *= 0.88;
  }
  if (flipX) {
    context.translate(x + source.width * zoom, 0);
    context.scale(-1, 1);
    context.drawImage(
      asset.image,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      y,
      source.width * zoom,
      source.height * zoom,
    );
  } else {
    context.drawImage(
      asset.image,
      source.x,
      source.y,
      source.width,
      source.height,
      x,
      y,
      source.width * zoom,
      source.height * zoom,
    );
  }
  context.restore();
}

function drawAnchoredBand(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  animation: string,
  frameIndex: number,
  startRow: number,
  endRow: number,
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  flipX = false,
): void {
  const source = frame(asset, animation, frameIndex);
  if (source === null) return;
  const start = Math.max(0, Math.min(source.height, Math.floor(startRow)));
  const end = Math.max(start, Math.min(source.height, Math.floor(endRow)));
  if (start === end) return;
  const anchorX = flipX ? source.width - 1 - asset.anchor[0] : asset.anchor[0];
  const x = Math.round((worldX - cameraX - anchorX) * zoom);
  const y = Math.round((worldY - cameraY - asset.anchor[1] + start) * zoom);
  const height = end - start;
  context.save();
  if (flipX) {
    context.translate(x + source.width * zoom, 0);
    context.scale(-1, 1);
    context.drawImage(
      asset.image,
      source.x,
      source.y + start,
      source.width,
      height,
      0,
      y,
      source.width * zoom,
      height * zoom,
    );
  } else {
    context.drawImage(
      asset.image,
      source.x,
      source.y + start,
      source.width,
      height,
      x,
      y,
      source.width * zoom,
      height * zoom,
    );
  }
  context.restore();
}

function drawAnchoredTreeSway(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  swayX: number,
  swayY: number,
): void {
  const source = frame(asset, "base", 0);
  if (source === null) return;
  if (swayX === 0 && swayY === 0) {
    drawAnchored(
      context,
      asset,
      "base",
      0,
      worldX,
      worldY,
      cameraX,
      cameraY,
      zoom,
    );
    return;
  }
  const destinationX = Math.round((worldX - cameraX - asset.anchor[0]) * zoom);
  const destinationY = Math.round((worldY - cameraY - asset.anchor[1]) * zoom);
  const pivotX = Math.round((worldX - cameraX) * zoom);
  const pivotY = Math.round((worldY - cameraY) * zoom);
  const horizontalShear = -swayX / Math.max(1, asset.anchor[1]);
  const verticalScale = 1 - swayY / Math.max(1, asset.anchor[1]);
  context.save();
  context.translate(pivotX, pivotY);
  // One foot-anchored draw bends the crown while keeping every translucent pixel
  // single-composited. This avoids the dark seams produced by overlapping bands.
  context.transform(1, 0, horizontalShear, verticalScale, 0, 0);
  context.translate(-pivotX, -pivotY);
  context.drawImage(
    asset.image,
    source.x,
    source.y,
    source.width,
    source.height,
    destinationX,
    destinationY,
    source.width * zoom,
    source.height * zoom,
  );
  context.restore();
}

function drawAnchoredScaled(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  assetScale: number,
): void {
  const source = frame(asset, "base", 0);
  if (source === null) return;
  const destinationWidth = source.width * zoom * assetScale;
  const destinationHeight = source.height * zoom * assetScale;
  const destinationX = Math.round(
    (worldX - cameraX) * zoom - asset.anchor[0] * zoom * assetScale,
  );
  const destinationY = Math.round(
    (worldY - cameraY) * zoom - asset.anchor[1] * zoom * assetScale,
  );
  context.drawImage(
    asset.image,
    source.x,
    source.y,
    source.width,
    source.height,
    destinationX,
    destinationY,
    destinationWidth,
    destinationHeight,
  );
}

export function drawUiAsset(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  x: number,
  y: number,
  scale = 1,
): void {
  const source = frame(asset);
  if (source === null) return;
  context.drawImage(
    asset.image,
    source.x,
    source.y,
    source.width,
    source.height,
    Math.round(x),
    Math.round(y),
    source.width * scale,
    source.height * scale,
  );
}

export function drawUiAssetFrame(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  frameIndex: number,
  x: number,
  y: number,
  scale = 1,
): void {
  const source = frame(asset, 'base', frameIndex);
  if (source === null) return;
  context.drawImage(
    asset.image,
    source.x,
    source.y,
    source.width,
    source.height,
    Math.round(x),
    Math.round(y),
    source.width * scale,
    source.height * scale,
  );
}

export function drawOverworldCrop(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  cropKind: string,
  stage: number,
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  drawAnchored(
    context,
    art.crops[cropKind] ?? art.missingItem,
    'base',
    Math.max(0, Math.min(3, Math.floor(stage))),
    x,
    y,
    cameraX,
    cameraY,
    zoom,
  );
}

export { sortWorldDepthItems as sortWorldDrawItems } from "./render/renderer.js";

export function drawOverworldTree(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  fruiting: boolean,
  cameraX: number,
  cameraY: number,
  zoom: number,
  kind = "tree",
  swayX = 0,
  swayY = 0,
): void {
  if (kind === "cactus") {
    drawAnchored(
      context,
      art.cactus,
      "base",
      0,
      x,
      y + 4,
      cameraX,
      cameraY,
      zoom,
    );
    return;
  }
  const tree =
    art.fruitTrees[kind] ??
    (fruiting
      ? art.treeFruiting
      : kind === "tree_oak"
        ? art.treeOak
        : kind === "tree_birch"
          ? art.treeBirch
          : kind === "tree_spruce"
            ? art.treeSpruce
            : kind === "tree_acacia"
              ? art.treeAcacia
              : kind === "tree_palm"
                ? art.treePalm
                : art.treeMature);
  drawAnchoredTreeSway(
    context,
    tree,
    x,
    y + 4,
    cameraX,
    cameraY,
    zoom,
    swayX,
    swayY,
  );
}

export function drawOverworldStump(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  kind = "tree",
  stage: TreeGrowthStage = "big",
): void {
  if (kind === "cactus") {
    drawAnchoredScaled(context, art.cactus, x, y, cameraX, cameraY, zoom, 0.35);
    return;
  }
  const small = stage === "small";
  const medium = stage === "medium";
  const stump =
    kind === "tree_birch"
      ? small
        ? art.treeBirchStumpSmall
        : medium
          ? art.treeBirchStumpMedium
          : art.treeBirchStump
      : kind === "tree_spruce"
        ? small
          ? art.treeSpruceStumpSmall
          : medium
            ? art.treeSpruceStumpMedium
            : art.treeSpruceStump
        : kind === "tree_acacia"
          ? art.treeAcaciaStump
          : kind === "tree_palm"
            ? art.treePalmStump
            : kind === "tree_apple" ||
                kind === "tree_pear" ||
                kind === "tree_peach" ||
                kind === "tree_cherry"
              ? small
                ? art.treeFruitStumpSmall
                : medium
                  ? art.treeFruitStumpMedium
                  : art.treeFruitStump
              : small
                ? art.treeStumpSmall
                : medium
                  ? art.treeStumpMedium
                  : art.treeStump;
  if ((kind === "tree_acacia" || kind === "tree_palm") && stage !== "big") {
    drawAnchoredScaled(
      context,
      stump,
      x,
      y,
      cameraX,
      cameraY,
      zoom,
      small ? 0.5 : 0.75,
    );
  } else {
    drawAnchored(context, stump, "base", 0, x, y, cameraX, cameraY, zoom);
  }
}

export function drawOverworldTreeRegrowth(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  kind: string,
  stage: Exclude<TreeGrowthStage, "big">,
): void {
  const sapling = stage === "small";
  if (kind === "cactus") {
    drawAnchoredScaled(
      context,
      art.cactus,
      x,
      y,
      cameraX,
      cameraY,
      zoom,
      sapling ? 0.55 : 0.76,
    );
    return;
  }
  const authored =
    kind === "tree_oak"
      ? sapling
        ? art.treeOakSapling
        : art.treeOakYoung
      : kind === "tree_birch"
        ? sapling
          ? art.treeBirchSapling
          : art.treeBirchYoung
        : kind === "tree_spruce"
          ? sapling
            ? art.treeSpruceSapling
            : art.treeSpruceYoung
          : kind === "tree_acacia" || kind === "tree_palm"
            ? null
            : sapling
              ? art.treeSapling
              : art.treeYoung;
  if (authored !== null) {
    drawAnchored(context, authored, "base", 0, x, y, cameraX, cameraY, zoom);
    return;
  }
  const mature = kind === "tree_acacia" ? art.treeAcacia : art.treePalm;
  drawAnchoredScaled(
    context,
    mature,
    x,
    y,
    cameraX,
    cameraY,
    zoom,
    sapling ? 0.5 : 0.75,
  );
}

export function drawOverworldOreNode(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  kind: string,
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  drawAnchored(
    context,
    art.oreNodes[kind] ?? art.missingItem,
    "base",
    0,
    x,
    y,
    cameraX,
    cameraY,
    zoom,
  );
}

export function drawOverworldRock(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  drawAnchored(context, art.rockStone, "base", 0, x, y, cameraX, cameraY, zoom);
}

/** Vegetation holds its authored rest frame in calm weather. Fish keep
 * swimming and water around rocks keeps flowing independently of the wind. */
export function natureDecorationFrame(
  kind: string,
  renderTick: number,
  animationOffset: number,
  windStrength: number,
): number {
  const animatedFrame = Math.floor((renderTick + animationOffset) / 5);
  if (kind === "camp_campfire") return animatedFrame;
  if (kind === "nature_fish_shadow" || kind === "nature_water_rock")
    return animatedFrame;
  return kind.startsWith("nature_") && windStrength < 0.3 ? 0 : animatedFrame;
}

/** Returns the painter-sort line for a POI sprite's authored ground anchor.
 * A tent becomes foreground at the top of its walkable entrance row rather
 * than at the sprite's bottom edge, matching its authoritative collision. */
export function overworldPoiDecorationDepthY(
  kind: string,
  anchorY: number,
): number {
  if (
    kind === "camp_tent" ||
    kind === "homestead_tent_marker" ||
    kind === "homestead_tent_large"
  ) {
    return anchorY - 16;
  }
  if (kind === "camp_pond") return anchorY - 48;
  return anchorY;
}

export function drawOverworldPoiDecoration(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  kind: string,
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  variant = 0,
  frameIndex = 0,
  lit = true,
): void {
  const nature = art.natureDecorations[kind];
  if (nature !== undefined && nature.length > 0) {
    const asset = nature[variant % nature.length]!;
    const animation = frame(asset, "sway") === null ? "base" : "sway";
    drawAnchored(
      context,
      asset,
      animation,
      animation === "sway" ? frameIndex : 0,
      x,
      y,
      cameraX,
      cameraY,
      zoom,
    );
    return;
  }
  drawAnchored(
    context,
    art.poiDecorations[kind] ?? art.missingItem,
    kind === "camp_campfire" ? (lit ? "burn" : "off") : "base",
    kind === "camp_campfire" && lit ? frameIndex : 0,
    x,
    y,
    cameraX,
    cameraY,
    zoom,
  );
}

export function drawOverworldItem(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  itemKind: string,
  x: number,
  y: number,
  arcHeight: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  lit = true,
): void {
  drawAnchored(
    context,
    art.oreItems[itemKind] ??
      art.fruitItems[itemKind] ??
      art.itemIcons[itemKind] ??
      art.missingItem,
    "base",
    0,
    x,
    y - arcHeight,
    cameraX,
    cameraY,
    zoom,
    false,
    itemKind === "lantern" && !lit,
  );
}

export function drawOverworldPlaceable(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  kind: string,
  open: boolean,
  fenceMask: number,
  frameIndex: number,
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  lit = true,
): void {
  const northSouth = fenceMask & (FENCE_JOIN_NORTH | FENCE_JOIN_SOUTH);
  const eastWest = fenceMask & (FENCE_JOIN_EAST | FENCE_JOIN_WEST);
  if (kind === "fence" && northSouth !== 0 && eastWest !== 0) {
    const vertical = art.itemIcons.fence_vertical;
    const horizontalEnd =
      art.itemIcons[
        fenceMask & FENCE_JOIN_EAST ? "fence_corner" : "fence_left_end"
      ];
    if (vertical !== undefined)
      drawAnchored(context, vertical, "base", 0, x, y, cameraX, cameraY, zoom);
    if (horizontalEnd !== undefined)
      drawAnchored(
        context,
        horizontalEnd,
        "base",
        0,
        x,
        y,
        cameraX,
        cameraY,
        zoom,
      );
    return;
  }
  const asset =
    kind === "fence"
      ? art.itemIcons[
          northSouth !== 0 && eastWest === 0
            ? "fence_vertical"
            : eastWest !== 0 && northSouth === 0
              ? "fence_horizontal"
              : "fence_corner"
        ]
      : art.itemIcons[kind];
  const animation =
    kind === "campfire"
      ? lit
        ? "burn"
        : "off"
      : kind === "fence_gate"
        ? open
          ? "open"
          : "closed"
        : kind === "barrel"
          ? open
            ? "open"
            : "closed"
        : kind === "furnace"
          ? lit
            ? "burn"
            : "off"
        : (itemDefinition(kind)?.iconAnimation ?? "base");
  const resolvedAsset = asset ?? art.missingItem;
  const visualScale = overworldPlaceableVisualScale(kind);
  if (visualScale === 1) {
    drawAnchored(
      context,
      resolvedAsset,
      animation,
      lit ? frameIndex : 0,
      x,
      y,
      cameraX,
      cameraY,
      zoom,
    );
  } else {
    drawAnchoredScaled(
      context,
      resolvedAsset,
      x,
      y,
      cameraX,
      cameraY,
      zoom,
      visualScale,
    );
  }
}

/** Large licensed prop sheets are normalized to their authoritative tile
 * footprint when placed in the world. Inventory icons retain their native art. */
export function overworldPlaceableVisualScale(kind: string): number {
  return kind === "workbench" ? 0.5 : 1;
}

/** A tiny palette-matched arrow is rotated around its shaft so aiming is not
 * artificially limited to the character sheet's eight directional poses. */
export function drawOverworldArrow(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  velocityX: number,
  velocityY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  hit: boolean,
): void {
  const screenX = Math.round((x - cameraX) * zoom);
  const screenY = Math.round((y - cameraY) * zoom);
  context.save();
  context.translate(screenX, screenY);
  context.scale(zoom, zoom);
  context.rotate(Math.atan2(velocityY, velocityX));
  const source = frame(art.itemArrow);
  if (source !== null)
    context.drawImage(
      art.itemArrow.image,
      source.x,
      source.y,
      source.width,
      source.height,
      -art.itemArrow.anchor[0],
      -art.itemArrow.anchor[1],
      source.width,
      source.height,
    );
  if (hit) {
    context.fillStyle = "#f4dfb5";
    context.fillRect(7, -2, 1, 1);
    context.fillRect(8, 0, 1, 1);
    context.fillRect(7, 2, 1, 1);
  }
  context.restore();
}

export function drawOverworldChest(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  frameIndex = 0,
): void {
  drawAnchored(
    context,
    art.chest,
    "chest",
    frameIndex,
    x,
    y,
    cameraX,
    cameraY,
    zoom,
  );
}

export function drawOverworldArcheryTarget(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  drawAnchored(
    context,
    art.archeryTarget,
    "base",
    0,
    x,
    y,
    cameraX,
    cameraY,
    zoom,
  );
}

/** Item UI and ground-drop art share the canonical item registry key. */
export function overworldItemIconKey(itemKind: string): string {
  return itemDefinition(itemKind)?.iconKey ?? "system_missing_asset";
}

export function drawOverworldAvatar(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  facing: Direction,
  moving: boolean,
  locomotionFrame: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  actionFrame: number | null,
  actionVisual: ActionVisual | null = null,
  appearance: PlayerAppearanceVisual = DEFAULT_PLAYER_APPEARANCE,
  heldItemKind = "empty",
  heldLightAnimationFrame = 0,
  heldLightLit = true,
): void {
  const heldLight =
    heldItemKind === "torch" || heldItemKind === "lantern"
      ? art.heldLights[heldItemKind]
      : null;
  const animation =
    heldLight === null
      ? avatarAnimationForDirection(facing)
      : heldLightAnimationForDirection(facing, true);
  const frameIndex = moving ? locomotionFrame : 0;
  const flip =
    facing === "left" || facing === "upLeft" || facing === "downLeft";
  if (actionFrame === null || actionVisual === null) {
    const modularAnimation =
      heldLight === null
        ? moving
          ? animation
          : idleAvatarAnimationForDirection(facing)
        : heldLightAnimationForDirection(facing, moving);
    const lightAsset =
      heldLight === null ? null : moving ? heldLight.running : heldLight.idle;
    const lightHands =
      heldLight === null
        ? null
        : moving
          ? heldLight.runningHands
          : heldLight.idleHands;
    // Locomotion chooses the torch/lantern pose, but flame animation remains
    // on its continuous cosmetic clock. Coupling it to distance-stepped walk
    // frames makes the flame strobe whenever the player starts moving.
    const lightFrames = heldLightFrameIndices(
      moving,
      frameIndex,
      heldLightAnimationFrame,
    );
    const drawHeldLight = (): void => {
      if (lightAsset !== null)
        drawAnchored(
          context,
          lightAsset,
          modularAnimation,
          lightFrames.light,
          x,
          y,
          cameraX,
          cameraY,
          zoom,
          flip,
          heldItemKind === "lantern" && !heldLightLit,
        );
    };
    if (facing === "up") drawHeldLight();
    const layers = playerLayersForAppearance(
      art,
      appearance,
      false,
      heldLight !== null,
      lightHands,
    );
    for (const [index, layer] of layers.entries()) {
      // For forward/side poses the prop sits above the body but below its
      // dedicated gripping hands. Up-facing props remain behind the body.
      if (index === 4 && facing !== "up") drawHeldLight();
      drawAnchored(
        context,
        layer,
        modularAnimation,
        layer === lightHands ? lightFrames.hands : frameIndex,
        x,
        y,
        cameraX,
        cameraY,
        zoom,
        flip,
      );
    }
    return;
  }
  const walkingBow =
    moving && actionVisual.animation.startsWith("ranged_weapon_");
  const actionY = walkingBow ? y + bowLocomotionBobOffset(locomotionFrame) : y;
  const toolAnimation = actionVisual.toolAnimation;
  const drawTool = (): void =>
    drawAnchored(
      context,
      actionVisual.asset,
      toolAnimation,
      actionFrame,
      x,
      actionY,
      cameraX,
      cameraY,
      zoom,
      actionToolFlipsForDirection(facing),
    );
  if (facing === "up") drawTool();
  if (walkingBow) {
    const locomotionLayers = playerLayersForAppearance(art, appearance, false);
    const actionLayers = playerLayersForAppearance(
      art,
      appearance,
      false,
      true,
    );
    drawAnchoredBand(
      context,
      locomotionLayers[0]!,
      animation,
      locomotionFrame,
      BOW_LOCOMOTION_SPLIT_ROW,
      40,
      x,
      y,
      cameraX,
      cameraY,
      zoom,
      flip,
    );
    drawAnchoredBand(
      context,
      actionLayers[0]!,
      actionVisual.animation,
      actionFrame,
      0,
      BOW_LOCOMOTION_SPLIT_ROW,
      x,
      actionY,
      cameraX,
      cameraY,
      zoom,
      flip,
    );
    drawAnchored(
      context,
      locomotionLayers[1]!,
      animation,
      locomotionFrame,
      x,
      y,
      cameraX,
      cameraY,
      zoom,
      flip,
    );
    drawAnchored(
      context,
      actionLayers[2]!,
      actionVisual.animation,
      actionFrame,
      x,
      actionY,
      cameraX,
      cameraY,
      zoom,
      flip,
    );
    drawAnchored(
      context,
      locomotionLayers[3]!,
      animation,
      locomotionFrame,
      x,
      y,
      cameraX,
      cameraY,
      zoom,
      flip,
    );
    for (const layer of actionLayers.slice(4)) {
      drawAnchored(
        context,
        layer,
        actionVisual.animation,
        actionFrame,
        x,
        actionY,
        cameraX,
        cameraY,
        zoom,
        flip,
      );
    }
  } else {
    for (const layer of playerLayersForAppearance(
      art,
      appearance,
      false,
      true,
    )) {
      drawAnchored(
        context,
        layer,
        actionVisual.animation,
        actionFrame,
        x,
        actionY,
        cameraX,
        cameraY,
        zoom,
        flip,
      );
    }
  }
  if (facing !== "up") drawTool();
}

export function drawOverworldMerchant(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  facing: Direction,
  moving: boolean,
  animationFrame: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  const animation = moving
    ? avatarAnimationForDirection(facing)
    : idleAvatarAnimationForDirection(facing);
  const flip =
    facing === "left" || facing === "upLeft" || facing === "downLeft";
  drawAnchored(
    context,
    art.merchantNpc,
    animation,
    animationFrame,
    x,
    y,
    cameraX,
    cameraY,
    zoom,
    flip,
  );
}

export function merchantWorldBounds(
  art: OverworldArt,
  x: number,
  y: number,
  facing: Direction,
  moving: boolean,
  animationFrame: number,
): WorldVisualBounds | null {
  const animation = moving
    ? avatarAnimationForDirection(facing)
    : idleAvatarAnimationForDirection(facing);
  const flip =
    facing === "left" || facing === "upLeft" || facing === "downLeft";
  return anchoredVisualBounds(
    art.merchantNpc,
    animation,
    animationFrame,
    x,
    y,
    flip,
  );
}

export const BOW_LOCOMOTION_SPLIT_ROW = 28;

export function bowLocomotionBobOffset(frameIndex: number): number {
  const frame = ((Math.floor(frameIndex) % 6) + 6) % 6;
  return frame % 3;
}

export function playerLayersForAppearance(
  art: OverworldArt,
  appearance: PlayerAppearanceVisual,
  mounted: boolean,
  action = false,
  handsOverride: LoadedAsset | null = null,
): readonly LoadedAsset[] {
  const pose = action ? "action" : mounted ? "mounted" : "standing";
  const fallback = DEFAULT_PLAYER_APPEARANCE;
  const hair =
    art.playerRig.hair[appearance.hairKind] ??
    art.playerRig.hair[fallback.hairKind];
  const shirt =
    art.playerRig.shirts[appearance.shirtKind] ??
    art.playerRig.shirts[fallback.shirtKind];
  const pants =
    art.playerRig.pants[appearance.pantsKind] ??
    art.playerRig.pants[fallback.pantsKind];
  const shoes =
    art.playerRig.shoes[appearance.shoesKind] ??
    art.playerRig.shoes[fallback.shoesKind];
  return [
    art.playerRig.base[pose],
    pants![pose],
    shirt![pose],
    shoes![pose],
    handsOverride ?? art.playerRig.hands[pose],
    hair![pose],
  ];
}

export function heldLightAnimationForDirection(
  facing: Direction,
  moving: boolean,
):
  | "hold_idle_up"
  | "hold_idle_right"
  | "hold_idle_down"
  | "hold_walk_up"
  | "hold_walk_right"
  | "hold_walk_down" {
  const motion = moving ? "hold_walk" : "hold_idle";
  if (facing === "up") return `${motion}_up`;
  if (facing === "down") return `${motion}_down`;
  return `${motion}_right`;
}

export function heldLightFrameIndices(
  moving: boolean,
  locomotionFrame: number,
  flameFrame: number,
): { readonly light: number; readonly hands: number } {
  return { light: flameFrame, hands: moving ? locomotionFrame : 0 };
}

/** Draws the same modular appearance used in-world into the authored HUD
 * portrait well. Cropping the standing down pose preserves hair, skin and
 * clothing without maintaining a second set of avatar thumbnails. */
export function drawPlayerHeadPortrait(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  appearance: PlayerAppearanceVisual,
  destination: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): void {
  context.imageSmoothingEnabled = false;
  const portraitSize = Math.max(
    1,
    Math.min(destination.width, destination.height),
  );
  const portraitX = Math.round(
    destination.x + (destination.width - portraitSize) / 2,
  );
  const portraitY = Math.round(
    destination.y + (destination.height - portraitSize) / 2,
  );
  for (const layer of playerLayersForAppearance(art, appearance, false)) {
    const frame = selectAtlasFrame(layer.metadata, "idle_down", 0);
    if (frame === null) continue;
    const cropWidth = Math.min(16, frame.width);
    const cropHeight = Math.min(16, frame.height);
    const cropX =
      frame.x + Math.max(0, Math.floor((frame.width - cropWidth) / 2) - 1);
    const cropY =
      frame.y + Math.min(Math.max(0, frame.height - cropHeight), 12);
    context.drawImage(
      layer.image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      portraitX,
      portraitY,
      portraitSize,
      portraitSize,
    );
  }
}

/** Full modular avatar preview used by the character sheet. It deliberately
 * consumes the same authored layer stack and idle animations as the world
 * renderer so customization never maintains a second paper-doll asset path. */
export function drawPlayerPaperDoll(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  appearance: PlayerAppearanceVisual,
  facing: Direction,
  destination: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): void {
  const animation = idleAvatarAnimationForDirection(facing);
  const layers = playerLayersForAppearance(art, appearance, false);
  const reference = selectAtlasFrame(layers[0]!.metadata, animation, 0);
  if (reference === null) return;
  const scale = Math.max(1, Math.floor(Math.min(
    destination.width / reference.width,
    destination.height / reference.height,
  )));
  const width = reference.width * scale;
  const height = reference.height * scale;
  const x = Math.round(destination.x + (destination.width - width) / 2);
  const y = Math.round(destination.y + destination.height - height);
  const flip = facing === 'left';
  context.save();
  context.imageSmoothingEnabled = false;
  if (flip) {
    context.translate(x + width, 0);
    context.scale(-1, 1);
  }
  for (const layer of layers) {
    const frame = selectAtlasFrame(layer.metadata, animation, 0);
    if (frame === null) continue;
    context.drawImage(
      layer.image,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      flip ? 0 : x,
      y,
      width,
      height,
    );
  }
  context.restore();
}

const npcPortraitBounds = new Map<string, AtlasFrame>();

function opaquePortraitFrame(
  asset: LoadedAsset,
  frame: AtlasFrame,
): AtlasFrame {
  const key = `${asset.assetId}:${frame.x}:${frame.y}:${frame.width}:${frame.height}`;
  const cached = npcPortraitBounds.get(key);
  if (cached !== undefined) return cached;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) return frame;
    context.drawImage(
      asset.image,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      0,
      0,
      frame.width,
      frame.height,
    );
    const pixels = context.getImageData(0, 0, frame.width, frame.height).data;
    let left = frame.width;
    let right = -1;
    let top = frame.height;
    let bottom = -1;
    for (let y = 0; y < frame.height; y += 1)
      for (let x = 0; x < frame.width; x += 1) {
        if ((pixels[(y * frame.width + x) * 4 + 3] ?? 0) === 0) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    if (right < left || bottom < top) return frame;
    const cropped = {
      x: frame.x + left,
      y: frame.y + top,
      width: right - left + 1,
      height: bottom - top + 1,
      durationTicks: frame.durationTicks,
    };
    npcPortraitBounds.set(key, cropped);
    return cropped;
  } catch {
    return frame;
  }
}

export interface WorldVisualBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Resolves the visible pixels of an anchored atlas frame back into world
 * coordinates. This keeps selection brackets attached to padded and airborne
 * sprites instead of assuming every creature fills a box above its feet. */
function anchoredVisualBounds(
  asset: LoadedAsset,
  animation: string,
  frameIndex: number,
  worldX: number,
  worldY: number,
  flipX: boolean,
): WorldVisualBounds | null {
  const source = frame(asset, animation, frameIndex);
  if (source === null) return null;
  const visible = opaquePortraitFrame(asset, source);
  const localLeft = visible.x - source.x;
  const localTop = visible.y - source.y;
  const anchorX = flipX ? source.width - 1 - asset.anchor[0] : asset.anchor[0];
  const frameLeft = worldX - anchorX;
  const left = flipX
    ? frameLeft + source.width - localLeft - visible.width
    : frameLeft + localLeft;
  return {
    left,
    top: worldY - asset.anchor[1] + localTop,
    right: left + visible.width,
    bottom: worldY - asset.anchor[1] + localTop + visible.height,
  };
}

/** Fits an NPC's complete authored model into the target portrait well. Player
 * targets use the modular head crop above; non-human silhouettes remain more
 * recognisable when the complete animal or merchant sprite is preserved. */
export function drawNpcPortrait(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  npc: {
    readonly npcKind: string;
    readonly species?: string;
    readonly variant: number;
  },
  destination: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): void {
  const speciesKey = npc.species === "capybara" ? "capybara_idle" : npc.species;
  const variants =
    speciesKey === undefined ? undefined : art.wildlife[speciesKey];
  const asset =
    npc.npcKind === "merchant"
      ? art.merchantNpc
      : (variants?.[npc.variant % Math.max(1, variants.length)] ??
        art.missingItem);
  const preferred = npc.npcKind === "merchant" ? "idle_down" : "idle_side";
  const animation = availableAnimation(asset, preferred);
  const selectedFrame = selectAtlasFrame(asset.metadata, animation, 0);
  if (selectedFrame === null) return;
  const frame = opaquePortraitFrame(asset, selectedFrame);
  const availableWidth = Math.max(1, destination.width - 2);
  const availableHeight = Math.max(1, destination.height - 2);
  const scale = Math.min(
    availableWidth / frame.width,
    availableHeight / frame.height,
  );
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const x = Math.round(destination.x + (destination.width - width) / 2);
  const y = Math.round(destination.y + (destination.height - height) / 2);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    asset.image,
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    x,
    y,
    width,
    height,
  );
}

export function idleAvatarAnimationForDirection(
  facing: Direction,
): "idle_up" | "idle_right" | "idle_down" {
  if (facing === "up") return "idle_up";
  if (facing === "down") return "idle_down";
  return "idle_right";
}

export function horseFrameForDirection(
  facing: Direction,
  moving: boolean,
  animationFrame: number,
  mounted: boolean,
): number {
  const side =
    facing === "left" ||
    facing === "right" ||
    facing === "upLeft" ||
    facing === "upRight" ||
    facing === "downLeft" ||
    facing === "downRight";
  const directionOffset = mounted
    ? facing === "up"
      ? 4
      : side
        ? 2
        : 0
    : facing === "up"
      ? 4
      : side
        ? 0
        : 2;
  if (!moving) return directionOffset + (animationFrame % 2);
  const walkOffset = mounted
    ? facing === "up"
      ? 18
      : side
        ? 12
        : 6
    : facing === "up"
      ? 18
      : side
        ? 6
        : 12;
  return walkOffset + (animationFrame % 6);
}

/** The standalone animal sheet is authored facing left, while the mounted
 * player sheet is authored facing right. Keep their mirroring independent. */
export function horseFlipsForDirection(
  facing: Direction,
  mounted: boolean,
): boolean {
  const facesLeft =
    facing === "left" || facing === "upLeft" || facing === "downLeft";
  const facesRight =
    facing === "right" || facing === "upRight" || facing === "downRight";
  return mounted ? facesLeft : facesRight;
}

function wildlifeDirection(facing: Direction): "up" | "down" | "side" {
  if (facing === "up") return "up";
  if (facing === "down") return "down";
  return "side";
}

export function wildlifeAnimationName(
  species: WildlifeSpecies,
  facing: Direction,
  moving: boolean,
  activity: string,
): string {
  const direction = wildlifeDirection(facing);
  if (species === "duck" || species === "swan") {
    if (activity === "sleep") return "sleep_land";
    return moving ? "swim_side" : "idle_swim";
  }
  if (species === "goose")
    return activity === "sleep"
      ? "sleep_side"
      : moving
        ? "walk_side"
        : "idle_side";
  if (species === "frog") return moving ? "hop_side" : "idle_side";
  if (species === "butterfly") return "flutter";
  if (species === "bee") return "fly_side";
  if (species === "vulture") {
    if (activity === "sleep") return "sleep_side";
    if (activity === "rest") return "idle_side";
    return moving ? `fly_${direction}` : "idle_side";
  }
  if (species === "scarab") return moving ? "walk_side" : "idle_side";
  if (species === "chicken" || species === "rooster") {
    if (activity === "sleep") return "sleep_side";
    if (activity === "graze") return "forage_side";
    return moving ? "walk_side" : "idle_side";
  }
  if (species === "mouse")
    return activity === "graze"
      ? "forage_side"
      : moving
        ? "walk_side"
        : "idle_side";
  if (species === "camel") {
    if (activity === "sleep") return "sleep_side";
    if (activity === "rest") return "rest_side";
    if (activity === "graze") return "action_1_side";
    return moving ? "walk_side" : "idle_side";
  }
  if (species === "snail") return `${moving ? "walk" : "idle"}_${direction}`;
  if (
    species === "horse" ||
    species === "cow" ||
    species === "sheep" ||
    species === "pig"
  ) {
    if (activity === "sleep") return "sleep_side";
    if (activity === "rest") return "rest_side";
    if (activity === "graze") return `action_${direction}`;
    return `${moving ? "walk" : "idle"}_${direction}`;
  }
  return "idle_side";
}

/** Most authored side-facing wildlife looks left. Vultures are the exception:
 * their source flight row looks right, so their horizontal mirroring is the
 * inverse of the livestock sheets. */
export function wildlifeFlipsForDirection(
  species: WildlifeSpecies,
  facing: Direction,
): boolean {
  const facesLeft =
    facing === "left" || facing === "upLeft" || facing === "downLeft";
  const facesRight =
    facing === "right" || facing === "upRight" || facing === "downRight";
  return species === "vulture" ? facesLeft : facesRight;
}

export type CapybaraVisual =
  "idle" | "look" | "submerged" | "dive" | "emerge" | "bubbles";

/** Deterministic cosmetic cycle for the pack's separately-authored water strips. */
export function capybaraVisualAtFrame(
  frameIndex: number,
  inWater: boolean,
): CapybaraVisual {
  if (!inWater) return frameIndex % 96 < 24 ? "look" : "idle";
  const phase = ((frameIndex % 160) + 160) % 160;
  if (phase < 48) return "idle";
  if (phase < 64) return "look";
  if (phase < 76) return "dive";
  if (phase < 116) return "bubbles";
  if (phase < 132) return "emerge";
  return "submerged";
}

function availableAnimation(asset: LoadedAsset, preferred: string): string {
  if (asset.metadata.animations[preferred] !== undefined) return preferred;
  return Object.keys(asset.metadata.animations)[0] ?? preferred;
}

interface WildlifeVisual {
  readonly asset: LoadedAsset;
  readonly animation: string;
  readonly frameIndex: number;
  readonly flip: boolean;
}

function resolveWildlifeVisual(
  art: OverworldArt,
  species: WildlifeSpecies,
  variant: number,
  activity: string,
  facing: Direction,
  moving: boolean,
  animationFrame: number,
  inWater: boolean,
): WildlifeVisual {
  const key =
    species === "capybara"
      ? `capybara_${capybaraVisualAtFrame(animationFrame + variant * 17, inWater)}`
      : species;
  const variants = art.wildlife[key] ?? [];
  const asset =
    variants[variant % Math.max(1, variants.length)] ?? art.missingItem;
  const preferred =
    species === "capybara"
      ? "base"
      : wildlifeAnimationName(species, facing, moving, activity);
  const animation = availableAnimation(asset, preferred);
  const authoredFps = asset.metadata.animationMeta?.[animation]?.fps ?? 8;
  const staticPose =
    (activity === "rest" && species !== "butterfly") ||
    activity === "inside_hive";
  const frameIndex = staticPose
    ? 0
    : Math.floor((animationFrame * authoredFps) / 8);
  return {
    asset,
    animation,
    frameIndex,
    flip: wildlifeFlipsForDirection(species, facing),
  };
}

export function wildlifeWorldBounds(
  art: OverworldArt,
  species: WildlifeSpecies,
  variant: number,
  activity: string,
  x: number,
  y: number,
  facing: Direction,
  moving: boolean,
  animationFrame: number,
  inWater = false,
): WorldVisualBounds | null {
  const visual = resolveWildlifeVisual(
    art,
    species,
    variant,
    activity,
    facing,
    moving,
    animationFrame,
    inWater,
  );
  return anchoredVisualBounds(
    visual.asset,
    visual.animation,
    visual.frameIndex,
    x,
    y,
    visual.flip,
  );
}

export function drawOverworldWildlife(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  species: WildlifeSpecies,
  variant: number,
  activity: string,
  x: number,
  y: number,
  facing: Direction,
  moving: boolean,
  animationFrame: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  inWater = false,
): void {
  const visual = resolveWildlifeVisual(
    art,
    species,
    variant,
    activity,
    facing,
    moving,
    animationFrame,
    inWater,
  );
  drawAnchored(
    context,
    visual.asset,
    visual.animation,
    visual.frameIndex,
    x,
    y,
    cameraX,
    cameraY,
    zoom,
    visual.flip,
  );
}

export function drawOverworldHive(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  kind: string,
  variant: number,
  x: number,
  y: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
): void {
  drawAnchored(
    context,
    kind === "nest" ? art.beeNest : art.beeHive,
    "base",
    variant,
    x,
    y,
    cameraX,
    cameraY,
    zoom,
  );
}

export interface HorseJumpPose {
  readonly x: number;
  readonly y: number;
  readonly footY: number;
  readonly progress: number;
}

/** Reconstructs the replicated mounted leap from authority ticks. */
export function horseJumpPose(
  fromX: number | undefined,
  fromY: number | undefined,
  toX: number,
  toY: number,
  untilTick: bigint | undefined,
  renderTick: number,
): HorseJumpPose | null {
  if (fromX === undefined || fromY === undefined || untilTick === undefined)
    return null;
  const endTick = Number(untilTick);
  if (renderTick > endTick) return null;
  const startTick = endTick - HORSE_JUMP_DURATION_TICKS;
  const progress = Math.max(
    0,
    Math.min(1, (renderTick - startTick) / HORSE_JUMP_DURATION_TICKS),
  );
  const x = fromX + (toX - fromX) * progress;
  const footY = fromY + (toY - fromY) * progress;
  const arc =
    progress === 0 || progress === 1
      ? 0
      : Math.sin(progress * Math.PI) * 18 * FIXED_UNITS_PER_PIXEL;
  return { x, y: footY - arc, footY, progress };
}

export function drawOverworldHorse(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  facing: Direction,
  moving: boolean,
  animationFrame: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  mounted: boolean,
  appearance: PlayerAppearanceVisual = DEFAULT_PLAYER_APPEARANCE,
  variant = 0,
  activity = "idle",
): void {
  const flip = horseFlipsForDirection(facing, mounted);
  const frameIndex = horseFrameForDirection(
    facing,
    moving,
    animationFrame,
    mounted,
  );
  const horse = mounted
    ? (art.mountedHorses[variant % art.mountedHorses.length] ??
      art.mountedHorse)
    : (art.wildlife.horse?.[variant % (art.wildlife.horse?.length ?? 1)] ??
      art.horse);
  if (mounted)
    drawAnchored(
      context,
      horse,
      "mount",
      frameIndex,
      x,
      y,
      cameraX,
      cameraY,
      zoom,
      flip,
    );
  else {
    const animation = availableAnimation(
      horse,
      wildlifeAnimationName("horse", facing, moving, activity),
    );
    const authoredFrame =
      !moving && activity !== "graze" && activity !== "sleep"
        ? 0
        : animationFrame;
    drawAnchored(
      context,
      horse,
      animation,
      authoredFrame,
      x,
      y,
      cameraX,
      cameraY,
      zoom,
      flip,
    );
  }
  if (!mounted) return;
  for (const layer of playerLayersForAppearance(art, appearance, true)) {
    drawAnchored(
      context,
      layer,
      "mount",
      frameIndex,
      x,
      y,
      cameraX,
      cameraY,
      zoom,
      flip,
    );
  }
}

export function horseWorldBounds(
  art: OverworldArt,
  x: number,
  y: number,
  facing: Direction,
  moving: boolean,
  animationFrame: number,
  variant = 0,
  activity = "idle",
): WorldVisualBounds | null {
  const horse =
    art.wildlife.horse?.[variant % (art.wildlife.horse?.length ?? 1)] ??
    art.horse;
  const animation = availableAnimation(
    horse,
    wildlifeAnimationName("horse", facing, moving, activity),
  );
  const authoredFrame =
    !moving && activity !== "graze" && activity !== "sleep"
      ? 0
      : animationFrame;
  return anchoredVisualBounds(
    horse,
    animation,
    authoredFrame,
    x,
    y,
    horseFlipsForDirection(facing, false),
  );
}

export const MOUNTED_ACTION_Y_OFFSET = -10;

/** Draws the horse in its travel direction and a mounted action pose in the
 * rider's independent aim direction. The source action sheet is aligned ten
 * pixels lower than the authored rider sheet, hence the explicit seat offset. */
export function drawOverworldMountedAction(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  x: number,
  y: number,
  horseFacing: Direction,
  riderFacing: Direction,
  moving: boolean,
  horseAnimationFrame: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  actionFrame: number,
  actionVisual: ActionVisual,
  appearance: PlayerAppearanceVisual = DEFAULT_PLAYER_APPEARANCE,
  horseVariant = 0,
): void {
  const horseFlip = horseFlipsForDirection(horseFacing, true);
  const horseFrame = horseFrameForDirection(
    horseFacing,
    moving,
    horseAnimationFrame,
    true,
  );
  const horse =
    art.mountedHorses[horseVariant % art.mountedHorses.length] ??
    art.mountedHorse;
  drawAnchored(
    context,
    horse,
    "mount",
    horseFrame,
    x,
    y,
    cameraX,
    cameraY,
    zoom,
    horseFlip,
  );

  const actionY = y + MOUNTED_ACTION_Y_OFFSET;
  const riderFlip =
    riderFacing === "left" ||
    riderFacing === "upLeft" ||
    riderFacing === "downLeft";
  const drawTool = (): void =>
    drawAnchored(
      context,
      actionVisual.asset,
      actionVisual.toolAnimation,
      actionFrame,
      x,
      actionY,
      cameraX,
      cameraY,
      zoom,
      actionToolFlipsForDirection(riderFacing),
    );
  if (riderFacing === "up") drawTool();
  for (const layer of playerLayersForAppearance(art, appearance, false, true)) {
    drawAnchored(
      context,
      layer,
      actionVisual.animation,
      actionFrame,
      x,
      actionY,
      cameraX,
      cameraY,
      zoom,
      riderFlip,
    );
  }
  if (riderFacing !== "up") drawTool();
}

export function drawOverworldNameplate(
  context: CanvasRenderingContext2D,
  art: OverworldArt,
  worldX: number,
  worldY: number,
  cameraX: number,
  cameraY: number,
  zoom: number,
  name: string,
): void {
  const label = name.slice(0, 20);
  const width = measurePixelText(label) + 4;
  const height = 9;
  const screenX = Math.round((worldX - cameraX) * zoom);
  const screenY = Math.round((worldY - cameraY - 42) * zoom);
  context.save();
  context.translate(screenX, screenY);
  context.scale(zoom, zoom);
  context.fillStyle = "#14221acc";
  context.fillRect(Math.round(-width / 2), 0, width, height);
  drawPixelText(context, art.ui, label, 0, 1, {
    align: "center",
    color: "#f2e3c2",
  });
  context.restore();
}

export function axeAnimationForDirection(
  facing: Direction,
): "axe_up" | "axe_right" | "axe_down" {
  if (facing === "up") return "axe_up";
  if (facing === "down") return "axe_down";
  return "axe_right";
}

/** Cute Fantasy authors both modular body and tool side-actions facing right. */
export function actionToolFlipsForDirection(facing: Direction): boolean {
  if (facing === "up" || facing === "down") return false;
  return facing === "left" || facing === "upLeft" || facing === "downLeft";
}

function actionFacing(facing: Direction): "up" | "right" | "down" {
  if (facing === "up") return "up";
  if (facing === "down") return "down";
  return "right";
}

/** Resolve the semantic `<kind>_<facing>` contract, retaining the purchased
 * farmer sheet's legacy axe group names as an explicit compatibility path. */
export interface ActionVisual {
  readonly asset: LoadedAsset;
  /** Matching semantic pose from every modular character layer. */
  readonly animation: string;
  readonly toolAnimation: string;
}

export function actionVisualForDirection(
  art: OverworldArt,
  actionKind: string,
  facing: Direction,
): ActionVisual | null {
  const asset = art.actionAssets[actionKind];
  if (asset === undefined) return null;
  const semantic = `${actionKind}_${actionFacing(facing)}`;
  if (actionKind === "swing_axe") {
    const toolAnimation = axeAnimationForDirection(facing);
    return asset.metadata.animations[toolAnimation] === undefined
      ? null
      : { asset, animation: semantic, toolAnimation };
  }
  if (asset.metadata.animations[semantic] !== undefined) {
    return { asset, animation: semantic, toolAnimation: semantic };
  }
  return null;
}

export function avatarAnimationForDirection(
  facing: Direction,
): "walk_up" | "walk_right" | "walk_down" {
  if (facing === "up") return "walk_up";
  if (facing === "down") return "walk_down";
  return "walk_right";
}
