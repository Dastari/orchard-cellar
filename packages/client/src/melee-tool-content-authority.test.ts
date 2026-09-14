import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const client = readFileSync(new URL('./overworld-main.ts', import.meta.url), 'utf8');

describe('melee prediction content authority', () => {
  it('resolves the active tool once and passes runtime metadata into reach checks', () => {
    const start = client.indexOf('function targetMeleeCombatTarget(');
    const end = client.indexOf('\nfunction targetChest(', start);
    const targeter = client.slice(start, end);
    expect(targeter).toContain('runtimeToolDefinition(snapshot.content.registry, itemKind)');
    expect(targeter).toContain('if (tool === null) return null');
    expect(targeter.match(/forwardSwingTargetInReach\(/gu)).toHaveLength(2);
    expect(targeter.match(/\btool,?\s*\)/gu)).toHaveLength(2);
    expect(targeter).not.toMatch(/targetX,[\s\S]*?targetY,[\s\S]*?itemKind,?\s*\)/u);
    expect(targeter).not.toMatch(/npc\.x, npc\.y, itemKind,?\s*\)/u);
  });
});
