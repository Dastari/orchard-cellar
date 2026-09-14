import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './bootstrap-registry.js';
import { parseProcessDefinition } from './definitions.js';
import { validateContentDefinitions } from './validate.js';

const process = { id: 'process:future_stew', kind: 'process', schemaVersion: 1,
  stationTag: 'station.campfire', input: { item: 'item:raw_beef', count: 2 },
  outputs: [{ item: 'item:cooked_beef', count: 3 }], ticksPerUnit: 25,
  legacyJob: { recipeId: 'old_stew', farmingExperiencePerItem: 7 } };

describe('persisted process job progression metadata', () => {
  it('retains historical progression independently of current process recipe and timing', () => {
    expect(parseProcessDefinition(process).legacyJob).toEqual(process.legacyJob);
    const registry = bootstrapContentRegistry();
    expect([...registry.processes.values()].flatMap((definition) => definition.legacyJob ?? []))
      .toEqual([
        { recipeId: 'cook_beef', farmingExperiencePerItem: 7 },
        { recipeId: 'cook_fish', farmingExperiencePerItem: 5 },
        { recipeId: 'roast_chicken', farmingExperiencePerItem: 5 },
        { recipeId: 'roast_mutton', farmingExperiencePerItem: 6 },
        { recipeId: 'roast_pork', farmingExperiencePerItem: 6 },
      ]);
  });

  it('rejects malformed historical obligations rather than silently defaulting them', () => {
    for (const legacyJob of [{}, { recipeId: '' }, { recipeId: 'old_stew', farmingExperiencePerItem: -1 },
      { recipeId: 'old_stew', farmingExperiencePerItem: 1.5 },
      { ...process.legacyJob, replacementOutput: 'forged' }]) {
      expect(() => parseProcessDefinition({ ...process, legacyJob })).toThrow();
    }
  });

  it('rejects ambiguous ownership of the same historical recipe id', () => {
    const first = parseProcessDefinition(process);
    const second = parseProcessDefinition({ ...process, id: 'process:another_stew' });
    expect(validateContentDefinitions([first, second]).errors).toContainEqual(expect.objectContaining({
      code: 'ambiguous_interaction', definitionId: second.id, path: 'legacyJob.recipeId',
    }));
  });
});
