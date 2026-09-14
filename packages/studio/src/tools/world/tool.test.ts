import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StudioToolRegistry, registerBuiltinStudioTools } from '../../shell/tool-registry.js';

describe('U5 World Control registration', () => {
  it('registers a lazy role-gated Operate route', () => {
    const registry = new StudioToolRegistry(); registerBuiltinStudioTools(registry);
    expect(registry.resolve('/operate/world', 'admin')).toMatchObject({ access: 'write', tool: { id: 'world' } });
    expect(registry.resolve('/operate/world', 'content_editor')).toMatchObject({ access: 'read_only' });
    expect(registry.resolve('/operate/world', null)).toBeNull();
    const registration = readFileSync(new URL('../../shell/builtin-canvas-tools.ts', import.meta.url), 'utf8');
    expect(registration).toContain("registry.register('world'");
    expect(registration).toContain("import('../tools/operate-canvas.js')");
  });

  it('constructs a mock only in sandbox and otherwise uses the live-service seam', () => {
    const runtime = readFileSync(new URL('./runtime.ts', import.meta.url), 'utf8');
    expect(runtime).toContain("environment === 'sandbox'");
    expect(runtime).toContain('controller.liveAdapter()?.adminWorld ?? null');
    const connection = readFileSync(new URL('../../shell/studio-connection.ts', import.meta.url), 'utf8');
    expect(connection).toContain('readonly adminWorld?: AdminWorldApi');
  });
});
