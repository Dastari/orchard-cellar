import { describe, expect, it } from 'vitest';
import {
  edgeSpeechAnchor, speechBubbleLayout, speechBubbleRect, speechTailClipRect, wrapSpeechText,
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

  it('exposes a directional tail only on its pointer-facing edge', () => {
    const bubble = { x: 40, y: 50, width: 120, height: 23 };
    expect(speechTailClipRect(bubble, 'down')).toEqual({ x: 40, y: 50, width: 120, height: 35 });
    expect(speechTailClipRect(bubble, 'up')).toEqual({ x: 40, y: 38, width: 120, height: 35 });
    expect(speechTailClipRect(bubble, 'left')).toEqual({ x: 28, y: 50, width: 132, height: 23 });
    expect(speechTailClipRect(bubble, 'right')).toEqual({ x: 40, y: 50, width: 132, height: 23 });
  });
});
