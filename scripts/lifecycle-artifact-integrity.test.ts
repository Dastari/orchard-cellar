import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyLifecycleArtifactIntegrity } from './lifecycle-artifact-integrity.js';


const repository = resolve(import.meta.dirname, '..');
const temporaryDirectories: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'orchard-lifecycle-integrity-'));
  temporaryDirectories.push(root);
  for (const path of [
    'packages/lifecycle-authoring/source/bootstrap-item-on-use.source.json',
    'packages/lifecycle-authoring/generated/item-lifecycles.ts',
    'packages/lifecycle-authoring/generated/item-lifecycle-metadata.json',
    'packages/lifecycle-authoring/generated/build-provenance.json',
  ]) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(repository, path), target, { recursive: false });
  }
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('lifecycle generated-artifact integrity', () => {
  it('accepts the exact source, server, client metadata, and provenance set without claiming release authority', () => {
    const result = verifyLifecycleArtifactIntegrity(repository);
    expect(result.handlerCount).toBeGreaterThan(0);
    expect(result.bundleSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('rejects missing, malformed, and extra provenance fields', () => {
    const root = fixture();
    const path = join(root, 'packages/lifecycle-authoring/generated/build-provenance.json');
    const valid = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const { handlerCount, ...missing } = valid;
    expect(typeof handlerCount).toBe('number');
    for (const invalid of [missing, { ...valid, handlerCount: -1 }, { ...valid, extra: true }]) {
      writeFileSync(path, `${JSON.stringify(invalid, null, 2)}\n`);
      expect(() => verifyLifecycleArtifactIntegrity(root)).toThrow();
    }
  });

  it('rejects a generated server module whose pinned source digest drifted', () => {
    const root = fixture();
    const path = join(root, 'packages/lifecycle-authoring/generated/item-lifecycles.ts');
    writeFileSync(path, readFileSync(path, 'utf8').replace(
      /AUTHORED_LIFECYCLE_BUNDLE_SHA256 = ["'][a-f0-9]{64}["']/u,
      `AUTHORED_LIFECYCLE_BUNDLE_SHA256 = "${'0'.repeat(64)}"`,
    ));
    expect(() => verifyLifecycleArtifactIntegrity(root)).toThrow('server module');
  });

  it('rejects server callback edits even when the claimed digest is unchanged', () => {
    const root = fixture();
    const path = join(root, 'packages/lifecycle-authoring/generated/item-lifecycles.ts');
    writeFileSync(path, readFileSync(path, 'utf8').replace('context.item.consume();', 'context.item.consume(2);'));
    expect(() => verifyLifecycleArtifactIntegrity(root)).toThrow('server module');
  });

  it('rejects client metadata or provenance that no longer matches the source', () => {
    const root = fixture();
    const metadataPath = join(root, 'packages/lifecycle-authoring/generated/item-lifecycle-metadata.json');
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as { handlers: { prompt: string }[] };
    metadata.handlers[0]!.prompt = 'TAMPERED';
    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    expect(() => verifyLifecycleArtifactIntegrity(root)).toThrow('client metadata');

    cpSync(join(repository, 'packages/lifecycle-authoring/generated/item-lifecycle-metadata.json'), metadataPath);
    const provenancePath = join(root, 'packages/lifecycle-authoring/generated/build-provenance.json');
    const provenance = JSON.parse(readFileSync(provenancePath, 'utf8')) as { revision: number };
    provenance.revision += 1;
    writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
    expect(() => verifyLifecycleArtifactIntegrity(root)).toThrow('provenance');
  });
});
