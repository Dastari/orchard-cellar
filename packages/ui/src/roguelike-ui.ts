import { rogueUpgradeDefinition, type RogueBoonRegistry, type RogueRarity } from '@orchard/sim';
import { drawPixelPanel, drawPixelText, measurePixelText, type PixelUi } from './pixel-ui.js';
import { containsPoint, type UiPoint, type UiRect } from './geometry.js';

export interface RogueUiRun {
  readonly roomNumber: number;
  readonly roomKind: string;
  readonly theme: string;
  readonly phase: string;
  readonly wave: number;
  readonly maximumWaves: number;
  readonly currency: number;
}

export interface RogueUiOffer {
  readonly slot: number;
  readonly upgradeId: string;
  readonly rarity: string;
  readonly magnitudePermille: number;
  readonly cost: number;
}

export interface RogueRewardLayout {
  readonly frame: UiRect;
  readonly cards: readonly UiRect[];
  readonly skip: UiRect | null;
}

const RARITY_COLOR: Readonly<Record<RogueRarity, string>> = {
  common: '#b7aa91',
  uncommon: '#63c74d',
  rare: '#5a8ee0',
  epic: '#b56be0',
  legendary: '#f6b83f',
};

function recognizedRarity(value: string): RogueRarity {
  return value === 'uncommon' || value === 'rare' || value === 'epic' || value === 'legendary'
    ? value : 'common';
}

export function rogueRewardLayout(
  viewportWidth: number,
  viewportHeight: number,
  offerCount: number,
  allowSkip: boolean,
): RogueRewardLayout {
  const frameWidth = Math.max(220, Math.min(540, viewportWidth - 16));
  const horizontal = frameWidth >= 390;
  const cardGap = 7;
  const innerWidth = frameWidth - 24;
  const cardWidth = horizontal
    ? Math.floor((innerWidth - cardGap * 2) / 3)
    : innerWidth;
  const cardHeight = horizontal ? 112 : 65;
  const cardsHeight = horizontal ? cardHeight : offerCount * cardHeight + Math.max(0, offerCount - 1) * cardGap;
  const footerHeight = allowSkip ? 29 : 15;
  const frameHeight = 34 + cardsHeight + footerHeight;
  const frame = {
    x: Math.round((viewportWidth - frameWidth) / 2),
    y: Math.max(6, Math.round((viewportHeight - frameHeight) / 2)),
    width: frameWidth,
    height: frameHeight,
  };
  const cards = Array.from({ length: offerCount }, (_, index): UiRect => ({
    x: horizontal
      ? frame.x + 12 + index * (cardWidth + cardGap)
      : frame.x + 12,
    y: horizontal
      ? frame.y + 28
      : frame.y + 28 + index * (cardHeight + cardGap),
    width: cardWidth,
    height: cardHeight,
  }));
  const skip = allowSkip ? {
    x: frame.x + Math.round((frame.width - 96) / 2),
    y: frame.y + frame.height - 23,
    width: 96,
    height: 16,
  } : null;
  return { frame, cards, skip };
}

export function rogueRewardHit(
  layout: RogueRewardLayout,
  point: UiPoint,
): { readonly kind: 'offer'; readonly index: number } | { readonly kind: 'skip' } | null {
  const index = layout.cards.findIndex((rect) => containsPoint(rect, point));
  if (index >= 0) return { kind: 'offer', index };
  return layout.skip !== null && containsPoint(layout.skip, point) ? { kind: 'skip' } : null;
}

function wrapText(text: string, maximumWidth: number, ui: PixelUi, maximumLines: number): readonly string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.toUpperCase().split(/\s+/u)) {
    const next = current.length === 0 ? word : `${current} ${word}`;
    if (measurePixelText(next, 1, ui.font) <= maximumWidth) {
      current = next;
      continue;
    }
    if (current.length > 0) lines.push(current);
    current = word;
    if (lines.length >= maximumLines) break;
  }
  if (lines.length < maximumLines && current.length > 0) lines.push(current);
  if (lines.length === maximumLines && measurePixelText(lines[maximumLines - 1]!, 1, ui.font) > maximumWidth) {
    let last = lines[maximumLines - 1]!;
    while (last.length > 1 && measurePixelText(`${last}...`, 1, ui.font) > maximumWidth) last = last.slice(0, -1);
    lines[maximumLines - 1] = `${last}...`;
  }
  return lines;
}

function magnitudeLabel(registry:RogueBoonRegistry,offer: RogueUiOffer): string {
  const definition = rogueUpgradeDefinition(registry,offer.upgradeId);
  if (definition === null) return `+${Math.round(offer.magnitudePermille / 10)}%`;
  if (definition.modifierKind === 'healing') return `HEAL ${Math.round(offer.magnitudePermille / 10)}%`;
  return `+${Math.round(offer.magnitudePermille / 10)}% ${definition.modifierKind.replaceAll('_', ' ').toUpperCase()}`;
}

export function drawRogueRunHud(
  context: CanvasRenderingContext2D,
  ui: PixelUi,
  run: RogueUiRun,
  viewportWidth: number,
): void {
  const title = `DELVE ${run.roomNumber + 1}/12  ${run.theme.toUpperCase()} ${run.roomKind.toUpperCase()}`;
  const status = run.phase === 'combat'
    ? `WAVE ${Math.min(run.maximumWaves, run.wave + 1)}/${run.maximumWaves}   EMBERS ${run.currency}`
    : run.phase === 'doors' ? `CHOOSE A DOOR   EMBERS ${run.currency}`
      : `CHOOSE ONE BOON   EMBERS ${run.currency}`;
  const width = Math.max(190, measurePixelText(title, 1, ui.font) + 20);
  const x = Math.round((viewportWidth - width) / 2);
  drawPixelPanel(context, ui, x, 4, width, 30);
  drawPixelText(context, ui, title, x + width / 2, 10, { align: 'center', color: '#5b3825' });
  drawPixelText(context, ui, status, x + width / 2, 20, { align: 'center', color: '#315c35' });
}

export function drawRogueRewardOverlay(
  registry:RogueBoonRegistry,
  context: CanvasRenderingContext2D,
  ui: PixelUi,
  run: RogueUiRun,
  offers: readonly RogueUiOffer[],
  viewportWidth: number,
  viewportHeight: number,
  pointer: UiPoint | null,
): RogueRewardLayout {
  const allowSkip = run.roomKind === 'shop';
  const layout = rogueRewardLayout(viewportWidth, viewportHeight, offers.length, allowSkip);
  context.save();
  context.fillStyle = '#090815b8';
  context.fillRect(0, 0, viewportWidth, viewportHeight);
  drawPixelPanel(context, ui, layout.frame.x, layout.frame.y, layout.frame.width, layout.frame.height);
  const heading = run.roomKind === 'shop' ? 'THE CELLAR TRADER' : 'CHOOSE A BOON';
  drawPixelText(context, ui, heading, layout.frame.x + layout.frame.width / 2, layout.frame.y + 9, {
    align: 'center', font: 'header', color: '#5b3825',
  });
  offers.forEach((offer, index) => {
    const rect = layout.cards[index];
    if (rect === undefined) return;
    const definition = rogueUpgradeDefinition(registry,offer.upgradeId);
    const rarity = recognizedRarity(offer.rarity);
    const unavailable = offer.cost > run.currency;
    const hovered = pointer !== null && containsPoint(rect, pointer);
    context.fillStyle = unavailable ? '#684f4e' : hovered ? '#fff0c9' : '#e8c28f';
    context.fillRect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4);
    context.strokeStyle = RARITY_COLOR[rarity];
    context.lineWidth = hovered ? 3 : 2;
    context.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.width - 3, rect.height - 3);
    drawPixelText(context, ui, `[${index + 1}] ${rarity.toUpperCase()}`, rect.x + 7, rect.y + 7, {
      color: unavailable ? '#d8b3a5' : RARITY_COLOR[rarity],
    });
    drawPixelText(context, ui, (definition?.name ?? offer.upgradeId).toUpperCase(), rect.x + 7, rect.y + 20, {
      color: unavailable ? '#c2a29a' : '#5b3825',
    });
    drawPixelText(context, ui, magnitudeLabel(registry,offer), rect.x + 7, rect.y + 32, {
      color: unavailable ? '#c2a29a' : '#315c35',
    });
    const horizontal = rect.height > 80;
    const descriptionLines = wrapText(definition?.description ?? 'A strange cellar blessing.', rect.width - 14, ui, horizontal ? 4 : 2);
    descriptionLines.forEach((line, lineIndex) => drawPixelText(
      context, ui, line, rect.x + 7, rect.y + 47 + lineIndex * 9,
      { color: unavailable ? '#b58f89' : '#71532e' },
    ));
    if (offer.cost > 0) drawPixelText(
      context, ui, unavailable ? `NEEDS ${offer.cost} EMBERS` : `${offer.cost} EMBERS`,
      rect.x + rect.width / 2,
      rect.y + rect.height - 14,
      { align: 'center', color: unavailable ? '#a33b35' : '#315c35' },
    );
  });
  if (layout.skip !== null) {
    const hovered = pointer !== null && containsPoint(layout.skip, pointer);
    context.fillStyle = hovered ? '#df9d73' : '#bf7859';
    context.fillRect(layout.skip.x, layout.skip.y, layout.skip.width, layout.skip.height);
    context.strokeStyle = '#70442d';
    context.strokeRect(layout.skip.x + 0.5, layout.skip.y + 0.5, layout.skip.width - 1, layout.skip.height - 1);
    drawPixelText(context, ui, 'LEAVE SHOP', layout.skip.x + layout.skip.width / 2, layout.skip.y + 5, {
      align: 'center', color: '#fff0cf',
    });
  }
  context.restore();
  return layout;
}
