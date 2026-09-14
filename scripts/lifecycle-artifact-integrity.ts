import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  compileLifecycleBundle,
  lifecycleBundleSha256,
  parseLifecycleSourceBundle,
} from '../packages/lifecycle-authoring/src/index.js';

interface JsonRecord {
  readonly [key: string]: unknown;
}

function record(value: unknown, label: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value as number;
}

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export interface LifecycleArtifactIntegrityResult {
  readonly bundleId: string;
  readonly revision: number;
  readonly bundleSha256: string;
  readonly handlerCount: number;
}

/**
 * Proves that the checked-in server module and code-free client metadata still
 * identify the exact validated source bundle. Release authorization is a human
 * procedure and is not inferred from deterministic build provenance.
 */
export function verifyLifecycleArtifactIntegrity(repository: string): LifecycleArtifactIntegrityResult {
  const sourcePath = resolve(repository, 'packages/lifecycle-authoring/source/bootstrap-item-on-use.source.json');
  const serverPath = resolve(repository, 'packages/lifecycle-authoring/generated/item-lifecycles.ts');
  const metadataPath = resolve(repository, 'packages/lifecycle-authoring/generated/item-lifecycle-metadata.json');
  const provenancePath = resolve(repository, 'packages/lifecycle-authoring/generated/build-provenance.json');

  const rawSource = record(json(sourcePath), 'lifecycle source bundle');
  const bundle = parseLifecycleSourceBundle(rawSource);
  const digest = lifecycleBundleSha256(bundle);
  const serverSource = readFileSync(serverPath, 'utf8');
  const provenance = record(json(provenancePath), 'lifecycle build provenance');
  const expected = compileLifecycleBundle(bundle, digest);
  if (serverSource !== expected.serverTypeScript) {
    throw new Error('generated lifecycle server module is not the deterministic output of the source bundle');
  }

  const metadata = record(json(metadataPath), 'lifecycle client metadata');
  if (metadata.format !== 'orchard-item-lifecycle-metadata-v1') {
    throw new Error('generated lifecycle client metadata has an unsupported format');
  }
  if (text(metadata.bundleId, 'metadata.bundleId') !== bundle.bundleId
    || integer(metadata.revision, 'metadata.revision') !== bundle.revision
    || text(metadata.bundleSha256, 'metadata.bundleSha256') !== digest) {
    throw new Error('generated lifecycle client metadata identity does not match source bundle');
  }
  if (!Array.isArray(metadata.handlers)) throw new Error('metadata.handlers must be an array');
  if (`${JSON.stringify(metadata, null, 2)}\n` !== expected.clientMetadataJson) {
    throw new Error('generated lifecycle client metadata is not the deterministic output of the source bundle');
  }

  if (provenance.format !== 'orchard-lifecycle-build-provenance-v1'
    || text(provenance.bundleId, 'provenance.bundleId') !== bundle.bundleId
    || integer(provenance.revision, 'provenance.revision') !== bundle.revision
    || text(provenance.bundleSha256, 'provenance.bundleSha256') !== digest) {
    throw new Error('generated lifecycle provenance does not match source bundle');
  }
  if (`${JSON.stringify(provenance, null, 2)}\n` !== expected.provenanceJson) {
    throw new Error('generated lifecycle provenance is not the deterministic output of the source bundle');
  }

  return Object.freeze({
    bundleId: bundle.bundleId,
    revision: bundle.revision,
    bundleSha256: digest,
    handlerCount: bundle.handlers.length,
  });
}

const entryPath = process.argv[1] === undefined ? '' : resolve(process.argv[1]);
if (entryPath === resolve(import.meta.filename)) {
  try {
    const repository = process.argv[2] === undefined ? process.cwd() : resolve(process.argv[2]);
    const result = verifyLifecycleArtifactIntegrity(repository);
    process.stdout.write(`${result.bundleSha256} ${result.handlerCount}\n`);
  } catch (error) {
    process.stderr.write(`Lifecycle artifact integrity failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 65;
  }
}
