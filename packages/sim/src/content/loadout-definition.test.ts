import { describe, expect, it } from 'vitest';
import { bootstrapContentDefinitions, bootstrapContentRows } from './bootstrap-registry.js';
import { parseContentDefinition } from './definitions.js';
import { buildContentRegistry } from './registry.js';

const bootstrapLoadout = () => {
  const definition = bootstrapContentDefinitions().find(({ kind }) => kind === 'loadout');
  if (definition?.kind !== 'loadout') throw new Error('missing bootstrap loadout');
  return definition;
};

describe('loadout content definitions', () => {
  it('parses and indexes the one authored new-player loadout', () => {
    const definition = bootstrapLoadout();
    expect(parseContentDefinition('loadout', JSON.stringify(definition))).toEqual(definition);
    expect(buildContentRegistry(bootstrapContentRows()).registry.loadouts.get(definition.id)).toEqual(definition);
    expect(definition.appearance.hairKinds).toHaveLength(6);
    expect(definition.abilities).toContainEqual(expect.objectContaining({
      id: 'ability:sprint', adapter: 'sprint', speedPermille: 1_250,
      vigourDrainCentiPerSecond: 1_000,
    }));
  });

  it('rejects incomplete appearance and sprint catalogs', () => {
    const definition = bootstrapLoadout();
    expect(() => parseContentDefinition('loadout', {
      ...definition, appearance: { ...definition.appearance, hairKinds: [] },
    })).toThrow('expected one to 64 catalog values');
    expect(() => parseContentDefinition('loadout', {
      ...definition, abilities: definition.abilities.map((ability) => ({
        ...ability, modifierTargets: ['sprintVigourCost', 'sprintSpeed'],
      })),
    })).toThrow('sprint requires speed and Vigour modifier targets');
    const duplicateSprint = buildContentRegistry(bootstrapContentRows().map((row) => row.id !== definition.id ? row : {
      ...row,
      json: {
        ...definition,
        abilities: [...definition.abilities, { ...definition.abilities[0]!, id: 'ability:dash' }],
      },
    }));
    expect(duplicateSprint.report.errors).toContainEqual(expect.objectContaining({
      code: 'invalid_component_set', definitionId: definition.id, path: 'abilities',
    }));
  });

  it('rejects duplicate slots, invalid selection, and invalid quantities at the parser boundary', () => {
    const definition = bootstrapLoadout();
    expect(() => parseContentDefinition('loadout', {
      ...definition,
      entries: [...definition.entries, { ...definition.entries[0], item: 'item:wood' }],
    })).toThrow('duplicate loadout slot');
    expect(() => parseContentDefinition('loadout', { ...definition, selectedSlot: 9 })).toThrow(
      'selected slot must contain a loadout entry',
    );
    expect(() => parseContentDefinition('loadout', {
      ...definition,
      entries: [{ ...definition.entries[0], quantity: 0 }],
    })).toThrow('expected a safe integer from 1');
  });

  it('validates active item references, max stacks, and unique active loadout roles', () => {
    const rows = bootstrapContentRows();
    const loadout = bootstrapLoadout();
    const missing = buildContentRegistry(rows.map((row) => row.id !== loadout.id ? row : {
      ...row,
      json: JSON.stringify({
        ...loadout,
        entries: loadout.entries.map((entry, index) => index === 0
          ? { ...entry, item: 'item:not_present' }
          : entry),
      }),
    }));
    expect(missing.report.errors).toContainEqual(expect.objectContaining({
      code: 'unresolved_reference', definitionId: loadout.id,
    }));

    const woodRow = rows.find(({ id }) => id === 'item:wood');
    if (woodRow === undefined) throw new Error('missing retired item fixture');
    const wood = JSON.parse(String(woodRow.json)) as Record<string, unknown>;
    const retired = buildContentRegistry([
      ...rows.map((row) => row.id !== loadout.id ? row : {
        ...row,
        json: JSON.stringify({
          ...loadout,
          entries: loadout.entries.map((entry, index) => index === 0
            ? { ...entry, item: 'item:retired_starter' }
            : entry),
        }),
      }),
      {
        id: 'item:retired_starter', kind: 'item', slug: 'retired_starter',
        json: JSON.stringify({
          ...wood, id: 'item:retired_starter', retired: true, replacement: 'item:wood',
        }),
      },
    ]);
    expect(retired.report.errors).toContainEqual(expect.objectContaining({
      code: 'retired_reference', definitionId: loadout.id,
    }));

    const overStack = buildContentRegistry(rows.map((row) => row.id !== loadout.id ? row : {
      ...row,
      json: JSON.stringify({
        ...loadout,
        entries: loadout.entries.map((entry, index) => index === 0
          ? { ...entry, quantity: 2 }
          : entry),
      }),
    }));
    expect(overStack.report.errors).toContainEqual(expect.objectContaining({
      code: 'invalid_component_set', definitionId: loadout.id, path: 'entries[0].quantity',
    }));

    const duplicate = buildContentRegistry([...rows, {
      id: 'loadout:alternate_arrival',
      kind: 'loadout',
      slug: 'alternate_arrival',
      json: { ...loadout, id: 'loadout:alternate_arrival' },
    }]);
    expect(duplicate.report.errors).toContainEqual(expect.objectContaining({
      code: 'ambiguous_interaction', definitionId: 'loadout:new_player', path: 'role',
    }));
  });
});
