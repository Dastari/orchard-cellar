import { describe, expect, it } from 'vitest';
import { studioBadge, studioBadges } from './badges.js';
import { studioDockFrame, studioTabStrip } from './docks.js';
import { studioInspectorGroups, studioPropertyRow } from './inspector.js';
import { buildStudioRailModel } from './rail.js';
import { STUDIO_SKIN_TOKENS } from './skin.js';

describe('Orchard Studio design language', () => {
  it('models all four rail modes, status badges, shortcuts, and the session card', () => {
    const rail = buildStudioRailModel({
      expanded: false,
      activeMode: 'operate',
      session: {
        environment: 'production', identity: 'c200…a291', role: 'admin',
        contentRevision: 17n, mapRevision: 8, connected: true,
      },
      modeBadges: { author: ['draft', 'validation'], operate: ['sync'], observe: ['conflict'] },
    });
    expect(rail.modes.map(({ id }) => id)).toEqual(['build', 'author', 'operate', 'observe']);
    expect(rail.modes.find(({ id }) => id === 'operate')).toMatchObject({ active: true, shortcut: 'Ctrl+3' });
    expect(rail.modes.find(({ id }) => id === 'author')?.badges.map(({ kind }) => kind))
      .toEqual(['draft', 'validation']);
    expect(rail.commands.map(({ shortcut }) => shortcut)).toEqual(['Ctrl+K', 'Ctrl+Shift+F']);
    expect(rail.session).toMatchObject({ environment: 'Production', contentHead: '17', mapHead: '8', action: 'disconnect' });
  });



  it('scales dock metrics by integers and shares wood/parchment frame families', () => {
    const one = studioDockFrame('inspector', 1);
    const three = studioDockFrame('inspector', 3, ['validation']);
    expect(three.metrics.headerHeight).toBe(one.metrics.headerHeight * 3);
    expect(three.frame).toBe('wood_parchment');
    expect(three.badges[0]?.kind).toBe('validation');
  });

  it('creates accessible tab strips and why-equipped inspector property rows', () => {
    const tabs = studioTabStrip([
      { id: 'local', label: 'Local' },
      { id: 'live', label: 'Live', disabled: true },
    ], 'live');
    expect(tabs[0]).toMatchObject({ active: true, ariaSelected: 'true', tabIndex: 0 });
    expect(tabs[1]?.tooltip).toContain('unavailable');
    const row = studioPropertyRow({
      id: 'radius', label: 'Radius', component: 'light', kind: 'number',
      value: 4, defaultValue: 3, why: 'Controls the authored light reach.', pinned: true,
    });
    expect(row).toMatchObject({ changed: true, canReset: true, pinLabel: 'Unpin Radius' });
    const groups = studioInspectorGroups([
      { id: 'radius', label: 'Radius', component: 'light', kind: 'number', value: 4, why: 'Light reach.', error: 'Too large' },
      { id: 'color', label: 'Color', component: 'light', kind: 'text', value: '#fff', why: 'Light tint.', pinned: true },
    ]);
    expect(groups[0]).toMatchObject({ id: 'light', label: 'Light', errorCount: 1, pinnedCount: 1 });
  });

  it('uses stable semantic badges and the existing Map Editor palette', () => {
    expect(studioBadges(['draft', 'draft', 'conflict']).map(({ kind }) => kind)).toEqual(['draft', 'conflict']);
    expect(studioBadge('sync')).toMatchObject({ tone: 'blue', busy: true });
    expect(STUDIO_SKIN_TOKENS).toMatchObject({ ink: '#442d25', green: '#4f8b54', blue: '#36798c' });
  });

});
