import { expect, it, vi } from 'vitest';
import { ui } from './index.js';
import { CanvasTextEditor } from '../runtime/text-editor.js';
import { UiRoot } from '../runtime/root.js';
it('keeps native keyboard hints opt-in without replacing editor validation', () => {
  const numeric = ui.input({ label: 'Amount', inputMode: 'numeric' });
  expect(numeric.props['inputMode']).toBe('numeric');
  numeric.hooks.onClipboard?.('paste', '12x', numeric);
  expect((numeric.props['editor'] as CanvasTextEditor).snapshot().value).toBe('12x');
  expect(ui.input({ label: 'Name' }).props['inputMode']).toBe('text');
  expect(ui.textArea({ label: 'Search', inputMode: 'search' }).props['inputMode']).toBe('search');
});
it('retains a host editor selection and draft across a surface rebuild', () => {
  const changed = vi.fn(), editor = new CanvasTextEditor({ value: 'apple', onChange: changed });
  const root = new UiRoot({ scale: 1 }); root.resize(300,200);
  let field = root.mount(ui.input({ id: 'name', label: 'Name', editor })); root.arrange(); root.focus.set(field);
  editor.setSelection(1,4); root.key({ key: 'b' }); expect(editor.snapshot().value).toBe('abe');
  const selection = editor.snapshot(); field.dispose();
  field = root.mount(ui.input({ id: 'name', label: 'Name', editor })); root.arrange(); root.focus.set(field);
  expect(editor.snapshot().focus).toBe(selection.focus); expect(field.props['editor']).toBe(editor);
  root.key({ key: 'c' }); expect(editor.snapshot().value).toBe('abce'); expect(changed).toHaveBeenCalled(); root.dispose();
});
it('accepts an external model update without overwriting it with stale field props', () => {
  const editor = new CanvasTextEditor({ value: 'before' }), root = new UiRoot({ scale: 1 }); root.resize(300,200);
  const field = root.mount(ui.input({ label: 'Name', editor })); root.arrange(); root.focus.set(field);
  editor.setValue('after'); editor.setSelection(5,5); root.key({ key: '!' });
  expect(editor.snapshot().value).toBe('after!'); expect(field.props['value']).toBe('after!'); root.dispose();
});
it('keeps multiline drafts in the supplied editor and rejects competing initial values', () => {
  const editor = new CanvasTextEditor({ value: 'first', multiline: true }), root = new UiRoot({ scale: 1 }); root.resize(300,200);
  const field = root.mount(ui.textArea({ label: 'Draft', editor })); root.arrange(); root.focus.set(field);
  root.key({ key: 'End' }); root.key({ key: 'Enter' }); root.key({ key: 'x' }); expect(editor.snapshot().value).toBe('first\nx');
  expect(() => ui.input({ label: 'Conflicting value', editor, value: 'other' })).toThrow('external UI editor');
  expect(() => ui.input({ label: 'Conflicting limit', editor, maxLength: 4 })).toThrow('external UI editor'); root.dispose();
});

it('shows the start of an unfocused value and reveals its caret only while editing', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { uiTestArt } = await import('../lab/testing/art.js');
  const art = await uiTestArt(); const root = new UiRoot({ scale: 1, art }); root.resize(120, 40);
  const editor = new CanvasTextEditor({ value: 'item:very_long_artwork_identifier' });
  const field = root.mount(ui.input({ label: 'Artwork', editor })); root.arrange();
  const pixels = () => { const canvas = createCanvas(120, 40); root.draw(canvas.getContext('2d') as unknown as CanvasRenderingContext2D, 0); return canvas.toDataURL(); };
  try {
    const start = pixels(); editor.setSelection(0, 0); expect(pixels()).toBe(start);
    root.focus.set(field); root.key({ key: 'End' }); expect(pixels()).not.toBe(start);
    root.focus.set(null); expect(pixels()).toBe(start);
  } finally { root.dispose(); vi.unstubAllGlobals(); }
});
