import { describe, expect, it } from 'vitest';
import { applyPrestigeAction } from './prestige.js';
import { createInitialState, type FarmState } from './state.js';

describe('M5 prestige reset and carry contracts', () => {
  it('runs an accelerated Vintage to Succession to Lineage golden cycle', () => {
    const initial = createInitialState(505);
    let state: FarmState = {
      ...initial,
      player: { ...initial.player, location: 'cellar' as const },
      economy: {
        ...initial.economy,
        resources: { fruit: 123, pomace: 45, must: 67, bottles: 250 },
        presses: [3, 0, 0, 0, 0],
        casks: [2, 0, 0, 0, 0],
        upgrades: ['pruningShears'] as const,
        plotsUnlocked: 30,
        knowledge: { grove: 2, press: 3, cellar: 4, estate: 5 },
      },
      progression: { ...initial.progression, skillRanks: { mulching: 2 }, cultivars: ['graftedStock'], achievements: ['firstTend'] },
    };

    state = applyPrestigeAction(state, { type: 'sealVintage' });
    expect(state.progression).toMatchObject({ terroir: 9, lifetimeTerroir: 9, vintages: 1, skillRanks: { mulching: 2 }, cultivars: ['graftedStock'] });
    expect(state.progression.vintageHistory[0]).toMatchObject({ number: 1, bottles: 250, terroir: 9, label: 'Orchard Vintage 1' });
    expect(state.economy).toMatchObject({
      resources: { fruit: 0, pomace: 0, must: 0, bottles: 0 }, presses: [0, 0, 0, 0, 0], casks: [0, 0, 0, 0, 0],
      upgrades: [], plotsUnlocked: 30, knowledge: { grove: 3, press: 4, cellar: 5, estate: 6 },
    });
    expect(state.player.location).toBe('estate');

    state = {
      ...state,
      progression: { ...state.progression, terroir: 120, lifetimeTerroir: 500, skillRanks: { mulching: 3 } },
    };
    state = applyPrestigeAction(state, { type: 'succession' });
    expect(state.progression).toMatchObject({ terroir: 0, heirlooms: 1, lifetimeHeirlooms: 1, successions: 1, skillRanks: {} });
    expect(state.economy.legacyMultiplier).toBe(1.25);

    state = {
      ...state,
      progression: { ...state.progression, terroir: 20, heirlooms: 4, lifetimeHeirlooms: 20, skillRanks: { rhythm: 1 } },
      economy: { ...state.economy, resources: { fruit: 99, pomace: 9, must: 9, bottles: 9 } },
    };
    state = applyPrestigeAction(state, { type: 'lineage' });
    expect(state.progression).toMatchObject({ terroir: 0, heirlooms: 0, seeds: 1, seedsClaimed: 1, lineages: 1, skillRanks: {} });
    expect(state.economy).toMatchObject({ resources: { fruit: 0, pomace: 0, must: 0, bottles: 0 }, plotsUnlocked: 30, legacyMultiplier: 1.5 });
    expect(state.economy.knowledge).toEqual({ grove: 3, press: 4, cellar: 5, estate: 6 });
  });

  it('rejects ceremonies before their formula threshold', () => {
    const state = createInitialState(11);
    expect(applyPrestigeAction(state, { type: 'sealVintage' })).toBe(state);
    expect(applyPrestigeAction(state, { type: 'succession' })).toBe(state);
    expect(applyPrestigeAction(state, { type: 'lineage' })).toBe(state);
  });
});
