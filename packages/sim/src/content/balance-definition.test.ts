import { describe, expect, it } from 'vitest';
import { parseContentDefinition } from './definitions.js';
import { buildContentRegistry } from './registry.js';
import { bootstrapContentDefinitions } from './bootstrap-registry.js';
import { validateContentDefinitions } from './validate.js';
import { runtimeCharacterCombatBalance } from '../character-combat-balance.js';
import { resolveStatsWithProfile } from '../stats.js';
import type {
  CharacterCombatBalanceContentDefinition,
  ResidenceConstructionBalanceContentDefinition,
  ScalarBalanceContentDefinition,
} from './balance-definition.js';

const bootstrapSupportBalanceDefinitions = () => bootstrapContentDefinitions()
  .filter((definition): definition is ScalarBalanceContentDefinition => (
    definition.kind === 'balance' && 'supportCap' in definition
  ));

describe('balance content definitions', () => {
  it('round-trips the six conservative support caps', () => {
    const definitions = bootstrapSupportBalanceDefinitions();
    expect(definitions).toHaveLength(6);
    expect(definitions.map(({ supportCap }) => supportCap).sort()).toEqual([
      'itemsPerMutation', 'mutationsPerHour', 'skillPointsPerMutation',
      'statDeltaPerMutation', 'teleportDistanceTiles', 'walletDeltaBronzePerMutation',
    ]);
    for (const definition of definitions) expect(parseContentDefinition('balance', JSON.stringify(definition))).toEqual(definition);
  });

  it('rejects unknown units and indexes balance definitions in the registry', () => {
    const definition = bootstrapSupportBalanceDefinitions()[0]!;
    expect(() => parseContentDefinition('balance', { ...definition, unit: 'seconds' })).toThrow('unknown balance unit');
    const build = buildContentRegistry([{ id: definition.id, kind: definition.kind, json: definition }]);
    expect(build.report.valid).toBe(true);
    expect(build.registry.balances.get(definition.id)).toEqual(definition);
  });

  it('rejects unknown and ambiguous active support-cap capabilities', () => {
    const definition = bootstrapSupportBalanceDefinitions()[0]!;
    expect(() => parseContentDefinition('balance', {
      ...definition, supportCap: 'not_a_support_cap',
    })).toThrow('unknown support cap');
    const duplicate = {
      ...definition,
      id: 'balance:arbitrarily_renamed_cap' as const,
    };
    expect(validateContentDefinitions([definition, duplicate]).errors).toContainEqual(
      expect.objectContaining({
        code: 'ambiguous_interaction',
        definitionId: duplicate.id,
        path: 'supportCap',
      }),
    );
  });

  it('resolves one active character/combat profile independent of definition id', () => {
    const definitions = bootstrapContentDefinitions();
    const original = definitions.find((definition): definition is CharacterCombatBalanceContentDefinition => (
      definition.kind === 'balance' && 'profile' in definition
      && definition.profile === 'character_combat'
    ))!;
    const renamed = { ...original, id: 'balance:renamed_character_foundation' as const };
    const rows = definitions.filter(({ id }) => id !== original.id).map((definition) => ({
      id: definition.id, kind: definition.kind, json: definition,
    }));
    const built = buildContentRegistry([...rows, { id: renamed.id, kind: renamed.kind, json: renamed }]);
    expect(built.report.errors).toEqual([]);
    expect(runtimeCharacterCombatBalance(built.registry)).toMatchObject({
      baseAttribute: 10, maximumAttribute: 30, bowBaseDamageCenti: 1_400,
    });
    const profile = runtimeCharacterCombatBalance(built.registry)!;
    expect(resolveStatsWithProfile(profile)).toMatchObject({
      attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      maxHealthCenti: 10_000,
      maxManaCenti: 10_000,
      maxVigourCenti: 10_000,
      healthRegenCentiPerSecond: 20,
      manaRegenCentiPerSecond: 100,
      vigourRegenCentiPerSecond: 1_200,
    });

    const retired = { ...renamed, retired: true as const };
    const retiredRegistry = buildContentRegistry([...rows, {
      id: retired.id, kind: retired.kind, json: retired,
    }]).registry;
    expect(runtimeCharacterCombatBalance(retiredRegistry)).toBeNull();
    expect(validateContentDefinitions([original, renamed]).errors).toContainEqual(
      expect.objectContaining({ code: 'ambiguous_interaction', path: 'profile' }),
    );
  });

  it('rejects malformed or incoherent compact character profiles', () => {
    const original = bootstrapContentDefinitions().find(
      (definition): definition is CharacterCombatBalanceContentDefinition => (
        definition.kind === 'balance' && 'profile' in definition
      ),
    )!;
    expect(() => parseContentDefinition('balance', {
      ...original,
      values: original.values.slice(0, -1),
    })).toThrow('requires 18 positive integers');
    expect(() => parseContentDefinition('balance', {
      ...original,
      values: [10, 20, 5, ...original.values.slice(3)],
    })).toThrow('attribute minimum, base, and maximum are inconsistent');
  });

  it('parses one versioned residence recipe profile and rejects malformed tuples',()=>{
    const definitions=bootstrapContentDefinitions();
    const profile=definitions.find((definition):definition is ResidenceConstructionBalanceContentDefinition=>(
      definition.kind==='balance'&&'profile' in definition&&definition.profile==='residence_construction'))!;
    expect(parseContentDefinition('balance',profile)).toEqual(profile);
    expect(()=>parseContentDefinition('balance',{...profile,values:profile.values.slice(0,-1)}))
      .toThrow('requires 12 values');
    expect(()=>parseContentDefinition('balance',{...profile,values:[1,profile.values[1],profile.values[1],...profile.values.slice(3)]}))
      .toThrow('material items must be distinct');
    const duplicate={...profile,id:'balance:renamed_residence_recipe' as const};
    expect(validateContentDefinitions([...definitions,duplicate]).errors).toContainEqual(expect.objectContaining({
      code:'ambiguous_interaction',definitionId:duplicate.id,path:'profile',
    }));
  });
});
