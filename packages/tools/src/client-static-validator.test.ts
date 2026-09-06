import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../../..');
const validator = join(projectRoot, 'ops/orchard-runtime/bin/validate-client-static.sh');
const fixtures: string[] = [];

const validHtml = '<!doctype html><script type="module" crossorigin src="/assets/index-abc123.js"></script>\n';

function fixture(html = validHtml): string {
  const root = mkdtempSync(join(tmpdir(), 'orchard-client-static-'));
  fixtures.push(root);
  const dist = join(root, 'packages/client/dist');
  const unitDirectory = join(root, 'ops/orchard-runtime/systemd');
  mkdirSync(dist, { recursive: true });
  mkdirSync(unitDirectory, { recursive: true });
  writeFileSync(join(dist, 'index.html'), html);
  writeFileSync(join(unitDirectory, 'orchard-frontend.service'), [
    `[Unit]`,
    `ConditionPathExists=${root}/packages/client/dist/index.html`,
    `[Service]`,
    `ExecStart=npm run preview -w @orchard/client -- --host 10.0.1.150 --port 5173 --strictPort`,
    '',
  ].join('\n'));
  return root;
}

function validate(root: string, extra: NodeJS.ProcessEnv = {}): SpawnSyncReturns<string> {
  return spawnSync('bash', [validator], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CLIENT_STATIC_REPOSITORY: root,
      CLIENT_STATIC_DRY_RUN: 'true',
      ...extra,
    },
  });
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('game static deployment validator', () => {
  it('accepts a hashed build artifact and static preview unit', () => {
    const result = validate(fixture());
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Game static dry-run passed');
  });

  it.each([
    '<script type="module" src="/@vite/client"></script>',
    '<script type="module" src="/src/main.ts"></script>',
    '<script type="module" src="/@fs/project/packages/client/src/main.ts"></script>',
    '<script type="module" src="/assets/main.ts"></script>',
  ])('rejects a development or source-module marker: %s', (marker) => {
    const result = validate(fixture(`${validHtml}${marker}\n`));
    expect(result.status).toBe(65);
    expect(result.stderr).toContain('Vite development or source-module path');
  });

  it('rejects an installed service definition that starts Vite development mode', () => {
    const root = fixture();
    writeFileSync(join(root, 'ops/orchard-runtime/systemd/orchard-frontend.service'), [
      `ConditionPathExists=${root}/packages/client/dist/index.html`,
      'ExecStart=npm run preview -w @orchard/client',
      'ExecStartPost=npm run dev -w @orchard/client',
      '',
    ].join('\n'));
    const result = validate(root);
    expect(result.status).toBe(65);
    expect(result.stderr).toContain('must never serve source');
  });

  it('requires the exact canonical HTTPS public origin before making a request', () => {
    const result = validate(fixture(), {
      CLIENT_STATIC_DRY_RUN: 'false',
      CLIENT_VALIDATE_ORIGIN: 'http://orchard.dastari.net',
    });
    expect(result.status).toBe(64);
    expect(result.stderr).toContain('canonical HTTPS game origin');
  });

  it('checks the public HTML and same-origin SpaceTimeDB health route', () => {
    const root = fixture();
    const bin = join(root, 'bin');
    const publicHtml = join(root, 'public.html');
    mkdirSync(bin);
    writeFileSync(publicHtml, validHtml);
    const mockCurl = join(bin, 'curl');
    writeFileSync(mockCurl, `#!/usr/bin/env bash
set -euo pipefail
headers=
output=
url=
while (($#)); do
  case "$1" in
    -D) headers=$2; shift 2 ;;
    -o) output=$2; shift 2 ;;
    -*) shift ;;
    *) url=$1; shift ;;
  esac
done
if [[ "$url" = */v1/ping ]]; then printf 'pong'; exit 0; fi
printf 'HTTP/2 200\\ncontent-type: text/html; charset=utf-8\\n\\n' > "$headers"
cp "$MOCK_PUBLIC_HTML" "$output"
`);
    chmodSync(mockCurl, 0o755);
    const result = validate(root, {
      CLIENT_STATIC_DRY_RUN: 'false',
      CLIENT_VALIDATE_ORIGIN: 'https://orchard.dastari.net',
      MOCK_PUBLIC_HTML: publicHtml,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('canonical public route validation passed');
  });
});
