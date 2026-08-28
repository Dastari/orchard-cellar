import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('offline creator security boundary', () => {
  it('does not import SpaceTimeDB, account flows, or live connection code', () => {
    const editor = readFileSync(new URL('./offline-editor.ts', import.meta.url), 'utf8');
    expect(editor).not.toMatch(/spacetimedb|overworld-connection|account-main|reducer/iu);
    const studio = readFileSync(new URL('./design-studio.ts', import.meta.url), 'utf8');
    expect(studio).not.toMatch(/spacetimedb|overworld-connection|account-main|reducer/iu);
  });

  it('branches to the offline editor before OIDC session discovery', () => {
    const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    expect(main).not.toMatch(/^import .*\.\/auth\/oidc\.js/mu);
    expect(main).toContain("entryRoute.kind === 'standard'\n  ? (await import('./auth/oidc.js'))");
    expect(main.indexOf("entryRoute.kind === 'offline_design_editor'"))
      .toBeLessThan(main.indexOf('ensureOidcSession()'));
    expect(main.indexOf("entryRoute.kind === 'offline_editor'"))
      .toBeLessThan(main.indexOf('ensureOidcSession()'));
  });
});
