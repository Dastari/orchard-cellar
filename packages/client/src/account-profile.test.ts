import { describe, expect, it } from 'vitest';
import {
  LOCAL_PROFILES_KEY,
  localProfileWorldUrl,
  readLocalProfiles,
  rememberLocalProfile,
  validLocalProfileName,
} from './account-profile.js';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('local SpaceTimeDB profile chooser', () => {
  it('uses the same authority name constraints and rejects ambiguous whitespace', () => {
    expect(validLocalProfileName('Bob')).toBe(true);
    expect(validLocalProfileName("Mae's Farm")).toBe(true);
    expect(validLocalProfileName(' A')).toBe(false);
    expect(validLocalProfileName('Two  Spaces')).toBe(false);
    expect(validLocalProfileName('x'.repeat(21))).toBe(false);
  });

  it('persists unique case-insensitive profiles and the last selected account', () => {
    const storage = new MemoryStorage();
    expect(rememberLocalProfile(storage, 'Alice')).toEqual({ names: ['Alice'], lastUsed: 'Alice' });
    expect(rememberLocalProfile(storage, 'Bob')).toEqual({ names: ['Alice', 'Bob'], lastUsed: 'Bob' });
    expect(rememberLocalProfile(storage, 'alice')).toEqual({ names: ['Alice', 'Bob'], lastUsed: 'Alice' });
    expect(readLocalProfiles(storage)).toEqual({ names: ['Alice', 'Bob'], lastUsed: 'Alice' });
  });

  it('fails closed on corrupt storage and safely encodes the world URL', () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_PROFILES_KEY, '{broken');
    expect(readLocalProfiles(storage)).toEqual({ names: [], lastUsed: null });
    expect(localProfileWorldUrl("Mae's Farm", 'http://localhost:5173')).toBe(
      'http://localhost:5173/?slot=Mae%27s+Farm',
    );
  });
});
