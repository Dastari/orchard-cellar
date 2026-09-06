import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = readFileSync(new URL('../../../scripts/prove-spacetimedb-empty-table-drop.sh', import.meta.url), 'utf8');

describe('SpacetimeDB empty-table retirement proof', () => {
  it('is loopback-only, disposable, version-pinned, and never authorizes data deletion', () => {
    expect(script).toContain("spacetimedb tool version 2.8.2");
    expect(script).toContain('127.0.0.1:$PORT');
    expect(script).toContain('mktemp -d');
    expect(script).toContain('--delete-data=never');
    expect(script).not.toContain('--delete-data=always');
    expect(script).not.toContain('cellar.dastari.net');
  });

  it('proves empty success, non-empty refusal, and source-row survival', () => {
    expect(script).toContain('versions/empty-removed.ts');
    expect(script).toContain("no such table");
    expect(script).toContain('versions/nonempty-removed.ts');
    expect(script).toContain('table contains data');
    expect(script.match(/must-survive/gu)).toHaveLength(2);
  });
});
