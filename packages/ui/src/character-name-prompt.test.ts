import { describe, expect, it } from 'vitest';
import { characterNameErrorText } from './character-name-prompt.js';

describe('character name prompt errors', () => {
  it('presents server validation errors without exposing reducer internals', () => {
    expect(characterNameErrorText(new Error('display_name_taken'))).toBe('THAT CHARACTER NAME IS ALREADY TAKEN');
    expect(characterNameErrorText(new Error('invalid_display_name'))).toContain('3-20');
    expect(characterNameErrorText(new Error('network gone'))).toBe('COULD NOT SAVE THE CHARACTER NAME');
  });
});

import { vi } from 'vitest';
import { CharacterNamePrompt } from './character-name-prompt.js';
import { uiTestArt } from './kit/lab/testing/art.js';
import type { CanvasTextEditor } from './kit/runtime/text-editor.js';
it('keeps naming required through validation, busy submission and late server failures', async () => {
  let reject: (error: Error) => void = () => {};
  const submit = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  const active = vi.fn(), prompt = new CharacterNamePrompt(await uiTestArt(), submit, active);
  prompt.update(480,270,true);
  const input = () => prompt.kitRoot.entries().find(entry=>entry.element.id==='character-name.input')!.element;
  const editor = () => input().props['editor'] as CanvasTextEditor;
  editor().setValue('ab'); prompt.handleGlobalKeyDown({key:'Enter'}); expect(submit).not.toHaveBeenCalled();
  expect(prompt.kitRoot.entries().find(entry=>entry.element.id==='character-name.error')?.element.props['text']).toContain('3-20');
  editor().setValue('Hazel Orchard'); prompt.handleGlobalKeyDown({key:'Escape'});expect(editor().snapshot().value).toBe('');expect(prompt.isActive).toBe(true);
  editor().setValue('Hazel Orchard');prompt.handleGlobalKeyDown({key:'Enter'});prompt.handleGlobalKeyDown({key:'Enter'});
  expect(submit).toHaveBeenCalledExactlyOnceWith('Hazel Orchard');expect(input().disabled).toBe(true);
  reject(new Error('display_name_taken'));await Promise.resolve();expect(input().disabled).toBe(false);
  expect(prompt.kitRoot.entries().find(entry=>entry.element.id==='character-name.error')?.element.props['text']).toContain('ALREADY TAKEN');
  editor().setValue('Another Farmer');prompt.handleGlobalKeyDown({key:'Enter'});
  prompt.update(480,270,false);prompt.update(480,270,true);
  reject(new Error('display_name_taken'));await Promise.resolve();
  expect(editor().snapshot().value).toBe('');expect(input().disabled).toBe(false);
  expect(prompt.kitRoot.entries().some(entry=>entry.element.id==='character-name.error')).toBe(false);
  expect(active.mock.calls.map(call=>call[0])).toEqual([true,false,true]);prompt.dispose();
});
it('scrolls a short touch viewport without submitting the button under the swipe', async () => {
  const submit = vi.fn(async () => {}), prompt = new CharacterNamePrompt(await uiTestArt(), submit, () => {});
  prompt.update(360,130,true);
  const entries = prompt.kitRoot.entries(), input = entries.find(entry=>entry.element.id==='character-name.input')!.element;
  (input.props['editor'] as CanvasTextEditor).setValue('Hazel');
  const begin = entries.find(entry=>entry.element.id==='character-name.begin')!.element;
  prompt.kitRoot.focus.set(begin);prompt.kitRoot.arrange();
  const point={x:begin.clip.x+begin.clip.width/2,y:begin.clip.y+begin.clip.height/2};
  expect(begin.clip.height).toBeGreaterThan(0);
  prompt.pointerDown(point,0,'touch');prompt.pointerMove({...point,y:point.y+15});prompt.pointerUp({...point,y:point.y+15},0);
  expect(submit).not.toHaveBeenCalled();prompt.dispose();
});
