import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { AUTHORED_KIND_HOOKS, type AuthoredHook, type AuthoredHookKind } from '@orchard/sim';
import { validateHandlerAst, type CompiledLifecycleArtifacts } from './compiler.js';
export const LIFECYCLE_HOOK_SOURCE_FORMAT = 'orchard-lifecycle-source-v2' as const;
export interface LifecycleHookSource {
  readonly id: string;
  readonly definitionId: string;
  readonly kind: AuthoredHookKind;
  readonly hook: AuthoredHook;
  readonly source: string;
}
export interface LifecycleHookBundle {
  readonly format: typeof LIFECYCLE_HOOK_SOURCE_FORMAT;
  readonly bundleId: string;
  readonly revision: number;
  readonly engineApiVersion: 2;
  readonly handlers: readonly LifecycleHookSource[];
}
const stableId = /^[a-z0-9](?:[a-z0-9_.:-]{0,126}[a-z0-9])?$/u;
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new Error('invalid hook contract fields');
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !stableId.test(value)) throw new Error('hook id must be a stable lowercase id');
  return value;
}
export function parseLifecycleHookBundle(value: unknown): LifecycleHookBundle {
  const bundle = record(value, ['format', 'bundleId', 'revision', 'engineApiVersion', 'handlers']);
  if (bundle.format !== LIFECYCLE_HOOK_SOURCE_FORMAT || bundle.engineApiVersion !== 2) throw new Error('unsupported hook source format or engine API');
  if (!Number.isSafeInteger(bundle.revision) || (bundle.revision as number) < 1) throw new Error('invalid hook revision');
  if (!Array.isArray(bundle.handlers) || bundle.handlers.length > 512) throw new Error('hooks limited to 512');
  let previous = '';
  const handlers = bundle.handlers.map((value): LifecycleHookSource => {
    const h = record(value, ['id', 'definitionId', 'kind', 'hook', 'source']);
    const handlerId = id(h.id);
    if (handlerId <= previous) throw new Error('hooks must have unique ids sorted lexically');
    previous = handlerId;
    if (typeof h.kind !== 'string' || !Object.hasOwn(AUTHORED_KIND_HOOKS, h.kind)) throw new Error('unsupported hook kind');
    const kind = h.kind as AuthoredHookKind;
    if (typeof h.hook !== 'string' || !(AUTHORED_KIND_HOOKS[kind] as readonly string[]).includes(h.hook)) throw new Error('unsupported kind/hook pair');
    const definitionId = id(h.definitionId);
    if (!definitionId.startsWith(`${kind}:`)) throw new Error('hook definition kind mismatch');
    if (typeof h.source !== 'string' || !h.source.trim() || Buffer.byteLength(h.source) > 16_384 || /[\r\0]/u.test(h.source)) throw new Error('invalid hook TypeScript source');
    return Object.freeze({ id: handlerId, definitionId, kind, hook: h.hook as AuthoredHook, source: h.source });
  });
  return Object.freeze({ format: LIFECYCLE_HOOK_SOURCE_FORMAT, bundleId: id(bundle.bundleId), revision: bundle.revision as number,
    engineApiVersion: 2, handlers: Object.freeze(handlers) });
}
export function lifecycleHookBundleSha256(bundle: LifecycleHookBundle): string {
  // Parser creates fixed key order, rejecting unknown fields and canonicalising input order.
  return createHash('sha256').update(JSON.stringify(parseLifecycleHookBundle(bundle))).digest('hex');
}
function validateHook(handler: LifecycleHookSource): void {
  validateHandlerAst(handler, new Set(['context.emit', 'context.block', 'context.pass']));
  const file = ts.createSourceFile('hook.ts', `function hook(context: unknown) {\n${handler.source}\n}`, ts.ScriptTarget.ESNext, true);
  const names = new Set<string>();
  const visit = (node: ts.Node, loops: number): void => {
    if (ts.isVariableDeclaration(node)) {
      if (!ts.isIdentifier(node.name) || names.has(node.name.text)) throw new Error(`${handler.id}: shadowed or destructured variables are forbidden`);
      names.add(node.name.text);
    }
    if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)
      || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken)) throw new Error(`${handler.id}: unbounded expansion is forbidden`);
    if (ts.isForOfStatement(node)) loops += 1;
    if (loops > 1 || ts.isTryStatement(node) || ts.isThrowStatement(node)
      || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
      || ts.isMethodDeclaration(node)) throw new Error(`${handler.id}: hook control flow is not bounded`);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) throw new Error(`${handler.id}: hook mutation is forbidden`);
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) throw new Error(`${handler.id}: hook mutation is forbidden`);
    ts.forEachChild(node, child => visit(child, loops));
  };
  visit(file, 0);
}
export function compileLifecycleHookBundle(input: LifecycleHookBundle): CompiledLifecycleArtifacts {
  const bundle = parseLifecycleHookBundle(input);
  for (const handler of bundle.handlers) validateHook(handler);
  const digest = lifecycleHookBundleSha256(bundle);
  const metadata = bundle.handlers.map(({ id, definitionId, kind, hook }) => ({ id, definitionId, kind, hook }));
  const serverTypeScript = [
      '/* Generated from validated Orchard lifecycle source v2. Do not edit. */',
      ...(bundle.handlers.length === 0 ? [] : ["import { defineAuthoredLifecycle } from '@orchard/sim';"]),
      `export const AUTHORED_HOOK_BUNDLE_SHA256 = ${JSON.stringify(digest)} as const;`,
      'export const AUTHORED_LIFECYCLE_HOOKS = Object.freeze([',
      ...bundle.handlers.map(({ source, ...h }) => `  defineAuthoredLifecycle({ ...${JSON.stringify(h)}, run(context) {\n${source.split('\n').map(line => `    ${line}`).join('\n')}\n  } }),`),
      ']);', '',
    ].join('\n');
  if (bundle.handlers.length > 0) validateHookTypes(serverTypeScript);
  return Object.freeze({ serverTypeScript,
    clientMetadataJson: `${JSON.stringify({ format: 'orchard-lifecycle-hook-metadata-v2', bundleId: bundle.bundleId, revision: bundle.revision, engineApiVersion: 2, bundleSha256: digest, handlers: metadata }, null, 2)}\n`,
    provenanceJson: `${JSON.stringify({ format: 'orchard-lifecycle-build-provenance-v2', bundleId: bundle.bundleId, revision: bundle.revision, engineApiVersion: 2, bundleSha256: digest, handlerCount: bundle.handlers.length }, null, 2)}\n`,
  });
}

function validateHookTypes(source: string): void {
  const path = fileURLToPath(new URL('../generated/__hook_typecheck.ts', import.meta.url));
  const options: ts.CompilerOptions = { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: true,
    types: [], allowImportingTsExtensions: true };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, onError, shouldCreate) => name === path
    ? ts.createSourceFile(name, source, language, true) : getSourceFile(name, language, onError, shouldCreate);
  const program = ts.createProgram([path], options, host);
  const errors = ts.getPreEmitDiagnostics(program).filter(d => d.file?.fileName === path);
  if (errors.length > 0) throw new Error(`hook engine API type error: ${ts.flattenDiagnosticMessageText(errors[0]!.messageText, ' ')}`);
}
