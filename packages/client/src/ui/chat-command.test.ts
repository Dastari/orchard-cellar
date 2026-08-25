import { describe, expect, it } from 'vitest';
import { chatCommandSuggestions, parseChatSubmission } from './chat-command.js';

describe('chat commands', () => {
  it('keeps normal chat separate from owner-only slash commands', () => {
    expect(parseChatSubmission('hello', false)).toEqual({ kind: 'chat', body: 'hello' });
    expect(parseChatSubmission('/tp 10 20', false)).toEqual({ kind: 'error', message: 'ADMIN COMMAND REQUIRED' });
    expect(parseChatSubmission('/unknown', true)).toEqual({ kind: 'error', message: 'UNKNOWN COMMAND' });
  });

  it('parses coordinate and multi-word player teleport destinations', () => {
    expect(parseChatSubmission('/tp 10   20', true)).toEqual({ kind: 'teleport', destination: '10 20' });
    expect(parseChatSubmission('/TP Nathan Lambert', true)).toEqual({ kind: 'teleport', destination: 'Nathan Lambert' });
    expect(parseChatSubmission('/tp', true).kind).toBe('error');
  });

  it('parses private and ranged speech aliases without sending them as channel chat', () => {
    expect(parseChatSubmission('/tell Nathan Lambert hello there', false, ['Nathan Lambert'])).toEqual({
      kind: 'whisper', playerName: 'Nathan Lambert', body: 'hello there',
    });
    expect(parseChatSubmission('/whisper Nathan hi', false, ['Nathan'])).toEqual({
      kind: 'whisper', playerName: 'Nathan', body: 'hi',
    });
    expect(parseChatSubmission('/w Nathan hello', false, ['Nathan'])).toEqual({
      kind: 'whisper', playerName: 'Nathan', body: 'hello',
    });
    expect(parseChatSubmission('/r hello back', false)).toEqual({ kind: 'reply', body: 'hello back' });
    expect(parseChatSubmission('/reply', false).kind).toBe('error');
    expect(parseChatSubmission('/say hello', false)).toEqual({ kind: 'speech', speechKind: 'say', body: 'hello' });
    expect(parseChatSubmission('/yell hello', false)).toEqual({ kind: 'speech', speechKind: 'shout', body: 'hello' });
  });

  it('predicts the command, coordinate syntax, and matching online players', () => {
    expect(chatCommandSuggestions('/t', ['Nathan', 'Toby'], true).some((suggestion) => suggestion.completion === '/tp ')).toBe(true);
    expect(chatCommandSuggestions('/tp Na', ['Toby', 'Nathan'], true)[0]).toEqual({
      completion: '/tp Nathan ', label: 'Nathan  PLAYER',
    });
    expect(chatCommandSuggestions('/tp 12 ', ['Nathan'], true)).toEqual([
      { completion: '/tp 12 ', label: '/tp <x> <y>  TELEPORT TO TILE' },
    ]);
    expect(chatCommandSuggestions('/', ['Nathan'], false).some((suggestion) => suggestion.completion === '/say ')).toBe(true);
    expect(chatCommandSuggestions('/', ['Nathan'], false).some((suggestion) => suggestion.completion === '/tp ')).toBe(false);
    expect(chatCommandSuggestions('/', ['Nathan'], true).map((suggestion) => suggestion.completion)).toContain('/tp ');
    expect(chatCommandSuggestions('/w Na', ['Nathan'], false)[0]?.completion).toBe('/w Nathan ');
    expect(chatCommandSuggestions('/r ', ['Nathan'], false, 'Nathan')[0]?.label).toContain('TO Nathan');
  });
});
