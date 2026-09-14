import { drawPixelText, measurePixelText, type PixelUi } from './pixel-ui.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';
import type { UiRect } from './geometry.js';
import type { HearthSealFlow } from './hearth-seal-flow.js';
export function hearthSealLayout(width: number, height: number) {
  const frame = { x: 8, y: 8, width: width - 16, height: height - 16 };
  const footerY = height - 36, rowWidth = Math.floor((frame.width - 26) / 2);
  return { frame, rows: Array.from({ length: 6 }, (_, i) => ({
    x: 18 + (i % 2) * (rowWidth + 6), y: 36 + Math.floor(i / 2) * 28, width: rowWidth, height: 26,
  })), back: { x: 18, y: footerY, width: 64, height: 24 },
  previous: { x: width / 2 - 32, y: footerY, width: 28, height: 24 },
  next: { x: width / 2 + 4, y: footerY, width: 28, height: 24 },
  unlock: { x: width - 118, y: footerY, width: 100, height: 24 }, noticeY: footerY - 14 };
}
export function drawHearthSealPanel(ctx: CanvasRenderingContext2D, skin: UiSkin, fonts: PixelUi, flow: HearthSealFlow, width: number, height: number, page: number) {
  const l = hearthSealLayout(width, height);
  drawUiSkinAsset(ctx, skin.panelWood, l.frame);
  const text = (value: string, x: number, y: number, max = width - 40, color = '#fff1d2') => {
    let shown = value;
    while (shown.length && measurePixelText(shown, 1, fonts.font) > max) shown = shown.slice(0, -1);
    drawPixelText(ctx, fonts, shown, x, y, { color });
  };
  const button = (rect: UiRect, label: string, enabled = true, confirm = false) => {
    drawUiSkinAsset(ctx, enabled ? confirm ? skin.buttonConfirm : skin.button : skin.buttonDeny, rect, 'idle');
    drawPixelText(ctx, fonts, label, rect.x + rect.width / 2, rect.y + 7, { align: 'center', color: enabled && !confirm ? '#51351f' : '#fff1d2' });
  };
  text('LEGENDARY RECIPE EXCHANGE', 20, 18);
  if (flow.review) {
    text(flow.review.title, 20, 40);
    text(`UNLOCK RECIPE: ${flow.review.expectedSeals} GUARDIAN SEALS`, 20, 59);
    text('Seals must be in your hotbar or backpack.', 20, 76);
    text('Close the shop; press O to claim rewards.', 20, 90);
    text('Learn once; craft copies at a workbench.', 20, 104);
    button(l.unlock, flow.pending ? 'PENDING' : 'UNLOCK', !flow.pending, true);
  } else {
    const pages = Math.max(1, Math.ceil(flow.offers.length / 6));
    flow.offers.slice(page * 6, page * 6 + 6).forEach((offer, i) => {
      const row = l.rows[i]!; drawUiSkinAsset(ctx, skin.button, row, 'idle');
      text(offer.title, row.x + 6, row.y + 4, row.width - 12, '#51351f');
      text(`${offer.expectedSeals} seals`, row.x + 6, row.y + 13, row.width - 12, '#51351f');
    });
    if (!flow.offers.length) text('No legendary recipes available.', 20, 45);
    if (pages > 1) { button(l.previous, '<', page > 0); button(l.next, '>', page + 1 < pages); }
  }
  text(flow.notice, 20, l.noticeY);
  button(l.back, flow.review && !flow.pending ? 'BACK' : 'CLOSE');
}

/** Keeps a separate exchange button between Back and Purchase, including the
 * compact 250px merchant frame, without replacing the item search control. */
export function hearthSealShopControls(back: UiRect, action: UiRect) {
  const shortBack = { ...back, width: 42 };
  return { back: shortBack, seals: { x: back.x + 46, y: back.y,
    width: Math.min(72, action.x - back.x - 50), height: back.height } };
}
