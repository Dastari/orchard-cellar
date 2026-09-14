import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const barrel = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const connection = readFileSync(new URL('./studio-connection.ts', import.meta.url), 'utf8');

describe('Studio live dependency boundary', () => {
  it('loads the live adapter only inside the explicit connection factory', () => {
    expect(main).toContain("await import('./shell/studio-connection.js')");
    expect(main).not.toMatch(/import\s+\{[^}]*StudioConnection[^}]*\}\s+from/u);
    expect(barrel).toContain("export type { StudioConnectionView, StudioLiveAdapter }");
  });

  it('uses staged tables and production OIDC without changing game token storage', () => {
    expect(connection).not.toContain('subscribeToAllTables');
    expect(connection).toContain('tables.ownMembership');
    expect(connection).toContain('tables.ownContentEditorGrant');
    expect(connection).toContain('tables.ownSupportGrant');
    expect(connection).toContain('tables.liveMapDocument.where');
    expect(connection).toContain("this.environment === 'production' && oidc === null");
    expect(connection).toContain(':studio:token`');
    expect(connection).not.toContain("this.#role !== 'content_editor'");
    expect(connection).toContain('resolveStudioEffectiveRole(');
    expect(main).toContain('completeStudioOidcCallback()');
    expect(main).toContain('prepareStudioOidcConnection(environment)');
    expect(main.indexOf('completeStudioOidcCallback()'))
      .toBeLessThan(main.indexOf("await import('./shell/index.js')"));
    expect(main).not.toContain('orchard-web');
    expect(main).not.toContain('orchard:world:token');
  });
});
