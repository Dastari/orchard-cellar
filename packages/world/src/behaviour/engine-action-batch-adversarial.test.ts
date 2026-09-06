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

describe('authored engine-action batch isolation', () => {
  it('rejects inventory consumption that could invalidate a completed action preflight', () => {
    const writer = between(
      worldSource,
      'function worldBehaviourEffectWriter(',
      '\nfunction applyWorldBehaviourEffects(',
    );
    const completion = between(
      writer,
      '}, validate, () => {',
      '\n  });',
    );
    for (const lane of [
      'plannedFarmTool !== undefined',
      'plannedWorldTool !== undefined',
      'plannedMeleeAttack !== undefined',
      'plannedFishing !== undefined',
      'plannedBowAction !== undefined',
    ]) expect(completion, lane).toContain(lane);
    expect(completion).toContain('plannedSelectedConsumption > 0');
    expect(completion).toContain('plannedInventoryConsumption.size > 0');
    expect(completion).toContain("throw new SenderError('behaviour_engine_action_inventory_conflict')");
  });

  it('keeps seed planting consumption and anvil repair material batches permitted', () => {
    const writer = between(
      worldSource,
      'function worldBehaviourEffectWriter(',
      '\nfunction applyWorldBehaviourEffects(',
    );
    const completion = between(writer, '}, validate, () => {', '\n  });');
    const actionSet = completion.slice(
      completion.indexOf('const inventorySensitiveEngineAction'),
      completion.indexOf("throw new SenderError('behaviour_engine_action_inventory_conflict')"),
    );
    expect(actionSet).not.toContain('plannedSeedPlant');
    expect(actionSet).not.toContain('plannedRepairEffect');
    expect(completion).toContain('plannedSeedPlant !== undefined && plannedSelectedConsumption !== 1');
    expect(completion).toContain('plannedRepairEffect && (plannedRepairMaterial !== plannedRepairExpectedMaterial');
  });

  it('rejects target removal or carrying that can invalidate world-tool and melee preflight', () => {
    const writer = between(
      worldSource,
      'function worldBehaviourEffectWriter(',
      '\nfunction applyWorldBehaviourEffects(',
    );
    expect(between(writer, "if (kind === 'pickupAsItem')", "if (kind === 'carry')"))
      .toContain('plannedTargetIdentityMutation = true;');
    expect(between(writer, "if (kind === 'carry')", "if (kind === 'placeCarried')"))
      .toContain('plannedTargetIdentityMutation = true;');
    expect(between(writer, "if (kind === 'despawnObject')", "if (kind === 'toggleState')"))
      .toContain('plannedTargetIdentityMutation = true;');
    const completion = between(writer, '}, validate, () => {', '\n  });');
    expect(completion).toContain('plannedWorldTool !== undefined || plannedMeleeAttack !== undefined');
    expect(completion).toContain('plannedTargetIdentityMutation');
    expect(completion).toContain("throw new SenderError('behaviour_engine_action_target_conflict')");
  });
});
