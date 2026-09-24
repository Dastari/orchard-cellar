import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { CharacterNamePrompt, characterNameErrorText } from './character-name-prompt.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { UiKitArt } from './kit/components/art.js';
import type { CanvasTextEditor } from './kit/runtime/text-editor.js';

let art: UiKitArt;
beforeAll(async () => { art = await uiTestArt(); });
afterAll(() => vi.unstubAllGlobals());
function field(prompt: CharacterNamePrompt) {
  prompt.root.arrange();
  return prompt.root.entries().find(({ element }) => element.id === 'character-name.input')!.element;
}
function draft(prompt: CharacterNamePrompt): string {
  return (field(prompt).props['editor'] as CanvasTextEditor).snapshot().value;
}
function errorText(prompt: CharacterNamePrompt): string {
  return String(prompt.root.entries().find(({ element }) => element.id === 'character-name.error')?.element.props['text'] ?? '');
}
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('production retained character naming gate', () => {
  it('presents validation errors without exposing reducer internals', () => {
    expect(characterNameErrorText(new Error('display_name_taken'))).toBe('That name is taken.');
    expect(characterNameErrorText(new Error('invalid_display_name'))).toContain('3-20');
    expect(characterNameErrorText(new Error('network gone'))).toBe('Could not save the name. Try again.');
  });

  it('retains the draft and focus across updates, validates, normalizes, and submits once until authority closes', async () => {
    const pending = deferred(), submit = vi.fn(() => pending.promise), changed = vi.fn();
    const prompt = new CharacterNamePrompt(art, submit, changed);
    prompt.update(480, 270, true);
    const input = field(prompt);
    expect(prompt.root.focus.current).toBe(input);
    prompt.root.text('x'); prompt.root.key({ key: 'Enter' });
    expect(submit).not.toHaveBeenCalled(); expect(errorText(prompt)).toContain('3-20');
    prompt.root.key({ key: 'Escape' });
    expect(prompt.isActive).toBe(true); expect(draft(prompt)).toBe('');
    prompt.root.text('  Mara   Vale  ');
    expect(errorText(prompt)).toBe('');
    prompt.update(260, 180, true); prompt.root.arrange();
    expect(prompt.root.focus.current).toBe(input); expect(draft(prompt)).toBe('  Mara   Vale  ');
    prompt.root.key({ key: 'Enter' }); prompt.root.key({ key: 'Enter' });
    expect(submit).toHaveBeenCalledExactlyOnceWith('Mara Vale');
    expect(input.disabled).toBe(true);
    pending.resolve(); await pending.promise;
    prompt.root.key({ key: 'Enter' });
    expect(submit).toHaveBeenCalledTimes(1); expect(prompt.isActive).toBe(true);
    prompt.update(480, 270, false);
    expect(prompt.isActive).toBe(false); expect(changed.mock.calls).toEqual([[true], [false]]);
    prompt.update(480, 270, true);
    expect(draft(prompt)).toBe(''); prompt.dispose();
  });

  it('restores rejected drafts but ignores rejection from a previous activation or disposed host', async () => {
    const first = deferred(), second = deferred();
    const submit = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const prompt = new CharacterNamePrompt(art, submit, () => {});
    prompt.update(480, 270, true); field(prompt); prompt.root.text('Mara'); prompt.root.key({ key: 'Enter' });
    first.reject(new Error('display_name_taken')); await first.promise.catch(() => {});
    expect(errorText(prompt)).toBe('That name is taken.'); expect(draft(prompt)).toBe('Mara');
    expect(prompt.root.focus.current).toBe(field(prompt));
    prompt.root.key({ key: 'Enter' });
    prompt.update(480, 270, false); prompt.update(480, 270, true); field(prompt); prompt.root.text('New Name');
    second.reject(new Error('invalid_display_name')); await second.promise.catch(() => {});
    expect(errorText(prompt)).toBe(''); expect(draft(prompt)).toBe('New Name');
    const late = deferred();
    const disposed = new CharacterNamePrompt(art, () => late.promise, () => {});
    disposed.update(480, 270, true); field(disposed); disposed.root.text('Mara'); disposed.root.key({ key: 'Enter' });
    disposed.dispose(); late.reject(new Error('display_name_taken')); await late.promise.catch(() => {});
    expect(disposed.root.disposed).toBe(true); prompt.dispose();
  });

  it('uses the kit release gesture and cancels a press without submitting', () => {
    const submit = vi.fn(() => new Promise<void>(() => {}));
    const prompt = new CharacterNamePrompt(art, submit, () => {});
    prompt.update(480, 270, true); field(prompt); prompt.root.text('Mara'); prompt.root.arrange();
    const button = prompt.root.entries().find(({ element }) => element.id === 'character-name.begin')!.element;
    const point = { x: button.rect.x + 5, y: button.rect.y + 5 };
    prompt.root.pointer({ type: 'down', pointerId: 9, button: 0, point });
    expect(submit).not.toHaveBeenCalled();
    prompt.root.pointer({ type: 'cancel', pointerId: 9, button: 0, point });
    expect(submit).not.toHaveBeenCalled();
    prompt.root.pointer({ type: 'down', pointerId: 10, button: 0, point });
    prompt.root.pointer({ type: 'up', pointerId: 10, button: 0, point });
    expect(submit).toHaveBeenCalledExactlyOnceWith('Mara'); prompt.dispose();
  });

  it('keeps the naming window one size with or without a validation notice and keeps Begin on screen', () => {
    const prompt = new CharacterNamePrompt(art, async () => {}, () => {});
    const rect = (predicate: (element: { id: string; kind: string }) => boolean) => { prompt.root.arrange(); return prompt.root.entries().find(({ element }) => predicate(element))!.element.rect; };
    for (const [width, height] of [[480, 270], [390, 797], [844, 390], [260, 180]] as const) {
      prompt.update(width, height, true); field(prompt);
      const window = rect(element => element.kind === 'window');
      prompt.root.text('x'); prompt.root.key({ key: 'Enter' });
      expect(errorText(prompt)).toContain('3-20');
      expect(rect(element => element.kind === 'window')).toEqual(window);
      const begin = rect(element => element.id === 'character-name.begin');
      expect(begin.x).toBeGreaterThanOrEqual(window.x); expect(begin.x + begin.width).toBeLessThanOrEqual(window.x + window.width);
      expect(begin.y + begin.height).toBeLessThanOrEqual(Math.min(height, window.y + window.height));
      prompt.update(width, height, false);
    }
    prompt.dispose();
  });

  it('draws the concrete composition within compact/wide logical viewports under all UI scales and fractional DPR', () => {
    const prompt = new CharacterNamePrompt(art, async () => {}, () => {});
    for (const [width, height] of [[260, 180], [480, 270], [1280, 720]]) {
      prompt.update(width!, height!, true);
      for (const scale of [1, 2, 3]) for (const dpr of [1, 1.25, 1.5]) {
        const canvas = createCanvas(Math.ceil(width! * scale * dpr), Math.ceil(height! * scale * dpr));
        const context = canvas.getContext('2d'); context.scale(scale * dpr, scale * dpr);
        prompt.draw(context as unknown as CanvasRenderingContext2D, 100);
        const input = field(prompt);
        expect(input.rect.x).toBeGreaterThanOrEqual(0);
        expect(input.rect.x + input.rect.width).toBeLessThanOrEqual(width!);
        expect(canvas.data().some(value => value !== 0)).toBe(true);
        expect(prompt.root.scale).toBe(1);
      }
    }
    prompt.dispose();
  });
});
