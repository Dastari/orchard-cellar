import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CAPE, CAPE_DRAPE, HEAD_DESIGNS, PAULDRON, paint, type HeadDesign } from './designs.js';
import { flipVertical, mirror, uprightFromDiagonal, uprightGrip, wornOutline } from './held.js';
import { MATERIALS, WORN_OUTLINE, rampSwap, type MaterialName } from './materials.js';
import { Raster } from './raster.js';
import { CELL, measureFrame, type Facing, type FrameAnchors } from './rig.js';

/** Kenmi colour names used by the cloth layer files (Shirt_1_<Colour>.png …). */
export type ClothColour = 'Black' | 'Blue' | 'Brown' | 'Green' | 'Orange' | 'Pink' | 'Purple' | 'Red' | 'White';

export type Garment =
  | { readonly family: 'plate'; readonly material: MaterialName }
  | { readonly family: 'shirt' | 'tunic' | 'flannel' | 'vestments'; readonly colour: ClothColour }
  | { readonly family: 'trousers' | 'dungarees' | 'breeches'; readonly colour: ClothColour };

export type Head =
  | { readonly kind: 'kenmi'; readonly sheet: 'plate' | 'heavy'; readonly material: MaterialName }
  | {
    readonly kind: 'design';
    readonly design: string;
    readonly material: MaterialName;
    readonly accent: MaterialName;
    readonly detail: MaterialName;
  };

export type HeldKind = 'blade' | 'bow' | 'crossbow' | 'staff' | 'shield';

/** Anything carried in a hand, given as its 16×16 inventory icon in final colours. */
export interface Held {
  readonly kind: HeldKind;
  readonly icon: Raster;
  /** Legendary glow colour; drawn as a soft one-pixel halo around the held sprite. */
  readonly aura?: string;
  /** Carried on the back hilt-up (swords, daggers) or head-up (hafted weapons, bows, staffs). */
  readonly carry?: 'hilt' | 'head';
}

export interface Loadout {
  readonly hair?: string;
  readonly head?: Head;
  readonly body?: Garment;
  readonly legs?: Garment;
  readonly gauntlets?: MaterialName;
  readonly pauldrons?: MaterialName;
  readonly mainHand?: Held;
  readonly offHand?: Held;
  /** Footwear: Kenmi shoes are one colour, two pixels per foot; boots also colour the ankles. */
  readonly feet?: { readonly kind: 'shoes' | 'boots' | 'sabatons'; readonly material: MaterialName };
  readonly cape?: { readonly material: MaterialName; readonly trim: MaterialName };
  /**
   * `rest` (default): ordinary idle/walk rows with weapons, shields and bows
   * carried on the back. `combat`: Kenmi's arms-out `hold_*` stance with the
   * weapon in hand, used while fighting.
   */
  readonly stance?: 'rest' | 'combat';
}

export interface FrameRef {
  readonly animation: string;
  readonly row: number;
  readonly frame: number;
  readonly mirrored: boolean;
  /** Kenmi's arms-out `hold_*` stance, used whenever something is held. */
  readonly armed: { readonly row: number; readonly frame: number };
}

export const VIEWS = {
  idle_down: { animation: 'idle_down', row: 0, frame: 0, mirrored: false, armed: { row: 20, frame: 0 } },
  walk_down: { animation: 'walk_down', row: 3, frame: 1, mirrored: false, armed: { row: 23, frame: 1 } },
  idle_right: { animation: 'idle_right', row: 1, frame: 0, mirrored: false, armed: { row: 21, frame: 0 } },
  walk_right: { animation: 'walk_right', row: 4, frame: 3, mirrored: false, armed: { row: 24, frame: 2 } },
  idle_left: { animation: 'idle_left', row: 1, frame: 0, mirrored: true, armed: { row: 21, frame: 0 } },
  idle_up: { animation: 'idle_up', row: 2, frame: 0, mirrored: false, armed: { row: 22, frame: 0 } },
  walk_up: { animation: 'walk_up', row: 5, frame: 2, mirrored: false, armed: { row: 25, frame: 1 } },
} as const satisfies Record<string, FrameRef>;

const CLOTH_DIRS: Record<Exclude<Garment['family'], 'plate'>, string> = {
  shirt: 'Chest/OG_Shirt',
  tunic: 'Chest/Farmer_Shirt',
  flannel: 'Chest/Lumberjack_Shirt',
  vestments: 'Chest/Royal_Shirt',
  trousers: 'Legs/OG_Pants',
  dungarees: 'Legs/Farmer_Pants',
  breeches: 'Legs/Royal_Pants',
};

/** Not every Kenmi garment ships every colour; fall back through similar dyes. */
const COLOUR_FALLBACKS: Record<ClothColour, readonly string[]> = {
  Black: ['Black'], Blue: ['Blue'], Green: ['Green'], Orange: ['Orange'], Pink: ['Pink', 'Red'],
  Purple: ['Purple'], Red: ['Red'], Brown: ['Brown', 'White_and_Brown', 'Orange'], White: ['White', 'White_and_Brown', 'Pink'],
};

const sheetFacing = (name: string): Facing => (name.endsWith('_up') ? 'up' : name.endsWith('_right') ? 'right' : 'down');
const cellOf = (sheet: Raster, row: number, frame: number): Raster => sheet.crop(frame * CELL, row * CELL, CELL, CELL);
const IRON = MATERIALS.iron;

/** Soft halo: a translucent one-pixel ring in `color` around every opaque pixel. */
export function withAura(image: Raster, color: string, alpha = 150): Raster {
  const out = new Raster(image.width + 2, image.height + 2);
  const halo = new Raster(out.width, out.height);
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      if (image.alpha(x - 1, y - 1)) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => image.alpha(x - 1 + dx!, y - 1 + dy!) > 0);
      if (near) halo.set(x, y, color, alpha);
    }
  }
  return out.draw(halo, 0, 0).draw(image, 1, 1);
}

export class Doll {
  private readonly clothCache = new Map<string, Promise<Raster>>();
  private readonly heldCache = new Map<Raster, Raster>();
  private readonly designs = new Map<string, HeadDesign>(HEAD_DESIGNS.map((design) => [design.name, design]));

  private constructor(
    private readonly playerRoot: string,
    private readonly sheets: Readonly<Record<'base' | 'hands' | 'shoes' | 'plateHelmet' | 'heavyHelmet' | 'plateChest' | 'plateLegs', Raster>>,
  ) {}

  static async load(playerRoot: string): Promise<Doll> {
    const load = (path: string): Promise<Raster> => Raster.load(resolve(playerRoot, path));
    const [base, hands, shoes, plateHelmet, heavyHelmet, plateChest, plateLegs] = await Promise.all([
      load('Player_Base/Player_Base_animations.png'),
      load('Hands/Hands_1_Bare.png'),
      load('Feet/Shoes_1_Brown.png'),
      load('Head/Plate_Helmet_1/Plate_Helmet_1_Iron.png'),
      load('Head/Plate_Helmet_2/Heavy_Plate_Helmet_1_Iron.png'),
      load('Chest/Plate_Chest/Plate_Chest_Iron.png'),
      load('Legs/Plate_Legs/Plate_Legs_Iron.png'),
    ]);
    return new Doll(playerRoot, { base, hands, shoes, plateHelmet, heavyHelmet, plateChest, plateLegs });
  }

  get base(): Raster {
    return this.sheets.base;
  }

  get hands(): Raster {
    return this.sheets.hands;
  }

  private sheet(path: string): Promise<Raster> {
    let cached = this.clothCache.get(path);
    if (!cached) {
      cached = Raster.load(resolve(this.playerRoot, path));
      this.clothCache.set(path, cached);
    }
    return cached;
  }

  private async garmentLayer(garment: Garment, slot: 'body' | 'legs', row: number, frame: number): Promise<Raster> {
    if (garment.family === 'plate') {
      const sheet = slot === 'body' ? this.sheets.plateChest : this.sheets.plateLegs;
      return cellOf(sheet, row, frame).recolor(rampSwap(IRON, MATERIALS[garment.material]));
    }
    const directory = CLOTH_DIRS[garment.family];
    const files = readdirSync(resolve(this.playerRoot, directory));
    const file = COLOUR_FALLBACKS[garment.colour]
      .map((colour) => files.find((name) => name.endsWith(`_${colour}.png`)))
      .find((name) => name !== undefined) ?? files.sort()[0]!;
    return cellOf(await this.sheet(`${directory}/${file}`), row, frame);
  }

  private gauntletMap(material: MaterialName): Map<string, string> {
    const colors = new Set<string>();
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL * 6; x += 1) {
        const color = this.sheets.hands.hex(x, y);
        if (color && color !== WORN_OUTLINE) colors.add(color);
      }
    }
    const luminance = (hex: string): number => {
      const value = Number.parseInt(hex.slice(1), 16);
      return 0.3 * (value >> 16) + 0.59 * ((value >> 8) & 255) + 0.11 * (value & 255);
    };
    const ordered = [...colors].sort((left, right) => luminance(left) - luminance(right));
    const ramp = MATERIALS[material];
    return new Map(ordered.map((color, index) => [color, ramp[Math.min(4, 2 + index)]!]));
  }

  private hidesHair(head: Head | undefined): boolean {
    if (!head) return false;
    if (head.kind === 'kenmi') return true;
    return this.designs.get(head.design)?.hidesHair ?? true;
  }

  private drawHead(cell: Raster, head: Head, anchors: FrameAnchors, facing: Facing, row: number, frame: number): void {
    if (head.kind === 'kenmi') {
      const sheet = head.sheet === 'plate' ? this.sheets.plateHelmet : this.sheets.heavyHelmet;
      cell.draw(cellOf(sheet, row, frame).recolor(rampSwap(IRON, MATERIALS[head.material])), 0, 0);
      return;
    }
    const design = this.designs.get(head.design);
    if (!design) throw new Error(`Unknown head design ${head.design}`);
    const ramps = { primary: MATERIALS[head.material], accent: MATERIALS[head.accent], detail: MATERIALS[head.detail] };
    for (const part of design.parts[facing]) {
      cell.draw(paint(part.grid, ramps), anchors.head.x + part.dx, anchors.head.y + part.dy);
    }
  }

  /** Upright in-hand sprite for a held item (shields stay face-on). */
  heldSprite(held: Held): Raster {
    let sprite = this.heldCache.get(held.icon);
    if (!sprite) {
      sprite = held.kind === 'shield'
        ? wornOutline(held.icon)
        : uprightFromDiagonal(held.kind === 'bow' || held.kind === 'crossbow' ? mirror(held.icon) : held.icon);
      this.heldCache.set(held.icon, sprite);
    }
    return held.aura ? withAura(sprite, held.aura) : sprite;
  }

  /**
   * Main-hand items sit outside the head silhouette, as on Kenmi's armed knights:
   * screen-left hand facing down, the forward hand facing right, and screen-right
   * facing up. Shields go on the other arm, face-on. Facing right, the shield is
   * on the far arm and is drawn behind the body.
   */
  private drawHeld(cell: Raster, held: Held, anchors: FrameAnchors, facing: Facing, hand: 'main' | 'off'): void {
    const mainSide = facing === 'down' ? 'left' : 'right';
    const side = hand === 'main' ? mainSide : mainSide === 'left' ? 'right' : 'left';
    let sprite = this.heldSprite(held);
    const pad = held.aura ? 1 : 0;
    if (held.kind === 'shield') {
      if (facing === 'right') {
        const head = anchors.head;
        cell.draw(sprite, head.x - Math.floor(sprite.width / 2) + 1, head.y + 13 - Math.floor(sprite.height / 2));
        return;
      }
      const box = side === 'left' ? anchors.leftHand : anchors.rightHand;
      const cx = box ? Math.floor((box.x0 + box.x1) / 2) + (side === 'left' ? -1 : 1) : anchors.head.x + (side === 'left' ? -1 : 13);
      const cy = box ? Math.floor((box.y0 + box.y1) / 2) + 1 : anchors.head.y + 11;
      cell.draw(sprite, cx - Math.floor(sprite.width / 2), cy - Math.floor(sprite.height / 2));
      return;
    }
    const box = side === 'left' ? anchors.leftHand : anchors.rightHand;
    const grip = box
      ? { x: side === 'left' ? box.x0 : box.x1 + (facing === 'right' ? 1 : 0), y: Math.floor((box.y0 + box.y1) / 2) }
      : { x: anchors.head.x + (side === 'left' ? -2 : 14), y: anchors.head.y + 10 };
    if (side === 'right' && held.kind === 'bow') sprite = mirror(sprite);
    if (side === 'left' && held.kind === 'crossbow') sprite = mirror(sprite);
    const bounds = sprite.bounds()!;
    const hold = held.kind === 'bow'
      ? { x: side === 'left' ? bounds.x + bounds.width - 2 - pad : bounds.x + 1 + pad, y: bounds.y + Math.floor(bounds.height / 2) }
      : uprightGrip(sprite, held.kind === 'staff' ? 5 + pad : 3 + pad);
    cell.draw(sprite, grip.x - hold.x, grip.y - hold.y);
  }

  /**
   * Carried on the back at rest, using the 45° icon itself so the item keeps its
   * exact look. Swords and daggers ride hilt-up and hafted items head-up, over the
   * character's right shoulder: screen-left facing down (behind the body, poking
   * out beside the head), screen-right facing up (over the back, under the hair or
   * helmet), and behind the body facing right. Shields show on the back only from
   * behind or the side; facing down they are hidden by the body.
   */
  private drawCarried(cell: Raster, held: Held, anchors: FrameAnchors, facing: Facing): void {
    const icon = wornOutline(held.icon);
    const { x, y } = anchors.head;
    if (held.kind === 'shield') {
      if (facing === 'down') return;
      const cx = facing === 'right' ? x + 1 : x + 6;
      cell.draw(icon, cx - Math.floor(icon.width / 2), y + 12 - Math.floor(icon.height / 2));
      return;
    }
    // Icons point up-right with the grip bottom-left.
    const upperLeft = (held.carry ?? 'head') === 'hilt' ? flipVertical(icon) : mirror(icon);
    const sprite = facing === 'up' ? mirror(upperLeft) : upperLeft;
    // Raised and offset toward the carrying shoulder so the hilt or head clears the chibi head.
    const cx = facing === 'right' ? x + 3 : facing === 'up' ? x + 8 : x + 4;
    const cy = facing === 'right' ? y + 7 : y + 5;
    cell.draw(sprite, cx - Math.floor(sprite.width / 2), cy - Math.floor(sprite.height / 2));
  }

  private drawCape(cell: Raster, cape: NonNullable<Loadout['cape']>, anchors: FrameAnchors, facing: Facing, walking: boolean): void {
    const part = CAPE[facing];
    const image = paint(part.grid, { primary: MATERIALS[cape.material], accent: MATERIALS[cape.trim], detail: MATERIALS[cape.trim] });
    // Facing right the cape flares one pixel further back while walking.
    const sway = facing === 'right' && walking ? -1 : 0;
    cell.draw(image, anchors.head.x + part.dx + sway, anchors.head.y + part.dy);
  }

  /** Recolour the shoe pixels (and, for boots, the two leg rows above them). */
  private drawFeet(cell: Raster, feet: NonNullable<Loadout['feet']>, row: number, frame: number): void {
    const shoes = cellOf(this.sheets.shoes, row, frame);
    const ramp = MATERIALS[feet.material];
    const bounds = shoes.bounds();
    if (!bounds) return;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        if (!shoes.alpha(x, y)) continue;
        cell.set(x, y, feet.kind === 'sabatons' ? ramp[2] : ramp[1]);
        if (feet.kind === 'shoes') continue;
        // Boots and sabatons climb the ankle: recolour leg pixels directly above each foot.
        for (let up = 1; up <= (feet.kind === 'sabatons' ? 2 : 1); up += 1) {
          const color = cell.hex(x, y - up);
          if (color && color !== WORN_OUTLINE) cell.set(x, y - up, up === 1 ? ramp[feet.kind === 'sabatons' ? 3 : 2] : ramp[3]);
        }
      }
    }
  }

  async compose(loadout: Loadout, view: FrameRef): Promise<Raster> {
    const holding = loadout.mainHand !== undefined || loadout.offHand !== undefined;
    const combat = holding && loadout.stance === 'combat';
    const ref = combat ? { ...view, ...view.armed } : view;
    const facing = sheetFacing(ref.animation.replace('_left', '_right'));
    const anchors = measureFrame(this.sheets.base, this.sheets.hands, ref.row, ref.frame, facing);
    if (!anchors) throw new Error(`No body in row ${ref.row} frame ${ref.frame}`);
    const { row, frame } = ref;
    const walking = ref.animation.startsWith('walk');
    const cell = new Raster(CELL, CELL);
    const carried = combat ? [] : [loadout.mainHand, loadout.offHand].filter((held): held is Held => held !== undefined)
      // Shields are strapped over any weapon on the back.
      .sort((a, b) => Number(a.kind === 'shield') - Number(b.kind === 'shield'));

    if (loadout.cape && CAPE[facing].layer === 'behind') this.drawCape(cell, loadout.cape, anchors, facing, walking);
    if (facing !== 'up') for (const held of carried) this.drawCarried(cell, held, anchors, facing);
    if (combat && loadout.offHand?.kind === 'shield' && facing === 'right') this.drawHeld(cell, loadout.offHand, anchors, facing, 'off');
    cell.draw(cellOf(this.sheets.base, row, frame), 0, 0);
    cell.draw(await this.garmentLayer(loadout.legs ?? { family: 'trousers', colour: 'Brown' }, 'legs', row, frame), 0, 0);
    cell.draw(cellOf(this.sheets.shoes, row, frame), 0, 0);
    if (loadout.feet) this.drawFeet(cell, loadout.feet, row, frame);
    cell.draw(await this.garmentLayer(loadout.body ?? { family: 'shirt', colour: 'Blue' }, 'body', row, frame), 0, 0);
    if (loadout.cape && CAPE[facing].layer === 'over') this.drawCape(cell, loadout.cape, anchors, facing, walking);
    if (facing === 'up') for (const held of carried) this.drawCarried(cell, held, anchors, facing);
    if (!this.hidesHair(loadout.head)) cell.draw(cellOf(await this.sheet(loadout.hair ?? 'Head/Hair_1/Hair_1_Brown.png'), row, frame), 0, 0);
    if (loadout.head) this.drawHead(cell, loadout.head, anchors, facing, row, frame);
    if (combat && loadout.mainHand) this.drawHeld(cell, loadout.mainHand, anchors, facing, 'main');
    if (combat && loadout.offHand && !(loadout.offHand.kind === 'shield' && facing === 'right')) {
      this.drawHeld(cell, loadout.offHand, anchors, facing, 'off');
    }
    const handLayer = cellOf(this.sheets.hands, row, frame);
    cell.draw(loadout.gauntlets ? handLayer.recolor(this.gauntletMap(loadout.gauntlets)) : handLayer, 0, 0);
    if (loadout.pauldrons) {
      const guard = paint(PAULDRON, { primary: IRON, accent: MATERIALS[loadout.pauldrons], detail: IRON });
      const caps = facing === 'right'
        ? [anchors.rightHand && { x: anchors.rightHand.x0 + 1, y: anchors.rightHand.y0 }]
        : [
          anchors.leftHand && { x: anchors.leftHand.x1, y: anchors.leftHand.y0 },
          anchors.rightHand && { x: anchors.rightHand.x0, y: anchors.rightHand.y0 },
        ];
      for (const cap of caps) if (cap) cell.draw(guard, cap.x - 2, cap.y - 2);
    }
    if (loadout.cape && facing === 'down' && !loadout.pauldrons) {
      const { material, trim } = loadout.cape;
      const drape = paint(CAPE_DRAPE.grid, { primary: MATERIALS[material], accent: MATERIALS[trim], detail: MATERIALS[trim] });
      cell.draw(drape, anchors.head.x + CAPE_DRAPE.dx - 1, anchors.head.y + CAPE_DRAPE.dy);
    }
    return ref.mirrored ? mirror(cell) : cell;
  }
}

export { measureFrame };
