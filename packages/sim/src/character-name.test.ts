import { describe, expect, it } from 'vitest';
import { normalizeCharacterName } from './character-name.js';

describe('character names', () => {
  it('normalizes valid names used by the pixel font', () => {
    expect(normalizeCharacterName('  Rowan   Vale  ')).toBe('Rowan Vale');
    expect(normalizeCharacterName("O'Brien")).toBe("O'Brien");
  });

  it('rejects email addresses, short names, and punctuation at the edges', () => {
    expect(normalizeCharacterName('farmer@example.com')).toBeNull();
    expect(normalizeCharacterName('Al')).toBeNull();
    expect(normalizeCharacterName('-Rowan')).toBeNull();
  });
});
