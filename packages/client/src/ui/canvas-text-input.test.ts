import { describe, expect, it } from 'vitest';
import { canvasTextInputPresentation } from './canvas-text-input.js';

describe('canvas text input presentation', () => {
  it('keeps the native caret and selection visible in a clipped field', () => {
    expect(canvasTextInputPresentation('abcdefghij', '> ', '', 6, 3, 8)).toEqual({
      text: 'defghi',
      visibleStart: 5,
      caret: 5,
      selectionStart: 0,
      selectionEnd: 5,
      placeholder: false,
    });
  });

  it('places the caret after a fixed prefix while showing a placeholder', () => {
    expect(canvasTextInputPresentation('', 'SAY: ', 'MESSAGE', 12, 0, 0)).toEqual({
      text: 'SAY: MESSAGE',
      visibleStart: 0,
      caret: 5,
      selectionStart: 5,
      selectionEnd: 5,
      placeholder: true,
    });
  });
});
