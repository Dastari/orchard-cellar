import { drawPixelText, type PixelUi } from '../render/pixel-ui.js';
import type { LoadedAsset } from '../render/assets.js';
import type { UiRect } from './geometry.js';
import { uiAssetFrame, type UiSkin } from './skin.js';

const CELL_WIDTH = 6;
const LINE_HEIGHT = 9;
const HORIZONTAL_PADDING = 8;
const VERTICAL_PADDING = 7;
export const SPEECH_BUBBLE_LIFETIME_MICROS = 6_000_000n;

export type SpeechBubbleDirection = 'down' | 'up' | 'left' | 'right';
export type SpeechBubbleKind = 'say' | 'shout' | 'tell' | 'guild' | 'thought' | 'reserved' | 'other';
export type SpeechBubbleTone = 'white' | 'red' | 'purple' | 'green' | 'blue' | 'yellow' | 'beige';

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

export function speechBubbleIsRecent(
  sentAtMicros: bigint,
  nowMicros: bigint,
  lifetimeMicros = SPEECH_BUBBLE_LIFETIME_MICROS,
): boolean {
  const age = nowMicros - sentAtMicros;
  return age >= 0n && age < lifetimeMicros;
}

/** Positions the pointer at the top of a 32-world-pixel player sprite. The
 * small-screen floor keeps the bubble clear without restoring the old extra
 * tile of vertical separation. */
export function speechBubbleHeadOffset(worldZoom: number, uiScale: number, mounted = false): number {
  const worldPixelScale = worldZoom / uiScale;
  return Math.max(18, 32 * worldPixelScale) + (mounted ? 16 * worldPixelScale : 0);
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

/** Stable channel-to-palette contract. Yellow remains reserved for future
 * attention speech, while beige is the fallback for system/other bubbles. */
export function speechBubbleTone(kind: SpeechBubbleKind): SpeechBubbleTone {
  if (kind === 'say') return 'white';
  if (kind === 'shout') return 'red';
  if (kind === 'tell') return 'purple';
  if (kind === 'guild') return 'green';
  if (kind === 'thought') return 'blue';
  if (kind === 'reserved') return 'yellow';
  return 'beige';
}

function bubbleAsset(skin: UiSkin, kind: SpeechBubbleKind): LoadedAsset {
  const tone = speechBubbleTone(kind);
  if (tone === 'white') return skin.speechBubbleWhite;
  if (tone === 'red') return skin.speechBubbleRed;
  if (tone === 'purple') return skin.speechBubblePurple;
  if (tone === 'green') return skin.speechBubbleGreen;
  if (tone === 'blue') return skin.speechBubbleBlue;
  if (tone === 'yellow') return skin.speechBubbleYellow;
  return skin.speechBubbleBeige;
}

/** Draws the complete highlighted downward-tail frame as one continuous
 * shape. The tail section replaces (rather than overlays) the lower edge, so
 * its outline remains joined to the bubble exactly as authored. */
function drawAuthoredDownFrame(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  rect: UiRect,
): void {
  const frame = uiAssetFrame(asset);
  if (frame === null) return;
  // The reviewed 24x31 source is centred in its 32x32 generated frame.
  const sourceX = frame.x + 4;
  const sourceY = frame.y;
  const top = 4;
  const lowerBodyHeight = 5;
  const middleHeight = Math.max(0, rect.height - top - lowerBodyHeight);
  const tailLeft = Math.round(rect.x + rect.width / 2) - 4;
  const tailWidth = 10;
  const drawBand = (
    sourceBandY: number,
    sourceBandHeight: number,
    targetY: number,
    targetHeight: number,
  ): void => {
    if (targetHeight <= 0) return;
    const leftFillX = rect.x + 4;
    const leftFillWidth = Math.max(0, tailLeft - leftFillX);
    const rightFillX = tailLeft + tailWidth;
    const rightFillWidth = Math.max(0, rect.x + rect.width - 4 - rightFillX);
    context.drawImage(asset.image, sourceX, sourceY + sourceBandY, 4, sourceBandHeight,
      rect.x, targetY, 4, targetHeight);
    if (leftFillWidth > 0) context.drawImage(
      asset.image,
      sourceX + 4,
      sourceY + sourceBandY,
      1,
      sourceBandHeight,
      leftFillX,
      targetY,
      leftFillWidth,
      targetHeight,
    );
    context.drawImage(asset.image, sourceX + 5, sourceY + sourceBandY, tailWidth, sourceBandHeight,
      tailLeft, targetY, tailWidth, targetHeight);
    if (rightFillWidth > 0) context.drawImage(
      asset.image,
      sourceX + 15,
      sourceY + sourceBandY,
      1,
      sourceBandHeight,
      rightFillX,
      targetY,
      rightFillWidth,
      targetHeight,
    );
    context.drawImage(asset.image, sourceX + 20, sourceY + sourceBandY, 4, sourceBandHeight,
      rect.x + rect.width - 4, targetY, 4, targetHeight);
  };
  context.imageSmoothingEnabled = false;
  drawBand(0, top, rect.y, top);
  drawBand(4, 17, rect.y + top, middleHeight);
  drawBand(21, 10, rect.y + rect.height - lowerBodyHeight, 10);
}

function drawAuthoredFrame(
  context: CanvasRenderingContext2D,
  asset: LoadedAsset,
  rect: UiRect,
  direction: SpeechBubbleDirection,
): void {
  if (direction === 'down') {
    drawAuthoredDownFrame(context, asset, rect);
    return;
  }
  context.save();
  if (direction === 'up') {
    context.translate(0, rect.y * 2 + rect.height);
    context.scale(1, -1);
    drawAuthoredDownFrame(context, asset, rect);
  } else if (direction === 'right') {
    context.translate(rect.x, rect.y + rect.height);
    context.rotate(-Math.PI / 2);
    drawAuthoredDownFrame(context, asset, { x: 0, y: 0, width: rect.height, height: rect.width });
  } else {
    context.translate(rect.x + rect.width, rect.y);
    context.rotate(Math.PI / 2);
    drawAuthoredDownFrame(context, asset, { x: 0, y: 0, width: rect.height, height: rect.width });
  }
  context.restore();
}

export function drawSpeechBubble(
  context: CanvasRenderingContext2D,
  fonts: PixelUi,
  skin: UiSkin,
  rect: UiRect,
  layout: SpeechBubbleLayout,
  kind: SpeechBubbleKind,
  direction: SpeechBubbleDirection,
): void {
  const asset = bubbleAsset(skin, kind);
  drawAuthoredFrame(context, asset, rect, direction);
  const lightText = kind === 'shout' || kind === 'tell' || kind === 'guild' || kind === 'thought';
  layout.lines.forEach((line, index) => drawPixelText(
    context,
    fonts,
    line,
    rect.x + rect.width / 2,
    rect.y + VERTICAL_PADDING + index * LINE_HEIGHT,
    { align: 'center', color: lightText ? '#fff1cf' : '#3f2d25' },
  ));
}
