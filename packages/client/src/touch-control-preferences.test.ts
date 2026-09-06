import { describe, expect, it } from 'vitest';
import { readTouchControlPreferences, writeTouchControlPreferences } from './touch-control-preferences.js';

describe('device touch-control preferences', () => {
  it('persists both settings across new readers and bounds malformed saved values', () => {
    let saved: string | null = null;
    const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
    expect(readTouchControlPreferences(storage)).toEqual({ swapped: false, bottomOffset: 0 });
    writeTouchControlPreferences(storage, { swapped: true, bottomOffset: 47 });
    expect(readTouchControlPreferences(storage)).toEqual({ swapped: true, bottomOffset: 47 });
    saved = '{"swapped":true,"bottomOffset":999}';
    expect(readTouchControlPreferences(storage)).toEqual({ swapped: true, bottomOffset: 120 });
    saved = '{"swapped":"true","bottomOffset":"50"}';
    expect(readTouchControlPreferences(storage)).toEqual({ swapped: false, bottomOffset: 0 });
    saved = 'broken';
    expect(readTouchControlPreferences(storage)).toEqual({ swapped: false, bottomOffset: 0 });
  });

  it('keeps controls usable when browser storage is blocked', () => {
    const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readTouchControlPreferences(storage)).toEqual({ swapped: false, bottomOffset: 0 });
    expect(() => writeTouchControlPreferences(storage, { swapped: true, bottomOffset: 50 })).not.toThrow();
  });
});
