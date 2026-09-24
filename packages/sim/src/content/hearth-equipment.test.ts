import { describe, expect, it } from 'vitest';
import { bootstrapContentDefinitions, bootstrapContentRegistry } from './bootstrap-registry.js';
import { validateContentDefinitions } from './validate.js';
import { parseItemDefinition } from './definitions.js';
import { buildContentRegistry } from './registry.js';
import { runtimeWeaponBaseDamageCenti } from './runtime.js';
import { resolveEquipmentSkillRanks, modifiersForEffectiveSkillRanks, type EquipmentSkillContribution } from '../equipment-skills.js';
import { resolveCombatDamage, resolveCombatMitigation } from '../combat.js';

const registry = bootstrapContentRegistry();
const gear = [...registry.items.values()].filter(item => item.tags.includes('content.hearth') && item.equip !== undefined);
const nodes = [...registry.skillTrees.values()].flatMap(tree => tree.nodes);
describe('Hearth fixed equipment content', () => {
  it('provides the complete nonstackable catalogue without armor degradation', () => {
    expect(gear).toHaveLength(45);
    expect(gear.filter(item => item.combat)).toHaveLength(10);
    expect(gear.filter(item => item.tags.includes('item.armor'))).toHaveLength(25);
    expect(gear.filter(item => item.tags.includes('item.shield'))).toHaveLength(5);
    expect(gear.filter(item => item.equip?.slot === 'neck')).toHaveLength(5);
    for (const item of gear) {
      expect(item.maxStack).toBe(1);
      if (!item.combat) expect(item.durability).toBeUndefined();
      if (item.quality === 'common') expect(item.economy.buy).toBeGreaterThan(0);
      if (item.economy.buy !== null) expect(item.economy.sell).toBeLessThan(item.economy.buy);
      if (item.equip?.skillNode) expect(nodes.find(node => node.id === item.equip?.skillNode)?.gearBoostable).toBe(true);
    }
  });
  it('uses active content weapon power and fails closed for retired or mismatched weapons', () => {
    expect(runtimeWeaponBaseDamageCenti(registry, 'sword', 'melee')).toBe(1600);
    expect(runtimeWeaponBaseDamageCenti(registry, 'bow', 'ranged')).toBe(1250);
    expect(runtimeWeaponBaseDamageCenti(registry, 'hearth_legendary_sword', 'melee')).toBe(2400);
    expect(runtimeWeaponBaseDamageCenti(registry, 'hearth_legendary_sword', 'ranged')).toBeNull();
    expect(runtimeWeaponBaseDamageCenti(registry, 'stone', 'melee')).toBeNull();
    const original = registry.items.get('item:sword')!;
    const revised = buildContentRegistry([{ id: original.id, kind: 'item', json: {
      ...original, durability: undefined, combat: {attackKind: 'melee', baseDamageCenti: 2222},
    } }]).registry;
    expect(runtimeWeaponBaseDamageCenti(revised, 'sword', 'melee')).toBe(2222);
    const retired = buildContentRegistry([{ id: original.id, kind: 'item', json: {...original, retired: true} }]).registry;
    expect(runtimeWeaponBaseDamageCenti(retired, 'sword', 'melee')).toBeNull();
  });
  it('resolves every authored bonus against real trained node prerequisites', () => {
    const trained = Object.fromEntries(nodes.map(node => [node.id, node.maxRank]));
    const contributions: EquipmentSkillContribution[] = gear.flatMap(item => {
      const nodeId = item.equip?.skillNode;
      if (!nodeId || !['rare','epic','legendary'].includes(item.quality)) return [];
      return [{sourceId: item.id, nodeId, quality: item.quality as EquipmentSkillContribution['quality']}];
    });
    const result = resolveEquipmentSkillRanks(nodes, trained, contributions, ['blade_training']);
    expect(result.effective.blade_training).toBe(7);
    expect(result.grantedRanks).toBeLessThanOrEqual(4);
    expect(result.overcapRanks).toBe(2);
    expect(result.inactive.some(item => item.reason === 'not_eligible')).toBe(false);
    expect(resolveEquipmentSkillRanks(nodes, {}, contributions).grantedRanks).toBe(0);
  });
  it('keeps rare-to-legendary per-hit weapon damage within the proposed starting budget', () => {
    for (const attackKind of ['melee','ranged'] as const) {
      const weapon = attackKind === 'melee' ? 'sword' : 'bow';
      const nodeId = attackKind === 'melee' ? 'blade_training' : 'archery_basics';
      const damageFor = (quality: 'rare' | 'legendary') => {
        const item = registry.items.get(`item:hearth_${quality}_${weapon}`)!;
        const skills = resolveEquipmentSkillRanks(nodes, {[nodeId]: 5}, [
          {sourceId:'weapon',nodeId,quality}, {sourceId:'armor',nodeId,quality},
        ], [nodeId]);
        const modifiers = [...item.modifiers ?? [], ...modifiersForEffectiveSkillRanks(nodes, skills, 'weapon')];
        let total = 0;
        for (let hit = 0; hit < 1000; hit++) total += resolveCombatDamage({
          attackKind, weaponBaseCenti: item.combat!.baseDamageCenti, scalingAttribute: 10,
          armorCenti: 0, armorPctBasisPoints: 0, seedParts:['hearth-balance',hit], attackerModifiers: modifiers,
        }).damageCenti;
        return total;
      };
      const ratio = damageFor('legendary') / damageFor('rare');
      expect(ratio).toBeGreaterThanOrEqual(1.25);
      expect(ratio).toBeLessThanOrEqual(1.35);
    }
  });
  it('keeps small enemy hits meaningful and limits incoming mitigation across actual armor loadouts', () => {
    const armorFor = (quality: 'common' | 'rare' | 'legendary') => gear
      .filter(item => item.quality === quality && (item.tags.includes('item.armor') || item.tags.includes('item.shield')))
      .flatMap(item => item.modifiers ?? []);
    for (const hit of [500,800,1200,2000]) {
      const baseline = resolveCombatMitigation(hit).damageCenti;
      const common = resolveCombatMitigation(hit,0,0,armorFor('common')).damageCenti;
      const rare = resolveCombatMitigation(hit,0,0,armorFor('rare')).damageCenti;
      const legendary = resolveCombatMitigation(hit,0,0,armorFor('legendary')).damageCenti;
      expect(baseline).toBe(hit);
      expect(common).toBeLessThan(baseline);
      expect(legendary).toBeGreaterThan(hit * .55);
      expect(legendary / rare).toBeGreaterThan(.85);
      expect(Math.ceil(10000 / legendary) / Math.ceil(10000 / rare)).toBeLessThan(1.2);
    }
    expect(resolveCombatMitigation(0,0,0,armorFor('legendary')).damageCenti).toBe(0);
  });

  it('validates Gear-D3 attribute and vital modifiers against the per-item cap', () => {
    const withModifiers = (modifiers: readonly object[]) => {
      const definitions = bootstrapContentDefinitions().map(definition => {
        if (definition.id !== 'item:hearth_legendary_hands' || definition.kind !== 'item') return definition;
        const json = JSON.parse(JSON.stringify(definition)) as {modifiers?: object[]};
        return parseItemDefinition({...json, modifiers: [...json.modifiers ?? [], ...modifiers]});
      });
      return validateContentDefinitions(definitions).errors
        .filter(error => error.definitionId === 'item:hearth_legendary_hands' && error.path === 'modifiers');
    };
    const bonus = (id: string, target: string, value: number, layer = 'flat') => ({id, target, layer, value, source: 'equipment'});
    expect(withModifiers([
      bonus('gear_str', 'str', 8), bonus('gear_mana', 'maxMana', 2500, 'pctAdd'),
      bonus('gear_regen', 'manaRegen', 150), bonus('gear_health', 'maxHealth', 12_000),
    ])).toEqual([]);
    expect(withModifiers([bonus('gear_str', 'str', 9)])).toEqual([expect.objectContaining({
      code: 'invalid_component_set', message: expect.stringContaining('gear_str'),
    })]);
    expect(withModifiers([bonus('gear_int', 'int', 5, 'pctMult')])).toHaveLength(1);
  });
});
