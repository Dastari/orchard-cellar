/**
 * Gear rig spike: render paper-doll samples that put premium-icon armour and
 * weapons on the modular Cute Fantasy player without per-frame hand drawing.
 *
 *   npm run render:gear-samples -w @orchard/tools
 *
 * Reads licensed sheets under references/ and writes review PNGs to
 * output/gear-rig/ (git-ignored). No runtime assets are produced.
 */
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { CUTE_FANTASY_PLAYER_ROWS } from '@orchard/sim';
import { workspaceRoot } from './assets/load.js';
import { Doll, VIEWS, type FrameRef, type Head, type Loadout } from './gear-rig/doll.js';
import { flipVertical, mirror, rotateQuarter, uprightFromDiagonal, wornOutline } from './gear-rig/held.js';
import { MATERIALS, MATERIAL_ICON_COLUMN, type MaterialName } from './gear-rig/materials.js';
import { Raster } from './gear-rig/raster.js';
import { CELL, measureFrame, type Facing } from './gear-rig/rig.js';

const root = fileURLToPath(workspaceRoot);
const player = (path: string): string => resolve(root, 'references/art/kenmi/cute-fantasy/core/Player', path);
const icons = (path: string): string => resolve(root, 'references/art/kenmi/cute-fantasy/icons', path);
const outDir = resolve(root, 'output/gear-rig');
await mkdir(outDir, { recursive: true });

const doll = await Doll.load(player(''));
const [plateHelmet, heavyHelmet, weaponIcons] = await Promise.all([
  Raster.load(player('Head/Plate_Helmet_1/Plate_Helmet_1_Iron.png')),
  Raster.load(player('Head/Plate_Helmet_2/Heavy_Plate_Helmet_1_Iron.png')),
  Raster.load(icons('Cute_Fantasy_Icons_Weapons/16x16/Weapons_all_16x16.png')),
]);
const { base, hands } = doll;

// ---------------------------------------------------------------------------
// Sample loadouts (plate armour by material, one held weapon)

interface Weapon {
  readonly kind: 'sword' | 'bow';
  /** Premium icon row (shape); the column comes from the material. */
  readonly row: number;
  readonly material: MaterialName;
}

interface Sample {
  readonly label: string;
  readonly head?: Head;
  readonly body?: MaterialName;
  readonly legs?: MaterialName;
  readonly gauntlets?: MaterialName;
  readonly pauldrons?: MaterialName;
  readonly weapon?: Weapon;
}

const LOADOUTS: readonly Sample[] = [
  { label: 'Farmhand (no gear)' },
  {
    label: 'Iron recruit — basic',
    head: { kind: 'kenmi', sheet: 'plate', material: 'iron' },
    body: 'iron', legs: 'iron', weapon: { kind: 'sword', row: 0, material: 'iron' },
  },
  {
    label: 'Bronze guard — basic',
    head: { kind: 'kenmi', sheet: 'heavy', material: 'bronze' },
    body: 'bronze', legs: 'bronze', weapon: { kind: 'sword', row: 13, material: 'bronze' },
  },
  {
    label: 'Horned warlord',
    head: { kind: 'design', design: 'horned_warhelm', material: 'obsidian', accent: 'bronze', detail: 'ruby' },
    body: 'obsidian', legs: 'obsidian', gauntlets: 'obsidian', pauldrons: 'ruby',
    weapon: { kind: 'sword', row: 13, material: 'ruby' },
  },
  {
    label: 'Frost paladin',
    head: { kind: 'design', design: 'winged_helm', material: 'frost', accent: 'silver', detail: 'silver' },
    body: 'frost', legs: 'frost', gauntlets: 'silver', pauldrons: 'silver',
    weapon: { kind: 'sword', row: 26, material: 'frost' },
  },
  {
    label: 'Silver champion',
    head: { kind: 'design', design: 'plumed_greathelm', material: 'silver', accent: 'gold', detail: 'ruby' },
    body: 'silver', legs: 'silver', gauntlets: 'gold', pauldrons: 'gold',
    weapon: { kind: 'sword', row: 7, material: 'gold' },
  },
  {
    label: 'Amethyst monarch',
    head: { kind: 'design', design: 'royal_crown', material: 'gold', accent: 'gold', detail: 'ruby' },
    body: 'amethyst', legs: 'amethyst', pauldrons: 'gold',
    weapon: { kind: 'sword', row: 44, material: 'amethyst' },
  },
  {
    label: 'Jade ranger',
    head: { kind: 'design', design: 'gilded_helm', material: 'jade', accent: 'gold', detail: 'gold' },
    body: 'jade', legs: 'bronze', weapon: { kind: 'bow', row: 112, material: 'gold' },
  },
  {
    label: 'Woodland archer — basic',
    body: 'bronze', weapon: { kind: 'bow', row: 110, material: 'bronze' },
  },
];

const weaponIcon = (weapon: Weapon): Raster => weaponIcons.crop(MATERIAL_ICON_COLUMN[weapon.material] * 16, weapon.row * 16, 16, 16);

function toLoadout(sample: Sample): Loadout {
  // These sheets demonstrate the combat stance; see render-gear-catalogue for rest.
  const loadout: { -readonly [K in keyof Loadout]: Loadout[K] } = { stance: 'combat' };
  if (sample.head) loadout.head = sample.head;
  if (sample.body) loadout.body = { family: 'plate', material: sample.body };
  if (sample.legs) loadout.legs = { family: 'plate', material: sample.legs };
  if (sample.gauntlets) loadout.gauntlets = sample.gauntlets;
  if (sample.pauldrons) loadout.pauldrons = sample.pauldrons;
  if (sample.weapon) loadout.mainHand = { kind: sample.weapon.kind === 'bow' ? 'bow' : 'blade', icon: weaponIcon(sample.weapon) };
  return loadout;
}

const composeFrame = (sample: Sample, view: FrameRef): Promise<Raster> => doll.compose(toLoadout(sample), view);
const FRAMES: readonly FrameRef[] = [VIEWS.idle_down, VIEWS.walk_down, VIEWS.idle_right, VIEWS.walk_right, VIEWS.idle_left, VIEWS.idle_up, VIEWS.walk_up];
const sheetFacing = (name: string): Facing => (name.endsWith('_up') ? 'up' : name.endsWith('_right') ? 'right' : 'down');
const cellOf = (sheet: Raster, row: number, frame: number): Raster => sheet.crop(frame * CELL, row * CELL, CELL, CELL);

// ---------------------------------------------------------------------------
// Sheet helpers

const GRASS = '#5f8a4c';
const CROP = { x: 12, y: 10, width: 40, height: 36 } as const;

interface Label {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly size?: number;
}

type CanvasContext = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

async function saveLabelled(
  sheet: Raster,
  scale: number,
  labels: readonly Label[],
  file: string,
  after?: (context: CanvasContext) => Promise<void>,
): Promise<void> {
  const scaled = sheet.scaled(scale);
  const tmp = resolve(outDir, `.${file}`);
  await scaled.save(tmp);
  const image = await loadImage(tmp);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  for (const label of labels) {
    context.font = `bold ${label.size ?? 20}px sans-serif`;
    context.fillStyle = '#10141c';
    context.fillText(label.text, label.x * scale + 2, label.y * scale + 2);
    context.fillStyle = '#f4f1e8';
    context.fillText(label.text, label.x * scale, label.y * scale);
  }
  if (after) await after(context);
  const { writeFile, rm } = await import('node:fs/promises');
  await writeFile(resolve(outDir, file), canvas.toBuffer('image/png'));
  await rm(tmp);
}

// 1. Loadouts across directions -------------------------------------------------
{
  const labelWidth = 44;
  const top = 8;
  const sheet = new Raster(labelWidth + FRAMES.length * CROP.width, top + LOADOUTS.length * CROP.height).fill(GRASS);
  for (let x = 0; x < labelWidth; x += 1) for (let y = 0; y < sheet.height; y += 1) sheet.set(x, y, '#2b3140');
  for (let y = 0; y < top; y += 1) for (let x = 0; x < sheet.width; x += 1) sheet.set(x, y, '#2b3140');
  const labels: Label[] = FRAMES.map((ref, index) => ({ x: labelWidth + index * CROP.width + 3, y: 6, text: ref.animation, size: 16 }));
  for (const [rowIndex, loadout] of LOADOUTS.entries()) {
    labels.push({ x: 2, y: top + rowIndex * CROP.height + 20, text: loadout.label, size: 15 });
    for (const [column, ref] of FRAMES.entries()) {
      const cell = (await composeFrame(loadout, ref)).crop(CROP.x, CROP.y, CROP.width, CROP.height);
      sheet.draw(cell, labelWidth + column * CROP.width, top + rowIndex * CROP.height);
    }
  }
  await saveLabelled(sheet, 5, labels, 'loadouts.png');

  // Same loadouts at a typical in-game zoom (3×), no enlargement beyond that.
  const lineup = new Raster(LOADOUTS.length * 30 + 4, 36).fill(GRASS);
  for (const [index, loadout] of LOADOUTS.entries()) {
    lineup.draw((await composeFrame(loadout, FRAMES[0]!)).crop(17, 10, 30, 34), 2 + index * 30, 1);
  }
  await lineup.scaled(3).save(resolve(outDir, 'loadouts-ingame-3x.png'));
}

// 2. Every head in every material --------------------------------------------------
{
  const materials = Object.keys(MATERIALS) as MaterialName[];
  const heads: { label: string; make: (material: MaterialName) => Head }[] = [
    { label: 'Kenmi plate (basic)', make: (material) => ({ kind: 'kenmi', sheet: 'plate', material }) },
    { label: 'Kenmi heavy (basic)', make: (material) => ({ kind: 'kenmi', sheet: 'heavy', material }) },
    { label: 'Horned warhelm', make: (material) => ({ kind: 'design', design: 'horned_warhelm', material, accent: 'bronze', detail: 'ruby' }) },
    { label: 'Winged helm', make: (material) => ({ kind: 'design', design: 'winged_helm', material, accent: 'silver', detail: 'silver' }) },
    { label: 'Plumed greathelm', make: (material) => ({ kind: 'design', design: 'plumed_greathelm', material, accent: 'gold', detail: 'ruby' }) },
    { label: 'Gilded helm', make: (material) => ({ kind: 'design', design: 'gilded_helm', material, accent: material === 'gold' ? 'silver' : 'gold', detail: 'gold' }) },
    { label: 'Royal crown', make: (material) => ({ kind: 'design', design: 'royal_crown', material: 'gold', accent: material, detail: 'ruby' }) },
  ];
  const labelWidth = 40;
  const size = { width: 22, height: 26 };
  const top = 8;
  const sheet = new Raster(labelWidth + materials.length * size.width, top + heads.length * size.height).fill(GRASS);
  for (let x = 0; x < labelWidth; x += 1) for (let y = 0; y < sheet.height; y += 1) sheet.set(x, y, '#2b3140');
  for (let y = 0; y < top; y += 1) for (let x = 0; x < sheet.width; x += 1) sheet.set(x, y, '#2b3140');
  const labels: Label[] = materials.map((material, index) => ({ x: labelWidth + index * size.width + 2, y: 6, text: material, size: 14 }));
  for (const [rowIndex, head] of heads.entries()) {
    labels.push({ x: 2, y: top + rowIndex * size.height + 15, text: head.label, size: 15 });
    for (const [column, material] of materials.entries()) {
      const sample: Sample = { label: '', head: head.make(material), body: material };
      const cell = (await composeFrame(sample, FRAMES[0]!)).crop(21, 15, size.width, size.height);
      sheet.draw(cell, labelWidth + column * size.width, top + rowIndex * size.height);
    }
  }
  await saveLabelled(sheet, 5, labels, 'heads-by-material.png');
}

// 3. Held weapons: inventory icon → automatic upright → in hand -----------------------
{
  const weapons: { label: string; weapon: Weapon }[] = [
    { label: 'Iron arming sword', weapon: { kind: 'sword', row: 0, material: 'iron' } },
    { label: 'Gold ornate sword', weapon: { kind: 'sword', row: 7, material: 'gold' } },
    { label: 'Ruby sword', weapon: { kind: 'sword', row: 13, material: 'ruby' } },
    { label: 'Frost rapier', weapon: { kind: 'sword', row: 26, material: 'frost' } },
    { label: 'Amethyst blade', weapon: { kind: 'sword', row: 44, material: 'amethyst' } },
    { label: 'Obsidian sword', weapon: { kind: 'sword', row: 20, material: 'obsidian' } },
    { label: 'Wooden bow', weapon: { kind: 'bow', row: 110, material: 'bronze' } },
    { label: 'Gold recurve', weapon: { kind: 'bow', row: 112, material: 'gold' } },
    { label: 'Iron longbow', weapon: { kind: 'bow', row: 115, material: 'iron' } },
  ];
  const labelWidth = 40;
  const cellWidth = 28;
  const rowHeight = 30;
  const top = 8;
  const columns = ['icon', 'upright', 'down', 'right', 'left', 'up'];
  const sheet = new Raster(labelWidth + columns.length * cellWidth, top + weapons.length * rowHeight).fill(GRASS);
  for (let x = 0; x < labelWidth; x += 1) for (let y = 0; y < sheet.height; y += 1) sheet.set(x, y, '#2b3140');
  for (let y = 0; y < top; y += 1) for (let x = 0; x < sheet.width; x += 1) sheet.set(x, y, '#2b3140');
  const labels: Label[] = columns.map((column, index) => ({ x: labelWidth + index * cellWidth + 2, y: 6, text: column, size: 14 }));
  for (const [rowIndex, { label, weapon }] of weapons.entries()) {
    const y = top + rowIndex * rowHeight;
    labels.push({ x: 2, y: y + 17, text: label, size: 15 });
    sheet.draw(wornOutline(weaponIcon(weapon)), labelWidth + 6, y + 7);
    const upright = doll.heldSprite(toLoadout({ label, weapon }).mainHand!);
    sheet.draw(upright, labelWidth + cellWidth + Math.floor((cellWidth - upright.width) / 2), y + 4);
    for (const [index, ref] of [FRAMES[0]!, FRAMES[2]!, FRAMES[4]!, FRAMES[5]!].entries()) {
      sheet.draw((await composeFrame({ label, weapon }, ref)).crop(18, 16, cellWidth, rowHeight), labelWidth + (2 + index) * cellWidth, y);
    }
  }
  await saveLabelled(sheet, 5, labels, 'held-weapons.png');
}

// 0. Rig check: regenerate Kenmi's own helmet sheets from three sprites + anchors -----
{
  for (const [label, sheet] of [['Plate_Helmet_1', plateHelmet], ['Heavy_Plate_Helmet_1', heavyHelmet]] as const) {
    const sprites = new Map<Facing, { image: Raster; dx: number; dy: number }>();
    for (const [facing, row] of [['down', 0], ['right', 1], ['up', 2]] as const) {
      const cell = cellOf(sheet, row, 0);
      const bounds = cell.bounds()!;
      const anchors = measureFrame(base, hands, row, 0, facing)!;
      sprites.set(facing, {
        image: cell.crop(bounds.x, bounds.y, bounds.width, bounds.height),
        dx: bounds.x - anchors.head.x,
        dy: bounds.y - anchors.head.y,
      });
    }
    let total = 0;
    let exact = 0;
    const misses = new Set<string>();
    for (const entry of CUTE_FANTASY_PLAYER_ROWS) {
      const facing = sheetFacing(entry.name);
      for (let frame = 0; frame < entry.authoredFrameCount; frame += 1) {
        const truth = cellOf(sheet, entry.row, frame);
        const anchors = measureFrame(base, hands, entry.row, frame, facing);
        if (!truth.bounds() || !anchors) continue;
        const sprite = sprites.get(facing)!;
        const generated = new Raster(CELL, CELL).draw(sprite.image, anchors.head.x + sprite.dx, anchors.head.y + sprite.dy);
        total += 1;
        if (Buffer.from(generated.rgba).equals(Buffer.from(truth.rgba))) exact += 1;
        else misses.add(entry.name);
      }
    }
    console.log(`${label}: ${exact}/${total} frames pixel-exact from 3 sprites + measured head anchors; differs in ${[...misses].join(', ')}`);
  }
}

// 4. Arrows in flight: exact 8-way set vs today's screen-scale free rotation ----------
{
  const arrows: { label: string; row: number; material: MaterialName }[] = [
    { label: 'Iron arrow', row: 117, material: 'iron' },
    { label: 'Gold arrow', row: 118, material: 'gold' },
    { label: 'Frost arrow', row: 124, material: 'frost' },
  ];
  const labelWidth = 40;
  const cellWidth = 20;
  const rowHeight = 22;
  const top = 8;
  const sheet = new Raster(labelWidth + 8 * cellWidth, top + arrows.length * 2 * rowHeight).fill(GRASS);
  for (let x = 0; x < labelWidth; x += 1) for (let y = 0; y < sheet.height; y += 1) sheet.set(x, y, '#2b3140');
  for (let y = 0; y < top; y += 1) for (let x = 0; x < sheet.width; x += 1) sheet.set(x, y, '#2b3140');
  const labels: Label[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((text, index) => ({ x: labelWidth + index * cellWidth + 8, y: 6, text, size: 14 }));
  const freeAim: { sprite: Raster; x: number; y: number; angle: number }[] = [];
  arrows.forEach(({ label, row, material }, index) => {
    const icon = wornOutline(weaponIcons.crop(MATERIAL_ICON_COLUMN[material] * 16, row * 16, 16, 16));
    const north = uprightFromDiagonal(weaponIcons.crop(MATERIAL_ICON_COLUMN[material] * 16, row * 16, 16, 16));
    const east = rotateQuarter(north);
    const exact = [north, icon, east, flipVertical(icon), flipVertical(north), mirror(flipVertical(icon)), mirror(east), mirror(icon)];
    const yExact = top + index * 2 * rowHeight;
    labels.push({ x: 2, y: yExact + 13, text: `${label}: exact 8-way`, size: 14 });
    exact.forEach((sprite, direction) => {
      sheet.draw(sprite, labelWidth + direction * cellWidth + Math.floor((cellWidth - sprite.width) / 2), yExact + Math.floor((rowHeight - sprite.height) / 2));
    });
    const yRotated = yExact + rowHeight;
    labels.push({ x: 2, y: yRotated + 13, text: 'free aim +10° (today)', size: 14 });
    for (let direction = 0; direction < 8; direction += 1) {
      // Today's renderer rotates the east-facing sprite at screen scale by the velocity angle.
      freeAim.push({
        sprite: east,
        x: labelWidth + direction * cellWidth + cellWidth / 2,
        y: yRotated + rowHeight / 2,
        angle: ((direction * 45 - 90 + 10) * Math.PI) / 180,
      });
    }
  });
  const scale = 5;
  await saveLabelled(sheet, scale, labels, 'arrows.png', async (context) => {
    for (const { sprite, x, y, angle } of freeAim) {
      const source = createCanvas(sprite.width, sprite.height);
      const sourceContext = source.getContext('2d');
      const data = sourceContext.createImageData(sprite.width, sprite.height);
      data.data.set(sprite.rgba);
      sourceContext.putImageData(data, 0, 0);
      context.save();
      context.imageSmoothingEnabled = false;
      context.translate(x * scale, y * scale);
      context.scale(scale, scale);
      context.rotate(angle);
      context.drawImage(source, -sprite.width / 2, -sprite.height / 2);
      context.restore();
    }
  });
}

console.log(`Wrote gear rig samples to ${outDir}`);
