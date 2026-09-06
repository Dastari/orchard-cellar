import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StudioToolRegistry, registerBuiltinStudioTools } from '../../shell/tool-registry.js';
import { PLAYER_MANAGER_OPERATIONS, PLAYER_MANAGER_TABS, PLAYERS_TOOL_REGISTRATION } from './model.js';

describe('Player Manager registration and view surface', () => {
  it('registers one role-gated Operate route with its audit docks and commands', () => {
    const registry = new StudioToolRegistry(); registerBuiltinStudioTools(registry);
    expect(PLAYERS_TOOL_REGISTRATION).toMatchObject({ id: 'players', mode: 'operate', routes: ['/operate/players'] });
    expect(registry.resolve('/operate/players', 'admin')).toMatchObject({ access: 'write', tool: { docks: ['live_outliner', 'inspector', 'audit_tail'] } });
    expect(registry.resolve('/operate/players', 'content_editor')).toMatchObject({ access: 'read_only' });
    expect(registry.resolve('/operate/players', null)).toBeNull();
  });

  it('lazy-mounts the retained canvas Player Manager and exposes its guarded model', () => {
    const registration = readFileSync(new URL('../../shell/builtin-canvas-tools.ts', import.meta.url), 'utf8');
    const canvas = readFileSync(new URL('../operate-canvas.ts', import.meta.url), 'utf8');
    const api = readFileSync(new URL('../../admin/api.ts', import.meta.url), 'utf8');
    expect(registration).toContain("registry.register('players'");
    expect(registration).toContain("import('../tools/operate-canvas.js')");
    expect(canvas).toContain('PLAYER_MANAGER_TABS');
    expect(PLAYER_MANAGER_TABS).toHaveLength(9);
    expect(PLAYER_MANAGER_OPERATIONS).toHaveLength(19);
    for (const operation of PLAYER_MANAGER_OPERATIONS) expect(canvas).toContain(`operation: '${operation}'`);
    expect(canvas).toContain('No immutable preview. Every write requires a fresh dry run.');
    expect(canvas).toContain("ui.field('players-reason', 'Audited reason'");
    expect(api).not.toMatch(/DbConnection|@orchard\/world-bindings/u);
  });
});
