import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { CHUNK_RUNTIME_ACTIVATION_RELEASE } from '../packages/client/src/chunk-shadow-build-gate.js';

/** The environment for spawned lane scripts. A release lane runs this suite with its own inputs exported (migration
 * kind, container-cell migration, backup and snapshot paths, client chunk mode), so none of them leak in: each test
 * states the lane inputs it exercises. */
const LANE_INPUT_PREFIXES = ['WORLD_RELEASE_', 'WORLD_RESTORE_', 'WORLD_ROUTINE_RELEASE_', 'WORLD_FINALIZE_', 'WORLD_RETIREMENT_',
  'CONTAINER_CELL_'];
const LANE_INPUT_NAMES = ['WORLD_REJOIN_TOKENS_FILE', 'VITE_CHUNK_RUNTIME_MODE', 'ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE'];
function laneTestEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...source };
  for (const name of Object.keys(env)) {
    if (LANE_INPUT_NAMES.includes(name) || LANE_INPUT_PREFIXES.some((prefix) => name.startsWith(prefix))) delete env[name];
  }
  return env;
}

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

describe('production continuity tooling', { timeout: 60_000 }, () => {
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
    // The lanes' `npm test` gate runs every test in parallel without coverage (minutes, not an hour); CI enforces
    // the coverage thresholds on every PR before a release can include it.
    const scripts = (JSON.parse(packageJson) as { scripts: Record<string, string> }).scripts;
    expect(scripts['test']).toBe('npm run test:parallel && npm run test:exhaustive');
    expect(scripts['test:parallel']).not.toMatch(/--coverage|--no-file-parallelism/u);
    expect(scripts['test:parallel']!.replace('vitest run', 'vitest run --coverage')).toBe(scripts['test:coverage']);
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
        env: { ...laneTestEnv(), WORLD_RELEASE_MIGRATION_KIND: 'invalid', WORLD_RESTORE_MIGRATION_KIND: 'invalid' },
      });
      expect(result.status).toBe(64);
      const canonicalCheckout = '/home/toby/projects/orchard-cellar/';
      if (script === 'scripts/world-release.sh' && fileURLToPath(new URL('..', import.meta.url)) !== canonicalCheckout) {
        expect(result.stderr).toBe('Run this release from /home/toby/projects/orchard-cellar.\n');
      } else expect(result.stderr).toContain('Usage:');
    }
  });

  it('runs the opt-in container-cell migration on the restore, then in production against the rehearsal fingerprint', () => {
    // Isolated restore: after the content head, before both reconnect captures, with its log as evidence.
    const branch = rehearsal.slice(rehearsal.indexOf('if [[ "$migration_kind" = schema-only ]]; then'),
      rehearsal.indexOf('exit 0', rehearsal.indexOf('if [[ "$migration_kind" = schema-only ]]; then')));
    const rehearsalRun = branch.indexOf('scripts/container-cell-migration-runner.ts" | tee "$container_cell_log"');
    expect(branch).toContain('if [[ "$container_cell_migration" = run ]]; then');
    expect(branch).toContain('CONTAINER_CELL_MIGRATION_TARGET=rehearsal');
    expect(branch).not.toContain('CONTAINER_CELL_EXPECTED_LEGACY_FINGERPRINT');
    expect(rehearsalRun).toBeGreaterThan(0);
    expect(rehearsalRun).toBeLessThan(branch.indexOf('final-fingerprint "$container_cell_log"'));
    expect(branch.indexOf('final-fingerprint "$container_cell_log"')).toBeLessThan(branch.indexOf('world:rejoin-smoke -- capture'));
    expect(branch.indexOf('final-player-fingerprint "$container_cell_log"')).toBeGreaterThan(rehearsalRun);
    expect(branch.indexOf('final-player-fingerprint "$container_cell_log"')).toBeLessThan(branch.indexOf('world:rejoin-smoke -- capture'));
    expect(branch).not.toContain('CONTAINER_CELL_EXPECTED_PLAYER_FINGERPRINT');
    expect(rehearsal).toContain('container_cell_migration=${WORLD_RESTORE_CONTAINER_CELL_MIGRATION:-skip}');

    // Production: the rehearsal fingerprint is read before publication and pinned for the post-publish run.
    const rehearsalCall = release.indexOf('WORLD_RESTORE_CONTAINER_CELL_MIGRATION="$container_cell_migration"');
    const rehearsalFingerprint = release.indexOf('final-fingerprint "$rehearsal_container_cell_log"');
    const publish = release.indexOf('spacetime publish "$database"');
    const contentHead = release.indexOf('npm run world:content-head -- apply');
    const productionRun = release.indexOf('CONTAINER_CELL_MIGRATION_TARGET=production');
    const productionCompare = release.indexOf('[[ "$production_container_cell_fingerprint" = "$rehearsal_container_cell_fingerprint" ]]');
    const verify = release.indexOf('world:rejoin-smoke -- verify "$pre_drain_snapshot" "$production_pre_drain_snapshot"');
    expect(rehearsalCall).toBeGreaterThan(0);
    expect(rehearsalCall).toBeLessThan(release.lastIndexOf('ops/orchard-runtime/bin/restore-world-rehearsal.sh \\\n'));
    expect(rehearsalFingerprint).toBeGreaterThan(rehearsalCall);
    expect(rehearsalFingerprint).toBeLessThan(release.indexOf('live_publish_started=true\n'));
    expect(publish).toBeLessThan(contentHead);
    expect(contentHead).toBeLessThan(productionRun);
    expect(productionRun).toBeLessThan(productionCompare);
    expect(productionCompare).toBeLessThan(verify);
    // The player custody pin: read from the rehearsal before publication, required of production, compared before traffic.
    const rehearsalPlayers = release.indexOf('final-player-fingerprint "$rehearsal_container_cell_log"');
    const playerCompare = release.indexOf('[[ "$production_container_cell_player_fingerprint" = "$rehearsal_container_cell_player_fingerprint" ]]');
    expect(rehearsalPlayers).toBeGreaterThan(rehearsalCall);
    expect(rehearsalPlayers).toBeLessThan(release.indexOf('live_publish_started=true\n'));
    expect(release.indexOf('final-player-fingerprint "$production_container_cell_log"')).toBeGreaterThan(productionRun);
    expect(playerCompare).toBeGreaterThan(productionRun);
    expect(playerCompare).toBeLessThan(verify);
    expect(release.slice(playerCompare, playerCompare + 400)).toContain('exit 65');
    const production = release.slice(productionRun, productionCompare);
    expect(production).toContain('CONTAINER_CELL_EXPECTED_LEGACY_FINGERPRINT="$rehearsal_container_cell_fingerprint"');
    expect(production).toContain('CONTAINER_CELL_EXPECTED_PLAYER_FINGERPRINT="$rehearsal_container_cell_player_fingerprint"');
    expect(production).toContain('CONTAINER_CELL_MIGRATION_PRODUCTION_CONFIRM="$database"');
    expect(production).toContain('| tee "$production_container_cell_log"');
    // Both runs use the lane's content-publication credential; the batches accept a world owner or admin.
    expect(production).toContain('CONTAINER_CELL_MIGRATION_CREDENTIAL_LABEL="$content_owner_label"');
    expect(branch).toContain('CONTAINER_CELL_MIGRATION_CREDENTIAL_LABEL="$content_owner_label"');
    expect(release).toContain('container_cell_migration=${WORLD_RELEASE_CONTAINER_CELL_MIGRATION:-skip}');
    const operations = readFileSync(new URL('../ops/orchard-runtime/README.md', import.meta.url), 'utf8');
    expect(operations).toContain('WORLD_RELEASE_CONTAINER_CELL_MIGRATION=run');
    expect(operations).toContain('CONTAINER_CELL_EXPECTED_LEGACY_FINGERPRINT');
    expect(operations).toContain('CONTAINER_CELL_EXPECTED_PLAYER_FINGERPRINT');
    expect(operations).toContain('restore the pre-publish backup');
    expect(operations).toContain('The batches and the status accept a world owner or admin');
    expect(operations).not.toContain('CONTAINER_CELL_MIGRATION_OWNER_LABEL');
  });

  it('never passes the running lane\'s own inputs to the lane scripts it spawns', () => {
    // The step-4 migration release's gate ran this suite with WORLD_RELEASE_MIGRATION_KIND=schema-only exported, so the
    // "outside a schema-only lane" case reached the chunk plan instead of the refusal it checks.
    const lane = { PATH: '/usr/bin', HOME: '/home/example', WORLD_RELEASE_MIGRATION_KIND: 'schema-only',
      WORLD_RELEASE_CONTAINER_CELL_MIGRATION: 'run', WORLD_RELEASE_BACKUP_DIRECTORY: '/backups/new',
      WORLD_RELEASE_CONTENT_CANDIDATE: '/release/content-candidate.json', WORLD_RELEASE_CLIENT_CHUNK_RUNTIME: 'on',
      WORLD_RELEASE_CLIENT_CHUNK_ACTIVATION: CHUNK_RUNTIME_ACTIVATION_RELEASE, WORLD_RESTORE_MIGRATION_KIND: 'schema-only',
      WORLD_ROUTINE_RELEASE_DIRECTORY: '/release', CONTAINER_CELL_EXPECTED_LEGACY_FINGERPRINT: 'x',
      WORLD_REJOIN_TOKENS_FILE: '/dev/shm/rejoin.json', VITE_CHUNK_RUNTIME_MODE: 'on' };
    expect(laneTestEnv(lane)).toEqual({ PATH: '/usr/bin', HOME: '/home/example' });
  });

  it('refuses the container-cell migration outside a schema-only publishing lane or with an unknown value', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-container-cell-lane-'));
    try {
      const token = join(directory, 'tokens.json');
      writeFileSync(token, '{"operator":"hidden"}\n', { mode: 0o600 }); chmodSync(token, 0o600);
      const releaseEnv = { ...laneTestEnv(), WORLD_RELEASE_DRY_RUN: 'true', WORLD_REJOIN_TOKENS_FILE: token,
        WORLD_RELEASE_BACKUP_DIRECTORY: join(directory, 'new-backup'),
        WORLD_RELEASE_PRE_DRAIN_SNAPSHOT: join(directory, 'new-pre-drain.json'),
        WORLD_RELEASE_POST_DRAIN_SNAPSHOT: join(directory, 'new-post-drain.json'),
        WORLD_RELEASE_PRODUCTION_PRE_DRAIN_SNAPSHOT: join(directory, 'new-production-pre-drain.json') };
      const cwd = fileURLToPath(new URL('..', import.meta.url));
      const runRelease = (env: Record<string, string>) => spawnSync('bash', ['scripts/world-release.sh'],
        { cwd, encoding: 'utf8', env: { ...releaseEnv, ...env } });
      const chests = runRelease({ WORLD_RELEASE_CONTAINER_CELL_MIGRATION: 'run' });
      expect(chests.status).toBe(64);
      expect(chests.stderr).toContain('requires WORLD_RELEASE_MIGRATION_KIND=schema-only');
      const unknown = runRelease({ WORLD_RELEASE_CONTAINER_CELL_MIGRATION: 'yes', WORLD_RELEASE_MIGRATION_KIND: 'schema-only' });
      expect(unknown.status).toBe(64);
      expect(unknown.stderr).toContain('Usage:');

      const backupDirectory = join(directory, 'backup'); mkdirSync(backupDirectory);
      const runRehearsal = (env: Record<string, string>) => spawnSync('bash', ['ops/orchard-runtime/bin/restore-world-rehearsal.sh',
        backupDirectory, join(directory, 'pre.json'), join(directory, 'post.json')],
      { cwd, encoding: 'utf8', env: { ...laneTestEnv(), WORLD_REJOIN_TOKENS_FILE: token, WORLD_RESTORE_REHEARSAL_DRY_RUN: 'true', ...env } });
      for (const env of [{ WORLD_RESTORE_MIGRATION_KIND: 'legacy-chests' } as Record<string, string>,
        { WORLD_RESTORE_MIGRATION_KIND: 'schema-only', WORLD_RESTORE_TRANSITION_ALREADY_DEPLOYED: 'true' }]) {
        const result = runRehearsal({ WORLD_RESTORE_CONTAINER_CELL_MIGRATION: 'run', ...env });
        expect(result.status, JSON.stringify(env)).toBe(64);
        expect(result.stderr).toContain('The container-cell migration runs only in a schema-only rehearsal');
      }
      expect(`${chests.stdout}${chests.stderr}`).not.toContain('hidden');
    } finally { rmSync(directory, { recursive: true, force: true }); }
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
    expect(rehearsal.match(/world-module-source-manifest\.sh" verify/gu)).toHaveLength(4);
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
        // Dry-runs resolve this checkout; production keeps its canonical-path guard.
        cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
        env: { ...laneTestEnv(), WORLD_RELEASE_DRY_RUN: 'true', WORLD_REJOIN_TOKENS_FILE: token,
          // After the S5c activation the lane needs an explicit client chunk runtime (G6).
          WORLD_RELEASE_CLIENT_CHUNK_RUNTIME: 'on', WORLD_RELEASE_CLIENT_CHUNK_ACTIVATION: CHUNK_RUNTIME_ACTIVATION_RELEASE!,
          WORLD_RELEASE_BACKUP_DIRECTORY: join(directory, 'new-backup'),
          WORLD_RELEASE_PRE_DRAIN_SNAPSHOT: join(directory, 'new-pre-drain.json'),
          WORLD_RELEASE_POST_DRAIN_SNAPSHOT: join(directory, 'new-post-drain.json'),
          WORLD_RELEASE_PRODUCTION_PRE_DRAIN_SNAPSHOT: join(directory, 'new-production-pre-drain.json') },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('World release stage-A dry-run passed');
      expect(result.stdout).toContain(`Client chunk runtime plan: {"mode":"on","activationRelease":"${CHUNK_RUNTIME_ACTIVATION_RELEASE}"`);
      expect(`${result.stdout}${result.stderr}`).not.toContain('test-value-never-printed');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('scopes the client chunk runtime to both client builds and asserts the staged and served audits (S5c G3/G6)', () => {
    const lines = release.split('\n');
    const raw = lines.filter(line => /VITE_CHUNK_RUNTIME_MODE=|ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE=/u.test(line));
    expect(raw.every(line => line.startsWith('client_chunk_build_env') || line.startsWith('[[ -z "$client_chunk_activation" ]]'))).toBe(true);
    const builds = lines.filter(line => line.includes('npm run build --workspace @orchard/client'));
    expect(builds).toEqual(Array(2).fill('env "${client_chunk_build_env[@]}" npm run build --workspace @orchard/client -- --mode client-production'));
    const plan = release.indexOf('client_chunk_plan=$(node --import tsx scripts/world-release-routine.ts client-chunk-plan)');
    expect(plan).toBeGreaterThan(0);
    expect(plan).toBeLessThan(release.indexOf('if [[ "$dry_run" = true ]]; then\n  [[ "$rehearsal_port"'));
    expect(plan).toBeLessThan(release.indexOf('npm test\n'));
    // Each build's audit is asserted before the release chunk check runs on it.
    for (const [label, build] of [['candidate', release.indexOf(builds[0]!)], ['final', release.lastIndexOf(builds[1]!)]] as const) {
      const audit = release.indexOf(`\nassert_client_chunk_audit ${label}\n`);
      expect(audit, label).toBeGreaterThan(build);
      expect(audit, label).toBeLessThan(release.indexOf('npm run client:chunks:check', build));
    }
    // The evidence path is printed as soon as it exists, and every audit failure is named.
    expect(release.indexOf('printf \'Client chunk runtime evidence (plan and audits): %s\\n\' "$client_chunk_stage"'))
      .toBeLessThan(release.indexOf(builds[0]!));
    expect(release).toContain('|| client_chunk_audit_failed "$1"');
    const served = release.indexOf('\n  assert_client_chunk_audit served\n');
    expect(served).toBeGreaterThan(release.lastIndexOf('\nrestore_traffic\n'));
    expect(served).toBeLessThan(release.lastIndexOf('\ntraffic_stopped=false\nrelease_world_quiescence_started=false'));
    // After a successful publish a transient fetch error must not trip the EXIT trap: bounded retries,
    // but the comparison and the audit stay strict.
    const fetch = release.indexOf('https://orchard.dastari.net/chunk-runtime-audit.json');
    expect(release.slice(release.lastIndexOf('curl', fetch), fetch)).toContain('--retry 5 --retry-all-errors --retry-delay 2');
    expect(release).toContain('cmp "$client_chunk_stage/client-chunk-runtime-audit-final.json" "$client_chunk_stage/client-chunk-runtime-audit-served.json" \\\n    || client_chunk_audit_failed served-differs-from-final');
  });

  it('refuses the raw chunk build variables and an unapproved on before any release work (S5c G3/G6)', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-release-chunk-test-'));
    try {
      const token = join(directory, 'tokens.json');
      writeFileSync(token, '{"operator":"chunk-value-never-printed"}\n', { mode: 0o600 });
      chmodSync(token, 0o600);
      const run = (extra: Record<string, string>) => spawnSync('bash', [fileURLToPath(new URL('./world-release.sh', import.meta.url))], {
        cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
        env: { ...laneTestEnv(), WORLD_RELEASE_DRY_RUN: 'true', WORLD_REJOIN_TOKENS_FILE: token,
          WORLD_RELEASE_BACKUP_DIRECTORY: join(directory, 'new-backup'),
          WORLD_RELEASE_PRE_DRAIN_SNAPSHOT: join(directory, 'new-pre-drain.json'),
          WORLD_RELEASE_POST_DRAIN_SNAPSHOT: join(directory, 'new-post-drain.json'),
          WORLD_RELEASE_PRODUCTION_PRE_DRAIN_SNAPSHOT: join(directory, 'new-production-pre-drain.json'), ...extra },
      });
      for (const [extra, code] of [
        [{ VITE_CHUNK_RUNTIME_MODE: 'off' }, 'release_raw_chunk_runtime_variable:VITE_CHUNK_RUNTIME_MODE'],
        [{ ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE: '' }, 'release_raw_chunk_runtime_variable:ORCHARD_CHUNK_RUNTIME_ACTIVATION_RELEASE'],
        [{ WORLD_RELEASE_CLIENT_CHUNK_RUNTIME: 'on', WORLD_RELEASE_CLIENT_CHUNK_ACTIVATION: 'unreviewed' }, 'release_chunk_activation_mismatch'],
        // G6: after activation the mode is explicit, and off needs the rollback flag.
        [{}, 'release_chunk_runtime_mode_required_after_activation'],
        [{ WORLD_RELEASE_CLIENT_CHUNK_RUNTIME: 'off' }, 'release_chunk_deactivation_requires_rollback'],
      ] as const) {
        const result = run(extra);
        expect(result.status, JSON.stringify(extra)).toBe(64);
        expect(result.stderr).toContain(code);
        expect(result.stderr).toContain('Client chunk runtime plan refused');
        expect(result.stdout).not.toContain('dry-run passed');
        expect(`${result.stdout}${result.stderr}`).not.toContain('chunk-value-never-printed');
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('dry-runs finalization with fresh expectation paths and no publication surface', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-finalize-test-'));
    try {
      const token = join(directory, 'tokens.json');
      writeFileSync(token, '{"operator":"finalize-value-never-printed"}\n', { mode: 0o600 });
      chmodSync(token, 0o600);
      const result = spawnSync('bash', [fileURLToPath(new URL('./world-release-finalize.sh', import.meta.url))], {
        // Dry-runs resolve this checkout; production keeps its canonical-path guard.
        cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
        env: { ...laneTestEnv(), WORLD_FINALIZE_DRY_RUN: 'true', WORLD_REJOIN_TOKENS_FILE: token,
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
        // Dry-runs resolve this checkout; production keeps its canonical-path guard.
        cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8',
        env: { ...laneTestEnv(), WORLD_RETIREMENT_DRY_RUN: 'true', WORLD_REJOIN_TOKENS_FILE: token,
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
        cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...laneTestEnv(),
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
        cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...laneTestEnv(),
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
