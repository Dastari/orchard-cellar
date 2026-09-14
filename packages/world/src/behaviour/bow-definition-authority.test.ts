import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const world = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const client = readFileSync(
  new URL('../../../client/src/overworld-main.ts', import.meta.url),
  'utf8',
);

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, start).toBeGreaterThanOrEqual(0);
  expect(to, end).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('authored ranged-weapon authority', () => {
  it('keeps lifecycle bowAction as the capability gate and preflights every phase', () => {
    const writer = between(world, "if (kind === 'bowAction')", "if (kind === 'consumeSelected')");
    expect(writer).toContain('applyBowBeginLifecycle(ctx, false)');
    expect(writer).toContain('applyBowCancelLifecycle(ctx, action.chargeMs, false)');
    expect(writer).toContain(
      'applyBowFireLifecycle(ctx, action.aimX, action.aimY, action.chargeMs, false)',
    );
    expect(writer).not.toContain("selected.itemKind === 'bow'");
  });

  it('resolves the selected definition, ammunition, action, and projectile without bow ID dispatch', () => {
    const authority = between(world, 'function applyBowBeginLifecycle(', 'export const decayEmptyTopsideSoil');
    expect(authority).toContain('runtimeRangedWeaponDefinition(registry, selected.itemKind)');
    expect(authority).toContain('row.itemKind === ranged.ammunitionItemKind');
    expect(authority).toContain('actionKind: ranged.avatarAction');
    expect(authority).toContain('equippedKind: selected.itemKind');
    expect(authority).toContain('weaponItemKind: selected.itemKind');
    expect(authority).toContain('ammunitionItemKind: ranged.ammunitionItemKind');
    expect(authority).toContain('projectileKind: ranged.projectileKind');
    expect(authority).toContain("'tool_uses', 1n, clock.authorityTick, selected.itemKind");
    expect(authority).not.toContain("selected?.itemKind !== 'bow'");
    expect(authority).not.toContain("equippedKind: 'bow'");
  });

  it('binds client ammunition readiness to the subscribed content revision', () => {
    const action = between(client, 'function performToolAction(', 'interface FarmToolTarget');
    expect(action).toContain('runtimeRangedWeaponDefinition(');
    expect(action).toContain('latestSnapshot.content.registry');
    expect(client).not.toContain("itemKind === 'bow'");
  });
});
