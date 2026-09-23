import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as sim from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';

/** Offline audit oracle: execute the actual server functions, without loading
 * SpacetimeDB or publishing a module. AST selection fails closed after renames. */
export function serverLiveIslandReference(row: LiveMapDocumentRow, registry: sim.ContentRegistry): {
  readonly ground: sim.CollisionMap;
  readonly water: sim.CollisionMap;
} {
  const source = ts.createSourceFile('world.ts', readFileSync(new URL('../packages/world/src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const names = new Set(['authoredMapCollisionObstacles', 'suppressedGeneratedDecorationObstacleKeys', 'compiledLiveIslandRuntime']);
  const functions = source.statements.filter((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && names.has(statement.name?.text ?? ''));
  if (functions.length !== names.size) throw new Error('Server parity oracle changed; review function extraction');
  const javascript = ts.transpileModule(`let liveIslandRuntimeCache = null;\n${functions.map(fn => fn.getText(source)).join('\n')}\ncompiledLiveIslandRuntime(ctx);`, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.None } }).outputText;
  const result: unknown = runInNewContext(javascript, {
    ...sim,
    LIVE_CONTENT_PACK_ID: 'live',
    contentRegistry: () => registry,
    ctx: { db: {
      live_map_document: { mapId: { find: () => row } },
      content_head: { packId: { find: () => ({ contentHash: registry.contentHash }) } },
    } },
  }, { timeout: 120_000 });
  if (result === null || typeof result !== 'object' || !('ground' in result) || !('water' in result)) throw new Error('Server rejected live island parity fixture');
  return result as { ground: sim.CollisionMap; water: sim.CollisionMap };
}
