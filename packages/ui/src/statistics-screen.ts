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
import { drawPixelText, drawPixelTextInRect, type PixelUi } from './pixel-ui.js';
import { drawFantasyIcon, FANTASY_ICON_FAMILIES, type FantasyIconDefinition } from './design-system/fantasy-controls.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';
import { ScrollBar } from './scrollbar.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';

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

const CATEGORY_ICON: Readonly<Record<PlayerStatisticCategory, string>> = {
  account: 'crown',
  social: 'chat',
  exploration: 'star',
  items: 'backpack',
  crafting: 'wrench',
  commerce: 'coin',
  farming: 'heart',
  world: 'star',
  tools: 'gear',
  creatures: 'heart',
  combat: 'sword',
  progression: 'trophy',
  future: 'book',
};

const ICON_BY_ID = new Map(FANTASY_ICON_FAMILIES.map((icon) => [icon.id, icon]));
const FALLBACK_ICON = FANTASY_ICON_FAMILIES[0]!;

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

export function playerStatisticSubjectLabel(subjectKind: string, registry?: ContentRegistry): string {
  if (subjectKind.length === 0) return '';
  const authoredItem = registry?.items.get(`item:${subjectKind}`);
  const name = registry === undefined
    ? itemDefinition(subjectKind)?.displayName
    : authoredItem === undefined || authoredItem.retired === true ? undefined : authoredItem.displayName;
  return (name ?? subjectKind.replaceAll('_', ' ')).toUpperCase();
}

interface StatisticsLayout {
  readonly frame: UiRect;
  readonly viewport: UiRect;
  readonly scrollbar: UiRect;
  readonly rowHeight: number;
  readonly visibleRows: number;
}

export function statisticsScreenLayout(rect: UiRect): StatisticsLayout {
  const frame = { x: rect.x + 2, y: rect.y + 2, width: rect.width - 4, height: rect.height - 4 };
  const viewport = {
    x: frame.x + 10,
    y: frame.y + 37,
    width: Math.max(1, frame.width - 33),
    height: Math.max(1, frame.height - 48),
  };
  const rowHeight = rect.height < 240 ? 25 : 29;
  return {
    frame,
    viewport,
    scrollbar: { x: frame.x + frame.width - 19, y: viewport.y, width: 12, height: viewport.height },
    rowHeight,
    visibleRows: Math.max(1, Math.floor(viewport.height / rowHeight)),
  };
}

function iconFor(category: PlayerStatisticCategory): FantasyIconDefinition {
  return ICON_BY_ID.get(CATEGORY_ICON[category]) ?? FALLBACK_ICON;
}

export class StatisticsScreen {
  private model: StatisticsScreenModel = { statistics: [] };
  private readonly scrollbar: ScrollBar;

  constructor(private readonly skin: UiSkin, private readonly fonts: PixelUi) {
    this.scrollbar = new ScrollBar(skin, { showWhenDisabled: true, trackClick: 'jump' });
  }

  update(model: StatisticsScreenModel): void { this.model = model; }

  private sync(rect: UiRect): { readonly layout: StatisticsLayout; readonly rows: readonly StatisticsScreenRow[] } {
    const layout = statisticsScreenLayout(rect);
    const rows = visiblePlayerStatisticRows(this.model);
    this.scrollbar.setBounds(layout.scrollbar);
    this.scrollbar.setMetrics(rows.length, layout.visibleRows);
    return { layout, rows };
  }

  pointerDown(point: UiPoint, rect: UiRect, pointerType: 'mouse' | 'touch' = 'mouse'): boolean {
    const { layout } = this.sync(rect);
    if (pointerType === 'touch' && containsPoint(layout.viewport, point)) {
      this.scrollbar.beginSwipe(point, layout.viewport, pointerType);
      return true;
    }
    return this.scrollbar.pointerDown(point);
  }

  pointerMove(point: UiPoint): void {
    this.scrollbar.pointerMove(point);
    this.scrollbar.swipeMove(point, 20);
  }
  pointerUp(): boolean {
    const swipe = this.scrollbar.endSwipe();
    return this.scrollbar.pointerUp() || swipe;
  }
  pointerLeave(): void { this.scrollbar.pointerLeave(); }

  wheel(point: UiPoint, deltaY: number, rect: UiRect): boolean {
    const { layout } = this.sync(rect);
    return containsPoint(layout.viewport, point) && this.scrollbar.wheel(deltaY, 2);
  }

  draw(context: CanvasRenderingContext2D, rect: UiRect): void {
    const { layout, rows } = this.sync(rect);
    drawUiSkinAsset(context, this.skin.frameThin, layout.frame);
    const trophy = ICON_BY_ID.get('trophy') ?? FALLBACK_ICON;
    drawFantasyIcon(context, this.skin, {
      x: layout.frame.x + 10, y: layout.frame.y + 9, width: 18, height: 18,
    }, trophy, { level: 0 });
    drawPixelText(context, this.fonts, 'LIFETIME RECORDS', layout.frame.x + 34, layout.frame.y + 11, {
      color: '#4d2e22', font: 'header',
    });
    drawPixelText(context, this.fonts, `${rows.length} TRACKED`, layout.frame.x + layout.frame.width - 27, layout.frame.y + 13, {
      align: 'right', color: '#8c5d3a',
    });
    context.fillStyle = '#b97755';
    context.fillRect(layout.viewport.x, layout.viewport.y - 5, layout.viewport.width, 1);

    if (rows.length === 0) {
      drawPixelTextInRect(context, this.fonts, 'NO LIFETIME RECORDS YET', layout.viewport, {
        align: 'center', verticalAlign: 'center', color: '#8c6c54',
      });
      this.scrollbar.draw(context);
      return;
    }

    const first = this.scrollbar.position;
    rows.slice(first, first + layout.visibleRows).forEach((row, index) => {
      const y = layout.viewport.y + index * layout.rowHeight;
      const rowRect = {
        x: layout.viewport.x,
        y,
        width: layout.viewport.width,
        height: layout.rowHeight - 2,
      };
      context.fillStyle = index % 2 === 0 ? '#ead0aa55' : '#c8956f2b';
      context.fillRect(rowRect.x, rowRect.y, rowRect.width, rowRect.height);
      drawFantasyIcon(context, this.skin, {
        x: rowRect.x + 4, y: rowRect.y + Math.max(2, Math.floor((rowRect.height - 17) / 2)), width: 17, height: 17,
      }, iconFor(row.definition.category), { level: 0 });
      const valueWidth = Math.min(145, Math.max(74, Math.floor(rowRect.width * 0.28)));
      const textX = rowRect.x + 26;
      const textWidth = Math.max(1, rowRect.width - 31 - valueWidth);
      const subject = playerStatisticSubjectLabel(row.subjectKind, this.model.contentRegistry);
      drawPixelTextInRect(context, this.fonts, row.definition.name.toUpperCase(), {
        x: textX, y: rowRect.y + 3, width: textWidth, height: 10,
      }, { color: '#5f3b24', overflow: 'ellipsis' });
      drawPixelTextInRect(context, this.fonts, subject || row.definition.category.toUpperCase(), {
        x: textX, y: rowRect.y + 14, width: textWidth, height: 9,
      }, { color: '#9a6745', overflow: 'ellipsis' });
      drawPixelTextInRect(context, this.fonts, formatPlayerStatisticValue(row.value, row.definition), {
        x: rowRect.x + rowRect.width - valueWidth,
        y: rowRect.y,
        width: valueWidth - 6,
        height: rowRect.height,
      }, { align: 'right', verticalAlign: 'center', color: '#6b4428', overflow: 'ellipsis' });
    });
    this.scrollbar.draw(context);
  }
}
