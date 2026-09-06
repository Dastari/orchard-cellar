import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../../ops/orchard-runtime/bin/backup-world.sh', import.meta.url), 'utf8');

describe('quiesced world backup guardrails', () => {
  it('targets only the canonical data directory and named world service', () => {
    expect(source).toContain('repository=/home/toby/projects/orchard-cellar');
    expect(source).toContain('data_directory=$repository/.spacetime-data');
    expect(source).toContain('service=orchard-world.service');
    expect(source).toContain('realpath "$data_directory"');
    expect(source).not.toMatch(/rm\s+-rf/u);
    expect(source).not.toContain('--delete-data');
  });

  it('refuses overwrite, quiesces before archive, verifies the hash, and restarts by default', () => {
    expect(source).toContain('[[ ! -e "$destination" ]]');
    expect(source.indexOf('systemctl stop "$service"')).toBeLessThan(source.indexOf('tar --one-file-system'));
    expect(source).toContain('tar --one-file-system --hard-dereference');
    expect(source).toContain('trap restart_world EXIT INT TERM');
    expect(source).toContain('sha256sum -c SHA256SUMS');
    expect(source).toContain('systemctl start "$service"');
  });

  it('supports the explicit release-only leave-stopped mode without weakening the default', () => {
    expect(source).toContain('leave_stopped=${WORLD_BACKUP_LEAVE_STOPPED:-false}');
    expect(source).toContain('[[ "$leave_stopped" = true || "$leave_stopped" = false ]]');
    expect(source).toContain('"$restart_required" = true && "$leave_stopped" = false');
    expect(source).toContain('World backup verified; authority remains stopped for guarded release');
  });

  it('adds a separately checksumed rollback bundle and deployed module inventory', () => {
    expect(source).toContain('WORLD_ROLLBACK_ARTIFACTS_FILE');
    expect(source).toContain('package-rollback-artifacts.sh');
    expect(source).toContain('rollback-artifacts.tar.gz');
    expect(source).toContain('DEPLOYED-PROGRAMS.sha256');
    expect(source).toContain('ROLLBACK-SHA256SUMS');
    expect(source).toContain('rollback_bundle_version=1');
    expect(source).toContain('tar --one-file-system --hard-dereference');
    expect(source).toContain('repository/packages/assets/content/items.json');
    expect(source).toContain('repository/spacetime.local.json');
  });
});
