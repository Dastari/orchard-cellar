import { BOOTSTRAP_PROGRESSION, type ProgressionContentDefinition } from '@orchard/sim';
import {
  ATTRIBUTE_IDS,
  EQUIPMENT_SLOTS,
  skillExperienceForLevel,
  skillLevelForExperience,
  type Attributes,
  type Direction,
  type PlayerAppearanceCatalogDefinition,
  type PlayerAppearanceSelection,
  type SkillTrack,
} from '@orchard/sim';
import type { PixelUi } from './pixel-ui.js';
import { drawPixelText, drawPixelTextInRect } from './pixel-ui.js';
import type { UiSkin } from './skin.js';
import { drawUiSkinAsset, drawUiSkinNatural } from './skin.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { drawUiInventorySlotBacking } from './design-system/inventory.js';
import {
  drawFantasyButton,
  drawFantasyIcon,
  FANTASY_ICON_FAMILIES,
  type FantasyIconDefinition,
} from './design-system/fantasy-controls.js';
import {
  drawProgressBar,
  GREEN_PROGRESS_PALETTE,
  RED_PROGRESS_PALETTE,
  type ProgressBarPalette,
} from './progress-bar.js';

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
  readonly progression?: ProgressionContentDefinition;
  readonly playerId: string;
  readonly displayName: string;
  readonly appearance: PlayerAppearanceSelection;
  readonly appearanceCatalog: PlayerAppearanceCatalogDefinition;
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
  readonly identityPanel: UiRect;
  readonly detailsPanel: UiRect;
  readonly resourcesPanel: UiRect;
  readonly attributesPanel: UiRect;
  readonly experiencePanel: UiRect;
  readonly doll: UiRect;
  readonly facingLeft: UiRect;
  readonly facingRight: UiRect;
  readonly appearanceRows: readonly {
    readonly kind: keyof PlayerAppearanceSelection;
    readonly label: string;
    readonly bounds: UiRect;
    readonly left: UiRect;
    readonly right: UiRect;
  }[];
  readonly equipment: readonly UiRect[];
  readonly compact: boolean;
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
const APPEARANCE_CATALOG_KEY = {
  hairKind: 'hairKinds',
  shirtKind: 'shirtKinds',
  pantsKind: 'pantsKinds',
  shoesKind: 'shoesKinds',
} as const satisfies Readonly<Record<keyof PlayerAppearanceSelection, keyof PlayerAppearanceCatalogDefinition>>;
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
  { slotIndex: 9, side: 'right', row: 4 },
] as const;

const ICON_BY_ID = new Map(FANTASY_ICON_FAMILIES.map((icon) => [icon.id, icon]));
const FALLBACK_ICON = FANTASY_ICON_FAMILIES[0]!;
const BLUE_PROGRESS_PALETTE: ProgressBarPalette = {
  ...GREEN_PROGRESS_PALETTE,
  fill: '#3d6ead',
  highlight: '#5ea7db',
};

function icon(id: string): FantasyIconDefinition { return ICON_BY_ID.get(id) ?? FALLBACK_ICON; }

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
  catalog: PlayerAppearanceCatalogDefinition,
  kind: keyof PlayerAppearanceSelection,
  direction: -1 | 1,
): PlayerAppearanceSelection {
  const values = catalog[APPEARANCE_CATALOG_KEY[kind]];
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
    const compact = rect.height < 250;
    const gap = 7;
    const leftWidth = Math.min(326, Math.floor(rect.width * 0.49));
    const identityPanel = {
      x: rect.x + 2,
      y: rect.y + 2,
      width: leftWidth - gap,
      height: rect.height - 4,
    };
    const detailsPanel = {
      x: identityPanel.x + identityPanel.width + gap,
      y: identityPanel.y,
      width: rect.width - identityPanel.width - gap - 4,
      height: identityPanel.height,
    };
    const slotSize = compact ? 22 : 29;
    const slotStep = compact ? 23 : 32;
    const slotTop = identityPanel.y + (compact ? 28 : 34);
    const equipment = CHARACTER_EQUIPMENT_PRESENTATION.map(({ side, row }) => ({
      x: side === 'left' ? identityPanel.x + 8 : identityPanel.x + identityPanel.width - slotSize - 8,
      y: slotTop + row * slotStep,
      width: slotSize,
      height: slotSize + 2,
    }));
    const dollLeft = identityPanel.x + slotSize + 14;
    const dollRight = identityPanel.x + identityPanel.width - slotSize - 14;
    const doll = {
      x: dollLeft,
      y: identityPanel.y + (compact ? 36 : 43),
      width: Math.max(54, dollRight - dollLeft),
      height: compact ? 76 : 116,
    };
    const appearanceRows = ([
      ['hairKind', 'HAIR'], ['shirtKind', 'CHEST'], ['pantsKind', 'LEGS'], ['shoesKind', 'BOOTS'],
    ] as const).map(([kind, rowLabel], index) => ({
      kind, label: rowLabel,
      bounds: {
        x: identityPanel.x + 8 + index % 2 * Math.floor((identityPanel.width - 18) / 2),
        y: identityPanel.y + identityPanel.height - (compact ? 38 : 62) + Math.floor(index / 2) * (compact ? 18 : 27),
        width: Math.floor((identityPanel.width - 18) / 2),
        height: compact ? 17 : 23,
      },
      left: {
        x: identityPanel.x + 8 + index % 2 * Math.floor((identityPanel.width - 18) / 2),
        y: identityPanel.y + identityPanel.height - (compact ? 38 : 62) + Math.floor(index / 2) * (compact ? 18 : 27),
        width: compact ? 18 : 20, height: compact ? 17 : 23,
      },
      right: {
        x: identityPanel.x + 8 + index % 2 * Math.floor((identityPanel.width - 18) / 2)
          + Math.floor((identityPanel.width - 18) / 2) - (compact ? 18 : 20),
        y: identityPanel.y + identityPanel.height - (compact ? 38 : 62) + Math.floor(index / 2) * (compact ? 18 : 27),
        width: compact ? 18 : 20, height: compact ? 17 : 23,
      },
    }));
    const resourcesHeight = compact ? 50 : 72;
    const attributesHeight = compact ? 70 : 112;
    const resourcesPanel = {
      x: detailsPanel.x,
      y: detailsPanel.y,
      width: detailsPanel.width,
      height: resourcesHeight,
    };
    const attributesPanel = {
      x: detailsPanel.x,
      y: resourcesPanel.y + resourcesPanel.height + 5,
      width: detailsPanel.width,
      height: attributesHeight,
    };
    const experiencePanel = {
      x: detailsPanel.x,
      y: attributesPanel.y + attributesPanel.height + 5,
      width: detailsPanel.width,
      height: Math.max(35, detailsPanel.y + detailsPanel.height
        - attributesPanel.y - attributesPanel.height - 5),
    };
    const facingControls = characterFacingControls(doll);
    return {
      identityPanel,
      detailsPanel,
      resourcesPanel,
      attributesPanel,
      experiencePanel,
      doll,
      facingLeft: facingControls.left,
      facingRight: facingControls.right,
      appearanceRows,
      equipment,
      compact,
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
      this.preview = cycleAppearanceValue(this.preview, this.model.appearanceCatalog, row.kind, direction);
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
    drawUiSkinAsset(context, this.skin.frameThin, layout.identityPanel);
    drawUiSkinAsset(context, this.skin.frameThin, layout.resourcesPanel);
    drawUiSkinAsset(context, this.skin.frameThin, layout.attributesPanel);
    drawUiSkinAsset(context, this.skin.frameThin, layout.experiencePanel);
    label(context, this.fonts, model.displayName.toUpperCase(),
      layout.identityPanel.x + layout.identityPanel.width / 2, layout.identityPanel.y + 8,
      { header: true, align: 'center', color: '#4d2e22' });
    label(context, this.fonts, 'EQUIPMENT', layout.identityPanel.x + layout.identityPanel.width / 2,
      layout.identityPanel.y + 21, { align: 'center', color: '#8a5a3b' });
    layout.equipment.forEach((slot, index) => {
      const presentation = CHARACTER_EQUIPMENT_PRESENTATION[index]!;
      const definition = EQUIPMENT_SLOTS[presentation.slotIndex]!;
      const item = model.equipment.find((entry) => entry.slot === definition.index);
      const locked = false;
      drawUiInventorySlotBacking(context, this.skin, slot, item?.itemKind, locked);
      if (item) this.drawItem(context, slot, item);
      else {
        context.save();
        if (locked) context.globalAlpha *= 0.42;
        drawUiSkinNatural(
          context,
          this.skin.equipmentSlotIcons,
          slot.x + Math.round((slot.width - 16) / 2),
          slot.y + Math.round((slot.height - 16) / 2) - 1,
          definition.iconAnimation,
        );
        context.restore();
      }
      if (!layout.compact) {
        label(context, this.fonts, definition.label,
          presentation.side === 'left' ? slot.x + slot.width + 3 : slot.x - 3,
          slot.y + slot.height - 7, {
            align: presentation.side === 'left' ? 'left' : 'right',
            color: locked ? '#a17d68' : '#7a4b31',
          });
      }
    });
    this.drawDoll(context, appearance, FACINGS[this.facingIndex]!, layout.doll);
    drawFantasyButton(context, this.skin, this.fonts, layout.facingLeft, {
      size: 'small', shape: 'square', tone: 'peach',
    });
    drawFantasyButton(context, this.skin, this.fonts, layout.facingRight, {
      size: 'small', shape: 'square', tone: 'peach',
    });
    label(context, this.fonts, '<', layout.facingLeft.x + layout.facingLeft.width / 2,
      layout.facingLeft.y + 6, { align: 'center' });
    label(context, this.fonts, '>', layout.facingRight.x + layout.facingRight.width / 2,
      layout.facingRight.y + 6, { align: 'center' });
    label(context, this.fonts, 'TURN', layout.doll.x + layout.doll.width / 2,
      layout.doll.y + layout.doll.height + 7, { align: 'center', color: '#7a4b31' });

    for (const row of layout.appearanceRows) {
      drawFantasyButton(context, this.skin, this.fonts, row.left, {
        size: 'small', shape: 'square', tone: 'peach',
      });
      drawFantasyButton(context, this.skin, this.fonts, row.right, {
        size: 'small', shape: 'square', tone: 'peach',
      });
      label(context, this.fonts, '<', row.left.x + row.left.width / 2,
        row.left.y + 6, { align: 'center' });
      label(context, this.fonts, '>', row.right.x + row.right.width / 2,
        row.right.y + 6, { align: 'center' });
      const value = appearance[row.kind].replace(/^hair_\d+_/, '').replace(/^farmer_/, '').replaceAll('_', ' ');
      drawPixelTextInRect(context, this.fonts, `${row.label} ${value.toUpperCase()}`, {
        x: row.left.x + row.left.width,
        y: row.bounds.y,
        width: Math.max(1, row.right.x - row.left.x - row.left.width),
        height: row.bounds.height,
      }, { align: 'center', verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
    }

    const panelHeaderX = (panel: UiRect): number => panel.x + 10;
    label(context, this.fonts, 'VITALS', panelHeaderX(layout.resourcesPanel), layout.resourcesPanel.y + 8,
      { header: true, color: '#4d2e22' });
    const resources = [
      ['HEALTH', model.health, model.maxHealth, 'heart', RED_PROGRESS_PALETTE, '#a5453e'],
      ['MANA', model.mana, model.maxMana, 'book', BLUE_PROGRESS_PALETTE, '#476ca3'],
      ['VIGOUR', model.vigour, model.maxVigour, 'lightning', GREEN_PROGRESS_PALETTE, '#4f8f42'],
    ] as const;
    const resourceStep = Math.max(11, Math.floor((layout.resourcesPanel.height - 22) / 3));
    resources.forEach(([name, current, maximum, iconId, palette, color], index) => {
      const y = layout.resourcesPanel.y + 21 + index * resourceStep;
      drawFantasyIcon(context, this.skin, { x: layout.resourcesPanel.x + 8, y: y - 2, width: 13, height: 13 }, icon(iconId), { level: 0 });
      label(context, this.fonts, name, layout.resourcesPanel.x + 24, y, { color });
      const value = fractionText(current, maximum);
      const bar = characterVitalBarRect(layout.resourcesPanel, y);
      drawProgressBar(context, bar, maximum <= 0 ? 0 : current / maximum, palette);
      label(context, this.fonts, value, layout.resourcesPanel.x + layout.resourcesPanel.width - 9,
        y, { align: 'right', color });
    });

    label(context, this.fonts, 'ATTRIBUTES', panelHeaderX(layout.attributesPanel),
      layout.attributesPanel.y + 8, { header: true, color: '#4d2e22' });
    const attributeIcons = {
      str: 'sword', dex: 'lightning', con: 'shield', int: 'book', wis: 'star', cha: 'chat',
    } as const;
    const attributeNames = {
      str: 'STRENGTH', dex: 'DEXTERITY', con: 'CONSTITUTION',
      int: 'INTELLIGENCE', wis: 'WISDOM', cha: 'CHARISMA',
    } as const;
    const attributeStep = Math.max(8, Math.floor((layout.attributesPanel.height - 21) / 6));
    ATTRIBUTE_IDS.forEach((attribute, index) => {
      const base = model.baseAttributes[attribute];
      const resolved = model.resolvedAttributes[attribute];
      const y = layout.attributesPanel.y + 21 + index * attributeStep;
      drawFantasyIcon(context, this.skin, {
        x: layout.attributesPanel.x + 8, y: y - 2, width: 13, height: 13,
      }, icon(attributeIcons[attribute]), { level: 0 });
      label(context, this.fonts, attributeNames[attribute], layout.attributesPanel.x + 25, y);
      label(context, this.fonts, base === resolved ? String(base) : `${base} > ${resolved}`,
        layout.attributesPanel.x + layout.attributesPanel.width - 10, y,
        { align: 'right', color: resolved > base ? '#397b38' : resolved < base ? '#8d3f38' : '#5f3b24' });
    });

    label(context, this.fonts, 'EXPERIENCE', panelHeaderX(layout.experiencePanel),
      layout.experiencePanel.y + 8, { header: true, color: '#4d2e22' });
    const experienceIcons = { combat: 'sword', explorer: 'star', farming: 'heart' } as const;
    const experienceStep = Math.max(11, Math.min(20, Math.floor((layout.experiencePanel.height - 25) / 3)));
    for (const [index, track] of (['combat', 'explorer', 'farming'] as const).entries()) {
      const experience = model.tracks.find((entry) => entry.track === track)?.experience ?? 0n;
      const level = skillLevelForExperience(experience, model.progression);
      const start = skillExperienceForLevel(level, model.progression);
      const next = skillExperienceForLevel(level + 1, model.progression);
      const y = layout.experiencePanel.y + 21 + index * experienceStep;
      drawFantasyIcon(context, this.skin, {
        x: layout.experiencePanel.x + 8, y: y - 2, width: 13, height: 13,
      }, icon(experienceIcons[track]), { level: 0 });
      label(context, this.fonts, `${track.toUpperCase()}  LV ${level}`, layout.experiencePanel.x + 25, y);
      const barX = layout.experiencePanel.x + Math.min(112, Math.floor(layout.experiencePanel.width * 0.43));
      const barWidth = Math.max(32, layout.experiencePanel.width - (barX - layout.experiencePanel.x) - 55);
      drawProgressBar(context, { x: barX, y: y - 2, width: barWidth, height: 9 },
        level >= (model.progression ?? BOOTSTRAP_PROGRESSION).levelCap ? 1 : Number(experience - start) / Number(next - start));
      label(context, this.fonts, level >= (model.progression ?? BOOTSTRAP_PROGRESSION).levelCap ? 'MAX' : `${experience - start} XP`,
        layout.experiencePanel.x + layout.experiencePanel.width - 8, y,
        { align: 'right', color: '#8a5a32' });
    }
    if (!layout.compact) {
      const effects = model.effects.length === 0 ? 'NONE' : model.effects.join(', ').toUpperCase();
      drawFantasyIcon(context, this.skin, {
        x: layout.experiencePanel.x + 8,
        y: layout.experiencePanel.y + layout.experiencePanel.height - 17,
        width: 13,
        height: 13,
      }, icon('star'), { level: 0 });
      drawPixelTextInRect(context, this.fonts, `EFFECTS  ${effects}`, {
        x: layout.experiencePanel.x + 25,
        y: layout.experiencePanel.y + layout.experiencePanel.height - 17,
        width: layout.experiencePanel.width - 34,
        height: 12,
      }, { color: '#7a4b31', overflow: 'ellipsis' });
    }
  }
}
