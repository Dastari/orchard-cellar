import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const release = readFileSync(new URL('./world-release.sh', import.meta.url), 'utf8');
const finalize = readFileSync(new URL('./world-release-finalize.sh', import.meta.url), 'utf8');
const retirement = readFileSync(new URL('./world-release-retire-chests.sh', import.meta.url), 'utf8');
const retirementPreparation = readFileSync(new URL('./prepare-chest-retirement-candidate.sh', import.meta.url), 'utf8');
const backup = readFileSync(new URL('../ops/orchard-runtime/bin/backup-world.sh', import.meta.url), 'utf8');
const rehearsal = readFileSync(new URL('../ops/orchard-runtime/bin/restore-world-rehearsal.sh', import.meta.url), 'utf8');
const retirementRehearsal = readFileSync(new URL('../ops/orchard-runtime/bin/restore-world-retirement-rehearsal.sh', import.meta.url), 'utf8');
const staticValidation = readFileSync(new URL('../ops/orchard-runtime/bin/validate-studio-static.sh', import.meta.url), 'utf8');
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const contentHeadRelease = readFileSync(new URL('./content-head-release.ts', import.meta.url), 'utf8');

describe('production continuity tooling', () => {
  it('uses normal repository lifecycle checks without a separate approval service or digest flag', () => {
    for (const relative of [
      'lifecycle-review.ts', 'lifecycle-review.test.ts',
      'lifecycle-candidate-handoff.ts', 'lifecycle-candidate-handoff.sh',
      'lifecycle-release-evidence.ts', 'world-release-lifecycle-code.sh', 'lifecycle-code-release.test.ts',
    ]) expect(existsSync(new URL(relative, import.meta.url)), relative).toBe(false);
    for (const source of [release, retirement, rehearsal, retirementRehearsal]) {
      expect(source).not.toMatch(/LIFECYCLE_RELEASE_CONFIRM|LIFECYCLE_CANDIDATE_REF|ORCHARD_LIFECYCLE_CANDIDATE_SPOOL_DIRECTORY|lifecycle-release-evidence/u);
    }
    expect(packageJson).not.toMatch(/"lifecycle:(?:candidate:|review)|"world:release:lifecycle-code"/u);
    for (const gate of ['npm run lifecycle:integrity', 'npm run typecheck',
      'npm run world:release:typecheck', 'npm test', 'npm run build --workspace @orchard/world']) {
      expect(release.indexOf(gate), gate).toBeGreaterThan(0);
      expect(release.indexOf(gate), gate).toBeLessThan(release.indexOf('release_world_quiescence_started=true'));
    }
    expect(release).toContain('legacy-cooking-release-gate.ts');
    expect(release).toContain('world-module-source-manifest.sh');
    const operations = readFileSync(new URL('../ops/orchard-runtime/README.md', import.meta.url), 'utf8');
    expect(operations).toContain('explicit “go” in chat for that specific release');
    expect(operations).toContain('approval for an earlier');
  });

  it('keeps schema-only releases on restored-row reconnect checks without chest mutation', () => {
    expect(release).toContain('WORLD_RESTORE_MIGRATION_KIND="$migration_kind"');
    const start = rehearsal.indexOf('if [[ "$migration_kind" = schema-only ]]; then');
    const end = rehearsal.indexOf('\nfi', start);
    expect(start).toBeGreaterThan(rehearsal.indexOf('run world:content-head -- apply'));
    const branch = rehearsal.slice(start, end);
    expect(branch).toContain('run world:rejoin-smoke -- capture "$pre_drain_snapshot"');
    expect(branch).toContain('run world:rejoin-smoke -- verify "$pre_drain_snapshot" "$post_drain_snapshot"');
    expect(branch).toContain('exit 0');
    expect(branch).not.toContain('world:chest-migrate');
    const productionStart = release.indexOf('if [[ "$migration_kind" = legacy-chests ]]; then');
    const productionEnd = release.indexOf('\nelse', productionStart);
    expect(release.slice(productionStart, productionEnd)).toContain('npm run world:chest-migrate');
    for (const script of ['scripts/world-release.sh', 'ops/orchard-runtime/bin/restore-world-rehearsal.sh']) {
      const result = spawnSync('bash', [script], {
        cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
        env: { ...process.env, WORLD_RELEASE_MIGRATION_KIND: 'invalid', WORLD_RESTORE_MIGRATION_KIND: 'invalid' },
      });
      expect(result.status).toBe(64);
      const canonicalCheckout = '/home/toby/projects/orchard-cellar/';
      if (script === 'scripts/world-release.sh' && fileURLToPath(new URL('..', import.meta.url)) !== canonicalCheckout) {
        expect(result.stderr).toBe('Run this release from /home/toby/projects/orchard-cellar.\n');
      } else expect(result.stderr).toContain('Usage:');
    }
  });

  it('closes both preview services before a build can replace their served artifacts', () => {
    const stopGame = release.indexOf('if [[ "$frontend_was_active" = true ]]; then sudo systemctl stop orchard-frontend.service; fi');
    const stopStudio = release.indexOf('if [[ "$studio_was_active" = true ]]; then sudo systemctl stop orchard-studio.service; fi');
    const firstGameBuild = release.indexOf('npm run build --workspace @orchard/client');
    const firstStudioInstall = release.indexOf('\ninstall_reviewed_studio\n');
    expect(stopGame).toBeGreaterThan(release.indexOf('trap keep_traffic_quiesced_on_failure EXIT'));
    expect(stopStudio).toBeGreaterThan(stopGame);
    expect(stopStudio).toBeLessThan(firstGameBuild);
    expect(stopStudio).toBeLessThan(firstStudioInstall);
    expect(release.indexOf('bash scripts/build-reviewed-studio.sh')).toBeLessThan(stopStudio);
    expect(release).toContain('cmp "$studio_stage/bindings.sha256" "$studio_stage/bindings-current.sha256"');
    expect(release.lastIndexOf('\nrestore_traffic\n')).toBeGreaterThan(release.lastIndexOf('world:rejoin-smoke -- verify'));
  });

  it('orders quiescence, checksum backup, isolated restore, no-delete publish, and parity verification', () => {
    expect(backup.indexOf('systemctl stop "$service"')).toBeLessThan(backup.indexOf('tar --one-file-system'));
    expect(backup).toContain("sha256sum -c SHA256SUMS");
    for (const maintenance of [backup, rehearsal, retirementRehearsal]) {
      expect(maintenance).toContain('WORLD_MAINTENANCE_NICE_LEVEL');
      expect(maintenance).toContain('renice "$maintenance_nice" -p $$');
      expect(maintenance).toContain('ionice -c 3 -p $$');
    }
    expect(rehearsal).toContain('restore_parent=$repository/.release-work');
    expect(rehearsal).toContain('"$(stat -f -c %T "$restore_parent")" != tmpfs');
    expect(rehearsal).toContain('mktemp -d "$restore_parent/orchard-world-restore.XXXXXX"');
    expect(rehearsal).toContain('--listen-addr "127.0.0.1:$port"');
    const rehearsalPublish = rehearsal.indexOf('spacetime publish "$database"');
    const rehearsalMigrate = rehearsal.indexOf('run world:chest-migrate');
    const rehearsalCapture = rehearsal.indexOf('run world:rejoin-smoke -- capture "$pre_drain_snapshot"', rehearsalMigrate);
    const rehearsalVerify = rehearsal.indexOf('run world:rejoin-smoke -- verify "$pre_drain_snapshot"', rehearsalMigrate);
    const rehearsalDrain = rehearsal.indexOf('CHEST_MIGRATION_STOP_AFTER=drop_ready');
    const rehearsalPostCapture = rehearsal.indexOf('run world:rejoin-smoke -- capture "$post_drain_snapshot"');
    expect(rehearsalPublish).toBeGreaterThan(0);
    expect(rehearsalPublish).toBeLessThan(rehearsalMigrate);
    expect(rehearsalMigrate).toBeLessThan(rehearsalCapture);
    expect(rehearsalCapture).toBeLessThan(rehearsalVerify);
    expect(rehearsalVerify).toBeLessThan(rehearsalDrain);
    expect(rehearsalDrain).toBeLessThan(rehearsalPostCapture);
    expect(rehearsal).toContain('--delete-data=never');
    expect(rehearsal).not.toMatch(/systemctl|sudo/u);
    const restoredModuleBranch = rehearsal.indexOf('if [[ "$transition_already_deployed" = true ]]; then');
    const publishElse = rehearsal.indexOf('\nelse\n', restoredModuleBranch);
    expect(restoredModuleBranch).toBeGreaterThan(0);
    expect(rehearsal.slice(restoredModuleBranch, publishElse)).not.toContain('spacetime publish');
    expect(rehearsal.slice(restoredModuleBranch, publishElse))
      .toContain('CHEST_MIGRATION_REQUIRE_PLACEABLE_READS_START=1');
    expect(rehearsal.indexOf('spacetime publish "$database"', publishElse)).toBeGreaterThan(publishElse);
    expect(release.lastIndexOf('restore-world-rehearsal.sh')).toBeLessThan(release.indexOf('spacetime publish'));
    expect(release).toContain('--delete-data=never');
    expect(release).toContain('npm run world:release:typecheck');
    expect(release).toContain('trap keep_traffic_quiesced_on_failure EXIT');
    expect(release).toContain('traffic remain stopped for investigation');
    expect(release).toContain('systemctl stop orchard-frontend.service orchard-studio.service');
    expect(release).toContain('CLIENT_VALIDATE_ORIGIN=https://orchard.dastari.net');
    expect(release).toContain('STUDIO_VALIDATE_ORIGIN=https://cellar.dastari.net');
    expect(release).toContain('WORLD_BACKUP_LEAVE_STOPPED=true');
    expect(release.match(/run world:rejoin-smoke -- refresh/gu)).toHaveLength(3);
    const earlyCredentialRefresh = release.indexOf('run world:rejoin-smoke -- refresh');
    const preBackupCredentialRefresh = release.indexOf('run world:rejoin-smoke -- refresh', earlyCredentialRefresh + 1);
    const trafficStop = release.indexOf('systemctl stop orchard-frontend.service');
    const backupCallIndex = release.lastIndexOf('ops/orchard-runtime/bin/backup-world.sh');
    const justInTimeCredentialRefresh = release.lastIndexOf('run world:rejoin-smoke -- refresh');
    const restoreRehearsal = release.lastIndexOf('ops/orchard-runtime/bin/restore-world-rehearsal.sh');
    expect(earlyCredentialRefresh).toBeLessThan(trafficStop);
    expect(preBackupCredentialRefresh).toBeGreaterThan(release.indexOf('npm test'));
    expect(preBackupCredentialRefresh).toBeGreaterThan(release.indexOf('\ninstall_reviewed_studio\n'));
    expect(preBackupCredentialRefresh).toBeLessThan(release.indexOf('run world:content-head -- assert-current', preBackupCredentialRefresh));
    expect(preBackupCredentialRefresh).toBeLessThan(backupCallIndex);
    expect(backupCallIndex).toBeLessThan(justInTimeCredentialRefresh);
    expect(justInTimeCredentialRefresh).toBeLessThan(restoreRehearsal);
    expect(release).toContain('WORLD_ROLLBACK_ARTIFACTS_FILE="$rollback_artifacts"');
    expect(release).toContain('systemctl stop orchard-world.service');
    expect(release).toContain('Release failed before production publication; restarting the unchanged world authority');
    expect(release).toContain('Release failed after production publication began; the world authority remains stopped');
    expect(release).toContain('--server "$canonical_host"');
    expect(rehearsal.match(/world-module-source-manifest\.sh" verify/gu)).toHaveLength(3);
    expect(release).not.toContain('spacetime sql "$database"');
    const productionPublish = release.indexOf('spacetime publish');
    const productionContentApply = release.lastIndexOf('run world:content-head -- apply');
    const productionMigrate = release.indexOf('npm run world:chest-migrate');
    const productionVerify = release.lastIndexOf('world:rejoin-smoke -- verify');
    expect(productionPublish).toBeLessThan(productionMigrate);
    expect(productionPublish).toBeLessThan(productionContentApply);
    expect(productionContentApply).toBeLessThan(productionMigrate);
    expect(productionMigrate).toBeLessThan(productionVerify);
    expect(release).toContain('CHEST_MIGRATION_STOP_AFTER=placeable_reads');
    expect(release).not.toContain('CHEST_MIGRATION_STOP_AFTER=drop_ready');
    expect(finalize).toContain('CHEST_MIGRATION_STOP_AFTER=drop_ready');
    expect(finalize).not.toContain('spacetime publish');
    expect(release.indexOf('run world:content-head -- assert-current'))
      .toBeLessThan(release.lastIndexOf('ops/orchard-runtime/bin/backup-world.sh'));
    const rehearsalContentApply = rehearsal.indexOf('run world:content-head -- apply');
    expect(rehearsalPublish).toBeLessThan(rehearsalContentApply);
    expect(rehearsalContentApply).toBeLessThan(rehearsalMigrate);
    expect(contentHeadRelease).toContain("deletes: readonly []");
    expect(contentHeadRelease).toContain("deletes: '[]'");
    expect(contentHeadRelease).toContain('content_release_custom_conflict');
    expect(contentHeadRelease).toContain('content_release_independent_reviewer_required');
    expect(contentHeadRelease).toContain('content_release_live_head_changed');
    expect(contentHeadRelease).toContain('CONTENT_HEAD_RELEASE_CONFIRM');
  });

  it('has an executable dry-run that validates the release plan without reading or printing tokens', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-release-test-'));
    try {
      const token = join(directory, 'tokens.json');
      writeFileSync(token, '{"operator":"test-value-never-printed"}\n', { mode: 0o600 });
      chmodSync(token, 0o600);
      const result = spawnSync('bash', [fileURLToPath(new URL('./world-release.sh', import.meta.url))], {
        // The operational guard requires this cwd; the script under test is still this worktree's file.
        cwd: '/home/toby/projects/orchard-cellar', encoding: 'utf8',
        env: { ...process.env, WORLD_RELEASE_DRY_RUN: 'true', WORLD_REJOIN_TOKENS_FILE: token,
          WORLD_RELEASE_BACKUP_DIRECTORY: join(directory, 'new-backup'),
          WORLD_RELEASE_PRE_DRAIN_SNAPSHOT: join(directory, 'new-pre-drain.json'),
          WORLD_RELEASE_POST_DRAIN_SNAPSHOT: join(directory, 'new-post-drain.json'),
          WORLD_RELEASE_PRODUCTION_PRE_DRAIN_SNAPSHOT: join(directory, 'new-production-pre-drain.json') },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('World release stage-A dry-run passed');
      expect(`${result.stdout}${result.stderr}`).not.toContain('test-value-never-printed');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('dry-runs finalization with fresh expectation paths and no publication surface', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-finalize-test-'));
    try {
      const token = join(directory, 'tokens.json');
      writeFileSync(token, '{"operator":"finalize-value-never-printed"}\n', { mode: 0o600 });
      chmodSync(token, 0o600);
      const result = spawnSync('bash', [fileURLToPath(new URL('./world-release-finalize.sh', import.meta.url))], {
        // The operational guard requires this cwd; the script under test is still this worktree's file.
        cwd: '/home/toby/projects/orchard-cellar', encoding: 'utf8',
        env: { ...process.env, WORLD_FINALIZE_DRY_RUN: 'true', WORLD_REJOIN_TOKENS_FILE: token,
          WORLD_FINALIZE_BACKUP_DIRECTORY: join(directory, 'new-backup'),
          WORLD_FINALIZE_PRE_DRAIN_SNAPSHOT: join(directory, 'new-pre-drain.json'),
          WORLD_FINALIZE_POST_DRAIN_SNAPSHOT: join(directory, 'new-post-drain.json'),
          WORLD_FINALIZE_PRODUCTION_PRE_DRAIN_SNAPSHOT: join(directory, 'new-production-pre-drain.json'),
          WORLD_FINALIZE_PRODUCTION_POST_DRAIN_SNAPSHOT: join(directory, 'new-production-post-drain.json') },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('World release finalizer dry-run passed');
      expect(`${result.stdout}${result.stderr}`).not.toContain('finalize-value-never-printed');
      expect(finalize).not.toContain('spacetime publish');
      expect(finalize).toContain('WORLD_RESTORE_TRANSITION_ALREADY_DEPLOYED=true');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('orders guarded post-drop retirement behind fresh restored/live zero gates', () => {
    expect(packageJson).toContain('"world:release:retire-chests": "bash scripts/world-release-retire-chests.sh"');
    expect(packageJson).toContain('"world:retirement:prepare": "bash scripts/prepare-chest-retirement-candidate.sh"');
    expect(retirement).toContain('WORLD_BACKUP_LEAVE_STOPPED=true');
    expect(retirement).toContain('WORLD_ROLLBACK_ARTIFACTS_FILE="$rollback_artifacts"');
    expect(retirement).toContain('trap fail_closed EXIT');
    expect(retirement).toContain('scripts/assert-chest-retirement-source.sh');
    expect(retirement).toContain('scripts/prepare-chest-retirement-candidate.sh "$candidate_repository" "$source_manifest"');
    expect(retirementPreparation).toContain('world-module-source-manifest.sh" create');
    expect(retirementPreparation).toContain('run generate --workspace @orchard/world');
    expect(retirementPreparation).toContain('run typecheck --workspace @orchard/client');
    expect(retirementPreparation).toContain('run typecheck --workspace @orchard/studio');
    expect(retirement).toContain('WORLD_RETIREMENT_CANDIDATE_REPOSITORY="$candidate_repository"');
    expect(retirement).toContain('WORLD_REJOIN_REQUIRE_GENERIC_ONLY=1');
    expect(retirement).toContain('CHEST_MIGRATION_OWNER_LABEL');
    expect(retirement).toContain('--server "$canonical_host"');
    expect(retirement).toContain('spacetime describe "$canonical_database"');
    expect(retirement).toContain('CLIENT_VALIDATE_ORIGIN=https://orchard.dastari.net');
    expect(retirement).toContain('STUDIO_VALIDATE_ORIGIN=https://cellar.dastari.net');
    const restoredRehearsal = retirement.indexOf('restore-world-retirement-rehearsal.sh');
    const liveGate = retirement.indexOf('run_live_drop_ready_gate "$production_pre_status"');
    const productionPublish = retirement.indexOf('spacetime publish "$canonical_database"');
    const postGate = retirement.indexOf('run_live_drop_ready_gate "$production_post_status"');
    expect(restoredRehearsal).toBeGreaterThan(0);
    expect(restoredRehearsal).toBeLessThan(liveGate);
    expect(liveGate).toBeLessThan(productionPublish);
    expect(productionPublish).toBeLessThan(postGate);
    expect(retirement.indexOf('rsync -a --delete -- "$candidate_repository/packages/client/dist/"'))
      .toBeGreaterThan(productionPublish);
    const publishes = retirement.match(/spacetime publish/gu) ?? [];
    const safePublishes = retirement.match(/spacetime publish[\s\S]*?--delete-data=never/gu) ?? [];
    expect(publishes).toHaveLength(1);
    expect(safePublishes).toHaveLength(1);

    const restoredGate = retirementRehearsal.indexOf('run_drop_ready_gate rehearsal "$pre_status_log"');
    const isolatedPublish = retirementRehearsal.indexOf('spacetime publish "$database"');
    const restoredPostGate = retirementRehearsal.indexOf('run_drop_ready_gate rehearsal "$post_status_log"');
    expect(restoredGate).toBeGreaterThan(0);
    expect(restoredGate).toBeLessThan(isolatedPublish);
    expect(isolatedPublish).toBeLessThan(restoredPostGate);
    expect(retirementRehearsal).toContain('--delete-data=never');
    expect(retirementRehearsal).toContain('WORLD_REJOIN_REQUIRE_GENERIC_ONLY=1');
    expect(retirementRehearsal).toContain('CHEST_MIGRATION_OWNER_LABEL');
    expect(retirementRehearsal).not.toMatch(/systemctl|sudo/u);
  });

  it('dry-runs post-drop retirement without reading tokens or touching services', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-retirement-test-'));
    try {
      const token = join(directory, 'tokens.json');
      writeFileSync(token, '{"operator":"retirement-value-never-printed"}\n', { mode: 0o600 });
      chmodSync(token, 0o600);
      const result = spawnSync('bash', [fileURLToPath(new URL('./world-release-retire-chests.sh', import.meta.url))], {
        // The operational guard requires this cwd; the script under test is still this worktree's file.
        cwd: '/home/toby/projects/orchard-cellar', encoding: 'utf8',
        env: { ...process.env, WORLD_RETIREMENT_DRY_RUN: 'true', WORLD_REJOIN_TOKENS_FILE: token,
          WORLD_RETIREMENT_BACKUP_DIRECTORY: join(directory, 'new-backup'),
          WORLD_RETIREMENT_REHEARSAL_PRE_SNAPSHOT: join(directory, 'rehearsal-pre.json'),
          WORLD_RETIREMENT_REHEARSAL_POST_SNAPSHOT: join(directory, 'rehearsal-post.json'),
          WORLD_RETIREMENT_PRODUCTION_PRE_SNAPSHOT: join(directory, 'production-pre.json'),
          WORLD_RETIREMENT_PRODUCTION_POST_SNAPSHOT: join(directory, 'production-post.json') },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Chest retirement release dry-run passed');
      expect(`${result.stdout}${result.stderr}`).not.toContain('retirement-value-never-printed');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('dry-runs a checksumed restore archive with source hard links without starting a host or touching systemd', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-restore-test-'));
    try {
      const backupDirectory = join(directory, 'backup'); const stage = join(directory, 'stage');
      mkdirSync(join(stage, '.spacetime-data'), { recursive: true }); mkdirSync(backupDirectory);
      const fixture = join(stage, '.spacetime-data', 'fixture');
      writeFileSync(fixture, 'durable-world');
      linkSync(fixture, join(stage, '.spacetime-data', 'fixture-hard-link'));
      const archive = join(backupDirectory, 'spacetime-data.tar.gz');
      const tar = spawnSync('tar', [
        '--one-file-system', '--hard-dereference', '-C', stage, '-czf', archive, '.spacetime-data',
      ], { encoding: 'utf8' });
      expect(tar.status, tar.stderr).toBe(0);
      const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
      writeFileSync(join(backupDirectory, 'SHA256SUMS'), `${digest}  spacetime-data.tar.gz\n`);
      writeFileSync(join(backupDirectory, 'MANIFEST'), 'database=orchard-cellar-world\n');
      const snapshot = join(directory, 'new-pre-drain.json');
      const postSnapshot = join(directory, 'new-post-drain.json');
      const token = join(directory, 'tokens.json'); writeFileSync(token, '{"operator":"hidden"}\n', { mode: 0o600 }); chmodSync(token, 0o600);
      const result = spawnSync('bash', ['ops/orchard-runtime/bin/restore-world-rehearsal.sh', backupDirectory, snapshot, postSnapshot], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env,
          WORLD_REJOIN_TOKENS_FILE: token, WORLD_RESTORE_REHEARSAL_DRY_RUN: 'true' },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Restore rehearsal dry-run passed');
      expect(`${result.stdout}${result.stderr}`).not.toContain('hidden');

      const sourceManifest = join(directory, 'source-manifest');
      writeFileSync(sourceManifest, 'pinned-retirement-source\n', { mode: 0o600 });
      const retirementResult = spawnSync('bash', [
        'ops/orchard-runtime/bin/restore-world-retirement-rehearsal.sh',
        backupDirectory, join(directory, 'retirement-pre.json'), join(directory, 'retirement-post.json'),
      ], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env,
          WORLD_REJOIN_TOKENS_FILE: token, WORLD_MODULE_SOURCE_MANIFEST: sourceManifest,
          WORLD_RETIREMENT_REHEARSAL_DRY_RUN: 'true' },
      });
      expect(retirementResult.status, retirementResult.stderr).toBe(0);
      expect(retirementResult.stdout).toContain('Retirement restore rehearsal dry-run passed');
      expect(`${retirementResult.stdout}${retirementResult.stderr}`).not.toContain('hidden');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('validates a prebuilt static Studio and hardened query-free NPM route', () => {
    expect(staticValidation).toContain('packages/studio/dist/index.html');
    expect(staticValidation).toContain('npm run preview -w @orchard/studio');
    expect(staticValidation).toContain('vite[[:space:]]+dev');
    expect(staticValidation).toContain("'Content-Security-Policy:'");
    expect(staticValidation).toContain("'limit_req zone=orchard_studio_dynamic_per_ip'");
    expect(staticValidation).toContain("'map $uri $orchard_studio_client_key'");
    expect(staticValidation).toContain("'~^/(?:assets|generated|ui)(?:/|$) \"\";'");
    expect(staticValidation).toContain('\\$request_uri|\\$args|\\$query_string');
    expect(staticValidation).toContain('https://cellar\\.dastari\\.net');
  });
});
