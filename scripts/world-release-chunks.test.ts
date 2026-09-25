import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const HOOK = fileURLToPath(new URL('./world-release-chunks.sh', import.meta.url));
const ROUTINE = fileURLToPath(new URL('./world-release-routine.sh', import.meta.url));
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

/**
 * Runs the hook with a fake `node` and `npm` first on PATH. Each fake pipeline call logs
 * its arguments (and the confirmation it received) and exits with the next code from
 * `codes`; the fake `npm` logs the refresh and exits with `refreshCode`.
 */
async function runHook(env: Record<string, string>, codes: number[], refreshCode = 0) {
  const root = await mkdtemp(join(tmpdir(), 'orchard-chunks-hook-'));
  directories.push(root);
  const bin = join(root, 'bin');
  await mkdir(bin);
  await writeFile(join(root, 'codes'), codes.map(String).join('\n') + '\n');
  await writeFile(join(bin, 'node'), `#!/usr/bin/env bash
printf 'node %s | confirm=%s\\n' "$*" "\${WORLD_CHUNKS_PUBLISH_CONFIRM:-}" >> "${root}/calls"
code=$(head -n 1 "${root}/codes"); sed -i 1d "${root}/codes"
exit "\${code:-99}"
`);
  await writeFile(join(bin, 'npm'), `#!/usr/bin/env bash
printf 'npm %s | tokens=%s\\n' "$*" "\${WORLD_REJOIN_TOKENS_FILE:-}" >> "${root}/calls"
exit ${refreshCode}
`);
  await chmod(join(bin, 'node'), 0o755);
  await chmod(join(bin, 'npm'), 0o755);
  const evidence = join(root, 'evidence', 'chunks');
  await mkdir(join(root, 'evidence'));
  const result = spawnSync('bash', [HOOK, evidence], {
    cwd: root, encoding: 'utf8',
    env: { PATH: `${bin}:${process.env['PATH']}`, HOME: root, ...env },
  });
  const calls = await readFile(join(root, 'calls'), 'utf8').then(text => text.trim().split('\n'), () => [] as string[]);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls, pipeline: calls.filter(call => call.startsWith('node ')) };
}

const TARGET = {
  WORLD_CHUNKS_HOST: 'http://127.0.0.1:3470', WORLD_CHUNKS_DATABASE: 'orchard-chunk-soak-local01',
  WORLD_CHUNKS_ORIGIN: 'http://127.0.0.1:5199', WORLD_CHUNKS_TOKEN_FILE: '/private/token', ORCHARD_WORLD_CHUNK_DIR: '/data/world-chunks',
};
const STALE = 3;

describe('release routine chunk hook', () => {
  it('does nothing unless WORLD_RELEASE_CHUNKS is set', async () => {
    for (const env of [TARGET, { ...TARGET, WORLD_RELEASE_CHUNKS: 'off' }, {}]) {
      const run = await runHook(env, [0, 0, 0]);
      expect(run.status).toBe(0);
      expect(run.stdout).toContain('skipped');
      expect(run.calls).toEqual([]);
    }
    const invalid = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'yes' }, [0]);
    expect(invalid.status).toBe(64);
    expect(invalid.calls).toEqual([]);
  });

  it('check mode only reads: fresh passes, stale fails the check, an error is an error', async () => {
    const fresh = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'check' }, [0]);
    expect(fresh.status).toBe(0);
    expect(fresh.pipeline).toHaveLength(1);
    expect(fresh.pipeline[0]).toMatch(/^node --import tsx scripts\/world-chunks-publish\.ts check --host http:\/\/127\.0\.0\.1:3470 --database orchard-chunk-soak-local01 --origin http:\/\/127\.0\.0\.1:5199 --report \/.*\/check-before\.json /u);
    const stale = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'check' }, [STALE]);
    expect(stale.status).toBe(STALE);
    expect(stale.pipeline).toHaveLength(1);
    expect(stale.stderr).toContain('stale');
    for (const code of [1, 70]) {
      const broken = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'check' }, [code]);
      expect(broken.status).toBe(code);
      expect(broken.stderr).toContain('the check itself failed');
    }
  });

  it('publish mode publishes only when the heads are stale, with the reviewed confirmation, then re-checks', async () => {
    const unchanged = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'publish' }, [0]);
    expect(unchanged.status).toBe(0);
    expect(unchanged.pipeline).toHaveLength(1);

    const confirm = `publish:${'a'.repeat(64)}:93a4eada:orchard-chunk-soak-local01`;
    const changed = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'publish', WORLD_RELEASE_CHUNKS_CONFIRM: confirm }, [STALE, 0, 0]);
    expect(changed.status).toBe(0);
    expect(changed.pipeline).toHaveLength(3);
    expect(changed.pipeline[0]).toContain(' check ');
    expect(changed.pipeline[0]).not.toContain(confirm);
    expect(changed.pipeline[1]).toContain(' publish --chunk-dir /data/world-chunks ');
    expect(changed.pipeline[1]).toContain('/publish.json');
    expect(changed.pipeline[1]).toContain(`confirm=${confirm}`);
    expect(changed.pipeline[2]).toContain('/check-after.json');

    // A check that errors (connect, subscription, timeout, origin) never leads to a publish.
    for (const code of [1, 70, 75]) {
      const broken = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'publish', WORLD_RELEASE_CHUNKS_CONFIRM: confirm }, [code, 0, 0]);
      expect(broken.status).toBe(code);
      expect(broken.pipeline).toHaveLength(1);
    }
    // No confirmation yet (the usual first run): 77, with the value recorded in publish.json.
    const refused = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'publish' }, [STALE, 77]);
    expect(refused.status).toBe(77);
    expect(refused.pipeline).toHaveLength(2);
    expect(refused.stderr).toContain('publish.json (confirmation)');
    // Published but still stale afterwards: fail.
    const stillStale = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'publish', WORLD_RELEASE_CHUNKS_CONFIRM: confirm }, [STALE, 0, STALE]);
    expect(stillStale.status).toBe(STALE);

    const noDirectory = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'publish', ORCHARD_WORLD_CHUNK_DIR: '' }, [STALE, 0, 0]);
    expect(noDirectory.status).toBe(64);
    expect(noDirectory.calls).toEqual([]);
  });

  it('refreshes the token through the rejoin path before every pipeline run when asked', async () => {
    const confirm = `publish:${'a'.repeat(64)}:93a4eada:orchard-chunk-soak-local01`;
    const run = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'publish', WORLD_RELEASE_CHUNKS_CONFIRM: confirm, WORLD_CHUNKS_REFRESH: 'rejoin' }, [STALE, 0, 0]);
    expect(run.status).toBe(0);
    expect(run.calls.map(call => call.split(' ')[0])).toEqual(['npm', 'node', 'npm', 'node', 'npm', 'node']);
    expect(run.calls[0]).toBe('npm run --silent world:rejoin-smoke -- refresh | tokens=/private/token');
    const failed = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'check', WORLD_CHUNKS_REFRESH: 'rejoin' }, [0], 1);
    expect(failed.status).toBe(70);
    expect(failed.pipeline).toEqual([]);
    const none = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'check' }, [0]);
    expect(none.calls.some(call => call.startsWith('npm '))).toBe(false);
    expect((await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'check', WORLD_CHUNKS_REFRESH: 'yes' }, [0])).status).toBe(64);
  });

  it('is wired into the routine after the content CAS and deployment, behind a flag that defaults off', async () => {
    const source = await readFile(ROUTINE, 'utf8');
    expect(spawnSync('bash', ['-n', ROUTINE]).status).toBe(0);
    expect(spawnSync('bash', ['-n', HOOK]).status).toBe(0);
    expect(source).toContain('chunks_mode=${WORLD_RELEASE_CHUNKS:-off}');
    const validate = source.indexOf('case "$chunks_mode" in');
    const firstWrite = source.indexOf('install -d -m 0700 "$evidence"');
    const apply = source.indexOf('world:content-head -- apply');
    const complete = source.indexOf('complete=true');
    const gate = source.indexOf('if [[ "$chunks_mode" != off ]]; then');
    const pending = source.indexOf("printf 'deployed-chunk-publish-pending\\n' > \"$evidence/status\"");
    const hook = source.indexOf('bash scripts/world-release-chunks.sh "$evidence/chunks"');
    const stale = source.indexOf("printf 'deployed-chunk-heads-stale\\n' > \"$evidence/status\"");
    const deployed = source.indexOf("printf 'deployed\\n' > \"$evidence/status\"");
    expect(validate).toBeGreaterThan(0);
    expect(validate).toBeLessThan(firstWrite);
    expect(apply).toBeLessThan(complete);
    expect(complete).toBeLessThan(gate);
    // pending before the hook, then deployed or deployed-chunk-heads-stale after it.
    expect(gate).toBeLessThan(pending);
    expect(pending).toBeLessThan(hook);
    expect(hook).toBeLessThan(stale);
    expect(stale).toBeLessThan(deployed);
    expect(source.match(/printf 'deployed\\n'/gu)).toHaveLength(1);
    expect(source.match(/world-release-chunks\.sh/gu)).toHaveLength(1);
    expect(source.slice(gate, hook)).toContain('WORLD_CHUNKS_REFRESH=rejoin');
    expect(source.slice(hook)).not.toMatch(/systemctl (stop|restart)/u);
  });
});
