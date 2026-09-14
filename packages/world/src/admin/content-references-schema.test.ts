import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function loaderSource(): string {
  const start = source.indexOf('function loadAdminWorldState(');
  const end = source.indexOf('\nexport const adminValidateWorld', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('admin world loader content references', () => {
  it('loads every durable authored world-row reference with its canonical resolver', () => {
    const loader = loaderSource();
    expect(loader).toContain("addDefinition('placeable', row.id.toString(), adminObjectContentReference(registry, row))");
    expect(loader).toContain("addDefinition('combat_target', row.id.toString(), adminObjectContentReference(registry, row))");
    expect(loader).toContain("addDefinition('resource', row.id.toString(), adminResourceContentReference(registry, row))");
    expect(loader).toContain("addDefinition('npc', row.id.toString(), adminNpcContentReference(registry, row))");
    expect(loader).not.toContain('retired: false');
    expect(loader).not.toContain('[...registry.npcs.values()].find');
  });

  it('passes authored definitionId-bearing resource and combat rows intact', () => {
    const loader = loaderSource();
    expect(loader).toContain('const combatTargets = take(ctx.db.world_combat_target.iter())');
    expect(loader).toContain('const resources = take(ctx.db.world_resource.iter())');
    expect(loader).toContain('adminObjectContentReference(registry, row)');
    expect(loader).toContain('adminResourceContentReference(registry, row)');
  });
});
