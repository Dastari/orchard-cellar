import ts from 'typescript';
import { normalizeItemOnUseTriggers } from '@orchard/sim';
import { assertSingleItemLifecycleCallbacks, lifecycleBundleSha256 } from './contract.js';
import type { ItemLifecycleSource, LifecycleSourceBundle } from './contract.js';

const MAX_AST_NODES = 600;
const MAX_LITERAL_LOOP_ENTRIES = 64;
const BANNED_IDENTIFIERS = new Set([
  'Bun', 'Deno', 'Date', 'Function', 'WebAssembly', 'XMLHttpRequest', 'eval', 'fetch',
  'global', 'globalThis', 'process', 'queueMicrotask', 'require', 'setImmediate',
  'setInterval', 'setTimeout',
]);
const BANNED_PROPERTIES = new Set(['__proto__', 'constructor', 'prototype']);
const ALLOWED_CONTEXT_CALLS = new Set([
  'context.item.applyEffect',
  'context.item.consume',
  'context.item.damage',
  'context.item.repair',
  'context.block',
  'context.emit',
  'context.pass',
  'context.player.consumeItem',
  'context.player.findRecipe',
  'context.player.giveItem',
  'context.player.giveRecipe',
  'context.player.hasItem',
  'context.player.restoreHunger',
]);

export interface CompiledLifecycleArtifacts {
  readonly serverTypeScript: string;
  readonly clientMetadataJson: string;
  readonly provenanceJson: string;
}

function propertyPath(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (!ts.isPropertyAccessExpression(node)) return null;
  const left = propertyPath(node.expression);
  if (left === null) return null;
  return `${left}.${node.name.text}`;
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function parseHandler(handler: Pick<ItemLifecycleSource, 'id' | 'source'>): ts.Block {
  const sourceFile = ts.createSourceFile(
    `${handler.id}.ts`,
    `function __orchardLifecycle(context: unknown) {\n${handler.source}\n}`,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
  const parseDiagnostics = (sourceFile as ts.SourceFile & {
    readonly parseDiagnostics: readonly ts.Diagnostic[];
  }).parseDiagnostics;
  if (parseDiagnostics.length > 0) {
    const diagnostic = parseDiagnostics[0];
    throw new Error(`${handler.id}: TypeScript syntax error: ${diagnostic?.messageText.toString() ?? 'unknown'}`);
  }
  const declaration = sourceFile.statements[0];
  if (sourceFile.statements.length !== 1 || !declaration || !ts.isFunctionDeclaration(declaration) || declaration.body === undefined) {
    throw new Error(`${handler.id}: lifecycle body could not be parsed`);
  }
  return declaration.body;
}

export function validateHandlerAst(
  handler: Pick<ItemLifecycleSource, 'id' | 'source'>,
  allowedCalls: ReadonlySet<string> = ALLOWED_CONTEXT_CALLS,
): void {
  const body = parseHandler(handler);
  const finiteArrays = new Set<string>();
  let nodeCount = 0;

  const visit = (node: ts.Node): void => {
    nodeCount += 1;
    if (nodeCount > MAX_AST_NODES) throw new Error(`${handler.id}: lifecycle body is too complex`);

    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.Const) === 0) {
      throw new Error(`${handler.id}: lifecycle local variables must use const`);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.initializer !== undefined && ts.isArrayLiteralExpression(node.initializer)) {
      if (node.initializer.elements.length > MAX_LITERAL_LOOP_ENTRIES) {
        throw new Error(`${handler.id}: local arrays are limited to ${MAX_LITERAL_LOOP_ENTRIES} entries`);
      }
      finiteArrays.add(node.name.text);
    }
    if (ts.isForOfStatement(node)) {
      if (!ts.isIdentifier(node.expression) || !finiteArrays.has(node.expression.text)) {
        throw new Error(`${handler.id}: for-of must iterate a local const array literal`);
      }
    }
    if (ts.isForStatement(node) || ts.isForInStatement(node)
      || ts.isWhileStatement(node) || ts.isDoStatement(node)) {
      throw new Error(`${handler.id}: potentially unbounded loops are forbidden`);
    }
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node))
      && node !== body.parent) {
      throw new Error(`${handler.id}: nested functions and classes are forbidden`);
    }
    if (ts.isAwaitExpression(node) || ts.isYieldExpression(node) || ts.isNewExpression(node)
      || ts.isDeleteExpression(node) || ts.isTaggedTemplateExpression(node)) {
      throw new Error(`${handler.id}: asynchronous, construction, deletion, and tagged-template operations are forbidden`);
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        throw new Error(`${handler.id}: dynamic imports are forbidden`);
      }
      if (ts.isNewExpression(node.expression)) {
        throw new Error(`${handler.id}: dynamic construction is forbidden`);
      }
      const path = propertyPath(node.expression);
      if (path === null || !allowedCalls.has(path)) {
        throw new Error(`${handler.id}: call is outside the lifecycle capability API: ${path ?? 'computed call'}`);
      }
    }
    if (ts.isIdentifier(node) && BANNED_IDENTIFIERS.has(node.text)) {
      throw new Error(`${handler.id}: forbidden global identifier: ${node.text}`);
    }
    if (ts.isPropertyAccessExpression(node) && BANNED_PROPERTIES.has(node.name.text)) {
      throw new Error(`${handler.id}: forbidden property: ${node.name.text}`);
    }
    if (ts.isElementAccessExpression(node)) {
      throw new Error(`${handler.id}: computed property access is forbidden`);
    }
    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
      const path = propertyPath(node.left);
      if (path?.startsWith('context.') === true) {
        throw new Error(`${handler.id}: lifecycle context is read-only; use capability methods`);
      }
    }
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))) {
      const path = propertyPath(node.operand);
      if (path?.startsWith('context.') === true) {
        throw new Error(`${handler.id}: lifecycle context is read-only; use capability methods`);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
}

/**
 * Performs the bounded capability/AST pass independently from artifact
 * generation so Studio can reject an edit before requesting a candidate build.
 */
export function validateLifecycleSourceBundleAst(bundle: LifecycleSourceBundle): void {
  assertSingleItemLifecycleCallbacks(bundle.handlers);
  for (const handler of bundle.handlers) validateHandlerAst(handler);
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
