import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('offline creator security boundary', () => {
  it('does not import SpaceTimeDB, account flows, or live connection code', () => {
    const editor = readFileSync(new URL('./model.ts', import.meta.url), 'utf8');
    expect(editor).not.toMatch(/spacetimedb|overworld-connection|account-main|@orchard\/auth/iu);
    const studio = readFileSync(new URL('../object/model.ts', import.meta.url), 'utf8');
    expect(studio).not.toMatch(/spacetimedb|overworld-connection|account-main|@orchard\/auth/iu);
  });

  it('branches to the offline editor before OIDC session discovery', () => {
    const main = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
    expect(main).not.toMatch(/^import .*@orchard\/auth/mu);
    expect(main).toContain("import('./shell/studio-connection.js')");
    expect(main).not.toMatch(/^import .*@orchard\/auth/mu);
  });
});
