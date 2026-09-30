import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, planNewPlayerLoadout, inventoryContainerSlotCount } from '@orchard/sim';
const source = ts.createSourceFile('index.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'grantNewPlayerRecipeKnowledge')!;
const code = ts.transpileModule(`${fn.getText(source)}; return grantNewPlayerRecipeKnowledge`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const grant = new Function(code)() as (ctx: unknown, plan: ReturnType<typeof planNewPlayerLoadout>) => void;
it('actual creation grant writes seven unique guides at the current tick; reconnects and duplicate calls add nothing', () => {
 const rows = new Map<string, { id: string; recipeId: string; learnedAtTick: bigint; sourceKind: string }>();
 const insert = vi.fn(row => rows.set(row.id, row));
 const ctx = { sender: { toHexString: () => 'new-player' }, db: { world_clock: { id: { find: () => ({ authorityTick: 42n }) } }, player_known_recipe: { id: { find: (id: string) => rows.get(id) ?? null }, insert } } };
 const registry = bootstrapContentRegistry(); const plan = (existingCharacter: boolean) => planNewPlayerLoadout(registry, { existingCharacter, containerCapacity: inventoryContainerSlotCount });
 grant(ctx, plan(true)); expect(insert).not.toHaveBeenCalled();
 grant(ctx, plan(false)); expect(rows.size).toBe(7); expect([...rows.values()].every(row => row.learnedAtTick === 42n && row.sourceKind === 'new_player')).toBe(true);
 grant(ctx, plan(false)); grant(ctx, plan(true)); expect(insert).toHaveBeenCalledTimes(7);
});
