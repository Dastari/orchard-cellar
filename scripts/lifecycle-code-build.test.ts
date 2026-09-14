import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lifecycleBundleSha256, parseLifecycleSourceBundle } from '../packages/lifecycle-authoring/src/index.js';

const repository = resolve(import.meta.dirname, '..');
const directories: string[] = [];
function fixture(source = 'context.item.consume();') {
  const directory = mkdtempSync(join(tmpdir(), 'orchard-lifecycle-cli-'));
  directories.push(directory);
  const bundle = parseLifecycleSourceBundle({
    format: 'orchard-lifecycle-source-v1', bundleId: 'cli-fixture', revision: 1, engineApiVersion: 1,
    handlers: [{ itemId: 'item:apple', id: 'item.apple.on_use', event: 'onUse', prompt: 'EAT', source }],
  });
  const digest = lifecycleBundleSha256(bundle);
  const sourcePath = join(directory, 'source.json');
  const output = join(directory, 'generated');
  writeFileSync(sourcePath, JSON.stringify(bundle), { mode: 0o600 });
  return { sourcePath, output, digest };
}
function run(...args: readonly string[]) {
  return spawnSync(join(repository, 'node_modules/.bin/tsx'), ['scripts/lifecycle-code-build.ts', ...args], {
    cwd: repository, encoding: 'utf8', timeout: 20_000,
  });
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('lifecycle compiler CLI validation boundaries', () => {
  it('verifies source without materializing artifacts', () => {
    const input = fixture();
    const verify = run('verify', input.sourcePath);
    expect(verify.status, verify.stderr).toBe(0);
    expect(verify.stdout.trim()).toBe(input.digest);
    expect(existsSync(input.output)).toBe(false);
  });

  it('rejects AST violations before any generated output exists', () => {
    const forbidden = fixture('while (true) { context.item.consume(); }');
    for (const operation of ['verify', 'build']) {
      const args = operation === 'build' ? [forbidden.output] : [];
      const result = run(operation, forbidden.sourcePath, ...args);
      expect(result.status).toBe(65);
      expect(result.stderr).toContain('unbounded loops');
      expect(existsSync(forbidden.output)).toBe(false);
    }
  });

  it('compiles deterministic artifacts containing only source provenance', () => {
    const input = fixture();
    const build = run('build', input.sourcePath, input.output);
    expect(build.status, build.stderr).toBe(0);
    expect(build.stdout.trim()).toBe(input.digest);
    expect(JSON.parse(readFileSync(join(input.output, 'build-provenance.json'), 'utf8')))
      .toEqual({ format: 'orchard-lifecycle-build-provenance-v1', bundleId: 'cli-fixture',
        revision: 1, bundleSha256: input.digest, handlerCount: 1 });
    const metadata = JSON.parse(readFileSync(join(input.output, 'item-lifecycle-metadata.json'), 'utf8'));
    expect(metadata).toMatchObject({ bundleSha256: input.digest });
    expect(JSON.stringify(metadata)).not.toContain('context.item.consume');
  });
});
