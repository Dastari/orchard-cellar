import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');

function between(source: string, startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('authored melee complete preflight', () => {
  it('preflights the exact resolved target before recording the planned effect', () => {
    const writer = between(
      worldSource,
      "if (kind === 'meleeAttack')",
      "if (kind === 'fishing')",
    );
    expect(writer).toContain('const attackTarget: SwordMeleeTarget =');
    expect(writer).toContain('applySwordMeleeLifecycle(ctx, attackTarget, false);');
    expect(writer.indexOf('applySwordMeleeLifecycle(ctx, attackTarget, false);'))
      .toBeLessThan(writer.indexOf('plannedMeleeAttack = attackTarget;'));
  });

  it('checks authority, equipment, target state, facing, reach, and Vigour before writes', () => {
    const melee = between(
      worldSource,
      'function applySwordMeleeLifecycle(',
      'function applyHarvestResourceLifecycle(',
    );
    const targetBranch = melee.indexOf('const targetId = attackTarget.id;');
    const targetValidity = melee.indexOf("throw new SenderError('target_not_ready')", targetBranch);
    const facingCheck = melee.indexOf("throw new SenderError('invalid_facing')", targetValidity);
    const reachCheck = melee.indexOf("throw new SenderError('target_out_of_range')", facingCheck);
    const preflight = melee.indexOf('if (!mutate) {', reachCheck);
    const firstTargetWrite = melee.indexOf('spendToolVigour(', preflight);

    expect(melee.slice(0, targetBranch)).toContain('requireAuthorizedSender(');
    expect(melee.slice(0, targetBranch)).toContain("!runtimeItemHasTag(registry, slot.itemKind, 'item.melee_weapon')");
    expect(melee.slice(0, targetBranch)).toContain('requireUsableTool(');
    expect(melee.slice(0, targetBranch)).toContain('handsOccupiedFor(');
    expect(melee.slice(0, targetBranch)).toContain('mountedNpcFor(');
    expect(targetValidity).toBeGreaterThan(targetBranch);
    expect(facingCheck).toBeGreaterThan(targetValidity);
    expect(reachCheck).toBeGreaterThan(facingCheck);
    expect(preflight).toBeGreaterThan(reachCheck);
    expect(melee.slice(preflight, firstTargetWrite)).toContain('validateToolVigourSpend(');
    expect(melee.slice(preflight, firstTargetWrite)).not.toMatch(
      /ctx\.db\.[\s\S]*\.(?:insert|update|delete)\(/,
    );
  });
});
