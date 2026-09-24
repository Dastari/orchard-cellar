import type { Attributes, Direction, PlayerAppearanceCatalogDefinition, PlayerAppearanceSelection, ProgressionContentDefinition, SkillTrack } from '@orchard/sim';
import type { UiRect } from './geometry.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiCharacter, type UiCharacterElement } from './kit/components/character.js';
import { uiFixed } from './kit/layout/box.js';
import { UiRoot } from './kit/runtime/root.js';

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
  readonly setAppearance: (appearance: PlayerAppearanceSelection) => void | Promise<void>;
}

const APPEARANCE_CATALOG_KEY = {
  hairKind: 'hairKinds',
  shirtKind: 'shirtKinds',
  pantsKind: 'pantsKinds',
  shoesKind: 'shoesKinds',
} as const satisfies Readonly<Record<keyof PlayerAppearanceSelection, keyof PlayerAppearanceCatalogDefinition>>;
export function progressionWindowRect(width: number, height: number): UiRect {
  const windowWidth = Math.min(680, Math.max(0, width - 12));
  const windowHeight = Math.min(390, Math.max(0, height - 12));
  return { x: Math.round((width - windowWidth) / 2), y: Math.round((height - windowHeight) / 2), width: windowWidth, height: windowHeight };
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

export interface CharacterScreenNavigation {
  readonly onKey?: (key: string, repeat: boolean) => boolean;
  readonly onNavigate?: (page: 'character' | 'skills' | 'statistics') => void;
  readonly onClose?: () => void;
}

/** The host owns transport and subscriptions; this adapter owns only presentation. */
export class CharacterScreen {
  readonly root: UiRoot;
  private view: UiCharacterElement | null = null;
  private model: CharacterScreenModel | null = null;
  private bounds: UiRect | undefined;
  constructor(art: UiKitArt, private readonly callbacks: CharacterScreenCallbacks,
    private readonly drawDoll: (context: CanvasRenderingContext2D, appearance: PlayerAppearanceSelection, facing: Direction, rect: UiRect) => void,
    private readonly drawItem: (context: CanvasRenderingContext2D, rect: UiRect, item: CharacterEquipmentItem) => void,
    private readonly navigation: CharacterScreenNavigation = {}) {
    this.root = new UiRoot({ art, scale: 1, label: 'Character' });
  }
  get active(): boolean { return this.model !== null; }
  update(model: CharacterScreenModel | null): void {
    if (model === null) {
      this.root.input.cancelPointers(); this.root.focus.set(null); this.view?.dispose(); this.view = null; this.model = null; return;
    }
    if (this.model && this.model.playerId !== model.playerId) this.root.input.cancelPointers();
    this.model = model;
    if (!this.view) {
      this.view = uiCharacter({ model, onAppearance: appearance => this.callbacks.setAppearance(appearance),
        renderPortrait: this.drawDoll, renderEquipment: this.drawItem, ...this.navigation });
      this.root.mount(this.view); this.applyBounds();
    } else this.view.updateCharacter(model);
  }
  private applyBounds(): void {
    if (!this.view || !this.bounds) return;
    const frame = this.bounds;
    this.view.setStyle({ position: 'absolute', inset: { left: uiFixed(frame.x), top: uiFixed(frame.y) }, width: uiFixed(frame.width), height: uiFixed(frame.height) });
  }
  setBounds(frame: UiRect, viewportWidth: number, viewportHeight: number): void {
    this.root.resize(viewportWidth, viewportHeight);
    if (!this.bounds || Object.keys(frame).some(key => frame[key as keyof UiRect] !== this.bounds![key as keyof UiRect])) {
      this.bounds = { ...frame }; this.applyBounds();
    }
    this.root.arrange();
  }
  focus(): void { this.view?.setStyle({ visible: true }); this.view?.focusCharacter(); this.root.arrange(); }
  draw(context: CanvasRenderingContext2D): void { if (this.active) this.root.drawInContext(context); }
  dispose(): void { this.model = null; this.root.dispose(); }
}
