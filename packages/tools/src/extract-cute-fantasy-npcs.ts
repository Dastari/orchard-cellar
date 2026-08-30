import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource, PixelGrid } from './assets/types.js';

type Region = readonly [number, number, number, number];
type ActorKind = 'npc' | 'faction' | 'enemy' | 'effect';

interface AnimationRow {
  readonly name: string;
  readonly row: number;
  readonly fps?: number;
  readonly loop?: boolean;
  /** Irregular VFX/monster rows use separated occupied cells rather than timing blanks. */
  readonly occupiedOnly?: boolean;
}

interface SheetDefinition {
  readonly name: string;
  readonly label: string;
  readonly kind: ActorKind;
  readonly family: string;
  readonly source: string;
  readonly cell: readonly [number, number];
  readonly rows: readonly AnimationRow[];
  readonly crop?: readonly [x: number, y: number, width: number, height: number];
  readonly fps?: number;
  readonly companions?: readonly string[];
  readonly tags?: readonly string[];
}

interface ActorCatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly asset: string;
  readonly kind: ActorKind;
  readonly family: string;
  readonly size: readonly [number, number];
  readonly animations: readonly string[];
  readonly sourcePath: string;
  readonly companions: readonly string[];
}

const rootPath = fileURLToPath(workspaceRoot);
const outputPath = resolve(rootPath, 'packages/assets/characters');
const effectOutputPath = resolve(rootPath, 'packages/assets/props');
const catalogPath = resolve(rootPath, 'packages/client/src/render/cute-fantasy-actor-catalog.generated.ts');
const paletteCharacters = Object.keys((await loadPalette()).colors);
await Promise.all([mkdir(outputPath, { recursive: true }), mkdir(effectOutputPath, { recursive: true })]);

function nativeHex(image: DecodedPng, x: number, y: number): string | null {
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3] ?? 0;
  if (alpha === 0) return null;
  const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]
    .map((value) => (value ?? 0).toString(16).padStart(2, '0')).join('');
  return `#${rgb}${alpha === 255 ? '' : alpha.toString(16).padStart(2, '0')}`;
}

function frameHasPixels(image: DecodedPng, region: Region): boolean {
  const [originX, originY, width, height] = region;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if ((image.rgba[((originY + y) * image.width + originX + x) * 4 + 3] ?? 0) > 0) return true;
  }
  return false;
}

function animationRows(names: readonly string[]): readonly AnimationRow[] {
  return names.map((name, row) => ({ name, row }));
}

const baseSeven = animationRows([
  'idle_down', 'idle_right', 'idle_up', 'walk_down', 'walk_right', 'walk_up', 'defeat',
]);
const baseTen = animationRows([
  'idle_down', 'idle_right', 'idle_up', 'walk_down', 'walk_right', 'walk_up', 'defeat',
  'hurt_down', 'hurt_right', 'hurt_up',
]);
const combatThirteen = animationRows([
  'idle_down', 'idle_right', 'idle_up', 'walk_down', 'walk_right', 'walk_up', 'defeat',
  'attack_down', 'attack_right', 'attack_up', 'hurt_down', 'hurt_right', 'hurt_up',
]);
const casterThirteen = animationRows([
  'idle_down', 'idle_right', 'idle_up', 'walk_down', 'walk_right', 'walk_up', 'defeat',
  'cast_down', 'cast_right', 'cast_up', 'hurt_down', 'hurt_right', 'hurt_up',
]);

function genericRows(count: number): readonly AnimationRow[] {
  return Array.from({ length: count }, (_, row) => ({
    name: `state_${String(row + 1).padStart(2, '0')}`,
    row,
    occupiedOnly: true,
  }));
}

function professionDefinition(
  name: string,
  label: string,
  sourceName: string,
  rows: readonly AnimationRow[],
  companions: readonly string[] = [],
): SheetDefinition {
  return {
    name,
    label,
    kind: 'npc',
    family: 'Professions',
    source: `references/Cute_Fantasy/NPCs (Premade)/${sourceName}.png`,
    cell: [64, 64],
    crop: [16, 8, 32, 40],
    rows,
    companions,
    tags: [`npc.${name.replace(/^npc_cf_/, '')}`, 'character.authored'],
  };
}

const sheets: SheetDefinition[] = [
  professionDefinition('npc_cf_chef_chloe', 'Chef Chloe', 'Chef_Chloe', baseSeven),
  professionDefinition('npc_cf_bartender_katy', 'Bartender Katy', 'Bartender_Katy', baseSeven),
  professionDefinition('npc_cf_bartender_bruno', 'Bartender Bruno', 'Bartender_Bruno', baseSeven),
  professionDefinition('npc_cf_miner_mike', 'Miner Mike', 'Miner_Mike', [
    ...baseSeven,
    ...animationRows(['mine_down', 'mine_right', 'mine_up']).map((row, index) => ({ ...row, row: index + 7 })),
  ]),
  professionDefinition('npc_cf_fisherman_fin', 'Fisherman Fin', 'Fisherman_Fin', [
    ...baseSeven,
    ...animationRows(['cast_down', 'cast_right', 'cast_up', 'reel_down', 'reel_right', 'reel_up'])
      .map((row, index) => ({ ...row, row: index + 7 })),
  ]),
  professionDefinition('npc_cf_farmer_buba', 'Farmer Buba', 'Farmer_Buba', [
    ...baseSeven,
    ...animationRows(['chop_down', 'chop_right', 'chop_up', 'water_down', 'water_right', 'water_up'])
      .map((row, index) => ({ ...row, row: index + 7 })),
  ]),
  professionDefinition('npc_cf_farmer_bob', 'Farmer Bob', 'Farmer_Bob', [
    ...baseSeven,
    ...animationRows(['chop_down', 'chop_right', 'chop_up', 'water_down', 'water_right', 'water_up'])
      .map((row, index) => ({ ...row, row: index + 7 })),
  ]),
  professionDefinition('npc_cf_lumberjack_jack', 'Lumberjack Jack', 'Lumberjack_Jack', [
    ...baseSeven,
    ...animationRows(['chop_down', 'chop_right', 'chop_up']).map((row, index) => ({ ...row, row: index + 7 })),
  ]),

  ...Array.from({ length: 4 }, (_, index): SheetDefinition => ({
    name: `npc_cf_desert_person_${String(index + 1).padStart(2, '0')}`,
    label: `Desert Person ${index + 1}`,
    kind: 'npc', family: 'Desert',
    source: `references/Cute_Fantasy_Desert/NPC/Desert_Person_${index + 1}.png`,
    cell: [32, 32], rows: baseTen,
  })),
  {
    name: 'npc_cf_pharaoh', label: 'Pharaoh', kind: 'npc', family: 'Desert',
    source: 'references/Cute_Fantasy_Desert/NPC/Pharaoh.png', cell: [32, 32], rows: baseTen,
  },
  ...Array.from({ length: 3 }, (_, index): SheetDefinition => ({
    name: `npc_cf_desert_trader_${String(index + 1).padStart(2, '0')}`,
    label: `Desert Trader ${index + 1}`,
    kind: 'npc', family: 'Desert',
    source: `references/Cute_Fantasy_Desert/NPC/Traders/Desert_Trader_${index + 1}.png`,
    cell: [32, 32], rows: [{ name: 'idle', row: 0 }],
  })),
  {
    name: 'npc_cf_witch', label: 'Witch', kind: 'npc', family: 'Holiday',
    source: 'references/Cute_Fantasy_Halloween/Witch/Witch.png', cell: [32, 32],
    rows: animationRows([
      'idle_down', 'idle_right', 'idle_up', 'walk_down', 'walk_right', 'walk_up',
      'cast_down', 'cast_right', 'cast_up',
    ]),
    companions: ['effect_cf_witch_bat', 'effect_cf_witch_broom', 'effect_cf_witch_cauldron'],
  },
  {
    name: 'npc_cf_santa_claus', label: 'Santa Claus', kind: 'npc', family: 'Holiday',
    source: 'references/Cute_Fantasy_Christmass/Characters/Santa_Claus.png', cell: [32, 32], rows: baseTen,
  },
  {
    name: 'npc_cf_santa_helper', label: 'Santa Helper', kind: 'npc', family: 'Holiday',
    source: 'references/Cute_Fantasy_Christmass/Characters/Santa_Claus_Helper.png', cell: [32, 32], rows: baseTen,
  },
  {
    name: 'npc_cf_reindeer', label: 'Reindeer', kind: 'npc', family: 'Holiday',
    source: 'references/Cute_Fantasy_Christmass/Characters/Reindeer.png', cell: [64, 64],
    rows: animationRows(['idle_side', 'walk_side', 'run_side']),
  },
];

function faction(
  name: string,
  label: string,
  family: string,
  source: string,
  cellSize: 32 | 48 | 64,
  rows: readonly AnimationRow[] = combatThirteen,
  companions: readonly string[] = [],
): SheetDefinition {
  return { name, label, kind: 'faction', family, source, cell: [cellSize, cellSize], rows, companions };
}

sheets.push(
  faction('actor_cf_knight_archer', 'Knight Archer', 'Knights', 'references/Cute_Fantasy_Characters/Knights/Archer.png', 48, combatThirteen, ['effect_cf_bow_stages', 'projectile_cf_crossbow_bolt']),
  faction('actor_cf_knight_spearman', 'Knight Spearman', 'Knights', 'references/Cute_Fantasy_Characters/Knights/Spearman.png', 48),
  faction('actor_cf_knight_swordman', 'Knight Swordman', 'Knights', 'references/Cute_Fantasy_Characters/Knights/Swordman.png', 48),
  faction('actor_cf_knight_templar', 'Knight Templar', 'Knights', 'references/Cute_Fantasy_Characters/Knights/Templar.png', 48),
  faction('actor_cf_angel_01', 'Angel 1', 'Angels', 'references/Cute_Fantasy_Characters/Angels/Angel_1.png', 64),
  faction('actor_cf_angel_02', 'Angel 2', 'Angels', 'references/Cute_Fantasy_Characters/Angels/Angel_2.png', 64),
  faction('actor_cf_goblin_archer', 'Goblin Archer', 'Goblins', 'references/Cute_Fantasy_Characters/Goblins/Goblin_Archer.png', 48, combatThirteen, ['effect_cf_bow_stages', 'projectile_cf_crossbow_bolt']),
  faction('actor_cf_goblin_maceman', 'Goblin Maceman', 'Goblins', 'references/Cute_Fantasy_Characters/Goblins/Goblin_Maceman.png', 32),
  faction('actor_cf_goblin_spearman', 'Goblin Spearman', 'Goblins', 'references/Cute_Fantasy_Characters/Goblins/Goblin_Spearman.png', 48),
  faction('actor_cf_goblin_thief', 'Goblin Thief', 'Goblins', 'references/Cute_Fantasy_Characters/Goblins/Goblin_Thief.png', 32),
  faction('actor_cf_orc_archer', 'Orc Archer', 'Orcs', 'references/Cute_Fantasy_Characters/Orcs/Orc_Archer.png', 48, combatThirteen, ['effect_cf_bow_stages', 'projectile_cf_crossbow_bolt']),
  faction('actor_cf_orc_chief', 'Orc Chief', 'Orcs', 'references/Cute_Fantasy_Characters/Orcs/Orc_Chief.png', 64, animationRows([
    'idle_down', 'idle_right', 'idle_up', 'walk_down', 'walk_right', 'walk_up', 'special', 'defeat',
  ])),
  faction('actor_cf_orc_grunt', 'Orc Grunt', 'Orcs', 'references/Cute_Fantasy_Characters/Orcs/Orc_Grunt.png', 64, animationRows([
    'idle_down', 'idle_right', 'idle_up', 'walk_down', 'walk_right', 'walk_up', 'special', 'defeat',
  ])),
  faction('actor_cf_orc_peon', 'Orc Peon', 'Orcs', 'references/Cute_Fantasy_Characters/Orcs/Orc_Peon.png', 64, animationRows([
    'idle_down', 'idle_right', 'idle_up', 'walk_down', 'walk_right', 'walk_up', 'special', 'defeat',
  ])),
);

function enemy(
  name: string,
  label: string,
  family: string,
  source: string,
  cellSize: 16 | 32 | 48 | 64,
  rows: readonly AnimationRow[],
  companions: readonly string[] = [],
): SheetDefinition {
  return { name, label, kind: 'enemy', family, source, cell: [cellSize, cellSize], rows, companions };
}

sheets.push(
  enemy('enemy_cf_skeleton', 'Skeleton', 'Skeletons', 'references/Cute_Fantasy/Enemies/Skeleton/Skeleton.png', 32, baseTen),
  enemy('enemy_cf_skeleton_bowman', 'Skeleton Bowman', 'Skeletons', 'references/Cute_Fantasy/Enemies/Skeleton/Skeleton_Bowman/Merged/Skeleton_Bowman.png', 32, combatThirteen, ['weapon_cf_skeleton_bow', 'projectile_cf_crossbow_bolt']),
  enemy('enemy_cf_skeleton_mage', 'Skeleton Mage', 'Skeletons', 'references/Cute_Fantasy/Enemies/Skeleton/Skeleton_Mage.png', 32, casterThirteen, ['projectile_cf_skeleton_mage']),
  enemy('enemy_cf_skeleton_swordman', 'Skeleton Swordman', 'Skeletons', 'references/Cute_Fantasy/Enemies/Skeleton/Skeleton_Swordman.png', 32, animationRows([
    'idle_down', 'idle_right', 'idle_up', 'walk_down', 'walk_right', 'walk_up', 'defeat',
    'attack_down', 'attack_right', 'attack_up', 'special_down', 'special_right', 'special_up',
    'hurt_down', 'hurt_right', 'hurt_up',
  ])),
  enemy('enemy_cf_desert_atgier_01', 'Desert Atgier 1', 'Desert Hostiles', 'references/Cute_Fantasy_Desert/enemies/Desert_Warrior_Atgier_1.png', 64, combatThirteen),
  enemy('enemy_cf_desert_atgier_02', 'Desert Atgier 2', 'Desert Hostiles', 'references/Cute_Fantasy_Desert/enemies/Desert_Warrior_Atgier_2.png', 64, combatThirteen),
  enemy('enemy_cf_desert_bow_01', 'Desert Bowman 1', 'Desert Hostiles', 'references/Cute_Fantasy_Desert/enemies/Desert_Warrior_Bow_1.png', 64, combatThirteen, ['effect_cf_bow_stages', 'projectile_cf_crossbow_bolt']),
  enemy('enemy_cf_desert_bow_02', 'Desert Bowman 2', 'Desert Hostiles', 'references/Cute_Fantasy_Desert/enemies/Desert_Warrior_Bow_2.png', 64, combatThirteen, ['effect_cf_bow_stages', 'projectile_cf_crossbow_bolt']),
  enemy('enemy_cf_mummy', 'Mummy', 'Desert Hostiles', 'references/Cute_Fantasy_Desert/enemies/Mummy.png', 32, combatThirteen),
  enemy('enemy_cf_cowling_01', 'Cowling 1', 'Volcano', 'references/Cute_Fantasy_Volcano/Enemies/Cowling_1.png', 48, combatThirteen),
  enemy('enemy_cf_cowling_02', 'Cowling 2', 'Volcano', 'references/Cute_Fantasy_Volcano/Enemies/Cowling_2.png', 48, combatThirteen),
  enemy('enemy_cf_cowling_mage_01', 'Cowling Mage 1', 'Volcano', 'references/Cute_Fantasy_Volcano/Enemies/Cowling_Mage_1.png', 48, casterThirteen),
  enemy('enemy_cf_cowling_mage_02', 'Cowling Mage 2', 'Volcano', 'references/Cute_Fantasy_Volcano/Enemies/Cowling_Mage_2.png', 48, casterThirteen),
  enemy('enemy_cf_flying_skull', 'Flying Skull', 'Volcano', 'references/Cute_Fantasy_Volcano/Enemies/Flying_Skull.png', 32,
    animationRows(['idle', 'move', 'attack', 'defeat'])),
  enemy('enemy_cf_bombschroom', 'Bombschroom', 'Shroomlands', 'references/Cute_Fantasy/Enemies/Bombschroom/Bombschroom.png', 16, genericRows(21), ['effect_cf_bombschroom_gas']),
  enemy('enemy_cf_shroomling_blue', 'Blue Shroomling', 'Shroomlands', 'references/Cute_Fantasy_ShroomLands/Shroomlings/Blue_Shroomling.png', 16, genericRows(26)),
  enemy('enemy_cf_shroomling_green', 'Green Shroomling', 'Shroomlands', 'references/Cute_Fantasy_ShroomLands/Shroomlings/Green_Shroomling.png', 16, genericRows(26)),
  enemy('enemy_cf_shroomling_purple', 'Purple Shroomling', 'Shroomlands', 'references/Cute_Fantasy_ShroomLands/Shroomlings/Purple_Shroomling.png', 16, genericRows(26)),
  enemy('enemy_cf_shroomling_yellow', 'Yellow Shroomling', 'Shroomlands', 'references/Cute_Fantasy_ShroomLands/Shroomlings/Yellow_Shroomling.png', 16, genericRows(26)),
  enemy('enemy_cf_shroomling_alive_big', 'Alive Shroomling (Big)', 'Shroomlands', 'references/Cute_Fantasy_ShroomLands/Shroomlings/Big_Alive_Shroomling.png', 16, genericRows(3)),
  enemy('enemy_cf_shroomling_alive_small', 'Alive Shroomling (Small)', 'Shroomlands', 'references/Cute_Fantasy_ShroomLands/Shroomlings/Small_Alive_Shroomling.png', 16, genericRows(3)),
);

for (const size of ['big', 'medium', 'small'] as const) for (const color of ['blue', 'green', 'pink', 'red', 'yellow'] as const) {
  const cellSize = size === 'big' ? 64 : size === 'medium' ? 32 : 16;
  const title = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
  sheets.push(enemy(
    `enemy_cf_slime_${size}_${color}`,
    `${title(size)} ${title(color)} Slime`,
    'Slimes',
    `references/Cute_Fantasy/Enemies/Slime/Slime_${title(size)}/Slime_${title(size)}_${title(color)}.png`,
    cellSize,
    [
      { name: 'idle', row: 0, occupiedOnly: true },
      { name: 'move', row: 1, occupiedOnly: true },
      { name: 'hurt', row: 2, loop: false, occupiedOnly: true },
      { name: 'defeat', row: 3, loop: false, occupiedOnly: true },
    ],
  ));
}

for (let index = 0; index < 4; index += 1) sheets.push(enemy(
  `enemy_cf_snail_small_${String(index + 1).padStart(2, '0')}`,
  `Small Snail ${index + 1}`,
  'Shroomlands',
  `references/Cute_Fantasy_ShroomLands/Snails/Snail_Small_${index + 1}.png`,
  16,
  [{ name: 'idle', row: 0 }],
));

function effect(
  name: string,
  label: string,
  family: string,
  source: string,
  cellSize: 16 | 32,
  rows: readonly AnimationRow[],
): SheetDefinition {
  return { name, label, kind: 'effect', family, source, cell: [cellSize, cellSize], rows };
}

sheets.push(
  effect('projectile_cf_skeleton_mage', 'Skeleton Mage Projectile', 'Projectiles', 'references/Cute_Fantasy/Other/Skeleton_Mage_Projectile.png', 16, [{ name: 'travel', row: 0 }]),
  effect('projectile_cf_crossbow_bolt', 'Crossbow Bolt', 'Projectiles', 'references/Cute_Fantasy_Dungeons/Objects/Crossbow_Bolt.png', 16, [{ name: 'base', row: 0 }]),
  effect('effect_cf_bow_stages', 'Bow Charge Stages', 'Combat Equipment', 'references/Cute_Fantasy/Other/Bow_Stages.png', 16, [{ name: 'charge', row: 0 }]),
  effect('weapon_cf_skeleton_bow', 'Skeleton Bow Layers', 'Combat Equipment', 'references/Cute_Fantasy/Enemies/Skeleton/Skeleton_Bowman/Separated/Skeleton_Bowman_Bow.png', 32, genericRows(9)),
  effect('effect_cf_mounted_crossbow', 'Mounted Crossbow', 'Combat Equipment', 'references/Cute_Fantasy_Dungeons/Objects/Mounted_Crossbow_anim.png', 16, [{ name: 'fire', row: 0 }]),
  effect('effect_cf_bombschroom_gas', 'Toxic Gas Cloud', 'VFX', 'references/Cute_Fantasy/Enemies/Bombschroom/Toxic_Gas_Cloud_VFX.png', 16, genericRows(2)),
  effect('effect_cf_witch_bat', 'Witch Bat', 'Witch Companions', 'references/Cute_Fantasy_Halloween/Witch/Bat.png', 16, [{ name: 'fly', row: 0 }]),
  effect('effect_cf_witch_broom', 'Witch Broom', 'Witch Companions', 'references/Cute_Fantasy_Halloween/Witch/Broom.png', 32, genericRows(2)),
  effect('effect_cf_witch_cauldron', 'Witch Cauldron', 'Witch Companions', 'references/Cute_Fantasy_Halloween/Witch/Witch_Cauldron_Anim.png', 32, [{ name: 'bubble', row: 0 }]),
);

function regionsForDefinition(image: DecodedPng, definition: SheetDefinition): Record<string, Region[]> {
  const [cellWidth, cellHeight] = definition.cell;
  if (image.width % cellWidth !== 0 || image.height % cellHeight !== 0) {
    throw new Error(`${definition.name} source ${image.width}x${image.height} does not fit ${cellWidth}x${cellHeight} cells`);
  }
  const [cropX, cropY, cropWidth, cropHeight] = definition.crop ?? [0, 0, cellWidth, cellHeight];
  const columns = image.width / cellWidth;
  const animations: Record<string, Region[]> = {};
  for (const row of definition.rows) {
    if ((row.row + 1) * cellHeight > image.height) throw new Error(`${definition.name}.${row.name} row is outside the sheet`);
    let regions = Array.from({ length: columns }, (_, column): Region => [
      column * cellWidth + cropX,
      row.row * cellHeight + cropY,
      cropWidth,
      cropHeight,
    ]);
    if (row.occupiedOnly) regions = regions.filter((region) => frameHasPixels(image, region));
    else while (regions.length > 1 && !frameHasPixels(image, regions.at(-1)!)) regions.pop();
    if (regions.some((region) => frameHasPixels(image, region))) animations[row.name] = regions;
  }
  return animations;
}

function animationLoops(name: string, explicit: boolean | undefined): boolean {
  if (explicit !== undefined) return explicit;
  return !/^(defeat|hurt|attack|cast|special|chop|mine|water|reel|fire)/.test(name);
}

async function writeSheet(definition: SheetDefinition): Promise<ActorCatalogEntry> {
  const absoluteSource = resolve(rootPath, definition.source);
  const image = decodePng(await readFile(absoluteSource));
  const sourceRegions = regionsForDefinition(image, definition);
  if (Object.keys(sourceRegions).length === 0) throw new Error(`${definition.name} has no occupied animations`);
  const nativeFrames: Record<string, (string | null)[][][]> = {};
  const colors = new Set<string>();
  for (const [animation, regions] of Object.entries(sourceRegions)) {
    nativeFrames[animation] = regions.map(([originX, originY, width, height]) => Array.from(
      { length: height },
      (_, y) => Array.from({ length: width }, (_, x) => {
        const color = nativeHex(image, originX + x, originY + y);
        if (color !== null) colors.add(color);
        return color;
      }),
    ));
  }
  const orderedColors = [...colors].sort();
  if (orderedColors.length > paletteCharacters.length) {
    throw new Error(`${definition.name} has ${orderedColors.length} native colors; maximum is ${paletteCharacters.length}`);
  }
  const characterByColor = new Map(orderedColors.map((color, index) => [color, paletteCharacters[index]!]));
  const frames = Object.fromEntries(Object.entries(nativeFrames).map(([animation, animationFrames]) => [
    animation,
    animationFrames.map((pixels): PixelGrid => pixels.map((row) => row.map((color) => (
      color === null ? '.' : characterByColor.get(color) ?? '.'
    )).join(''))),
  ]));
  const animations = Object.keys(frames);
  const rowByName = new Map(definition.rows.map((row) => [row.name, row]));
  const size = (definition.crop?.slice(2) ?? definition.cell) as readonly [number, number];
  const asset: AssetSource = {
    name: definition.name,
    category: definition.kind === 'effect' ? 'props' : 'characters',
    size,
    anchor: [Math.floor(size[0] / 2), size[1] - 1],
    frames,
    frameKinds: Object.fromEntries(animations.map((animation) => [animation, 'animation'])),
    animationFps: Object.fromEntries(animations.map((animation) => [
      animation, rowByName.get(animation)?.fps ?? definition.fps ?? 8,
    ])),
    animationLoop: Object.fromEntries(animations.map((animation) => [
      animation, animationLoops(animation, rowByName.get(animation)?.loop),
    ])),
    sourcePalette: Object.fromEntries(orderedColors.map((color) => [characterByColor.get(color)!, color])),
    sourcePaletteMode: 'exact',
    approved: true,
    importedFrom: basename(absoluteSource),
    sourcePath: relative(rootPath, absoluteSource).replaceAll('\\', '/'),
    sourceRegions,
    tags: [
      `actor.${definition.kind}`,
      `family.${definition.family.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_')}`,
      'source.cute_fantasy',
      ...(definition.tags ?? []),
    ],
    placement: { layer: 'object', footprint: [1, 1], blocksMovement: false, builderAvailable: false },
  };
  const destination = definition.kind === 'effect' ? effectOutputPath : outputPath;
  await writeFile(resolve(destination, `${definition.name}.sprite.json`), `${JSON.stringify(asset, null, 2)}\n`);
  return {
    id: definition.name,
    label: definition.label,
    asset: definition.name,
    kind: definition.kind,
    family: definition.family,
    size,
    animations,
    sourcePath: asset.sourcePath!,
    companions: definition.companions ?? [],
  };
}

const catalog = await Promise.all(sheets.map(writeSheet));

// The full-size snails are already canonical wildlife assets. Reuse their IDs
// here instead of importing identical pixels under a second enemy name.
for (let index = 0; index < 4; index += 1) catalog.push({
  id: `wildlife_cf_snail_${String(index + 1).padStart(2, '0')}`,
  label: `Snail ${index + 1}`,
  asset: `wildlife_cf_snail_${String(index + 1).padStart(2, '0')}`,
  kind: 'enemy',
  family: 'Shroomlands',
  size: [32, 32],
  animations: ['idle_side', 'idle_down', 'idle_up', 'walk_side', 'walk_down', 'walk_up'],
  sourcePath: `references/Cute_Fantasy_ShroomLands/Snails/Snail_${index + 1}.png`,
  companions: [],
});

catalog.sort((left, right) => (
  ['npc', 'faction', 'enemy', 'effect'].indexOf(left.kind) - ['npc', 'faction', 'enemy', 'effect'].indexOf(right.kind)
) || left.family.localeCompare(right.family) || left.label.localeCompare(right.label));

const catalogSource = `/* Generated by packages/tools/src/extract-cute-fantasy-npcs.ts. */
export type CuteFantasyActorKind = 'npc' | 'faction' | 'enemy' | 'effect';

export interface CuteFantasyActorCatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly asset: string;
  readonly kind: CuteFantasyActorKind;
  readonly family: string;
  readonly size: readonly [number, number];
  readonly animations: readonly string[];
  readonly sourcePath: string;
  readonly companions: readonly string[];
}

export const CUTE_FANTASY_ACTOR_CATALOG = ${JSON.stringify(catalog, null, 2)} as const satisfies readonly CuteFantasyActorCatalogEntry[];
`;
await writeFile(catalogPath, catalogSource);

const actorCount = catalog.filter((entry) => entry.kind !== 'effect').length;
const effectCount = catalog.length - actorCount;
const animationCount = catalog.reduce((total, entry) => total + entry.animations.length, 0);
console.log(`Extracted ${actorCount} NPC/enemy actors, ${effectCount} companion effects, and ${animationCount} animation groups.`);
