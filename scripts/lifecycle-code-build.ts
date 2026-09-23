import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  compileLifecycleBundle,
  compileLifecycleHookBundle, lifecycleHookBundleSha256, parseLifecycleHookBundle,
  lifecycleBundleSha256,
  parseLifecycleSourceBundle,
} from '../packages/lifecycle-authoring/src/index.js';

function usage(): never {
  process.stderr.write(
    'Usage: tsx scripts/lifecycle-code-build.ts verify /absolute/bundle.json\n'
    + '   or: tsx scripts/lifecycle-code-build.ts build /absolute/bundle.json /absolute/output-directory\n',
  );
  process.exit(64);
}

function readSafeJson(path: string, label: string): unknown {
  if (!path.startsWith('/')) usage();
  const information = lstatSync(path);
  if (!information.isFile() || information.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file, not a link`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function writeArtifactsAtomically(
  outputDirectory: string,
  artifacts: ReturnType<typeof compileLifecycleBundle>,
  hooks = false,
): void {
  if (!outputDirectory.startsWith('/')) usage();
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const directory = lstatSync(outputDirectory);
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error('output directory must be a real directory');
  }
  const outputs = [
    [hooks ? 'lifecycle-hooks.ts' : 'item-lifecycles.ts', artifacts.serverTypeScript],
    [hooks ? 'lifecycle-hook-metadata.json' : 'item-lifecycle-metadata.json', artifacts.clientMetadataJson],
    ['build-provenance.json', artifacts.provenanceJson],
  ] as const;
  const partials: string[] = [];
  try {
    for (const [name, contents] of outputs) {
      const target = resolve(outputDirectory, name);
      if (dirname(target) !== resolve(outputDirectory)) throw new Error('unsafe generated output path');
      try {
        const current = lstatSync(target);
        if (!current.isFile() || current.isSymbolicLink()) {
          throw new Error(`generated target is not a regular file: ${name}`);
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') throw error;
      }
      const partial = `${target}.partial.${process.pid}`;
      writeFileSync(partial, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      partials.push(partial);
    }
    for (let index = 0; index < outputs.length; index += 1) {
      const output = outputs[index];
      const partial = partials[index];
      if (output === undefined || partial === undefined) throw new Error('generated artifact set is incomplete');
      renameSync(partial, resolve(outputDirectory, output[0]));
    }
  } finally {
    for (const partial of partials) rmSync(partial, { force: true });
  }
}

const [operation, bundlePath, outputDirectory, ...rest] = process.argv.slice(2);
if ((operation !== 'verify' && operation !== 'build')
  || bundlePath === undefined || rest.length > 0
  || (operation === 'verify' && outputDirectory !== undefined)
  || (operation === 'build' && outputDirectory === undefined)) usage();

try {
  const raw = readSafeJson(bundlePath, 'source bundle');
  const hooks = typeof raw === 'object' && raw !== null && 'format' in raw && raw.format === 'orchard-lifecycle-source-v2';
  const bundle = hooks ? parseLifecycleHookBundle(raw) : parseLifecycleSourceBundle(raw);
  const digest = bundle.format === 'orchard-lifecycle-source-v2' ? lifecycleHookBundleSha256(bundle) : lifecycleBundleSha256(bundle);
  const artifacts = bundle.format === 'orchard-lifecycle-source-v2' ? compileLifecycleHookBundle(bundle) : compileLifecycleBundle(bundle, digest);
  if (operation === 'build') writeArtifactsAtomically(outputDirectory!, artifacts, hooks);
  process.stdout.write(`${digest}\n`);
} catch (error) {
  process.stderr.write(`Lifecycle code rejected: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(65);
}
