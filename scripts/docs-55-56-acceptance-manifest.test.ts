import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifestJson from './docs-55-56-acceptance-manifest.json';

type Classification = 'repository_verified' | 'browser_verified' | 'external_required' | 'repository_open';
interface Entry {
  readonly id: string;
  readonly source: string;
  readonly sourceAnchors: readonly string[];
  readonly statement: string;
  readonly classification: Classification;
  readonly evidence: readonly string[];
  readonly externalPrerequisites?: readonly string[];
}

const manifest = manifestJson as { readonly schemaVersion: number; readonly entries: readonly Entry[] };
const repository = resolve(import.meta.dirname, '..');
const EXPECTED_CLASSIFICATIONS: Readonly<Record<Classification, number>> = Object.freeze({
  repository_verified: 26,
  browser_verified: 5,
  external_required: 18,
  repository_open: 1,
});

describe('docs 55/56 acceptance manifest', () => {
  it('has unique, sourced entries with honest external prerequisites', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.entries.length).toBeGreaterThanOrEqual(25);
    expect(new Set(manifest.entries.map(({ id }) => id)).size).toBe(manifest.entries.length);
    for (const entry of manifest.entries) {
      expect(entry.source).toMatch(/^docs\/(?:55-game-authoring-suite|56-orchard-studio)\.md:\d/u);
      expect(entry.statement.length).toBeGreaterThan(20);
      if (entry.classification === 'external_required') {
        expect(entry.externalPrerequisites?.length).toBeGreaterThan(0);
      } else {
        expect(entry.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps evidence paths real and source lines pinned to their matching acceptance paragraphs', () => {
    for (const entry of manifest.entries) {
      for (const evidence of entry.evidence) expect(existsSync(resolve(repository, evidence)), evidence).toBe(true);
      const [document, lineText] = entry.source.split(':');
      const referencedLines = lineText?.split(',').map(Number) ?? [];
      const sourceLines = readFileSync(resolve(repository, document ?? ''), 'utf8').split('\n');
      expect(referencedLines.length, entry.id).toBeGreaterThan(0);
      expect(entry.sourceAnchors.length, entry.id).toBe(referencedLines.length);
      for (const [index, referencedLine] of referencedLines.entries()) {
        expect(sourceLines.length).toBeGreaterThanOrEqual(referencedLine);
        expect(sourceLines[referencedLine - 1]?.trim().length, entry.id).toBeGreaterThan(10);
        expect(sourceLines[referencedLine - 1], entry.id).toBe(entry.sourceAnchors[index]);
      }
    }
  });

  it('does not mark credential-dependent live workflows as repository-verified', () => {
    const credentialDependent = manifest.entries.filter(({ statement }) => /OIDC|authenticated|online player|deployed live|second client|two clients|two-tab/iu.test(statement));
    expect(credentialDependent.length).toBeGreaterThan(5);
    expect(credentialDependent.every(({ classification }) => classification === 'external_required')).toBe(true);
  });

  it('keeps the documented classification summary exact and browser claims evidenced by browser records', () => {
    const counts = Object.fromEntries(Object.keys(EXPECTED_CLASSIFICATIONS).map((classification) => [
      classification,
      manifest.entries.filter((entry) => entry.classification === classification).length,
    ]));
    expect(counts).toEqual(EXPECTED_CLASSIFICATIONS);
    for (const entry of manifest.entries.filter(({ classification }) => classification === 'browser_verified')) {
      expect(entry.evidence.some((path) => path.endsWith('.json') || path.endsWith('.html')), entry.id).toBe(true);
    }
  });

  it('separates the completed Stage-A record from the next-rollout obligation', () => {
    expect(manifest.entries.find(({ id }) => id === '56-stage-a-continuity-record')?.classification)
      .toBe('repository_verified');
    expect(manifest.entries.find(({ id }) => id === '56-tests-world-continuity-next-rollout')?.classification)
      .toBe('external_required');
  });

  it('records per-release chat approval separately from repository validation', () => {
    const policy = manifest.entries.find(({ id }) => id === '55-tier-b-chat-approval');
    const release = manifest.entries.find(({ id }) => id === '56-phase-4-chat-approved-release');
    expect(policy?.classification).toBe('repository_verified');
    expect(release?.classification).toBe('external_required');
    expect(release?.externalPrerequisites?.join(' ')).toContain('an agent cannot infer confirmation');
    const decisions = readFileSync(resolve(repository, 'DECISIONS.md'), 'utf8');
    expect(decisions).toContain('Tier-B releases are approved by the owner verbally in chat');
    expect(decisions).toContain('revisit if a second person ever joins');
    expect(release?.externalPrerequisites?.join(' ')).toContain('specific release');
    expect(release?.externalPrerequisites?.join(' ')).toContain('does not waive');
  });
});
