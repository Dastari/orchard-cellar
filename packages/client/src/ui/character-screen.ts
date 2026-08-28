import {
  ATTRIBUTE_IDS,
  PLAYER_HAIR_KINDS,
  PLAYER_PANTS_KINDS,
  PLAYER_SHIRT_KINDS,
  PLAYER_SHOES_KINDS,
  skillExperienceForLevel,
  skillLevelForExperience,
  type Attributes,
  type Direction,
  type PlayerAppearanceSelection,
  type SkillTrack,
} from '@orchard/sim';
import type { PixelUi } from '../render/pixel-ui.js';
import { drawPixelText } from '../render/pixel-ui.js';
import type { UiSkin } from './skin.js';
import { drawUiSkinAsset } from './skin.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { drawUiInventorySlotBacking } from './design-system/inventory.js';

export interface CharacterTrackProgress {
  readonly track: SkillTrack;
  readonly experience: bigint;
}

export interface CharacterEquipmentItem {
  readonly slot: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability?: number;
  readonly lit?: boolean;
}

export interface CharacterScreenModel {
  readonly playerId: string;
  readonly displayName: string;
  readonly appearance: PlayerAppearanceSelection;
  readonly baseAttributes: Attributes;
  readonly resolvedAttributes: Attributes;
  readonly health: number;
  readonly maxHealth: number;
  readonly mana: number;
  readonly maxMana: number;
  readonly vigour: number;
  readonly maxVigour: number;
  readonly tracks: readonly CharacterTrackProgress[];
  readonly effects: readonly string[];
  readonly equipment: readonly CharacterEquipmentItem[];
}

export interface CharacterScreenCallbacks {
  readonly setAppearance: (appearance: PlayerAppearanceSelection) => void;
}

interface CharacterScreenLayout {
  readonly doll: UiRect;
  readonly facingLeft: UiRect;
  readonly facingRight: UiRect;
  readonly appearanceRows: readonly { readonly kind: keyof PlayerAppearanceSelection; readonly label: string; readonly left: UiRect; readonly right: UiRect }[];
  readonly equipment: readonly UiRect[];
}

export interface CharacterScreenVerticalMetrics {
  readonly dollTop: number;
  readonly dollHeight: number;
  readonly appearanceTop: number;
  readonly appearanceStep: number;
  readonly appearanceHeight: number;
  readonly resourcesHeading: number;
  readonly resourcesTop: number;
  readonly resourcesStep: number;
  readonly effects: number;
  readonly attributesHeading: number;
  readonly attributesTop: number;
  readonly attributesStep: number;
  readonly experienceHeading: number;
  readonly experienceTop: number;
  readonly experienceStep: number;
}

const FACINGS: readonly Direction[] = ['down', 'right', 'up', 'left'];
const APPEARANCE_VALUES = {
  hairKind: PLAYER_HAIR_KINDS,
  shirtKind: PLAYER_SHIRT_KINDS,
  pantsKind: PLAYER_PANTS_KINDS,
  shoesKind: PLAYER_SHOES_KINDS,
} as const;
const EQUIPMENT_LABELS = ['NECK', 'HEAD', 'RING', 'HAND', 'BODY', 'OFF', 'HANDS', 'LEGS', 'FEET'] as const;

export function progressionWindowRect(width: number, height: number): UiRect {
  const windowWidth = Math.min(680, Math.max(340, width - 12));
  const windowHeight = Math.min(390, Math.max(250, height - 12));
  return {
    x: Math.round((width - windowWidth) / 2),
    y: Math.round((height - windowHeight) / 2),
    width: windowWidth,
    height: windowHeight,
  };
}

/** Keeps every character-sheet row inside the canonical 480×270 viewport while
 * retaining the more relaxed spacing available on larger canvases. */
export function characterScreenVerticalMetrics(rect: UiRect): CharacterScreenVerticalMetrics {
  if (rect.height < 330) {
    return {
      dollTop: 42, dollHeight: 100,
      appearanceTop: 168, appearanceStep: 20, appearanceHeight: 17,
      resourcesHeading: 29, resourcesTop: 45, resourcesStep: 14, effects: 89,
      attributesHeading: 107, attributesTop: 123, attributesStep: 13,
      experienceHeading: 207, experienceTop: 222, experienceStep: 12,
    };
  }
  return {
    dollTop: 45, dollHeight: 126,
    appearanceTop: 185, appearanceStep: 25, appearanceHeight: 19,
    resourcesHeading: 38, resourcesTop: 58, resourcesStep: 16, effects: rect.height - 29,
    attributesHeading: 116, attributesTop: 137, attributesStep: 16,
    experienceHeading: 245, experienceTop: 266, experienceStep: 16,
  };
}

export function cycleAppearanceValue(
  appearance: PlayerAppearanceSelection,
  kind: keyof PlayerAppearanceSelection,
  direction: -1 | 1,
): PlayerAppearanceSelection {
  const values = APPEARANCE_VALUES[kind] as readonly string[];
  const current = values.indexOf(appearance[kind]);
  const index = (Math.max(0, current) + direction + values.length) % values.length;
  return { ...appearance, [kind]: values[index]! } as PlayerAppearanceSelection;
}

function label(context: CanvasRenderingContext2D, fonts: PixelUi, text: string, x: number, y: number, options: { readonly color?: string; readonly align?: CanvasTextAlign; readonly header?: boolean } = {}): void {
  drawPixelText(context, fonts, text, Math.round(x), Math.round(y), {
    color: options.color ?? '#5f3b24', align: options.align, font: options.header ? 'header' : 'body',
  });
}

function fractionText(current: number, maximum: number): string {
  return `${Math.max(0, Math.ceil(current / 100))} / ${Math.max(1, Math.ceil(maximum / 100))}`;
}

export class CharacterScreen {
  private model: CharacterScreenModel | null = null;
  private preview: PlayerAppearanceSelection | null = null;
  private facingIndex = 0;

  constructor(
    private readonly skin: UiSkin,
    private readonly fonts: PixelUi,
    private readonly callbacks: CharacterScreenCallbacks,
    private readonly drawDoll: (context: CanvasRenderingContext2D, appearance: PlayerAppearanceSelection, facing: Direction, rect: UiRect) => void,
    private readonly drawItem: (context: CanvasRenderingContext2D, rect: UiRect, item: CharacterEquipmentItem) => void,
  ) {}

  update(model: CharacterScreenModel): void {
    this.model = model;
    if (this.preview === null || Object.keys(this.preview).every((key) => (
      this.preview?.[key as keyof PlayerAppearanceSelection] === model.appearance[key as keyof PlayerAppearanceSelection]
    ))) this.preview = model.appearance;
  }

  private layout(rect: UiRect): CharacterScreenLayout {
    const leftWidth = Math.min(310, Math.floor(rect.width * 0.47));
    const vertical = characterScreenVerticalMetrics(rect);
    const doll = {
      x: rect.x + 111, y: rect.y + vertical.dollTop,
      width: Math.max(80, leftWidth - 145), height: vertical.dollHeight,
    };
    const rowWidth = leftWidth - 28;
    const appearanceRows = ([
      ['hairKind', 'HAIR'], ['shirtKind', 'CHEST'], ['pantsKind', 'LEGS'], ['shoesKind', 'BOOTS'],
    ] as const).map(([kind, rowLabel], index) => ({
      kind, label: rowLabel,
      left: {
        x: rect.x + 20, y: rect.y + vertical.appearanceTop + index * vertical.appearanceStep,
        width: 24, height: vertical.appearanceHeight,
      },
      right: {
        x: rect.x + rowWidth, y: rect.y + vertical.appearanceTop + index * vertical.appearanceStep,
        width: 24, height: vertical.appearanceHeight,
      },
    }));
    const equipment = Array.from({ length: 9 }, (_, index) => ({
      x: rect.x + 18 + (index % 3) * 30,
      y: rect.y + 53 + Math.floor(index / 3) * 34,
      width: 27,
      height: 30,
    }));
    return {
      doll,
      facingLeft: { x: doll.x - 2, y: doll.y + doll.height + 3, width: 25, height: 18 },
      facingRight: { x: doll.x + doll.width - 23, y: doll.y + doll.height + 3, width: 25, height: 18 },
      appearanceRows,
      equipment,
    };
  }

  pointerDown(point: UiPoint, rect: UiRect): boolean {
    if (this.model === null || this.preview === null) return false;
    const layout = this.layout(rect);
    if (containsPoint(layout.facingLeft, point)) {
      this.facingIndex = (this.facingIndex + FACINGS.length - 1) % FACINGS.length;
      return true;
    }
    if (containsPoint(layout.facingRight, point)) {
      this.facingIndex = (this.facingIndex + 1) % FACINGS.length;
      return true;
    }
    for (const row of layout.appearanceRows) {
      const direction = containsPoint(row.left, point) ? -1 : containsPoint(row.right, point) ? 1 : 0;
      if (direction === 0) continue;
      this.preview = cycleAppearanceValue(this.preview, row.kind, direction);
      this.callbacks.setAppearance(this.preview);
      return true;
    }
    return false;
  }

  draw(context: CanvasRenderingContext2D, rect: UiRect): void {
    const model = this.model;
    if (model === null) return;
    const appearance = this.preview ?? model.appearance;
    const layout = this.layout(rect);
    const vertical = characterScreenVerticalMetrics(rect);
    const splitX = rect.x + Math.min(315, Math.floor(rect.width * 0.48));
    context.fillStyle = '#b97755';
    context.fillRect(splitX, rect.y + 31, 1, rect.height - 49);

    label(context, this.fonts, model.displayName.toUpperCase(), rect.x + 20, rect.y + 29, { header: true, color: '#4d2e22' });
    label(context, this.fonts, 'EQUIPMENT', rect.x + 18, rect.y + 41, { color: '#7a4b31' });
    layout.equipment.forEach((slot, index) => {
      const item = model.equipment.find((entry) => entry.slot === index);
      drawUiInventorySlotBacking(context, this.skin, slot, item?.itemKind);
      if (item) this.drawItem(context, slot, item);
      else label(context, this.fonts, EQUIPMENT_LABELS[index]!.slice(0, 2), slot.x + slot.width / 2, slot.y + 11, { align: 'center', color: '#a77a58' });
    });
    this.drawDoll(context, appearance, FACINGS[this.facingIndex]!, layout.doll);
    for (const [button, glyph] of [[layout.facingLeft, '<'], [layout.facingRight, '>']] as const) {
      drawUiSkinAsset(context, this.skin.button, button, 'idle');
      label(context, this.fonts, glyph, button.x + button.width / 2, button.y + 5, { align: 'center' });
    }
    label(context, this.fonts, 'TURN', layout.doll.x + layout.doll.width / 2, layout.doll.y + layout.doll.height + 8, { align: 'center', color: '#7a4b31' });

    for (const row of layout.appearanceRows) {
      drawUiSkinAsset(context, this.skin.button, row.left, 'idle');
      drawUiSkinAsset(context, this.skin.button, row.right, 'idle');
      label(context, this.fonts, '<', row.left.x + 12, row.left.y + 5, { align: 'center' });
      label(context, this.fonts, '>', row.right.x + 12, row.right.y + 5, { align: 'center' });
      const value = appearance[row.kind].replace(/^hair_\d+_/, '').replace(/^farmer_/, '').replaceAll('_', ' ');
      label(context, this.fonts, `${row.label}  ${value.toUpperCase()}`, (row.left.x + row.right.x + row.right.width) / 2, row.left.y + 5, { align: 'center' });
    }

    const statsX = splitX + 18;
    label(context, this.fonts, 'RESOURCES', statsX, rect.y + vertical.resourcesHeading, { header: true, color: '#4d2e22' });
    const resources = [
      ['HEALTH', fractionText(model.health, model.maxHealth), '#a5453e'],
      ['MANA', fractionText(model.mana, model.maxMana), '#476ca3'],
      ['VIGOUR', fractionText(model.vigour, model.maxVigour), '#4f8f42'],
    ] as const;
    resources.forEach(([name, value, color], index) => {
      const y = rect.y + vertical.resourcesTop + index * vertical.resourcesStep;
      label(context, this.fonts, name, statsX, y, { color });
      label(context, this.fonts, value, rect.x + rect.width - 23, y, { align: 'right', color });
    });

    const effects = model.effects.length === 0 ? 'NONE' : model.effects.join(', ').toUpperCase();
    label(context, this.fonts, `EFFECTS  ${effects}`, statsX, rect.y + vertical.effects, { color: '#7a4b31' });
    label(context, this.fonts, 'ATTRIBUTES', statsX, rect.y + vertical.attributesHeading, { header: true, color: '#4d2e22' });
    ATTRIBUTE_IDS.forEach((attribute, index) => {
      const base = model.baseAttributes[attribute];
      const resolved = model.resolvedAttributes[attribute];
      const name = ({ str: 'STRENGTH', dex: 'DEXTERITY', con: 'CONSTITUTION', int: 'INTELLIGENCE', wis: 'WISDOM', cha: 'CHARISMA' } as const)[attribute];
      const y = rect.y + vertical.attributesTop + index * vertical.attributesStep;
      label(context, this.fonts, name, statsX, y);
      label(context, this.fonts, base === resolved ? String(base) : `${base} -> ${resolved}`, rect.x + rect.width - 23, y, { align: 'right', color: resolved > base ? '#397b38' : '#8d3f38' });
    });

    label(context, this.fonts, 'EXPERIENCE', statsX, rect.y + vertical.experienceHeading, { header: true, color: '#4d2e22' });
    for (const [index, track] of (['combat', 'explorer', 'farming'] as const).entries()) {
      const experience = model.tracks.find((entry) => entry.track === track)?.experience ?? 0n;
      const level = skillLevelForExperience(experience);
      const next = skillExperienceForLevel(Math.min(50, level + 1));
      const y = rect.y + vertical.experienceTop + index * vertical.experienceStep;
      label(context, this.fonts, `${track.toUpperCase()}  LV ${level}`, statsX, y);
      label(context, this.fonts, level >= 50 ? 'MAX' : `${experience}/${next} XP`, rect.x + rect.width - 23, y, { align: 'right', color: '#8a5a32' });
    }
  }
}
