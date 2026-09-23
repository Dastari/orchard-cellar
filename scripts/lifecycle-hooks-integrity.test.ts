import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyLifecycleHookArtifactIntegrity } from './lifecycle-artifact-integrity.js';
const repository = resolve(import.meta.dirname, '..');
describe('v2 lifecycle artifact integrity', () => {
  it('checks the installed empty bundle', () => { expect(() => verifyLifecycleHookArtifactIntegrity(repository)).not.toThrow(); });
  it.each(['lifecycle-hooks.ts', 'lifecycle-hook-metadata.json', 'build-provenance.json'])('rejects tampered %s', name => {
    const root = mkdtempSync(resolve(tmpdir(), 'orchard-hooks-'));
    try {
      cpSync(resolve(repository, 'packages/lifecycle-authoring/source/hooks'), resolve(root, 'packages/lifecycle-authoring/source/hooks'), { recursive: true });
      cpSync(resolve(repository, 'packages/lifecycle-authoring/generated/hooks'), resolve(root, 'packages/lifecycle-authoring/generated/hooks'), { recursive: true });
      writeFileSync(resolve(root, 'packages/lifecycle-authoring/generated/hooks', name), 'tampered');
      expect(() => verifyLifecycleHookArtifactIntegrity(root)).toThrow('differs from source');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
