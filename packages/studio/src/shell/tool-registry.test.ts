import { describe, expect, it } from 'vitest';
import { StudioToolRegistry, registerBuiltinStudioTools, registerStudioTool } from './tool-registry.js';

describe('registerStudioTool', () => {
  it('registers discoverable routes, docks, and commands and rejects collisions', () => {
    const registry = new StudioToolRegistry();
    registerStudioTool(registry, { id: 'map', label: 'Map', mode: 'build', icon: 'map', routes: ['/build/map'], docks: ['world_outliner'], commands: [{ id: 'frame', label: 'Frame map' }] });
    expect(registry.resolve('/build/map', null)).toMatchObject({ access: 'write', tool: { id: 'map' } });
    expect(() => registerStudioTool(registry, { id: 'other', label: 'Other', mode: 'build', icon: 'x', routes: ['/build/map'], docks: [], commands: [] })).toThrow('Duplicate');
  });

  it('supports the plugin-facing registerStudioTool({ ... }) API', () => {
    const dispose = registerStudioTool({ id: 'example-plugin', label: 'Example', mode: 'author', icon: 'example', routes: ['/author/example-plugin'], docks: ['inspector'], commands: [] });
    expect(dispose).toBeTypeOf('function');
    dispose();
  });

  it('mounts the three narrative authoring routes with the shared author docks', () => {
    const registry = new StudioToolRegistry();
    registerBuiltinStudioTools(registry);
    for (const [path, id] of [
      ['/author/npcs', 'npc-studio'],
      ['/author/dialogue', 'dialogue-graph'],
      ['/author/quests', 'quest-editor'],
    ]) {
      expect(registry.resolve(path!, null)).toMatchObject({
        access: 'write',
        tool: { id, mode: 'author', docks: expect.arrayContaining(['content_browser', 'validation', 'history', 'preview']) },
      });
    }
  });
});
