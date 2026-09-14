import { describe, expect, it } from 'vitest';
import { parseContentDefinition } from './definitions.js';
import { buildContentRegistry } from './registry.js';
import { SUPPORT_CAP_BALANCE_IDS } from './balance-definition.js';
import { bootstrapContentDefinitions } from './bootstrap-registry.js';

const bootstrapSupportBalanceDefinitions = () => bootstrapContentDefinitions()
  .filter((definition) => definition.kind === 'balance');

describe('balance content definitions', () => {
  it('round-trips the six conservative support caps', () => {
    const definitions = bootstrapSupportBalanceDefinitions();
    expect(definitions).toHaveLength(6);
    expect(definitions.map(({ id }) => id)).toEqual([...Object.values(SUPPORT_CAP_BALANCE_IDS)].sort());
    for (const definition of definitions) expect(parseContentDefinition('balance', JSON.stringify(definition))).toEqual(definition);
  });

  it('rejects unknown units and indexes balance definitions in the registry', () => {
    const definition = bootstrapSupportBalanceDefinitions()[0]!;
    expect(() => parseContentDefinition('balance', { ...definition, unit: 'seconds' })).toThrow('unknown balance unit');
    const build = buildContentRegistry([{ id: definition.id, kind: definition.kind, json: definition }]);
    expect(build.report.valid).toBe(true);
    expect(build.registry.balances.get(definition.id)).toEqual(definition);
  });
});
