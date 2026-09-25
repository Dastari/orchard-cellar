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
 * Runs the hook with a fake `node` first on PATH. Each fake call logs its arguments (and
 * the confirmation it received) and exits with the next code from `codes`.
 */
async function runHook(env: Record<string, string>, codes: number[]) {
  const root = await mkdtemp(join(tmpdir(), 'orchard-chunks-hook-'));
  directories.push(root);
  const bin = join(root, 'bin');
  await mkdir(bin);
  await writeFile(join(root, 'codes'), codes.map(String).join('\n') + '\n');
  await writeFile(join(bin, 'node'), `#!/usr/bin/env bash
printf '%s | confirm=%s\\n' "$*" "\${WORLD_CHUNKS_PUBLISH_CONFIRM:-}" >> "${root}/calls"
code=$(head -n 1 "${root}/codes"); sed -i 1d "${root}/codes"
exit "\${code:-99}"
`);
  await chmod(join(bin, 'node'), 0o755);
  const evidence = join(root, 'evidence', 'chunks');
  await mkdir(join(root, 'evidence'));
  const result = spawnSync('bash', [HOOK, evidence], {
    cwd: root, encoding: 'utf8',
    env: { PATH: `${bin}:${process.env['PATH']}`, HOME: root, ...env },
  });
  const calls = await readFile(join(root, 'calls'), 'utf8').then(text => text.trim().split('\n'), () => [] as string[]);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls };
}

const TARGET = {
  WORLD_CHUNKS_HOST: 'http://127.0.0.1:3470', WORLD_CHUNKS_DATABASE: 'orchard-chunk-soak-local01',
  WORLD_CHUNKS_ORIGIN: 'http://127.0.0.1:5199', WORLD_CHUNKS_TOKEN_FILE: '/private/token', ORCHARD_WORLD_CHUNK_DIR: '/data/world-chunks',
};

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

  it('check mode only reads: fresh passes, stale fails the check and publishes nothing', async () => {
    const fresh = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'check' }, [0]);
    expect(fresh.status).toBe(0);
    expect(fresh.calls).toHaveLength(1);
    expect(fresh.calls[0]).toMatch(/^--import tsx scripts\/world-chunks-publish\.ts check --host http:\/\/127\.0\.0\.1:3470 --database orchard-chunk-soak-local01 --origin http:\/\/127\.0\.0\.1:5199 --report \//u);
    const stale = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'check' }, [1]);
    expect(stale.status).toBe(1);
    expect(stale.calls).toHaveLength(1);
    expect(stale.stderr).toContain('stale');
    const broken = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'check' }, [70]);
    expect(broken.status).toBe(70);
  });

  it('publish mode publishes only when the heads are stale, with the reviewed confirmation, then re-checks', async () => {
    const unchanged = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'publish' }, [0]);
    expect(unchanged.status).toBe(0);
    expect(unchanged.calls).toHaveLength(1);

    const confirm = `publish:${'a'.repeat(64)}:orchard-chunk-soak-local01`;
    const changed = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'publish', WORLD_RELEASE_CHUNKS_CONFIRM: confirm }, [1, 0, 0]);
    expect(changed.status).toBe(0);
    expect(changed.calls).toHaveLength(3);
    expect(changed.calls[0]).toContain(' check ');
    expect(changed.calls[0]).toContain('confirm=');
    expect(changed.calls[0]).not.toContain(confirm);
    expect(changed.calls[1]).toContain(' publish ');
    expect(changed.calls[1]).toContain('--chunk-dir /data/world-chunks');
    expect(changed.calls[1]).toContain(`confirm=${confirm}`);
    expect(changed.calls[2]).toContain(' check ');

    // A refused publication (for example a missing confirmation) fails the hook without a re-check.
    const refused = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'publish' }, [1, 77]);
    expect(refused.status).toBe(77);
    expect(refused.calls).toHaveLength(2);
    // Published but still stale afterwards: fail.
    const stillStale = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'publish', WORLD_RELEASE_CHUNKS_CONFIRM: confirm }, [1, 0, 1]);
    expect(stillStale.status).toBe(1);

    const noDirectory = await runHook({ ...TARGET, WORLD_RELEASE_CHUNKS: 'publish', ORCHARD_WORLD_CHUNK_DIR: '' }, [1, 0, 0]);
    expect(noDirectory.status).toBe(64);
    expect(noDirectory.calls).toEqual([]);
  });

  it('is wired into the routine after the content CAS and deployment, behind a flag that defaults off', async () => {
    const source = await readFile(ROUTINE, 'utf8');
    expect(spawnSync('bash', ['-n', ROUTINE]).status).toBe(0);
    expect(spawnSync('bash', ['-n', HOOK]).status).toBe(0);
    expect(source).toContain('chunks_mode=${WORLD_RELEASE_CHUNKS:-off}');
    const validate = source.indexOf('case "$chunks_mode" in');
    const firstWrite = source.indexOf('install -d -m 0700 "$evidence"');
    const apply = source.indexOf('world:content-head -- apply');
    const deployed = source.indexOf("printf 'deployed\\n' > \"$evidence/status\"");
    const gate = source.indexOf('if [[ "$chunks_mode" != off ]]; then');
    const hook = source.indexOf('bash scripts/world-release-chunks.sh "$evidence/chunks"');
    expect(validate).toBeGreaterThan(0);
    expect(validate).toBeLessThan(firstWrite);
    expect(apply).toBeLessThan(deployed);
    expect(source.indexOf('complete=true')).toBeLessThan(gate);
    expect(deployed).toBeLessThan(gate);
    expect(gate).toBeLessThan(hook);
    expect(source.match(/world-release-chunks\.sh/gu)).toHaveLength(1);
    // A chunk failure keeps the deployment (players are unaffected) and only fails the check.
    expect(source).toContain("printf 'deployed-chunk-heads-stale\\n' > \"$evidence/status\"");
    expect(source.slice(hook)).not.toMatch(/systemctl (stop|restart)/u);
  });
});
