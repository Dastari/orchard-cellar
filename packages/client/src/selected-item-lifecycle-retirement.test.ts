import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

describe('selected item lifecycle client retirement', () => {
  it('derives direct-use prompts and dispatch from authored onUse metadata', () => {
    expect(source).toContain('selectedItemUsePrompt(');
    expect(source).toContain('selectedItemUseAction(selectedUseDefinition)');
    expect(source).toContain("network.useSelected('secondary')");
  });

  it('resolves the selected-item F action before target actions, matching authority precedence', () => {
    const keyHandler = source.slice(
      source.indexOf("if (event.code === 'KeyF'"),
      source.indexOf("if (event.code === 'KeyE'"),
    );
    expect(keyHandler.indexOf('selectedItemUseAction(selectedUseDefinition)'))
      .toBeLessThan(keyHandler.indexOf('targetCampfire(snapshot)'));
    expect(source).toContain('const contextualPrompt = worldActionPrompt(nearbyPrompt, selectedUsePrompt ?? targetPrompt);');
    expect(source).not.toContain('`${basePrompt}  ${selectedUsePrompt}`');
  });

  it('does not retain item-kind branches for food, recipe books, or orchard tea', () => {
    expect(source).not.toContain('liveFoodRestoreCenti');
    expect(source).not.toContain('liveRecipeBook');
    expect(source).not.toContain("if (item === 'orchard_tea')");
    expect(source).not.toContain("'HUNGER RESTORED'");
    expect(source).not.toContain("'RECIPES LEARNED'");
    expect(source).not.toContain("'ORCHARD TEA DRUNK'");
  });

  it('derives inventory placement and anvil repair capability from lifecycle metadata', () => {
    expect(source).toContain("selectedItemLifecycleAction(selectedUseDefinition, 'place')");
    expect(source).toContain("selectedItemLifecycleAction(selectedUseDefinition, 'useWith')");
    expect(source).toContain("selectedItemLifecyclePrompt(selectedContentDefinition, 'place')");
    expect(source).toContain("selectedItemLifecyclePrompt(selectedContentDefinition, 'useWith')");
    expect(source).not.toContain("selectedItem(snapshot) === 'homestead_deed'");
    expect(source).not.toContain("selectedItem(snapshot) === 'boat'");
    expect(source).not.toContain("selectedItem(snapshot) === 'chest'");
    expect(source).not.toContain("liveDurabilityDefinition(snapshot, selectedItem(snapshot))");
    expect(source).not.toContain("selectedDefinition?.tags.includes('item.placeable')");
  });

  it('routes melee capability through authored metadata while preserving predicted sword presentation', () => {
    expect(source).toContain('const selectedUseAction = selectedItemUseAction(selectedUseDefinition);');
    expect(source).toContain("selectedUseDefinition?.tags.includes('item.melee_weapon') === true");
    expect(source).toContain("targetKind: 'homeX' in target ? 'npc' : 'combat_target'");
    expect(source).toContain('performToolAction(');
    expect(source).toContain('facePredictedTowardTile(tile);');
    expect(source).not.toContain("selectedItem(snapshot) === 'sword'");
    expect(source).not.toContain('network.attackCombatTarget(');
  });
});
