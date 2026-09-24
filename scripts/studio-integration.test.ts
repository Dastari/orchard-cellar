import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(legacyUi = false) {
  const root = mkdtempSync(join(tmpdir(), 'studio-integration-'));
  roots.push(root);
  const repository = join(root, 'repository');
  const work = join(root, 'workspace');
  const output = join(root, 'output');
  const put = (path: string, contents: string) => {
    const target = join(repository, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };
  for (const path of ['package.json', 'package-lock.json', 'tsconfig.base.json', 'vitest.config.ts', 'eslint.config.js']) put(path, '{}\n');
  put('packages/ui/src/kit/index.ts', 'export {};\n');
  put('packages/ui/src/studio-entry.ts', "export type * from './kit/index.js';\n");
  put('packages/studio/src/shell/app.ts', 'ui.workbench();\n');
  put('packages/studio/dist/index.html', 'live studio');
  put('packages/client/dist/index.html', 'live game');
  put('packages/assets/generated/atlas.json', '{"current":"shared atlas"}\n');
  put('packages/sim/src/index.ts', 'current simulation');
  put('packages/client/public/placeholder', '');
  put('packages/studio/public/placeholder', '');
  if (legacyUi) put('ui/theme.json', '{}\n');
  put('ops/README.md', 'operations');
  put('.env.studio-production.local', 'VITE_TEST_PUBLIC_VALUE=studio\n');
  for (const path of ['scripts/build-reviewed-studio.sh', 'scripts/studio-release-inputs.mjs', 'packages/studio/scripts/verify-ui-kit.mjs']) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    copyFileSync(new URL(`../${path}`, import.meta.url), join(repository, path));
  }
  for (const app of ['client', 'studio']) symlinkSync('../../assets/generated', join(repository, `packages/${app}/public/generated`));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'npm'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$PWD/npm-calls.log"
if [[ "$1" = run && "$2" = ui:assets ]]; then
  mkdir -p packages/studio/public/ui
  printf 'generated UI' > packages/studio/public/ui/generated.svg
fi
if [[ "$1" = run && "$2" = build ]]; then
  if [[ "\${STUDIO_TEST_MUTATE:-}" = true ]]; then printf changed >> packages/sim/src/index.ts; fi
  if [[ "\${STUDIO_TEST_MUTATE:-}" = ui ]]; then printf changed >> ui/theme.json; fi
  if [[ "\${STUDIO_TEST_MUTATE:-}" = remove-ui ]]; then rm -r ui; fi
  if [[ "\${STUDIO_TEST_MUTATE:-}" = create-ui ]]; then mkdir ui; printf added > ui/added.json; fi
  for argument in "$@"; do
    if [[ "\${previous:-}" = --outDir ]]; then mkdir -p "$argument"; printf 'built studio' > "$argument/index.html"; fi
    previous=$argument
  done
fi
`, { mode: 0o700 });
  const run = (env: Record<string, string> = {}, destinations = [work, output]) => spawnSync('bash', [join(repository, 'scripts/build-reviewed-studio.sh'), ...destinations], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...env },
  });
  return { repository, work, output, put, run };
}

describe('integrated Studio release staging', () => {
  it.each([false, true])('builds only Studio without changing live artifacts, with legacy ui=%s', (legacyUi) => {
    const f = fixture(legacyUi);
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(f.work, 'packages/sim/src/index.ts'), 'utf8')).toBe('current simulation');
    for (const app of ['client', 'studio']) {
      expect(lstatSync(join(f.work, `packages/${app}/public/generated`)).isSymbolicLink()).toBe(false);
      expect(readFileSync(join(f.work, `packages/${app}/public/generated/atlas.json`), 'utf8')).toContain('shared atlas');
      expect(existsSync(join(f.work, `packages/${app}/dist`))).toBe(false);
    }
    expect(statSync(join(f.work, '.env.studio-production.local')).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(f.work, 'package-lock.json'), 'utf8')).toBe(readFileSync(join(f.repository, 'package-lock.json'), 'utf8'));
    expect(readFileSync(join(f.work, 'npm-calls.log'), 'utf8').trim().split('\n')).toEqual([
      'ci --ignore-scripts --offline --no-audit --no-fund',
      'run ui:assets -w @orchard/tools',
      'run typecheck -w @orchard/studio',
      `run build -w @orchard/studio -- --mode studio-production --outDir ${f.output}`,
    ]);
    expect(readFileSync(join(f.work, 'source-manifest.json'), 'utf8')).toBe(readFileSync(join(f.work, 'source-after.json'), 'utf8'));
    expect(JSON.parse(readFileSync(join(f.work, 'source-manifest.json'), 'utf8'))).toHaveProperty(['packages/studio/public/ui/generated.svg']);
    expect(readFileSync(join(f.repository, 'packages/studio/dist/index.html'), 'utf8')).toBe('live studio');
    expect(readFileSync(join(f.repository, 'packages/client/dist/index.html'), 'utf8')).toBe('live game');
    expect(readFileSync(join(f.output, 'index.html'), 'utf8')).toBe('built studio');
    const manifest = JSON.parse(readFileSync(join(f.work, 'source-manifest.json'), 'utf8'));
    expect(Object.hasOwn(manifest, 'ui/theme.json')).toBe(legacyUi);
    expect(existsSync(join(f.work, 'ui'))).toBe(legacyUi);
    if (legacyUi) expect(readFileSync(join(f.work, 'ui/theme.json'), 'utf8')).toBe('{}\n');
  });

  it.each(['missing kit', 'retired renderer'])('refuses %s before creating a workspace', (failure) => {
    const f = fixture();
    if (failure === 'missing kit') rmSync(join(f.repository, 'packages/ui/src/kit/index.ts'));
    else f.put('packages/studio/src/shell/app.ts', 'retiredRenderer();');
    const result = f.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Integrate the reviewed UI kit source');
    expect(existsSync(f.work)).toBe(false);
  });

  it('rejects a shared-resource link outside the staged workspace', () => {
    const f = fixture();
    const link = join(f.repository, 'packages/studio/public/generated');
    rmSync(link);
    symlinkSync(join(f.repository, 'packages/assets/generated'), link);
    expect(f.run().status).toBe(65);
    expect(existsSync(f.output)).toBe(false);
  });

  it('detects source changes made during the staged build', () => {
    const f = fixture();
    expect(f.run({ STUDIO_TEST_MUTATE: 'true' }).status).not.toBe(0);
    expect(readFileSync(join(f.repository, 'packages/sim/src/index.ts'), 'utf8')).toBe('current simulation');
  });

  it.each(['ui', 'remove-ui', 'create-ui'])('detects optional legacy tree mutation: %s', mutation => {
    const f = fixture(mutation !== 'create-ui');
    const result = f.run({ STUDIO_TEST_MUTATE: mutation });
    expect(result.status).not.toBe(0);
    expect(readFileSync(join(f.work, 'source-manifest.json'), 'utf8')).not.toBe(readFileSync(join(f.work, 'source-after.json'), 'utf8'));
    expect(existsSync(join(f.repository, 'ui'))).toBe(mutation !== 'create-ui');
    if (mutation !== 'create-ui') expect(readFileSync(join(f.repository, 'ui/theme.json'), 'utf8')).toBe('{}\n');
  });

  it.each(['root link', 'nested link'])('rejects optional legacy ui %s without reading external source', kind => {
    const f = fixture(kind === 'nested link');
    if (kind === 'root link') symlinkSync(join(f.repository, 'ops'), join(f.repository, 'ui'));
    else symlinkSync(join(f.repository, 'ops/README.md'), join(f.repository, 'ui/external.md'));
    const result = f.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(kind === 'root link' ? 'Legacy ui source must be a real directory' : 'studio_source_symlink:ui/external.md');
    expect(existsSync(f.output)).toBe(false);
  });

  it.each(['packages', 'scripts', 'ops'])('keeps required source tree %s mandatory', tree => {
    const f = fixture();
    rmSync(join(f.repository, tree), { recursive: true });
    expect(f.run().status).not.toBe(0);
    expect(existsSync(f.output)).toBe(false);
  });

  it('rejects existing output and destinations inside the source or each other', () => {
    const f = fixture();
    mkdirSync(f.output);
    expect(f.run().status).toBe(64);
    rmSync(f.output, { recursive: true });
    expect(f.run({}, [join(f.repository, 'new-workspace'), f.output]).status).toBe(64);
    expect(f.run({}, [f.work, join(f.work, 'dist')]).status).toBe(64);
    expect(existsSync(f.work)).toBe(false);
  });
});
