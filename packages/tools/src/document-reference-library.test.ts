import { describe, expect, it } from 'vitest';
import {
  pngDimensions,
  referenceGroup,
  referenceUsagePolicy,
  webpDimensions,
} from './document-reference-library.js';

describe('reference library catalog routing', () => {
  it('routes every durable reference family to a stable group', () => {
    expect(referenceGroup('references/art/kenmi/cute-fantasy/core/Tiles/Test.png'))
      .toBe('cute-fantasy-art');
    expect(referenceGroup('references/art/clockwork-raven/equipment/armor/sheet-16.png'))
      .toBe('clockwork-raven-art');
    expect(referenceGroup('references/audio/music/example.mp3')).toBe('audio');
    expect(referenceGroup('references/documents/source-captures/orchard.html')).toBe('source-capture');
  });

  it('keeps discovery separate from import licensing decisions', () => {
    expect(referenceUsagePolicy('references/art/kenmi/cute-fantasy/core/Tiles/Test.png'))
      .toBe('licensed-importable');
    expect(referenceUsagePolicy('references/art/clockwork-raven/equipment/armor/sheet-16.png'))
      .toBe('license-review-required');
    expect(referenceUsagePolicy('references/art/kenmi/cute-fantasy/free/Player.png'))
      .toBe('noncommercial-only');
    expect(referenceUsagePolicy('references/art/kenmi/cute-fantasy/shroomlands/Props.png'))
      .toBe('license-review-required');
    expect(referenceUsagePolicy('references/generated/concepts/test.png')).toBe('concept-only');
  });

  it('reads extended WebP canvas dimensions', () => {
    const bytes = new Uint8Array(30);
    bytes.set(Buffer.from('RIFF'), 0);
    bytes.set(Buffer.from('WEBP'), 8);
    bytes.set(Buffer.from('VP8X'), 12);
    bytes[24] = 0xff;
    bytes[25] = 0x01;
    bytes[27] = 0x7f;
    expect(webpDimensions(bytes)).toEqual({ width: 512, height: 128 });
  });

  it('rejects non-WebP data', () => {
    expect(webpDimensions(new Uint8Array(30))).toBeNull();
  });

  it('reads dimensions without requiring a particular PNG colour type', () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    bytes.set(Buffer.from('IHDR'), 12);
    bytes[19] = 48;
    bytes[23] = 64;
    expect(pngDimensions(bytes)).toEqual({ width: 48, height: 64 });
  });
});
