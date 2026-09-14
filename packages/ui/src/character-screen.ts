import {
  bootstrapContentRegistry,
  runtimePlayerAppearanceCatalog,
  type Attributes,
  type PlayerAppearanceSelection,
  type SkillTrack,
} from '@orchard/sim';
import type { UiRect } from './geometry.js';

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

const APPEARANCE_CATALOG_KEY = {
  hairKind: 'hairKinds',
  shirtKind: 'shirtKinds',
  pantsKind: 'pantsKinds',
  shoesKind: 'shoesKinds',
} as const;
export const CHARACTER_EQUIPMENT_PRESENTATION = [
  { slotIndex: 1, side: 'left', row: 0 },
  { slotIndex: 4, side: 'left', row: 1 },
  { slotIndex: 6, side: 'left', row: 2 },
  { slotIndex: 7, side: 'left', row: 3 },
  { slotIndex: 8, side: 'left', row: 4 },
  { slotIndex: 0, side: 'right', row: 0 },
  { slotIndex: 2, side: 'right', row: 1 },
  { slotIndex: 3, side: 'right', row: 2 },
  { slotIndex: 5, side: 'right', row: 3 },
] as const;

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
  const catalog = runtimePlayerAppearanceCatalog(bootstrapContentRegistry());
  if (catalog === null) return appearance;
  const values = catalog[APPEARANCE_CATALOG_KEY[kind]];
  const current = values.indexOf(appearance[kind]);
  const index = (Math.max(0, current) + direction + values.length) % values.length;
  return { ...appearance, [kind]: values[index]! } as PlayerAppearanceSelection;
}

export function characterFacingControls(doll: UiRect): { readonly left: UiRect; readonly right: UiRect } {
  const center = doll.x + Math.round(doll.width / 2);
  return {
    left: { x: center - 43, y: doll.y + doll.height + 1, width: 20, height: 20 },
    right: { x: center + 23, y: doll.y + doll.height + 1, width: 20, height: 20 },
  };
}

export function characterVitalBarRect(panel: UiRect, y: number): UiRect {
  const leftInset = Math.min(92, Math.floor(panel.width * 0.34));
  return {
    x: panel.x + leftInset,
    y: y - 2,
    width: Math.max(40, panel.width - leftInset - 77),
    height: 9,
  };
}
