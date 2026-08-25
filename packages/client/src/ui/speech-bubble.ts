import { drawPixelText, type PixelUi } from '../render/pixel-ui.js';
import type { UiRect } from './geometry.js';
import { drawUiSkinAsset, type UiSkin } from './skin.js';

const CELL_WIDTH = 6;
const LINE_HEIGHT = 9;
const HORIZONTAL_PADDING = 8;
const VERTICAL_PADDING = 7;

export type SpeechBubbleDirection = 'down' | 'up' | 'left' | 'right';

export interface SpeechBubbleLayout {
  readonly lines: readonly string[];
  readonly width: number;
  readonly height: number;
}

export interface EdgeSpeechAnchor {
  readonly x: number;
  readonly y: number;
  readonly direction: SpeechBubbleDirection;
}

/** Directional sprites include a complete 32px sample bubble. Clip away the
 * sample body on the three non-pointer sides before layering the scalable
 * frame, otherwise short messages expose a second outline. */
export function speechTailClipRect(rect: UiRect, direction: SpeechBubbleDirection): UiRect {
  const reach = 12;
  if (direction === 'down') return { ...rect, height: rect.height + reach };
  if (direction === 'up') return { ...rect, y: rect.y - reach, height: rect.height + reach };
  if (direction === 'left') return { ...rect, x: rect.x - reach, width: rect.width + reach };
  return { ...rect, width: rect.width + reach };
}

export function wrapSpeechText(text: string, maximumCharacters: number): readonly string[] {
  const maximum = Math.max(1, Math.floor(maximumCharacters));
  const lines: string[] = [];
  let remaining = text.replace(/\s+/g, ' ').trim();
  while (remaining.length > maximum) {
    const candidate = remaining.slice(0, maximum + 1);
    const whitespace = candidate.lastIndexOf(' ');
    const split = whitespace > 0 ? whitespace : maximum;
    lines.push(remaining.slice(0, split));
    remaining = remaining.slice(split).trimStart();
  }
  if (remaining.length > 0) lines.push(remaining);
  return lines.length > 0 ? lines : [''];
}

export function speechBubbleLayout(
  body: string,
  maximumCharacters = 24,
): SpeechBubbleLayout {
  const lines = wrapSpeechText(body, maximumCharacters);
  return {
    lines,
    width: Math.max(48, Math.max(...lines.map((line) => line.length)) * CELL_WIDTH + HORIZONTAL_PADDING * 2),
    height: lines.length * LINE_HEIGHT + VERTICAL_PADDING * 2,
  };
}

/** Intersects the direction to an off-screen speaker with an inset viewport. */
export function edgeSpeechAnchor(
  speakerX: number,
  speakerY: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 8,
): EdgeSpeechAnchor {
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  const dx = speakerX - centerX;
  const dy = speakerY - centerY;
  if (dx === 0 && dy === 0) return { x: centerX, y: margin, direction: 'up' };
  const horizontalScale = dx === 0 ? Number.POSITIVE_INFINITY : (viewportWidth / 2 - margin) / Math.abs(dx);
  const verticalScale = dy === 0 ? Number.POSITIVE_INFINITY : (viewportHeight / 2 - margin) / Math.abs(dy);
  const scale = Math.max(0, Math.min(horizontalScale, verticalScale));
  if (horizontalScale < verticalScale) {
    return { x: centerX + dx * scale, y: centerY + dy * scale, direction: dx > 0 ? 'right' : 'left' };
  }
  return { x: centerX + dx * scale, y: centerY + dy * scale, direction: dy > 0 ? 'down' : 'up' };
}

export function speechBubbleRect(
  anchor: EdgeSpeechAnchor,
  layout: Pick<SpeechBubbleLayout, 'width' | 'height'>,
  viewportWidth: number,
  viewportHeight: number,
  margin = 4,
): UiRect {
  let x = anchor.x - layout.width / 2;
  let y = anchor.y - layout.height / 2;
  if (anchor.direction === 'down') y = anchor.y - layout.height - 4;
  else if (anchor.direction === 'up') y = anchor.y + 4;
  else if (anchor.direction === 'right') x = anchor.x - layout.width - 4;
  else x = anchor.x + 4;
  return {
    x: Math.round(Math.max(margin, Math.min(viewportWidth - layout.width - margin, x))),
    y: Math.round(Math.max(margin, Math.min(viewportHeight - layout.height - margin, y))),
    width: layout.width,
    height: layout.height,
  };
}

function drawAuthoredTail(
  context: CanvasRenderingContext2D,
  skin: UiSkin,
  rect: UiRect,
  direction: SpeechBubbleDirection,
  kind: 'say' | 'shout',
): void {
  const red = kind === 'shout';
  const asset = direction === 'down'
    ? red ? skin.bubbleTailDownRed : skin.bubbleTailDown
    : direction === 'up'
      ? red ? skin.bubbleTailUpRed : skin.bubbleTailUp
      : direction === 'left'
        ? red ? skin.bubbleTailLeftRed : skin.bubbleTailLeft
        : red ? skin.bubbleTailRightRed : skin.bubbleTailRight;
  const destination = direction === 'down'
    ? { x: rect.x + rect.width / 2 - 16, y: rect.y + rect.height - 26, width: 32, height: 32 }
    : direction === 'up'
      ? { x: rect.x + rect.width / 2 - 16, y: rect.y - 8, width: 32, height: 32 }
      : direction === 'left'
        ? { x: rect.x - 10, y: rect.y + rect.height / 2 - 16, width: 32, height: 32 }
        : { x: rect.x + rect.width - 23, y: rect.y + rect.height / 2 - 16, width: 32, height: 32 };
  const clip = speechTailClipRect(rect, direction);
  context.save();
  context.beginPath();
  context.rect(clip.x, clip.y, clip.width, clip.height);
  context.clip();
  drawUiSkinAsset(context, asset, destination);
  context.restore();
}

export function drawSpeechBubble(
  context: CanvasRenderingContext2D,
  fonts: PixelUi,
  skin: UiSkin,
  rect: UiRect,
  layout: SpeechBubbleLayout,
  kind: 'say' | 'shout',
  direction: SpeechBubbleDirection,
): void {
  drawAuthoredTail(context, skin, rect, direction, kind);
  drawUiSkinAsset(context, kind === 'shout' ? skin.speechBubbleRed : skin.speechBubble, rect);
  layout.lines.forEach((line, index) => drawPixelText(
    context,
    fonts,
    line,
    rect.x + rect.width / 2,
    rect.y + VERTICAL_PADDING + index * LINE_HEIGHT,
    { align: 'center', color: kind === 'shout' ? '#fff1cf' : '#3f2d25' },
  ));
}
