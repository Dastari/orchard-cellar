import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './assets/png.js';
import { workspaceRoot } from './assets/load.js';

type Use =
  | 'tile-set' | 'animated-tile-set' | 'tile' | 'entity' | 'entity-animation'
  | 'building-entity' | 'world-prop' | 'equipment-layer' | 'ui' | 'effect'
  | 'component-sheet';
type Collision =
  | 'terrain-passable' | 'terrain-blocking' | 'entity-solid' | 'entity-trigger'
  | 'entity-nonsolid' | 'hazard-trigger' | 'equipment-only' | 'ui-only'
  | 'none' | 'review-per-component';
type LayoutKind =
  | 'single' | 'tile-grid' | 'variant-grid' | 'animation-grid' | 'animation-strip'
  | 'modular-animation-grid' | 'components';

interface Layout {
  readonly kind: LayoutKind;
  readonly cell: readonly [number, number] | null;
  readonly columns: number | null;
  readonly rows: number | null;
  readonly cells: number | null;
  readonly confidence: 'verified' | 'family' | 'inferred' | 'review';
  readonly notes: string;
}

interface Entry {
  readonly id: string;
  readonly source: string;
  readonly pack: string;
  readonly section: string;
  readonly name: string;
  readonly description: string;
  readonly reviewedAssets: readonly string[];
  readonly dimensions: readonly [number, number];
  readonly layout: Layout;
  readonly animationSets: readonly string[];
  readonly use: Use;
  readonly collision: Collision;
  readonly collisionNotes: string;
  readonly tileSet: string | null;
  readonly searchTerms: readonly string[];
  readonly duplicateOf: string | null;
  readonly sha256: string;
}

interface DocumentedIndex {
  readonly version: 1;
  readonly sourcePattern: 'references/Cute_Fantasy*/**/*.png';
  readonly sourceRevision: string;
  readonly entryCount: number;
  readonly companionSources: readonly CompanionSource[];
  readonly entries: readonly Entry[];
}

interface CompanionSource {
  readonly source: string;
  readonly sha256: string;
  readonly dimensions: readonly [number, number];
  readonly timelineFrames: number;
  readonly frameDurationsMs: readonly number[];
  readonly layersBackToFront: readonly string[];
  readonly frameTags: readonly string[];
  readonly notes: string;
}

const rootPath = fileURLToPath(workspaceRoot);
const referencesPath = resolve(rootPath, 'references');
const outputRoot = resolve(rootPath, 'docs/reference-assets');

function slash(path: string): string { return path.split(sep).join('/'); }
function humanize(value: string): string {
  return value.replace(/\.png$/i, '').replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]+/g, ' ').replaceAll(/\s+/g, ' ').trim();
}
function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-+|-+$/g, '');
}
function markdown(value: string): string { return value.replaceAll('|', '\\|').replaceAll('\n', ' '); }

function inspectAseprite(source: string, bytes: Buffer): CompanionSource {
  if (bytes.readUInt16LE(4) !== 0xa5e0) throw new Error(`${source} is not an Aseprite file`);
  const frameCount = bytes.readUInt16LE(6);
  const layers: string[] = [];
  const tags: string[] = [];
  const durations: number[] = [];
  let offset = 128;
  const readString = (at: number): readonly [string, number] => {
    const length = bytes.readUInt16LE(at);
    return [bytes.subarray(at + 2, at + 2 + length).toString('utf8'), at + 2 + length];
  };
  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameStart = offset;
    const frameBytes = bytes.readUInt32LE(offset);
    const oldChunkCount = bytes.readUInt16LE(offset + 6);
    const chunkCount = oldChunkCount === 0xffff ? bytes.readUInt32LE(offset + 12) : oldChunkCount;
    durations.push(bytes.readUInt16LE(offset + 8));
    offset += 16;
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const chunkStart = offset;
      const chunkBytes = bytes.readUInt32LE(offset);
      const chunkType = bytes.readUInt16LE(offset + 4);
      if (chunkType === 0x2004) layers.push(readString(offset + 22)[0]);
      if (chunkType === 0x2018) {
        const tagCount = bytes.readUInt16LE(offset + 6);
        let tagOffset = offset + 16;
        for (let tag = 0; tag < tagCount; tag += 1) {
          const [name, next] = readString(tagOffset + 17);
          tags.push(name);
          tagOffset = next;
        }
      }
      offset = chunkStart + chunkBytes;
    }
    offset = frameStart + frameBytes;
  }
  return {
    source,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    dimensions: [bytes.readUInt16LE(8), bytes.readUInt16LE(10)],
    timelineFrames: frameCount,
    frameDurationsMs: durations,
    layersBackToFront: layers,
    frameTags: tags,
    notes: 'Composition source for the modular player. Its Aseprite timeline frames are not the 56 semantic animation rows; use the docs/11 row map for extraction.',
  };
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) result.push(path);
  }
  return result;
}

async function reviewedAssetsBySource(): Promise<Map<string, string[]>> {
  const assetsRoot = resolve(rootPath, 'packages/assets');
  const result = new Map<string, string[]>();
  const files = (await walkFiles(assetsRoot)).filter((path) => path.endsWith('.json'));
  for (const path of files) {
    let value: unknown;
    try { value = JSON.parse(await readFile(path, 'utf8')); } catch { continue; }
    if (!value || typeof value !== 'object') continue;
    const asset = value as { readonly name?: unknown; readonly sourcePath?: unknown; readonly tags?: unknown };
    if (typeof asset.name !== 'string' || typeof asset.sourcePath !== 'string' || !asset.sourcePath.startsWith('references/Cute_Fantasy')) continue;
    const tags = Array.isArray(asset.tags) ? asset.tags.filter((tag): tag is string => typeof tag === 'string') : [];
    const label = `${asset.name}${tags.length > 0 ? ` [${tags.join(', ')}]` : ''}`;
    const existing = result.get(asset.sourcePath) ?? [];
    existing.push(label);
    result.set(asset.sourcePath, existing);
  }
  for (const [source, names] of result) result.set(source, [...new Set(names)].sort());
  return result;
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walkFiles(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

function grid(kind: LayoutKind, width: number, height: number, cellWidth: number, cellHeight: number,
  confidence: Layout['confidence'], notes: string): Layout {
  const columns = width / cellWidth;
  const rows = height / cellHeight;
  if (!Number.isInteger(columns) || !Number.isInteger(rows)) {
    return { kind: 'components', cell: null, columns: null, rows: null, cells: null, confidence: 'review', notes };
  }
  return { kind, cell: [cellWidth, cellHeight], columns, rows, cells: columns * rows, confidence, notes };
}

function animalLayout(source: string, width: number, height: number): Layout | null {
  if (/\/Animals\/(Chicken|Cow|Duck|Goose|Horse|Pig|Sheep|Swan)\//.test(source)) {
    return grid('animation-grid', width, height, 32, 32, 'verified', '32×32 row-major actor cells; trailing blank cells are padding, not frames.');
  }
  if (/\/Animals\/(Frog|Mouse)\//.test(source)) return grid('animation-grid', width, height, 32, 32, 'verified', '32×32 row-major actor cells.');
  if (/\/Animals\/Kapybara\/Static\//.test(source)) return grid('animation-strip', width, height, 32, 32, 'verified', 'One horizontal 32×32-frame action strip.');
  if (/\/Animals\/Bee\/Bee_Flying_Animation/.test(source)) return grid('animation-grid', width, height, 16, 16, 'verified', 'Two rows of four 16×16 flight frames.');
  if (/\/Animals\/Butterfly\//.test(source)) return grid('animation-grid', width, height, 8, 8, 'verified', 'Eight colour rows; each row is a two-frame 8×8 flutter animation.');
  if (/\/Animals\/Camel\//.test(source)) return grid('animation-grid', width, height, 48, 32, 'verified', '48×32 cells; one action per row.');
  if (/\/Animals\/Scarab\//.test(source)) return grid('animation-grid', width, height, 16, 16, 'verified', '16×16 cells; walk, idle, and hit rows.');
  if (/\/Animals\/Vulture\//.test(source)) return grid('animation-grid', width, height, 48, 48, 'verified', '48×48 cells; one action/direction per row.');
  if (/Cute_Fantasy_ShroomLands\/Snails\/Snail_[1-4]\.png$/.test(source)) return grid('animation-grid', width, height, 32, 32, 'verified', '32×32 cells; six action/direction rows.');
  return null;
}

function layoutFor(source: string, width: number, height: number): Layout {
  const file = basename(source);
  const animal = animalLayout(source, width, height);
  if (animal) return animal;
  if (/Cute_Fantasy_Christmass\/Decorations\/Christmass_Grass\.png$/.test(source)) {
    return grid('tile-grid', width, height, 16, 16, 'verified', '8×5 snow-cover and winter-decoration cells. Review semantic overlay roles individually; this is not a complete standalone terrain family.');
  }
  if (width === 576 && height === 3584) {
    return grid('modular-animation-grid', width, height, 64, 64, 'verified', 'Canonical modular player layer: 9 columns × 56 semantic rows; use the row map in docs/11.');
  }
  if (/\/Player\/Player_Mounts\/Horse\//.test(source)) return grid('modular-animation-grid', width, height, 64, 64, 'verified', 'Mounted-player/horse layer using 64×64 cells.');
  if (/\/Player\/(Accessories|Head|Hands|Chest|Legs|Feet|Tools|Player_Base|Player_Mounts)\//.test(source) && width % 64 === 0 && height % 64 === 0) {
    return grid('modular-animation-grid', width, height, 64, 64, 'family', 'Modular player/equipment layer using 64×64 action cells; compose against the matching body row.');
  }
  if (/Cute_Fantasy_Characters\//.test(source) || /Cute_Fantasy_Volcano\/Enemies\/Cowling/.test(source)) {
    const cell = width === 512 ? 64 : 48;
    return grid('animation-grid', width, height, cell, cell, 'family', `${cell}×${cell} combat-actor cells arranged by action row.`);
  }
  if (/\/NPCs \(Premade\)\//.test(source)) return grid('animation-grid', width, height, 64, 64, 'family', 'Premade modular NPC cells; action rows are 64×64.');
  if (/\/Slime\/Slime_Big\//.test(source)) return grid('animation-grid', width, height, 64, 64, 'family', 'Large-slime action rows in 64×64 cells.');
  if (/\/Slime\/Slime_Medium\//.test(source)) return grid('animation-grid', width, height, 32, 32, 'family', 'Medium-slime action rows in 32×32 cells.');
  if (/\/Slime\/Slime_Small\//.test(source)) return grid('animation-grid', width, height, 16, 16, 'family', 'Small-slime action rows in 16×16 cells.');
  if (/\/(Enemies|Witch)\//.test(source) && width % 32 === 0 && height % 32 === 0 && !/VFX/.test(file)) {
    return grid('animation-grid', width, height, 32, 32, 'inferred', 'Actor animation sheet aligned to 32×32 cells; verify semantic row names during extraction.');
  }
  if ((/\/Buildings\/Buildings\//.test(source) || /Cute_Fantasy_Desert\/Houses\//.test(source)
    || /Cute_Fantasy_ShroomLands\/Houses\//.test(source) || /Cute_Fantasy_Volcano\/Buildings\//.test(source))
    && !/Interior|Filler|Tile/i.test(file)) {
    return grid('single', width, height, width, height, 'family', 'One complete building variant; crop as a whole sprite and use an authored footprint collider.');
  }
  if (/\/Trees\//.test(source) && !/Stages|Fruit_Objects/i.test(file)) {
    return grid('single', width, height, width, height, 'family', 'One complete tree variant; use a small trunk collider, not the canopy bounds.');
  }
  if (/\/Tiles\//.test(source) || /Tileset|TileSet|_Tile(?:_|\.)|_Tiles(?:_|\.)/i.test(file)) {
    return grid(/Anim|Animation/i.test(file) ? 'animation-grid' : 'tile-grid', width, height, 16, 16, 'verified', '16×16 row-major terrain inspection grid; composite banks are described in the tile-set field.');
  }
  if (/Anim|Animation|Animated/i.test(file)) {
    if (height <= 64 && width % height === 0) return grid('animation-strip', width, height, height, height, 'inferred', `Likely horizontal ${height}×${height} frame strip; confirm bounds when importing.`);
    if (width % 16 === 0 && height % 16 === 0) return grid('animation-grid', width, height, 16, 16, 'review', 'Animation is aligned to the 16px art grid, but frames may span multiple cells.');
    return { kind: 'components', cell: null, columns: null, rows: null, cells: null, confidence: 'review', notes: 'Animation sheet with non-uniform or multi-cell frame bounds.' };
  }
  if (width === 16 && height === 16) return grid('single', width, height, 16, 16, 'verified', 'One 16×16 sprite/tile.');
  if (width % 16 === 0 && height % 16 === 0) return grid('variant-grid', width, height, 16, 16, 'inferred', 'Sprites align to a 16px inspection grid; individual objects may span several cells.');
  return { kind: 'components', cell: null, columns: null, rows: null, cells: null, confidence: 'review', notes: 'Composite or whole sprite; use alpha bounds during extraction.' };
}

function animationSetsFor(source: string, width: number, height: number): string[] {
  const file = basename(source, '.png');
  if (/\/Animals\/(Cow|Horse|Pig|Sheep)\//.test(source)) return ['idle: side/down/up', 'walk: side/down/up', 'action: side/down/up', 'rest/lie/sleep: side', 'hit: side/down/up'];
  if (/\/Animals\/(Chicken|Goose)\//.test(source)) return ['idle/walk/forage: side', 'action 1/2/3: side', 'sleep/hit: side', 'alternate set: same 8 rows'];
  if (/\/Animals\/(Duck|Swan)\//.test(source)) return ['land: idle/walk/forage/action 1/action 2/sleep/hit', 'water: idle/paddle/swim', 'alternate set: same 10 rows'];
  if (/\/Animals\/Frog\//.test(source)) return ['idle', 'hop', 'action', 'hit'];
  if (/\/Animals\/Mouse\//.test(source)) return ['idle', 'walk', 'forage', 'hit'];
  if (/\/Animals\/Kapybara\/Static\//.test(source)) return [humanize(file).replace(/^Albino /, '').replace(/^Kapybara /, '').toLowerCase()];
  if (/\/Animals\/Bee\/Bee_Flying_Animation/.test(source)) return ['fly', 'fly alternate'];
  if (/\/Animals\/Butterfly\//.test(source)) return ['flutter (2 frames × 8 colour variants)'];
  if (/\/Animals\/Camel\//.test(source)) return ['idle/walk/run', 'action 1/action 2', 'rest/lie/sleep', 'hit'];
  if (/\/Animals\/Scarab\//.test(source)) return ['walk', 'idle', 'hit'];
  if (/\/Animals\/Vulture\//.test(source)) return ['idle/walk/fly side', 'fly down/up', 'sleep', 'hit'];
  if (/Cute_Fantasy_ShroomLands\/Snails\/Snail_[1-4]\.png$/.test(source)) return ['idle: side/down/up', 'walk: side/down/up'];
  if (/\/Flying_Skull\.png$/.test(source)) return ['idle (6)', 'turn/hit (3)', 'attack or cast (6)', 'death/fall (6); verify state names'];
  if (/\/Player\//.test(source) && width === 576 && height === 3584) return ['See canonical 56-row modular player map in docs/11-asset-pipeline.md'];
  if (/\/Player\/(Accessories|Head|Hands|Chest|Legs|Feet|Tools|Player_Base|Player_Mounts)\//.test(source)) return ['Modular action/direction rows; align with the matching 64×64 body cells'];
  if (/Cute_Fantasy_Characters\//.test(source) || /\/Cowling/.test(source)) return ['combat actor: idle/walk/attack × down/side/up', 'collapse/hit rows; verify per archetype'];
  if (/Anim|Animation|Animated/i.test(file)) return [humanize(file).replace(/\b(anim|animation|animated)\b/ig, '').trim().toLowerCase()];
  if (/\/NPCs \(Premade\)\//.test(source)) return ['premade NPC action/direction rows; frame counts vary with profession tools'];
  if (/\/Enemies\//.test(source) || /\/Shroomlings\//.test(source) || /\/Witch\//.test(source)) return ['multi-row actor action set; verify row names and authored frame counts during extraction'];
  return [];
}

function tileSetFor(source: string, width: number, height: number): string | null {
  const lower = source.toLowerCase();
  const file = basename(source).toLowerCase();
  if (/cute_fantasy_christmass\/decorations\/christmass_grass\.png$/.test(lower)) {
    return 'snow-overlay-set | 8×5 cells for snow cover and winter decoration over a Grass 4/stone substrate; not a complete shore, river, cliff, crossing, or snowy-tree family.';
  }
  if (!lower.includes('/tiles/') && !/tileset|_tiles|_tile\./.test(file) && !/\/dungeon_[12]\/dungeon_[12]\.png$/.test(lower)) return null;
  if (/grass_tiles_1_blob_test/.test(file)) return 'blob47 | 7×7 authored preview; catalog maps 47 canonical neighbour-mask roles; passable foreground over base ground.';
  if (/farmland_(wet_)?tile/.test(file)) return 'blob47 | 7×8 source; use the reviewed 47-frame sourceRegions recipe, not row-major frame numbers; passable soil.';
  if (/stone_cliff_[1-4]_tile/.test(file)) return 'raised-cliff-14×6 | STONE_RAISED_CLIFF topology: caps 1–3/29–31, sides 15/17, faces 43–45 and 57–59, feet 71–73, inverse sources 19/20/33/34; layered and blocking except foot/inset.';
  if (/beach_tiles/.test(file) && width % 80 === 0 && height === 48) return `shore-banks | ${width / 80} banks of 5×3 cells: local cols 0–2 are outer 3×3, local cols 3–4 are the 2×2 inverse-corner block (SE, SW, NE, NW).`;
  if (/water_(stone_)?tile_\d\.png/.test(file) && width === 48 && height === 80) return 'shore-template | rows 0–2 are outer 3×3; rows 3–4, cols 0–1 are inverse corners; blocking water unless a bridge/override is present.';
  if (/water_(stone_)?tile_\d_anim/.test(file) && height === 80 && width % 48 === 0) return `animated-shore-banks | ${width / 48} temporal banks, each a 3×5 shore template matching the static sheet; animate the selected topology role across banks.`;
  if (/waterfall|lavafall/.test(file)) return 'projected-flow-set | multi-tile vertical face/crest/foot animation; align with a cliff face and keep the fall body blocking.';
  if (/cliff/.test(file)) return 'raised-cliff-candidate | 16px topology sheet; define a dedicated RaisedTerrainTileSet mapping before use. Never mix frames from another cliff palette.';
  if (/dungeon_\d\.png|volcano_tiles|grass_tiles|shroomlands_grass/.test(file)) return 'mixed-environment-sheet | contains several ground, edge, wall/cliff, and decoration banks. Extract semantic subsets; do not treat the entire row-major grid as one autotile.';
  if (/door|gate/.test(file)) return 'stateful-structure | closed frames block, open frames permit passage; animation changes state but collision follows the authoritative open/closed state.';
  if (/bridge/.test(file)) return 'bridge-set | deck cells are passable; rail/abutment cells are blocking objects; draw over blocking water/lava.';
  if (/floor|road|path|deck|pavement|blanket/.test(file)) return 'passable-ground-set | paint on the ground layer; edge/variant selection is visual and does not block movement.';
  if (/wall|hedge|fence|support/.test(file)) return 'blocking-structure-set | compose on the object/structure layer and derive collision from the semantic wall role.';
  return '16px-tile-sheet | row-major inspection coordinates only; identify ground, structure, overlay, and object subsets separately before importing.';
}

function usageFor(source: string, tileSet: string | null): Use {
  const lower = source.toLowerCase();
  const file = basename(source).toLowerCase();
  if (/cute_fantasy_ui/.test(lower) || /\/icons\//.test(lower)) return 'ui';
  if (/\/player\/(accessories|head|hands|chest|legs|feet|tools|player_base|player_mounts)\//.test(lower)) return 'equipment-layer';
  if (/\/weather effects\//.test(lower) || /vfx|effect|cloud|rain|wind/.test(file)) return 'effect';
  if (tileSet) return /anim|animation|waterfall|lavafall/.test(file) ? 'animated-tile-set' : 'tile-set';
  if (/\/buildings?\//.test(lower) || /\/houses\//.test(lower) || /house|hut|tower|tent|barn|church|inn|shed|coop|greenhouse|windmill/.test(file)) return 'building-entity';
  if (/\/enemies\//.test(lower) || /\/npcs?/.test(lower) || /cute_fantasy_characters/.test(lower) || /\/witch\//.test(lower)) return 'entity-animation';
  if (/\/animals\//.test(lower) || /\/snails\//.test(lower) || /\/shroomlings\//.test(lower)) return /anim|\.png/.test(file) && (file.includes('anim') || file.includes('animation') || widthLikeActor(source)) ? 'entity-animation' : 'entity';
  if (/\/crops\//.test(lower) || /\/trees\//.test(lower)) return 'entity';
  if (/anim|animation|animated/.test(file)) return 'entity-animation';
  if (/\/outdoor decoration\//.test(lower) || /\/(?:[^/]*_)?props\//.test(lower) || /\/objects\//.test(lower) || /\/decorations\//.test(lower) || /cute_fantasy_militarycamp\//.test(lower)) return 'world-prop';
  return 'component-sheet';
}

function widthLikeActor(source: string): boolean {
  return /Chicken|Cow|Duck|Frog|Goose|Horse|Kapybara|Mouse|Pig|Sheep|Swan|Camel|Scarab|Vulture|Snail_[1-4]|Shroomling/.test(source);
}

function collisionFor(source: string, use: Use): readonly [Collision, string] {
  const lower = source.toLowerCase();
  const file = basename(source).toLowerCase();
  if (use === 'ui') return ['ui-only', 'UI atlas content; never place in world collision.'];
  if (use === 'equipment-layer') return ['equipment-only', 'Composite with an actor or show as an inventory icon; the owning entity supplies collision.'];
  if (use === 'effect') return ['none', 'Visual effect only; gameplay area effects need a separate authoritative trigger.'];
  if (/flying|bee_flying|butterfly|bat\.png|vulture/.test(lower)) return ['entity-nonsolid', 'Airborne visual/entity; do not occupy terrain collision (combat hitboxes remain separate).'];
  if (/water|lava|cliff|wall|hedge/.test(file) && !/waterfall|foam|decor|middle|buble|bubble/.test(file)) return ['terrain-blocking', 'Blocking by semantic terrain role; overlays, inverse corners, shadows, and cliff feet remain nonblocking.'];
  if (/floor_spikes|pressure_plate|sewer/.test(file)) return ['hazard-trigger', 'Passable tile with a separate hazard/interaction trigger.'];
  if (/door|gate|chest|ladder|stairs|cave_entrance|arch_open/.test(file)) return ['entity-trigger', 'Stateful interaction/transition; collision depends on state or destination rules.'];
  if (use === 'tile-set' || use === 'animated-tile-set' || use === 'tile') return ['terrain-passable', 'Ground/detail cells are passable unless the selected semantic role is a wall, cliff, water, lava, or structure.'];
  if (/tree|rock|boulder|building|house|hut|tower|tent|barn|church|inn|shed|coop|greenhouse|windmill|fence|palisade|barrier|spike|cannon|catapult|mantlet|target|statue|pillar|crate|barrel|table|bench|bed|bookshelf|rack|boat/.test(lower)) return ['entity-solid', 'Y-sorted world object with a foot/footprint collider; transparent canopy/roof pixels do not expand collision.'];
  if (/crop|flower|grass|lilly|lily|small_|fruit|mushroom|plant|decor|banner|flag|rug|carpet/.test(lower)) return ['entity-nonsolid', 'Decoration/harvestable overlay; reserve placement as needed but do not block movement by default.'];
  if (use === 'entity-animation') return ['entity-solid', 'Dynamic actor/entity with a small foot collider; airborne or death states may override it.'];
  if (use === 'building-entity') return ['entity-solid', 'Building footprint blocks movement except authored doors/entrances.'];
  if (use === 'entity') return ['entity-solid', 'World entity with a foot/footprint collider unless used only as a pickup or decoration.'];
  if (use === 'world-prop') return ['review-per-component', 'Composite prop sheet: classify each extracted object as flat decoration, trigger, or solid footprint.'];
  return ['review-per-component', 'Composite sheet; decide collision per extracted semantic sprite.'];
}

const aliases: Readonly<Record<string, readonly string[]>> = {
  boat: ['boat', 'ship', 'watercraft', 'vessel'], sword: ['sword', 'blade', 'weapon'], swordman: ['swordsman', 'sword', 'blade'],
  skull: ['skull', 'flying skull', 'undead'], carrot: ['carrot', 'vegetable', 'crop'], kapybara: ['capybara'],
  lillypad: ['lily pad', 'lilypad'], bower: ['trellis', 'arbor'], bow: ['bow', 'archery', 'weapon'],
  axe: ['axe', 'tool', 'weapon'], hoe: ['hoe', 'tool'], pickaxe: ['pickaxe', 'tool'],
  watercan: ['watering can', 'water can', 'tool'], cannon: ['cannon', 'artillery'], catapult: ['catapult', 'siege weapon'],
};

function searchTermsFor(source: string, description: string, reviewedAssets: readonly string[], use: Use, collision: Collision, tileSet: string | null): string[] {
  const text = `${source} ${description} ${reviewedAssets.join(' ')}`.toLowerCase().replaceAll(/[^a-z0-9]+/g, ' ');
  const tokens = text.split(/\s+/).filter((token) => token.length > 1);
  const terms = new Set<string>([...tokens, use, collision]);
  for (const [needle, additions] of Object.entries(aliases)) if (tokens.includes(needle)) additions.forEach((term) => terms.add(term));
  if (tileSet) terms.add('tile set');
  return [...terms].sort();
}

function entryDescription(source: string): string {
  const fileName = humanize(basename(source));
  const segments = dirname(source).split('/').slice(2).map(humanize).filter((value) => !fileName.toLowerCase().includes(value.toLowerCase()));
  const context = segments.slice(-2).join(' / ');
  return context ? `${fileName} — ${context}` : fileName;
}

function layoutLabel(layout: Layout): string {
  const geometry = layout.cell ? `${layout.cell[0]}×${layout.cell[1]} cells; ${layout.columns}×${layout.rows} (${layout.cells})` : 'no uniform cell grid';
  return `${layout.kind}; ${geometry}; ${layout.confidence}`;
}

function collisionLabel(entry: Entry): string { return `${entry.collision}: ${entry.collisionNotes}`; }

function overview(index: DocumentedIndex): string {
  const packs = [...new Set(index.entries.map((entry) => entry.pack))];
  const counts = (key: (entry: Entry) => string): string => [...new Set(index.entries.map(key))].sort().map((value) => (
    `| ${value} | ${index.entries.filter((entry) => key(entry) === value).length} |`
  )).join('\n');
  const playerSource = index.companionSources[0];
  return `# Cute Fantasy source sprite index

This is the durable discovery index for **every PNG under \`references/Cute_Fantasy*/\`**. It contains ${index.entryCount} source images across ${packs.length} pack roots at source revision \`${index.sourceRevision}\`. Search this file or [the compact JSON](cute-fantasy-index.json) for ordinary names and aliases such as \`boat\`, \`ship\`, \`sword\`, \`blade\`, \`flying skull\`, \`carrot\`, \`lily pad\`, or \`capybara\`.

The source PNGs are licensed references and must not be committed elsewhere. This index is discovery metadata, not permission to copy a sheet directly into runtime assets. Import a reviewed semantic crop through the text-grid asset pipeline described in [docs/11](../11-asset-pipeline.md).

## Quick lookup

\`\`\`sh
# Human search (names, aliases, known internal sprites, gameplay classification)
rg -ni 'boat|ship|sword|flying skull|carrot' docs/reference-assets/cute-fantasy-index.md

# Structured exact-term lookup
jq -r --arg term 'carrot' '.entries[] | select(.searchTerms | index($term)) | [.source, .layout, .reviewedAssets, .use, .collision] | @json' docs/reference-assets/cute-fantasy-index.json

# Show every environment sheet and its composition contract
jq -r '.entries[] | select(.tileSet != null) | [.source, .tileSet, .collision] | @tsv' docs/reference-assets/cute-fantasy-index.json
\`\`\`

## Reading an entry

- **Layout** is the extraction/inspection grid. \`verified\` means an existing extractor or an unambiguous tileset contract proves it; \`family\` is established for the whole sprite family; \`inferred\` is a strong dimensional convention; \`review\` means frame bounds span cells or differ within the sheet. Empty padding cells are not animation frames.
- **Use** says how the sprite should enter the game. A \`tile-set\` is resolved from neighbours; an \`entity\` is independently placed and y-sorted; an \`equipment-layer\` is composited onto the owning actor.
- **Collision** is a gameplay recommendation, never a pixel-alpha collider. \`terrain-blocking\` belongs in the shared terrain/elevation classification. \`entity-solid\` gets a small foot/footprint collider. \`entity-trigger\` changes with an authoritative state. \`review-per-component\` means the sheet mixes flat and solid props.
- **Known contents** lists semantic runtime assets already reviewed and cropped from that source. These names are the strongest internal-sprite labels (for example, the otherwise generic \`Crops.png\` entry exposes carrot, corn, grapes, pumpkin, tomato and wheat). An empty value means the source is still discovery-only, not that the sheet is empty.
- Cell indices are zero-based row-major: \`index = row × columns + column\`. Coordinates are \`x = column × cellWidth\`, \`y = row × cellHeight\`.

## Environment tile-set contracts

1. **Flat blob terrain** — store a semantic ground mask and resolve the canonical 47 neighbour variants. The farmland sheets are 7×8 sources with reviewed non-row-major 47-frame recipes. The two \`Grass_Tiles_1_Blob_TEST*\` sheets are 7×7 previews; use the catalog recipe rather than assuming all 49 cells are valid.
2. **Shore banks** — a 5×3 bank has an outer 3×3 in local columns 0–2 and a 2×2 inverse-corner bank in local columns 3–4 (SE, SW, NE, NW). The static 3×5 water templates place the inverse block in rows 3–4, columns 0–1. Animated 384×80 shores contain eight temporal 48×80 banks: select topology first, then animate the same local role across banks.
3. **Raised cliffs** — use \`raisedTerrainContourGrid\` and \`resolveRaisedTerrainTile\` from \`packages/sim/src/raised-terrain-autotile.ts\`. For the 14×6 stone sheets: north caps 1–3; rear sides 15/17; south caps 29–31; upper faces 43–45; lower faces 57–59; nonblocking feet 71–73; inverse-corner sources 19/20/33/34. Draw base, rear structure and projected faces deepest-first, transparent inverse overlays, then ramps/decals. Collision comes from the semantic plan; inverse overlays and feet do not block. Other cliff palettes are candidates until they receive their own \`RaisedTerrainTileSet\`—never mix palettes inside one boundary.
4. **Mixed biome sheets** — \`Grass_Tiles_*\`, \`ShroomLands_Grass_*\`, \`Volcano_Tiles\`, and \`Dungeon_*.png\` contain several unrelated banks. Extract named subsets; do not run one autotiler over the whole rectangle.
5. **Bridges, doors and hazards** — bridge decks override blocking water/lava while rails and abutments remain solid. Doors/gates are stateful triggers whose open state permits passage. Floor spikes, pressure plates and sewers are passable tiles with separate hazard/interaction triggers.

## Known animation-family maps

- Modular player layers at 576×3584 use 9 columns × 56 rows of 64×64 cells. The exact row/direction/frame-count table is authoritative in [docs/11](../11-asset-pipeline.md#cute-fantasy-modular-player-animation-rows); character body crops are centered 32×40, while held tools/effects retain 64×64.
- Cow, sheep, pig and horse: 15 rows — idle, walk and action in side/down/up; rest, lie and sleep side; hit side/down/up.
- Chicken/goose/rooster: 16 rows — idle, walk, forage, three actions, sleep, hit; then the same eight alternate-facing rows. Duck/swan: 20 rows — seven land rows, three water rows, then the alternate set.
- Frog and mouse: four 32×32 rows. Camel: nine 48×32 rows. Vulture: seven 48×48 rows. Scarab: three 16×16 rows. Snail: idle and walk in side/down/up. Capybara actions are separate 32px horizontal strips. Butterfly is eight colour rows of two 8×8 frames—not four 16px sprites.
- Character add-on combat sheets use square action cells (usually 48px; angels 64px) and action rows. Their exact attack/collapse/hit row meanings can vary by archetype and are flagged for extraction review in the entry.

## Companion Aseprite composition source

\`${playerSource?.source ?? 'references/Player_Aseprite_Files/Player_Main_All.aseprite'}\` is the layered source companion for the modular player. It is ${playerSource?.dimensions.join('×') ?? '576×3584'}, contains ${playerSource?.timelineFrames ?? 8} Aseprite timeline frames at ${playerSource?.frameDurationsMs[0] ?? 100} ms, and has ${playerSource?.frameTags.length ?? 0} named frame tags. Its back-to-front layer order is: ${playerSource?.layersBackToFront.map((layer) => `\`${layer}\``).join(', ') ?? '`horse`, `tool_under`, `base`, `shoes`, `pants`, `shirt`, `hair`, `accesory`, `hands`, `tool_top`'}. Preserve the source spelling \`accesory\` when addressing that layer. This file confirms composition order and timing only: the eight Aseprite timeline frames are **not** the 56 semantic animation rows, so docs/11 remains authoritative for row names and per-row frame counts.

## Summary

### By recommended use

| Use | Files |
| --- | ---: |
${counts((entry) => entry.use)}

### By collision recommendation

| Collision | Files |
| --- | ---: |
${counts((entry) => entry.collision)}

## Exhaustive file index

Every source image appears exactly once below, including byte-identical copies. A duplicate points to the first canonical path so agents do not review identical pixels twice.
`;
}

function markdownIndex(index: DocumentedIndex): string {
  const groups = new Map<string, Entry[]>();
  for (const entry of index.entries) {
    const group = groups.get(entry.pack) ?? [];
    group.push(entry);
    groups.set(entry.pack, group);
  }
  const sections = [...groups.entries()].map(([pack, entries]) => `## ${pack} (${entries.length})

| Source | What it is / search terms | Known reviewed contents | Layout | Animation sets | Use | Collision | Tile-set mapping | Duplicate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${entries.map((entry) => `| \`${markdown(entry.source)}\` | ${markdown(entry.description)}<br><sub>${markdown(entry.searchTerms.join(', '))}</sub> | ${markdown(entry.reviewedAssets.join('; ') || '—')} | ${markdown(layoutLabel(entry.layout))} | ${markdown(entry.animationSets.join('; ') || 'static / variants')} | \`${entry.use}\` | ${markdown(collisionLabel(entry))} | ${markdown(entry.tileSet ?? '—')} | ${entry.duplicateOf ? `\`${markdown(entry.duplicateOf)}\`` : '—'} |`).join('\n')}`).join('\n\n');
  return `${overview(index)}\n\n${sections}\n`;
}

async function main(): Promise<void> {
  const roots = (await readdir(referencesPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('Cute_Fantasy'))
    .map((entry) => join(referencesPath, entry.name)).sort();
  const files = (await Promise.all(roots.map(walk))).flat().sort();
  const reviewedBySource = await reviewedAssetsBySource();
  const playerCompanionSource = 'references/Player_Aseprite_Files/Player_Main_All.aseprite';
  const playerCompanionBytes = await readFile(resolve(rootPath, playerCompanionSource));
  const companionSources = [inspectAseprite(playerCompanionSource, playerCompanionBytes)];
  const canonicalByHash = new Map<string, string>();
  const entries: Entry[] = [];
  for (const path of files) {
    const bytes = await readFile(path);
    const image = decodePng(bytes);
    const source = slash(relative(rootPath, path));
    const sourceParts = source.split('/');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const duplicateOf = canonicalByHash.get(hash) ?? null;
    if (!duplicateOf) canonicalByHash.set(hash, source);
    const layout = layoutFor(source, image.width, image.height);
    const tileSet = tileSetFor(source, image.width, image.height);
    const use = usageFor(source, tileSet);
    const [collision, collisionNotes] = collisionFor(source, use);
    const description = entryDescription(source);
    const reviewedAssets = reviewedBySource.get(source) ?? [];
    entries.push({
      id: slug(source.replace(/^references\//, '').replace(/\.png$/i, '')),
      source,
      pack: sourceParts[1] ?? 'unknown',
      section: sourceParts.slice(2, -1).join('/'),
      name: humanize(basename(source)),
      description,
      reviewedAssets,
      dimensions: [image.width, image.height],
      layout,
      animationSets: animationSetsFor(source, image.width, image.height),
      use,
      collision,
      collisionNotes,
      tileSet,
      searchTerms: searchTermsFor(source, description, reviewedAssets, use, collision, tileSet),
      duplicateOf,
      sha256: hash,
    });
  }
  const revisionInput = [
    ...entries.map((entry) => `${entry.source}:${entry.sha256}`),
    ...companionSources.map((source) => `${source.source}:${source.sha256}`),
  ].join('\n');
  const revision = createHash('sha256').update(revisionInput).digest('hex').slice(0, 16);
  const index: DocumentedIndex = { version: 1, sourcePattern: 'references/Cute_Fantasy*/**/*.png', sourceRevision: revision, entryCount: entries.length, companionSources, entries };
  await mkdir(outputRoot, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputRoot, 'cute-fantasy-index.json'), `${JSON.stringify(index, null, 2)}\n`),
    writeFile(resolve(outputRoot, 'cute-fantasy-index.md'), markdownIndex(index)),
  ]);
  console.log(`Documented ${entries.length} Cute Fantasy PNGs (${canonicalByHash.size} unique) at revision ${revision}.`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
