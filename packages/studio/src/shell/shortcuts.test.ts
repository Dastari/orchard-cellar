import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STUDIO_SHORTCUTS,
  STUDIO_SHORTCUT_STORAGE_KEY,
  StudioShortcutMap,
  normalizeStudioShortcut,
} from './shortcuts.js';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('Studio keyboard map', () => {
  it('ships the documented mode, palette, and global-search chords', () => {
    expect(DEFAULT_STUDIO_SHORTCUTS.map(({ chord }) => chord)).toEqual([
      'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+K', 'Ctrl+Shift+F',
    ]);
    expect(normalizeStudioShortcut(' shift + ctrl + f ')).toBe('Ctrl+Shift+F');
  });

  it('resolves keyboard events and rejects conflicting assignments', () => {
    const shortcuts = new StudioShortcutMap(new MemoryStorage());
    expect(shortcuts.actionFor({ ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: '3' }))
      .toBe('mode.operate');
    expect(() => shortcuts.assign('palette.open', 'Ctrl+1')).toThrow('studio_shortcut_conflict:mode.build');
  });

  it('persists valid remaps and falls back safely from invalid storage', () => {
    const storage = new MemoryStorage(); const shortcuts = new StudioShortcutMap(storage);
    shortcuts.assign('palette.open', 'Alt+P');
    expect(new StudioShortcutMap(storage).chord('palette.open')).toBe('Alt+P');
    storage.setItem(STUDIO_SHORTCUT_STORAGE_KEY, '{broken');
    expect(new StudioShortcutMap(storage).chord('palette.open')).toBe('Ctrl+K');
  });
});
