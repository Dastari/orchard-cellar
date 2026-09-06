import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');

describe('guarded world release', () => {
  it('makes destructive publication impossible in production scripts', async () => {
    const [rootPackageText, worldPackage, release, finalize, checkedBuild] = await Promise.all([
      readFile(resolve(root, 'package.json'), 'utf8'),
      readFile(resolve(root, 'packages/world/package.json'), 'utf8'),
      readFile(resolve(root, 'scripts/world-release.sh'), 'utf8'),
      readFile(resolve(root, 'scripts/world-release-finalize.sh'), 'utf8'),
      readFile(resolve(root, 'scripts/spacetime-build-checked.sh'), 'utf8'),
    ]);
    const rootPackage = JSON.parse(rootPackageText) as {
      scripts: Record<string, string>;
    };
    const productionCommands = [
      rootPackage.scripts['world:dev'],
      rootPackage.scripts['world:procedural-publish'],
      rootPackage.scripts['world:release'],
      worldPackage,
      release,
    ].filter((source): source is string => source !== undefined);
    for (const source of productionCommands) {
      expect(source).not.toMatch(/--delete-data(?:\s|["'])/);
    }
    expect(rootPackage.scripts['world:release']).toBe('bash scripts/world-release.sh');
    expect((JSON.parse(worldPackage) as { scripts: Record<string, string> }).scripts['publish:local'])
      .toBe('npm --prefix ../.. run world:release');
    expect(worldPackage).not.toMatch(/spacetime\s+publish/u);
    expect(worldPackage).toContain('spacetime-build-checked.sh');
    expect(checkedBuild).toContain('Error: Uncaught');
    expect(checkedBuild).toContain('exit 1');
    expect(release).toContain('--delete-data=never');
    expect(release).toContain('npm run lifecycle:integrity');
    expect(release).not.toContain('--yes=all');
    expect(finalize).not.toContain('spacetime publish');
    expect(finalize).not.toMatch(/--delete-data(?:\s|["'])/u);
    expect(release.match(/npm run build --workspace @orchard\/client -- --mode client-production/gu))
      .toHaveLength(2);
    expect(release.match(/CLIENT_STATIC_DRY_RUN=true/gu)).toHaveLength(3);
    expect(release.match(/npm run build -w @orchard\/studio -- --mode studio-production/gu))
      .toHaveLength(2);
    expect(release.match(/STUDIO_STATIC_DRY_RUN=true/gu)).toHaveLength(3);
    expect(release).not.toContain('spacetime sql "$database"');
  });

  it('rehearses both stages, then stops production at placeable reads before traffic resumes', async () => {
    const release = await readFile(resolve(root, 'scripts/world-release.sh'), 'utf8');
    const backup = release.indexOf('backup-world.sh');
    const rehearsal = release.lastIndexOf('restore-world-rehearsal.sh');
    const publish = release.indexOf('spacetime publish "$database"');
    const migrate = release.indexOf('npm run world:chest-migrate');
    const verify = release.indexOf('world:rejoin-smoke -- verify');
    const installedUnit = release.indexOf('systemctl show orchard-frontend.service --property=FragmentPath --value');
    const installedUnitValidation = release.indexOf('CLIENT_STATIC_UNIT="$installed_frontend_unit"');
    const installedStudioUnitValidation = release.indexOf('STUDIO_STATIC_UNIT="$installed_studio_unit"');
    const resume = release.lastIndexOf('restore_traffic');
    const publicGameValidation = release.indexOf('CLIENT_VALIDATE_ORIGIN=https://orchard.dastari.net');
    const publicStudioValidation = release.indexOf('STUDIO_VALIDATE_ORIGIN=https://cellar.dastari.net');
    const markRestored = release.lastIndexOf('traffic_stopped=false');
    expect(backup).toBeGreaterThan(0);
    expect(backup).toBeLessThan(rehearsal);
    expect(rehearsal).toBeLessThan(publish);
    expect(publish).toBeLessThan(migrate);
    expect(migrate).toBeLessThan(verify);
    expect(publish).toBeLessThan(verify);
    expect(verify).toBeLessThan(installedUnit);
    expect(installedUnit).toBeLessThan(installedUnitValidation);
    expect(installedUnitValidation).toBeLessThan(installedStudioUnitValidation);
    expect(installedUnitValidation).toBeLessThan(resume);
    expect(verify).toBeLessThan(resume);
    expect(resume).toBeLessThan(publicGameValidation);
    expect(publicGameValidation).toBeLessThan(publicStudioValidation);
    expect(publicStudioValidation).toBeLessThan(markRestored);
    expect(release.slice(backup, rehearsal)).not.toContain('world:rejoin-smoke -- capture');
    expect(release).toContain('CHEST_MIGRATION_STOP_AFTER=placeable_reads');
    expect(release).not.toContain('CHEST_MIGRATION_STOP_AFTER=drop_ready');
    expect(release).toContain('"$backup_directory" "$pre_drain_snapshot" "$post_drain_snapshot"');
  });

  it('pins the only production target and rejects target overrides before any gates', async () => {
    const release = await readFile(resolve(root, 'scripts/world-release.sh'), 'utf8');
    expect(release).toContain('canonical_server=local');
    expect(release).toContain('canonical_database=orchard-cellar-world');
    expect(release).toContain('canonical_host=http://127.0.0.1:3000');
    expect(release).toContain('--server "$canonical_host"');
    expect(release).toContain('--yes=remote,migrate,break-clients \\\n  --no-config');

    const directory = await mkdtemp(resolve(tmpdir(), 'orchard-release-target-'));
    try {
      const token = resolve(directory, 'tokens.json');
      await writeFile(token, '{}\n', { mode: 0o600 });
      await chmod(token, 0o600);
      for (const override of [
        { SPACETIMEDB_SERVER: 'remote' },
        { SPACETIMEDB_DATABASE: 'another-world' },
        { SPACETIMEDB_HOST: 'http://127.0.0.1:3999' },
      ]) {
        const result = spawnSync('bash', ['scripts/world-release.sh'], {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            ...override,
            WORLD_RELEASE_DRY_RUN: 'true',
            WORLD_REJOIN_TOKENS_FILE: token,
            WORLD_RELEASE_BACKUP_DIRECTORY: resolve(directory, 'new-backup'),
            WORLD_RELEASE_PRE_DRAIN_SNAPSHOT: resolve(directory, 'new-pre-drain.json'),
            WORLD_RELEASE_POST_DRAIN_SNAPSHOT: resolve(directory, 'new-post-drain.json'),
            WORLD_RELEASE_PRODUCTION_PRE_DRAIN_SNAPSHOT: resolve(directory, 'new-production-pre-drain.json'),
          },
        });
        expect(result.status).toBe(64);
        expect(result.stderr).toContain('Production target must be');
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('pins source before downtime and verifies it immediately before every publish and migration', async () => {
    const [release, rehearsal] = await Promise.all([
      readFile(resolve(root, 'scripts/world-release.sh'), 'utf8'),
      readFile(resolve(root, 'ops/orchard-runtime/bin/restore-world-rehearsal.sh'), 'utf8'),
    ]);
    const studioPrebuild = release.indexOf('npm run build -w @orchard/studio -- --mode studio-production');
    const studioPrecheck = release.indexOf('STUDIO_STATIC_DRY_RUN=true');
    const sourcePin = release.indexOf('world-module-source-manifest.sh create');
    const trafficStop = release.indexOf('traffic_stopped=true');
    const lifecycleIntegrity = release.indexOf('npm run lifecycle:integrity');
    expect(studioPrebuild).toBeGreaterThan(0);
    expect(lifecycleIntegrity).toBeGreaterThan(0);
    expect(lifecycleIntegrity).toBeLessThan(sourcePin);
    expect(studioPrebuild).toBeLessThan(studioPrecheck);
    expect(release.indexOf('npm run content:validate')).toBeLessThan(sourcePin);
    expect(sourcePin).toBeLessThan(studioPrebuild);
    expect(sourcePin).toBeLessThan(trafficStop);
    expect(release).toContain('WORLD_MODULE_SOURCE_MANIFEST="$module_source_manifest"');
    expect(release).toContain('WORLD_BACKUP_LEAVE_STOPPED=true');
    expect(release).toContain('WORLD_ROLLBACK_ARTIFACTS_FILE="$rollback_artifacts"');
    expect(release.indexOf('package-rollback-artifacts.sh "$rollback_artifacts"')).toBeLessThan(
      release.indexOf('npm run build --workspace @orchard/client -- --mode client-production'),
    );
    expect(release.indexOf('WORLD_BACKUP_LEAVE_STOPPED=true')).toBeLessThan(
      release.lastIndexOf('restore-world-rehearsal.sh'),
    );
    expect(rehearsal.match(/world-module-source-manifest\.sh" verify/gu)).toHaveLength(3);
    expect(release.match(/^assert_module_source_unchanged$/gmu)).toHaveLength(4);
  });

  it('finalizes from a fresh no-publish rehearsal, then verifies both sides before traffic resumes', async () => {
    const finalize = await readFile(resolve(root, 'scripts/world-release-finalize.sh'), 'utf8');
    const stopTraffic = finalize.indexOf('traffic_stopped=true');
    const backup = finalize.indexOf('backup-world.sh "$backup_directory"');
    const rehearsal = finalize.indexOf('WORLD_RESTORE_TRANSITION_ALREADY_DEPLOYED=true');
    const verifyPre = finalize.indexOf('world:rejoin-smoke -- verify "$pre_drain_snapshot"');
    const startDrain = finalize.lastIndexOf('finalization_started=true');
    const migrate = finalize.indexOf('npm run world:chest-migrate');
    const verifyPost = finalize.indexOf('world:rejoin-smoke -- verify "$post_drain_snapshot"');
    const resume = finalize.lastIndexOf('restore_traffic');
    expect(stopTraffic).toBeLessThan(backup);
    expect(backup).toBeLessThan(rehearsal);
    expect(rehearsal).toBeLessThan(verifyPre);
    expect(verifyPre).toBeLessThan(startDrain);
    expect(startDrain).toBeLessThan(migrate);
    expect(migrate).toBeLessThan(verifyPost);
    expect(verifyPost).toBeLessThan(resume);
    expect(finalize).toContain('WORLD_BACKUP_LEAVE_STOPPED=true');
    expect(finalize).toContain('WORLD_RESTORE_TRANSITION_ALREADY_DEPLOYED=true');
    expect(finalize).toContain('CHEST_MIGRATION_STOP_AFTER=drop_ready');
    expect(finalize).toContain('CHEST_MIGRATION_REQUIRE_PLACEABLE_READS_START=1');
    expect(finalize).toContain('systemctl stop orchard-world.service');
    expect(finalize).not.toContain('spacetime publish');
  });

  it('fails closed when service restart or canonical route validation fails', async () => {
    const release = await readFile(resolve(root, 'scripts/world-release.sh'), 'utf8');
    const restore = release.slice(release.indexOf('restore_traffic()'), release.indexOf('keep_traffic_quiesced_on_failure()'));
    const failureTrap = release.slice(release.indexOf('keep_traffic_quiesced_on_failure()'), release.indexOf("trap keep_traffic_quiesced_on_failure EXIT"));
    expect(restore).not.toContain('systemctl start orchard-frontend.service || true');
    expect(restore).not.toContain('systemctl start orchard-studio.service || true');
    expect(failureTrap).toContain('systemctl stop orchard-frontend.service orchard-studio.service');
    expect(failureTrap).toContain('if [[ "$live_publish_started" = true ]]');
    expect(failureTrap).toContain('systemctl stop orchard-world.service');
    expect(failureTrap).toContain('systemctl start orchard-world.service');
    expect(release.indexOf('live_publish_started=true')).toBeLessThan(
      release.indexOf('spacetime publish "$database"'),
    );
    expect(release).toContain('frontend_ready=false');
    expect(release).toContain('studio_ready=false');
  });

  it('validates each production-mode game build before release can continue', async () => {
    const release = await readFile(resolve(root, 'scripts/world-release.sh'), 'utf8');
    const builds = [...release.matchAll(/npm run build --workspace @orchard\/client -- --mode client-production/gu)]
      .map((match) => match.index);
    const staticChecks = [...release.matchAll(/CLIENT_STATIC_DRY_RUN=true/gu)]
      .map((match) => match.index);
    expect(builds).toHaveLength(2);
    expect(staticChecks).toHaveLength(3);
    expect(builds[0]!).toBeLessThan(staticChecks[0]!);
    expect(staticChecks[0]!).toBeLessThan(builds[1]!);
    expect(builds[1]!).toBeLessThan(staticChecks[1]!);
    expect(staticChecks[1]!).toBeLessThan(staticChecks[2]!);
  });
});

describe('world module source manifest', () => {
  it('is deterministic and fails when a tracked source input changes', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'orchard-module-source-'));
    const requiredFiles = [
      'package.json', 'package-lock.json', 'tsconfig.base.json', 'spacetime.json',
      'spacetime.local.json', 'packages/assets/content/items.json',
      'packages/sim/package.json', 'packages/sim/tsconfig.json',
      'packages/sim/src/index.ts',
      'packages/lifecycle-authoring/package.json', 'packages/lifecycle-authoring/tsconfig.json',
      'packages/lifecycle-authoring/src/index.ts',
      'packages/lifecycle-authoring/source/bootstrap.source.json',
      'packages/lifecycle-authoring/generated/item-lifecycles.ts',
      'packages/world/package.json', 'packages/world/tsconfig.json',
      'packages/world/src/index.ts', 'scripts/spacetime-build-checked.sh',
      'scripts/lifecycle-code-build.ts', 'scripts/legacy-cooking-release-gate.ts',
      'scripts/legacy-cooking-release-gate.test.ts', 'scripts/world-rejoin-snapshot.ts',
      'scripts/cooking-content-continuity.ts', 'scripts/cooking-content-continuity.test.ts',
      'scripts/lifecycle-artifact-integrity.ts',
      'scripts/world-module-source-manifest.sh',
    ];
    try {
      for (const file of requiredFiles) {
        await mkdir(resolve(directory, file, '..'), { recursive: true });
        await writeFile(resolve(directory, file), `${file}\n`);
      }
      const manifest = resolve(directory, 'manifest.sha256');
      const helper = resolve(root, 'scripts/world-module-source-manifest.sh');
      const create = spawnSync('bash', [helper, 'create', manifest, directory], { encoding: 'utf8' });
      expect(create.status, create.stderr).toBe(0);
      expect(create.stdout.trim()).toMatch(/^[0-9a-f]{64}$/u);
      const verify = spawnSync('bash', [helper, 'verify', manifest, directory], { encoding: 'utf8' });
      expect(verify.status, verify.stderr).toBe(0);
      expect(verify.stdout).toBe(create.stdout);
      await writeFile(resolve(directory, 'packages/assets/content/items.json'), 'changed-content\n');
      const changedContent = spawnSync('bash', [helper, 'verify', manifest, directory], { encoding: 'utf8' });
      expect(changedContent.status).toBe(65);
      expect(changedContent.stderr).toContain('World module source changed after the release gates');
      const contentRepin = spawnSync('bash', [helper, 'create', manifest, directory], { encoding: 'utf8' });
      expect(contentRepin.status, contentRepin.stderr).toBe(0);
      await writeFile(resolve(directory, 'packages/world/src/index.ts'), 'changed\n');
      const changed = spawnSync('bash', [helper, 'verify', manifest, directory], { encoding: 'utf8' });
      expect(changed.status).toBe(65);
      expect(changed.stderr).toContain('World module source changed after the release gates');
      const repin = spawnSync('bash', [helper, 'create', manifest, directory], { encoding: 'utf8' });
      expect(repin.status, repin.stderr).toBe(0);
      await symlink(resolve(directory, 'package.json'), resolve(directory, 'packages/world/src/linked.ts'));
      const linked = spawnSync('bash', [helper, 'verify', manifest, directory], { encoding: 'utf8' });
      expect(linked.status).toBe(65);
      expect(linked.stderr).toContain('contains a symbolic link');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
