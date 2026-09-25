/** Test helper: static value-import graph walk that reports which legacy
 * generator modules a source file can reach (static-world S6a boundary tests).
 * Only value imports count; type-only imports are erased at build time. The
 * walk follows relative imports and `@orchard/*` package exports, and stops at
 * a legacy module. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const PACKAGES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The island generator, the map compiler, the whole-map document, the sim
 * barrel (which re-exports all of them), and the engine modules the client
 * build gate counts as legacy. */
export const LEGACY_MODULE = /\/packages\/(?:sim\/src\/(?:index|procedural-terrain[^/]*|survival-world[^/]*|map-compiler[^/]*|map-document-v3)|engine\/src\/(?:terrain|live-map-runtime|editor-terrain))\.ts$/u;

export function valueImportSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false);
  const specifiers: string[] = [];
  for (const statement of source.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
    if (statement.moduleSpecifier === undefined || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const named = clause?.namedBindings;
      if (clause !== undefined && clause.name === undefined && named !== undefined && ts.isNamedImports(named)
        && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly)) continue;
    } else {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      if (clause !== undefined && ts.isNamedExports(clause) && clause.elements.length > 0
        && clause.elements.every((element) => element.isTypeOnly)) continue;
    }
    specifiers.push(statement.moduleSpecifier.text);
  }
  return specifiers;
}

export function packageExports(packageName: string): Record<string, string> {
  const manifest = JSON.parse(readFileSync(resolve(PACKAGES_ROOT, packageName, 'package.json'), 'utf8')) as { exports: Record<string, string> };
  return manifest.exports;
}

export function packageExport(packageName: string, subpath: string): string {
  const exports = packageExports(packageName);
  const exact = exports[subpath];
  const wildcard = exports['./*'];
  const target = exact ?? (wildcard === undefined ? undefined : wildcard.replace('*', subpath.slice(2)));
  if (target === undefined) throw new Error(`@orchard/${packageName} does not export ${subpath}`);
  return resolve(PACKAGES_ROOT, packageName, target);
}

export function resolveImport(from: string, specifier: string): string | null {
  if (specifier.startsWith('.')) {
    const base = resolve(dirname(from), specifier).replace(/\.js$/u, '');
    for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
      if (/\.(?:ts|json)$/u.test(candidate) && existsSync(candidate)) return candidate;
    }
    throw new Error(`Unresolved import ${specifier} from ${from}`);
  }
  const match = /^@orchard\/([^/]+)(\/.*)?$/u.exec(specifier);
  if (match === null) return null;
  return packageExport(match[1]!, match[2] === undefined ? '.' : `.${match[2]}`);
}

/** Legacy modules reachable from `entry` (not counting `entry` itself), as
 * paths relative to `packages/`. Empty when the module is generator-free. */
export function legacyModulesReachedFrom(entry: string): string[] {
  const found = new Set<string>();
  const seen = new Set<string>();
  const stack = valueImportSpecifiers(entry).map((specifier) => resolveImport(entry, specifier)).filter((file): file is string => file !== null);
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (LEGACY_MODULE.test(file)) { found.add(file.slice(PACKAGES_ROOT.length + 1)); continue; }
    if (!file.endsWith('.ts')) continue;
    for (const next of valueImportSpecifiers(file)) {
      const resolved = resolveImport(file, next);
      if (resolved !== null) stack.push(resolved);
    }
  }
  return [...found].sort();
}
