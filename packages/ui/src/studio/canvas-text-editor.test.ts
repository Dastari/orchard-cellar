import { describe, expect, it, vi } from 'vitest';
import { CanvasTextEditor, canvasTextPresentation } from './canvas-text-editor.js';

describe('CanvasTextEditor', () => {
  it('owns bounded immutable state without a DOM editing surface', () => {
    const editor = new CanvasTextEditor({ value: 'ab\r\ncd🙂ef', maxLength: 7 });
    expect(editor.snapshot()).toMatchObject({
      value: 'ab cd🙂e', anchor: 8, focus: 8, caretStart: 8, caretEnd: 8,
      composing: false, focused: false,
    });
    expect(Object.isFrozen(editor.snapshot())).toBe(true);
    expect(() => new CanvasTextEditor({ maxLength: -1 })).toThrow('canvas_text_max_length_invalid');
  });

  it('inserts printable keys, replaces directional selections, and deletes code points', () => {
    const changes = vi.fn();
    const editor = new CanvasTextEditor({ value: 'A🙂BC', onChange: changes });
    editor.setSelection(1, 3);
    expect(editor.handleKeyDown({ key: 'z' })).toBe(true);
    expect(editor.snapshot()).toMatchObject({ value: 'AzBC', anchor: 2, focus: 2 });
    expect(editor.handleKeyDown({ key: 'Backspace' })).toBe(true);
    expect(editor.snapshot().value).toBe('ABC');
    editor.setSelection(1);
    expect(editor.handleKeyDown({ key: 'Delete' })).toBe(true);
    expect(editor.snapshot().value).toBe('AC');
    expect(changes).toHaveBeenCalledTimes(3);
  });

  it('supports arrows, Shift selection, Home, End, and selection collapse', () => {
    const editor = new CanvasTextEditor({ value: 'abcd' });
    expect(editor.handleKeyDown({ key: 'Home' })).toBe(true);
    expect(editor.handleKeyDown({ key: 'ArrowRight', shiftKey: true })).toBe(true);
    expect(editor.handleKeyDown({ key: 'ArrowRight', shiftKey: true })).toBe(true);
    expect(editor.snapshot()).toMatchObject({ anchor: 0, focus: 2, caretStart: 0, caretEnd: 2 });
    expect(editor.handleKeyDown({ key: 'ArrowLeft' })).toBe(true);
    expect(editor.snapshot()).toMatchObject({ anchor: 0, focus: 0 });
    expect(editor.handleKeyDown({ key: 'End' })).toBe(true);
    expect(editor.snapshot().focus).toBe(4);
  });

  it('navigates and edits multiline values while single-line input rejects Enter', () => {
    const editor = new CanvasTextEditor({ value: 'abcd\nxy\n12345', multiline: true });
    editor.setSelection(3);
    expect(editor.handleKeyDown({ key: 'ArrowDown' })).toBe(true);
    expect(editor.snapshot().focus).toBe(7);
    expect(editor.handleKeyDown({ key: 'ArrowDown' })).toBe(true);
    expect(editor.snapshot().focus).toBe(10);
    expect(editor.handleKeyDown({ key: 'Home' })).toBe(true);
    expect(editor.snapshot().focus).toBe(8);
    expect(editor.handleKeyDown({ key: 'End', shiftKey: true })).toBe(true);
    expect(editor.snapshot()).toMatchObject({ anchor: 8, focus: 13 });
    expect(editor.handleKeyDown({ key: 'Enter' })).toBe(true);
    expect(editor.snapshot().value).toBe('abcd\nxy\n\n');

    const single = new CanvasTextEditor({ value: 'one' });
    expect(single.handleKeyDown({ key: 'Enter' })).toBe(false);
    expect(single.handlePaste('two\nthree')).toBe(true);
    expect(single.snapshot().value).toBe('onetwo three');
  });

  it('handles select/copy/cut/paste through the injected clipboard boundary', () => {
    let clipboard = '';
    const editor = new CanvasTextEditor({
      value: 'orchard',
      clipboard: {
        readText: () => clipboard,
        writeText: (text) => { clipboard = text; },
      },
    });
    expect(editor.handleKeyDown({ key: 'a', ctrlKey: true })).toBe(true);
    expect(editor.handleKeyDown({ key: 'c', metaKey: true })).toBe(true);
    expect(clipboard).toBe('orchard');
    expect(editor.handleKeyDown({ key: 'x', ctrlKey: true })).toBe(true);
    expect(editor.snapshot().value).toBe('');
    clipboard = 'cellar';
    expect(editor.handleKeyDown({ key: 'v', metaKey: true })).toBe(true);
    expect(editor.snapshot().value).toBe('cellar');
  });

  it('fails closed when clipboard access is absent or throws', () => {
    const editor = new CanvasTextEditor({ value: 'safe' });
    editor.setSelection(0, 4);
    expect(editor.handleKeyDown({ key: 'x', ctrlKey: true })).toBe(false);
    expect(editor.snapshot().value).toBe('safe');
    const blocked = new CanvasTextEditor({
      value: 'safe',
      clipboard: {
        readText: () => { throw new Error('denied'); },
        writeText: () => { throw new Error('denied'); },
      },
    });
    blocked.setSelection(0, 4);
    expect(blocked.handleKeyDown({ key: 'x', ctrlKey: true })).toBe(false);
    expect(blocked.handleKeyDown({ key: 'v', ctrlKey: true })).toBe(false);
    expect(blocked.snapshot().value).toBe('safe');
  });

  it('updates and commits IME composition inside the original selection', () => {
    const editor = new CanvasTextEditor({ value: 'aXXb', maxLength: 4 });
    editor.setSelection(1, 3);
    expect(editor.handleCompositionStart()).toBe(true);
    expect(editor.handleCompositionUpdate({ data: 'に' })).toBe(true);
    expect(editor.snapshot()).toMatchObject({ value: 'aにb', composing: true, compositionText: 'に' });
    expect(editor.handleBeforeInput({ inputType: 'insertCompositionText', data: '日本' })).toBe(true);
    expect(editor.snapshot()).toMatchObject({ value: 'a日本b', composing: true });
    expect(editor.handleCompositionEnd({ data: '日本語' })).toBe(true);
    expect(editor.snapshot()).toMatchObject({ value: 'a日本b', composing: false, compositionText: '' });
  });

  it('routes beforeinput mutations and rejects unknown input types', () => {
    const editor = new CanvasTextEditor({ value: 'ab', multiline: true });
    editor.setSelection(1);
    expect(editor.handleBeforeInput({ inputType: 'insertText', data: 'X' })).toBe(true);
    expect(editor.handleBeforeInput({ inputType: 'insertParagraph' })).toBe(true);
    expect(editor.handleBeforeInput({ inputType: 'deleteContentBackward' })).toBe(true);
    expect(editor.snapshot().value).toBe('aXb');
    expect(editor.handleBeforeInput({ inputType: 'formatBold' })).toBe(false);
  });

  it('exposes deterministic caret and selection presentation with caller time', () => {
    const editor = new CanvasTextEditor({ value: 'orchard' });
    editor.focus();
    editor.setSelection(6, 2);
    expect(canvasTextPresentation(editor.snapshot(), 0)).toEqual({
      selectionStart: 2, selectionEnd: 6, caret: 2, caretVisible: true,
    });
    expect(canvasTextPresentation(editor.snapshot(), 530).caretVisible).toBe(false);
    editor.blur();
    expect(canvasTextPresentation(editor.snapshot(), 0).caretVisible).toBe(false);
  });

  it('clamps external selections to Unicode boundaries and setValue to its limit', () => {
    const editor = new CanvasTextEditor({ value: 'a🙂b', maxLength: 3 });
    expect(editor.setSelection(2)).toBe(true);
    expect(editor.snapshot().focus).toBe(1);
    expect(editor.setSelection(Number.NaN)).toBe(false);
    editor.setValue('12345');
    expect(editor.snapshot()).toMatchObject({ value: '123', anchor: 3, focus: 3 });
  });
});
