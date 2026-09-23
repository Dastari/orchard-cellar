import { describe, expect, it } from 'vitest';
import { requireContentScopes } from './studio-scopes.js';

describe('progression content permission', () => {
  it('requires the progression domain independently of world balance', () => {
    expect(() => requireContentScopes(['loot_progression'], ['progression'])).not.toThrow();
    expect(() => requireContentScopes(['world_rules'], ['progression'])).toThrow('studio_scope_required:loot_progression');
    expect(() => requireContentScopes(['loot_progression'], ['balance'])).toThrow('studio_scope_required:world_rules');
    expect(() => requireContentScopes(['world_rules'], ['balance'])).not.toThrow();
  });
});
