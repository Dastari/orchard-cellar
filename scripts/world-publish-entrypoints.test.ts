import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('world publication entrypoints', () => {
  it('routes the canonical workspace publish alias through the full guarded release', () => {
    const world = JSON.parse(readFileSync(new URL('../packages/world/package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    const root = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> };
    expect(world.scripts['publish:local']).toBe('npm --prefix ../.. run world:release');
    expect(root.scripts['world:release']).toBe('bash scripts/world-release.sh');
    for (const command of [...Object.values(root.scripts), ...Object.values(world.scripts)]) {
      expect(command).not.toMatch(/spacetime\s+(?:publish|dev)\s+orchard-cellar-world\b/u);
    }
    expect(root.scripts['world:dev']).toBe('bash scripts/world-dev.sh');
    expect(root.scripts['dev']).toContain('VITE_SPACETIMEDB_DATABASE=${ORCHARD_DEV_DATABASE:-orchard-cellar-dev}');
    expect(JSON.parse(readFileSync(new URL('../spacetime.local.json', import.meta.url), 'utf8')))
      .toMatchObject({ database: 'orchard-cellar-dev' });
  });

  it('publishes development only to explicit isolated names and rejects production or CLI overrides', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-dev-entrypoint-'));
    try {
      writeFileSync(join(directory, 'curl'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
      writeFileSync(join(directory, 'spacetime'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o700 });
      const run = (database: string, args: string[] = []) => spawnSync('bash', ['scripts/world-dev.sh', ...args], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8',
        env: { ...process.env, PATH: `${directory}:${process.env['PATH'] ?? ''}`, ORCHARD_DEV_DATABASE: database },
      });
      for (const database of ['', 'orchard-cellar-dev', 'orchard-cellar-dev-feature-2']) {
        const result = run(database);
        expect(result.status, result.stderr).toBe(0);
        const args = result.stdout.trim().split('\n');
        expect(args.slice(0, 2)).toEqual(['dev', database || 'orchard-cellar-dev']);
        expect(args).toContain('--no-config');
        expect(args).toContain('--delete-data=never');
        expect(args[args.indexOf('--server') + 1]).toBe('http://127.0.0.1:3000');
      }
      for (const database of ['orchard-cellar-world', 'local', '../orchard-cellar-dev', 'orchard-cellar-development', '--server']) {
        const result = run(database);
        expect(result.status).toBe(64);
        expect(result.stdout).toBe('');
      }
      expect(run('orchard-cellar-dev', ['orchard-cellar-world']).status).toBe(64);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
