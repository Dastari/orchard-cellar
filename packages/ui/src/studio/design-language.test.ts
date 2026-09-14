import { describe, expect, it } from 'vitest';
import { studioBadge, studioBadges } from './badges.js';
import { STUDIO_DOCK_CONTRACTS, studioDockFrame, studioTabStrip } from './docks.js';
import { studioInspectorGroups, studioPropertyRow } from './inspector.js';
import { buildStudioRailModel } from './rail.js';
import { STUDIO_SKIN_CSS, STUDIO_SKIN_TOKENS } from './skin.js';
import { buildStudioUiLabModel, renderStudioUiLabHtml } from './ui-lab.js';

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

  it('keeps anonymous rendering local to Build and Author without a live adapter', () => {
    const model = buildStudioUiLabModel();
    expect(model.sessionKind).toBe('anonymous_static');
    expect(model.rail.modes.map(({ id }) => id)).toEqual(['build', 'author']);
    expect(model.rail.session).toMatchObject({ identity: 'Anonymous', role: 'Sandbox', action: 'connect' });
    expect(model.referenceNeighbours).toEqual([
      'Map Editor rail', 'wood/parchment canvas frames', 'Item Studio DOM table',
    ]);
  });

  it('gives every workflow contract one specimen at UI scales 1, 2, and 3', () => {
    const model = buildStudioUiLabModel();
    expect(model.specimens).toHaveLength(STUDIO_DOCK_CONTRACTS.length * 3);
    for (const contract of STUDIO_DOCK_CONTRACTS) {
      expect(model.specimens.filter(({ contractId }) => contractId === contract.id).map(({ uiScale }) => uiScale))
        .toEqual([1, 2, 3]);
    }
    expect(new Set(model.specimens.map(({ id }) => id)).size).toBe(model.specimens.length);
    expect(model.specimens.filter(({ anonymousState }) => anonymousState === 'read_only').length).toBeGreaterThan(0);
  });

  it('scales dock metrics by integers and shares wood/parchment frame families', () => {
    const one = studioDockFrame('inspector', 1);
    const three = studioDockFrame('inspector', 3, ['validation']);
    expect(three.metrics.headerHeight).toBe(one.metrics.headerHeight * 3);
    expect(three.frame).toBe('wood_parchment');
    expect(three.classes).toContain('orchard-studio-frame--wood-parchment');
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
    expect(STUDIO_SKIN_CSS).toContain('font-family: "Tiny5"');
    expect(STUDIO_SKIN_CSS).toContain('.orchard-studio-table__cell.is-invalid');
    expect(STUDIO_SKIN_CSS).toContain('image-rendering: pixelated');
  });

  it('renders deterministic escaped static HTML without browser globals', () => {
    const first = renderStudioUiLabHtml();
    const second = renderStudioUiLabHtml();
    expect(second).toBe(first);
    expect(first).toContain('data-contract="world_outliner"');
    expect(first).toContain('data-ui-scale="3"');
    expect(first).toContain('data-anonymous-state="read_only"');
    expect(first).not.toContain('[object Object]');
  });
});
