import { describe, expect, it } from 'vitest';
import {
  edgeSpeechAnchor, speechBubbleHeadOffset, speechBubbleIsRecent, speechBubbleLayout, speechBubbleRect, speechBubbleTone,
  wrapSpeechText,
} from './speech-bubble.js';

describe('speech bubbles', () => {
  it('wraps long messages without dropping words', () => {
    expect(wrapSpeechText('the quick brown fox jumps', 10)).toEqual(['the quick', 'brown fox', 'jumps']);
    expect(wrapSpeechText('abcdefghijk', 5)).toEqual(['abcde', 'fghij', 'k']);
  });

  it('wraps only the message and never adds a speaker-name heading', () => {
    const layout = speechBubbleLayout('This is quite a long yell for testing.', 12);
    expect(layout.lines.join(' ')).toBe('This is quite a long yell for testing.');
    expect(layout.lines.join(' ')).not.toContain('NATHAN');
    expect(layout.lines.every((line) => line.length <= 12)).toBe(true);
  });

  it('places a distant yell at the correct screen edge', () => {
    const anchor = edgeSpeechAnchor(900, 120, 480, 270);
    expect(anchor.direction).toBe('right');
    expect(anchor.x).toBe(472);
    const rect = speechBubbleRect(anchor, { width: 100, height: 40 }, 480, 270);
    expect(rect.x + rect.width).toBeLessThanOrEqual(476);
  });

  it('assigns authored speech colors by channel and keeps reserve tones distinct', () => {
    expect(speechBubbleTone('say')).toBe('white');
    expect(speechBubbleTone('shout')).toBe('red');
    expect(speechBubbleTone('tell')).toBe('purple');
    expect(speechBubbleTone('guild')).toBe('green');
    expect(speechBubbleTone('thought')).toBe('blue');
    expect(speechBubbleTone('reserved')).toBe('yellow');
    expect(speechBubbleTone('other')).toBe('beige');
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
