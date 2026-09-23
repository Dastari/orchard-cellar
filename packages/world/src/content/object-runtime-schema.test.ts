import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, start).toBeGreaterThanOrEqual(0);
  expect(to, end).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('authored object runtime integration', () => {
  it('appends migration-safe identity and JSON state without rewriting existing rows', () => {
    const table = between('const world_placeable = table(', 'const world_placeable_slot = table(');
    expect(table.indexOf('processInputKind:')).toBeLessThan(table.indexOf('definitionId:'));
    expect(table).toContain("definitionId: t.string().default('')");
    expect(table).toContain("stateJson: t.string().default('{}')");
  });

  it('resolves snapshots and handlers from the exact durable content head', () => {
    const bridge = between(
      '// --- authoring lane 55-B0: generic behaviour authority bridge ---',
      '// --- end authoring lane 55-B0 behaviour authority bridge ---',
    );
    expect(source).toContain("from './content/object-runtime.js'");
    expect(bridge).toContain('objectGraphRegistryForContent(');
    expect(bridge).toContain('cachedContentRegistry(ctx)');
    expect(bridge).toContain('resolvePlaceableObject(');
    expect(bridge).toContain('definitionId: resolved.definitionId');
    expect(bridge).toContain('runtimeObjectDamageable(registry, row)');
    expect(bridge).toContain('runtimeObjectCarry(registry, row)');
    expect(bridge).toContain("...(damageable === null ? [] : ['damageable'])");
    expect(bridge).toContain("...(carry === null ? [] : ['carryable'])");
    expect(bridge).not.toContain('const chest = genericChest(row)');
    expect(bridge).toContain('handlers: (ctx) => currentWorldBehaviourHandlers(ctx)');
  });

  it('preflights and applies typed state/light plans while retaining compatibility mirrors', () => {
    const bridge = between(
      '// --- authoring lane 55-B0: generic behaviour authority bridge ---',
      '// --- end authoring lane 55-B0 behaviour authority bridge ---',
    );
    expect(bridge.match(/planPlaceableStateEffect\(/gu)?.length).toBeGreaterThanOrEqual(4);
    expect(bridge.match(/planPlaceableLightEffect\(/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(bridge).toContain('ctx.db.world_placeable.id.update({ ...row, ...plan })');
    expect(bridge).toContain('const litRow = { ...row, ...plan }');
  });
});
