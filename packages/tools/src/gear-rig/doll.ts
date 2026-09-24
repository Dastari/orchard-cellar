import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { HEAD_DESIGNS, PAULDRON, paint, type HeadDesign } from './designs.js';
import { mirror, uprightFromDiagonal, uprightGrip, wornOutline } from './held.js';
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

export type HeldKind = 'blade' | 'bow' | 'staff' | 'shield';

/** Anything carried in a hand, given as its 16×16 inventory icon in final colours. */
export interface Held {
  readonly kind: HeldKind;
  readonly icon: Raster;
  /** Legendary glow colour; drawn as a soft one-pixel halo around the held sprite. */
  readonly aura?: string;
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
        : uprightFromDiagonal(held.kind === 'bow' ? mirror(held.icon) : held.icon);
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
    const bounds = sprite.bounds()!;
    const hold = held.kind === 'bow'
      ? { x: side === 'left' ? bounds.x + bounds.width - 2 - pad : bounds.x + 1 + pad, y: bounds.y + Math.floor(bounds.height / 2) }
      : uprightGrip(sprite, held.kind === 'staff' ? 5 + pad : 3 + pad);
    cell.draw(sprite, grip.x - hold.x, grip.y - hold.y);
  }

  async compose(loadout: Loadout, view: FrameRef): Promise<Raster> {
    const holding = loadout.mainHand !== undefined || loadout.offHand !== undefined;
    const ref = holding ? { ...view, ...view.armed } : view;
    const facing = sheetFacing(ref.animation.replace('_left', '_right'));
    const anchors = measureFrame(this.sheets.base, this.sheets.hands, ref.row, ref.frame, facing);
    if (!anchors) throw new Error(`No body in row ${ref.row} frame ${ref.frame}`);
    const { row, frame } = ref;
    const cell = new Raster(CELL, CELL);
    if (loadout.offHand?.kind === 'shield' && facing === 'right') this.drawHeld(cell, loadout.offHand, anchors, facing, 'off');
    cell.draw(cellOf(this.sheets.base, row, frame), 0, 0);
    cell.draw(await this.garmentLayer(loadout.legs ?? { family: 'trousers', colour: 'Brown' }, 'legs', row, frame), 0, 0);
    cell.draw(cellOf(this.sheets.shoes, row, frame), 0, 0);
    cell.draw(await this.garmentLayer(loadout.body ?? { family: 'shirt', colour: 'Blue' }, 'body', row, frame), 0, 0);
    if (!this.hidesHair(loadout.head)) cell.draw(cellOf(await this.sheet(loadout.hair ?? 'Head/Hair_1/Hair_1_Brown.png'), row, frame), 0, 0);
    if (loadout.head) this.drawHead(cell, loadout.head, anchors, facing, row, frame);
    if (loadout.mainHand) this.drawHeld(cell, loadout.mainHand, anchors, facing, 'main');
    if (loadout.offHand && !(loadout.offHand.kind === 'shield' && facing === 'right')) {
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
    return ref.mirrored ? mirror(cell) : cell;
  }
}

export { measureFrame };
