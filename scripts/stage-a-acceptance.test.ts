import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertStageAEvidenceRedacted, buildStageAAcceptanceEvidence,
  type StageAObservation } from './stage-a-acceptance-evidence.js';

const alice = '01'.repeat(32);
const bob = '02'.repeat(32);

function observation(label: string, identity: string, changes: Partial<StageAObservation> = {}): StageAObservation {
  return { label, identity, connectedAt: '2026-09-04T00:00:00.000Z',
    subscriptionAppliedAt: '2026-09-04T00:00:01.000Z',
    mapRows: [{ mapId: 'live-island', revision: 8, contentHash: 'map-hash', documentJson: '{}' }],
    contentHeadRows: [{ packId: 'live', revision: 12n, contentHash: 'content-hash', definitionCount: 2 }],
    contentDefinitionRows: [{ id: 'item:apple', revision: 12n }, { id: 'object:chest', revision: 12n }],
    genericChestRows: [{ id: 81n, definitionId: 'object:chest', kind: 'chest', placedBy: alice }],
    playerPublicRows: [{ identity, displayName: label, online: true, lastActiveAtMicros: 5n }],
    playerPositionRows: [{ identity, spaceId: 0, x: 10, y: 12 }], ...changes };
}

function input() {
  return { database: 'orchard-cellar-world', host: 'https://orchard.dastari.net',
    startedAt: '2026-09-04T00:00:00.000Z', completedAt: '2026-09-04T00:00:03.000Z',
    initial: [observation('owner', alice), observation('player', bob)],
    reconnected: [observation('owner', alice), observation('player', bob)] };
}

describe('redacted Stage-A acceptance evidence', () => {
  it('proves two identities, shared heads/chests, reconnect parity, and leaves mutable/visual work not run', () => {
    const evidence = buildStageAAcceptanceEvidence(input());
    expect(evidence).toMatchObject({ status: 'read_only_preflight_passed', distinctIdentityCount: 2,
      assertions: { distinctIdentities: true, sameLiveMapHead: true, sameLiveContentHead: true,
        sameGenericChestVisibility: true, reconnectParity: true, legacyChestSurfaceSubscribed: false },
      externalScenarios: { visualCanvasReview: { status: 'not_run', evidence: null },
        mutableAdminAndUndo: { status: 'not_run', evidence: null },
        contentPublishUseRollback: { status: 'not_run', evidence: null },
        twoClientGameplayInteraction: { status: 'not_run', evidence: null } } });
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain(alice);
    expect(serialized).not.toContain(bob);
    expect(serialized).not.toMatch(/refreshToken|idToken|accessToken|authorization/iu);
    expect(evidence.initial.every(({ identityHash }) => /^[0-9a-f]{64}$/u.test(identityHash))).toBe(true);
  });

  it('fails closed on credential identity aliasing or reconnect identity drift', () => {
    expect(() => buildStageAAcceptanceEvidence({ ...input(), initial: [observation('owner', alice),
      observation('player', alice)] })).toThrow('stage_a_distinct_identities_required');
    expect(() => buildStageAAcceptanceEvidence({ ...input(), reconnected: [observation('owner', bob),
      observation('player', alice)] })).toThrow('stage_a_reconnect_identity_drift');
  });

  it('fails closed on missing rows, subscription-scope leaks, and shared/reconnect parity changes', () => {
    expect(() => buildStageAAcceptanceEvidence({ ...input(), initial: [observation('owner', alice),
      observation('player', bob, { mapRows: [] })] })).toThrow('stage_a_required_singleton:liveMapDocument');
    expect(() => buildStageAAcceptanceEvidence({ ...input(), initial: [observation('owner', alice),
      observation('player', bob, { playerPublicRows: [{ identity: alice }] })] }))
      .toThrow('stage_a_player_identity_scope_mismatch');
    expect(() => buildStageAAcceptanceEvidence({ ...input(), initial: [observation('owner', alice),
      observation('player', bob, { genericChestRows: [{ id: 9n, definitionId: 'object:furnace' }] })] }))
      .toThrow('stage_a_non_generic_chest_row');
    expect(() => buildStageAAcceptanceEvidence({ ...input(), initial: [observation('owner', alice),
      observation('player', bob, { mapRows: [{ mapId: 'live-island', revision: 9, contentHash: 'other' }] })] }))
      .toThrow('stage_a_initial_shared_surface_mismatch');
    expect(() => buildStageAAcceptanceEvidence({ ...input(), reconnected: [observation('owner', alice),
      observation('player', bob, { playerPositionRows: [{ identity: bob, spaceId: 0, x: 99, y: 12 }] })] }))
      .toThrow('stage_a_reconnect_parity_failed');
  });

  it('rejects credential-shaped fields in any evidence object', () => {
    expect(() => assertStageAEvidenceRedacted({ nested: { refreshToken: 'secret' } }))
      .toThrow('stage_a_evidence_sensitive_field:refreshToken');
  });
});

describe('Stage-A live harness safety contract', () => {
  const source = readFileSync(new URL('./stage-a-acceptance.ts', import.meta.url), 'utf8');
  const credentialSource = readFileSync(new URL('./world-rejoin-credentials.ts', import.meta.url), 'utf8');

  it('loads without opening a connection or requiring CLI credentials', async () => {
    await expect(import('./stage-a-acceptance.js')).resolves.toMatchObject({ main: expect.any(Function) });
  });

  it('requires a private refresh-capable multi-identity file and rotates it atomically', () => {
    expect(source).toContain("process.env['STAGE_A_CREDENTIALS_FILE']");
    expect(source).not.toContain("process.env['WORLD_REJOIN_TOKEN']");
    expect(source).toContain('refreshRejoinCredentialFile({');
    expect(source).toContain('minimumCredentials: 2');
    expect(source).toContain('requireRefresh: true');
    expect(credentialSource).toContain('(metadata.mode & 0o777) !== 0o600');
    expect(credentialSource).toContain("open(lockPath, 'wx', 0o600)");
    expect(credentialSource).toContain('persistCredentialCheckpoint(options.path, stored, expectedFingerprint)');
    expect(source).toContain("grant_type: 'refresh_token'");
    expect(credentialSource).toContain("open(temporary, 'wx', 0o600)");
    expect(source).toContain('verifyIdTokenSignature');
    expect(source).toContain('validateIdTokenClaims');
  });

  it('checks bindings before credentials and subscribes only the six targeted read surfaces', () => {
    const main = source.slice(source.indexOf('export async function main'));
    expect(main.indexOf('assertCurrentBindings()')).toBeLessThan(main.indexOf('loadCredentials()'));
    const queries = source.slice(source.indexOf('function targetedQueries'), source.indexOf('function subscribe'));
    for (const table of ['liveMapDocument', 'contentHead', 'contentDefinition', 'worldPlaceable',
      'playerPublic', 'playerPosition']) expect(queries).toContain(`tables.${table}`);
    expect(queries).toContain("definitionId.eq('object:chest')");
    expect(queries).not.toMatch(/worldChest|ownOpenChest|ownActiveChest/);
    expect(source).not.toMatch(/\.reducers\b|callReducer|subscribeToAllTables/);
    expect(source).toContain('.onApplied(');
    expect(source).toContain('.onError(');
  });

  it('disconnects both phases and writes a new mode-0600 redacted evidence file', () => {
    expect(source).toContain("open(path, 'wx', 0o600)");
    expect(source).toContain('file.chmod(0o600)');
    expect(source.match(/capturePhase\(credentials,/gu)).toHaveLength(2);
    expect(source).toContain('client.connection.disconnect()');
    expect(source).toContain('assertStageAEvidenceRedacted(evidence)');
  });
});
