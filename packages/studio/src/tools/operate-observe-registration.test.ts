import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StudioToolRegistry } from '../shell/tool-registry.js';
import { MEMBERSHIP_TOOL_REGISTRATION } from './membership/model.js';
import { OBSERVE_TOOL_REGISTRATION } from './observe/model.js';

describe('Membership and Observe registrations', () => {
  it('applies the Studio mode role matrix', () => {
    const registry = new StudioToolRegistry();
    registry.registerStudioTool(MEMBERSHIP_TOOL_REGISTRATION); registry.registerStudioTool(OBSERVE_TOOL_REGISTRATION);
    expect(registry.resolve('/operate/membership', 'owner')?.access).toBe('write');
    expect(registry.resolve('/operate/membership', 'content_editor')?.access).toBe('read_only');
    expect(registry.resolve('/observe/world', 'support')?.access).toBe('read_only');
    expect(registry.resolve('/observe/world', null)).toBeNull();
  });

  it('keeps both tools in lazy chunks', () => {
    const canvasTools = readFileSync(new URL('../shell/builtin-canvas-tools.ts', import.meta.url), 'utf8');
    expect(canvasTools).toContain("registry.register('membership'");
    expect(canvasTools).toContain("registry.register('observe'");
    expect(canvasTools).toContain("import('../tools/operate-canvas.js')");
  });
});
