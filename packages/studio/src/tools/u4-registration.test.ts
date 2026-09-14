import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StudioToolRegistry, registerBuiltinStudioTools } from '../shell/tool-registry.js';

describe('U4 manager registration', () => {
  it('mounts three role-gated lazy Operate routes', () => {
    const registry = new StudioToolRegistry(); registerBuiltinStudioTools(registry);
    for (const [id, route] of [['containers', '/operate/containers'], ['objects', '/operate/objects'], ['npcs', '/operate/npcs']] as const) {
      expect(registry.resolve(route, 'admin')).toMatchObject({ access: 'write', tool: { id } });
      expect(registry.resolve(route, 'content_editor')).toMatchObject({ access: 'read_only' });
      expect(registry.resolve(route, null)).toBeNull();
    }
    const canvasTools = readFileSync(new URL('../shell/builtin-canvas-tools.ts', import.meta.url), 'utf8');
    for (const id of ['containers', 'objects', 'npcs']) expect(canvasTools).toContain(`registry.register('${id}'`);
    expect(canvasTools).toContain("import('../tools/operate-canvas.js')");
    expect(canvasTools).not.toContain('/view.js');
  });

  it('never falls back to mock data for connected environments', () => {
    const runtime = readFileSync(new URL('./objects/runtime.ts', import.meta.url), 'utf8');
    expect(runtime).toContain("environment === 'sandbox'");
    expect(runtime).toContain('controller.liveAdapter()?.adminObjects ?? null');
  });
});
