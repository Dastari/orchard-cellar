import { normalizeItemOnUseTriggers } from '@orchard/sim';
import { lifecycleBundleSha256 } from './contract.js';
import type { ItemLifecycleSource, LifecycleSourceBundle } from './contract.js';
import { validateLifecycleSourceBundleAst } from './validation.js';
export { validateLifecycleSourceBundleAst } from './validation.js';

export interface CompiledLifecycleArtifacts {
  readonly serverTypeScript: string;
  readonly clientMetadataJson: string;
  readonly provenanceJson: string;
}

function quoted(value: string): string {
  return JSON.stringify(value);
}

function indentBody(source: string): string {
  return source.split('\n').map((line) => `      ${line}`).join('\n');
}

function handlerSource(handler: ItemLifecycleSource): string {
  const define = handler.triggers === undefined ? 'defineItemOnUse' : 'defineItemOnUseHandlers';
  const spread = handler.triggers === undefined ? '' : '...';
  const triggers = handler.triggers === undefined
    ? ''
    : `\n    triggers: ${JSON.stringify(handler.triggers)} as const,`;
  return `  ${spread}${define}({\n    itemId: ${quoted(handler.itemId)},\n    id: ${quoted(handler.id)},\n    prompt: ${quoted(handler.prompt)},${triggers}\n    run(context) {\n${indentBody(handler.source)}\n    },\n  })`;
}

function clientMetadata(handler: ItemLifecycleSource) {
  return {
    itemId: handler.itemId,
    event: handler.event,
    id: handler.id,
    prompt: handler.prompt,
    triggers: normalizeItemOnUseTriggers(handler.triggers),
  };
}

export function compileLifecycleBundle(
  bundle: LifecycleSourceBundle,
  digest = lifecycleBundleSha256(bundle),
): CompiledLifecycleArtifacts {
  validateLifecycleSourceBundleAst(bundle);
  if (digest !== lifecycleBundleSha256(bundle)) throw new Error('compiled lifecycle digest does not match source bundle');
  const serverTypeScript = [
    '/* This file is generated from validated Orchard lifecycle source. Do not edit. */',
    "import { defineItemOnUse, defineItemOnUseHandlers, type AnyHandlerRegistration } from '@orchard/sim';",
    '',
    `export const AUTHORED_LIFECYCLE_BUNDLE_SHA256 = ${quoted(digest)} as const;`,
    '',
    'export const AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS: readonly AnyHandlerRegistration[] = Object.freeze([',
    bundle.handlers.map(handlerSource).join(',\n'),
    ']);',
    '',
    'export const AUTHORED_ITEM_LIFECYCLE_METADATA = Object.freeze([',
    bundle.handlers.map((handler) => `  Object.freeze(${JSON.stringify(clientMetadata(handler))})`).join(',\n'),
    '] as const);',
    '',
  ].join('\n');
  const clientMetadataJson = `${JSON.stringify({
    format: 'orchard-item-lifecycle-metadata-v1',
    bundleId: bundle.bundleId,
    revision: bundle.revision,
    bundleSha256: digest,
    handlers: bundle.handlers.map(clientMetadata),
  }, null, 2)}\n`;
  const provenanceJson = `${JSON.stringify({
    format: 'orchard-lifecycle-build-provenance-v1',
    bundleId: bundle.bundleId,
    revision: bundle.revision,
    bundleSha256: digest,
    handlerCount: bundle.handlers.length,
  }, null, 2)}\n`;
  return Object.freeze({ serverTypeScript, clientMetadataJson, provenanceJson });
}
