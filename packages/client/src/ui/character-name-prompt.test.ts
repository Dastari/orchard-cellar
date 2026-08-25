import { describe, expect, it } from 'vitest';
import { characterNameErrorText } from './character-name-prompt.js';

describe('character name prompt errors', () => {
  it('presents server validation errors without exposing reducer internals', () => {
    expect(characterNameErrorText(new Error('display_name_taken'))).toBe('THAT CHARACTER NAME IS ALREADY TAKEN');
    expect(characterNameErrorText(new Error('invalid_display_name'))).toContain('3-20');
    expect(characterNameErrorText(new Error('network gone'))).toBe('COULD NOT SAVE THE CHARACTER NAME');
  });
});
