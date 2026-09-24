import {
  AUTHORITY_HZ,
  TILE_SIZE_FIXED,
  itemDefinition,
  playerStatisticDefinition,
  runtimeStatisticDefinition,
  type ContentRegistry,
  type PlayerStatisticCategory,
  type PlayerStatisticDefinition,
} from '@orchard/sim';
import type { UiRect } from './geometry.js';
import type { UiKitArt } from './kit/components/art.js';
import { uiStatistics, type UiStatisticsElement } from './kit/components/statistics.js';
import { uiGameBookPage } from './kit/components/character-book.js';
import { uiFixed } from './kit/layout/box.js';
import type { UiElement } from './kit/runtime/element.js';
import { UiRoot } from './kit/runtime/root.js';
import type { CharacterScreenNavigation } from './character-screen.js';

export interface PlayerStatisticModel {
  readonly statisticKind: string;
  readonly subjectKind: string;
  readonly value: bigint;
}

export interface StatisticsScreenModel {
  readonly statistics: readonly PlayerStatisticModel[];
  readonly contentRegistry?: ContentRegistry;
}

export interface StatisticsScreenRow extends PlayerStatisticModel {
  readonly definition: PlayerStatisticDefinition;
}

const CATEGORY_ORDER: readonly PlayerStatisticCategory[] = [
  'account', 'progression', 'exploration', 'social', 'farming', 'crafting',
  'commerce', 'items', 'tools', 'world', 'creatures', 'combat', 'future',
];

export function visiblePlayerStatisticRows(model: StatisticsScreenModel): readonly StatisticsScreenRow[] {
  return model.statistics.flatMap((entry) => {
    const definition = model.contentRegistry === undefined
      ? playerStatisticDefinition(entry.statisticKind)
      : runtimeStatisticDefinition(model.contentRegistry, entry.statisticKind);
    return definition === null || definition.reserved === true
      ? []
      : [{ ...entry, definition }];
  }).sort((left, right) => {
    const category = CATEGORY_ORDER.indexOf(left.definition.category)
      - CATEGORY_ORDER.indexOf(right.definition.category);
    if (category !== 0) return category;
    const name = left.definition.name.localeCompare(right.definition.name);
    return name !== 0 ? name : left.subjectKind.localeCompare(right.subjectKind);
  });
}

function groupedInteger(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function durationLabel(authorityTicks: bigint): string {
  const seconds = authorityTicks / BigInt(AUTHORITY_HZ);
  const hours = seconds / 3_600n;
  const minutes = (seconds % 3_600n) / 60n;
  const remainingSeconds = seconds % 60n;
  if (hours > 0n) return `${hours}H ${minutes}M`;
  if (minutes > 0n) return `${minutes}M ${remainingSeconds}S`;
  return `${remainingSeconds}S`;
}

export function formatPlayerStatisticValue(value: bigint, definition: PlayerStatisticDefinition): string {
  if (definition.unit === 'authority_ticks') return durationLabel(value);
  if (definition.unit === 'fixed_distance') {
    const wholeTiles = value / BigInt(TILE_SIZE_FIXED);
    const tenths = value % BigInt(TILE_SIZE_FIXED) * 10n / BigInt(TILE_SIZE_FIXED);
    return tenths === 0n ? `${groupedInteger(wholeTiles)} TILES` : `${groupedInteger(wholeTiles)}.${tenths} TILES`;
  }
  if (definition.unit === 'bronze') {
    const gold = value / 10_000n;
    const silver = value % 10_000n / 100n;
    const bronze = value % 100n;
    if (gold > 0n) return `${gold}G ${silver}S ${bronze}B`;
    if (silver > 0n) return `${silver}S ${bronze}B`;
    return `${bronze}B`;
  }
  return groupedInteger(value);
}

/** Reading-case subject name: the authored item name, or the subject id as capitalised words. */
export function playerStatisticSubjectName(subjectKind: string, registry?: ContentRegistry): string {
  if (subjectKind.length === 0) return '';
  const authoredItem = registry?.items.get(`item:${subjectKind}`);
  const name = registry === undefined
    ? itemDefinition(subjectKind)?.displayName
    : authoredItem === undefined || authoredItem.retired === true ? undefined : authoredItem.displayName;
  return name ?? subjectKind.replaceAll('_', ' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function playerStatisticSubjectLabel(subjectKind: string, registry?: ContentRegistry): string {
  return playerStatisticSubjectName(subjectKind, registry).toUpperCase();
}

/** Subscribed bigint values remain authoritative; the Records chapter of the player's book owns browsing state. */
export class StatisticsScreen {
  readonly root: UiRoot;
  private view: UiStatisticsElement | null = null;
  private bounds: UiRect | undefined;
  private page = uiGameBookPage(640, 400);
  constructor(art: UiKitArt, private readonly navigation: CharacterScreenNavigation = {}) {
    this.root = new UiRoot({ art, scale: 1, label: 'Lifetime records' });
  }
  get active(): boolean { return this.view !== null; }
  update(model: StatisticsScreenModel | null): void {
    if (model === null) { this.root.input.cancelPointers(); this.root.focus.set(null); this.view?.dispose(); this.view = null; return; }
    const focus = this.root.focus.current;
    if (!this.view) { this.view = uiStatistics({ model, page: this.page, ...this.navigation }); this.root.mount(this.view); this.applyBounds(); }
    else this.view.updateStatistics(model);
    this.root.arrange();
    this.restoreFocus(focus);
  }
  /** Rebuilt records keep stable ids, so a focus lost to a rebuild returns to the same record, category or tab. */
  private restoreFocus(focus: UiElement | null): void {
    if (!this.view || !focus?.disposed) return;
    const candidates = this.root.entries().map(entry => entry.element);
    const target = candidates.find(element => element.id === focus.id)
      ?? candidates.find(element => element.kind === focus.kind && element.label === focus.label && element.focusable && !element.disabled);
    if (target && !target.disabled) this.root.focus.set(target); else this.view.focusStatistics();
    this.root.arrange();
  }
  private applyBounds(): void {
    if (!this.view || !this.bounds) return;
    const frame = this.bounds;
    this.view.setStatisticsPage(this.page);
    this.view.setStyle({ position: 'absolute', inset: { left: uiFixed(frame.x), top: uiFixed(frame.y) }, width: uiFixed(frame.width), height: uiFixed(frame.height) });
  }
  setBounds(frame: UiRect, viewportWidth: number, viewportHeight: number): void {
    this.root.resize(viewportWidth, viewportHeight);
    const page = uiGameBookPage(viewportWidth, viewportHeight);
    const pageChanged = page.width !== this.page.width || page.height !== this.page.height;
    if (pageChanged || !this.bounds || Object.keys(frame).some(key => frame[key as keyof UiRect] !== this.bounds![key as keyof UiRect])) {
      this.bounds = { ...frame }; this.page = page; this.applyBounds();
    }
    this.root.arrange();
  }
  focus(): void { this.view?.setStyle({ visible: true }); this.view?.focusStatistics(); this.root.arrange(); }
  draw(context: CanvasRenderingContext2D): void { if (this.active) this.root.drawInContext(context); }
  dispose(): void { this.root.dispose(); this.view = null; }
}
