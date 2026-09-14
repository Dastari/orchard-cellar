import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const abilities = readFileSync(new URL('../../sim/src/abilities.ts', import.meta.url), 'utf8');
const appearance = readFileSync(new URL('../../sim/src/appearance.ts', import.meta.url), 'utf8');
const loadouts = readFileSync(new URL('../../assets/content/loadouts.json', import.meta.url), 'utf8');
const world = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../client/src/overworld-main.ts', import.meta.url), 'utf8');

describe('authored player configuration authority', () => {
  it('keeps sprint metadata and tuning out of simulation literals', () => {
    expect(abilities).not.toContain('ABILITY_DEFINITIONS');
    expect(abilities).not.toContain('SPRINT_SPEED_PERMILLE');
    expect(abilities).not.toContain('SPRINT_VIGOUR_DRAIN_CENTI_PER_SECOND');
    expect(abilities).not.toContain("displayName: 'Sprint'");
    expect(loadouts).toContain('"adapter": "sprint"');
    expect(world).toContain('runtimeSprintAbilityDefinition(');
    expect(client).toContain('runtimeSprintAbilityDefinition(');
  });

  it('keeps modular appearance catalogs out of simulation literals', () => {
    expect(appearance).not.toMatch(/PLAYER_(?:HAIR|SHIRT|PANTS|SHOES)_KINDS/u);
    expect(appearance).not.toContain("'hair_1_brown'");
    expect(appearance).not.toContain("'farmer_green'");
    expect(loadouts).toContain('"appearance"');
    expect(world).toContain('runtimePlayerAppearanceCatalog(');
    expect(client).toContain('runtimePlayerAppearanceCatalog(');
  });
});
