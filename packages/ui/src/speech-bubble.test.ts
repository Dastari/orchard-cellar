import { describe, expect, it } from 'vitest';
import {
  edgeSpeechAnchor, speechBubbleHeadOffset, speechBubbleIsRecent,
} from './speech-bubble.js';

describe('speech bubbles', () => {
  it('places a distant yell at the correct screen edge', () => {
    const anchor = edgeSpeechAnchor(900, 120, 480, 270);
    expect(anchor.direction).toBe('right');
    expect(anchor.x).toBe(472);
  });

  it('keeps transient private bubbles inside their bounded display lifetime', () => {
    expect(speechBubbleIsRecent(10_000_000n, 15_999_999n)).toBe(true);
    expect(speechBubbleIsRecent(10_000_000n, 16_000_000n)).toBe(false);
    expect(speechBubbleIsRecent(10_000_001n, 10_000_000n)).toBe(false);
  });

  it('anchors bubbles one tile lower at the top of the player sprite', () => {
    expect(speechBubbleHeadOffset(1, 1)).toBe(32);
    expect(speechBubbleHeadOffset(2, 1)).toBe(64);
    expect(speechBubbleHeadOffset(0.5, 1)).toBe(18);
  });

  it('raises mounted speech by exactly one rendered world tile', () => {
    expect(speechBubbleHeadOffset(1, 1, true)).toBe(48);
    expect(speechBubbleHeadOffset(2, 1, true)).toBe(96);
    expect(speechBubbleHeadOffset(0.5, 1, true)).toBe(26);
  });
});
