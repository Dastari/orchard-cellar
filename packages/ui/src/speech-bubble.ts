export const SPEECH_BUBBLE_LIFETIME_MICROS = 6_000_000n;

export type SpeechBubbleDirection = 'down' | 'up' | 'left' | 'right';
export type SpeechBubbleKind = 'say' | 'shout' | 'tell' | 'guild' | 'thought' | 'reserved' | 'other';
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

