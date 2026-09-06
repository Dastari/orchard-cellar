import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = new URL('../../..', import.meta.url);

function write(root: string, relativePath: string, contents = relativePath): string {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return path;
}

function makeRepositoryFixture(root: string): void {
  write(root, 'package.json', '{}\n');
  write(root, 'package-lock.json', '{}\n');
  write(root, 'tsconfig.base.json', '{}\n');
  write(root, 'scripts/spacetime-build-checked.sh', '#!/bin/sh\n');
  write(root, 'spacetime.json', '{}\n');
  write(root, 'spacetime.local.json', '{}\n');
  write(root, 'packages/assets/content/items.json', '[]\n');
  write(root, 'packages/world/package.json', '{}\n');
  write(root, 'packages/world/tsconfig.json', '{}\n');
  write(root, 'packages/world/src/index.ts', 'export const world = true;\n');
  const bundle = write(root, 'packages/world/dist/bundle.js', 'world-build\n');
  linkSync(bundle, join(root, 'packages/world/dist/bundle-copy.js'));
  write(root, 'packages/sim/package.json', '{}\n');
  write(root, 'packages/sim/tsconfig.json', '{}\n');
  write(root, 'packages/sim/src/index.ts', 'export const sim = true;\n');
  write(root, 'packages/lifecycle-authoring/package.json', '{}\n');
  write(root, 'packages/lifecycle-authoring/tsconfig.json', '{}\n');
  write(root, 'packages/lifecycle-authoring/src/index.ts', 'export const lifecycle = true;\n');
  write(root, 'packages/lifecycle-authoring/source/bootstrap.source.json', '{}\n');
  write(root, 'packages/lifecycle-authoring/generated/item-lifecycles.ts', 'export const generated = true;\n');
  write(root, 'scripts/lifecycle-code-build.ts', 'export {};\n');
  write(root, 'scripts/legacy-cooking-release-gate.ts', 'export {};\n');
  write(root, 'scripts/legacy-cooking-release-gate.test.ts', 'export {};\n');
  write(root, 'scripts/cooking-content-continuity.ts', 'export {};\n');
  write(root, 'scripts/cooking-content-continuity.test.ts', 'export {};\n');
  write(root, 'scripts/world-rejoin-snapshot.ts', 'export {};\n');
  write(root, 'scripts/lifecycle-artifact-integrity.ts', 'export {};\n');
  write(root, 'packages/client/dist/index.html', '<main>game</main>\n');
  write(root, 'packages/studio/dist/index.html', '<main>studio</main>\n');
  write(root, '.env.client-production.local', 'VITE_OIDC_CLIENT_SECRET=never-archive-this\n');
}

function makeUnitFixtures(root: string): Record<string, string> {
  return {
    ROLLBACK_WORLD_UNIT: write(root, 'units/orchard-world.service', '[Service]\nExecStart=/bin/true\n'),
    ROLLBACK_FRONTEND_UNIT: write(root, 'units/orchard-frontend.service', '[Service]\nExecStart=/bin/true\n'),
    ROLLBACK_STUDIO_UNIT: write(root, 'units/orchard-studio.service', '[Service]\nExecStart=/bin/true\n'),
  };
}

function packageFixture(directory: string): string {
  mkdirSync(directory, { recursive: true });
  const repository = join(directory, 'repository');
  makeRepositoryFixture(repository);
  const units = makeUnitFixtures(directory);
  const archive = join(directory, 'rollback-artifacts.tar.gz');
  const result = spawnSync(
    'bash',
    ['ops/orchard-runtime/bin/package-rollback-artifacts.sh', archive],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, ORCHARD_ROLLBACK_REPOSITORY: repository, ...units },
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return archive;
}

describe('rollback artifact packaging', () => {
  it('captures exact builds, source, and units as checksumed regular files without local secrets', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-rollback-package-'));
    try {
      const archive = packageFixture(directory);
      expect(lstatSync(archive).mode & 0o777).toBe(0o600);
      const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
      expect(listing.status, listing.stderr).toBe(0);
      expect(listing.stdout).toContain('rollback-artifacts/repository/packages/world/dist/bundle.js');
      expect(listing.stdout).toContain('rollback-artifacts/repository/packages/assets/content/items.json');
      expect(listing.stdout).toContain('rollback-artifacts/repository/packages/client/dist/index.html');
      expect(listing.stdout).toContain('rollback-artifacts/repository/packages/studio/dist/index.html');
      expect(listing.stdout).toContain('rollback-artifacts/service-units/orchard-world.service/fragment.service');
      expect(listing.stdout).not.toContain('.env.client-production.local');

      const verbose = spawnSync('tar', ['-tvzf', archive], { encoding: 'utf8' });
      expect(verbose.status, verbose.stderr).toBe(0);
      for (const line of verbose.stdout.trim().split('\n')) {
        expect(['d', '-']).toContain(line[0]);
      }

      const extracted = join(directory, 'extracted');
      mkdirSync(extracted);
      const unpack = spawnSync('tar', ['-C', extracted, '-xzf', archive], { encoding: 'utf8' });
      expect(unpack.status, unpack.stderr).toBe(0);
      const root = join(extracted, 'rollback-artifacts');
      const verify = spawnSync('sha256sum', ['-c', 'FILE-SHA256SUMS'], { cwd: root, encoding: 'utf8' });
      expect(verify.status, verify.stderr).toBe(0);
      expect(lstatSync(join(root, 'repository/packages/world/dist/bundle.js')).nlink).toBe(1);
      expect(lstatSync(join(root, 'repository/packages/world/dist/bundle-copy.js')).nlink).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses a symbolic link rather than following it out of the build tree', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-rollback-link-'));
    try {
      const repository = join(directory, 'repository');
      makeRepositoryFixture(repository);
      symlinkSync('/etc/passwd', join(repository, 'packages/client/dist/outside'));
      const units = makeUnitFixtures(directory);
      const result = spawnSync(
        'bash',
        ['ops/orchard-runtime/bin/package-rollback-artifacts.sh', join(directory, 'rollback.tar.gz')],
        {
          cwd: projectRoot,
          encoding: 'utf8',
          env: { ...process.env, ORCHARD_ROLLBACK_REPOSITORY: repository, ...units },
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('contains a symbolic link');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses inline credentials in installed unit policy', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-rollback-secret-'));
    try {
      const repository = join(directory, 'repository');
      makeRepositoryFixture(repository);
      const units = makeUnitFixtures(directory);
      writeFileSync(units.ROLLBACK_WORLD_UNIT!, '[Service]\nEnvironment=API_TOKEN=do-not-archive\n');
      const archive = join(directory, 'rollback.tar.gz');
      const result = spawnSync(
        'bash',
        ['ops/orchard-runtime/bin/package-rollback-artifacts.sh', archive],
        {
          cwd: projectRoot,
          encoding: 'utf8',
          env: { ...process.env, ORCHARD_ROLLBACK_REPOSITORY: repository, ...units },
        },
      );
      expect(result.status).toBe(77);
      expect(result.stderr).toContain('inline service credential');
      expect(() => lstatSync(archive)).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('versioned restore bundle validation', () => {
  it('dry-runs a complete bundle and fails closed after artifact tampering', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-rollback-restore-'));
    try {
      const backup = join(directory, 'backup');
      const data = join(directory, 'data');
      mkdirSync(backup);
      const programContents = Buffer.from('deployed-world-program');
      const programDigest = createHash('sha256').update(programContents).digest('hex');
      // SpaceTimeDB's program-store key is not the file's SHA-256 digest. The
      // independent inventory checksum must still validate the exact bytes.
      const programStoreKey = 'a'.repeat(64);
      write(data, `.spacetime-data/program-bytes/${programStoreKey.slice(0, 2)}/${programStoreKey.slice(2)}`, programContents.toString());
      const worldArchive = join(backup, 'spacetime-data.tar.gz');
      const worldTar = spawnSync('tar', ['--hard-dereference', '-C', data, '-czf', worldArchive, '.spacetime-data'], { encoding: 'utf8' });
      expect(worldTar.status, worldTar.stderr).toBe(0);
      const worldDigest = createHash('sha256').update(readFileSync(worldArchive)).digest('hex');
      writeFileSync(join(backup, 'SHA256SUMS'), `${worldDigest}  spacetime-data.tar.gz\n`);

      const packaged = packageFixture(join(directory, 'packaging'));
      const rollbackArchive = join(backup, 'rollback-artifacts.tar.gz');
      writeFileSync(rollbackArchive, readFileSync(packaged));
      const inventory = `${programDigest}  program-bytes/${programStoreKey.slice(0, 2)}/${programStoreKey.slice(2)}\n`;
      writeFileSync(join(backup, 'DEPLOYED-PROGRAMS.sha256'), inventory);
      const rollbackDigest = createHash('sha256').update(readFileSync(rollbackArchive)).digest('hex');
      const inventoryDigest = createHash('sha256').update(inventory).digest('hex');
      writeFileSync(join(backup, 'ROLLBACK-SHA256SUMS'), [
        `${rollbackDigest}  rollback-artifacts.tar.gz`,
        `${inventoryDigest}  DEPLOYED-PROGRAMS.sha256`,
        '',
      ].join('\n'));
      writeFileSync(join(backup, 'MANIFEST'), 'database=orchard-cellar-world\nrollback_bundle_version=1\n');
      const token = write(directory, 'tokens.json', '{"operator":"not-printed"}\n');
      chmodSync(token, 0o600);

      const run = () => spawnSync(
        'bash',
        ['ops/orchard-runtime/bin/restore-world-rehearsal.sh', backup,
          join(directory, 'new-pre-drain.json'), join(directory, 'new-post-drain.json')],
        {
          cwd: projectRoot,
          encoding: 'utf8',
          env: { ...process.env, WORLD_REJOIN_TOKENS_FILE: token, WORLD_RESTORE_REHEARSAL_DRY_RUN: 'true' },
        },
      );
      const valid = run();
      expect(valid.status, valid.stderr).toBe(0);
      expect(valid.stdout).toContain('rollback artifacts');
      expect(`${valid.stdout}${valid.stderr}`).not.toContain('not-printed');

      const restoreSource = readFileSync(new URL('../../../ops/orchard-runtime/bin/restore-world-rehearsal.sh', import.meta.url), 'utf8');
      expect(restoreSource).toContain('repository/packages/assets/content/items.json');
      expect(restoreSource).toContain('inventory does not exactly cover the restored program store');
      expect(restoreSource).toContain('openssl dgst -keccak-256');

      writeFileSync(rollbackArchive, Buffer.concat([readFileSync(rollbackArchive), Buffer.from('tampered')]));
      const tampered = run();
      expect(tampered.status).not.toBe(0);
      expect(`${tampered.stdout}${tampered.stderr}`).toMatch(/FAILED|did NOT match/u);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
