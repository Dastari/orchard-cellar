import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const worldSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
const clientSource = readFileSync(
  new URL('../../../client/src/overworld-main.ts', import.meta.url),
  'utf8',
);
const connectionSource = readFileSync(
  new URL('../../../client/src/net/overworld-connection.ts', import.meta.url),
  'utf8',
);
const lifecycleSource = readFileSync(
  new URL('../../../lifecycle-authoring/source/bootstrap-item-on-use.source.json', import.meta.url),
  'utf8',
);

function between(source: string, startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  expect(end, endAnchor).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('authored hoe and watering-can lifecycle authority', () => {
  it('owns both tools through authored onUse place handlers and a bounded effect', () => {
    const authored = JSON.parse(lifecycleSource) as {
      readonly handlers: readonly {
        readonly itemId: string;
        readonly id: string;
        readonly triggers?: readonly string[];
        readonly source: string;
      }[];
    };
    for (const itemId of ['item:hoe', 'item:watering_can']) {
      const owned = authored.handlers.filter((candidate) => candidate.itemId === itemId);
      expect(owned, itemId).toHaveLength(1);
      const handler = owned[0];
      expect(handler, itemId).toBeDefined();
      expect(handler?.triggers).toEqual(['useWith', 'place']);
      expect(handler?.source).toContain('context.emit({ farmTool:');
      expect(handler?.source).toContain("context.snapshot.target.definitionId !== 'object:anvil'");
      expect(handler?.source).toContain("context.item.applyEffect('repair_selected')");
      expect(handler?.source).not.toMatch(/ctx\.|\.db\./u);
    }
    expect(authored.handlers.find(({ id }) => id === 'item:hoe.on_use')?.source)
      .toContain("context.event.actionId === 'restore'");
  });

  it('preflights exact legacy farm authority before applying the transaction', () => {
    const writer = between(
      worldSource,
      'function worldBehaviourEffectWriter(',
      '\nfunction applyWorldBehaviourEffects(',
    );
    expect(writer).toContain("if (kind === 'farmTool')");
    expect(writer).toContain('validateFarmToolLifecycleAction(ctx, effect.farmTool.action, tileX, tileY)');
    expect(writer).toContain('applyFarmToolLifecycleAction(ctx, action, planned.tileX, planned.tileY)');

    const validation = between(
      worldSource,
      'function validateFarmToolLifecycleAction(',
      'function applyFarmToolLifecycleAction(',
    );
    for (const authority of [
      'mutableFarmTileAuthorized(',
      'mountedNpcFor(',
      'farmSoilRestoreResult(',
      'farmToolUseResult(',
      'requireUsableTool(',
      'isVitalsToolKind(',
      'tileOverlapsAnyPlayer(',
      'owner_only_crop_uproot',
    ]) expect(validation, authority).toContain(authority);

    const mutation = between(
      worldSource,
      'function applyFarmToolUse(',
      'export const harvestCropTile =',
    );
    for (const legacyMechanic of [
      'spendToolVigour(',
      'wearInventoryTool(',
      'fiberDropsFromTilling(',
      'scheduleEmptyTopsideSoilDecay(',
      'cropGrowthAt(',
      "'tool_uses'",
      "'farm_tiles_tilled'",
      "'farm_tiles_watered'",
      "'farm_tiles_restored'",
      "'crops_uprooted'",
      'grantSkillExperience(',
    ]) expect(mutation, legacyMechanic).toContain(legacyMechanic);
    // Tutorial thoughts remain one-shot, active-quest-owned narrative triggers.
    for (const narrativeGate of [
      "if (quest.state !== 'active') continue",
      'runtimeQuestDefinition(contentRegistry(ctx), quest.questId)',
      "trigger.event === 'water_crop' && trigger.subjectKind === cropRow.cropKind",
      'if (ctx.db.player_quest_flag.id.find(flagId) !== null) continue',
      'ctx.db.player_quest_flag.insert({ id: flagId, identity: ctx.sender, flag: trigger.id })',
      'body: trigger.body',
      'tone: trigger.tone',
      'expiresTick: clock.authorityTick + BigInt(trigger.durationTicks)',
    ]) expect(mutation, narrativeGate).toContain(narrativeGate);
  });

  it('routes keyboard and pointer actions through generic useSelected and retires old reducers', () => {
    expect(clientSource).toContain("network.useSelected('place', {");
    expect(clientSource).toContain('actionId,');
    expect(clientSource).toContain("const restoring = actionId === 'restore'");
    expect(clientSource).not.toContain('network.useFarmTool(');
    expect(clientSource).not.toContain('network.restoreFarmTile(');
    expect(connectionSource).not.toContain('useFarmTool(');
    expect(connectionSource).not.toContain('restoreFarmTile(');
    expect(worldSource).not.toContain('export const useFarmTool =');
    expect(worldSource).not.toContain('export const restoreFarmTile =');
    expect(existsSync(new URL('../../../world-bindings/src/use_farm_tool_reducer.ts', import.meta.url)))
      .toBe(false);
    expect(existsSync(new URL('../../../world-bindings/src/restore_farm_tile_reducer.ts', import.meta.url)))
      .toBe(false);
  });

  it('preserves legacy watering semantics without inventing a reservoir', () => {
    const mutation = between(
      worldSource,
      'function applyFarmToolUse(',
      'function applyFarmTileRestore(',
    );
    expect(mutation).toContain('watered: true');
    expect(mutation).toContain('wateredAtTick: clock.authorityTick');
    expect(mutation).not.toMatch(/reservoir|fillWater|waterLevel/iu);
  });
});
