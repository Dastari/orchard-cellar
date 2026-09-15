import { chmodSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  buildContentRegistry,
  contentDefinitionsHash,
  contentDefinitionRowsHash,
} from '../packages/sim/src/content/registry.js';
import { bootstrapContentDefinitions } from '../packages/sim/src/content/bootstrap-registry.js';
import {
  serializeContentDefinitionForTransport,
  type SupportedContentDefinition,
} from '../packages/sim/src/content/definitions.js';
import {
  CONTENT_HEAD_CAPTURE_FORMAT,
  artifactSha256,
  canonicalArtifactBytes,
  parseContentHeadCandidate,
  parseHistoricalContentHeadCandidate,
  parseContentHeadCapture,
  prepareContentHeadCandidate,
  verifyCandidateAgainstBootstrap,
  type ContentHeadCapture,
  type ReleaseDefinition,
} from './content-head-release.js';

function rows(
  definitions: readonly SupportedContentDefinition[],
  revision = '1',
): readonly ReleaseDefinition[] {
  return [...definitions].sort((left, right) => left.id.localeCompare(right.id)).map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    revision,
    hash: contentDefinitionsHash([definition]),
    json: serializeContentDefinitionForTransport(definition),
  }));
}

function capture(
  definitions: readonly SupportedContentDefinition[],
  options: { readonly revision?: string; readonly mutation?: string } = {},
): ContentHeadCapture {
  const built = buildContentRegistry(rows(definitions));
  if (!built.report.valid) throw new Error('invalid test content');
  return parseContentHeadCapture({
    format: CONTENT_HEAD_CAPTURE_FORMAT,
    database: 'orchard-cellar-world',
    capturedAt: '2026-09-05T00:00:00.000Z',
    head: {
      packId: 'live',
      revision: options.revision ?? '1',
      contentHash: built.registry.contentHash,
      engineVersion: 1,
      definitionCount: definitions.length,
      clientMutationId: options.mutation ?? 'bootstrap-content-v1',
    },
    definitions: rows(definitions, options.revision ?? '1'),
  });
}

function prepare(current: ContentHeadCapture, priorCandidate?: ReturnType<typeof prepareContentHeadCandidate>) {
  return prepareContentHeadCandidate({
    capture: current,
    captureSha256: artifactSha256(canonicalArtifactBytes(current)),
    reviewer: 'release-reviewer',
    changeRequest: 'ORCHARD-55-content-head',
    reviewedAt: '2026-09-05T00:05:00.000Z',
    priorCandidate,
    ...(priorCandidate === undefined ? {} : { priorCandidateSha256: 'a'.repeat(64) }),
  });
}

describe('content-head compatibility release candidate', () => {
  it('captures historical payloads without rewriting parser defaults or their fingerprints', () => {
    const current = capture(bootstrapContentDefinitions());
    const definitions = current.definitions.map((row) => {
      if (row.id !== 'item:wood') return row;
      const payload = JSON.parse(row.json) as Record<string, unknown>;
      payload['quality'] = 'common';
      const historical = { ...row, json: JSON.stringify(payload) };
      return { ...historical, hash: contentDefinitionRowsHash([historical]) };
    });
    const historical = {
      ...current, definitions,
      head: { ...current.head, contentHash: contentDefinitionRowsHash(definitions) },
    };
    const verified = parseContentHeadCapture(historical);
    expect(verified.definitions).toEqual(definitions);
    expect(verified.head.contentHash).not.toBe(buildContentRegistry(definitions).registry.contentHash);
    const candidate = prepare(verified);
    expect(candidate.upserts.map(({ id }) => id)).toEqual(['item:wood']);
    expect(candidate.expectedDefinitions).toEqual(definitions);
    expect(() => parseContentHeadCapture({ ...historical, head: current.head }))
      .toThrow('content_release_registry_hash_mismatch');
  });

  it('verifies raw row fingerprints even when parsing discards an unknown field', () => {
    const current = capture(bootstrapContentDefinitions());
    const definitions = current.definitions.map((row) => row.id !== 'item:wood' ? row : {
      ...row, json: JSON.stringify({ ...JSON.parse(row.json), incidentTamper: true }),
    });
    expect(() => parseContentHeadCapture({
      ...current, definitions,
      head: { ...current.head, contentHash: contentDefinitionRowsHash(definitions) },
    })).toThrow('content_release_definition_fingerprint_mismatch:item:wood');
  });

  it('prepares an additive exact-bootstrap CAS from a pristine captured head', () => {
    const target = bootstrapContentDefinitions();
    const changedId = target.find(({ kind }) => kind === 'balance')!.id;
    const old = target.map((definition) => definition.id === changedId && definition.kind === 'balance'
      ? { ...definition, value: definition.value + 1 }
      : definition);
    const current = capture(old);
    const candidate = prepare(current);

    expect(candidate.expectedHead).toEqual(current.head);
    expect(candidate.upserts).toHaveLength(1);
    expect(candidate.upserts[0]?.id).toBe(changedId);
    expect(candidate.deletes).toEqual([]);
    expect(candidate.resultingHead.revision).toBe('2');
    expect(() => verifyCandidateAgainstBootstrap(candidate)).not.toThrow();
    expect(parseContentHeadCandidate(JSON.parse(canonicalArtifactBytes(candidate).toString('utf8'))))
      .toEqual(candidate);
  });

  it('preserves custom live definitions and never emits deletes', () => {
    const target = bootstrapContentDefinitions();
    const prior = prepare(capture(target));
    const custom: SupportedContentDefinition = {
      id: 'balance:custom_live_limit', kind: 'balance', schemaVersion: 1,
      group: 'custom.live', value: 7, unit: 'count', description: 'Custom live-only definition.',
    };
    const current = capture([...target, custom], { revision: '2', mutation: 'studio.custom.add' });
    const candidate = prepare(current, prior);

    expect(candidate.upserts).toEqual([]);
    expect(candidate.deletes).toEqual([]);
    expect(candidate.preservedCustomIds).toEqual(['balance:custom_live_limit']);
    expect(candidate.resultingHead).toEqual({
      revision: '2', contentHash: current.head.contentHash, definitionCount: target.length + 1,
      engineVersion: 1,
    });
  });

  it('forces a safe CAS advance when only the content engine version is stale', () => {
    const current = capture(bootstrapContentDefinitions());
    const stale = parseContentHeadCapture({ ...current, head: { ...current.head, engineVersion: 0 } });
    const candidate = prepare(stale);
    expect(candidate.upserts).toHaveLength(1);
    expect(candidate.resultingHead.revision).toBe('2');
    expect(candidate.resultingHead.engineVersion).toBe(1);
  });

  it('fails closed when a target-owned row diverged after an approved base', () => {
    const target = bootstrapContentDefinitions();
    const prior = prepare(capture(target));
    const changedId = target.find(({ kind }) => kind === 'balance')!.id;
    const changed = target.map((definition) => definition.id === changedId && definition.kind === 'balance'
      ? { ...definition, value: definition.value + 1 }
      : definition);
    const current = capture(changed, { revision: '2', mutation: 'studio.custom.1' });

    expect(() => prepare(current, prior)).toThrow(`content_release_custom_conflict:${changedId}`);
  });

  it('requires a prior approved target after the pristine bootstrap head', () => {
    const current = capture(bootstrapContentDefinitions(), { revision: '2', mutation: 'release.content.old' });
    expect(() => prepare(current)).toThrow('content_release_prior_approved_candidate_required');
  });

  it('rejects deletion or result tampering in a reviewed candidate', () => {
    const candidate = prepare(capture(bootstrapContentDefinitions()));
    expect(() => parseContentHeadCandidate({ ...candidate, deletes: ['item:custom'] }))
      .toThrow('content_release_deletes_forbidden');
    expect(() => parseContentHeadCandidate({
      ...candidate,
      resultingHead: { ...candidate.resultingHead, contentHash: 'forged' },
    })).toThrow('content_release_result_mismatch');
  });

  it('writes an offline digest-pinned owner-immutable handoff artifact', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orchard-content-head-'));
    try {
      const capturePath = join(directory, 'capture.json');
      const candidatePath = join(directory, 'candidate.json');
      const current = capture(bootstrapContentDefinitions());
      writeFileSync(capturePath, canonicalArtifactBytes(current), { mode: 0o600 });
      chmodSync(capturePath, 0o600);
      const result = spawnSync('npx', [
        '--no-install', 'tsx', 'scripts/content-head-release.ts', 'prepare', capturePath, candidatePath,
      ], {
        cwd: new URL('..', import.meta.url), encoding: 'utf8',
        env: { ...process.env, CONTENT_HEAD_REVIEWER: 'release-reviewer',
          CONTENT_HEAD_CHANGE_REQUEST: 'ORCHARD-55-offline-review' },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(lstatSync(candidatePath).mode & 0o777).toBe(0o400);
      const bytes = readFileSync(candidatePath);
      const digest = artifactSha256(bytes);
      expect(result.stdout.trim()).toBe(digest);
      expect(parseContentHeadCandidate(JSON.parse(bytes.toString('utf8')))).toBeTruthy();
      const verified = spawnSync('npx', [
        '--no-install', 'tsx', 'scripts/content-head-release.ts', 'verify',
        candidatePath, digest, 'release-owner',
      ], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
      expect(verified.status, verified.stderr).toBe(0);
      expect(JSON.parse(verified.stdout)).toMatchObject({ ok: true, mode: 'verify', digest });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});


describe('release across content parser versions', () => {
  function historical() {
    const current = capture(bootstrapContentDefinitions());
    const definitions = current.definitions.map(row => {
      if (row.id !== 'upgrade:barrel_cellar') return row;
      const payload = JSON.parse(row.json);
      delete payload.mechanic; // Exact revision-9 shape, now required by the runtime.
      const old = { ...row, json: JSON.stringify(payload) };
      return { ...old, hash: contentDefinitionRowsHash([old]) };
    });
    const hash = contentDefinitionRowsHash(definitions);
    const captured = parseContentHeadCapture({ ...current, definitions,
      head: { ...current.head, contentHash: hash } });
    const template = prepare(current);
    const prior = { ...template, baselineDefinitions: definitions, expectedDefinitions: definitions,
      targetDefinitions: definitions, expectedHead: captured.head,
      baseline: { ...template.baseline, contentHash: hash },
      targetBootstrap: { ...template.targetBootstrap, contentHash: hash },
      resultingHead: { ...template.resultingHead, contentHash: hash }, upserts: [] };
    return { captured, prior };
  }

  it('reads a historical approved artifact and upgrades its old fields without rewriting captured evidence', () => {
    const { captured, prior } = historical();
    expect(buildContentRegistry(captured.definitions).report.valid).toBe(false);
    expect(() => parseContentHeadCandidate(prior)).toThrow('content_release_registry_invalid');
    const approved = parseHistoricalContentHeadCandidate(prior);
    const next = prepare(captured, approved);
    expect(next.upserts.map(row => row.id)).toEqual(['upgrade:barrel_cellar']);
    expect(next.expectedDefinitions).toEqual(captured.definitions);
    expect(() => verifyCandidateAgainstBootstrap(parseContentHeadCandidate(next))).not.toThrow();
    expect(() => verifyCandidateAgainstBootstrap(approved)).toThrow();
  });

  it('rejects altered fingerprints, identities, truncated captures and forged historical results', () => {
    const { captured, prior } = historical();
    const first = captured.definitions[0]!;
    expect(() => parseContentHeadCapture({ ...captured, definitions: captured.definitions.slice(1) }))
      .toThrow('content_release_capture_count_mismatch');
    const altered = { ...first, json: JSON.stringify({ ...JSON.parse(first.json), id: 'item:imposter' }) };
    expect(() => parseContentHeadCapture({ ...captured, definitions: [altered, ...captured.definitions.slice(1)] }))
      .toThrow('content_release_definition_identity_mismatch');
    expect(() => parseHistoricalContentHeadCandidate({ ...prior,
      resultingHead: { ...prior.resultingHead, contentHash: '00000000' } })).toThrow('content_release_result_mismatch');
  });

  it('preserves conflict detection and rejects obsolete custom content in the resulting registry', () => {
    const { captured, prior } = historical();
    const edited = captured.definitions.map(row => {
      if (row.id !== 'upgrade:barrel_cellar') return row;
      const changed = { ...row, json: JSON.stringify({ ...JSON.parse(row.json), baseCostGold: 999 }) };
      return { ...changed, hash: contentDefinitionRowsHash([changed]) };
    });
    const changedCapture = parseContentHeadCapture({ ...captured, definitions: edited,
      head: { ...captured.head, contentHash: contentDefinitionRowsHash(edited) } });
    expect(() => prepare(changedCapture, parseHistoricalContentHeadCandidate(prior)))
      .toThrow('content_release_custom_conflict');
    const custom = { id: 'upgrade:custom', kind: 'upgrade', revision: '1', json: '{"id":"upgrade:custom","kind":"upgrade","schemaVersion":1}', hash: '' };
    custom.hash = contentDefinitionRowsHash([custom]);
    const definitions = [...captured.definitions, custom];
    const withCustom = parseContentHeadCapture({ ...captured, definitions,
      head: { ...captured.head, definitionCount: definitions.length, contentHash: contentDefinitionRowsHash(definitions) } });
    expect(() => prepare(withCustom, parseHistoricalContentHeadCandidate(prior)))
      .toThrow('content_release_registry_invalid');
  });
});
