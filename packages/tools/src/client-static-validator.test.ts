import { createHash } from 'node:crypto';
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

  describe('optional world chunk check', () => {
    /** Minimal chunk envelope: OCCHNK magic, sha256(bytes[40:]) at 8..40. */
    function chunkBytes(seed: string): { bytes: Buffer; hash: string } {
      const bytes = Buffer.alloc(44 + seed.length);
      Buffer.from([79, 67, 67, 72, 78, 75, 1, 0]).copy(bytes);
      bytes.writeUInt32LE(seed.length, 40);
      bytes.write(seed, 44);
      const digest = createHash('sha256').update(bytes.subarray(40)).digest();
      digest.copy(bytes, 8);
      return { bytes, hash: digest.toString('hex') };
    }

    function worldFixture(options: { spaFallback?: boolean; tamper?: boolean } = {}): { root: string; heads: string; env: NodeJS.ProcessEnv } {
      const root = fixture();
      const bin = join(root, 'bin');
      const world = join(root, 'world');
      const publicHtml = join(root, 'public.html');
      mkdirSync(bin);
      mkdirSync(join(world, '1'), { recursive: true });
      writeFileSync(publicHtml, validHtml);
      const lines = ['# space hash bytes'];
      for (const seed of ['{"cx":0}', '{"cx":1}']) {
        const chunk = chunkBytes(seed);
        if (options.tamper && seed.endsWith('1}')) chunk.bytes[chunk.bytes.length - 1] ^= 1;
        writeFileSync(join(world, '1', `${chunk.hash}.bin`), chunk.bytes);
        lines.push(`1 ${chunk.hash} ${chunk.bytes.length}`);
      }
      const heads = join(root, 'heads.txt');
      writeFileSync(heads, `${lines.join('\n')}\n\n`);
      const mockCurl = join(bin, 'curl');
      writeFileSync(mockCurl, `#!/usr/bin/env bash
set -euo pipefail
headers=/dev/null
output=/dev/null
url=
fail=false
while (($#)); do
  case "$1" in
    -D) headers=$2; shift 2 ;;
    -o) output=$2; shift 2 ;;
    -f*) fail=true; shift ;;
    -*) shift ;;
    *) url=$1; shift ;;
  esac
done
if [[ "$url" = */v1/ping ]]; then printf 'pong'; exit 0; fi
if [[ "$url" =~ /world/([0-9]+)/([a-f0-9]{64})[.]bin$ ]]; then
  file="$MOCK_WORLD/\${BASH_REMATCH[1]}/\${BASH_REMATCH[2]}.bin"
  if [[ -f "$file" ]]; then
    printf 'HTTP/2 200\\r\\ncontent-type: application/octet-stream\\r\\ncache-control: public, max-age=31536000, immutable\\r\\ncontent-encoding: br\\r\\n\\r\\n' > "$headers"
    cp "$file" "$output"; exit 0
  fi
  if [[ "\${MOCK_SPA_FALLBACK:-0}" = 1 ]]; then
    printf 'HTTP/2 200\\r\\ncontent-type: text/html\\r\\n\\r\\n' > "$headers"; cp "$MOCK_PUBLIC_HTML" "$output"; exit 0
  fi
  printf 'HTTP/2 404\\r\\ncache-control: no-store\\r\\n\\r\\n' > "$headers"
  if [[ "$fail" = true ]]; then exit 22; fi
  exit 0
fi
printf 'HTTP/2 200\\ncontent-type: text/html; charset=utf-8\\n\\n' > "$headers"
cp "$MOCK_PUBLIC_HTML" "$output"
`);
      chmodSync(mockCurl, 0o755);
      return {
        root,
        heads,
        env: {
          CLIENT_STATIC_DRY_RUN: 'false',
          CLIENT_VALIDATE_ORIGIN: 'https://orchard.dastari.net',
          CLIENT_VALIDATE_WORLD_CHUNKS: '1',
          CLIENT_VALIDATE_WORLD_CHUNK_HEADS: heads,
          MOCK_PUBLIC_HTML: publicHtml,
          MOCK_WORLD: world,
          MOCK_SPA_FALLBACK: options.spaFallback ? '1' : '0',
          PATH: `${bin}:${process.env.PATH ?? ''}`,
        },
      };
    }

    it('stays off unless explicitly enabled', () => {
      const { root, env } = worldFixture();
      const result = validate(root, { ...env, CLIENT_VALIDATE_WORLD_CHUNKS: undefined });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).not.toContain('World chunk');
    });

    it('rejects an unknown switch value or a missing heads file', () => {
      expect(validate(fixture(), { CLIENT_VALIDATE_WORLD_CHUNKS: 'yes' }).status).toBe(64);
      const missing = validate(fixture(), { CLIENT_VALIDATE_WORLD_CHUNKS: '1' });
      expect(missing.status).toBe(64);
      expect(missing.stderr).toContain('CLIENT_VALIDATE_WORLD_CHUNK_HEADS');
      expect(validate(fixture(), { CLIENT_VALIDATE_WORLD_CHUNKS: '1', CLIENT_VALIDATE_WORLD_CHUNK_HEADS: 'heads.txt' }).status).toBe(64);
    });

    it.each([
      `1 ${'a'.repeat(63)} 10`, `01 ${'a'.repeat(64)} 10`, `1 ${'A'.repeat(64)} 10`, `1 ${'a'.repeat(64)} 0`,
      `1 ${'a'.repeat(64)} 1048577`, `1 ${'a'.repeat(64)}`, `1 ../${'a'.repeat(61)} 10`,
    ])('rejects an invalid heads line: %s', (line) => {
      const root = fixture();
      const heads = join(root, 'heads.txt');
      writeFileSync(heads, `${line}\n`);
      const result = validate(root, { CLIENT_VALIDATE_WORLD_CHUNKS: '1', CLIENT_VALIDATE_WORLD_CHUNK_HEADS: heads });
      expect(result.status).toBe(65);
      expect(result.stderr).toContain('invalid line');
    });

    it('parses the heads file during a dry run', () => {
      const { root, heads } = worldFixture();
      const result = validate(root, { CLIENT_VALIDATE_WORLD_CHUNKS: '1', CLIENT_VALIDATE_WORLD_CHUNK_HEADS: heads });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('parsed (2 heads)');
    });

    it('verifies every head is served, immutable and hash-exact, and that misses are 404', () => {
      const { root, env } = worldFixture();
      const result = validate(root, env);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('World chunk validation passed: 2 heads served and verified (encodings: br=2)');
    });

    it('rejects a served blob whose bytes do not match its address', () => {
      const { root, env } = worldFixture({ tamper: true });
      const result = validate(root, env);
      expect(result.status).toBe(69);
      expect(result.stderr).toContain('do not match its content hash');
    });

    it('rejects an unpublished head', () => {
      const { root, env, heads } = worldFixture();
      writeFileSync(heads, `1 ${'f'.repeat(64)} 100\n`);
      const result = validate(root, env);
      expect(result.status).toBe(69);
      expect(result.stderr).toContain('is not served');
    });

    it('rejects an SPA fallback for a missing blob', () => {
      const { root, env } = worldFixture({ spaFallback: true });
      const result = validate(root, env);
      expect(result.status).toBe(69);
      expect(result.stderr).toContain('not answered with 404');
    });
  });
});
