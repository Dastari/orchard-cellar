import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifestJson from './authoring-acceptance-manifest.json';

// Machine-checked acceptance map for the authoring suite (plan 55) and Cellar
// Studio (plan 56). The human-readable status lives on the wiki page named in
// `wikiPage` (wiki: Studio/Acceptance); update both in the same change.
type Classification = 'repository_verified' | 'browser_verified' | 'external_required' | 'repository_open';
interface Entry {
  readonly id: string;
  readonly planSection: string;
  readonly statement: string;
  readonly classification: Classification;
  readonly evidence: readonly string[];
  readonly externalPrerequisites?: readonly string[];
  readonly wikiRecords?: readonly string[];
  readonly decision?: string;
}

const manifest = manifestJson as {
  readonly schemaVersion: number;
  readonly wikiPage: string;
  readonly entries: readonly Entry[];
};
const repository = resolve(import.meta.dirname, '..');
const EXPECTED_CLASSIFICATIONS: Readonly<Record<Classification, number>> = Object.freeze({
  repository_verified: 26,
  browser_verified: 5,
  external_required: 18,
  repository_open: 1,
});
const WIKI_PAGE = /^[A-Z][A-Za-z&' -]*(?:\/[A-Z0-9][A-Za-z0-9&' .-]*)+$/u;

describe('authoring and Studio acceptance manifest (wiki: Studio/Acceptance)', () => {
  it('has unique, sourced entries with honest external prerequisites', () => {
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.wikiPage).toBe('Studio/Acceptance');
    expect(manifest.entries.length).toBeGreaterThanOrEqual(25);
    expect(new Set(manifest.entries.map(({ id }) => id)).size).toBe(manifest.entries.length);
    for (const entry of manifest.entries) {
      expect(entry.id.slice(0, 3), entry.id).toBe(entry.planSection.slice(0, 2) + '-');
      expect(entry.planSection, entry.id).toMatch(/^5[56] (?:Phase|§)/u);
      expect(entry.statement.length).toBeGreaterThan(20);
      for (const page of entry.wikiRecords ?? []) expect(page, entry.id).toMatch(WIKI_PAGE);
      if (entry.classification === 'external_required') {
        expect(entry.externalPrerequisites?.length).toBeGreaterThan(0);
      } else {
        expect(entry.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every evidence path real and inside the repository', () => {
    for (const entry of manifest.entries) {
      for (const evidence of entry.evidence) {
        expect(evidence, entry.id).not.toMatch(/^(?:\/|\.\.)/u);
        expect(existsSync(resolve(repository, evidence)), `${entry.id}: ${evidence}`).toBe(true);
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
    // The owner decision itself lives in the wiki Decisions register.
    expect(policy?.decision).toBe('Decisions/55-Owner Chat Approval for Tier B');
    expect(release?.decision).toBe(policy?.decision);
    expect(policy?.statement).toContain('Owner chat approval remains a separate per-release requirement');
    expect(release?.externalPrerequisites?.join(' ')).toContain('an agent cannot infer confirmation');
    expect(release?.externalPrerequisites?.join(' ')).toContain('specific release');
    expect(release?.externalPrerequisites?.join(' ')).toContain('does not waive');
  });
});
