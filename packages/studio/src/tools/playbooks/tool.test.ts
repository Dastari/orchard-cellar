import { describe, expect, it } from 'vitest';
import { StudioToolRegistry } from '../../shell/tool-registry.js';
import { PLAYBOOKS_TOOL_REGISTRATION } from './model.js';

describe('Playbooks tool registration', () => {
  it('registers a lazy Operate route with role gating', () => {
    const registry = new StudioToolRegistry(); registry.registerStudioTool(PLAYBOOKS_TOOL_REGISTRATION);
    expect(registry.resolve('/operate/playbooks', 'admin')).toMatchObject({ access: 'write' });
    expect(registry.resolve('/operate/playbooks', 'support')).toMatchObject({ access: 'write' });
    expect(registry.resolve('/operate/playbooks', 'content_editor')).toMatchObject({ access: 'read_only' });
    expect(registry.resolve('/operate/playbooks', null)).toBeNull();
  });

  it('is lazy mounted by the shell', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../../shell/builtin-canvas-tools.ts', import.meta.url), 'utf8'));
    expect(source).toContain("registry.register('playbooks'");
    expect(source).toContain("import('../tools/operate-canvas.js')");
  });
});
